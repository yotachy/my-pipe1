<?php
session_start();
// 💡 접속 비밀번호
$PASSWORD = 'admin123'; 
$DATA_FILE = __DIR__ . '/data.json';

// 로그아웃
if (isset($_GET['logout'])) {
    session_destroy();
    header("Location: admin.php");
    exit;
}

// 로그인 처리
if (isset($_POST['pwd'])) {
    if ($_POST['pwd'] === $PASSWORD) {
        $_SESSION['admin_auth'] = true;
    } else {
        $error = "비밀번호가 일치하지 않습니다.";
    }
}

// 로그인 안 된 상태면 로그인 폼 출력 후 종료
if (!isset($_SESSION['admin_auth'])) {
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>';
    echo '<body style="background:#f5f5f7; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">';
    echo '<div style="background:#fff; padding:30px; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.1); text-align:center;">';
    echo '<h2>이코노미보드 관리자</h2>';
    echo '<form method="post"><input type="password" name="pwd" placeholder="비밀번호" style="padding:10px; border:1px solid #ddd; border-radius:6px;"> ';
    echo '<button type="submit" style="padding:10px 16px; background:#1a6fd4; color:#fff; border:none; border-radius:6px; cursor:pointer;">접속</button></form>';
    if(isset($error)) echo "<p style='color:red; margin-top:10px; font-size:14px;'>$error</p>";
    echo '</div></body></html>';
    exit;
}

