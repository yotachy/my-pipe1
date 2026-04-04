<?php
/**
 * MoneyScoop — 데이터 수집 스크립트
 * Cafe24 크론탭에서 15분마다 실행
 * 경로: /home/계정명/public_html/cron/fetch.php
 */

// ── 설정 ──
define('DATA_DIR', dirname(__DIR__) . '/data/');
define('LOCK_FILE', DATA_DIR . '.fetch.lock');
define('LOG_FILE',  DATA_DIR . 'fetch.log');
define('MAX_LOG_LINES', 200);

// ── 중복 실행 방지 (lock) ──
if (file_exists(LOCK_FILE) && (time() - filemtime(LOCK_FILE)) < 600) {
    exit('이미 실행 중');
}
file_put_contents(LOCK_FILE, date('Y-m-d H:i:s'));

// ── 디렉토리 생성 ──
if (!is_dir(DATA_DIR)) mkdir(DATA_DIR, 0755, true);

// ── 로그 함수 ──
function logMsg($msg) {
    $line = '[' . date('Y-m-d H:i:s') . ' UTC+9] ' . $msg . "\n";
    $existing = file_exists(LOG_FILE) ? file(LOG_FILE) : [];
    if (count($existing) > MAX_LOG_LINES) {
        $existing = array_slice($existing, -MAX_LOG_LINES);
    }
    file_put_contents(LOG_FILE, implode('', $existing) . $line);
    echo $line;
}

// ── HTTP 요청 함수 ──
function fetchUrl($url, $timeout = 15) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
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
    $err  = curl_error($ch);
    curl_close($ch);

    if ($err || $code < 200 || $code >= 300) {
        throw new Exception("HTTP {$code} / curl: {$err}");
    }
    return json_decode($body, true);
}

// ── 파일 저장 (atomic) ──
function saveData($filename, $data) {
    $path = DATA_DIR . $filename;
    $tmp  = $path . '.tmp';
    file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    rename($tmp, $path);
}

// ── 파일 읽기 ──
function loadData($filename) {
    $path = DATA_DIR . $filename;
    if (!file_exists($path)) return null;
    return json_decode(file_get_contents($path), true);
}

// ── 날짜 헬퍼 ──
function daysAgo($n) {
    return date('Y-m-d', strtotime("-{$n} days"));
}

// ── 미국 장중 여부 (UTC 기준) ──
function isMarketOpen() {
    $utc = new DateTime('now', new DateTimeZone('UTC'));
    $dow = (int)$utc->format('N'); // 1=월 ~ 7=일
    if ($dow >= 6) return false;   // 주말
    $minutes = (int)$utc->format('G') * 60 + (int)$utc->format('i');
    return ($minutes >= 13*60+25 && $minutes <= 20*60+10); // 9:25~16:10 ET
}

// ════════════════════════════════════════
//  1. 환율 (frankfurter.app)
//     매 실행마다 갱신 (15분)
// ════════════════════════════════════════
function fetchFX() {
    $base   = 'https://api.frankfurter.app/';
    $params = '?from=USD&to=KRW,EUR,JPY,GBP,CNY';
    $existing = loadData('fx.json') ?: [];

    try {
        $cur  = fetchUrl($base . 'latest'           . $params);
        $prev = fetchUrl($base . daysAgo(3)          . $params);
        $h6   = fetchUrl($base . daysAgo(182)        . $params);
        $y1   = fetchUrl($base . daysAgo(365)        . $params);
        $y3   = fetchUrl($base . daysAgo(365 * 3)   . $params);

        saveData('fx.json', [
            'updated'  => gmdate('Y-m-d\TH:i:s\Z'),
            'current'  => $cur,
            'prev_day' => $prev,
            'h6m'      => $h6,
            'y1'       => $y1,
            'y3'       => $y3,
        ]);
        logMsg('FX 완료');
    } catch (Exception $e) {
        logMsg('FX 오류 (기존 유지): ' . $e->getMessage());
        if ($existing) saveData('fx.json', $existing);
    }
}

// ════════════════════════════════════════
//  2. 미국 주요 지수 (Yahoo Finance)
//     장중에만 갱신, 장마감 후 종가 유지
// ════════════════════════════════════════
$SYMBOLS = ['^GSPC', '^IXIC', '^DJI', '^VIX'];

function fetchYahoo($sym) {
    $enc  = rawurlencode($sym);
    $path = "/v8/finance/chart/{$enc}?interval=1d&range=5d&includePrePost=false";

    // query1 → query2 순으로 시도
    foreach (['query1', 'query2'] as $domain) {
        try {
            return fetchUrl("https://{$domain}.finance.yahoo.com{$path}", 12);
        } catch (Exception $e) {
            // 다음 도메인 시도
        }
    }
    throw new Exception("{$sym} Yahoo 모두 실패");
}

