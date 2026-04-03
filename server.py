#!/usr/bin/env python3
"""
MoneyScoop Data Server
- /data/fx.json        환율 (30분 갱신)
- /data/indices.json   미국 주요 지수 (장중 10초 갱신)
- /data/fear_greed.json 공포&탐욕 (12시간 갱신)
- /api/chart           차트 데이터 프록시
- /                    index.html 서빙
"""

import http.server
import threading
import json
import os
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta
import socketserver

# ── 설정 ──
PORT      = 8080
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
DATA_DIR  = os.path.join(BASE_DIR, 'data')
os.makedirs(DATA_DIR, exist_ok=True)

YAHOO_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
}

# ── 유틸 ──
def log(msg):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}')

def fetch_json(url, timeout=12):
    req = urllib.request.Request(url, headers=YAHOO_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def save_data(filename, data):
    path = os.path.join(DATA_DIR, filename)
    tmp  = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)

def load_data(filename):
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None

def is_market_open():
    """미국 장 시간 판단 (UTC 기준 13:30~20:00, 평일)"""
    now = datetime.utcnow()
    if now.weekday() >= 5:          # 토·일
        return False
    h, m = now.hour, now.minute
    utc_min = h * 60 + m
    return 13*60+30 <= utc_min <= 20*60  # 9:30~16:00 ET

# ─── 환율 fetch (frankfurter.app) ───
def fetch_fx():
    base = 'https://api.frankfurter.app/'
    params = '?from=USD&to=KRW,EUR,JPY,GBP,CNY'

    def days_ago(n):
        return (datetime.utcnow() - timedelta(days=n)).strftime('%Y-%m-%d')

    try:
        cur = fetch_json(base + 'latest' + params)
        h6  = fetch_json(base + days_ago(182) + params)
        y1  = fetch_json(base + days_ago(365) + params)
        y3  = fetch_json(base + days_ago(365*3) + params)
        data = {
            'updated': datetime.utcnow().isoformat() + 'Z',
            'current': cur,
            'h6m': h6,
            'y1':  y1,
            'y3':  y3,
        }
        save_data('fx.json', data)
        log('FX 업데이트 완료')
    except Exception as e:
        log(f'FX 오류 (기존 데이터 유지): {e}')

# ─── 지수 fetch (Yahoo Finance v8) ───
SYMBOLS = ['^GSPC', '^IXIC', '^DJI', '^VIX']

def fetch_indices():
    if not is_market_open():
        return  # 장외 시간 호출 없음

    existing = load_data('indices.json') or {'quotes': {}}
    quotes   = dict(existing.get('quotes', {}))  # 기존 데이터 복사

    for sym in SYMBOLS:
        try:
            enc = urllib.parse.quote(sym, safe='')
            url = (f'https://query1.finance.yahoo.com/v8/finance/chart/{enc}'
                   f'?interval=1d&range=2d&includePrePost=false')
            j    = fetch_json(url)
            res  = j['chart']['result'][0]
            meta = res['meta']
            price = meta.get('regularMarketPrice')
            prev  = meta.get('previousClose') or meta.get('chartPreviousClose')
            if price and prev:
                quotes[sym] = {'price': round(price, 4), 'prev': round(prev, 4)}
                log(f'{sym}: {price}')
        except Exception as e:
            log(f'{sym} 오류 (기존 유지): {e}')
            # 기존 데이터 그대로 유지 — 아무것도 안 함

    save_data('indices.json', {
        'updated': datetime.utcnow().isoformat() + 'Z',
        'market_open': is_market_open(),
        'quotes': quotes,
    })

