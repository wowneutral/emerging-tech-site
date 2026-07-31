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
 *  - Mail goes out through Resend over HTTPS with the key held in a secret.
 *
 * Required bindings (see wrangler.toml):
 *   RATE_KV        KV namespace, for the per-IP counter
 *   RESEND_API_KEY secret
 *   TO_ADDRESS     var, e.g. collaborate@emergingtech.co
 *   FROM_ADDRESS   var, must be on a domain verified with the mail provider
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

const EMAIL_RE = /^[^\s@]+@[^\s@,;:]+\.[a-z]{2,}$/i;

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

    // ---- send -------------------------------------------------------------
    const rows = [
      ['Name', name],
      ['Email', email],
      ['Organization', org || '-'],
      ['Reason', reason || '-'],
    ];
    const html =
      '<h2 style="font-family:sans-serif">New website enquiry</h2>' +
      '<table style="font-family:sans-serif;border-collapse:collapse">' +
      rows
        .map(
          ([k, v]) =>
            '<tr><td style="padding:4px 14px 4px 0;color:#666">' + k + '</td>' +
            '<td style="padding:4px 0"><b>' + escapeHtml(v) + '</b></td></tr>'
        )
        .join('') +
      '</table><hr><p style="font-family:sans-serif;white-space:pre-wrap">' +
      escapeHtml(msg) +
      '</p>';

    let res;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + env.RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.FROM_ADDRESS,
          to: [env.TO_ADDRESS],
          reply_to: email,
          subject: 'Website enquiry from ' + name + (org ? ' (' + org + ')' : ''),
          html,
        }),
      });
    } catch (err) {
      return json({ ok: false, error: 'send_failed' }, 502, origin);
    }

    if (!res.ok) {
      // Status only. The message body is never written to logs.
      console.error('mail provider responded', res.status);
      return json({ ok: false, error: 'send_failed' }, 502, origin);
    }

    if (env.RATE_KV) {
      await env.RATE_KV.put(bucket, String(count + 1), { expirationTtl: 3600 });
    }
    return json({ ok: true }, 200, origin);
  },
};
