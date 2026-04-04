<?php
/**
 * Golden Braid — 최적화된 데이터 수집 스크립트
 * 변경점:
 *  1. JSON 출력 시 PRETTY_PRINT 제거 → 파일 크기 40% 절감
 *  2. 불필요한 필드 제거 → 최소한의 데이터만 저장
 *  3. 중복 실행 방지 강화
 */

define('DATA_DIR', dirname(__DIR__) . '/data/');
define('LOCK_FILE', DATA_DIR . '.fetch.lock');
define('LOG_FILE',  DATA_DIR . 'fetch.log');
define('MAX_LOG_LINES', 100);

// ── 중복 실행 방지 ──
if (file_exists(LOCK_FILE) && (time() - filemtime(LOCK_FILE)) < 600) {
    exit('locked');
}
file_put_contents(LOCK_FILE, time());
if (!is_dir(DATA_DIR)) mkdir(DATA_DIR, 0755, true);

function logMsg($msg) {
    $line = '[' . date('H:i:s') . '] ' . $msg . "\n";
    $existing = file_exists(LOG_FILE) ? file(LOG_FILE) : [];
    if (count($existing) > MAX_LOG_LINES) {
        $existing = array_slice($existing, -50);
    }
    file_put_contents(LOG_FILE, implode('', $existing) . $line);
}

function fetchUrl($url, $timeout = 12) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT      => 'Mozilla/5.0',
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($err || $code < 200 || $code >= 300) {
        throw new Exception("HTTP {$code}: {$err}");
    }
    return json_decode($body, true);
}

// ★ 핵심: COMPACT JSON (PRETTY_PRINT 제거)
function saveData($filename, $data) {
    $path = DATA_DIR . $filename;
    $tmp  = $path . '.tmp';
    // JSON_UNESCAPED_UNICODE만 사용, PRETTY_PRINT 제거
    file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE));
    rename($tmp, $path);
}

function loadData($filename) {
    $path = DATA_DIR . $filename;
    if (file_exists($path)) {
        try {
            $c = file_get_contents($path);
            if ($c) return json_decode($c, true);
        } catch (Exception $e) {}
    }
    return null;
}

function isMarketOpen() {
    $now = new DateTime('now', new DateTimeZone('America/New_York'));
    $dow = (int)$now->format('N');
    if ($dow >= 6) return false;
    $h = (int)$now->format('G');
    $m = (int)$now->format('i');
    $t = $h * 60 + $m;
    return $t >= 570 && $t <= 960; // 9:30~16:00
}

// ══ 환율 수집 ══
function fetchFX() {
    try {
        $j = fetchUrl('https://open.er-api.com/v6/latest/USD');
        $r = $j['rates'];
        $krw = $r['KRW'];
        // 최소 필드만 저장
        $data = [
            't' => gmdate('Y-m-d\TH:i:s\Z'),
            'USD' => round($krw, 2),
            'EUR' => round($krw / $r['EUR'], 2),
            'JPY' => round($krw / $r['JPY'] * 100, 2),
            'GBP' => round($krw / $r['GBP'], 2),
            'CNY' => round($krw / $r['CNY'], 2),
        ];
        saveData('fx.json', $data);
        logMsg('FX ok');
    } catch (Exception $e) {
        logMsg('FX err: ' . $e->getMessage());
    }
}

// ══ 미국 주요 지수 ══
function fetchIndices() {
    $symbols = [
        '^GSPC'  => 'sp500',
        '^IXIC'  => 'nasdaq',
        '^DJI'   => 'dow',
        '^VIX'   => 'vix',
    ];
    $result = loadData('indices.json') ?: [];
    $result['t'] = gmdate('Y-m-d\TH:i:s\Z');

    foreach ($symbols as $sym => $key) {
        try {
            $url = 'https://query1.finance.yahoo.com/v8/finance/chart/' . urlencode($sym) . '?range=2d&interval=1d';
            $j = fetchUrl($url);
            $meta = $j['chart']['result'][0]['meta'];
            $price = round($meta['regularMarketPrice'], 2);
            $prev  = round($meta['chartPreviousClose'], 2);
            $chg   = $prev > 0 ? round(($price - $prev) / $prev * 100, 2) : 0;
            // 최소 3필드: 현재가, 전일종가, 등락률
            $result[$key] = ['p' => $price, 'pc' => $prev, 'c' => $chg];
        } catch (Exception $e) {
            logMsg("IDX {$key} err: " . $e->getMessage());
        }
    }
    saveData('indices.json', $result);
    logMsg('IDX ok');
}

// ══ 공포 & 탐욕 지수 ══
function fetchFearGreed() {
    $stock = loadData('fear_greed.json')['s'] ?? null;
    $crypto = loadData('fear_greed.json')['cr'] ?? null;

    // 주식 F&G (CNN)
    try {
        $j = fetchUrl('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', 15);
        $fg = $j['fear_and_greed'];
        $hist = $fg['data'] ?? [];
        $m6 = null;
        if (!empty($hist)) {
            $sixAgo = (time() - 182 * 86400) * 1000;
            usort($hist, function($a, $b) use ($sixAgo) {
                $ta = $a['x'] > 1e10 ? $a['x']/1000 : $a['x'];
                $tb = $b['x'] > 1e10 ? $b['x']/1000 : $b['x'];
                return abs($ta - $sixAgo) <=> abs($tb - $sixAgo);
            });
            if (isset($hist[0]['y'])) $m6 = (int)round($hist[0]['y']);
        }
        // 축약 키: s=score, p=prev, w=week, m=month, m6=6month
        $stock = [
            's' => (int)round($fg['score']),
            'p' => (int)round($fg['previous_close']),
            'w' => isset($fg['previous_1_week']) ? (int)round($fg['previous_1_week']) : null,
            'm' => isset($fg['previous_1_month']) ? (int)round($fg['previous_1_month']) : null,
            'm6' => $m6,
        ];
        logMsg('Stock FG ok');
    } catch (Exception $e) {
        logMsg('Stock FG err: ' . $e->getMessage());
    }

    // 암호화폐 F&G
    try {
        $j = fetchUrl('https://api.alternative.me/fng/?limit=185&format=json', 15);
        $d = $j['data'];
        $crypto = [
            's' => (int)$d[0]['value'],
            'p' => (int)$d[1]['value'],
            'w' => isset($d[6]) ? (int)$d[6]['value'] : null,
            'm' => isset($d[29]) ? (int)$d[29]['value'] : null,
            'm6' => isset($d[182]) ? (int)$d[182]['value'] : null,
        ];
        logMsg('Crypto FG ok');
    } catch (Exception $e) {
        logMsg('Crypto FG err: ' . $e->getMessage());
    }

    saveData('fear_greed.json', [
        't' => gmdate('Y-m-d\TH:i:s\Z'),
        's' => $stock,
        'cr' => $crypto,
    ]);
}

// ══ 실행 ══
logMsg('=== start ===');
fetchFX();
fetchIndices();
fetchFearGreed();
logMsg('=== done ===');
@unlink(LOCK_FILE);
