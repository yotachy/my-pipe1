/* =========================================================================
   1. 데이터 변수 선언 및 기본 유틸리티 (Data & Utilities)
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

function getCssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function nowStr() { const d = new Date(); return (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }

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

// 💡 새로운 스마트 마켓 타임 감지 함수 (써머타임 자동 적용)
function getMarketState(type) {
  const d = new Date();
  // 미국 현지 시간(EST/EDT) 계산
  const nyTime = new Date(d.toLocaleString("en-US", {timeZone: "America/New_York"}));
  const day = nyTime.getDay();
  const h = nyTime.getHours();
  const m = nyTime.getMinutes();
  const t = h * 100 + m;

  if (type === "kr") {
    // 한국 시간 기준
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const kst = new Date(utc + 3600000 * 9);
    const kDay = kst.getDay();
    const kT = kst.getHours() * 100 + kst.getMinutes();
    
    if (kDay >= 1 && kDay <= 5) {
      if (kT >= 900 && kT <= 1530) return "REGULAR";
    }
    return "CLOSED";
  } 
  else if (type === "us") {
    if (day === 0 || day === 6) return "CLOSED"; // 주말 마감
    if (t >= 400 && t < 930) return "PRE"; // 프리마켓 (04:00 ~ 09:30)
    if (t >= 930 && t < 1600) return "REGULAR"; // 정규장 (09:30 ~ 16:00)
    if (t >= 1600 && t < 2000) return "POST"; // 애프터마켓 (16:00 ~ 20:00)
    return "CLOSED";
  } 
  else {
    // 글로벌/환율 (주말 제외 24시간)
    if (day === 0 || day === 6) return "CLOSED";
    return "REGULAR"; 
  }
}

// JSON 연동용 동적 배열
let IDX = [], CMD = [], US_TOP10 = [], KR_TOP10 = [], FX = [];
let IDX_SYMS = "", CMD_SYMS = "", BATCH_TOP_SYMS = "", FX_SYMS = "";

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

let cryptoMsgTimer;
window.showCryptoMsg = function(e) {
  e.preventDefault();
  const msg = document.getElementById('crypto-msg');
  if(!msg) return;
  msg.classList.add('show');
  clearTimeout(cryptoMsgTimer);
  cryptoMsgTimer = setTimeout(() => {
    msg.classList.remove('show');
  }, 2000);
};

// 💡 렌더링 시 빈 뱃지(<span class="ext-badge">)를 추가하여 나중에 PRE/POST를 넣음
function renderInitialRows(containerId, arr, clickHandlerName, hasMc = false, offset = 0) {
  const container = $(containerId);
  if(!container) return;
  container.innerHTML = '';
  
  arr.forEach((item, index) => {
    let row = document.createElement('div');
    row.className = 'row' + (hasMc ? ' has-mc' : '');
    row.id = item.id;
    row.onclick = () => window[clickHandlerName](offset + index);
    
    let flagHtml = item.flag ? `<img class="flag" src="${item.flag}" alt=""/>` : '';
    let mcHtml = hasMc ? `<div class="mc"></div>` : '';
    let descHtml = item.desc ? `<span class="info-icon" onclick="alert('${item.desc}'); event.stopPropagation();">i</span>` : '';
    
    row.innerHTML = `
      <div class="lbl">
        <div class="lbl-nm">${flagHtml}${item.nm}<span class="ext-badge"></span>${descHtml}</div>
      </div>
      ${mcHtml}
      <div class="sk sk-val"></div>
      <div class="sk sk-chg"></div>
    `;
    container.appendChild(row);
  });
}

window.toggleRegion = function(el) {
  const region = el.closest('.region-area');
  if (region) region.classList.toggle('collapsed');
};

window.switchSubTab = function(region, secId) {
  document.querySelectorAll(`#tabs-${region} .sub-tab`).forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('onclick').includes(secId)) btn.classList.add('active');
  });

  document.querySelectorAll(`#area-${region} .sec`).forEach(sec => sec.classList.remove('active'));
  
  const targetSec = $(secId);
  if (targetSec) targetSec.classList.add('active');
};

function initThemeIcons() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  $("moon-icon").style.display = isDark ? "none" : "block";
  $("sun-icon").style.display = isDark ? "block" : "none";
}

function toggleTheme() {
  const el = document.documentElement;
  if (el.getAttribute("data-theme") === "dark") { el.removeAttribute("data-theme"); localStorage.setItem("theme", "light"); } 
  else { el.setAttribute("data-theme", "dark"); localStorage.setItem("theme", "dark"); }
  initThemeIcons();
  
  if (activeIdxSym) doChart(activeIdxSym, activeIdxRange, "idx");
  if (activeCmdSym) doChart(activeCmdSym, activeCmdRange, "cmd"); 
  if (activeUsTopSym) doChart(activeUsTopSym, activeUsTopRange, "us-top");
  if (activeKrTopSym) doChart(activeKrTopSym, activeKrTopRange, "kr-top");
  if (activeFxSym) doChart(activeFxSym, activeFxRange, "fx");
  if (lastHmMap && Object.keys(lastHmMap).length > 0) renderAllHeatmaps(lastHmMap);
  doLoadFG();
}

// 💡 뱃지에 프리장/애프터장 상태 반영
function updateSyncBadges() {
  document.querySelectorAll(".badge-sync").forEach(badge => {
    const mkt = badge.getAttribute("data-market");
    badge.className = "badge-sync"; 
    
    const state = getMarketState(mkt);
    
    if (state === "CLOSED") {
      badge.classList.add('closed');
      badge.innerHTML = "⏸ 장마감";
      badge.onclick = null;
      return;
    }
    
    badge.classList.add('level-' + globalBoostLevel);
    
    let prefix = "";
    if (state === "PRE") prefix = "[프리장] ";
    if (state === "POST") prefix = "[애프터장] ";

    let txt, icon;
    if (globalBoostLevel === 0) {
      txt = prefix + "10초 (▶ 스피드 UP)"; 
      icon = "⚡";
      badge.onclick = window.activateGlobalBoost;
    } else if (globalBoostLevel === 1) {
      txt = prefix + "6초 (▶ MAX 속도)"; 
      icon = "🚀";
      badge.onclick = window.activateGlobalBoost;
    } else {
      txt = prefix + "3초 (최고속도)"; 
      icon = "🔥";
      badge.onclick = null; 
    }
    
    badge.innerHTML = `${icon} ${txt}`;
  });
}

function dotHtml(cls) { return `<span class="dot ${cls}"></span>`; }

function forceSleepDots(listIds) {
  if (!Array.isArray(listIds)) listIds = [listIds];
  listIds.forEach(listId => {
    const el = $(listId); if (!el) return;
    el.querySelectorAll(".dot").forEach(dot => dot.className = "dot dot-sleep");
  });
}

// 💡 UI 업데이트 시 프리/애프터 뱃지도 함께 제어
function renderRow(id, price, prev, symObj, mcStr, mcVal, explicitChg, explicitPct, extState = "") {
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
    _lastUpdated[id] = 0; dotClass = "dot-load";
  } else if (changed) {
    _lastUpdated[id] = Date.now(); dotClass = "dot-live-" + globalBoostLevel;
  } else if (Date.now() - _lastUpdated[id] < 15000 && _lastUpdated[id] !== 0) {
    dotClass = "dot-live-" + globalBoostLevel;
  }

  // 💡 기존 .lbl 내용을 보존하면서 점멸 도트만 교체
  const lblEl = el.querySelector(".lbl");
  const cleanInner = lblEl ? lblEl.innerHTML.replace(/<span class="dot.*?<\/span>/g, "") : "";
  const mcHtml = mcStr ? `<div class="mc">${mcStr}</div>` : "";

  el.innerHTML = `<div class="lbl">${dotHtml(dotClass)}${cleanInner}</div>${mcHtml}<div class="val ${vc}">${valStr}</div><div class="chg"><span class="pct ${cls}">${arrow} ${fmt(Math.abs(pct), 2)}%</span><span class="raw ${cls}">${raw}</span></div>`;
  if (mcVal !== undefined) el.dataset.mc = mcVal;

  // 💡 프리장/애프터장 뱃지 추가
  const extBadge = el.querySelector(".ext-badge");
  if (extBadge) {
    if (extState === "PRE") {
      extBadge.innerHTML = "PRE";
      extBadge.style.cssText = "font-size:9px; color:#f59e0b; border:1px solid #f59e0b; border-radius:3px; padding:1px 3px; margin-left:4px; line-height:1; vertical-align:middle;";
    } else if (extState === "POST") {
      extBadge.innerHTML = "POST";
      extBadge.style.cssText = "font-size:9px; color:#8b5cf6; border:1px solid #8b5cf6; border-radius:3px; padding:1px 3px; margin-left:4px; line-height:1; vertical-align:middle;";
    } else {
      extBadge.innerHTML = "";
      extBadge.style.cssText = "";
    }
  }

  if (changed) {
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
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

// 💡 야후에서 받아온 데이터 중 현재 상태에 맞는(Pre/Post) 데이터를 뽑아내는 헬퍼
function extractPriceData(q) {
  let p = q.regularMarketPrice;
  let pv = q.regularMarketPreviousClose || p;
  let chg = q.regularMarketChange || 0;
  let pct = q.regularMarketChangePercent || 0;
  let ext = "";

  const state = q.marketState;

  if ((state === "PRE" || state === "PREPRE") && q.preMarketPrice) {
    p = q.preMarketPrice;
    chg = q.preMarketChange || 0;
    pct = q.preMarketChangePercent || 0;
    ext = "PRE";
    pv = q.regularMarketPrice; 
  } else if ((state === "POST" || state === "POSTPOST" || state === "CLOSED") && q.postMarketPrice) {
    p = q.postMarketPrice;
    chg = q.postMarketChange || 0;
    pct = q.postMarketChangePercent || 0;
    ext = "POST";
    pv = q.regularMarketPrice;
  }
  return { p, pv, chg, pct, ext };
}

function doLoadIdx() {
  if(!IDX_SYMS) return;
  fetch("quotes.php?syms=" + encodeURIComponent(IDX_SYMS))
    .then(r => r.json())
    .then(j => {
      if (j && j.quoteResponse && j.quoteResponse.result) {
        const map = {};
        j.quoteResponse.result.forEach(q => { map[q.symbol] = q; });
        IDX.forEach(s => {
          const q = map[s.sym];
          if (q && q.regularMarketPrice) {
            const pd = extractPriceData(q);
            renderRow(s.id, pd.p, pd.pv, s, null, null, pd.chg, pd.pct, pd.ext);
          } else fetchFallbackDirect(s);
        });
      } else IDX.forEach(fetchFallbackDirect);
    }).catch(() => IDX.forEach(fetchFallbackDirect));
}

function doLoadCmd() {
  if(!CMD_SYMS) return;
  fetch("quotes.php?syms=" + encodeURIComponent(CMD_SYMS))
    .then(r => r.json())
    .then(j => {
      if (j && j.quoteResponse && j.quoteResponse.result) {
        const map = {};
        j.quoteResponse.result.forEach(q => { map[q.symbol] = q; });
        CMD.forEach(s => {
          const q = map[s.sym];
          if (q && q.regularMarketPrice) {
            const pd = extractPriceData(q);
            renderRow(s.id, pd.p, pd.pv, s, null, null, pd.chg, pd.pct, pd.ext);
          } else fetchFallbackDirect(s);
        });
      } else CMD.forEach(fetchFallbackDirect);
    }).catch(() => CMD.forEach(fetchFallbackDirect));
}

function doLoadBatchedTop10() {
  if(!BATCH_TOP_SYMS) return;
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
              const pd = extractPriceData(q);
              const mc = q.marketCap || 0;
              const cur = s.sym.indexOf(".KS") > -1 || s.sym.indexOf(".KQ") > -1 ? "KRW" : "USD";
              renderRow(s.id, pd.p, pd.pv, s, fmtMC(mc, cur), mc, pd.chg, pd.pct, pd.ext);
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
  if(!FX_SYMS) return;
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
            const pd = extractPriceData(q); // FX는 보통 PRE/POST가 없지만 통일성 유지
            const p = pd.p * mult;
            const pv = pd.pv * mult;
            renderRow(s.id, p, pv, s, null, null, pd.chg * mult, pd.pct, pd.ext);
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
let activeCmdSym = null, activeCmdRange = "1D", cmdChartInst = null; 
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

window.clickIdx = function(i) { handleRowClick(IDX[i], 'idx-list', 'idx-us-list', 'idx-kr-list', 'idx', activeIdxSym, v => activeIdxSym = v, activeIdxRange); }
window.clickCmd = function(i) { handleRowClick(CMD[i], 'cmd-list', null, null, 'cmd', activeCmdSym, v => activeCmdSym = v, activeCmdRange); } 
window.clickUsTop = function(i) { handleRowClick(US_TOP10[i], 'us-top-list', null, null, 'us-top', activeUsTopSym, v => activeUsTopSym = v, activeUsTopRange); }
window.clickKrTop = function(i) { handleRowClick(KR_TOP10[i], 'kr-top-list', null, null, 'kr-top', activeKrTopSym, v => activeKrTopSym = v, activeKrTopRange); }
window.clickFx = function(i) { handleRowClick(FX[i], 'fx-list', null, null, 'fx', activeFxSym, v => activeFxSym = v, activeFxRange); }

function handleRowClick(s, list1, list2, list3, type, currentActive, setActive, range) {
  if(!s) return;
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

window.setIdxRange = function(r) { activeIdxRange = r; updateRangeUI('idx', r, activeIdxSym); }
window.setCmdRange = function(r) { activeCmdRange = r; updateRangeUI('cmd', r, activeCmdSym); } 
window.setUsTopRange = function(r) { activeUsTopRange = r; updateRangeUI('us-top', r, activeUsTopSym); }
window.setKrTopRange = function(r) { activeKrTopRange = r; updateRangeUI('kr-top', r, activeKrTopSym); }
window.setFxRange = function(r) { activeFxRange = r; updateRangeUI('fx', r, activeFxSym); }

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
  
  let boundaries = [];
  for (let k = 0; k < labels.length; k++) {
    const d = labels[k];
    const hr = d.getHours(), mo = d.getMonth(), dy = d.getDate(), yr = d.getFullYear();
    const prevD = k > 0 ? labels[k - 1] : null;
    let isBoundary = false, txt = "";

    if (range === "1D") {
      if (!prevD || prevD.getHours() !== hr) { isBoundary = true; txt = hr + "시"; } 
    } else if (range === "1W") {
      if (!prevD || prevD.getDate() !== dy) { isBoundary = true; txt = (mo + 1) + "/" + dy; }
    } else if (range === "1M") {
      if (!prevD || (d.getDay() === 1 && prevD.getDay() !== 1) || (d.getTime() - prevD.getTime() > 4*86400000)) { 
        isBoundary = true; txt = (mo + 1) + "/" + dy; 
      }
    } else if (range === "6M" || range === "1Y") {
       const period = range === "6M" ? 1 : 2;
       if (!prevD || Math.floor(mo / period) !== Math.floor(prevD.getMonth() / period)) { 
           isBoundary = true; txt = (mo + 1) + "월"; 
       }
    } else {
        if (!prevD || prevD.getFullYear() !== yr) { isBoundary = true; txt = yr + "년"; }
    }
    if(isBoundary) boundaries.push({k, txt});
  }
  
  let step = Math.max(1, Math.ceil(boundaries.length / 6));
  let markSet = {};
  for(let i=0; i<boundaries.length; i+=step) {
      markSet[boundaries[i].k] = boundaries[i].txt;
  }

  for (let k = 0; k < labels.length; k++) {
     let txt = markSet[k] || "";
     pRadii.push((txt && range !== "1D") ? 3.5 : 0);
     tickLabels.push(txt);
     hitCols.push(col);
  }

  loadCJS(() => {
    wrap.innerHTML = `<canvas id="${type}-canvas"></canvas>`;
    let inst = type === "idx" ? idxChartInst : type === "cmd" ? cmdChartInst : type === "fx" ? fxChartInst : type === "us-top" ? usTopChartInst : krTopChartInst;
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
          pointRadius: pRadii, pointBackgroundColor: "var(--box-bg)", pointBorderColor: hitCols, pointBorderWidth: 2, 
          pointHoverRadius: range === "1D" ? 0 : 6, 
          tension: 0.2
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

    if (type === "idx") idxChartInst = newInst; else if (type === "cmd") cmdChartInst = newInst; else if (type === "fx") fxChartInst = newInst; else if (type === "us-top") usTopChartInst = newInst; else krTopChartInst = newInst;
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
             `<div class="sb-c" style="margin-top:6px;">어제 ${prev} ➔ <b style="color:var(--t1)">오늘 ${score}</b> <span style="font-size:10.5px; opacity:0.8;">(${diff >= 0 ? '+' : ''}${diff})</span></div></div>${segbar(score)}`;
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

window.doLoadFG = function() {
  fetch("quotes.php?fg=1").then(r => r.ok ? r.json() : null).then(j => {
    if (!j || j.error || !j.fear_and_greed) return renderFGErr();
    let fg = j.fear_and_greed, hist = (j.fear_and_greed_historical && j.fear_and_greed_historical.data) || null;
    renderFG(Math.round(fg.score), Math.round(fg.previous_close), hist);
  }).catch(renderFGErr);
}
function renderFGErr() { $("fg-body").innerHTML = '<div class="fg-er"><div class="fg-er-t">데이터를 불러올 수 없습니다</div><button class="fg-retry" onclick="doLoadFG()">다시 시도 ↻</button></div>'; }

// === 💡 동적 히트맵 렌더링 로직 ===
let HM_US = [
  { name: "Technology", cap: 16000, stocks: [{ s: "AAPL", n: "Apple", cap: 3000 }, { s: "MSFT", n: "Microsoft", cap: 3000 }, { s: "NVDA", n: "NVIDIA", cap: 2800 }, { s: "AVGO", n: "Broadcom", cap: 600 }, { s: "ORCL", n: "Oracle", cap: 350 }, { s: "ADBE", n: "Adobe", cap: 250 }, { s: "CRM", n: "Salesforce", cap: 280 }, { s: "AMD", n: "AMD", cap: 260 }, { s: "QCOM", n: "Qualcomm", cap: 180 }, { s: "TXN", n: "Texas Instr", cap: 160 }, { s: "INTC", n: "Intel", cap: 130 }, { s: "IBM", n: "IBM", cap: 160 }, { s: "NOW", n: "ServiceNow", cap: 150 }, { s: "INTU", n: "Intuit", cap: 170 }, { s: "AMAT", n: "Applied Mat", cap: 160 }, { s: "MU", n: "Micron", cap: 130 }, { s: "PANW", n: "Palo Alto", cap: 100 }] },
  { name: "Communication", cap: 7000, stocks: [{ s: "GOOGL", n: "Alphabet", cap: 2000 }, { s: "META", n: "Meta", cap: 1200 }, { s: "NFLX", n: "Netflix", cap: 250 }, { s: "TMUS", n: "T-Mobile", cap: 190 }, { s: "DIS", n: "Disney", cap: 200 }, { s: "VZ", n: "Verizon", cap: 160 }, { s: "T", n: "AT&T", cap: 120 }, { s: "EA", n: "EA", cap: 40 }, { s: "CMCSA", n: "Comcast", cap: 170 }, { s: "WBD", n: "WBD", cap: 30 }, { s: "SIRI", n: "Sirius", cap: 20 }, { s: "FOXA", n: "Fox", cap: 20 }, { s: "CHTR", n: "Charter", cap: 50 }, { s: "LYV", n: "Live Nation", cap: 25 }, { s: "TTWO", n: "Take-Two", cap: 25 }] },
  { name: "Cons. Cyclical", cap: 6500, stocks: [{ s: "AMZN", n: "Amazon", cap: 1900 }, { s: "TSLA", n: "Tesla", cap: 600 }, { s: "HD", n: "Home Depot", cap: 350 }, { s: "MCD", n: "McDonald's", cap: 200 }, { s: "LOW", n: "Lowe's", cap: 150 }, { s: "NKE", n: "Nike", cap: 120 }, { s: "SBUX", n: "Starbucks", cap: 100 }, { s: "TJX", n: "TJX", cap: 110 }, { s: "GM", n: "GM", cap: 50 }, { s: "F", n: "Ford", cap: 45 }, { s: "BKNG", n: "Booking", cap: 120 }, { s: "MAR", n: "Marriott", cap: 70 }, { s: "CMG", n: "Chipotle", cap: 75 }, { s: "ORLY", n: "O'Reilly", cap: 60 }, { s: "AZO", n: "AutoZone", cap: 50 }] },
  { name: "Healthcare", cap: 6000, stocks: [{ s: "LLY", n: "Eli Lilly", cap: 700 }, { s: "UNH", n: "UnitedHealth", cap: 450 }, { s: "JNJ", n: "J&J", cap: 350 }, { s: "ABBV", n: "AbbVie", cap: 300 }, { s: "MRK", n: "Merck", cap: 280 }, { s: "ABT", n: "Abbott", cap: 190 }, { s: "PFE", n: "Pfizer", cap: 150 }, { s: "AMGN", n: "Amgen", cap: 140 }, { s: "GILD", n: "Gilead", cap: 90 }, { s: "CVS", n: "CVS", cap: 70 }, { s: "ISRG", n: "Intuitive", cap: 130 }, { s: "SYK", n: "Stryker", cap: 120 }, { s: "VRTX", n: "Vertex", cap: 100 }, { s: "REGN", n: "Regeneron", cap: 100 }, { s: "BSX", n: "Boston Sci", cap: 90 }] },
  { name: "Financial", cap: 5500, stocks: [{ s: "BRK-B", n: "Berkshire", cap: 850 }, { s: "JPM", n: "JPMorgan", cap: 550 }, { s: "V", n: "Visa", cap: 500 }, { s: "MA", n: "Mastercard", cap: 400 }, { s: "BAC", n: "Bank of Am", cap: 300 }, { s: "WFC", n: "Wells Fargo", cap: 220 }, { s: "MS", n: "Morgan Stan", cap: 160 }, { s: "GS", n: "Goldman", cap: 150 }, { s: "C", n: "Citigroup", cap: 120 }, { s: "AXP", n: "Amex", cap: 160 }, { s: "SPGI", n: "S&P Global", cap: 130 }, { s: "BLK", n: "BlackRock", cap: 110 }, { s: "SCHW", n: "Schwab", cap: 120 }, { s: "PGR", n: "Progressive", cap: 110 }, { s: "CB", n: "Chubb", cap: 100 }] },
  { name: "Cons. Defensive", cap: 4000, stocks: [{ s: "WMT", n: "Walmart", cap: 500 }, { s: "PG", n: "P&G", cap: 350 }, { s: "COST", n: "Costco", cap: 300 }, { s: "KO", n: "Coca-Cola", cap: 250 }, { s: "PEP", n: "PepsiCo", cap: 220 }, { s: "PM", n: "Philip Morris", cap: 150 }, { s: "MO", n: "Altria", cap: 80 }, { s: "CL", n: "Colgate", cap: 70 }, { s: "KR", n: "Kroger", cap: 40 }, { s: "SYY", n: "Sysco", cap: 40 }, { s: "KMB", n: "Kimberly", cap: 40 }, { s: "EL", n: "Estee Lauder", cap: 50 }, { s: "GIS", n: "General Mills", cap: 40 }, { s: "TGT", n: "Target", cap: 70 }, { s: "HSY", n: "Hershey", cap: 40 }] },
  { name: "Industrials", cap: 3800, stocks: [{ s: "GE", n: "GE", cap: 180 }, { s: "CAT", n: "Caterpillar", cap: 170 }, { s: "RTX", n: "RTX", cap: 140 }, { s: "HON", n: "Honeywell", cap: 120 }, { s: "BA", n: "Boeing", cap: 100 }, { s: "UNP", n: "Union Pac", cap: 140 }, { s: "LMT", n: "Lockheed", cap: 110 }, { s: "DE", n: "Deere", cap: 110 }, { s: "FDX", n: "FedEx", cap: 65 }, { s: "UPS", n: "UPS", cap: 120 }, { s: "EMR", n: "Emerson", cap: 60 }, { s: "ETN", n: "Eaton", cap: 110 }, { s: "CMI", n: "Cummins", cap: 40 }, { s: "PH", n: "Parker-Han", cap: 70 }, { s: "PCAR", n: "PACCAR", cap: 60 }] },
  { name: "Energy", cap: 2800, stocks: [{ s: "XOM", n: "ExxonMobil", cap: 450 }, { s: "CVX", n: "Chevron", cap: 280 }, { s: "COP", n: "Conoco", cap: 130 }, { s: "SLB", n: "Schlumberger", cap: 70 }, { s: "EOG", n: "EOG Res", cap: 70 }, { s: "PSX", n: "Phillips 66", cap: 60 }, { s: "VLO", n: "Valero", cap: 50 }, { s: "OXY", n: "Occidental", cap: 55 }, { s: "MPC", n: "Marathon", cap: 70 }, { s: "HAL", n: "Halliburton", cap: 30 }, { s: "BKR", n: "Baker Hughes", cap: 30 }, { s: "WMB", n: "Williams", cap: 45 }, { s: "HES", n: "Hess", cap: 40 }, { s: "KMI", n: "Kinder", cap: 40 }, { s: "TRGP", n: "Targa", cap: 45 }] },
  { name: "Utilities", cap: 1800, stocks: [{ s: "NEE", n: "NextEra", cap: 120 }, { s: "DUK", n: "Duke Energy", cap: 75 }, { s: "SO", n: "Southern", cap: 75 }, { s: "SRE", n: "Sempra", cap: 45 }, { s: "AEP", n: "Amer Elec", cap: 45 }, { s: "ED", n: "ConEd", cap: 30 }, { s: "D", n: "Dominion", cap: 40 }, { s: "PEG", n: "Pub Serv", cap: 30 }, { s: "EXC", n: "Exelon", cap: 35 }, { s: "XEL", n: "Xcel", cap: 30 }, { s: "WEC", n: "WEC Energy", cap: 25 }, { s: "ES", n: "Eversource", cap: 20 }] },
  { name: "Real Estate", cap: 1500, stocks: [{ s: "PLD", n: "Prologis", cap: 120 }, { s: "AMT", n: "Am Tower", cap: 90 }, { s: "EQIX", n: "Equinix", cap: 80 }, { s: "WELL", n: "Welltower", cap: 50 }, { s: "PSA", n: "Public Stor", cap: 45 }, { s: "SPG", n: "Simon Prop", cap: 50 }, { s: "O", n: "Realty Inc", cap: 45 }, { s: "DLR", n: "Digital Rlty", cap: 45 }, { s: "CSGP", n: "CoStar", cap: 35 }, { s: "CCI", n: "Crown Castle", cap: 40 }] },
  { name: "Basic Materials", cap: 1500, stocks: [{ s: "LIN", n: "Linde", cap: 200 }, { s: "SHW", n: "Sherwin", cap: 80 }, { s: "FCX", n: "Freeport", cap: 70 }, { s: "APD", n: "Air Prod", cap: 60 }, { s: "ECL", n: "Ecolab", cap: 65 }, { s: "NEM", n: "Newmont", cap: 45 }, { s: "CTVA", n: "Corteva", cap: 40 }, { s: "NUE", n: "Nucor", cap: 45 }, { s: "DOW", n: "Dow Inc", cap: 40 }, { s: "DD", n: "DuPont", cap: 35 }] }
];

let HM_KR = [
  { name: "IT/반도체", cap: 700, stocks: [{ s: "005930.KS", n: "삼성전자", cap: 450 }, { s: "000660.KS", n: "SK하이닉스", cap: 150 }, { s: "042700.KS", n: "한미반도체", cap: 15 }] },
  { name: "2차전지/화학", cap: 300, stocks: [{ s: "373220.KS", n: "LG엔솔", cap: 100 }, { s: "005490.KS", n: "POSCO홀딩스", cap: 40 }, { s: "006400.KS", n: "삼성SDI", cap: 30 }, { s: "051910.KS", n: "LG화학", cap: 30 }, { s: "086520.KQ", n: "에코프로", cap: 20 }] },
  { name: "바이오/의약", cap: 200, stocks: [{ s: "207940.KS", n: "삼성바이오", cap: 60 }, { s: "068270.KS", n: "셀트리온", cap: 40 }, { s: "000100.KS", n: "유한양행", cap: 15 }] },
  { name: "자동차", cap: 150, stocks: [{ s: "005380.KS", n: "현대차", cap: 60 }, { s: "000270.KS", n: "기아", cap: 50 }, { s: "012330.KS", n: "현대모비스", cap: 20 }] },
  { name: "금융", cap: 150, stocks: [{ s: "105560.KS", n: "KB금융", cap: 30 }, { s: "055550.KS", n: "신한지주", cap: 25 }, { s: "086790.KS", n: "하나금융", cap: 20 }, { s: "138040.KS", n: "메리츠금융", cap: 15 }] },
  { name: "인터넷/서비스", cap: 100, stocks: [{ s: "035420.KS", n: "NAVER", cap: 35 }, { s: "035720.KS", n: "카카오", cap: 25 }] },
  { name: "산업재", cap: 100, stocks: [{ s: "267260.KS", n: "HD현대일렉", cap: 15 }, { s: "241560.KS", n: "두산밥캣", cap: 15 }, { s: "034020.KS", n: "두산에너빌", cap: 15 }] }
];

let HM_US_SYMS = HM_US.flatMap(s => s.stocks.map(t => t.s)).join(",");
let HM_KR_SYMS = HM_KR.flatMap(s => s.stocks.map(t => t.s)).join(",");
let HM_ALL_SYMS = HM_US_SYMS + "," + HM_KR_SYMS;

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
  hmResizeTimer = setTimeout(() => { if (Object.keys(lastHmMap).length > 0) renderAllHeatmaps(lastHmMap); }, 300);
});

function renderAllHeatmaps(qmap) {
  lastHmMap = qmap; 
  let usClosed = !isMarketOpen("us");
  let krClosed = !isMarketOpen("kr");
  
  loadD3(() => {
    drawHeatmap(qmap, usClosed, "us-hm-wrap", HM_US, "전일 종가 기준 (미국 장 마감)");
    drawHeatmap(qmap, krClosed, "kr-hm-wrap", HM_KR, "전일 종가 기준 (한국 장 마감)");
  });
}

function drawHeatmap(qmap, closed, wrapId, dataArray, closedMsg) {
  let wrap = $(wrapId);
  if(!wrap) return;
  
  let W = wrap.clientWidth || 320, H = Math.max(240, Math.round(W * 0.75));
  let root = d3.hierarchy({ 
    name: "root", 
    children: dataArray.map(sec => ({ 
      name: sec.name, 
      children: sec.stocks.map(st => { 
        let q = qmap[st.s]; 
        let displayName = st.n ? st.n : st.s.replace('.KS','').replace('.KQ','');
        return { name: displayName, cap: st.cap, pct: q ? q.pct : 0, price: q ? q.price : null, ok: !!q }; 
      }) 
    })) 
  }).sum(d => d.children ? 0 : (d.cap ? d.cap : 0)).sort((a, b) => b.value - a.value);
  
  d3.treemap().size([W, H]).paddingOuter(1).paddingTop(14).paddingInner(1).round(false)(root);
  
  let svg = d3.create("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%").attr("height", H).style("font-family", "Pretendard");
  svg.selectAll("g.hs").data(root.children).join("g").attr("class", "hs").call(g => {
    g.append("rect").attr("x", d => d.x0).attr("y", d => d.y0).attr("width", d => d.x1 - d.x0).attr("height", d => d.y1 - d.y0).attr("fill", "var(--rule)").attr("rx", 2);
    g.append("text").attr("x", d => d.x0 + 4).attr("y", d => d.y0 + 11).attr("font-size", 10).attr("font-weight", "700").attr("fill", "var(--t1)").each(function(d) { let av = d.x1 - d.x0 - 8; d3.select(this).text(av < 60 ? d.data.name.split(" ")[0] : d.data.name); });
  });
  
  let stG = svg.selectAll("g.ht").data(root.leaves()).join("g").attr("class", "ht");
  stG.append("rect").attr("x", d => d.x0).attr("y", d => d.y0).attr("width", d => Math.max(0, d.x1 - d.x0)).attr("height", d => Math.max(0, d.y1 - d.y0)).attr("fill", d => hmCol(d.data.pct, d.data.ok));
  
  stG.each(function(d) {
    let cw = d.x1 - d.x0 - 2, ch = d.y1 - d.y0 - 2; 
    if (cw < 12 || ch < 8) return; 
    let g = d3.select(this), mx = (d.x0 + d.x1) / 2, my = (d.y0 + d.y1) / 2, pct = d.data.pct, tc = hmTxt(pct, d.data.ok), fs = Math.max(6, Math.min(14, cw / 4)), sign = pct > 0 ? "+" : pct < 0 ? "" : " ";
    if (ch > 24 && cw > 30) {
      g.append("text").attr("x", mx).attr("y", my - 2).attr("text-anchor", "middle").attr("font-size", Math.min(fs, 12)).attr("font-weight", "700").attr("fill", tc).text(d.data.name);
      g.append("text").attr("x", mx).attr("y", my + Math.max(9, fs - 1)).attr("text-anchor", "middle").attr("font-size", Math.max(6, fs - 3.5)).attr("fill", tc).attr("opacity", 0.88).text(d.data.ok ? sign + pct.toFixed(2) + "%" : "─");
    } else if (ch > 10 && cw > 18) {
      g.append("text").attr("x", mx).attr("y", my + 3).attr("text-anchor", "middle").attr("font-size", Math.max(6, fs - 1.5)).attr("font-weight", "700").attr("fill", tc).text(d.data.name);
    }
  });
  
  if (closed) {
    svg.append("rect").attr("x", 0).attr("y", 0).attr("width", W).attr("height", 20).attr("fill", "rgba(245,245,247,0.88)");
    svg.append("text").attr("x", 8).attr("y", 14).attr("font-size", 10).attr("font-weight", "700").attr("fill", "#828290").text(closedMsg);
  }
  
  let tip = d3.select("body").selectAll(".hm-tip").data([0]).join("div").attr("class", "hm-tip").style("position", "fixed").style("background", "var(--t1)").style("color", "var(--bg)").style("font-size", "13px").style("padding", "7px 11px").style("border-radius", "7px").style("pointer-events", "none").style("display", "none").style("z-index", "9999").style("font-family", "Pretendard").style("font-variant-numeric", "tabular-nums").style("white-space", "nowrap").style("line-height", "1.7");
  stG.on("mousemove touchstart", (ev, d) => {
    let pct = d.data.pct, sign = pct > 0 ? "▲" : pct < 0 ? "▼" : "─", col = pct > 0 ? "#10b981" : pct < 0 ? "#ef4444" : "var(--t4)";
    let str = d.data.ok ? `${sign} ${Math.abs(pct).toFixed(2)}%` : (closed ? "종가 기준" : "─");
    tip.style("display", "block").html(`<b>${d.data.name}</b>&ensp;<span style="color:${col}">${str}</span>${d.data.price ? "<br>" + fmt(d.data.price, 2) : ""}`);
    let ex = ev.touches ? ev.touches[0].clientX : ev.clientX, ey = ev.touches ? ev.touches[0].clientY : ev.clientY;
    tip.style("left", ex + 14 + "px").style("top", ey - 48 + "px");
  }).on("mouseleave touchend", () => tip.style("display", "none"));
  
  let old = wrap.querySelector("svg"); if (old) old.remove();
  let st = wrap.querySelector(".hm-ld"); if (st) st.remove();
  wrap.appendChild(svg.node());
}

window.doLoadHM = function() {
  fetch("quotes.php?syms=" + encodeURIComponent(HM_ALL_SYMS)).then(r => r.ok ? r.json() : null).then(j => {
    if (!j) return showHMErr();
    let res = (j.quoteResponse && j.quoteResponse.result) || [], map = {}, nz = 0;
    res.forEach(q => { let p = q.regularMarketChangePercent || 0; if (Math.abs(p) > 0.001) nz++; map[q.symbol] = { pct: p, price: q.regularMarketPrice || null, ok: true }; });
    renderAllHeatmaps(map);
  }).catch(showHMErr);
}
function showHMErr() { 
  document.querySelectorAll(".hm-ld").forEach(s => { s.textContent = "⚠ quotes.php 연동 오류"; s.className = "hm-er"; });
}


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

window.activateGlobalBoost = function(e) {
  if (e) e.stopPropagation();

  if (globalBoostLevel === 0) {
    globalBoostLevel = 1;
    alert("데이터 갱신 주기가 6초로 단축되었습니다! 🚀");
    
    const admob = document.getElementById('admob-banner');
    if (admob) admob.style.display = 'none';

    document.querySelectorAll(".boost-banner").forEach(banner => {
      banner.className = "global-banner free-reward-banner boost-banner banner-lvl-1"; 
      banner.querySelector(".g-banner-title").innerHTML = '<span class="lvl-badge">Lv.2</span> 🚀 스피드업 + 하단 광고 제거!';
      banner.querySelector(".g-banner-desc").innerHTML = '불편한 광고를 제거했습니다. 한번 더 시청하면 <b>최고 속도 갱신</b> 및 <b>종합 히트맵</b>이 무료로 개방됩니다!';
      
      const btn = banner.querySelector(".g-banner-btn");
      btn.innerHTML = "▶ 최고 속도 + 히트맵 개방";
      btn.className = "g-banner-btn free-reward-btn";
      btn.onclick = window.activateGlobalBoost;
    });
  } else if (globalBoostLevel === 1) {
    globalBoostLevel = 2;
    alert("최고 속도 달성 및 히트맵 잠금 해제! 🔥\n갱신 속도가 3초로 단축되며 종합 히트맵이 무료 개방됩니다.");
    
    if (!window.isHmUnlocked) {
      window.isHmUnlocked = true;
      document.querySelectorAll('.hm-overlay').forEach(overlay => overlay.style.display = "none");
      document.querySelectorAll('.hm-wrap').forEach(wrap => wrap.classList.remove('locked'));
      doLoadHM();
    }

    document.querySelectorAll(".boost-banner").forEach(banner => {
      banner.className = "global-banner free-reward-banner boost-banner banner-lvl-2";
      banner.querySelector(".g-banner-title").innerHTML = '<span class="lvl-badge">Lv.MAX</span> 🔥 전체 시장 데이터 갱신 속도 MAX';
      banner.querySelector(".g-banner-desc").innerHTML = '제공 가능한 최고치 속도(3초 주기)로 시장 데이터를 실시간 갱신하고 있습니다.';
      
      const btn = banner.querySelector(".g-banner-btn");
      btn.innerHTML = "최고 속도 도달";
      btn.className = "g-banner-btn free-reward-btn disabled-btn";
      btn.onclick = null; 
    });
  }

  const newInterval = globalBoostLevel === 1 ? 6000 : 3000;
  runSchedule("idx", ["idx-list", "idx-us-list", "idx-kr-list"], ["cy-idx-time", "cy-us-idx-time", "cy-kr-idx-time"], "global", doLoadIdx, newInterval);
  runSchedule("cmd", "cmd-list", "cy-cmd-time", "global", doLoadCmd, newInterval); 
  runSchedule("us-top", "us-top-list", "cy-us-top-time", "us", doLoadBatchedTop10, newInterval);
  runSchedule("kr-top", "kr-top-list", "cy-kr-top-time", "kr", () => {}, newInterval);
  runSchedule("fx", "fx-list", "cy-fx-time", "global", doLoadFX, newInterval);
};

window.isHmUnlocked = false;
window.unlockHeatmap = function(e) {
  if (e) e.stopPropagation();
  alert("광고 시청 완료!\n히트맵 잠금이 해제되었습니다 🔓");
  isHmUnlocked = true;
  document.querySelectorAll('.hm-overlay').forEach(overlay => overlay.style.display = "none");
  document.querySelectorAll('.hm-wrap').forEach(wrap => {
    wrap.classList.remove('locked'); 
  });
  
  document.querySelectorAll('.hm-ld').forEach(ld => ld.textContent = "데이터 새로고침 중...");
  doLoadHM();
  
  if (intervals["hm"]) clearInterval(intervals["hm"]);
  intervals["hm"] = setInterval(() => {
    if (document.hidden) return;
    doLoadHM(); 
  }, 30000);
};

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    if (isMarketOpen("global")) { doLoadIdx(); doLoadCmd(); doLoadFX(); } 
    if (isMarketOpen("us") || isMarketOpen("kr")) doLoadBatchedTop10();
  }
});


/* =========================================================================
   6. 메인 앱 초기화 로직 (JSON Load & Initialize)
   ========================================================================= */
