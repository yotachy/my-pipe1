<?php
/**
 * chart.php — Yahoo Finance 차트 프록시 (Crumb 인증 우회 탑재)
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    echo json_encode(['error' => 'method not allowed'], JSON_UNESCAPED_UNICODE); exit;
}

$sym = isset($_GET['sym']) ? trim($_GET['sym']) : '^GSPC';
$iv  = isset($_GET['iv']) ? trim($_GET['iv']) : '1wk';
$rg  = isset($_GET['rg']) ? trim($_GET['rg']) : '1y';

if (!preg_match('/^[A-Za-z0-9.^=_-]{1,20}$/', $sym)) $sym = '^GSPC';

$cacheDir = __DIR__ . '/cache';
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);

$cacheFile = $cacheDir . '/c_' . md5($sym . '_' . $iv . '_' . $rg) . '.json';
$ttl = ($rg === '1d') ? 60 : (($rg === '5d') ? 300 : 1800);

if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $ttl) {
    readfile($cacheFile); exit;
}

function getYahooAuthChart() {
    global $cacheDir;
    $authFile = $cacheDir . '/yahoo_auth.json';
    if (file_exists($authFile) && time() - filemtime($authFile) < 3600) return json_decode(file_get_contents($authFile), true);
    
    $ch = curl_init('https://fc.yahoo.com');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_TIMEOUT => 5, CURLOPT_SSL_VERIFYPEER => false]);
    $res = curl_exec($ch); curl_close($ch);
    preg_match_all('/^Set-Cookie:\s*([^;]*)/mi', $res, $matches);
    $cookie = implode('; ', $matches[1]);
    
    $ch2 = curl_init('https://query1.finance.yahoo.com/v1/test/getcrumb');
    curl_setopt_array($ch2, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5, CURLOPT_SSL_VERIFYPEER => false, CURLOPT_HTTPHEADER => ["Cookie: $cookie"]]);
    $crumb = curl_exec($ch2); curl_close($ch2);
    
    if ($crumb && strlen($crumb) < 20) {
        $auth = ['cookie' => $cookie, 'crumb' => trim($crumb)];
        @file_put_contents($authFile, json_encode($auth)); return $auth;
    }
    return null;
}

$auth = getYahooAuthChart();
$query = http_build_query(['interval' => $iv, 'range' => $rg, 'includePrePost' => 'false']);
if ($auth) $query .= '&crumb=' . $auth['crumb'];
$url = 'https://query1.finance.yahoo.com/v8/finance/chart/' . rawurlencode($sym) . '?' . $query;

$ch3 = curl_init($url);
$headers = ['Accept: application/json', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)'];
if ($auth && $auth['cookie']) $headers[] = "Cookie: " . $auth['cookie'];

curl_setopt_array($ch3, [
    CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_SSL_VERIFYPEER => false, CURLOPT_HTTPHEADER => $headers
]);

$data = curl_exec($ch3); curl_close($ch3);

if ($data && strpos($data, '"chart"') !== false) {
    @file_put_contents($cacheFile, $data);
    echo $data;
} else {
    if (file_exists($cacheFile)) readfile($cacheFile);
    else echo json_encode(['error' => 'upstream failed']);
}