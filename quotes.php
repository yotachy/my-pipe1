<?php
/**
 * quotes.php — Yahoo Finance / CNN 프록시
 * - cURL 미지원 환경에서도 동작하도록 file_get_contents fallback 추가
 * - 경고/공지 출력이 JSON을 깨뜨리지 않도록 표시 비활성화
 * - Fear & Greed 캐시를 1시간으로 조정
 */

declare(strict_types=1);

error_reporting(E_ALL & ~E_WARNING & ~E_NOTICE);
ini_set('display_errors', '0');

$acceptEncoding = $_SERVER['HTTP_ACCEPT_ENCODING'] ?? '';
if (stripos($acceptEncoding, 'gzip') !== false && function_exists('ob_gzhandler')) {
    ob_start('ob_gzhandler');
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Origin: *');

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

// --- 1) CNN Fear & Greed ---
if (isset($_GET['fg'])) {
    $cacheFile = $cacheDir . '/fg_cache.json';
    $fgTtl = 3600;

    if (is_file($cacheFile) && (time() - filemtime($cacheFile)) < $fgTtl) {
        readfile($cacheFile);
        exit;
    }

    $response = httpGet(
        'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
        [
            'Origin: https://edition.cnn.com',
            'Referer: https://edition.cnn.com/',
        ],
        12,
        false
    );

    $body = $response['body'] ?? null;
    if (
        is_string($body) &&
        isJsonString($body) &&
        strpos($body, '"fear_and_greed"') !== false
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
        'error' => true,
        'message' => 'fear_and_greed upstream failed',
    ]);
}

// --- 2) Yahoo Quotes ---
$rawSyms = isset($_GET['syms']) ? strtoupper((string) $_GET['syms']) : '';
$syms = preg_replace('/[^A-Z0-9,.\-\^=]/', '', $rawSyms);

if (!$syms) {
    jsonOut([
        'quoteResponse' => [
            'result' => [],
        ],
    ]);
}

$cacheFile = $cacheDir . '/q_' . md5($syms) . '.json';
$quoteTtl = 2;

if (is_file($cacheFile) && (time() - filemtime($cacheFile)) < $quoteTtl) {
    readfile($cacheFile);
    exit;
}

$auth = getYahooAuth($cacheDir);
$fields = 'regularMarketPrice,regularMarketChangePercent,regularMarketChange,regularMarketPreviousClose,shortName,symbol,marketCap';
$url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' . urlencode($syms) . '&fields=' . urlencode($fields);

$headers = [];
if (!empty($auth['cookie'])) {
    $headers[] = 'Cookie: ' . $auth['cookie'];
}
if (!empty($auth['crumb'])) {
    $url .= '&crumb=' . rawurlencode((string) $auth['crumb']);
}

$response = httpGet($url, $headers, 12, false);
$body = $response['body'] ?? null;

if (
    is_string($body) &&
    isJsonString($body) &&
    strpos($body, '"quoteResponse"') !== false &&
    strpos($body, '"result"') !== false
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
    'error' => true,
    'quoteResponse' => [
        'result' => [],
    ],
    'message' => 'quotes upstream failed',
]);