// API: 스마트 사전 + 야후 파이낸스 티커 검색
if (isset($_GET['search'])) {
    header('Content-Type: application/json');
    $q = trim($_GET['search']);
    $q_lower = mb_strtolower($q, 'UTF-8');

    // 💡 스마트 검색 사전: 자주 쓰는 한글/별칭 -> 대표 티커 강제 매핑
    $dictionary = [
        '필라델피아' => ['sym' => '^SOX', 'nm' => 'PHLX Semiconductor Index', 'exch' => 'INDEX'],
        '반도체지수' => ['sym' => '^SOX', 'nm' => 'PHLX Semiconductor Index', 'exch' => 'INDEX'],
        'sox' => ['sym' => '^SOX', 'nm' => 'PHLX Semiconductor Index', 'exch' => 'INDEX'],
        '금' => ['sym' => 'GC=F', 'nm' => 'Gold', 'exch' => 'COMEX'],
        'gold' => ['sym' => 'GC=F', 'nm' => 'Gold', 'exch' => 'COMEX'],
        '은' => ['sym' => 'SI=F', 'nm' => 'Silver', 'exch' => 'COMEX'],
        'silver' => ['sym' => 'SI=F', 'nm' => 'Silver', 'exch' => 'COMEX'],
        '구리' => ['sym' => 'HG=F', 'nm' => 'Copper', 'exch' => 'COMEX'],
        '동' => ['sym' => 'HG=F', 'nm' => 'Copper', 'exch' => 'COMEX'],
        '유가' => ['sym' => 'CL=F', 'nm' => 'WTI Crude Oil', 'exch' => 'NYMEX'],
        'wti' => ['sym' => 'CL=F', 'nm' => 'WTI Crude Oil', 'exch' => 'NYMEX'],
        '천연가스' => ['sym' => 'NG=F', 'nm' => 'Natural Gas', 'exch' => 'NYMEX'],
        'vix' => ['sym' => '^VIX', 'nm' => 'Volatility Index', 'exch' => 'CBOE'],
        '공포지수' => ['sym' => '^VIX', 'nm' => 'Volatility Index', 'exch' => 'CBOE'],
        '달러' => ['sym' => 'DX-Y.NYB', 'nm' => 'US Dollar Index', 'exch' => 'ICE'],
        'dxy' => ['sym' => 'DX-Y.NYB', 'nm' => 'US Dollar Index', 'exch' => 'ICE'],
        '비트코인' => ['sym' => 'BTC-USD', 'nm' => 'Bitcoin', 'exch' => 'CRYPTO'],
        '이더리움' => ['sym' => 'ETH-USD', 'nm' => 'Ethereum', 'exch' => 'CRYPTO'],
        '테슬라' => ['sym' => 'TSLA', 'nm' => 'Tesla', 'exch' => 'NASDAQ'],
        '애플' => ['sym' => 'AAPL', 'nm' => 'Apple', 'exch' => 'NASDAQ'],
        '엔비디아' => ['sym' => 'NVDA', 'nm' => 'NVIDIA', 'exch' => 'NASDAQ'],
        '마소' => ['sym' => 'MSFT', 'nm' => 'Microsoft', 'exch' => 'NASDAQ'],
        '마이크로소프트' => ['sym' => 'MSFT', 'nm' => 'Microsoft', 'exch' => 'NASDAQ'],
        '삼성전자' => ['sym' => '005930.KS', 'nm' => 'Samsung Electronics', 'exch' => 'KOSPI'],
        '하이닉스' => ['sym' => '000660.KS', 'nm' => 'SK Hynix', 'exch' => 'KOSPI'],
        '코스피' => ['sym' => '^KS11', 'nm' => 'KOSPI Composite Index', 'exch' => 'KOSPI'],
        '코스닥' => ['sym' => '^KQ11', 'nm' => 'KOSDAQ Composite Index', 'exch' => 'KOSDAQ'],
        '나스닥' => ['sym' => '^IXIC', 'nm' => 'NASDAQ Composite', 'exch' => 'NASDAQ'],
        's&p' => ['sym' => '^GSPC', 'nm' => 'S&P 500', 'exch' => 'S&P'],
        '다우' => ['sym' => '^DJI', 'nm' => 'Dow Jones Industrial Average', 'exch' => 'DJI']
    ];

    $results = [];
    $seen = [];

    // 1. 사전에 매칭되는 단어가 있는지 확인
    foreach ($dictionary as $key => $data) {
        if (mb_strpos($q_lower, $key) !== false || mb_strpos($key, $q_lower) !== false) {
            if (!isset($seen[$data['sym']])) {
                $results[] = [
                    'symbol' => $data['sym'],
                    'shortname' => $data['nm'],
                    'exchange' => $data['exch'],
                    'is_smart' => true // UI 강조용 플래그
                ];
                $seen[$data['sym']] = true;
            }
        }
    }

    // 2. 야후 API 원본 검색 연동
    $url = "https://query2.finance.yahoo.com/v1/finance/search?q=" . urlencode($q) . "&quotesCount=10&newsCount=0";
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0');
    $yahoo_res = curl_exec($ch);
    curl_close($ch);

    if ($yahoo_res) {
        $yahoo_data = json_decode($yahoo_res, true);
        if (!empty($yahoo_data['quotes'])) {
            foreach ($yahoo_data['quotes'] as $quote) {
                if (!isset($quote['symbol'])) continue;
                // 사전에 이미 추가된 티커는 중복 제거
                if (!isset($seen[$quote['symbol']])) {
                    $results[] = $quote;
                    $seen[$quote['symbol']] = true;
                }
            }
        }
    }

    echo json_encode(['quotes' => $results]);
    exit;
}

