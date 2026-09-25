/* charts.js — графики результата (лента из 8 плиток внизу страницы).
   Зависимости: model.js (CFG, calc, форматтеры), ui.js ($, state). */
"use strict";

const CHART_N = 120;            // точек развёртки по оси X
const SVG_W = 1200, SVG_H = 260, PL = 50, PR = 14, PT = 18, PB = 26;
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Универсальная отрисовка SVG-графика.
// series: [{ color, points: [[x,y],...], name? }]; opts: { x0, x1, xUnit, xLog, yLog, yFmt,
// zeroLine, hLines:[{y,label,color}], markerX, legend, legendY, H }
function drawChart(svgId, series, opts){
  const W = SVG_W, H = opts.H || SVG_H;
  const iw = W - PL - PR, ih = H - PT - PB;
  const xLog = opts.xLog, yLog = opts.yLog;
  const mapX = x => xLog
    ? PL + iw * (Math.log10(x) - Math.log10(opts.x0)) / (Math.log10(opts.x1) - Math.log10(opts.x0))
    : PL + iw * (x - opts.x0) / (opts.x1 - opts.x0);

  // диапазон Y по всем сериям (только конечные положительные значения при лог-шкале)
  let yMin = Infinity, yMax = -Infinity;
  series.forEach(se => se.points.forEach(p => {
    const y = p[1];
    if (!Number.isFinite(y)) return;
    if (yLog && y <= 0) return;
    yMin = Math.min(yMin, y); yMax = Math.max(yMax, y);
  }));
  if (opts.zeroLine){ yMin = Math.min(yMin, 0); yMax = Math.max(yMax, 0); }
  (opts.hLines || []).forEach(h => {
    if (!Number.isFinite(h.y)) return;
    if (h.y > 0 || !yLog){ yMin = Math.min(yMin, h.y); yMax = Math.max(yMax, h.y); }
  });
  if (!Number.isFinite(yMin)){
    $(svgId).innerHTML = '<text x="' + (W/2) + '" y="' + (H/2) + '" style="fill:var(--muted)" font-size="12" text-anchor="middle">нет данных при текущих параметрах</text>';
    return;
  }

  let yLo, yHi, mapY;
  if (yLog){
    let lMin = Math.log10(yMin), lMax = Math.log10(yMax), pad = (lMax - lMin) * 0.08;
    if (pad < 0.01) pad = 0.01;
    yLo = Math.pow(10, lMin - pad); yHi = Math.pow(10, lMax + pad);
    mapY = y => PT + ih * (1 - (Math.log10(y) - Math.log10(yLo)) / (Math.log10(yHi) - Math.log10(yLo)));
  } else {
    let pad = (yMax - yMin) * 0.10; if (pad === 0) pad = Math.max(Math.abs(yMax) * 0.1, 1);
    yLo = yMin - pad; yHi = yMax + pad;
    mapY = y => PT + ih * (1 - (y - yLo) / (yHi - yLo));
  }

  const yFmt = opts.yFmt || fmtShort;
  let h = '';

  // сетка по Y
  const nTicks = 5;
  h += '<g style="stroke:var(--faint)" stroke-width="1">';
  if (yLog){
    const l0 = Math.ceil(Math.log10(yLo)), l1 = Math.floor(Math.log10(yHi));
    for (let k = l0; k <= l1; k++){
      const yv = Math.pow(10, k), yy = mapY(yv);
      h += '<line x1="' + PL + '" y1="' + yy + '" x2="' + (PL+iw) + '" y2="' + yy + '"/>' +
           '<text x="' + (PL-6) + '" y="' + (yy+3.5) + '" style="fill:var(--muted)" font-size="10" text-anchor="end">' + yFmt(yv) + '</text>';
    }
  } else {
    for (let i = 0; i <= nTicks; i++){
      const yv = yLo + (yHi - yLo) * i / nTicks, yy = mapY(yv);
      h += '<line x1="' + PL + '" y1="' + yy + '" x2="' + (PL+iw) + '" y2="' + yy + '"/>' +
           '<text x="' + (PL-6) + '" y="' + (yy+3.5) + '" style="fill:var(--muted)" font-size="10" text-anchor="end">' + yFmt(yv) + '</text>';
    }
  }
  h += '</g>';

  // нулевая линия
  if (opts.zeroLine && yLo <= 0 && 0 <= yHi){
    const y0 = mapY(0);
    h += '<line x1="' + PL + '" y1="' + y0 + '" x2="' + (PL+iw) + '" y2="' + y0 + '" style="stroke:var(--muted)" stroke-width="1.5" stroke-dasharray="5 4"/>' +
         '<text x="' + (PL-6) + '" y="' + (y0+3.5) + '" style="fill:var(--muted)" font-size="10" text-anchor="end">0</text>';
  }

  // горизонтальные ориентиры (например, текущие П)
  (opts.hLines || []).forEach(hh => {
    if (!Number.isFinite(hh.y)) return;
    if ((hh.y < yLo || hh.y > yHi) && !yLog) return;
    const yy = mapY(hh.y);
    const col = hh.color || "var(--hl)";
    h += '<line x1="' + PL + '" y1="' + yy + '" x2="' + (PL+iw) + '" y2="' + yy + '" style="stroke:' + col + '" stroke-width="1.5" stroke-dasharray="7 4" opacity=".85"/>' +
         '<text x="' + (PL+iw-4) + '" y="' + (yy-4) + '" style="fill:' + col + '" font-size="10" text-anchor="end">' + (hh.label || yFmt(hh.y)) + '</text>';
  });

  // серии
  series.forEach(se => {
    const pts = se.points.filter(pt => Number.isFinite(pt[1]) && (!yLog || pt[1] > 0));
    if (!pts.length) return;
    const d = pts.map(pt => mapX(pt[0]).toFixed(1) + "," + mapY(pt[1]).toFixed(1)).join(" ");
    h += '<polyline points="' + d + '" fill="none" stroke="' + se.color + '" stroke-width="2.6" stroke-linejoin="round" opacity=".95"/>';
    const lp = pts[pts.length-1];
    h += '<circle cx="' + mapX(lp[0]).toFixed(1) + '" cy="' + mapY(lp[1]).toFixed(1) + '" r="3" fill="' + se.color + '"/>';
  });

  // метка текущего значения X
  if (Number.isFinite(opts.markerX)){
    let xv = mapX(Math.min(Math.max(opts.markerX, opts.x0), opts.x1));
    h += '<line x1="' + xv + '" y1="' + PT + '" x2="' + xv + '" y2="' + (PT+ih) + '" style="stroke:var(--hl)" stroke-width="1.2" stroke-dasharray="4 4" opacity=".7"/>';
    const tx = Math.min(Math.max(xv, PL+34), PL+iw-34);
    h += '<text x="' + tx + '" y="' + (PT-4) + '" style="fill:var(--hl)" font-size="10" text-anchor="middle">сейчас</text>';
  }

  // подписи оси X
  h += '<text x="' + PL + '" y="' + (H-8) + '" style="fill:var(--muted)" font-size="10" text-anchor="start">' + fmtShort(opts.x0) + '</text>' +
       '<text x="' + (PL+iw) + '" y="' + (H-8) + '" style="fill:var(--muted)" font-size="10" text-anchor="end">' + fmtShort(opts.x1) + '</text>';
  if (opts.xUnit){
    h += '<text x="' + ((PL+iw)/2) + '" y="' + (H-8) + '" style="fill:var(--muted)" font-size="10" text-anchor="middle">' + esc(opts.xUnit) + '</text>';
  }
  $(svgId).innerHTML = h;
}