# ─── 공포&탐욕 fetch ───
def fetch_fear_greed():
    existing = load_data('fear_greed.json') or {}

    # 주식 F&G
    stock = existing.get('stock')
    try:
        j  = fetch_json('https://production.dataviz.cnn.io/index/fearandgreed/graphdata')
        fg = j['fear_and_greed']
        hist = j.get('fear_and_greed_historical', {}).get('data', [])
        m6 = None
        if hist:
            six_ago = time.time() - 182 * 86400
            best = min(hist, key=lambda x: abs((x['x']/1000 if x['x'] > 1e10 else x['x']) - six_ago))
            if isinstance(best.get('y'), (int, float)):
                m6 = round(best['y'])
        stock = {
            'score': round(fg['score']),
            'prev':  round(fg['previous_close']),
            'w1': round(fg['previous_1_week'])  if fg.get('previous_1_week')  else None,
            'm1': round(fg['previous_1_month']) if fg.get('previous_1_month') else None,
            'm6': m6,
        }
        log('Stock F&G 업데이트')
    except Exception as e:
        log(f'Stock F&G 오류 (기존 유지): {e}')

    # 암호화폐 F&G
    crypto = existing.get('crypto')
    try:
        d = fetch_json('https://api.alternative.me/fng/?limit=185&format=json')['data']
        crypto = {
            'score': int(d[0]['value']),
            'prev':  int(d[1]['value']),
            'w1': int(d[6]['value'])   if len(d) > 6   else None,
            'm1': int(d[29]['value'])  if len(d) > 29  else None,
            'm6': int(d[182]['value']) if len(d) > 182 else None,
        }
        log('Crypto F&G 업데이트')
    except Exception as e:
        log(f'Crypto F&G 오류 (기존 유지): {e}')

    save_data('fear_greed.json', {
        'updated': datetime.utcnow().isoformat() + 'Z',
        'stock':  stock,
        'crypto': crypto,
    })

# ─── 차트 데이터 프록시 ───
def proxy_chart(sym, iv, rg):
    enc = urllib.parse.quote(sym, safe='')
    url = (f'https://query1.finance.yahoo.com/v8/finance/chart/{enc}'
           f'?interval={iv}&range={rg}&includePrePost=false')
    return fetch_json(url)

# ─── 스케줄러 ───
def scheduler():
    # 시작 즉시 한 번 실행
    fetch_fx()
    fetch_indices()
    fetch_fear_greed()

    fx_last    = time.time()
    fg_last    = time.time()
    idx_last   = 0  # 바로 실행했으니 충분한 값

    FX_INTERVAL = 30 * 60       # 30분
    IDX_INTERVAL = 10           # 10초 (장중만)
    FG_INTERVAL  = 12 * 3600   # 12시간

    while True:
        now = time.time()
        if now - fx_last >= FX_INTERVAL:
            fetch_fx()
            fx_last = now
        if now - fg_last >= FG_INTERVAL:
            fetch_fear_greed()
            fg_last = now
        if is_market_open() and now - idx_last >= IDX_INTERVAL:
            fetch_indices()
            idx_last = now
        time.sleep(1)

# ─── HTTP 서버 ───
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path   = parsed.path

        # /api/chart 프록시
        if path == '/api/chart':
            qs  = urllib.parse.parse_qs(parsed.query)
            sym = qs.get('sym', ['^GSPC'])[0]
            iv  = qs.get('iv',  ['1wk'])[0]
            rg  = qs.get('rg',  ['1y'])[0]
            try:
                data = proxy_chart(sym, iv, rg)
                body = json.dumps(data).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', len(body))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                self.send_error(502, str(e))
            return

        # /data/*.json → DATA_DIR에서 서빙
        if path.startswith('/data/'):
            fname = os.path.basename(path)
            fpath = os.path.join(DATA_DIR, fname)
            if os.path.exists(fpath):
                with open(fpath, 'rb') as f:
                    body = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', len(body))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_error(404)
            return

        # 그 외 정적 파일 (index.html 등)
        super().do_GET()

    def log_message(self, fmt, *args):
        pass  # HTTP 로그 숨김

def run():
    log(f'MoneyScoop 서버 시작 → http://localhost:{PORT}')

    # 스케줄러 백그라운드 스레드
    t = threading.Thread(target=scheduler, daemon=True)
    t.start()

    # HTTP 서버
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('', PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            log('서버 종료')

if __name__ == '__main__':
    run()
