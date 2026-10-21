(function () {
    "use strict";

    var P = window.PVPN;
    if (!P) return;

    var elPlans = document.getElementById("pvpn-plans");
    var elError = document.getElementById("pvpn-plans-error");

    function loadPlans() {
        if (!elPlans) return;

        P.api("/api/v1/plans")
            .then(function (res) {
                if (!res.ok) {
                    throw new Error(P.describeError(res.status, res.data));
                }
                var items = (res.data.items || []).filter(function (it) {
                    return it.active !== false;
                });
                renderPlans(items);
            })
            .catch(function (err) {
                if (elPlans) {
                    elPlans.innerHTML = '<div class="list-item"><span class="meta">Не удалось загрузить тарифы. Обновите страницу.</span></div>';
                }
                if (elError) {
                    elError.textContent = err.message || "Ошибка загрузки тарифов";
                    elError.hidden = false;
                }
            });
    }

    function renderPlans(plans) {
        if (!plans || plans.length === 0) {
            elPlans.innerHTML = '<div class="list-item"><span class="meta">В данный момент нет доступных тарифов.</span></div>';
            return;
        }

        var html = plans.map(function (p, index) {
            var featured = index === 0;
            var planUrl = "/pvpn/checkout/?plan=" + encodeURIComponent(p.plan_id);
            var durationText = p.duration_days + " дней";
            if (p.duration_days === 30) durationText = "1 месяц (30 дней)";
            else if (p.duration_days === 90) durationText = "3 месяца (90 дней)";
            else if (p.duration_days === 365) durationText = "1 год (365 дней)";

            return (
                '<div class="pvpn-plan-card' + (featured ? ' featured' : '') + '">' +
                    (featured ? '<div class="pvpn-plan-badge">Популярный</div>' : '') +
                    '<div class="pvpn-plan-header">' +
                        '<div class="meta">// ' + (p.plan_id || "тариф") + '</div>' +
                        '<h3 class="pvpn-plan-title">' + (p.title || "Стандарт") + '</h3>' +
                        '<div class="pvpn-plan-price">' +
                            P.money(p.amount, p.currency) +
                            '<span class="pvpn-plan-period"> / ' + p.duration_days + ' дн.</span>' +
                        '</div>' +
                    '</div>' +
                    '<ul class="pvpn-plan-features">' +
                        '<li>Срок: ' + durationText + '</li>' +
                        '<li>До 5 устройств одновременно</li>' +
                        '<li>Безлимитный трафик</li>' +
                        '<li>Протокол VLESS Reality (ТСПУ Bypass)</li>' +
                        '<li>Высокая скорость (без шейпинга)</li>' +
                    '</ul>' +
                    '<div class="pvpn-plan-action">' +
                        '<a href="' + planUrl + '" class="button button-accent">Оформить подписку →</a>' +
                    '</div>' +
                '</div>'
            );
        }).join("");

        elPlans.className = "pvpn-plans-grid";
        elPlans.innerHTML = html;
    }

    loadPlans();
})();
