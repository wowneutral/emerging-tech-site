# Contact form handler

Runs the Emerging Tech contact form on ET's own infrastructure instead of a
third-party form relay.

## Why this exists

The form previously posted to `formsubmit.co/ajax/3acf6d51b07a6971f24d6086cd888a9b`.
Two problems with that:

1. **Unverifiable destination.** The endpoint is an opaque hash. Nothing in the
   codebase records which mailbox it resolves to, and there was no evidence it
   had been tested against an ET address. Submissions could have been going
   somewhere nobody monitors.
2. **Third-party data handling.** Every enquiry (name, email, organisation,
   message) transited a free service with no data-processing agreement, no
   stated data residency, and no uptime commitment. That is a fair question for
   a firm whose clients are the FBI, DoD and VA.

This Worker keeps submissions inside infrastructure ET controls.

## What it does

- Origin allowlist, no wildcard CORS
- Honeypot field rejected with a `200` so bots get no signal
- Per-IP rate limit, 5 submissions per hour, via Cloudflare KV
- Server-side validation: required fields, email format, length caps, and the
  reason must match the select options
- Control characters stripped to prevent header injection
- HTML-escapes every value before it goes into the email body
- **Message bodies are never logged.** Only status codes.

## Deploy

Requires the Cloudflare account for emergingtech.co and a mail provider. The
code uses [Resend](https://resend.com); Postmark or SendGrid need only the
`fetch` block swapped.

```bash
cd worker
npm install -g wrangler
wrangler login

# 1. rate-limit store
wrangler kv namespace create RATE_KV
#    paste the returned id into wrangler.toml and uncomment that block

# 2. verify the sending domain in Resend, then store the key
wrangler secret put RESEND_API_KEY

# 3. ship
wrangler deploy
```

Then point the site at it. In `script.js`:

```js
var CONTACT_ENDPOINT = 'https://emergingtech.co/api/contact';
```

Leave that string empty and the form falls back to opening the visitor's mail
client with their message prefilled, so it degrades rather than breaking.

## Verify before announcing it works

```bash
# should deliver
curl -X POST https://emergingtech.co/api/contact \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://emergingtech.co' \
  -d '{"name":"Test","email":"you@example.com","msg":"hello","reason":"Media inquiries"}'

# should be rejected: 403
curl -X POST https://emergingtech.co/api/contact \
  -H 'Content-Type: application/json' -H 'Origin: https://evil.example' \
  -d '{"name":"T","email":"a@b.co","msg":"x"}'

# should return ok:true but deliver nothing (honeypot)
curl -X POST https://emergingtech.co/api/contact \
  -H 'Content-Type: application/json' -H 'Origin: https://emergingtech.co' \
  -d '{"name":"T","email":"a@b.co","msg":"x","_honey":"bot"}'
```

Confirm a real message lands in `collaborate@emergingtech.co` before telling
anyone the form is live.

## Retention

The Worker stores nothing but a per-IP counter that expires after an hour.
Enquiries live in the destination mailbox, so mailbox retention policy is the
retention policy. Worth writing down if a client asks.
