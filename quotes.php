<?php
/**
 * quotes.php — Yahoo Finance / CNN 프록시
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
    if (!$body) return false;
    $body = trim($body);
    if ($body === '') return false;
    $first = $body[0];
    if ($first !== '{' && $first !== '[') return false;
    json_decode($body);
    return json_last_error() === JSON_ERROR_NONE;
}

function httpGet(string $url, array $headers = [], int $timeout = 10, bool $isCnn = false): ?string
{
    if (function_exists('curl_version')) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
        curl_setopt($ch, CURLOPT_ENCODING, '');
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        
        $defaultHeaders = [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language: en-US,en;q=0.9',
        ];
        if ($isCnn) {
            $defaultHeaders[] = 'Referer: https://edition.cnn.com/';
        }
        $finalHeaders = array_merge($defaultHeaders, $headers);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $finalHeaders);

        $body = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 200 && $httpCode < 300 && $body !== false) {
            return $body;
        }
        return null;
    }

    $opts = [
        'http' => [
            'method'  => 'GET',
            'timeout' => $timeout,
            'header'  => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\n" .
                         "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\n" .
                         "Accept-Language: en-US,en;q=0.9\r\n",
        ]
    ];
    if ($isCnn) {
        $opts['http']['header'] .= "Referer: https://edition.cnn.com/\r\n";
    }
    if (!empty($headers)) {
        $opts['http']['header'] .= implode("\r\n", $headers) . "\r\n";
    }

    $context = stream_context_create($opts);
    $body = @file_get_contents($url, false, $context);

    if ($body !== false) {
        return $body;
    }
    return null;
}

// --- 1) CNN Fear & Greed ---
if (isset($_GET['fg'])) {
    $cacheFile = $cacheDir . '/fg_index.json';
    $ttl = 3600;

    if (is_file($cacheFile) && (time() - filemtime($cacheFile)) < $ttl) {
        readfile($cacheFile);
        exit;
    }

    $url = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';
    $response = httpGet($url, [], 10, true);

    if (isJsonString($response)) {
        @file_put_contents($cacheFile, $response);
        echo $response;
    } else {
        jsonOut(['error' => 'Failed to fetch Fear & Greed data']);
    }
    exit;
}

// --- 2) Yahoo Quotes ---
function getYahooAuth(string $cacheDir): array
{
    $authFile = $cacheDir . '/yahoo_auth.json';
    if (is_file($authFile) && (time() - filemtime($authFile)) < 3600 * 6) {
        $data = json_decode(file_get_contents($authFile), true);
        if (!empty($data['cookie']) && !empty($data['crumb'])) {
            return $data;
        }
    }

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://fc.yahoo.com');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0');
    $response = curl_exec($ch);
    curl_close($ch);

    $cookie = '';
    if ($response !== false) {
        if (preg_match('/^Set-Cookie:\s*([^;]+)/mi', $response, $m)) {
            $cookie = $m[1];
        }
    }

    if (!$cookie) {
        return [];
    }

    $ch2 = curl_init();
    curl_setopt($ch2, CURLOPT_URL, 'https://query1.finance.yahoo.com/v1/test/getcrumb');
    curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch2, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch2, CURLOPT_USERAGENT, 'Mozilla/5.0');
    curl_setopt($ch2, CURLOPT_HTTPHEADER, ['Cookie: ' . $cookie]);
    $crumb = curl_exec($ch2);
    curl_close($ch2);

    $crumb = trim((string)$crumb);
    if ($crumb === '' || strlen($crumb) > 64 || stripos($crumb, '<!doctype') !== false) {
        return [];
    }

    $auth = ['cookie' => $cookie, 'crumb' => $crumb];
    @file_put_contents($authFile, json_encode($auth, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    return $auth;
}

$rawSyms = isset($_GET['syms']) ? strtoupper((string) $_GET['syms']) : '';
$syms = preg_replace('/[^A-Z0-9,.\\-\\^=]/', '', $rawSyms);

if (!$syms) {
    jsonOut(['quoteResponse' => ['result' => []]]);
}

$cacheFile = $cacheDir . '/q_' . md5($syms) . '.json';
$quoteTtl = 2;

if (is_file($cacheFile) && (time() - filemtime($cacheFile)) < $quoteTtl) {
    readfile($cacheFile);
    exit;
}

$auth = getYahooAuth($cacheDir);

// 💡 여기서 프리/애프터장 필드(preMarketPrice 등)와 marketState 필드를 추가 요청합니다!
$fields = 'regularMarketPrice,regularMarketChangePercent,regularMarketChange,regularMarketPreviousClose,shortName,symbol,marketCap,preMarketPrice,preMarketChange,preMarketChangePercent,postMarketPrice,postMarketChange,postMarketChangePercent,marketState';
$url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' . urlencode($syms) . '&fields=' . urlencode($fields);

$headers = [];
if (!empty($auth['cookie'])) {
    $headers[] = 'Cookie: ' . $auth['cookie'];
}
if (!empty($auth['crumb'])) {
    $url .= '&crumb=' . rawurlencode((string) $auth['crumb']);
}

$response = httpGet($url, $headers, 12, false);

if (isJsonString($response)) {
    @file_put_contents($cacheFile, $response);
    echo $response;
} else {
    jsonOut(['quoteResponse' => ['result' => []]]);
}