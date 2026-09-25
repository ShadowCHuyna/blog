/* main.js — инициализация и привязка событий.
   Зависимости: model.js, ui.js, charts.js (подключать последним). */
"use strict";

function init(){
  buildSliders();   // ползунки должны существовать до привязки событий

  // ползунок и поле-число каждой переменной
  CFG.forEach(c => {
    const r = $("r_" + c.key), n = $("n_" + c.key);
    r.addEventListener("input", () => { setVal(c.key, parseFloat(r.value), true); compute(); });
    n.addEventListener("input", () => { setVal(c.key, parseFloat(n.value) || c.min, false); compute(); });
  });

  // кнопка «График» — лента графиков внизу страницы
  slidersWrap.addEventListener("click", e => {
    const b = e.target.closest ? e.target.closest(".chartbtn") : null;
    if (!b) return;
    renderCharts(b.dataset.var);
  });

  // стартовые значения (базовый сценарий из CFG)
  CFG.forEach(c => setVal(c.key, c.value, true));
  compute();
}

init();