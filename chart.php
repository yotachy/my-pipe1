<?php
/**
 * chart.php — Yahoo Finance 차트 프록시
 * - cURL 미지원 환경에서도 동작하도록 fallback 추가
 * - 경고/공지 출력으로 JSON이 깨지지 않도록 표시 비활성화
 */

declare(strict_types=1);

error_reporting(E_ALL & ~E_WARNING & ~E_NOTICE);
ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Origin: *');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    echo json_encode(['error' => 'method not allowed'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$sym = isset($_GET['sym']) ? trim((string) $_GET['sym']) : '^GSPC';
$iv = isset($_GET['iv']) ? trim((string) $_GET['iv']) : '1wk';
$rg = isset($_GET['rg']) ? trim((string) $_GET['rg']) : '1y';

if (!preg_match('/^[A-Za-z0-9.^=_-]{1,20}$/', $sym)) {
    $sym = '^GSPC';
}
if (!preg_match('/^[A-Za-z0-9]{1,8}$/', $iv)) {
    $iv = '1wk';
}
if (!preg_match('/^[A-Za-z0-9]{1,8}$/', $rg)) {
    $rg = '1y';
}

$cacheDir = __DIR__ . '/cache';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
}

function jsonOut(array $payload): void
{
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function isJsonString(?string $body): bool
{
    if (!is_string($body) || trim($body) === '') {
        return false;
    }
    json_decode($body, true);
    return json_last_error() === JSON_ERROR_NONE;
}

function parseStatusCode(array $headers): int
{
    if (!$headers) {
        return 0;
    }
    if (preg_match('/\s(\d{3})\s/', (string) $headers[0], $m)) {
        return (int) $m[1];
    }
    return 0;
}

function parseSetCookieHeader(array $headers): string
{
    $cookies = [];
    foreach ($headers as $headerLine) {
        if (stripos($headerLine, 'Set-Cookie:') === 0) {
            $cookie = trim(substr($headerLine, strlen('Set-Cookie:')));
            $pair = explode(';', $cookie, 2)[0] ?? '';
            if ($pair !== '') {
                $cookies[] = $pair;
            }
        }
    }
    return implode('; ', array_unique($cookies));
}

function httpGet(string $url, array $headers = [], int $timeout = 10, bool $includeHeaders = false): array
{
    $defaultHeaders = [
        'Accept: application/json, text/plain, */*',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    ];

    foreach ($defaultHeaders as $defaultHeader) {
        $name = strtolower(trim(strtok($defaultHeader, ':')));
        $exists = false;
        foreach ($headers as $header) {
            if (strtolower(trim(strtok($header, ':'))) === $name) {
                $exists = true;
                break;
            }
        }
        if (!$exists) {
            $headers[] = $defaultHeader;
        }
    }

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => $timeout,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_HEADER => $includeHeaders,
            CURLOPT_ENCODING => '',
        ]);
        $raw = curl_exec($ch);
        $errno = curl_errno($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);

        if ($raw === false || $errno !== 0) {
            return [
                'ok' => false,
                'status' => $status,
                'headers' => [],
                'body' => null,
            ];
        }

        $headerLines = [];
        $body = $raw;
        if ($includeHeaders) {
            $headerBlob = substr($raw, 0, $headerSize);
            $body = substr($raw, $headerSize);
            $headerParts = preg_split("/\r\n\r\n|\n\n/", trim((string) $headerBlob));
            $lastHeaderBlock = trim((string) end($headerParts));
            $headerLines = preg_split("/\r\n|\n/", $lastHeaderBlock) ?: [];
            if ($status === 0) {
                $status = parseStatusCode($headerLines);
            }
        }

        return [
            'ok' => $status >= 200 && $status < 400 && is_string($body),
            'status' => $status,
            'headers' => $headerLines,
            'body' => $body,
        ];
    }

    if (!filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN) && ini_get('allow_url_fopen') !== '1') {
        return [
            'ok' => false,
            'status' => 0,
            'headers' => [],
            'body' => null,
        ];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => implode("\r\n", $headers),
            'timeout' => $timeout,
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
        ],
    ]);

    $body = @file_get_contents($url, false, $context);
    $responseHeaders = $http_response_header ?? [];
    $status = parseStatusCode($responseHeaders);

    return [
        'ok' => $body !== false && $status >= 200 && $status < 400,
        'status' => $status,
        'headers' => $includeHeaders ? $responseHeaders : [],
        'body' => $body === false ? null : $body,
    ];
}

function getYahooAuth(string $cacheDir): ?array
{
    $authFile = $cacheDir . '/yahoo_auth.json';
    if (is_file($authFile) && (time() - filemtime($authFile)) < 3600) {
        $cached = json_decode((string) @file_get_contents($authFile), true);
        if (!empty($cached['cookie']) && isset($cached['crumb'])) {
            return $cached;
        }
    }

    $cookieResponse = httpGet('https://fc.yahoo.com', [], 8, true);
    $cookie = parseSetCookieHeader($cookieResponse['headers'] ?? []);
    if ($cookie === '') {
        return null;
    }

    $crumbResponse = httpGet(
        'https://query1.finance.yahoo.com/v1/test/getcrumb',
        ['Cookie: ' . $cookie],
        8,
        false
    );
    $crumb = is_string($crumbResponse['body']) ? trim($crumbResponse['body']) : '';

    if ($crumb === '' || strlen($crumb) > 64 || stripos($crumb, '<!doctype') !== false) {
        return null;
    }

    $auth = [
        'cookie' => $cookie,
        'crumb' => $crumb,
    ];
    @file_put_contents($authFile, json_encode($auth, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    return $auth;
}

$cacheFile = $cacheDir . '/c_' . md5($sym . '_' . $iv . '_' . $rg) . '.json';
$ttl = ($rg === '1d') ? 60 : (($rg === '5d') ? 300 : 1800);

if (is_file($cacheFile) && (time() - filemtime($cacheFile)) < $ttl) {
    readfile($cacheFile);
    exit;
}

$auth = getYahooAuth($cacheDir);
$query = http_build_query([
    'interval' => $iv,
    'range' => $rg,
    'includePrePost' => 'false',
]);

if (!empty($auth['crumb'])) {
    $query .= '&crumb=' . rawurlencode((string) $auth['crumb']);
}

$url = 'https://query1.finance.yahoo.com/v8/finance/chart/' . rawurlencode($sym) . '?' . $query;

$headers = [];
if (!empty($auth['cookie'])) {
    $headers[] = 'Cookie: ' . $auth['cookie'];
}

$response = httpGet($url, $headers, 12, false);
$body = $response['body'] ?? null;

if (
    is_string($body) &&
    isJsonString($body) &&
    strpos($body, '"chart"') !== false
) {
    @file_put_contents($cacheFile, $body);
    echo $body;
    exit;
}

if (is_file($cacheFile)) {
    readfile($cacheFile);
    exit;
}

jsonOut([
    'error' => 'upstream failed',
]);
