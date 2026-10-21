(function () {
    "use strict";

    var P = window.PVPN;
    if (!P) return;

    var POLL_INTERVAL = 3000;
    var params = new URLSearchParams(window.location.search);
    var paymentId = params.get("id");

    var savedOrder = P.getOrder();
    if (!paymentId && savedOrder && savedOrder.payment_id) {
        paymentId = savedOrder.payment_id;
    }

    var landingUrl = (window.PVPN_CONFIG && window.PVPN_CONFIG.landing_url) || P.landingUrl || "/pvpn/";

    // Блоки состояний
    var boxMainCard = document.getElementById("order-main-card");
    var boxNotFound = document.getElementById("order-state-not-found");
    var boxPending = document.getElementById("order-state-pending");
    var boxSuccess = document.getElementById("order-state-success");
    var boxTerminal = document.getElementById("order-state-terminal");

    // Элементы информации о заказе
    var elOrderSum = document.getElementById("order-amount-display");
    var elOrderBadge = document.getElementById("order-badge-display");
    var elOrderError = document.getElementById("order-error-display");

    // Pending элементы
    var btnPayUrl = document.getElementById("order-btn-pay");
    var btnCancel = document.getElementById("order-btn-cancel");
    var elPollingStatus = document.getElementById("order-polling-status");

    // Success элементы (Подписка и инструкции)
    var inputSubUrl = document.getElementById("sub-url-input");
    var btnCopySub = document.getElementById("btn-copy-sub");
    var btnOpenSub = document.getElementById("btn-open-sub");
    var elSubExpiry = document.getElementById("sub-expiry-display");

    // Terminal элементы (Отмена/Истекло)
    var elTerminalTitle = document.getElementById("terminal-title");
    var elTerminalDesc = document.getElementById("terminal-desc");

    var pollTimer = null;
    var inFlight = false;
    var isTerminated = false;

    function setError(msg) {
        if (!elOrderError) return;
        elOrderError.textContent = msg || "";
        elOrderError.hidden = !msg;
    }

    // Если ID заказа вообще отсутствует в URL и хранилище
    if (!paymentId) {
        if (boxMainCard) boxMainCard.hidden = true;
        if (boxNotFound) boxNotFound.hidden = false;
        P.clearOrder();
        return;
    }

    function isGrantComplete(grant) {
        return !!grant && (grant.status === "succeeded" || grant.status === "permanent_failed");
    }

    function isTerminalStatus(status, grant) {
        if (status === "expired" || status === "failed" || status === "cancelled") return true;
        if (status === "paid" && isGrantComplete(grant)) return true;
        return false;
    }

    function renderOrder(view) {
        if (isTerminated) return;
        var status = view.status;
        var grant = view.subscription_grant;
        var sumText = P.money(view.amount, view.currency);

        if (elOrderSum && status !== "cancelled") elOrderSum.textContent = sumText;

        switch (status) {
            case "pending":
                if (elOrderBadge) {
                    elOrderBadge.className = "order-badge badge-pending";
                    elOrderBadge.textContent = "⏳ Ожидаем оплату";
                }
                if (boxNotFound) boxNotFound.hidden = true;
                if (boxMainCard) boxMainCard.hidden = false;
                if (boxPending) boxPending.hidden = false;
                if (boxSuccess) boxSuccess.hidden = true;
                if (boxTerminal) boxTerminal.hidden = true;

                var instructions = view.payment_instructions || {};
                if (btnPayUrl) {
                    if (instructions.payment_url) {
                        btnPayUrl.href = instructions.payment_url;
                        btnPayUrl.hidden = false;
                    } else {
                        btnPayUrl.hidden = true;
                    }
                }
                break;

            case "paid":
                if (grant && grant.status === "succeeded") {
                    if (elOrderBadge) {
                        elOrderBadge.className = "order-badge badge-success";
                        elOrderBadge.textContent = "✓ Оплачено! Подписка активна";
                    }
                    if (boxPending) boxPending.hidden = true;
                    if (boxTerminal) boxTerminal.hidden = true;
                    if (boxSuccess) boxSuccess.hidden = false;

                    renderSuccess(grant);
                } else if (grant && grant.status === "permanent_failed") {
                    if (elOrderBadge) {
                        elOrderBadge.className = "order-badge badge-failed";
                        elOrderBadge.textContent = "⚠ Требуется внимание";
                    }
                    setError("Оплата получена, но при автоматической настройке подписки произошла задержка. " +
                        "Пожалуйста, свяжитесь с поддержкой (bork@potatom.net или @potatom_vpn_bot), и мы активируем её вручную.");
                } else {
                    if (elOrderBadge) {
                        elOrderBadge.className = "order-badge badge-progress";
                        elOrderBadge.textContent = "⚙ Оплата получена! Настраиваем подписку…";
                    }
                    if (boxPending) boxPending.hidden = true;
                }
                break;

            case "cancelled":
                showTerminal("Заказ отменён", "Платёж по этому счёту не производился. Если вам нужен VPN, вы можете выбрать подходящий тариф.");
                break;

            case "expired":
                showTerminal("Время на оплату вышло", "Срок действия реквизитов истёк. Пожалуйста, создайте новый заказ.");
                break;

            case "failed":
                showTerminal("Платёж не прошёл", "Если средства были списаны, напишите в службу поддержки.");
                break;
        }
    }

    function renderSuccess(grant) {
        var res = grant.result || {};
        var subUrl = res.subscription_url;
        if (!subUrl) return;

        if (inputSubUrl) inputSubUrl.value = subUrl;
        if (btnOpenSub) btnOpenSub.href = subUrl;

        var until = P.humanDate(res.expire_at || grant.target_expire_at);
        if (elSubExpiry) {
            elSubExpiry.textContent = "Подписка действует до: " + (until || "—") +
                ". Для продления сохраните эту ссылку.";
        }
    }

    function showTerminal(title, desc) {
        isTerminated = true;
        stopPolling();
        if (boxNotFound) boxNotFound.hidden = true;
        if (boxMainCard) boxMainCard.hidden = false;
        if (boxPending) boxPending.hidden = true;
        if (boxSuccess) boxSuccess.hidden = true;
        if (boxTerminal) {
            boxTerminal.hidden = false;
            if (elTerminalTitle) elTerminalTitle.textContent = title;
            if (elTerminalDesc) elTerminalDesc.textContent = desc;
        }
        if (elOrderBadge) {
            elOrderBadge.className = "order-badge badge-failed";
            elOrderBadge.textContent = "✕ " + title;
        }
        if (elOrderSum) {
            elOrderSum.textContent = "—";
        }
        P.clearOrder();
    }

    function poll() {
        if (inFlight || isTerminated) return;
        inFlight = true;

        P.api("/api/v1/payments/" + encodeURIComponent(paymentId))
            .then(function (res) {
                if (isTerminated) return;

                if (res.status === 404) {
                    stopPolling();
                    isTerminated = true;
                    if (boxMainCard) boxMainCard.hidden = true;
                    if (boxNotFound) boxNotFound.hidden = false;
                    P.clearOrder();
                    return;
                }

                if (!res.ok) {
                    scheduleNext();
                    return;
                }

                if (boxNotFound) boxNotFound.hidden = true;
                if (boxMainCard) boxMainCard.hidden = false;

                renderOrder(res.data);

                if (isTerminalStatus(res.data.status, res.data.subscription_grant)) {
                    stopPolling();
                    return;
                }

                scheduleNext();
            })
            .catch(function () {
                if (isTerminated) return;
                scheduleNext();
            })
            .then(function () {
                inFlight = false;
            });
    }

    function scheduleNext() {
        if (isTerminated) return;
        stopPolling();
        pollTimer = setTimeout(poll, POLL_INTERVAL);
    }

    function stopPolling() {
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
    }

    // Копирование ссылки в буфер обмена
    if (btnCopySub && inputSubUrl) {
        btnCopySub.addEventListener("click", function () {
            var url = inputSubUrl.value;
            if (!url) return;

            function onCopied() {
                var prev = btnCopySub.textContent;
                btnCopySub.textContent = "✓ Скопировано!";
                setTimeout(function () {
                    btnCopySub.textContent = prev;
                }, 2000);
            }

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(onCopied, function () {
                    inputSubUrl.select();
                    document.execCommand("copy");
                    onCopied();
                });
            } else {
                inputSubUrl.select();
                document.execCommand("copy");
                onCopied();
            }
        });
    }

    // Отмена заказа
    if (btnCancel) {
        btnCancel.addEventListener("click", function () {
            if (!paymentId) {
                P.clearOrder();
                window.location.href = landingUrl;
                return;
            }

            isTerminated = true;
            stopPolling();
            P.clearOrder();

            btnCancel.disabled = true;
            btnCancel.textContent = "Отменяем…";

            showTerminal("Заказ отменён", "Отменяем заказ и возвращаемся к выбору тарифов…");

            function goLanding() {
                window.location.href = landingUrl;
            }
        });
    }

    // Переключение вкладок инструкций (iOS, Android, Windows, macOS)
    var platformTabs = document.querySelectorAll(".platform-tab");
    var platformPanels = document.querySelectorAll(".platform-panel");

    platformTabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
            var target = tab.getAttribute("data-platform");
            platformTabs.forEach(function (t) { t.classList.remove("active"); });
            tab.classList.add("active");

            platformPanels.forEach(function (panel) {
                if (panel.id === "panel-" + target) {
                    panel.hidden = false;
                } else {
                    panel.hidden = true;
                }
            });
        });
    });

    // Старт опроса
    poll();
})();