// API: JSON 저장
if (isset($_POST['save_data'])) {
    $json = $_POST['save_data'];
    if (json_decode($json) !== null) {
        file_put_contents($DATA_FILE, $json);
        echo "OK";
    } else {
        echo "FAIL";
    }
    exit;
}
?>
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>이코노미보드 관리자 패널</title>
    <style>
        body { font-family: 'Pretendard', sans-serif; background: #f1f5f9; margin: 0; padding: 20px; color: #334155; }
        .wrap { max-width: 1000px; margin: 0 auto; display: flex; gap: 20px; align-items: flex-start; }
        .panel { background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
        .left { flex: 1; position: sticky; top: 20px; }
        .right { flex: 2; }
        h2 { margin-top: 0; font-size: 18px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; display:flex; justify-content:space-between; }
        input, select { padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; width: 100%; box-sizing: border-box; }
        button { padding: 10px 14px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
        .btn-blue { background: #2563eb; color: #fff; }
        .btn-blue:hover { background: #1d4ed8; }
        
        .res-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; border-radius: 6px; margin-bottom: 4px; }
        .res-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .res-item.smart { background: #eff6ff; border: 1px solid #bfdbfe; }
        
        .cat-sel { margin-bottom: 16px; }
        .drag-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 6px; }
        .drag-item b { font-size: 15px; color:#0f172a; }
        .ctrls button { padding: 4px 8px; font-size: 12px; margin-left: 4px; background: #e2e8f0; color: #475569; }
        .ctrls button.del { background: #fee2e2; color: #ef4444; }
        
        .floating-save { position: fixed; bottom: 30px; right: 30px; padding: 16px 24px; font-size: 16px; box-shadow: 0 10px 25px rgba(37,99,235,0.4); border-radius: 30px; }
    </style>
</head>
<body>
    <h1 style="text-align:center; font-size:24px; margin-bottom:30px;">⚙️ 이코노미보드 에디터 <a href="?logout=1" style="font-size:12px; color:red; text-decoration:none;">[로그아웃]</a></h1>
    
    <div class="wrap">
        <div class="panel left">
            <h2>🔍 스마트 종목 추가</h2>
            <div style="display:flex; gap:8px; margin-bottom: 16px;">
                <input type="text" id="sq" placeholder="검색어 (예: 필라델피아, 금, TSLA)" onkeypress="if(event.key==='Enter') searchTicker()">
                <button class="btn-blue" onclick="searchTicker()" style="white-space:nowrap;">검색</button>
            </div>
            <div>
                <select id="add-target" class="cat-sel">
                    <option value="US_TOP10">미국 Top 10 에 추가</option>
                    <option value="KR_TOP10">한국 Top 10 에 추가</option>
                    <option value="IDX_GL">글로벌 지수(DXY, 금 등) 에 추가</option>
                    <option value="IDX_US">미국 지수(S&P등) 에 추가</option>
                    <option value="IDX_KR">한국 지수(KOSPI등) 에 추가</option>
                    <option value="FX">환율 에 추가</option>
                </select>
            </div>
            <div id="search-res" style="max-height: 500px; overflow-y: auto;">
                <p style="color:#94a3b8; font-size:13px; text-align:center;">티커나 종목명(한글/영문)을 검색하세요.<br>유명한 종목은 자동 매칭됩니다.</p>
            </div>
        </div>

        <div class="panel right">
            <h2>📝 현재 표시중인 목록
                <select id="view-target" style="width:200px; padding:4px;" onchange="renderList()">
                    <option value="US_TOP10">🇺🇸 미국 Top 10</option>
                    <option value="KR_TOP10">🇰🇷 한국 Top 10</option>
                    <option value="IDX_GL">🌍 글로벌 주요 지표</option>
                    <option value="IDX_US">🇺🇸 미국 주요 지수</option>
                    <option value="IDX_KR">🇰🇷 한국 주요 지수</option>
                    <option value="FX">💱 환율</option>
                </select>
            </h2>
            <div id="current-list"></div>
        </div>
    </div>

    <button class="btn-blue floating-save" onclick="saveData()">💾 변경사항 홈페이지에 적용하기</button>

    <script>
        let configData = {};

        // 데이터 로드
        fetch('data.json?t=' + Date.now()).then(r => r.json()).then(d => {
            configData = d;
            renderList();
        });

        // 스마트 + 야후 검색
        function searchTicker() {
            const q = document.getElementById('sq').value;
            if(!q) return;
            document.getElementById('search-res').innerHTML = '검색 중...';
            
            fetch('?search=' + encodeURIComponent(q))
            .then(r => r.json())
            .then(d => {
                let html = '';
                const arr = d.quotes || [];
                if(arr.length === 0) html = '<p style="color:red; font-size:13px;">검색 결과가 없습니다.</p>';
                
                arr.forEach(q => {
                    const nm = (q.shortname || q.longname || q.symbol).replace(/'/g, "\\'");
                    const isSmart = q.is_smart ? 'smart' : '';
                    const smartBadge = q.is_smart ? '<span style="background:#3b82f6; color:#fff; padding:2px 5px; border-radius:4px; font-size:10px; margin-left:6px; vertical-align:middle;">✨ 추천</span>' : '';
                    
                    html += `<div class="res-item ${isSmart}">
                        <span><b style="font-size:15px;">${q.symbol}</b> ${smartBadge}<br><span style="color:#64748b; font-size:12px;">${nm} (${q.exchange})</span></span>
                        <button onclick="doAdd('${q.symbol}', '${nm}')" style="background:#10b981; color:#fff; border:none; padding:6px 12px; border-radius:4px; font-size:13px; cursor:pointer;">추가</button>
                    </div>`;
                });
                document.getElementById('search-res').innerHTML = html;
            });
        }

        // 종목 데이터에 추가
        function doAdd(sym, defaultNm) {
            const target = document.getElementById('add-target').value;
            const nm = prompt('홈페이지에 표시될 이름을 입력하세요.', defaultNm);
            if(!nm) return;

            let newItem = { 
                sym: sym, 
                id: 'dyn-' + sym.toLowerCase().replace(/[^a-z0-9]/g,''), 
                nm: nm 
            };
            
            if(!configData[target]) configData[target] = [];
            configData[target].push(newItem);
            
            document.getElementById('view-target').value = target;
            renderList();
        }

        // 리스트 렌더링
        function renderList() {
            const cat = document.getElementById('view-target').value;
            const c = document.getElementById('current-list');
            c.innerHTML = '';
            if(!configData[cat] || configData[cat].length === 0) {
                c.innerHTML = '<p style="color:#94a3b8; font-size:14px;">등록된 종목이 없습니다.</p>';
                return;
            }
            configData[cat].forEach((item, i) => {
                const div = document.createElement('div');
                div.className = 'drag-item';
                div.innerHTML = `
                    <div><b>${item.nm}</b> <span style="color:#94a3b8; font-size:12px; margin-left:6px;">${item.sym}</span></div>
                    <div class="ctrls">
                        <button onclick="moveItem('${cat}', ${i}, -1)">▲</button>
                        <button onclick="moveItem('${cat}', ${i}, 1)">▼</button>
                        <button class="del" onclick="delItem('${cat}', ${i})">삭제</button>
                    </div>
                `;
                c.appendChild(div);
            });
        }

        // 순서 변경
        function moveItem(cat, i, dir) {
            const arr = configData[cat];
            if (i + dir < 0 || i + dir >= arr.length) return;
            let temp = arr[i];
            arr[i] = arr[i + dir];
            arr[i + dir] = temp;
            renderList();
        }

        // 삭제
        function delItem(cat, i) {
            if(confirm('정말 삭제하시겠습니까?')) {
                configData[cat].splice(i, 1);
                renderList();
            }
        }

        // 서버에 저장
        function saveData() {
            const fd = new FormData();
            fd.append('save_data', JSON.stringify(configData, null, 2));
            
            fetch('admin.php', { method: 'POST', body: fd })
            .then(r => r.text())
            .then(res => {
                if(res.trim() === 'OK') {
                    alert('성공적으로 저장되었습니다! 홈페이지를 새로고침 해보세요.');
                } else {
                    alert('저장 실패: 폴더 쓰기 권한(퍼미션)을 확인하세요.');
                }
            });
        }
    </script>
</body>
</html>