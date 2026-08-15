<?php
/**
 * Emerging Tech contact form handler — PHP, for Hostinger shared hosting.
 *
 * This replaces the Cloudflare Worker plan (worker/contact-worker.js, kept
 * in the repo as reference) now that the site is deploying to real PHP
 * hosting rather than a static-only host. Same design, same care, ported:
 * origin allowlist, honeypot, per-IP rate limit, server-side validation,
 * control-character stripping, HTML escaping, spreadsheet-formula
 * neutralisation, and mail sent through Microsoft Graph rather than a
 * third-party relay. Message bodies are never logged, only status codes.
 *
 * REQUIRES A FILE THAT DOES NOT EXIST YET AND MUST NEVER LIVE IN public_html
 * OR IN THIS REPO:
 *
 *   /domains/emergingtech.co/private/graph-config.php
 *
 * That path is OUTSIDE the web root — nothing on the internet can request it
 * by URL, which is a stronger guarantee than an .htaccess block, because it
 * does not depend on a rule uploading correctly or the host honouring it.
 * See private-graph-config.template.php in this same folder for exactly
 * what that file needs to contain. Copy it there by hand through FileZilla,
 * fill in the real secret, and never commit it or place it under public_html.
 *
 * Also needs, inside that same private/ folder (PHP will create these on
 * first run if the directory is writable — confirm it is):
 *   private/graph-token-cache.json   cached app-only access token
 *   private/rate-limit.json          per-IP hourly submission counts
 */

// ---------------------------------------------------------------------------
// Locate the private config. $_SERVER['DOCUMENT_ROOT'] is public_html; the
// private folder is a sibling one level up, per the account layout:
//   /domains/emergingtech.co/private/
//   /domains/emergingtech.co/public_html/   <- DOCUMENT_ROOT, this file
//                                              lives at .../public_html/api/
// If your account's layout differs, this is the one line to change.
// ---------------------------------------------------------------------------
$PRIVATE_DIR = dirname($_SERVER['DOCUMENT_ROOT']) . '/private';
$CONFIG_PATH = $PRIVATE_DIR . '/graph-config.php';

const ALLOWED_ORIGINS = [
    'https://emergingtech.co',
    'https://www.emergingtech.co',
];

const LIMIT_PER_HOUR = 5;
const MAX_LEN = ['name' => 120, 'email' => 180, 'org' => 160, 'reason' => 80, 'msg' => 4000];
const REASONS = [
    'Enquire about our capabilities',
    'Career or intern opportunities',
    'Media inquiries',
    'Alumni reach out',
    'HR request',
];

function json_out($body, int $status) {
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body);
    exit;
}

/** Strip control characters (the actual defence against header injection —
 *  see the long comment on deFormula() below for why blocking = and / would
 *  be the wrong fix), then cap length. */
function clean($value, int $max): string {
    $s = (string)($value ?? '');
    $out = '';
    $len = mb_strlen($s);
    for ($i = 0; $i < $len; $i++) {
        $ch = mb_substr($s, $i, 1);
        $code = mb_ord($ch);
        $out .= ($code < 0x20 || $code === 0x7f) ? ' ' : $ch;
    }
    return mb_substr(trim($out), 0, $max);
}

