<?php
/**
 * quotes.php — Yahoo Finance & CNN 프록시 (GZIP 압축 + Crumb 인증 우회)
 */

// GZIP 압축 전송 켜기 (트래픽 70% 절약 핵심)
if (substr_count($_SERVER['HTTP_ACCEPT_ENCODING'], 'gzip')) {
    ob_start('ob_gzhandler');
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache');
header('Access-Control-Allow-Origin: *');

$cacheDir = __DIR__ . '/cache';
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);

// --- 1. CNN 공포탐욕 지수 ---
if (isset($_GET['fg'])) {
    $cacheFile = $cacheDir . '/fg_cache.json';
    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < 3600) {
        readfile($cacheFile); exit;
    }
    
    $ch = curl_init('https://production.dataviz.cnn.io/index/fearandgreed/graphdata');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        CURLOPT_HTTPHEADER => ['Origin: https://edition.cnn.com', 'Referer: https://edition.cnn.com/']
    ]);
    $data = curl_exec($ch);
    curl_close($ch);
    
    if ($data && strpos($data, '"fear_and_greed"') !== false) {
        @file_put_contents($cacheFile, $data);
        echo $data;
    } else {
        if (file_exists($cacheFile)) readfile($cacheFile);
        else echo '{"error":true}';
    }
    exit;
}

// --- 2. 야후 파이낸스 시세 ---
$syms = isset($_GET['syms']) ? preg_replace('/[^A-Z0-9,.\-\^=]/', '', strtoupper($_GET['syms'])) : '';
if (!$syms) { echo '{"quoteResponse":{"result":[]}}'; exit; }

$cacheFile = $cacheDir . '/q_' . md5($syms) . '.json';
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < 10) {
    readfile($cacheFile); exit;
}

function getYahooAuth() {
    global $cacheDir;
    $authFile = $cacheDir . '/yahoo_auth.json';
    if (file_exists($authFile) && time() - filemtime($authFile) < 3600) {
        return json_decode(file_get_contents($authFile), true);
    }
    $ch = curl_init('https://fc.yahoo.com');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_TIMEOUT => 5,
        CURLOPT_SSL_VERIFYPEER => false, CURLOPT_USERAGENT => 'Mozilla/5.0'
    ]);
    $res = curl_exec($ch); curl_close($ch);
    preg_match_all('/^Set-Cookie:\s*([^;]*)/mi', $res, $matches);
    $cookie = implode('; ', $matches[1]);
    
    $ch2 = curl_init('https://query1.finance.yahoo.com/v1/test/getcrumb');
    curl_setopt_array($ch2, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5, CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT => 'Mozilla/5.0', CURLOPT_HTTPHEADER => ["Cookie: $cookie"]
    ]);
    $crumb = curl_exec($ch2); curl_close($ch2);
    
    if ($crumb && strlen($crumb) < 20) {
        $auth = ['cookie' => $cookie, 'crumb' => trim($crumb)];
        @file_put_contents($authFile, json_encode($auth)); return $auth;
    }
    return null;
}

$auth = getYahooAuth();
$fields = 'regularMarketPrice,regularMarketChangePercent,regularMarketChange,regularMarketPreviousClose,shortName,symbol,marketCap';
$url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' . urlencode($syms) . '&fields=' . $fields;
if ($auth) $url .= '&crumb=' . $auth['crumb'];

$ch3 = curl_init($url);
$headers = ['Accept: application/json', 'User-Agent: Mozilla/5.0'];
if ($auth && $auth['cookie']) $headers[] = "Cookie: " . $auth['cookie'];
curl_setopt_array($ch3, [
    CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
    CURLOPT_SSL_VERIFYPEER => false, CURLOPT_HTTPHEADER => $headers
]);
$data = curl_exec($ch3); curl_close($ch3);

if ($data && strpos($data, '"result"') !== false) {
    @file_put_contents($cacheFile, $data); echo $data;
} else {
    if (file_exists($cacheFile)) readfile($cacheFile);
    else echo '{"quoteResponse":{"result":[]}}';
}