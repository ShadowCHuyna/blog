/* model.js — чистая математика и конфигурация: без DOM.
   Зависимости: нет. Используется ui.js, charts.js, main.js. */
"use strict";

// Параметры ползунков. {dec} — число знаков после запятой, {unit} — подпись значения.
const CFG = [
  { key:"C",    label:"Стоимость сервера",           desc:"хостинг, анти-DDoS, бэкапы — в месяц", min:0, max:10000, step:50, value:1000, unit:"₽/мес", dec:0 },
  { key:"KP",   label:"Конверсия КП",                desc:"доля зрителей ролика, пришедших на сервер", min:0.1, max:10, step:0.1, value:1, unit:"%", dec:2 },
  { key:"ChD",  label:"Доход с игрока ЧД",           desc:"ARPU: сколько в среднем платит человек в месяц", min:0, max:200, step:1, value:20, unit:"₽/мес", dec:1 },
  { key:"KU",   label:"Уход игроков КУ",             desc:"доля игроков, покидающих сервер за месяц", min:5, max:70, step:1, value:30, unit:"%/мес", dec:1 },
  { key:"F",    label:"Роликов в месяц F",           desc:"как часто блогер выпускает видео с упоминанием сервера", min:0.25, max:8, step:0.25, value:1, unit:"шт/мес", dec:2 },
  { key:"P",    label:"Просмотры ролика П",          desc:"просмотры, которые в среднем собирает один ролик блогера", min:1000, max:5000000, step:1000, value:50000, unit:"", dec:0 },
  { key:"ratio",label:"Просмотры от подписчиков",    desc:"сколько % подписчиков смотрят новый ролик (для пересчёта в «размер блогера»)", min:2, max:50, step:1, value:10, unit:"%", dec:0 },
  { key:"Adv",  label:"Цена рекламы",                desc:"плата блогеру за один ролик (0 = бартер)", min:0, max:20000, step:500, value:0, unit:"₽/ролик", dec:0 },
];

// --- Форматирование чисел (локализация ru-RU) ---
const nf = new Intl.NumberFormat("ru-RU");
const fmt = n => nf.format(Math.round(n));
const fmtMoney = n => nf.format(Math.round(n)) + " ₽";

function fmtShort(n){
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1e9) return s + (a/1e9).toFixed(1).replace(/[.,]0$/, "").replace(".", ",") + " млрд";
  if (a >= 1e6) return s + (a/1e6).toFixed(1).replace(/[.,]0$/, "").replace(".", ",") + " млн";
  if (a >= 1e5) return s + Math.round(a/1e3) + " тыс";
  if (a >= 1e3) return s + (a/1e3).toFixed(1).replace(/[.,]0$/, "").replace(".", ",") + " тыс";
  return s + nf.format(Math.round(a));
}

// Склонение для «ролика» / «просмотра»
function vids(n){
  if (Math.round(n) !== n) return "ролика";
  const r = Math.round(n) % 100, d = Math.round(n) % 10;
  if (d === 1 && r !== 11) return "ролик";
  if (d >= 2 && d <= 4 && !(r >= 12 && r <= 14)) return "ролика";
  return "роликов";
}
function pv(n){
  n = Math.round(n);
  const r = n % 100, d = n % 10;
  if (d === 1 && r !== 11) return "просмотр";
  if (d >= 2 && d <= 4 && !(r >= 12 && r <= 14)) return "просмотра";
  return "просмотров";
}

// Значение слайдера с подписью единицы измерения, например "1 500 шт/мес"
function fmtVal(cfg, v){
  const s = v.toFixed(cfg.dec).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (cfg.unit ? " " + cfg.unit : "");
}

// Уровень блогера по размеру аудитории
function tierName(subs){
  if (subs >= 2e6) return "МЕГА-БЛОГЕР";
  if (subs >= 5e5) return "КРУПНЫЙ блогер";
  if (subs >= 1e5) return "СРЕДНИЙ блогер";
  if (subs >= 1e4) return "МАЛЕНЬКИЙ блогер";
  return "МИКРО-блогер";
}

// --- Чистая математика (один источник правды для калькулятора и графиков) ---
// Вход: C, KP, ChD, KU, F, P, ratio, Adv в естественных единицах
// (KP, KU, ratio — доли 0..1, а не проценты).
function calc(C, KP, ChD, KU, F, P, ratio, Adv){
  const ltv    = (ChD > 0 && KU > 0) ? ChD/KU : 0;
  const inflow = P * KP * F;                     // приток игроков в месяц
  const active = KU > 0 ? inflow/KU : 0;         // актив в стабильном состоянии
  const revenue = active * ChD;
  const monthlyCost = C + Adv * F;
  const profit = revenue - monthlyCost;
  const denom = KP * ChD * F;
  const Pmin  = (KU > 0 && denom > 0) ? (C + Adv*F) * KU / denom : Infinity;  // окупаемость (стабл.)
  const subsReq = (Pmin === Infinity || ratio <= 0) ? Infinity : Pmin / ratio;
  const Pm1   = (KU > 0 && denom > 0) ? monthlyCost / denom : Infinity;        // плюс с 1-го месяца
  const Ponce = (KP * ChD > 0) ? (C + Adv) / (KP * ChD) : Infinity;            // разовое видео
  const subsOnce = (Ponce === Infinity || ratio <= 0) ? Infinity : Ponce / ratio;
  const ramp95 = (KU > 0 && active > 0) ? Math.max(1, Math.ceil(Math.log(0.05)/Math.log(1 - KU))) : Infinity;
  let cum = 0, act = 0, payback = null, cum12 = 0, cum24 = 0, profit1 = 0;
  for (let m = 1; m <= 24; m++){
    act = act * (1 - KU) + inflow;
    const p = act * ChD - monthlyCost;
    if (m === 1) profit1 = p;
    cum += p;
    if (m === 12) cum12 = cum;
    if (m === 24) cum24 = cum;
    if (payback === null && cum >= 0) payback = m;
  }
  return { ltv, inflow, active, revenue, monthlyCost, profit, Pmin, subsReq, Pm1, Ponce, subsOnce, ramp95, cum12, cum24, cum, payback, profit1, denom };
}