function esc(string $s): string {
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

/**
 * Neutralise spreadsheet formula injection — THIS is what "block equals
 * signs and slashes" should actually mean. Rejecting messages containing =
 * or / protects nothing (this script builds no shell command and no SQL,
 * and the HTML is escaped), and it silently rejects every URL, file path,
 * "N/A", "24/7" and any date written 05/08/2026. The real risk is one step
 * later: pasted into Excel, a cell starting =, +, - or @ is read as a
 * formula. A leading single quote makes it a literal string; the visible
 * text is unchanged for a human reader.
 */
function de_formula(string $s): string {
    return preg_match('/^[=+\-@\t\r]/', $s) ? "'" . $s : $s;
}

function client_ip(): string {
    // Hostinger shared hosting does not sit behind a header you can trust
    // by default the way Cloudflare's CF-Connecting-IP can be. REMOTE_ADDR
    // is what the web server itself observed, which cannot be spoofed by
    // the request.
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

/** Simple file-backed rate limiter. flock() prevents two simultaneous
 *  submissions from both reading a stale count and both getting through. */
function rate_limited(string $dir, string $ip): bool {
    $path = $dir . '/rate-limit.json';
    $fh = @fopen($path, 'c+');
    if (!$fh) return false; // fail open on infra trouble, not closed against real users
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $data = $raw ? json_decode($raw, true) : [];
    if (!is_array($data)) $data = [];

    $hour = intdiv(time(), 3600);
    $key = $ip . ':' . $hour;

    // Prune anything not from the current hour so the file cannot grow
    // without bound.
    foreach (array_keys($data) as $k) {
        if (strpos($k, ':' . $hour) === false) unset($data[$k]);
    }

    $count = $data[$key] ?? 0;
    $blocked = $count >= LIMIT_PER_HOUR;
    if (!$blocked) {
        $data[$key] = $count + 1;
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($data));
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    return $blocked;
}

/** App-only Graph token, cached to a file so most submissions do not pay an
 *  Entra round trip. Cached five minutes short of expiry, same margin the
 *  original Worker used, so a token already in flight never expires
 *  mid-request. */
function graph_token(string $dir, array $cfg): string {
    $cache = $dir . '/graph-token-cache.json';
    if (is_file($cache)) {
        $c = json_decode(file_get_contents($cache), true);
        if (is_array($c) && ($c['exp'] ?? 0) > time()) {
            return $c['token'];
        }
    }

    $ch = curl_init('https://login.microsoftonline.com/' . $cfg['tenant_id'] . '/oauth2/v2.0/token');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query([
            'client_id'     => $cfg['client_id'],
            'client_secret' => $cfg['client_secret'],
            'scope'         => 'https://graph.microsoft.com/.default',
            'grant_type'    => 'client_credentials',
        ]),
        CURLOPT_TIMEOUT => 15,
    ]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status !== 200) {
        // Status only — an Entra error body can echo the client_id and must
        // never reach the logs.
        error_log('graph token endpoint responded ' . $status);
        throw new RuntimeException('token_failed');
    }
    $data = json_decode($body, true);
    if (empty($data['access_token'])) throw new RuntimeException('token_missing');

    $ttl = max(60, ($data['expires_in'] ?? 3600) - 300);
    @file_put_contents($cache, json_encode(['token' => $data['access_token'], 'exp' => time() + $ttl]));
    // Belt and braces: this file must never be web-readable even though it
    // already lives outside public_html.
    @chmod($cache, 0600);

    return $data['access_token'];
}

// ============================================================ entry point

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && !in_array($origin, ALLOWED_ORIGINS, true)) {
    json_out(['ok' => false, 'error' => 'origin_not_allowed'], 403);
}
if ($origin) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    json_out(['ok' => false, 'error' => 'method_not_allowed'], 405);
}

if (!is_file($CONFIG_PATH)) {
    // Config not deployed yet — fail loudly to the log, quietly to the
    // visitor. Never say "config missing" to the client; that is a map of
    // the server for free.
    error_log('contact.php: graph-config.php not found at ' . $CONFIG_PATH);
    json_out(['ok' => false, 'error' => 'send_failed'], 502);
}
$cfg = require $CONFIG_PATH;

$ip = client_ip();
if (rate_limited($PRIVATE_DIR, $ip)) {
    json_out(['ok' => false, 'error' => 'rate_limited'], 429);
}

// Accept both a normal form POST (what the site's <form> sends via
// FormData) and JSON, same as the Worker did.
$ctype = $_SERVER['CONTENT_TYPE'] ?? '';
if (stripos($ctype, 'application/json') !== false) {
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
} else {
    $data = $_POST;
}