function fetchIndices() {
    global $SYMBOLS;
    $existing    = loadData('indices.json') ?: [];
    $quotes      = $existing['quotes'] ?? [];
    $marketOpen  = isMarketOpen();

    // 장마감이고 기존 데이터 있으면 market_open 상태만 업데이트
    if (!$marketOpen && !empty($quotes)) {
        saveData('indices.json', [
            'updated'     => gmdate('Y-m-d\TH:i:s\Z'),
            'market_open' => false,
            'quotes'      => $quotes,
        ]);
        logMsg('장 마감 — 종가 유지');
        return;
    }

    foreach ($SYMBOLS as $sym) {
        try {
            $j    = fetchYahoo($sym);
            $meta = $j['chart']['result'][0]['meta'] ?? null;
            if (!$meta) throw new Exception('meta 없음');

            $price = $meta['regularMarketPrice']  ?? null;
            $prev  = $meta['previousClose']        ??
                     $meta['chartPreviousClose']   ?? null;

            if ($price && $prev) {
                $quotes[$sym] = [
                    'price'   => round($price, 4),
                    'prev'    => round($prev,  4),
                    'updated' => gmdate('Y-m-d\TH:i:s\Z'),
                ];
                logMsg("{$sym}: {$price}");
            }
        } catch (Exception $e) {
            logMsg("{$sym} 오류 (기존 유지): " . $e->getMessage());
        }
    }

    saveData('indices.json', [
        'updated'     => gmdate('Y-m-d\TH:i:s\Z'),
        'market_open' => $marketOpen,
        'quotes'      => $quotes,
    ]);
}

// ════════════════════════════════════════
//  3. 공포 & 탐욕 지수
//     마지막 갱신 후 12시간 경과 시에만
// ════════════════════════════════════════
function needsFGUpdate() {
    $data = loadData('fear_greed.json');
    if (!$data || empty($data['updated'])) return true;
    $updated = strtotime($data['updated']);
    return (time() - $updated) >= 12 * 3600;
}

function fetchFearGreed() {
    if (!needsFGUpdate()) {
        logMsg('F&G — 12시간 미경과, 건너뜀');
        return;
    }

    $existing = loadData('fear_greed.json') ?: [];
    $stock    = $existing['stock']  ?? null;
    $crypto   = $existing['crypto'] ?? null;

    // ── 주식 F&G (CNN) ──
    try {
        $j    = fetchUrl('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', 15);
        $fg   = $j['fear_and_greed'];
        $hist = $j['fear_and_greed_historical']['data'] ?? [];

        $m6 = null;
        if ($hist) {
            $sixAgo = time() - 182 * 86400;
            usort($hist, function($a, $b) use ($sixAgo) {
                $ta = $a['x'] > 1e10 ? $a['x']/1000 : $a['x'];
                $tb = $b['x'] > 1e10 ? $b['x']/1000 : $b['x'];
                return abs($ta - $sixAgo) <=> abs($tb - $sixAgo);
            });
            if (isset($hist[0]['y']) && is_numeric($hist[0]['y'])) {
                $m6 = (int)round($hist[0]['y']);
            }
        }

        $stock = [
            'score' => (int)round($fg['score']),
            'prev'  => (int)round($fg['previous_close']),
            'w1'    => isset($fg['previous_1_week'])  ? (int)round($fg['previous_1_week'])  : null,
            'm1'    => isset($fg['previous_1_month']) ? (int)round($fg['previous_1_month']) : null,
            'm6'    => $m6,
        ];
        logMsg('Stock F&G 완료');
    } catch (Exception $e) {
        logMsg('Stock F&G 오류 (기존 유지): ' . $e->getMessage());
    }

    // ── 암호화폐 F&G ──
    try {
        $j = fetchUrl('https://api.alternative.me/fng/?limit=185&format=json', 15);
        $d = $j['data'];
        $crypto = [
            'score' => (int)$d[0]['value'],
            'prev'  => (int)$d[1]['value'],
            'w1'    => isset($d[6])   ? (int)$d[6]['value']   : null,
            'm1'    => isset($d[29])  ? (int)$d[29]['value']  : null,
            'm6'    => isset($d[182]) ? (int)$d[182]['value'] : null,
        ];
        logMsg('Crypto F&G 완료');
    } catch (Exception $e) {
        logMsg('Crypto F&G 오류 (기존 유지): ' . $e->getMessage());
    }

    saveData('fear_greed.json', [
        'updated' => gmdate('Y-m-d\TH:i:s\Z'),
        'stock'   => $stock,
        'crypto'  => $crypto,
    ]);
}

// ════════════════════════════════════════
//  실행
// ════════════════════════════════════════
logMsg('=== 수집 시작 ===');
logMsg('장중 여부: ' . (isMarketOpen() ? 'Y' : 'N'));

fetchFX();
fetchIndices();
fetchFearGreed();

logMsg('=== 수집 완료 ===');

// lock 해제
@unlink(LOCK_FILE);
