<?php
/**
 * MoneyScoop — 차트 데이터 프록시
 * 경로: /public_html/chart.php
 * 호출: /chart.php?sym=^GSPC&iv=1wk&rg=1y
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');

$sym = isset($_GET['sym']) ? $_GET['sym'] : '^GSPC';
$iv  = isset($_GET['iv'])  ? $_GET['iv']  : '1wk';
$rg  = isset($_GET['rg'])  ? $_GET['rg']  : '1y';

// 기본값 검증
$allowed_iv = ['2m','5m','15m','30m','1h','1d','1wk','1mo'];
$allowed_rg = ['1d','5d','1mo','3mo','6mo','1y','2y','3y','5y','10y'];
if (!in_array($iv, $allowed_iv)) $iv = '1wk';
if (!in_array($rg, $allowed_rg)) $rg = '1y';

$enc  = rawurlencode($sym);
$path = "/v8/finance/chart/{$enc}?interval={$iv}&range={$rg}&includePrePost=false";

$result = null;
foreach (['query1', 'query2'] as $domain) {
    $url = "https://{$domain}.finance.yahoo.com{$path}";
    $ch  = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 12,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        CURLOPT_HTTPHEADER     => [
            'Accept: application/json',
            'Accept-Language: en-US,en;q=0.9',
            'Referer: https://finance.yahoo.com/',
        ],
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body && $code >= 200 && $code < 300) {
        $result = $body;
        break;
    }
}

if ($result) {
    echo $result;
} else {
    http_response_code(502);
    echo json_encode(['error' => 'upstream failed']);
}
