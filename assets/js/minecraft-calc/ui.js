/* ui.js — интерфейс: состояние ползунков и отрисовка блока «Результат».
   Зависимости: model.js (CFG, calc, форматтеры). Подключать до charts.js. */
"use strict";

const $ = id => document.getElementById(id);
const slidersWrap = $("sliders");
const state = {};   // текущие значения переменных в процентах-как-есть (state.KP = 1 означает 1%)

// Собрать строки ползунков по конфигурации CFG
function buildSliders(){
  slidersWrap.innerHTML = "";
  CFG.forEach(c => {
    state[c.key] = c.value;
    const row = document.createElement("div");
    row.className = "slider-row";
    row.innerHTML =
      '<div class="slider-head"><label>' + c.label + '</label><span class="val" id="v_' + c.key + '"></span></div>' +
      '<div class="slider-desc">' + c.desc + '</div>' +
      '<div class="slider-line">' +
        '<input type="range" id="r_' + c.key + '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '">' +
        '<input type="number" id="n_' + c.key + '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '">' +
        '<button type="button" class="chartbtn" data-var="' + c.key + '" title="Графики результата от «' + c.label + '»">График</button>' +
      '</div>';
    slidersWrap.appendChild(row);
  });
}

// Обновить состояние по ключу переменной; setNum=false — не трогать поле-число (для его ввода)
function setVal(key, v, setNum){
  v = Math.min(CFG.find(c => c.key === key).max, Math.max(CFG.find(c => c.key === key).min, v));
  state[key] = v;
  $("r_" + key).value = v;
  if (setNum) $("n_" + key).value = v;
  $("v_" + key).textContent = fmtVal(CFG.find(c => c.key === key), v);
}

