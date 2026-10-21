(function () {
    "use strict";

    var P = window.PVPN;
    if (!P) return;

    var params = new URLSearchParams(window.location.search);
    var targetPlanId = params.get("plan");
    var targetMode = params.get("mode") === "renew" ? "renew" : "new";

    // Элементы шапки тарифа
    var elPlanBar = document.getElementById("checkout-plan-summary");
    var elPlanTitle = document.getElementById("checkout-plan-title");
    var elPlanPrice = document.getElementById("checkout-plan-price");
    var elPlanDuration = document.getElementById("checkout-plan-duration");
    var elPlanSelectWrap = document.getElementById("checkout-plan-select-wrap");
    var elPlanSelect = document.getElementById("checkout-plan-select");

    // Вкладки
    var tabNew = document.getElementById("tab-new");
    var tabRenew = document.getElementById("tab-renew");
    var flowNew = document.getElementById("flow-new");
    var flowRenew = document.getElementById("flow-renew");

    // Поток: Новая подписка
    var stepEmail = document.getElementById("step-email");
    var stepCode = document.getElementById("step-code");
    var inputEmail = document.getElementById("checkout-email");
    var btnRequestCode = document.getElementById("btn-request-code");
    var errEmail = document.getElementById("email-error");
    var inputCode = document.getElementById("checkout-code");
    var btnConfirmCode = document.getElementById("btn-confirm-code");
    var errCode = document.getElementById("code-error");
    var targetEmailLabel = document.getElementById("code-sent-email");
    var btnChangeEmail = document.getElementById("btn-change-email");

    // Поток: Продление по ссылке
    var stepRenewInput = document.getElementById("step-renew-input");
    var stepRenewConfirm = document.getElementById("step-renew-confirm");
    var inputRenewUrl = document.getElementById("checkout-renew-url");
    var btnResolve = document.getElementById("btn-resolve");
    var errRenew = document.getElementById("renew-error");
    var renewUsername = document.getElementById("renew-username");
    var renewStatus = document.getElementById("renew-status");
    var renewExpires = document.getElementById("renew-expires");
    var renewExtension = document.getElementById("renew-extension");
    var btnPayRenew = document.getElementById("btn-pay-renew");
    var btnChangeRenew = document.getElementById("btn-change-renew");
    var errRenewConfirm = document.getElementById("renew-confirm-error");

    var plans = [];
    var selectedPlan = null;
    var currentMode = targetMode;
    var resolvedSub = null;

    function setError(node, msg) {
        if (!node) return;
        node.textContent = msg || "";
        node.hidden = !msg;
    }

    // Загрузка каталога тарифов
    function loadPlans() {
        P.api("/api/v1/plans")
            .then(function (res) {
                if (!res.ok) throw new Error(P.describeError(res.status, res.data));
                plans = (res.data.items || []).filter(function (it) { return it.active !== false; });
                if (plans.length === 0) {
                    setError(errEmail, "Каталог тарифов временно пуст.");
                    return;
                }
                selectPlan(targetPlanId);
                populatePlanSelect();
            })
            .catch(function (err) {
                setError(errEmail, "Не удалось загрузить данные тарифа: " + err.message);
            });
    }

    function selectPlan(planId) {
        var found = null;
        for (var i = 0; i < plans.length; i++) {
            if (plans[i].plan_id === planId) {
                found = plans[i];
                break;
            }
        }
        selectedPlan = found || plans[0];
        updatePlanBar();
    }

    function populatePlanSelect() {
        if (!elPlanSelect) return;
        elPlanSelect.innerHTML = plans.map(function (p) {
            var isSel = selectedPlan && selectedPlan.plan_id === p.plan_id;
            return '<option value="' + p.plan_id + '"' + (isSel ? ' selected' : '') + '>' +
                p.title + ' — ' + P.money(p.amount, p.currency) + ' (' + p.duration_days + ' дн.)' +
                '</option>';
        }).join("");

        elPlanSelect.addEventListener("change", function () {
            selectPlan(elPlanSelect.value);
            if (resolvedSub) updateRenewPreview();
        });
    }

    function updatePlanBar() {
        if (!selectedPlan) return;
        if (elPlanTitle) elPlanTitle.textContent = selectedPlan.title;
        if (elPlanPrice) elPlanPrice.textContent = P.money(selectedPlan.amount, selectedPlan.currency);
        if (elPlanDuration) elPlanDuration.textContent = selectedPlan.duration_days + " дней";
        if (btnConfirmCode) {
            btnConfirmCode.textContent = "Оплатить " + P.money(selectedPlan.amount, selectedPlan.currency) + " →";
        }
        if (btnPayRenew) {
            btnPayRenew.textContent = "Оплатить продление (" + P.money(selectedPlan.amount, selectedPlan.currency) + ") →";
        }
    }

    // Переключение режимов (Новая / Продление)
    function switchMode(mode) {
        currentMode = mode;
        if (mode === "renew") {
            if (tabNew) tabNew.classList.remove("active");
            if (tabRenew) tabRenew.classList.add("active");
            if (flowNew) flowNew.hidden = true;
            if (flowRenew) flowRenew.hidden = false;
            setError(errRenew, "");
            setError(errRenewConfirm, "");
            if (inputRenewUrl && (!resolvedSub || stepRenewInput.hidden === false)) {
                setTimeout(function () { inputRenewUrl.focus(); }, 50);
            }
        } else {
            if (tabRenew) tabRenew.classList.remove("active");
            if (tabNew) tabNew.classList.add("active");
            if (flowRenew) flowRenew.hidden = true;
            if (flowNew) flowNew.hidden = false;
            setError(errEmail, "");
            setError(errCode, "");
            if (inputEmail && stepEmail.hidden === false) {
                setTimeout(function () { inputEmail.focus(); }, 50);
            }
        }
    }

    // --- Шаг 1: Запрос кода на Email ---
    function requestEmailCode() {
        var email = inputEmail.value.trim().toLowerCase();
        if (!email) {
            setError(errEmail, "Укажите ваш e-mail адрес.");
            inputEmail.focus();
            return;
        }
        if (email.indexOf("@") < 1 || email.indexOf(".") < 0) {
            setError(errEmail, "Похоже, e-mail указан с ошибкой.");
            inputEmail.focus();
            return;
        }

        setError(errEmail, "");
        btnRequestCode.disabled = true;
        btnRequestCode.textContent = "Отправляем код…";

        P.api("/api/v1/verify/" + encodeURIComponent(email) + "/request", {
            method: "POST",
            body: { type: "email" }
        })
            .then(function (res) {
                btnRequestCode.disabled = false;
                btnRequestCode.textContent = "Получить проверочный код →";

                if (!res.ok) {
                    throw new Error(P.describeError(res.status, res.data));
                }

                stepEmail.hidden = true;
                stepCode.hidden = false;
                if (targetEmailLabel) targetEmailLabel.textContent = email;
                inputCode.value = "";
                setError(errCode, "");
                setTimeout(function () { inputCode.focus(); }, 60);
            })
            .catch(function (err) {
                btnRequestCode.disabled = false;
                btnRequestCode.textContent = "Получить проверочный код →";
                setError(errEmail, err.message || "Не удалось отправить код. Проверьте адрес.");
            });
    }

    // --- Шаг 2: Проверка кода и создание заказа ---
    function confirmEmailCodeAndPay() {
        var code = inputCode.value.trim();
        if (!/^\d{4}$/.test(code)) {
            setError(errCode, "Введите 4-значный код подтверждения из письма.");
            inputCode.focus();
            return;
        }

        if (!selectedPlan) {
            setError(errCode, "Не выбран тариф.");
            return;
        }

        var email = inputEmail.value.trim().toLowerCase();
        setError(errCode, "");
        btnConfirmCode.disabled = true;
        btnConfirmCode.textContent = "Проверяем код…";

        P.api("/api/v1/verify/" + encodeURIComponent(email), {
            method: "POST",
            body: { code: parseInt(code, 10), type: "email" }
        })
            .then(function (res) {
                if (!res.ok) {
                    var reason = res.data && res.data.reason;
                    var msg = reason === "expired"
                        ? "Срок действия кода истёк. Запросите новый."
                        : (reason === "invalid_code" ? "Неверный код подтверждения." : P.describeError(res.status, res.data));
                    throw new Error(msg);
                }

                btnConfirmCode.textContent = "Создаём заказ…";
                var token = res.data.verification_token;
                var key = P.idempotencyKey();

                return P.api("/api/v1/payments", {
                    method: "POST",
                    idempotencyKey: key,
                    body: {
                        client_uuid: P.clientUuid(),
                        plan_id: selectedPlan.plan_id,
                        contact: { type: "email", value: email },
                        verification_token: token
                    }
                });
            })
            .then(function (res) {
                btnConfirmCode.disabled = false;
                updatePlanBar();

                if (!res.ok) {
                    P.clearIdempotencyKey();
                    throw new Error(P.describeError(res.status, res.data));
                }

                handlePaymentSuccess(res.data);
            })
            .catch(function (err) {
                btnConfirmCode.disabled = false;
                updatePlanBar();
                setError(errCode, err.message || "Ошибка подтверждения.");
            });
    }

    // --- Продление: Поиск существующей подписки ---
    function resolveSubscription() {
        var raw = inputRenewUrl.value.trim();
        if (!raw) {
            setError(errRenew, "Вставьте ссылку на вашу подписку или short UUID.");
            inputRenewUrl.focus();
            return;
        }

        setError(errRenew, "");
        btnResolve.disabled = true;
        btnResolve.textContent = "Ищем подписку…";

        P.api("/api/v1/subscriptions/resolve", {
            method: "POST",
            body: { url: raw }
        })
            .then(function (res) {
                btnResolve.disabled = false;
                btnResolve.textContent = "Найти подписку →";

                if (!res.ok) {
                    var msg = "Подписка не найдена. Проверьте правильность ссылки.";
                    if (res.data && res.data.error && res.data.error.message) {
                        msg = res.data.error.message;
                    }
                    throw new Error(msg);
                }

                var data = res.data;
                resolvedSub = {
                    token: data.verification_token,
                    shortUuid: data.short_uuid,
                    username: data.username,
                    status: data.status,
                    expireAt: data.expire_at,
                    email: data.email
                };

                updateRenewPreview();
                stepRenewInput.hidden = true;
                stepRenewConfirm.hidden = false;
                setError(errRenewConfirm, "");
            })
            .catch(function (err) {
                btnResolve.disabled = false;
                btnResolve.textContent = "Найти подписку →";
                setError(errRenew, err.message);
            });
    }

    function updateRenewPreview() {
        if (!resolvedSub) return;
        if (renewUsername) renewUsername.textContent = resolvedSub.username || resolvedSub.shortUuid;
        if (renewStatus) renewStatus.textContent = resolvedSub.status === "ACTIVE" ? "Активна" : (resolvedSub.status || "—");
        if (renewExpires) renewExpires.textContent = P.humanDate(resolvedSub.expireAt) || "—";
        if (renewExtension && selectedPlan) {
            renewExtension.textContent = "+" + selectedPlan.duration_days + " дней";
        }
    }

    // --- Продление: Оплата заказа ---
    function payRenewal() {
        if (!resolvedSub || !selectedPlan) return;

        setError(errRenewConfirm, "");
        btnPayRenew.disabled = true;
        btnPayRenew.textContent = "Создаём заказ…";

        var key = P.idempotencyKey();

        P.api("/api/v1/payments", {
            method: "POST",
            idempotencyKey: key,
            body: {
                client_uuid: P.clientUuid(),
                plan_id: selectedPlan.plan_id,
                contact: {
                    type: "subscription_url",
                    value: resolvedSub.shortUuid
                },
                verification_token: resolvedSub.token
            }
        })
            .then(function (res) {
                btnPayRenew.disabled = false;
                updatePlanBar();

                if (!res.ok) {
                    P.clearIdempotencyKey();
                    throw new Error(P.describeError(res.status, res.data));
                }

                handlePaymentSuccess(res.data);
            })
            .catch(function (err) {
                btnPayRenew.disabled = false;
                updatePlanBar();
                setError(errRenewConfirm, err.message || "Не удалось оформить продление.");
            });
    }

    // Обработка успешного создания заказа
    function handlePaymentSuccess(order) {
        P.clearIdempotencyKey();
        var instructions = order.payment_instructions || {};

        P.saveOrder({
            payment_id: order.payment_id,
            label: instructions.label || order.label,
            amount: order.amount,
            currency: order.currency,
            plan_id: order.plan_id,
            expires_at: order.expires_at
        });

        // Открываем платёжную форму в новом окне, если ссылка предоставлена
        if (instructions.payment_url) {
            window.open(instructions.payment_url, "_blank", "noopener");
        }

        // Перенаправляем текущую вкладку на страницу отслеживания заказа
        window.location.href = "/pvpn/order/?id=" + encodeURIComponent(order.payment_id);
    }

    // Навешивание слушателей событий
    if (tabNew) tabNew.addEventListener("click", function () { switchMode("new"); });
    if (tabRenew) tabRenew.addEventListener("click", function () { switchMode("renew"); });

    if (btnRequestCode) btnRequestCode.addEventListener("click", requestEmailCode);
    if (inputEmail) {
        inputEmail.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); requestEmailCode(); }
        });
    }

    if (btnChangeEmail) {
        btnChangeEmail.addEventListener("click", function () {
            stepCode.hidden = true;
            stepEmail.hidden = false;
            setError(errEmail, "");
            inputEmail.focus();
        });
    }

    if (btnConfirmCode) btnConfirmCode.addEventListener("click", confirmEmailCodeAndPay);
    if (inputCode) {
        inputCode.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); confirmEmailCodeAndPay(); }
        });
        inputCode.addEventListener("input", function () {
            if (/^\d{4}$/.test(inputCode.value.trim())) {
                confirmEmailCodeAndPay();
            }
        });
    }

    if (btnResolve) btnResolve.addEventListener("click", resolveSubscription);
    if (inputRenewUrl) {
        inputRenewUrl.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); resolveSubscription(); }
        });
    }

    if (btnChangeRenew) {
        btnChangeRenew.addEventListener("click", function () {
            stepRenewConfirm.hidden = true;
            stepRenewInput.hidden = false;
            setError(errRenew, "");
            inputRenewUrl.focus();
        });
    }

    if (btnPayRenew) btnPayRenew.addEventListener("click", payRenewal);

    loadPlans();
    switchMode(currentMode);
})();
