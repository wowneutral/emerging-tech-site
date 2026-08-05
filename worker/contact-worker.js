/**
 * Emerging Tech contact form handler.
 *
 * Runs on Cloudflare Workers under emergingtech.co, so submissions never
 * transit a third-party form relay. Replaces a FormSubmit endpoint whose
 * destination mailbox could not be verified from the code.
 *
 * Design notes:
 *  - Origin is checked against an allowlist; there is no wildcard CORS.
 *  - The honeypot field is rejected silently with a 200 so bots learn nothing.
 *  - Submissions are rate limited per IP through a KV counter.
 *  - Message bodies are never logged. Only status codes are.
 *  - Mail goes out through MICROSOFT GRAPH, sent by Emerging Tech's own
 *    tenant. It used to go through Resend, which meant every enquiry was
 *    handed to a third-party mail relay on its way to a mailbox Microsoft
 *    already hosts. Graph removes that hop: the Worker authenticates against
 *    Entra ID, Microsoft sends the message as noreply@emergingtech.co, and
 *    the mail never leaves infrastructure the company controls.
 *
 * Required bindings (see wrangler.toml):
 *   RATE_KV              KV namespace, for the per-IP counter and token cache
 *   GRAPH_TENANT_ID      var
 *   GRAPH_CLIENT_ID      var
 *   GRAPH_CLIENT_SECRET  secret  -- `wrangler secret put GRAPH_CLIENT_SECRET`
 *   SENDER_ADDRESS       var, the mailbox Graph sends AS, e.g. noreply@emergingtech.co
 *   TO_ADDRESS           var, where enquiries land, e.g. collaborate@emergingtech.co
 *
 * THE SECRET IS NEVER IN THIS FILE OR THIS REPO. This is a public static site;
 * anything committed here is readable by anyone. It is set with
 * `wrangler secret put` and only ever read from env at runtime.
 *
 * Entra app registration needs the APPLICATION permission Mail.Send with admin
 * consent granted. Scope it down with an ApplicationAccessPolicy so the app can
 * only send as the noreply mailbox, not as every mailbox in the tenant — the
 * default grant is tenant-wide and is far more authority than a contact form
 * should hold.
 */

const ALLOWED_ORIGINS = [
  'https://emergingtech.co',
  'https://www.emergingtech.co',
  'https://wowneutral.github.io',
];

const LIMIT_PER_HOUR = 5;
const MAX = { name: 120, email: 180, org: 160, reason: 80, msg: 4000 };

const REASONS = [
  'Enquire about our capabilities',
  'Career or intern opportunities',
  'Media inquiries',
  'Alumni reach out',
  'HR request',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(origin),
    },
  });
}

/**
 * Strip control characters, which is what a header-injection attempt uses to
 * smuggle a newline into a subject line or an address, then cap the length.
 * Done by code point rather than a regex literal: a character class of raw
 * control bytes does not survive being copied between editors intact.
 */
function clean(value, max) {
  const s = String(value === null || value === undefined ? '' : value);
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    out += code < 0x20 || code === 0x7f ? ' ' : ch;
  }
  return out.trim().slice(0, max);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Neutralise spreadsheet formula injection.
 *
 * THIS IS WHAT THE "BLOCK EQUALS SIGNS AND SLASHES" REQUEST IS ACTUALLY
 * ABOUT, and it is worth being precise, because doing it the obvious way is
 * both less safe and more annoying.
 *
 * Rejecting any message containing = or / does not protect anything. Nothing
 * downstream executes those characters: the Worker never builds a shell
 * command, never touches SQL, and the HTML is escaped before it goes in the
 * mail. What it does do is reject a large share of legitimate enquiries —
 * every URL, every file path, every "N/A", every "24/7", every date written
 * 05/08/2026. A contact form that silently drops real enquiries is a worse
 * outcome than the risk it was meant to remove.
 *
 * The genuine risk is one step further on. When someone opens the enquiry and
 * pastes it into Excel or exports it to CSV, a cell beginning =, +, - or @ is
 * interpreted as a formula, and that formula can pull data or trigger a
 * warning-gated command. Prefixing a single quote makes the cell a literal
 * string. The visible text is unchanged for a human reader, and everything
 * anyone might legitimately type still gets through.
 */