// 8 показателей из блока «Результат» (лента графиков)
const CHART_COLORS = ["#c2410c", "#1d4ed8", "#047857", "#a16207", "#7e22ce", "#0e7490", "#be185d", "#4d7c0f"];
const METRICS = [
  { id:"subs",    name:"Подписчиков (мин. блогер)", fn:r=>r.subsReq,  unit:"подп." },
  { id:"inflow",  name:"Приход игроков / мес",       fn:r=>r.inflow,   unit:"чел/мес" },
  { id:"ltv",     name:"LTV игрока",                 fn:r=>r.ltv,      unit:"₽", money:true },
  { id:"profit",  name:"Прибыль / мес (стабл.)",     fn:r=>r.profit,   unit:"₽/мес", money:true, zeroLine:true },
  { id:"active",  name:"Активных (стабильно)",       fn:r=>r.active,   unit:"чел" },
  { id:"revenue", name:"Выручка / мес (стабл.)",     fn:r=>r.revenue,  unit:"₽/мес", money:true },
  { id:"ramp",    name:"Выход на стабильность",      fn:r=>r.ramp95,   unit:"мес", log:false },
  { id:"payback", name:"Выход в плюс со старта",     fn:r=>r.payback,  unit:"мес", log:false, nullVal:25 },
];

