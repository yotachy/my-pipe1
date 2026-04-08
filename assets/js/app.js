/* =========================================================================
   1. 데이터 & 유틸리티 설정 (Data & Utilities)
   ========================================================================= */
const $ = id => document.getElementById(id);

function fmt(n, d) {
  if (n === null || n === undefined || isNaN(n)) return "0";
  d = d || 0;
  return Number(n).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtMC(val, currency) {
  if (!val) return "";
  if (currency === "KRW") return fmt(val / 1000000000000, 0) + "조";
  if (val >= 1000000000000) return fmt(val / 1000000000000, 2) + "T";
  return fmt(val / 1000000000, 1) + "B";
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function nowStr() {
  const d = new Date();
  return (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function animateValue(obj, start, end, duration, formatFn) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 4);
    const current = start + (end - start) * ease;
    obj.textContent = formatFn(current);
    if (progress < 1) window.requestAnimationFrame(step);
    else obj.textContent = formatFn(end);
  };
  window.requestAnimationFrame(step);
}

function getKSTTime() {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  return new Date(utc + 3600000 * 9);
}

function isMarketOpen(type) {
  const kst = getKSTTime();
  const day = kst.getDay();
  const t = kst.getHours() * 100 + kst.getMinutes();

  if (type === "kr") return day >= 1 && day <= 5 && t >= 900 && t <= 1530;
  else if (type === "us") {
    if (day === 0) return false;
    if (day === 1 && t < 2230) return false;
    if (day === 6 && t > 600) return false;
    return t >= 2230 || t <= 600;
  } else {
    if (day === 6 && t > 600) return false;
    if (day === 0) return false;
    if (day === 1 && t < 700) return false;
    return true;
  }
}

// 심볼 정의
const IDX = [
  { sym: "^GSPC", id: "idx-sp500", nm: "S&P 500", special: "", d: 2, fmt: p => fmt(p, 2) },
  { sym: "^IXIC", id: "idx-nasdaq", nm: "NASDAQ", special: "", d: 2, fmt: p => fmt(p, 2) },
  { sym: "^DJI", id: "idx-dow", nm: "DOW", special: "", d: 2, fmt: p => fmt(p, 2) },
  { sym: "^RUT", id: "idx-russell", nm: "Russell 2000", special: "", d: 2, fmt: p => fmt(p, 2) },
  { sym: "DX-Y.NYB", id: "idx-dxy", nm: "DXY", special: "dxy", d: 2, fmt: p => fmt(p, 2), no1D: true },
  { sym: "GC=F", id: "idx-gold", nm: "Gold", special: "cmd", d: 1, fmt: p => fmt(p, 1) },
  { sym: "SI=F", id: "idx-silver", nm: "Silver", special: "cmd", d: 3, fmt: p => fmt(p, 3) },
  { sym: "^VIX", id: "idx-vix", nm: "VIX", special: "vix", d: 2, fmt: p => fmt(p, 2), no1D: true },
  { sym: "^KS11", id: "idx-kospi", nm: "KOSPI", special: "", d: 2, fmt: p => fmt(p, 2) },
  { sym: "^KQ11", id: "idx-kosdaq", nm: "KOSDAQ", special: "", d: 2, fmt: p => fmt(p, 2) },
];
const US_TOP10 = [
  { sym: "AAPL", id: "us-top-aapl", nm: "Apple", d: 2, fmt: p => fmt(p, 2) },
  { sym: "MSFT", id: "us-top-msft", nm: "Microsoft", d: 2, fmt: p => fmt(p, 2) },
  { sym: "NVDA", id: "us-top-nvda", nm: "NVIDIA", d: 2, fmt: p => fmt(p, 2) },
  { sym: "GOOG", id: "us-top-goog", nm: "Alphabet", d: 2, fmt: p => fmt(p, 2) },
  { sym: "AMZN", id: "us-top-amzn", nm: "Amazon", d: 2, fmt: p => fmt(p, 2) },
  { sym: "META", id: "us-top-meta", nm: "Meta", d: 2, fmt: p => fmt(p, 2) },
  { sym: "BRK-B", id: "us-top-brkb", nm: "Berkshire", d: 2, fmt: p => fmt(p, 2) },
  { sym: "LLY", id: "us-top-lly", nm: "Eli Lilly", d: 2, fmt: p => fmt(p, 2) },
  { sym: "AVGO", id: "us-top-avgo", nm: "Broadcom", d: 2, fmt: p => fmt(p, 2) },
  { sym: "TSLA", id: "us-top-tsla", nm: "Tesla", d: 2, fmt: p => fmt(p, 2) },
];
const KR_TOP10 = [
  { sym: "005930.KS", id: "kr-top-005930", nm: "삼성전자", d: 0, fmt: p => fmt(p, 0) },
  { sym: "000660.KS", id: "kr-top-000660", nm: "SK하이닉스", d: 0, fmt: p => fmt(p, 0) },
  { sym: "373220.KS", id: "kr-top-373220", nm: "LG에너지솔루션", d: 0, fmt: p => fmt(p, 0) },
  { sym: "207940.KS", id: "kr-top-207940", nm: "삼성바이오로직스", d: 0, fmt: p => fmt(p, 0) },
  { sym: "005380.KS", id: "kr-top-005380", nm: "현대차", d: 0, fmt: p => fmt(p, 0) },
  { sym: "000270.KS", id: "kr-top-000270", nm: "기아", d: 0, fmt: p => fmt(p, 0) },
  { sym: "068270.KS", id: "kr-top-068270", nm: "셀트리온", d: 0, fmt: p => fmt(p, 0) },
  { sym: "105560.KS", id: "kr-top-105560", nm: "KB금융", d: 0, fmt: p => fmt(p, 0) },
  { sym: "005490.KS", id: "kr-top-005490", nm: "POSCO홀딩스", d: 0, fmt: p => fmt(p, 0) },
  { sym: "035420.KS", id: "kr-top-035420", nm: "NAVER", d: 0, fmt: p => fmt(p, 0) },
];
const FX = [
  { sym: "USDKRW=X", id: "fx-usd", nm: "USD/KRW", mult: 1, d: 2, fmt: p => fmt(p, 2) },
  { sym: "EURKRW=X", id: "fx-eur", nm: "EUR/KRW", mult: 1, d: 2, fmt: p => fmt(p, 2) },
  { sym: "JPYKRW=X", id: "fx-jpy", nm: "JPY/KRW", mult: 100, d: 2, fmt: p => fmt(p, 2) },
  { sym: "GBPKRW=X", id: "fx-gbp", nm: "GBP/KRW", mult: 1, d: 2, fmt: p => fmt(p, 2) },
  { sym: "CNYKRW=X", id: "fx-cny", nm: "CNY/KRW", mult: 1, d: 2, fmt: p => fmt(p, 2) },
];

const IDX_SYMS = IDX.map(s => s.sym).join(",");
const BATCH_TOP_SYMS = US_TOP10.map(s => s.sym).join(",") + "," + KR_TOP10.map(s => s.sym).join(",");
const FX_SYMS = FX.map(s => s.sym).join(",");

const RM = {
  "1D": ["2m", "1d"], "1W": ["30m", "5d"], "1M": ["1d", "1mo"],
  "6M": ["1d", "6mo"], "1Y": ["1wk", "1y"], "3Y": ["1wk", "3y"],
  "5Y": ["1mo", "5y"], "10Y": ["1mo", "10y"],
};
const CTTL = { "1D": 60, "1W": 300, "1M": 900, "6M": 1800, "1Y": 3600, "3Y": 7200, "5Y": 14400, "10Y": 14400 };

function effRange(s, r) { return s.no1D && r === "1D" ? "1W" : r; }

let _prev = {};
let _lastUpdated = {};
let globalBoostLevel = 0;
let intervals = {};


/* =========================================================================
   2. UI 상호작용 및 렌더링 (UI Interactions & Render)
   ========================================================================= */

// 💡 영역 내 하위 메뉴 탭 전환 함수 (기존 switchMainTab 대체)
window.switchSubTab = function(region, secId) {
  // 클릭한 탭의 활성화 상태 변경
  document.querySelectorAll(`#tabs-${region} .sub-tab`).forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('onclick').includes(secId)) {
      btn.classList.add('active');
    }
  });

  // 해당 영역(글로벌, 미국 등) 내부의 섹션만 끄고 대상 섹션 켜기
  document.querySelectorAll(`#area-${region} .sec`).forEach(sec => {
    sec.classList.remove('active');
  });
  
  const targetSec = $(secId);
  if (targetSec) {
    targetSec.classList.add('active');
  }
};

