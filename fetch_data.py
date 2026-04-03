#!/usr/bin/env python3
"""
MoneyScoop — GitHub Actions 데이터 수집 스크립트
매 15분마다 실행되어 data/*.json 파일을 갱신합니다.
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta

try:
    import requests
    SESSION = requests.Session()
    SESSION.headers.update({
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         'https://finance.yahoo.com/',
    })
    def get_json(url, timeout=15):
        r = SESSION.get(url, timeout=timeout)
        r.raise_for_status()
        return r.json()
except ImportError:
    import urllib.request, urllib.error, ssl
    ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
    def get_json(url, timeout=15):
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
        })
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            return json.loads(r.read().decode())

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(DATA_DIR, exist_ok=True)

def log(msg):
    print(f'[{datetime.utcnow().strftime("%H:%M:%S")} UTC] {msg}', flush=True)

def save(filename, data):
    path = os.path.join(DATA_DIR, filename)
    tmp  = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    log(f'저장 완료: {filename}')

def load(filename):
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None

def is_market_open():
    """미국 장중 여부 (UTC 기준)"""
    now = datetime.utcnow()
    if now.weekday() >= 5:
        return False
    m = now.hour * 60 + now.minute
    return 13*60+25 <= m <= 20*60+10

def days_ago(n):
    return (datetime.utcnow() - timedelta(days=n)).strftime('%Y-%m-%d')


# ═══════════════════════════════════════
#  1. 환율 (frankfurter.app)
# ═══════════════════════════════════════
def fetch_fx():
    base   = 'https://api.frankfurter.app/'
    params = '?from=USD&to=KRW,EUR,JPY,GBP,CNY'
    existing = load('fx.json') or {}
    try:
        cur  = get_json(base + 'latest'         + params)
        prev = get_json(base + days_ago(3)       + params)
        h6   = get_json(base + days_ago(182)     + params)
        y1   = get_json(base + days_ago(365)     + params)
        y3   = get_json(base + days_ago(365 * 3) + params)
        save('fx.json', {
            'updated':  datetime.utcnow().isoformat() + 'Z',
            'current':  cur,
            'prev_day': prev,
            'h6m':      h6,
            'y1':       y1,
            'y3':       y3,
        })
    except Exception as e:
        log(f'FX 오류 (기존 유지): {e}')
        if existing:
            save('fx.json', existing)


# ═══════════════════════════════════════
#  2. 미국 주요 지수 (Yahoo Finance)
#     장중이 아니면 기존 데이터 유지
# ═══════════════════════════════════════
SYMBOLS = ['^GSPC', '^IXIC', '^DJI', '^VIX']

def fetch_yahoo(sym):
    import urllib.parse
    enc  = urllib.parse.quote(sym, safe='')
    path = f'/v8/finance/chart/{enc}?interval=1d&range=5d&includePrePost=false'
    for domain in ['query1', 'query2']:
        try:
            return get_json(f'https://{domain}.finance.yahoo.com{path}', timeout=12)
        except Exception:
            continue
    raise Exception(f'{sym} Yahoo 모두 실패')

def fetch_indices():
    existing = load('indices.json') or {}
    quotes   = dict(existing.get('quotes', {}))
    open_now = is_market_open()

    if not open_now and quotes:
        # 장 마감 시간 — 기존 데이터 유지, market_open 상태만 업데이트
        save('indices.json', {
            'updated':     datetime.utcnow().isoformat() + 'Z',
            'market_open': False,
            'quotes':      quotes,
        })
        log('장 마감 — 종가 데이터 유지 (갱신 없음)')
        return

    for sym in SYMBOLS:
        try:
            j    = fetch_yahoo(sym)
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
        except Exception as e:
            log(f'{sym} 오류 (기존 유지): {e}')

    save('indices.json', {
        'updated':     datetime.utcnow().isoformat() + 'Z',
        'market_open': open_now,
        'quotes':      quotes,
    })


# ═══════════════════════════════════════
#  3. 공포 & 탐욕 지수
#     12시간마다만 갱신
# ═══════════════════════════════════════
def needs_fg_update():
    existing = load('fear_greed.json')
    if not existing or not existing.get('updated'):
        return True
    updated = datetime.fromisoformat(existing['updated'].rstrip('Z'))
    return (datetime.utcnow() - updated).total_seconds() >= 12 * 3600

def fetch_fear_greed():
    if not needs_fg_update():
        log('F&G — 12시간 미경과, 건너뜀')
        return

    existing = load('fear_greed.json') or {}
    stock    = existing.get('stock')
    crypto   = existing.get('crypto')

    # 주식 F&G
    try:
        j    = get_json('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', timeout=15)
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

    # 암호화폐 F&G
    try:
        d = get_json('https://api.alternative.me/fng/?limit=185&format=json', timeout=15)['data']
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

    save('fear_greed.json', {
        'updated': datetime.utcnow().isoformat() + 'Z',
        'stock':   stock,
        'crypto':  crypto,
    })


# ═══════════════════════════════════════
#  실행
# ═══════════════════════════════════════
if __name__ == '__main__':
    log('=== MoneyScoop 데이터 수집 시작 ===')
    log(f'장중 여부: {is_market_open()}')

    fetch_fx()
    fetch_indices()
    fetch_fear_greed()

    log('=== 수집 완료 ===')