// Построить ленту из 8 графиков для переменной key (диапазон — полный диапазон её ползунка)
function renderCharts(key){
  const cfg = CFG.find(c => c.key === key);
  const s = state;
  const base = { C:s.C, KP:s.KP/100, ChD:s.ChD, KU:s.KU/100, F:s.F, P:s.P, ratio:s.ratio/100, Adv:s.Adv };
  const x0 = cfg.min, x1 = cfg.max;
  const xLog = x0 > 0 && (x1 / x0) > 200;   // лог-ось X для диапазонов >200× (например, П)

  // развёртка по всем 8 показателям
  const tiles = METRICS.map(m => ({ m, points: [], nullSeen: false }));
  for (let i = 0; i <= CHART_N; i++){
    const x = x0 + (x1 - x0) * i / CHART_N;
    const p = Object.assign({}, base); p[key] = x;
    const r = calc(p.C, p.KP, p.ChD, p.KU, p.F, p.P, p.ratio, p.Adv);
    for (const t of tiles){
      let y = t.m.fn(r);
      if (y === null || y === undefined || Number.isNaN(y)){
        t.nullSeen = true;
        y = t.m.nullVal;
      }
      if (Number.isFinite(y)) t.points.push([x, y]);
    }
  }

  // заголовок
  $("chartsCard").hidden = false;
  $("chartsTitle").textContent = "Результат при изменении «" + cfg.label + "»";
  $("chartsSub").textContent = "Горизонталь — «" + cfg.label + "» от " + fmtVal(cfg, cfg.min) + " до " + fmtVal(cfg, cfg.max) +
    "; вертикаль — каждый показатель. Прочие параметры зафиксированы на текущих значениях (белый пунктир на графике — текущее «" + cfg.label + "»).";

  // резюме
  const cur = calc(base.C, base.KP, base.ChD, base.KU, base.F, base.P, base.ratio, base.Adv);
  let chip;
  if (key === "ratio"){
    const subs = Number.isFinite(cur.subsReq) ? cur.subsReq : Infinity;
    chip = "Сейчас <b>" + esc(cfg.label) + " = " + fmtVal(cfg, s.ratio) + "</b>. Прибыль от «просмотров от подписчиков» не зависит — он влияет на оценку размера блогера: минимальный блогер ≈ <b>" + fmt(Math.round(subs)) + " подписчиков</b> (для точности берите фактическое <code>view_count / video_count</code> канала).";
  } else {
    const bk = breakEvenChip(key, s);
    const mark = cur.profit >= 0 ? "+<b>" + fmtMoney(cur.profit) + "</b>/мес" : "−<b>" + fmtMoney(Math.abs(cur.profit)) + "</b>/мес";
    chip = "Сейчас <b>" + esc(cfg.label) + " = " + fmtVal(cfg, s[key]) + "</b>; стабильная прибыль " + mark +
           ", кумулятивно за 12 мес ≈ " + (cur.cum12 >= 0 ? "+" : "−") + "<b>" + fmtMoney(Math.abs(cur.cum12)) + "</b>. " + bk;
  }
  $("chartsChip").innerHTML = chip;

  // плитки с графиками (лента: один под другим на всю ширину)
  const grid = $("chartsGrid");
  grid.innerHTML = "";
  tiles.forEach((t, idx) => {
    const col = CHART_COLORS[idx % CHART_COLORS.length];
    const svgId = "chart_" + key + "_" + t.m.id;
    let note = t.m.unit;
    if (t.m.id === "payback" && t.nullSeen) note = "25 = не окупился за 24 мес";
    const tile = document.createElement("div");
    tile.className = "chart-tile";
    tile.innerHTML =
      '<div class="tile-head"><span class="tile-name">' + t.m.name + '</span><span class="tile-note">' + note + '</span></div>' +
      '<svg id="' + svgId + '" viewBox="0 0 1200 260" preserveAspectRatio="none"></svg>';
    grid.appendChild(tile);

    // лог-шкала Y — только строго положительные с разбросом >30×
    let yLog = false;
    if (!t.m.zeroLine && t.m.log !== false){
      let mn = Infinity, mx = -Infinity;
      t.points.forEach(pt => { if (pt[1] > 0){ mn = Math.min(mn, pt[1]); mx = Math.max(mx, pt[1]); } });
      yLog = mn > 0 && (mx / mn) > 30;
    }
    const yFmt = t.m.money ? v => (v >= 0 ? "+" : "−") + fmtShort(Math.abs(v)) + " ₽"
                           : (t.m.log === false ? v => fmt(Math.round(v)) : v => fmtShort(v));
    drawChart(svgId, [{ color: col, points: t.points }], {
      x0:x0, x1:x1, xUnit:cfg.unit, xLog:xLog, yLog:yLog,
      zeroLine: !!t.m.zeroLine, markerX: base[key], yFmt: yFmt, H: 260
    });
  });

  const card = $("chartsCard");
  if (card.scrollIntoView) card.scrollIntoView({ behavior:"smooth", block:"start" });
}