function initThemeIcons() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  $("moon-icon").style.display = isDark ? "none" : "block";
  $("sun-icon").style.display = isDark ? "block" : "none";
}

function toggleTheme() {
  const el = document.documentElement;
  const isDark = el.getAttribute("data-theme") === "dark";
  if (isDark) { el.removeAttribute("data-theme"); localStorage.setItem("theme", "light"); } 
  else { el.setAttribute("data-theme", "dark"); localStorage.setItem("theme", "dark"); }
  initThemeIcons();
  
  if (activeIdxSym) doChart(activeIdxSym, activeIdxRange, "idx");
  if (activeUsTopSym) doChart(activeUsTopSym, activeUsTopRange, "us-top");
  if (activeKrTopSym) doChart(activeKrTopSym, activeKrTopRange, "kr-top");
  if (activeFxSym) doChart(activeFxSym, activeFxRange, "fx");
  if (lastHmMap && Object.keys(lastHmMap).length > 0) drawHM(lastHmMap, lastHmClosed);
  doLoadFG();
}

// 💡 갱신 주기 뱃지(알약 디자인) 업데이트 로직
function updateSyncBadges() {
  document.querySelectorAll(".badge-sync").forEach(badge => {
    const mkt = badge.getAttribute("data-market");
    badge.className = "badge-sync"; // 기본 클래스 리셋
    
    if (!isMarketOpen(mkt)) {
      badge.classList.add('closed');
      badge.innerHTML = "⏸ 장마감";
      return;
    }
    
    badge.classList.add('level-' + globalBoostLevel);
    const txt = globalBoostLevel === 1 ? "6초 갱신 중" : globalBoostLevel === 2 ? "3초 갱신 중" : "10초 갱신 중";
    const icon = globalBoostLevel === 1 ? "🚀" : globalBoostLevel === 2 ? "🔥" : "⚡";
    badge.innerHTML = `${icon} ${txt}`;
  });
}

function dotHtml(cls) { return `<span class="dot ${cls}"></span>`; }

function forceSleepDots(listIds) {
  if (!Array.isArray(listIds)) listIds = [listIds];
  listIds.forEach(listId => {
    const el = $(listId);
    if (!el) return;
    el.querySelectorAll(".dot").forEach(dot => dot.className = "dot dot-sleep");
  });
}

