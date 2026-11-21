<?php
/**
 * Live job openings for emergingtech.co, straight from JazzHR.
 *
 * Source: JazzHR's public XML job feed (no API key needed).
 * Output: the same JSON array the site's old static jobs.json used:
 *   [{ id, title, city, state, department, employment_type, url }, ...]
 * so the existing Current Openings page keeps working unchanged.
 * .htaccess routes /jobs.json here; the jobs.json file itself is the fallback.
 *
 * Cached for 10 minutes. If JazzHR is unreachable, the last good list is served
 * instead of an empty page.
 */

const FEED_URL  = 'https://app.jazz.co/feeds/export/jobs/emergingtech';
const BOARD_URL = 'https://emergingtech.applytojob.com/apply';
const CACHE_TTL = 600; // seconds

// Cache lives outside public_html when possible (same place as graph-config.php).
function cache_file(): string {
    $private = dirname(__DIR__) . '/private';
    $dir = (is_dir($private) && is_writable($private)) ? $private : sys_get_temp_dir();
    return $dir . '/jazzhr-jobs-cache.json';
}

function fetch_feed(): ?string {
    $src = getenv('JOBS_FEED_FILE'); // local testing only
    if ($src) return @file_get_contents($src) ?: null;
    if (function_exists('curl_init')) {
        $ch = curl_init(FEED_URL);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_USERAGENT => 'emergingtech.co jobs sync',
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return ($body !== false && $code === 200) ? $body : null;
    }
    $ctx = stream_context_create(['http' => ['timeout' => 10, 'header' => "User-Agent: emergingtech.co jobs sync\r\n"]]);
    $body = @file_get_contents(FEED_URL, false, $ctx);
    return $body === false ? null : $body;
}

function t($v): string { return trim(html_entity_decode((string) $v, ENT_QUOTES | ENT_HTML5, 'UTF-8')); }

function parse_feed(string $xml): ?array {
    libxml_use_internal_errors(true);
    $doc = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NOCDATA | LIBXML_NONET);
    if ($doc === false || !isset($doc->job)) return null;
    $jobs = [];
    foreach ($doc->job as $j) {
        $status = strtolower(t($j->status));
        if ($status !== '' && $status !== 'open') continue;
        $url = t($j->url);
        // Only ever link to the company's own JazzHR board.
        if (!preg_match('#^https?://emergingtech\.applytojob\.com/apply/#i', $url)) $url = BOARD_URL;
        $url = preg_replace('#^http://#i', 'https://', $url);
        $title = t($j->title);
        if ($title === '') continue;
        $jobs[] = [
            'id' => t($j->id),
            'title' => $title,
            'city' => t($j->city),
            'state' => t($j->state),
            'department' => t($j->department),
            'employment_type' => t($j->type),
            'url' => $url,
        ];
    }
    usort($jobs, fn($a, $b) => strcasecmp($a['title'], $b['title']));
    return $jobs;
}

function send(array $jobs, string $state, int $age): void {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('X-Jobs-Source: ' . $state . '; age=' . $age);
    echo json_encode($jobs, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

$file = cache_file();
$cached = is_file($file) ? json_decode((string) @file_get_contents($file), true) : null;
$age = $cached ? time() - (int) @filemtime($file) : PHP_INT_MAX;

if (is_array($cached) && $age < CACHE_TTL) send($cached, 'cached', $age);

$xml = fetch_feed();
$jobs = $xml ? parse_feed($xml) : null;

if (is_array($jobs)) {
    @file_put_contents($file . '.tmp', json_encode($jobs, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    @rename($file . '.tmp', $file);
    send($jobs, 'fresh', 0);
}

// JazzHR down or the feed changed shape: keep showing the last good list,
// then the jobs.json the hourly GitHub sync commits, before ever showing none.
if (is_array($cached)) send($cached, 'stale', $age);
$static = json_decode((string) @file_get_contents(__DIR__ . '/jobs.json'), true);
if (is_array($static)) send($static, 'static-fallback', -1);

http_response_code(503);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo '[]';