// Порог «прибыль ≥ 0» для переменной key при текущих значениях остальных параметров
function breakEvenChip(key, s){
  const C=s.C, KP=s.KP/100, ChD=s.ChD, KU=s.KU/100, F=s.F, P=s.P, ratio=s.ratio/100, Adv=s.Adv;
  const rev = P * KP * F * ChD / KU;   // стабильная выручка при текущих значениях
  const cost = C + Adv * F;
  const nm = { C:"C", KP:"КП", ChD:"ЧД", KU:"КУ", F:"F", P:"П", Adv:"Ad" }[key];
  let val, dir, ok = true;
  switch (key){
    case "C":   val = rev - Adv*F;        dir = "≤"; break;
    case "KP":  val = cost*KU/(P*ChD*F)*100;   dir = "≥"; break;
    case "ChD": val = cost*KU/(P*KP*F);        dir = "≥"; break;
    case "KU":  val = P*KP*F*ChD/cost*100;     dir = "≤"; break;
    case "F":   { const den = P*KP*ChD - Adv*KU; val = (den > 0) ? C*KU/den : Infinity; dir = "≥"; ok = den > 0; break; }
    case "P":   val = cost*KU/(KP*ChD*F);      dir = "≥"; break;
    case "Adv": val = (rev - C)/F;             dir = "≤"; break;
    default: return "";
  }
  if (!ok) return "Прибыль ≥ 0 не достижима ни при каких значениях «" + nm + "».";
  const cfg = CFG.find(c => c.key === key);
  const inRange = val >= cfg.min && val <= cfg.max;
  const outNote = inRange ? "" : " (вне диапазона ползунка " + fmtVal(cfg, cfg.min) + "…" + fmtVal(cfg, cfg.max) + ")";
  return "Прибыль ≥ 0 при <b>" + nm + " " + dir + " " + fmtVal(cfg, Math.min(Math.max(val, cfg.min), cfg.max)) + "</b>" + outNote + ".";
}