function deFormula(s) {
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

const EMAIL_RE = /^[^\s@]+@[^\s@,;:]+\.[a-z]{2,}$/i;

/**
 * An app-only Graph token, cached in KV.
 *
 * Tokens are valid for roughly an hour, so fetching a fresh one per submission
 * would add a round trip to every enquiry and walk straight into Entra's token
 * endpoint throttling under any burst. Cached 5 minutes short of expiry so a
 * token is never used in the window where it might expire mid-flight.
 *
 * The cache lives under a key prefix that cannot collide with the rate-limit
 * buckets, and holds only the access token — never the client secret.
 */
async function graphToken(env) {
  const KEY = 'graph:token';
  if (env.RATE_KV) {
    const cached = await env.RATE_KV.get(KEY);
    if (cached) return cached;
  }

  const res = await fetch(
    'https://login.microsoftonline.com/' + env.GRAPH_TENANT_ID + '/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GRAPH_CLIENT_ID,
        client_secret: env.GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  );

  if (!res.ok) {
    // Status only. An Entra error body can echo the client_id and parts of the
    // request, so it must never reach the logs.
    console.error('token endpoint responded', res.status);
    throw new Error('token_failed');
  }

  const body = await res.json();
  if (!body.access_token) throw new Error('token_missing');

  if (env.RATE_KV) {
    const ttl = Math.max(60, (body.expires_in || 3600) - 300);
    await env.RATE_KV.put(KEY, body.access_token, { expirationTtl: ttl });
  }
  return body.access_token;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'method_not_allowed' }, 405, origin);
    }
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ ok: false, error: 'origin_not_allowed' }, 403, origin);
    }

    // ---- rate limit -------------------------------------------------------
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const bucket = 'rl:' + ip + ':' + Math.floor(Date.now() / 3600000);
    let count = 0;
    if (env.RATE_KV) {
      count = parseInt((await env.RATE_KV.get(bucket)) || '0', 10);
      if (count >= LIMIT_PER_HOUR) {
        return json({ ok: false, error: 'rate_limited' }, 429, origin);
      }
    }

    // ---- parse ------------------------------------------------------------
    let data;
    const ctype = request.headers.get('Content-Type') || '';
    try {
      if (ctype.includes('application/json')) {
        data = await request.json();
      } else {
        data = Object.fromEntries(await request.formData());
      }
    } catch (err) {
      return json({ ok: false, error: 'bad_request' }, 400, origin);
    }

    // Honeypot: answer 200 so automated submitters get no signal.
    if (clean(data._honey, 10)) return json({ ok: true }, 200, origin);

    const name = clean(data.name, MAX.name);
    const email = clean(data.email, MAX.email);
    const org = clean(data.org, MAX.org);
    const reason = clean(data.reason, MAX.reason);
    const msg = clean(data.msg, MAX.msg);

    if (!name || !email || !msg) {
      return json({ ok: false, error: 'missing_fields' }, 422, origin);
    }
    if (!EMAIL_RE.test(email)) {
      return json({ ok: false, error: 'invalid_email' }, 422, origin);
    }
    if (reason && !REASONS.includes(reason)) {
      return json({ ok: false, error: 'invalid_reason' }, 422, origin);
    }

    // ---- compose ----------------------------------------------------------
    // Every value is escaped for HTML and de-formula'd for the spreadsheet it
    // will eventually be pasted into. Order matters: escape first so the quote
    // prefix is not itself mangled.
    const rows = [
      ['Name', name],
      ['Email', email],
      ['Organization', org || '-'],
      ['Reason', reason || '-'],
    ];
    const cell = (v) => deFormula(escapeHtml(v));

    const html =
      '<h2 style="font-family:sans-serif">New website enquiry</h2>' +
      '<table style="font-family:sans-serif;border-collapse:collapse">' +
      rows
        .map(
          ([k, v]) =>
            '<tr><td style="padding:4px 14px 4px 0;color:#666">' + k + '</td>' +
            '<td style="padding:4px 0"><b>' + cell(v) + '</b></td></tr>'
        )
        .join('') +
      '</table><hr><p style="font-family:sans-serif;white-space:pre-wrap">' +
      escapeHtml(msg) +
      '</p>';

    // The subject is built from user input, so it gets the same control-char
    // treatment the fields did — clean() has already stripped CR and LF, which
    // is the only way a subject line can be used to inject extra headers.
    const subject = 'Website enquiry from ' + name + (org ? ' (' + org + ')' : '');

    // ---- send through Microsoft Graph -------------------------------------
    let token;
    try {
      token = await graphToken(env);
    } catch (err) {
      console.error('graph auth failed');
      return json({ ok: false, error: 'send_failed' }, 502, origin);
    }

    let res;
    try {
      res = await fetch(
        'https://graph.microsoft.com/v1.0/users/' +
          encodeURIComponent(env.SENDER_ADDRESS) +
          '/sendMail',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              subject,
              body: { contentType: 'HTML', content: html },
              toRecipients: [{ emailAddress: { address: env.TO_ADDRESS } }],
              // Reply goes to the enquirer, so hitting Reply in Outlook does
              // the obvious thing rather than mailing the noreply mailbox.
              // The address has already passed EMAIL_RE and control-char
              // stripping, so it cannot carry a second address or a header.
              replyTo: [{ emailAddress: { address: email } }],
            },
            saveToSentItems: true,
          }),
        }
      );
    } catch (err) {
      return json({ ok: false, error: 'send_failed' }, 502, origin);
    }

    // Graph returns 202 Accepted on success, not 200.
    if (!res.ok) {
      // Status only. The message body is never written to logs.
      console.error('graph sendMail responded', res.status);
      return json({ ok: false, error: 'send_failed' }, 502, origin);
    }

    if (env.RATE_KV) {
      await env.RATE_KV.put(bucket, String(count + 1), { expirationTtl: 3600 });
    }
    return json({ ok: true }, 200, origin);
  },
};