// Honeypot: 200 with no further action, so an automated submitter learns
// nothing from the response.
if (clean($data['_honey'] ?? '', 10) !== '') {
    json_out(['ok' => true], 200);
}

$name   = clean($data['name']   ?? '', MAX_LEN['name']);
$email  = clean($data['email']  ?? '', MAX_LEN['email']);
$org    = clean($data['org']    ?? '', MAX_LEN['org']);
$reason = clean($data['reason'] ?? '', MAX_LEN['reason']);
$msg    = clean($data['msg']    ?? '', MAX_LEN['msg']);

if ($name === '' || $email === '' || $msg === '') {
    json_out(['ok' => false, 'error' => 'missing_fields'], 422);
}
if (!preg_match('/^[^\s@]+@[^\s@,;:]+\.[a-z]{2,}$/i', $email)) {
    json_out(['ok' => false, 'error' => 'invalid_email'], 422);
}
if ($reason !== '' && !in_array($reason, REASONS, true)) {
    json_out(['ok' => false, 'error' => 'invalid_reason'], 422);
}

$cell = fn(string $v) => de_formula(esc($v));
$rows = [
    ['Name', $name],
    ['Email', $email],
    ['Organization', $org !== '' ? $org : '-'],
    ['Reason', $reason !== '' ? $reason : '-'],
];
$rowsHtml = '';
foreach ($rows as [$k, $v]) {
    $rowsHtml .= '<tr><td style="padding:4px 14px 4px 0;color:#666">' . esc($k) . '</td>'
               . '<td style="padding:4px 0"><b>' . $cell($v) . '</b></td></tr>';
}
// The message gets the same de-formula treatment as the row fields below.
// It is easy to escape the body and stop there because $msg never appears
// inside an HTML attribute, but the formula risk has nothing to do with
// HTML -- it is about someone later pasting this exact text into a
// spreadsheet, and a free-text message is, if anything, more likely to get
// copied into a tracking sheet than a name or an org.
$html = '<h2 style="font-family:sans-serif">New website enquiry</h2>'
      . '<table style="font-family:sans-serif;border-collapse:collapse">' . $rowsHtml . '</table>'
      . '<hr><p style="font-family:sans-serif;white-space:pre-wrap">' . $cell($msg) . '</p>';

// clean() already stripped CR/LF, which is the only way a subject line can
// be used to inject extra headers. esc() here is defence in depth rather
// than a live exploit path -- mail clients render Subject as plain text,
// not HTML -- but every other field that reaches an email gets escaped, and
// a subject line is exactly the kind of value that ends up echoed into an
// HTML admin dashboard or ticket list eventually.
$subject = 'Website enquiry from ' . esc($name) . ($org !== '' ? ' (' . esc($org) . ')' : '');

try {
    $token = graph_token($PRIVATE_DIR, $cfg);
} catch (Throwable $e) {
    error_log('contact.php: graph auth failed');
    json_out(['ok' => false, 'error' => 'send_failed'], 502);
}

$payload = json_encode([
    'message' => [
        'subject' => $subject,
        'body' => ['contentType' => 'HTML', 'content' => $html],
        'toRecipients' => [['emailAddress' => ['address' => $cfg['to_address']]]],
        // Reply goes to the enquirer, so hitting Reply in Outlook does the
        // obvious thing rather than mailing the noreply mailbox. $email has
        // already passed the regex and control-character stripping above,
        // so it cannot carry a second address or a header.
        'replyTo' => [['emailAddress' => ['address' => $email]]],
    ],
    'saveToSentItems' => true,
]);

$ch = curl_init('https://graph.microsoft.com/v1.0/users/' . rawurlencode($cfg['sender_address']) . '/sendMail');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token, 'Content-Type: application/json'],
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_TIMEOUT => 15,
]);
curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// Graph returns 202 Accepted on success, not 200.
if ($status !== 202) {
    error_log('contact.php: graph sendMail responded ' . $status);
    json_out(['ok' => false, 'error' => 'send_failed'], 502);
}

json_out(['ok' => true], 200);
