#!/usr/bin/env python3
"""
MoneyScoop Data Server
실행: python3 server.py
접속: http://localhost:8080
"""

import http.server
import threading
import json
import os
import time
import urllib.request
import urllib.parse
import urllib.error
import ssl
from datetime import datetime, timedelta
import socketserver
import traceback

# ── 설정 ──
PORT     = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
os.makedirs(DATA_DIR, exist_ok=True)

# SSL 검증 완화 (일부 환경에서 필요)
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

HEADERS = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer':         'https://finance.yahoo.com/',
}

# ── 로그 ──
def log(msg):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}', flush=True)

# ── fetch ──
def fetch_json(url, timeout=15, extra_headers=None):
    h = dict(HEADERS)
    if extra_headers:
        h.update(extra_headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
        return json.loads(r.read().decode('utf-8'))

def fetch_yahoo(path):
    """query1 → query2 순으로 시도"""
    last_err = None
    for domain in ['query1', 'query2']:
        try:
            url = f'https://{domain}.finance.yahoo.com{path}'
            return fetch_json(url)
        except Exception as e:
            last_err = e
    raise Exception(f'Yahoo 실패: {last_err}')

# ── 파일 I/O ──
def save_data(filename, data):
    path = os.path.join(DATA_DIR, filename)
    tmp  = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    log(f'저장: {filename}')

def load_data(filename):
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None

# ── 장 시간 판단 (UTC) ──
def is_market_open():
    now = datetime.utcnow()
    if now.weekday() >= 5:
        return False
    utc_min = now.hour * 60 + now.minute
    return 13*60+25 <= utc_min <= 20*60+5  # 9:25~16:05 ET (여유 포함)

# ══════════════════════════════════════════
# 환율 (frankfurter.app)
# ══════════════════════════════════════════
def fetch_fx():
    base   = 'https://api.frankfurter.app/'
    params = '?from=USD&to=KRW,EUR,JPY,GBP,CNY'

    def days_ago(n):
        return (datetime.utcnow() - timedelta(days=n)).strftime('%Y-%m-%d')

    existing = load_data('fx.json') or {}
    try:
        cur  = fetch_json(base + 'latest' + params, timeout=10)
        prev = fetch_json(base + days_ago(3)   + params, timeout=10)  # 전 영업일
        h6   = fetch_json(base + days_ago(182) + params, timeout=10)
        y1   = fetch_json(base + days_ago(365) + params, timeout=10)
        y3   = fetch_json(base + days_ago(365*3) + params, timeout=10)
        save_data('fx.json', {
            'updated': datetime.utcnow().isoformat() + 'Z',
            'current': cur,
            'prev_day': prev,
            'h6m':  h6,
            'y1':   y1,
            'y3':   y3,
        })
        log('FX 완료')
        return True
    except Exception as e:
        log(f'FX 오류 (기존 유지): {e}')
        return False

# ══════════════════════════════════════════
# 미국 주요 지수 (Yahoo Finance)
# ══════════════════════════════════════════
SYMBOLS = ['^GSPC', '^IXIC', '^DJI', '^VIX']

def fetch_indices(force=False):
    """force=True 이면 장 시간 무관하게 가져옴 (초기 로드용)"""
    if not force and not is_market_open():
        return False

    existing = load_data('indices.json') or {'quotes': {}}
    quotes   = dict(existing.get('quotes', {}))
    updated  = False

    for sym in SYMBOLS:
        try:
            enc  = urllib.parse.quote(sym, safe='')
            path = f'/v8/finance/chart/{enc}?interval=1d&range=5d&includePrePost=false'
            j    = fetch_yahoo(path)
            res  = j['chart']['result'][0]
            meta = res['meta']
            price = meta.get('regularMarketPrice')
            prev  = meta.get('previousClose') or meta.get('chartPreviousClose')
            if price and prev:
                quotes[sym] = {
                    'price':   round(price, 4),
                    'prev':    round(prev,  4),
                    'updated': datetime.utcnow().isoformat() + 'Z',
                }
                log(f'{sym}: {price}')
                updated = True
        except Exception as e:
            log(f'{sym} 오류 (기존 유지): {e}')

    save_data('indices.json', {
        'updated':     datetime.utcnow().isoformat() + 'Z',
        'market_open': is_market_open(),
        'quotes':      quotes,
    })
    return updated

# ══════════════════════════════════════════
# 공포&탐욕
# ══════════════════════════════════════════
def fetch_fear_greed():
    existing = load_data('fear_greed.json') or {}

    # ── 주식 F&G (CNN) ──
    stock = existing.get('stock')
    try:
        j    = fetch_json('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', timeout=12)
        fg   = j['fear_and_greed']
        hist = j.get('fear_and_greed_historical', {}).get('data', [])
        m6   = None
        if hist:
            six_ago = time.time() - 182 * 86400
            best    = min(hist, key=lambda x: abs((x['x']/1000 if x['x'] > 1e10 else x['x']) - six_ago))
            if isinstance(best.get('y'), (int, float)):
                m6 = round(best['y'])
        stock = {
            'score': round(fg['score']),
            'prev':  round(fg['previous_close']),
            'w1': round(fg['previous_1_week'])  if fg.get('previous_1_week')  else None,
            'm1': round(fg['previous_1_month']) if fg.get('previous_1_month') else None,
            'm6': m6,
        }
        log('Stock F&G 완료')
    except Exception as e:
        log(f'Stock F&G 오류 (기존 유지): {e}')

    # ── 암호화폐 F&G ──
    crypto = existing.get('crypto')
    try:
        d = fetch_json('https://api.alternative.me/fng/?limit=185&format=json', timeout=12)['data']
        crypto = {
            'score': int(d[0]['value']),
            'prev':  int(d[1]['value']),
            'w1': int(d[6]['value'])   if len(d) > 6   else None,
            'm1': int(d[29]['value'])  if len(d) > 29  else None,
            'm6': int(d[182]['value']) if len(d) > 182 else None,
        }
        log('Crypto F&G 완료')
    except Exception as e:
        log(f'Crypto F&G 오류 (기존 유지): {e}')

    save_data('fear_greed.json', {
        'updated': datetime.utcnow().isoformat() + 'Z',
        'stock':   stock,
        'crypto':  crypto,
    })

# ══════════════════════════════════════════
# 차트 프록시
# ══════════════════════════════════════════
def proxy_chart(sym, iv, rg):
    enc  = urllib.parse.quote(sym, safe='')
    path = f'/v8/finance/chart/{enc}?interval={iv}&range={rg}&includePrePost=false'
    return fetch_yahoo(path)

# ══════════════════════════════════════════
# 스케줄러
# ══════════════════════════════════════════
def scheduler():
    log('─── 초기 데이터 수집 시작 ───')
    # 시작 시 무조건 전부 가져옴 (장 시간 무관)
    fetch_fx()
    fetch_indices(force=True)   # ← force=True 로 장 외에도 수집
    fetch_fear_greed()
    log('─── 초기 수집 완료 ───')

    fx_last = time.time()
    fg_last = time.time()
    idx_last = 0

    FX_INTERVAL  = 30 * 60
    IDX_INTERVAL = 10
    FG_INTERVAL  = 12 * 3600

    while True:
        try:
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
        except Exception as e:
            log(f'스케줄러 오류: {e}')
        time.sleep(1)

# ══════════════════════════════════════════
# HTTP 서버
# ══════════════════════════════════════════
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
                self._json_response(200, body)
            except Exception as e:
                body = json.dumps({'error': str(e)}).encode()
                self._json_response(502, body)
            return

        # /data/*.json
        if path.startswith('/data/'):
            fname = os.path.basename(path)
            fpath = os.path.join(DATA_DIR, fname)
            if os.path.exists(fpath):
                with open(fpath, 'rb') as f:
                    body = f.read()
                self._json_response(200, body)
            else:
                self.send_error(404, 'Data not ready yet — server is still fetching')
            return

        # / → index.html, 기타 정적 파일
        super().do_GET()

    def _json_response(self, code, body):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # /api/chart 요청만 로그
        if '/api/' in (args[0] if args else ''):
            log(f'HTTP {fmt % args}')

def run():
    log(f'MoneyScoop 시작 → http://localhost:{PORT}')
    log(f'데이터 폴더: {DATA_DIR}')

    t = threading.Thread(target=scheduler, daemon=True)
    t.start()

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('', PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            log('서버 종료')

if __name__ == '__main__':
    run()