// Пересчитать всё и отрисовать блок «Результат»
function compute(){
  const r = calc(state.C, state.KP/100, state.ChD, state.KU/100, state.F, state.P, state.ratio/100, state.Adv);
  const C = state.C, KP = state.KP/100, ChD = state.ChD, KU = state.KU/100, F = state.F,
        P = state.P, ratio = state.ratio/100, Adv = state.Adv;
  const { ltv, inflow, active, revenue, monthlyCost, profit, Pmin, subsReq, Pm1, Ponce, subsOnce, ramp95, cum12, cum24, payback } = r;

  // --- Большой блок: минимальный блогер ---
  if (subsReq === Infinity){
    $("tier").textContent = "ОКУПАЕМОСТЬ НЕДОСТИЖИМА";
    $("subsBig").textContent = "∞";
    $("subsBig").className = "big plain";
    $("subsSub").textContent = "нужен хотя бы 1 платящий игрок или конверсия > 0";
    $("pvSub").textContent = "";
  } else {
    $("tier").textContent = tierName(subsReq);
    $("subsBig").textContent = fmt(subsReq);
    $("subsBig").className = "big";
    $("subsSub").textContent = "подписчиков — минимальный размер блогера";
    $("pvSub").textContent = "≈ " + fmt(Pmin) + " " + pv(Pmin) + " на каждый ролик (при " + fmtVal({dec:2,unit:""}, F) + " " + vids(F) + " в месяц это " + fmt(Pmin*F) + " " + pv(Pmin*F) + "/мес; " + fmt(ratio*100) + "% просмотров от подписчиков)";
  }

  // --- Вердикт ---
  const verdict = $("verdict");
  if (profit >= 0){
    verdict.textContent = "Сервер окупается в стабильном состоянии: +" + fmtMoney(profit) + "/мес";
    verdict.className = "verdict ok";
  } else {
    verdict.textContent = "Сервер в минусе даже в стабильном состоянии: −" + fmtMoney(Math.abs(profit)) + "/мес";
    verdict.className = "verdict no";
  }

  // --- Прогресс-бар ---
  const scaleMax = (Pmin === Infinity) ? P : Math.max(P, Pmin, 1);
  const markPct  = (Pmin === Infinity) ? 0 : Math.min(100, Pmin / scaleMax * 100);
  const mark1Pct = (Pm1 === Infinity) ? 0 : Math.min(100, Pm1 / scaleMax * 100);
  const fillPct  = (Pmin === Infinity) ? 0 : Math.min(100, P / scaleMax * 100);
  $("barFill").style.width = fillPct + "%";
  $("barMark").style.left = markPct + "%";
  $("barMark2").style.left = mark1Pct + "%";
  $("barMark2").style.display = (Pm1 === Infinity || mark1Pct >= 99.5) ? "none" : "";
  $("capA").textContent = "0";
  $("capM").textContent = (Pmin === Infinity) ? "—" : "порог стабильной окупаемости: " + fmt(Pmin);
  $("capB").textContent = "сейчас: " + fmt(P);
  if (P >= Pmin && Pmin !== Infinity) $("barFill").style.background = "var(--good)";
  else $("barFill").style.background = "var(--hl)";

  // --- Статистика ---
  $("stInflow").innerHTML  = fmt(inflow) + " <small>чел/мес</small>";
  $("stActive").innerHTML  = fmt(active) + " <small>чел</small>";
  $("stLtv").innerHTML     = fmt(ltv) + " <small>₽/чел за жизнь</small>";
  $("stRevenue").innerHTML = fmtMoney(revenue);
  $("stProfit").innerHTML  = (profit >= 0 ? "+" : "−") + fmtMoney(Math.abs(profit));
  $("stProfit").style.color = profit >= 0 ? "var(--good)" : "var(--bad)";
  $("stCost").innerHTML    = fmtMoney(monthlyCost) + " <small>" + fmtVal({dec:2,unit:""}, F) + " " + vids(F) + "/мес</small>";
  $("stRamp").innerHTML    = (ramp95 === Infinity ? "—" : "≈ " + ramp95 + " <small>мес до 95% массы</small>");
  $("stPayback").innerHTML = (payback === null)
    ? "<span style='color:var(--bad)'>— <small>не окупается за 24 мес</small></span>"
    : (payback + " <small>мес (кум. с запуска)</small>");

  // --- Пояснение переходного процесса ---
  const trans = $("transition");
  if (profit >= 0 && P >= Pm1){
    trans.textContent = "Кумулятивная прибыль за 12 мес ≈ +" + fmtMoney(cum12) +
      " (за 24 мес ≈ +" + fmtMoney(cum24) + "). Текущие П уже выше порога «плюс с 1-го месяца» (" + fmt(Pm1) + " " + pv(Pm1) + " на ролик) — сервер прибылен с первого месяца.";
  } else if (profit >= 0){
    trans.textContent = "Стабильно сервер прибылен, но первые месяцы — «яма» раскрутки: текущие П (" + fmt(P) + ") ниже порога выхода в плюс с 1-го месяца (" + fmt(Pm1) + " " + pv(Pm1) + "). Кумулятивная прибыль за 12 мес ≈ +" + fmtMoney(cum12) + ", за 24 мес ≈ +" + fmtMoney(cum24) + ".";
  } else {
    trans.textContent = "Кумулятивно сервер не окупается (за 12 мес накопленный минус ≈ −" + fmtMoney(Math.abs(cum12)) + "). Нужен больший приток: П ≥ " + fmt(Pmin) + " " + pv(Pmin) + " на ролик при текущей частоте.";
  }

  // --- Одноразовая интеграция ---
  const oneShot = $("oneShot");
  if (subsOnce === Infinity){
    oneShot.textContent = "Разовый вариант (одно видео и больше ничего) нереалистичен с текущими параметрами: нужен платящий игрок или конверсия > 0.";
  } else {
    oneShot.textContent = "Разовое видео (без повторных роликов) в долгую сервер не покрывает — оно лишь «запускает» когорту игроков. Чтобы одно видео покрыло месяц работы сервера, нужно " +
      fmt(Ponce) + " " + pv(Ponce) + " на ролик (блогер от " + fmt(subsOnce) + " подписчиков при " + fmt(ratio*100) + "% просмотров от подписчиков). Для постоянной окупаемости нужны регулярные ролики: каждый ролик ≈ " + fmt(Pmin) + " " + pv(Pmin) + " при " + fmtVal({dec:2,unit:""}, F) + " " + vids(F) + " в месяц (" + fmt(Pmin*F) + " " + pv(Pmin*F) + "/мес суммарно).";
  }
}