function renderRow(id, price, prev, symObj, mcStr, mcVal, explicitChg, explicitPct) {
  const el = $(id);
  if (!el) return;

  const chg = explicitChg !== undefined ? explicitChg : price - prev;
  const pct = explicitPct !== undefined ? explicitPct : (prev ? (chg / Math.abs(prev)) * 100 : 0);
  const isVix = symObj && symObj.special === "vix";
  const cls = isVix ? (chg > 0 ? "dn" : chg < 0 ? "up" : "fl") : (chg > 0 ? "up" : chg < 0 ? "dn" : "fl");
  const arrow = chg > 0 ? "▲" : chg < 0 ? "▼" : "─";
  const vc = isVix ? (price < 15 ? "vix-lo" : price < 25 ? "vix-md" : "vix-hi") : "";
  const d = symObj && symObj.d !== undefined ? symObj.d : 2;
  const raw = (chg >= 0 ? "+" : "") + fmt(chg, d);
  const valStr = symObj ? symObj.fmt(price) : fmt(price, 1);

  const isInitial = _prev[id] === undefined;
  const changed = !isInitial && _prev[id] !== price;
  let dotClass = "dot-sleep";

  if (isInitial) {
    _lastUpdated[id] = 0;
    dotClass = "dot-load";
  } else if (changed) {
    _lastUpdated[id] = Date.now();
    dotClass = "dot-live-" + globalBoostLevel;
  } else if (Date.now() - _lastUpdated[id] < 15000 && _lastUpdated[id] !== 0) {
    dotClass = "dot-live-" + globalBoostLevel;
  }

  const lblEl = el.querySelector(".lbl");
  const cleanInner = lblEl ? lblEl.innerHTML.replace(/<span class="dot.*?<\/span>/g, "") : "";
  const mcHtml = mcStr ? `<div class="mc">${mcStr}</div>` : "";

  el.innerHTML = `<div class="lbl">${dotHtml(dotClass)}${cleanInner}</div>${mcHtml}<div class="val ${vc}">${valStr}</div><div class="chg"><span class="pct ${cls}">${arrow} ${fmt(Math.abs(pct), 2)}%</span><span class="raw ${cls}">${raw}</span></div>`;
  if (mcVal !== undefined) el.dataset.mc = mcVal;

  if (changed) {
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
    el.addEventListener("animationend", () => el.classList.remove("flash"), { once: true });
    if (globalBoostLevel === 2 && prev !== undefined && prev !== price) {
      const valEl = el.querySelector(".val");
      if (valEl) animateValue(valEl, prev, price, 400, v => symObj ? symObj.fmt(v) : fmt(v, 1));
    }
  }
  _prev[id] = price;
}

function sortListDesc(listId) {
  const container = $(listId);
  if (!container) return;
  const rows = Array.from(container.querySelectorAll(".row"));
  rows.sort((a, b) => (parseFloat(b.dataset.mc) || 0) - (parseFloat(a.dataset.mc) || 0));
  rows.forEach(r => container.appendChild(r));
}


/* =========================================================================
   3. API Fetch 로직 (Data Fetching)
   ========================================================================= */

function doLoadIdx() {
  fetch("quotes.php?syms=" + encodeURIComponent(IDX_SYMS))
    .then(r => r.json())
    .then(j => {
      if (j && j.quoteResponse && j.quoteResponse.result) {
        const map = {};
        j.quoteResponse.result.forEach(q => { map[q.symbol] = q; });
        IDX.forEach(s => {
          const q = map[s.sym];
          if (q && q.regularMarketPrice) {
            const p = q.regularMarketPrice;
            const pv = q.regularMarketPreviousClose || p;
            renderRow(s.id, p, pv, s, null, null, q.regularMarketChange, q.regularMarketChangePercent);
          } else fetchFallbackDirect(s);
        });
      } else IDX.forEach(fetchFallbackDirect);
    }).catch(() => IDX.forEach(fetchFallbackDirect));
}

function doLoadBatchedTop10() {
  fetch("quotes.php?syms=" + encodeURIComponent(BATCH_TOP_SYMS))
    .then(r => r.json())
    .then(j => {
      if (j && j.quoteResponse && j.quoteResponse.result) {
        const map = {};
        j.quoteResponse.result.forEach(q => { map[q.symbol] = q; });
        const processArr = (arr, listId) => {
          arr.forEach(s => {
            const q = map[s.sym];
            if (q && q.regularMarketPrice) {
              const p = q.regularMarketPrice;
              const pv = q.regularMarketPreviousClose || p;
              const mc = q.marketCap || 0;
              const cur = s.sym.indexOf(".KS") > -1 ? "KRW" : "USD";
              renderRow(s.id, p, pv, s, fmtMC(mc, cur), mc, q.regularMarketChange, q.regularMarketChangePercent);
            } else fetchFallbackDirect(s);
          });
          sortListDesc(listId);
        };
        processArr(US_TOP10, "us-top-list");
        processArr(KR_TOP10, "kr-top-list");
      } else {
        US_TOP10.forEach(fetchFallbackDirect); KR_TOP10.forEach(fetchFallbackDirect);
      }
    }).catch(() => { US_TOP10.forEach(fetchFallbackDirect); KR_TOP10.forEach(fetchFallbackDirect); });
}

function doLoadFX() {
  fetch("quotes.php?syms=" + encodeURIComponent(FX_SYMS))
    .then(r => r.json())
    .then(j => {
      if (j && j.quoteResponse && j.quoteResponse.result) {
        const map = {};
        j.quoteResponse.result.forEach(q => { map[q.symbol] = q; });
        FX.forEach(s => {
          const q = map[s.sym];
          if (q && q.regularMarketPrice) {
            const mult = s.mult || 1;
            const p = q.regularMarketPrice * mult;
            const pv = (q.regularMarketPreviousClose || q.regularMarketPrice) * mult;
            renderRow(s.id, p, pv, s, null, null, (q.regularMarketChange || 0) * mult, q.regularMarketChangePercent || 0);
          } else fetchFallbackDirect(s);
        });
      } else FX.forEach(fetchFallbackDirect);
    }).catch(() => FX.forEach(fetchFallbackDirect));
}

function fetchFallbackDirect(s) {
  const rg = s.sym.indexOf(".KS") > -1 || s.sym.indexOf(".KQ") > -1 ? "10d" : "5d";
  fetch("chart.php?sym=" + encodeURIComponent(s.sym) + "&iv=1d&rg=" + rg)
    .then(r => r.ok ? r.json() : null)
    .then(j => {
      if (!j) return;
      const res = j.chart && j.chart.result && j.chart.result[0];
      if (!res) return;
      const m = res.meta, p = m.regularMarketPrice, pv = m.previousClose || m.chartPreviousClose;
      if (p && pv) renderRow(s.id, p * (s.mult || 1), pv * (s.mult || 1), s);
    }).catch(() => {});
}


/* =========================================================================
   4. 차트 (Chart.js), 히트맵 (D3.js), 게이지 렌더링 로직
   ========================================================================= */

let CJS = false, CJScbs = [];
let activeIdxSym = null, activeIdxRange = "1D", idxChartInst = null;
let activeUsTopSym = null, activeUsTopRange = "1D", usTopChartInst = null;
let activeKrTopSym = null, activeKrTopRange = "1D", krTopChartInst = null;
let activeFxSym = null, activeFxRange = "1D", fxChartInst = null;

const hLinePlugin = {
  id: "hline",
  beforeDraw: (chart) => {
    const pc = chart.config.options.plugins.hline.val;
    if (pc == null) return;
    const { ctx, scales: { y: yAxis, x: xAxis } } = chart;
    const y = yAxis.getPixelForValue(pc);
    if (y > yAxis.bottom || y < yAxis.top) return;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(xAxis.left, y);
    ctx.lineTo(xAxis.right, y);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = getCssVar("--t4");
    ctx.stroke();
    ctx.fillStyle = getCssVar("--t4");
    ctx.font = "10px Pretendard";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("전일종가", xAxis.left + 6, y - 4);
    ctx.restore();
  },
};

function loadCJS(cb) {
  if (CJS) return cb();
  CJScbs.push(cb);
  if (CJScbs.length > 1) return;
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
  s.onload = () => { CJS = true; CJScbs.forEach(f => f()); CJScbs = []; };
  document.head.appendChild(s);
}

function insertChart(rowId, areaId) {
  const el = $(areaId), row = $(rowId);
  if (row && row.parentNode) row.parentNode.insertBefore(el, row.nextSibling);
}

function clickIdx(i) { handleRowClick(IDX[i], 'idx-list', 'idx-us-list', 'idx-kr-list', 'idx', activeIdxSym, v => activeIdxSym = v, activeIdxRange); }
function clickUsTop(i) { handleRowClick(US_TOP10[i], 'us-top-list', null, null, 'us-top', activeUsTopSym, v => activeUsTopSym = v, activeUsTopRange); }
function clickKrTop(i) { handleRowClick(KR_TOP10[i], 'kr-top-list', null, null, 'kr-top', activeKrTopSym, v => activeKrTopSym = v, activeKrTopRange); }
function clickFx(i) { handleRowClick(FX[i], 'fx-list', null, null, 'fx', activeFxSym, v => activeFxSym = v, activeFxRange); }

function handleRowClick(s, list1, list2, list3, type, currentActive, setActive, range) {
  const selectors = [`#${list1} .row`];
  if(list2) selectors.push(`#${list2} .row`);
  if(list3) selectors.push(`#${list3} .row`);
  document.querySelectorAll(selectors.join(",")).forEach(r => r.classList.remove("on"));
  
  if (currentActive && currentActive.id === s.id) {
    setActive(null);
    $(`${type}-chart-area`).style.display = "none";
    return;
  }
  setActive(s);
  $(s.id).classList.add("on");
  insertChart(s.id, `${type}-chart-area`);
  $(`${type}-chart-area`).style.display = "block";
  doChart(s, range, type);
}

function setIdxRange(r) { activeIdxRange = r; updateRangeUI('idx', r, activeIdxSym); }
function setUsTopRange(r) { activeUsTopRange = r; updateRangeUI('us-top', r, activeUsTopSym); }
function setKrTopRange(r) { activeKrTopRange = r; updateRangeUI('kr-top', r, activeKrTopSym); }
function setFxRange(r) { activeFxRange = r; updateRangeUI('fx', r, activeFxSym); }

function updateRangeUI(type, r, activeSym) {
  document.querySelectorAll(`#${type}-chart-area .rbtn`).forEach(b => b.classList.toggle("on", b.dataset.r === r));
  if (activeSym) doChart(activeSym, r, type);
}

function doChart(s, range, type) {
  const er = effRange(s, range);
  $(`${type}-chart-nm`).textContent = s.nm;
  const note = $(`${type}-chart-note`);
  note.style.display = s.no1D && range === "1D" ? "block" : "none";
  note.textContent = "※ 장중 1D 미지원 — 1주(1W) 기준 표시";
  $(`${type}-chart-perf`).textContent = "";

  const wrap = $(`${type}-chart-area`).querySelector(".canvas-wrap");
  const cKey = `ch3_${s.sym}_${er}`;

  try {
    const cc = localStorage.getItem(cKey);
    if (cc) {
      const co = JSON.parse(cc);
      if (Date.now() - co.t < (CTTL[er] || 3600) * 1000) return drawChart(s, er, co.d, wrap, type);
    }
  } catch (e) {}

  wrap.innerHTML = '<div class="chart-ld">불러오는 중...</div>';
  const rm = RM[er] || RM["1Y"];
  
  fetch(`chart.php?sym=${encodeURIComponent(s.sym)}&iv=${rm[0]}&rg=${rm[1]}`)
    .then(r => r.ok ? r.json() : null)
    .then(j => {
      if (!j) return wrap.innerHTML = '<div class="chart-er">데이터 없음</div>';
      try { localStorage.setItem(cKey, JSON.stringify({ t: Date.now(), d: j })); } catch (e) {}
      drawChart(s, er, j, wrap, type);
    })
    .catch(() => wrap.innerHTML = `<div class="chart-er">데이터를 불러올 수 없습니다<br><button onclick="doChart(window.active${type.replace('-','')}Sym, '${range}', '${type}')" style="margin-top:10px;font-size:12px;color:#1a6fd4;background:none;border:none;cursor:pointer;font-weight:600;">↻ 다시 시도</button></div>`);
}

function drawChart(s, range, j, wrap, type) {
  const res = j.chart && j.chart.result && j.chart.result[0];
  if (!res) return wrap.innerHTML = '<div class="chart-er">데이터 없음</div>';

  const meta = res.meta, prevClose = meta.previousClose || meta.chartPreviousClose;
  const ts = res.timestamp || [], cl = res.indicators.quote[0].close || [];
  const labels = [], vals = [], mult = s.mult || 1;

  for (let i = 0; i < ts.length; i++) {
    if (cl[i] != null) { labels.push(new Date(ts[i] * 1000)); vals.push(cl[i] * mult); }
  }
  if (!vals.length) return wrap.innerHTML = '<div class="chart-er">데이터 없음</div>';

  let fi = 0; while (fi < vals.length - 1 && vals[fi] <= 0) fi++;
  const first = vals[fi], last = vals[vals.length - 1];
  const is1D = range === "1D";
  let pC = is1D ? prevClose * mult : first; if (!pC || pC <= 0) pC = first;

  const diff = last - pC, pct = pC > 0 ? (diff / Math.abs(pC)) * 100 : 0;
  const isUp = diff >= 0, isVix = s.special === "vix";
  const col = isVix ? (isUp ? "#ef5350" : "#26a69a") : (isUp ? "#26a69a" : "#ef5350");
  const absStr = fmt(Math.abs(diff), s.d !== undefined ? s.d : 2);
  $(`${type}-chart-perf`).innerHTML = `<span style="color:${col}">${isUp ? "▲" : "▼"} ${fmt(Math.abs(pct), 2)}% (${isUp ? "+" : "-"}${absStr})</span>`;

  const allV = [...vals]; if (is1D && pC) allV.push(pC);
  const vMin = Math.min(...allV), vMax = Math.max(...allV), vPad = (vMax - vMin) * 0.05;

  const pRadii = [], tickLabels = [], hitCols = [];
  for (let k = 0; k < labels.length; k++) {
    const d = labels[k];
    const hr = d.getHours(), mo = d.getMonth(), dy = d.getDate(), yr = d.getFullYear();
    const nextD = k < labels.length - 1 ? labels[k + 1] : null;
    let mark = false, txt = "";

    if (range === "1D") {
      const prevD = k > 0 ? labels[k - 1] : null;
      if (!prevD || prevD.getHours() !== hr) { mark = true; txt = String(hr).padStart(2, "0") + ":00"; }
    } else if (range === "1W") {
      const prevD = k > 0 ? labels[k - 1] : null;
      if (!prevD || prevD.getDate() !== dy) { mark = true; txt = (mo + 1) + "/" + dy; }
    } else if (range === "1M") {
      if (!nextD || nextD.getDay() < d.getDay() || nextD.getTime() - d.getTime() > 172800000) { mark = true; txt = (mo + 1) + "/" + dy; }
    } else if (range === "6M" || range === "1Y") {
       const period = range === "6M" ? 1 : 3;
       if (!nextD || Math.floor(mo / period) !== Math.floor(nextD.getMonth() / period)) { mark = true; txt = (mo + 1) + "월"; }
    } else {
        if (!nextD || nextD.getFullYear() !== yr) { mark = true; txt = yr + "년"; }
    }

    pRadii.push(mark ? 3.5 : 0);
    tickLabels.push(txt);
    hitCols.push(col);
  }

  loadCJS(() => {
    wrap.innerHTML = `<canvas id="${type}-canvas"></canvas>`;
    let inst = type === "idx" ? idxChartInst : type === "fx" ? fxChartInst : type === "us-top" ? usTopChartInst : krTopChartInst;
    if (inst) inst.destroy();

    const chartGridColor = getCssVar("--chart-grid"), chartTextColor = getCssVar("--t4"), isFx = !!s.mult;

    const newInst = new Chart($(`${type}-canvas`).getContext("2d"), {
      type: "line", plugins: [hLinePlugin],
      data: {
        labels,
        datasets: [{
          data: vals, borderColor: col, borderWidth: 2.5, fill: true,
          backgroundColor: ctx => {
            const ca = ctx.chart.chartArea; if (!ca) return col + "10";
            const g = ctx.chart.ctx.createLinearGradient(0, ca.top, 0, ca.bottom);
            g.addColorStop(0, col + "28"); g.addColorStop(1, col + "00"); return g;
          },
          pointRadius: pRadii, pointBackgroundColor: "var(--box-bg)", pointBorderColor: hitCols, pointBorderWidth: 2, pointHoverRadius: 6, tension: 0.2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false }, hline: { val: is1D ? pC : null },
          tooltip: {
            mode: "index", intersect: false,
            callbacks: {
              title: it => {
                const d = labels[it[0].dataIndex]; if (!d) return "";
                const hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0");
                return range === "1D" ? `${hh}:${mm}` : range === "1W" ? `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}` : `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
              },
              label: it => s.fmt(it.parsed.y)
            }
          }
        },
        scales: {
          x: {
            grid: { display: true, drawOnChartArea: true, color: ctx => tickLabels[ctx.index] ? chartGridColor : "transparent", drawTicks: false },
            ticks: { autoSkip: false, maxRotation: 0, align: "center", font: { family: "Pretendard", size: 10 }, color: chartTextColor, callback: (val, i) => tickLabels[i] || null },
            border: { display: false }
          },
          y: {
            position: "right", suggestedMin: vMin - vPad, suggestedMax: vMax + vPad, grid: { color: chartGridColor },
            ticks: { font: { family: "Pretendard", size: 10 }, color: chartTextColor, callback: v => (s.special === "vix" || s.special === "dxy") ? fmt(v, 1) : isFx ? fmt(v, 0) : v >= 10000 ? (v / 1000).toFixed(0) + "K" : fmt(v, 0) },
            border: { display: false }
          }
        },
        animation: { duration: 300 }
      }
    });

    if (type === "idx") idxChartInst = newInst; else if (type === "fx") fxChartInst = newInst; else if (type === "us-top") usTopChartInst = newInst; else krTopChartInst = newInst;
  });
}

// === F&G 영역 ===
const ZONES = [
  { kr: "극도의 공포", color: "#ef5350", from: 0, to: 25 },
  { kr: "공포", color: "#ff9800", from: 25, to: 45 },
  { kr: "중립", color: "#787b86", from: 45, to: 55 },
  { kr: "탐욕", color: "#4caf50", from: 55, to: 75 },
  { kr: "극도의 탐욕", color: "#26a69a", from: 75, to: 101 }
];
let fgCh = null;
function getZ(s) { return ZONES.find(z => s >= z.from && s < z.to) || ZONES[4]; }

function gauge(score) {
  let cx = 140, cy = 105, R = 88, sw = 11, gap = 0.018, p = "";
  ZONES.forEach(z => {
    let a1 = Math.PI * (z.from / 100) + gap, a2 = Math.PI * (z.to / 100) - gap;
    let sx = cx - R * Math.cos(a1), sy = cy - R * Math.sin(a1), ex = cx - R * Math.cos(a2), ey = cy - R * Math.sin(a2);
    p += `<path d="M${sx.toFixed(2)},${sy.toFixed(2)} A${R},${R} 0 0 1 ${ex.toFixed(2)},${ey.toFixed(2)}" fill="none" stroke="${z.color}" stroke-width="${sw}" stroke-linecap="round" opacity="0.15"/>`;
    let cap = Math.min(score, z.to);
    if (cap > z.from) {
      let fa1 = Math.PI * (z.from / 100) + gap, fa2 = Math.PI * (cap / 100) - (score <= z.to ? gap : 0);
      if (fa2 > fa1) {
        let a = cx - R * Math.cos(fa1), b = cy - R * Math.sin(fa1), c = cx - R * Math.cos(fa2), d = cy - R * Math.sin(fa2);
        p += `<path d="M${a.toFixed(2)},${b.toFixed(2)} A${R},${R} 0 0 1 ${c.toFixed(2)},${d.toFixed(2)}" fill="none" stroke="${z.color}" stroke-width="${sw}" stroke-linecap="round"/>`;
      }
    }
  });
  let na = Math.PI * (score / 100), zn = getZ(score), nx = (cx - 70 * Math.cos(na)).toFixed(2), ny = (cy - 70 * Math.sin(na)).toFixed(2);
  return `<svg class="gsvg" viewBox="0 0 280 112" xmlns="http://www.w3.org/2000/svg">${p}<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${zn.color}" stroke-width="2.5" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="6" fill="${zn.color}"/><circle cx="${cx}" cy="${cy}" r="3" fill="var(--bg)"/></svg>`;
}

function segbar(score) {
  let zn = getZ(score), h = '<div class="segbar">';
  ZONES.forEach(z => { h += `<div class="seg${z === zn ? ' on' : ''}" style="background:${z.color}"></div>`; });
  return h + "</div>";
}

function renderFG(score, prev, hist) {
  let zn = getZ(score), diff = score - prev;
  let html = `<div class="gw">${gauge(score)}<div class="gends"><span class="gend">공포</span><span class="gend">탐욕</span></div></div>` +
             `<div class="sb"><div class="sb-n" style="color:${zn.color}">${score}</div><div class="sb-l" style="color:${zn.color}">${zn.kr}</div>` +
             `<div class="sb-c">전일 대비 ${diff >= 0 ? '+' : ''}${diff}&ensp;·&ensp;전일 ${prev}</div></div>${segbar(score)}`;
  if (hist && hist.length) html += '<div class="fg-chart-wrap"><canvas id="fg-cv"></canvas></div>';
  $("fg-body").innerHTML = html;
  if (hist && hist.length) drawFGChart(hist, zn.color);
}

function drawFGChart(hist, color) {
  loadCJS(() => {
    let cv = $("fg-cv"); if (!cv) return;
    if (fgCh) { fgCh.destroy(); fgCh = null; }
    let labels = [], vals = [];
    hist.forEach(d => { labels.push(new Date(d.x)); vals.push(parseFloat(d.y)); });
    
    fgCh = new Chart(cv.getContext("2d"), {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          data: vals, borderColor: color, borderWidth: 1.5, fill: true,
          backgroundColor: ctx => {
            let ca = ctx.chart.chartArea; if (!ca) return color + "10";
            let g = ctx.chart.ctx.createLinearGradient(0, ca.top, 0, ca.bottom);
            g.addColorStop(0, color + "30"); g.addColorStop(1, color + "00"); return g;
          }, pointRadius: 0, tension: 0.3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: it => { let d = labels[it[0].dataIndex]; return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; }, label: it => `지수: ${it.parsed.y.toFixed(0)} (${getZ(Math.round(it.parsed.y)).kr})` } } },
        scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 6, font: { family: "Pretendard", size: 10 }, color: getCssVar("--t4"), callback: (v, i) => { let d = labels[i]; return d ? `${d.getMonth() + 1}/${d.getDate()}` : ""; } }, border: { display: false } }, y: { min: 0, max: 100, position: "right", grid: { color: getCssVar("--chart-grid") }, ticks: { stepSize: 25, font: { family: "Pretendard", size: 10 }, color: getCssVar("--t4"), callback: v => v === 0 ? "공포" : v === 50 ? "중립" : v === 100 ? "탐욕" : v }, border: { display: false } } }, animation: { duration: 300 }
      }
    });
  });
}

function doLoadFG() {
  fetch("quotes.php?fg=1").then(r => r.ok ? r.json() : null).then(j => {
    if (!j || j.error || !j.fear_and_greed) return renderFGErr();
    let fg = j.fear_and_greed, hist = (j.fear_and_greed_historical && j.fear_and_greed_historical.data) || null;
    renderFG(Math.round(fg.score), Math.round(fg.previous_close), hist);
  }).catch(renderFGErr);
}
function renderFGErr() { $("fg-body").innerHTML = '<div class="fg-er"><div class="fg-er-t">데이터를 불러올 수 없습니다</div><button class="fg-retry" onclick="doLoadFG()">다시 시도 ↻</button></div>'; }

// === 히트맵 영역 ===
let HM = [
  { name: "Technology", cap: 16000, stocks: [{ s: "AAPL", cap: 3000 }, { s: "MSFT", cap: 3000 }, { s: "NVDA", cap: 2800 }, { s: "AVGO", cap: 600 }, { s: "ORCL", cap: 350 }, { s: "ADBE", cap: 250 }, { s: "CRM", cap: 280 }, { s: "AMD", cap: 260 }, { s: "QCOM", cap: 180 }, { s: "TXN", cap: 160 }, { s: "INTC", cap: 130 }, { s: "IBM", cap: 160 }, { s: "NOW", cap: 150 }, { s: "INTU", cap: 170 }, { s: "AMAT", cap: 160 }, { s: "MU", cap: 130 }, { s: "PANW", cap: 100 }] },
  { name: "Communication", cap: 7000, stocks: [{ s: "GOOGL", cap: 2000 }, { s: "META", cap: 1200 }, { s: "NFLX", cap: 250 }, { s: "TMUS", cap: 190 }, { s: "DIS", cap: 200 }, { s: "VZ", cap: 160 }, { s: "T", cap: 120 }, { s: "EA", cap: 40 }, { s: "CMCSA", cap: 170 }, { s: "WBD", cap: 30 }, { s: "SIRI", cap: 20 }, { s: "FOXA", cap: 20 }, { s: "CHTR", cap: 50 }, { s: "LYV", cap: 25 }, { s: "TTWO", cap: 25 }] },
  { name: "Cons. Cyclical", cap: 6500, stocks: [{ s: "AMZN", cap: 1900 }, { s: "TSLA", cap: 600 }, { s: "HD", cap: 350 }, { s: "MCD", cap: 200 }, { s: "LOW", cap: 150 }, { s: "NKE", cap: 120 }, { s: "SBUX", cap: 100 }, { s: "TJX", cap: 110 }, { s: "GM", cap: 50 }, { s: "F", cap: 45 }, { s: "BKNG", cap: 120 }, { s: "MAR", cap: 70 }, { s: "CMG", cap: 75 }, { s: "ORLY", cap: 60 }, { s: "AZO", cap: 50 }] },
  { name: "Healthcare", cap: 6000, stocks: [{ s: "LLY", cap: 700 }, { s: "UNH", cap: 450 }, { s: "JNJ", cap: 350 }, { s: "ABBV", cap: 300 }, { s: "MRK", cap: 280 }, { s: "ABT", cap: 190 }, { s: "PFE", cap: 150 }, { s: "AMGN", cap: 140 }, { s: "GILD", cap: 90 }, { s: "CVS", cap: 70 }, { s: "ISRG", cap: 130 }, { s: "SYK", cap: 120 }, { s: "VRTX", cap: 100 }, { s: "REGN", cap: 100 }, { s: "BSX", cap: 90 }] },
  { name: "Financial", cap: 5500, stocks: [{ s: "BRK-B", cap: 850 }, { s: "JPM", cap: 550 }, { s: "V", cap: 500 }, { s: "MA", cap: 400 }, { s: "BAC", cap: 300 }, { s: "WFC", cap: 220 }, { s: "MS", cap: 160 }, { s: "GS", cap: 150 }, { s: "C", cap: 120 }, { s: "AXP", cap: 160 }, { s: "SPGI", cap: 130 }, { s: "BLK", cap: 110 }, { s: "SCHW", cap: 120 }, { s: "PGR", cap: 110 }, { s: "CB", cap: 100 }] },
  { name: "Cons. Defensive", cap: 4000, stocks: [{ s: "WMT", cap: 500 }, { s: "PG", cap: 350 }, { s: "COST", cap: 300 }, { s: "KO", cap: 250 }, { s: "PEP", cap: 220 }, { s: "PM", cap: 150 }, { s: "MO", cap: 80 }, { s: "CL", cap: 70 }, { s: "KR", cap: 40 }, { s: "SYY", cap: 40 }, { s: "KMB", cap: 40 }, { s: "EL", cap: 50 }, { s: "GIS", cap: 40 }, { s: "TGT", cap: 70 }, { s: "HSY", cap: 40 }] },
  { name: "Industrials", cap: 3800, stocks: [{ s: "GE", cap: 180 }, { s: "CAT", cap: 170 }, { s: "RTX", cap: 140 }, { s: "HON", cap: 120 }, { s: "BA", cap: 100 }, { s: "UNP", cap: 140 }, { s: "LMT", cap: 110 }, { s: "DE", cap: 110 }, { s: "FDX", cap: 65 }, { s: "UPS", cap: 120 }, { s: "EMR", cap: 60 }, { s: "ETN", cap: 110 }, { s: "CMI", cap: 40 }, { s: "PH", cap: 70 }, { s: "PCAR", cap: 60 }] },
  { name: "Energy", cap: 2800, stocks: [{ s: "XOM", cap: 450 }, { s: "CVX", cap: 280 }, { s: "COP", cap: 130 }, { s: "SLB", cap: 70 }, { s: "EOG", cap: 70 }, { s: "PSX", cap: 60 }, { s: "VLO", cap: 50 }, { s: "OXY", cap: 55 }, { s: "MPC", cap: 70 }, { s: "HAL", cap: 30 }, { s: "BKR", cap: 30 }, { s: "WMB", cap: 45 }, { s: "HES", cap: 40 }, { s: "KMI", cap: 40 }, { s: "TRGP", cap: 45 }] },
  { name: "Utilities", cap: 1800, stocks: [{ s: "NEE", cap: 120 }, { s: "DUK", cap: 75 }, { s: "SO", cap: 75 }, { s: "SRE", cap: 45 }, { s: "AEP", cap: 45 }, { s: "ED", cap: 30 }, { s: "D", cap: 40 }, { s: "PEG", cap: 30 }, { s: "EXC", cap: 35 }, { s: "XEL", cap: 30 }, { s: "WEC", cap: 25 }, { s: "ES", cap: 20 }] },
  { name: "Real Estate", cap: 1500, stocks: [{ s: "PLD", cap: 120 }, { s: "AMT", cap: 90 }, { s: "EQIX", cap: 80 }, { s: "WELL", cap: 50 }, { s: "PSA", cap: 45 }, { s: "SPG", cap: 50 }, { s: "O", cap: 45 }, { s: "DLR", cap: 45 }, { s: "CSGP", cap: 35 }, { s: "CCI", cap: 40 }] },
  { name: "Basic Materials", cap: 1500, stocks: [{ s: "LIN", cap: 200 }, { s: "SHW", cap: 80 }, { s: "FCX", cap: 70 }, { s: "APD", cap: 60 }, { s: "ECL", cap: 65 }, { s: "NEM", cap: 45 }, { s: "CTVA", cap: 40 }, { s: "NUE", cap: 45 }, { s: "DOW", cap: 40 }, { s: "DD", cap: 35 }] }
];
let HM_SYMS = HM.flatMap(s => s.stocks.map(t => t.s)).join(",");

function hmCol(pct, ok) {
  let isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if (!ok) return isDark ? "#334155" : "#cbd5e1";
  if (Math.abs(pct) < 0.05) return isDark ? "#1e293b" : "#f1f5f9";
  let t = Math.max(-1, Math.min(1, pct / 3.0)), a = Math.abs(t);
  if (isDark) {
    let br = 30, bg = 41, bb = 59;
    return t > 0 ? `rgb(${Math.round(br*(1-a)+16*a)},${Math.round(bg*(1-a)+185*a)},${Math.round(bb*(1-a)+129*a)})` : `rgb(${Math.round(br*(1-a)+239*a)},${Math.round(bg*(1-a)+68*a)},${Math.round(bb*(1-a)+68*a)})`;
  } else {
    let br = 241, bg = 245, bb = 249;
    return t > 0 ? `rgb(${Math.round(br*(1-a)+16*a)},${Math.round(bg*(1-a)+185*a)},${Math.round(bb*(1-a)+129*a)})` : `rgb(${Math.round(br*(1-a)+239*a)},${Math.round(bg*(1-a)+68*a)},${Math.round(bb*(1-a)+68*a)})`;
  }
}
function hmTxt(pct, ok) { if (!ok) return "var(--t4)"; return Math.abs(pct) > 1.2 ? "#fff" : (document.documentElement.getAttribute("data-theme") === "dark" ? "#cbd5e1" : "#1a1a1a"); }

let D3 = false, D3cbs = [], lastHmMap = {}, lastHmClosed = false, hmResizeTimer;
function loadD3(cb) {
  if (D3) return cb();
  D3cbs.push(cb);
  if (D3cbs.length > 1) return;
  let s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js";
  s.onload = () => { D3 = true; D3cbs.forEach(f => f()); D3cbs = []; }; document.head.appendChild(s);
}
window.addEventListener("resize", () => {
  clearTimeout(hmResizeTimer);
  hmResizeTimer = setTimeout(() => { if (Object.keys(lastHmMap).length > 0) drawHM(lastHmMap, lastHmClosed); }, 300);
});

function drawHM(qmap, closed) {
  lastHmMap = qmap; lastHmClosed = closed;
  loadD3(() => {
    let wrap = $("hm-wrap"), W = wrap.clientWidth || 320, H = Math.max(240, Math.round(W * 0.75));
    let root = d3.hierarchy({ name: "root", children: HM.map(sec => ({ name: sec.name, children: sec.stocks.map(st => { let q = qmap[st.s]; return { name: st.s, cap: st.cap, pct: q ? q.pct : 0, price: q ? q.price : null, ok: !!q }; }) })) }).sum(d => d.children ? 0 : (d.cap ? d.cap : 0)).sort((a, b) => b.value - a.value);
    d3.treemap().size([W, H]).paddingOuter(1).paddingTop(14).paddingInner(1).round(false)(root);
    
    let svg = d3.create("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%").attr("height", H).style("font-family", "Pretendard");
    svg.selectAll("g.hs").data(root.children).join("g").attr("class", "hs").call(g => {
      g.append("rect").attr("x", d => d.x0).attr("y", d => d.y0).attr("width", d => d.x1 - d.x0).attr("height", d => d.y1 - d.y0).attr("fill", "var(--rule)").attr("rx", 2);
      g.append("text").attr("x", d => d.x0 + 4).attr("y", d => d.y0 + 11).attr("font-size", 10).attr("font-weight", "700").attr("fill", "var(--t1)").each(function(d) { let av = d.x1 - d.x0 - 8; d3.select(this).text(av < 60 ? d.data.name.split(" ")[0] : d.data.name); });
    });
    
    let stG = svg.selectAll("g.ht").data(root.leaves()).join("g").attr("class", "ht");
    stG.append("rect").attr("x", d => d.x0).attr("y", d => d.y0).attr("width", d => Math.max(0, d.x1 - d.x0)).attr("height", d => Math.max(0, d.y1 - d.y0)).attr("fill", d => hmCol(d.data.pct, d.data.ok));
    stG.each(function(d) {
      let cw = d.x1 - d.x0 - 2, ch = d.y1 - d.y0 - 2; if (cw < 15 || ch < 8) return;
      let g = d3.select(this), mx = (d.x0 + d.x1) / 2, my = (d.y0 + d.y1) / 2, pct = d.data.pct, tc = hmTxt(pct, d.data.ok), fs = Math.max(6, Math.min(15, cw / 5)), sign = pct > 0 ? "+" : pct < 0 ? "" : " ";
      if (ch > 32 && cw > 35) {
        g.append("text").attr("x", mx).attr("y", my - 2).attr("text-anchor", "middle").attr("font-size", Math.min(fs, 13)).attr("font-weight", "700").attr("fill", tc).text(d.data.name);
        g.append("text").attr("x", mx).attr("y", my + Math.max(10, fs)).attr("text-anchor", "middle").attr("font-size", Math.max(6, fs - 3)).attr("fill", tc).attr("opacity", 0.88).text(d.data.ok ? sign + pct.toFixed(2) + "%" : "─");
      } else if (ch > 14 && cw > 24) {
        g.append("text").attr("x", mx).attr("y", my + 3).attr("text-anchor", "middle").attr("font-size", Math.max(6, fs - 2)).attr("font-weight", "700").attr("fill", tc).text(d.data.name);
      }
    });
    
    if (closed) {
      svg.append("rect").attr("x", 0).attr("y", 0).attr("width", W).attr("height", 20).attr("fill", "rgba(245,245,247,0.88)");
      svg.append("text").attr("x", 8).attr("y", 14).attr("font-size", 10).attr("font-weight", "700").attr("fill", "#828290").text("전일 종가 기준 (미국 장 마감)");
    }
    
    let tip = d3.select("body").selectAll(".hm-tip").data([0]).join("div").attr("class", "hm-tip").style("position", "fixed").style("background", "var(--t1)").style("color", "var(--bg)").style("font-size", "13px").style("padding", "7px 11px").style("border-radius", "7px").style("pointer-events", "none").style("display", "none").style("z-index", "9999").style("font-family", "Pretendard").style("font-variant-numeric", "tabular-nums").style("white-space", "nowrap").style("line-height", "1.7");
    stG.on("mousemove touchstart", (ev, d) => {
      let pct = d.data.pct, sign = pct > 0 ? "▲" : pct < 0 ? "▼" : "─", col = pct > 0 ? "#10b981" : pct < 0 ? "#ef4444" : "var(--t4)";
      let str = d.data.ok ? `${sign} ${Math.abs(pct).toFixed(2)}%` : (closed ? "종가 기준" : "─");
      tip.style("display", "block").html(`<b>${d.data.name}</b>&ensp;<span style="color:${col}">${str}</span>${d.data.price ? "<br>$" + fmt(d.data.price, 2) : ""}`);
      let ex = ev.touches ? ev.touches[0].clientX : ev.clientX, ey = ev.touches ? ev.touches[0].clientY : ev.clientY;
      tip.style("left", ex + 14 + "px").style("top", ey - 48 + "px");
    }).on("mouseleave touchend", () => tip.style("display", "none"));
    
    let old = wrap.querySelector("svg"); if (old) old.remove();
    let st = $("hm-st"); if (st) st.remove();
    wrap.appendChild(svg.node());
  });
}

function doLoadHM() {
  fetch("quotes.php?syms=" + encodeURIComponent(HM_SYMS)).then(r => r.ok ? r.json() : null).then(j => {
    if (!j) return showHMErr();
    let res = (j.quoteResponse && j.quoteResponse.result) || [], map = {}, nz = 0;
    res.forEach(q => { let p = q.regularMarketChangePercent || 0; if (Math.abs(p) > 0.001) nz++; map[q.symbol] = { pct: p, price: q.regularMarketPrice || null, ok: true }; });
    drawHM(map, res.length > 0 && nz === 0);
  }).catch(showHMErr);
}
function showHMErr() { let s = $("hm-st"); if (s) { s.textContent = "⚠ quotes.php 연동 오류"; s.className = "hm-er"; } }


/* =========================================================================
   5. 메인 실행 로직 & 스케줄링 (Main Logic)
   ========================================================================= */

function runSchedule(taskId, idLists, timeIds, type, fn, interval) {
  const exec = () => {
    updateSyncBadges();
    const isOpen = isMarketOpen(type);
    const tIds = Array.isArray(timeIds) ? timeIds : [timeIds];
    tIds.forEach(tid => { if($(tid)) $(tid).textContent = nowStr() + " 기준"; });

    if (isOpen) fn();
    else { fn(); forceSleepDots(idLists); }
  };

  exec();
  if (intervals[taskId]) clearInterval(intervals[taskId]);
  intervals[taskId] = setInterval(() => { if (!document.hidden) exec(); }, interval);
}

// 상단/하단 배너 동시 업데이트 로직
window.activateGlobalBoost = function(e) {
  if (e) e.stopPropagation();

  if (globalBoostLevel === 0) {
    globalBoostLevel = 1;
    alert("데이터 갱신 주기가 6초로 단축되었습니다! 🚀");
    document.querySelectorAll(".g-banner-title").forEach(el => el.textContent = "🚀 실시간 속도 향상 적용 중!");
    document.querySelectorAll(".g-banner-desc").forEach(el => el.textContent = "한 번 더 시청하시면 가장 빠른 3초 주기로 업데이트됩니다.");
    document.querySelectorAll(".g-banner-btn").forEach(btn => {
      btn.innerHTML = "▶ 한 번 더 보고 최고 속도 내기";
      btn.style.background = "#0284c7";
    });
  } else if (globalBoostLevel === 1) {
    globalBoostLevel = 2;
    alert("최고 속도 달성!\n갱신 속도가 3초로 단축되며 다이내믹 가격 효과가 적용됩니다 🔥");
    document.querySelectorAll(".boost-banner").forEach(banner => banner.style.display = "none");
  }

  const newInterval = globalBoostLevel === 1 ? 6000 : 3000;
  runSchedule("idx", ["idx-list", "idx-us-list", "idx-kr-list"], ["cy-idx-time", "cy-us-idx-time", "cy-kr-idx-time"], "global", doLoadIdx, newInterval);
  runSchedule("us-top", "us-top-list", "cy-us-top-time", "us", doLoadBatchedTop10, newInterval);
  runSchedule("kr-top", "kr-top-list", "cy-kr-top-time", "kr", () => {}, newInterval);
  runSchedule("fx", "fx-list", "cy-fx-time", "global", doLoadFX, newInterval);
};

window.isHmUnlocked = false;
window.unlockHeatmap = function(e) {
  if (e) e.stopPropagation();
  alert("광고 시청 완료!\n히트맵 잠금이 해제되었습니다 🔓");
  isHmUnlocked = true;
  if ($("hm-overlay")) $("hm-overlay").style.display = "none";
  if ($("hm-wrap")) {
    $("hm-wrap").style.filter = "none";
    $("hm-wrap").style.opacity = "1";
    $("hm-wrap").style.pointerEvents = "auto";
  }
  $("hm-st").textContent = "데이터 새로고침 중...";
  doLoadHM();
  
  if (intervals["hm"]) clearInterval(intervals["hm"]);
  intervals["hm"] = setInterval(() => {
    if (document.hidden) return;
    if (isMarketOpen("us")) doLoadHM();
    else { if ($("cy-hm-time")) $("cy-hm-time").textContent = nowStr() + " 기준"; }
  }, 30000);
};

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    if (isMarketOpen("global")) { doLoadIdx(); doLoadFX(); }
    if (isMarketOpen("us") || isMarketOpen("kr")) doLoadBatchedTop10();
  }
});

// 앱 초기화 실행
document.addEventListener("DOMContentLoaded", () => {
  initThemeIcons();
  if($("copy-t")) $("copy-t").textContent = "© 2025–" + new Date().getFullYear() + " MoneyScoop 제작. All rights reserved.";

  runSchedule("idx", ["idx-list", "idx-us-list", "idx-kr-list"], ["cy-idx-time", "cy-us-idx-time", "cy-kr-idx-time"], "global", doLoadIdx, 10000);
  runSchedule("us-top", "us-top-list", "cy-us-top-time", "us", doLoadBatchedTop10, 10000);
  runSchedule("kr-top", "kr-top-list", "cy-kr-top-time", "kr", () => {}, 10000);
  runSchedule("fx", "fx-list", "cy-fx-time", "global", doLoadFX, 10000);

  doLoadHM();
  doLoadFG();
  setInterval(doLoadFG, 12 * 60 * 60 * 1000);
});