document.addEventListener("DOMContentLoaded", () => {
  initThemeIcons();
  if($("copy-t")) $("copy-t").textContent = "© 2025–" + new Date().getFullYear() + " MoneyScoop 제작. All rights reserved.";

  fetch('data.json?t=' + Date.now())
    .then(r => r.json())
    .then(data => {
      
      IDX = [...(data.IDX_GL||[]), ...(data.IDX_US||[]), ...(data.IDX_KR||[])];
      CMD = data.CMD || []; 
      US_TOP10 = data.US_TOP10 || [];
      KR_TOP10 = data.KR_TOP10 || [];
      FX = data.FX || [];

      IDX.forEach(s => { s.d = s.d !== undefined ? s.d : 2; s.fmt = p => fmt(p, s.d); });
      CMD.forEach(s => { s.d = s.d !== undefined ? s.d : 2; s.fmt = p => fmt(p, s.d); }); 
      US_TOP10.forEach(s => { s.d = s.d !== undefined ? s.d : 2; s.fmt = p => fmt(p, s.d); });
      KR_TOP10.forEach(s => { s.d = s.d !== undefined ? s.d : 0; s.fmt = p => fmt(p, s.d); });
      FX.forEach(s => { s.d = s.d !== undefined ? s.d : 2; s.fmt = p => fmt(p, s.d); });

      IDX_SYMS = IDX.map(s => s.sym).join(",");
      CMD_SYMS = CMD.map(s => s.sym).join(","); 
      BATCH_TOP_SYMS = US_TOP10.map(s => s.sym).join(",") + "," + KR_TOP10.map(s => s.sym).join(",");
      FX_SYMS = FX.map(s => s.sym).join(",");

      renderInitialRows('idx-list', data.IDX_GL || [], 'clickIdx', false, 0);
      renderInitialRows('idx-us-list', data.IDX_US || [], 'clickIdx', false, (data.IDX_GL||[]).length);
      renderInitialRows('idx-kr-list', data.IDX_KR || [], 'clickIdx', false, (data.IDX_GL||[]).length + (data.IDX_US||[]).length);
      
      renderInitialRows('cmd-list', CMD, 'clickCmd', false); 
      renderInitialRows('us-top-list', US_TOP10, 'clickUsTop', true);
      renderInitialRows('kr-top-list', KR_TOP10, 'clickKrTop', true);
      renderInitialRows('fx-list', FX, 'clickFx');

      runSchedule("idx", ["idx-list", "idx-us-list", "idx-kr-list"], ["cy-idx-time", "cy-us-idx-time", "cy-kr-idx-time"], "global", doLoadIdx, 10000);
      runSchedule("cmd", "cmd-list", "cy-cmd-time", "global", doLoadCmd, 10000);
      runSchedule("us-top", "us-top-list", "cy-us-top-time", "us", doLoadBatchedTop10, 10000);
      runSchedule("kr-top", "kr-top-list", "cy-kr-top-time", "kr", () => {}, 10000);
      runSchedule("fx", "fx-list", "cy-fx-time", "global", doLoadFX, 10000);

      doLoadHM();
      if (intervals["hm"]) clearInterval(intervals["hm"]);
      intervals["hm"] = setInterval(() => {
        if (document.hidden) return;
        doLoadHM(); 
      }, 30000);

      doLoadFG();
      setInterval(doLoadFG, 12 * 60 * 60 * 1000);
    })
    .catch(err => {
      console.error("데이터 로드 실패:", err);
      alert("종목 데이터를 불러오는데 실패했습니다.");
    });
});