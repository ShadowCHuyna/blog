(function () {
    "use strict";

    var cfgApi = (window.PVPN_CONFIG && window.PVPN_CONFIG.api_base) || "";
    var CFG = {
        api: (function () {
            var queryApi = new URLSearchParams(window.location.search).get("api");
            var base = queryApi || cfgApi || window.location.origin || "";
            return base.replace(/\/+$/, "");
        })()
    };

    // Что переживает перезагрузку таба:
    //   client uuid  — один на устройство (внутренний id клиента),
    //   pending key  — ключ идемпотентности, пока заказ ещё не создан,
    //   order        — созданный заказ ( payment_id, метка, срок ).
    var CLIENT_KEY = "pvpn_client_uuid";
    var PENDING_KEY = "pvpn_pending_idempotency";
    var ORDER_KEY = "pvpn_order";
    var POLL_MS = 3000;

    function pick(id) {
        return document.getElementById(id);
    }

    var el = {
        landing: pick("landing"),
        plans: pick("plans"),
        landingError: pick("landing-error"),

        checkoutModal: pick("checkout-modal"),
        checkoutTitle: pick("checkout-title"),
        checkoutClose: pick("checkout-close"),
        tabNew: pick("tab-new"),
        tabRenew: pick("tab-renew"),
        flowNew: pick("flow-new"),
        flowRenew: pick("flow-renew"),
        landingRenew: pick("landing-renew"),

        stepEmail: pick("step-email"),
        stepCode: pick("step-code"),
        contact: pick("contact"),
        emailError: pick("email-error"),
        emailSubmit: pick("email-submit"),
        code: pick("code"),
        codeSentEmail: pick("code-sent-email"),
        changeEmail: pick("change-email"),
        codeError: pick("code-error"),
        codeSubmit: pick("code-submit"),

        stepRenewInput: pick("step-renew-input"),
        renewUrl: pick("renew-url"),
        renewError: pick("renew-error"),
        renewSubmit: pick("renew-submit"),

        stepRenewConfirm: pick("step-renew-confirm"),
        renewUsername: pick("renew-username"),
        renewStatus: pick("renew-status"),
        renewExpires: pick("renew-expires"),
        renewDuration: pick("renew-duration"),
        renewConfirmError: pick("renew-confirm-error"),
        renewPay: pick("renew-pay"),
        renewChange: pick("renew-change"),

        order: pick("order"),
        orderAmount: pick("order-amount"),
        orderState: pick("order-state"),
        orderMark: pick("order-mark"),

        payDetails: pick("pay-details"),
        payOpen: pick("pay-open"),
        orderCancel: pick("order-cancel"),

        orderRetryWrap: pick("order-retry-wrap"),
        orderRetry: pick("order-retry"),
        orderError: pick("order-error"),
        orderLost: pick("order-lost"),
        orderRestart: pick("order-restart"),

        subscription: pick("subscription"),
        subscriptionUrl: pick("subscription-url"),
        subscriptionOpen: pick("subscription-open"),
        subscriptionCopy: pick("subscription-copy"),
        subscriptionExpiry: pick("subscription-expiry")
    };

    var plans = [];
    var selectedPlan = null;
    var checkoutMode = "new";
    var resolvedSubscription = null;
    var paymentId = null;
    var pollTimer = null;
    var inFlight = false;

    // --- мелкие помощники ---

    function show(node, visible) {
        if (node) node.hidden = !visible;
    }

    function setError(node, message) {
        if (!node) return;
        node.textContent = message || "";
        show(node, !!message);
    }

    function store(key, value) {
        try {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
        } catch (e) {
            // приватный режим: просто переживаем без восстановления
        }
    }

    function readStore(key) {
        try {
            return localStorage.getItem(key) || "";
        } catch (e) {
            return "";
        }
    }

    function readJson(value, fallback) {
        try {
            return JSON.parse(value);
        } catch (e) {
            return fallback;
        }
    }

    function clientUuid() {
        var saved = readStore(CLIENT_KEY);
        if (saved) return saved;
        var fresh = (window.crypto && window.crypto.randomUUID)
            ? window.crypto.randomUUID()
            : "c" + Date.now() + Math.random().toString(16).slice(2) + "-restored";
        store(CLIENT_KEY, fresh);
        return fresh;
    }

    function idempotencyKey() {
        // Одно значение на всё время оформления: пока ключ в хранилище,
        // повторный запрос вернёт уже созданный заказ, а не второй.
        var saved = readStore(PENDING_KEY);
        if (saved) return saved;
        var fresh = (window.crypto && window.crypto.randomUUID)
            ? window.crypto.randomUUID()
            : "k" + Date.now() + Math.random().toString(36).slice(2);
        store(PENDING_KEY, fresh);
        return fresh;
    }

    function humanDate(value) {
        if (!value) return "";
        var parsed = new Date(value);
        if (isNaN(parsed.getTime())) return "";
        var options = { day: "numeric", month: "long" };
        if (parsed.getFullYear() !== new Date().getFullYear()) options.year = "numeric";
        return parsed.toLocaleDateString("ru-RU", options);
    }

    function readJsonResponse(response) {
        return response.json().catch(function () { return {}; });
    }

    function describeError(status, payload) {
        var error = payload && payload.error;
        if (error && error.message) return error.message;
        if (status === 429) return "слишком часто, попробуйте позже";
        if (status === 404) return "заказ не найден";
        if (status >= 500) return "сервис временно недоступен, попробуйте через минуту";
        return "что-то пошло не так, попробуйте ещё раз";
    }

    function api(path, options) {
        var settings = options || {};
        var init = { method: settings.method || "GET", cache: "no-store" };
        var headers = {};
        if (settings.body !== undefined) {
            headers["Content-Type"] = "application/json";
            init.body = JSON.stringify(settings.body);
        }
        if (settings.idempotencyKey) headers["Idempotency-Key"] = settings.idempotencyKey;
        if (Object.keys(headers).length > 0) init.headers = headers;
        return fetch(CFG.api + path, init);
    }

    // --- каталог тарифов ---

    function loadPlans() {
        api("/api/v1/plans")
            .then(function (response) {
                return readJsonResponse(response).then(function (payload) {
                    if (response.status !== 200) {
                        throw new Error(describeError(response.status, payload));
                    }
                    return payload;
                });
            })
            .then(function (payload) {
                plans = (payload.items || []).filter(function (item) {
                    return item.active !== false;
                });
                renderPlans();
                setError(el.landingError, plans.length ? "" : "Каталог пуст: тарифов нет.");
            })
            .catch(function (error) {
                setError(el.landingError,
                    "Не удалось загрузить тарифы: " + error.message +
                    ". Попробуйте обновить страницу.");
            });
    }

    function money(item) {
        var symbol = item.currency === "RUB" ? "₽" : item.currency;
        return item.amount + symbol;
    }

    function renderPlans() {
        if (plans.length === 0) {
            el.plans.innerHTML = '<div class="list-item"><span class="meta">тарифы недоступны</span></div>';
            return;
        }
        el.plans.innerHTML = plans.map(function (item, index) {
            var num = (index + 1) < 10 ? "0" + (index + 1) : String(index + 1);
            return '<div class="list-item plan-item" role="button" tabindex="0" data-plan-id="' + item.plan_id + '">' +
                '<span class="number">' + num + '</span>' +
                '<span>' +
                '<strong>' + item.title + "</strong>" +
                '<br><span class="meta">' + item.duration_days + " дн. · 5 устройств, безлимитный трафик</span>" +
                "</span>" +
                '<span class="arrow">' + money(item) + " →</span></div>";
        }).join("");

        el.plans.querySelectorAll(".plan-item").forEach(function (node) {
            function trigger() {
                var planId = node.getAttribute("data-plan-id");
                openCheckout(planId);
            }
            node.addEventListener("click", trigger);
            node.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    trigger();
                }
            });
        });
    }

    function currentPlan() {
        for (var i = 0; i < plans.length; i++) {
            if (plans[i].plan_id === selectedPlan) return plans[i];
        }
        return null;
    }

    function switchMode(mode) {
        checkoutMode = mode;
        var plan = currentPlan();
        if (mode === "renew") {
            if (el.tabNew) el.tabNew.classList.remove("active");
            if (el.tabRenew) el.tabRenew.classList.add("active");
            show(el.flowNew, false);
            show(el.flowRenew, true);
            setError(el.renewError, "");
            setError(el.renewConfirmError, "");
            if (resolvedSubscription && plan) {
                show(el.stepRenewInput, false);
                show(el.stepRenewConfirm, true);
                if (el.renewDuration) {
                    el.renewDuration.textContent = plan.duration_days + " дн.";
                }
            } else {
                show(el.stepRenewInput, true);
                show(el.stepRenewConfirm, false);
                setTimeout(function () {
                    if (el.renewUrl) el.renewUrl.focus();
                }, 60);
            }
        } else {
            if (el.tabRenew) el.tabRenew.classList.remove("active");
            if (el.tabNew) el.tabNew.classList.add("active");
            show(el.flowRenew, false);
            show(el.flowNew, true);
            show(el.stepEmail, true);
            show(el.stepCode, false);
            setError(el.emailError, "");
            setError(el.codeError, "");
            setTimeout(function () {
                if (el.contact) el.contact.focus();
            }, 60);
        }
    }

    function openCheckout(planId, mode) {
        selectedPlan = planId;
        var plan = currentPlan();
        if (!plan) return;
        el.checkoutTitle.textContent = plan.title + " — " + money(plan) + " (" + plan.duration_days + " дн.)";
        switchMode(mode || checkoutMode || "new");
        show(el.checkoutModal, true);
    }

    function closeCheckout() {
        show(el.checkoutModal, false);
        setError(el.emailError, "");
        setError(el.codeError, "");
        setError(el.renewError, "");
        setError(el.renewConfirmError, "");
    }

    // --- подтверждение контакта (только e-mail) ---

    function contactValue() {
        return el.contact.value.trim();
    }

    function validateContact() {
        var value = contactValue();
        if (!value) return "Укажите e-mail — на него придёт ссылка на подписку.";
        if (value.indexOf("@") < 1 || value.indexOf(".") < 0) return "Похоже на некорректный e-mail.";
        return "";
    }

    function submitEmail() {
        var problem = validateContact();
        if (problem) {
            setError(el.emailError, problem);
            el.contact.focus();
            return;
        }
        setError(el.emailError, "");
        el.emailSubmit.disabled = true;
        el.emailSubmit.textContent = "отправляем код…";

        api("/api/v1/verify/" + encodeURIComponent(contactValue()) + "/request", {
            method: "POST",
            body: { type: "email" }
        })
            .then(function (response) {
                return readJsonResponse(response).then(function (payload) {
                    return { status: response.status, payload: payload };
                });
            })
            .then(function (result) {
                el.emailSubmit.disabled = false;
                el.emailSubmit.textContent = "оплатить";
                if (result.status !== 200) {
                    setError(el.emailError, describeError(result.status, result.payload));
                    return;
                }
                show(el.stepEmail, false);
                show(el.stepCode, true);
                el.codeSentEmail.textContent = contactValue();
                el.code.value = "";
                setError(el.codeError, "");
                setTimeout(function () {
                    el.code.focus();
                }, 60);
            })
            .catch(function () {
                el.emailSubmit.disabled = false;
                el.emailSubmit.textContent = "оплатить";
                setError(el.emailError, "Не удалось отправить код. Проверьте соединение.");
            });
    }

    // --- создание заказа ---

    function submitCode() {
        var code = el.code.value.trim();
        if (!/^\d{4}$/.test(code)) {
            setError(el.codeError, "Введите 4-значный код подтверждения.");
            el.code.focus();
            return;
        }
        setError(el.codeError, "");
        el.codeSubmit.disabled = true;
        el.codeSubmit.textContent = "проверяем…";

        var value = contactValue();
        var key = idempotencyKey();

        // Код подтверждения обмениваем на verification_token.
        api("/api/v1/verify/" + encodeURIComponent(value), {
            method: "POST",
            body: { code: parseInt(code, 10), type: "email" }
        })
            .then(function (response) {
                return readJsonResponse(response).then(function (payload) {
                    return { status: response.status, payload: payload };
                });
            })
            .then(function (result) {
                if (result.status !== 200) {
                    el.codeSubmit.disabled = false;
                    el.codeSubmit.textContent = "подтвердить и перейти к оплате →";
                    var reason = result.payload && result.payload.reason;
                    setError(el.codeError, reason === "expired"
                        ? "Код устарел — вернитесь и запросите новый."
                        : describeError(result.status, result.payload));
                    return null;
                }
                // Заказ с ключом идемпотентности: повтор вернёт тот же заказ.
                return api("/api/v1/payments", {
                    method: "POST",
                    idempotencyKey: key,
                    body: {
                        client_uuid: clientUuid(),
                        plan_id: selectedPlan,
                        contact: { type: "email", value: value },
                        verification_token: result.payload.verification_token
                    }
                }).then(function (response) {
                    return readJsonResponse(response).then(function (payload) {
                        return { status: response.status, payload: payload };
                    });
                });
            })
            .then(function (result) {
                if (!result) return;
                el.codeSubmit.disabled = false;
                el.codeSubmit.textContent = "подтвердить и перейти к оплате →";
                if (result.status !== 200 && result.status !== 201) {
                    store(PENDING_KEY, null);
                    setError(el.codeError, describeError(result.status, result.payload));
                    return;
                }
                closeCheckout();
                acceptedOrder(result.payload);
            })
            .catch(function () {
                el.codeSubmit.disabled = false;
                el.codeSubmit.textContent = "подтвердить и перейти к оплате →";
                setError(el.codeError, "Не удалось связаться с сервисом. Попробуйте ещё раз.");
            });
    }

    function submitRenewUrl() {
        var rawUrl = (el.renewUrl && el.renewUrl.value) ? el.renewUrl.value.trim() : "";
        if (!rawUrl) {
            setError(el.renewError, "Введите ссылку на подписку или short UUID.");
            if (el.renewUrl) el.renewUrl.focus();
            return;
        }
        setError(el.renewError, "");
        if (el.renewSubmit) {
            el.renewSubmit.disabled = true;
            el.renewSubmit.textContent = "ищем подписку…";
        }

        api("/api/v1/subscriptions/resolve", {
            method: "POST",
            body: { url: rawUrl }
        })
            .then(function (response) {
                return readJsonResponse(response).then(function (payload) {
                    return { status: response.status, payload: payload };
                });
            })
            .then(function (result) {
                if (el.renewSubmit) {
                    el.renewSubmit.disabled = false;
                    el.renewSubmit.textContent = "найти подписку";
                }
                if (result.status !== 200) {
                    var msg = "Подписка не найдена. Проверьте ссылку.";
                    if (result.payload && result.payload.error && result.payload.error.message) {
                        msg = result.payload.error.message;
                    }
                    setError(el.renewError, msg);
                    if (el.renewUrl) el.renewUrl.focus();
                    return;
                }
                var data = result.payload;
                resolvedSubscription = {
                    token: data.verification_token,
                    shortUuid: data.short_uuid,
                    username: data.username,
                    status: data.status,
                    expireAt: data.expire_at,
                    email: data.email
                };
                var plan = currentPlan();
                if (el.renewUsername) el.renewUsername.textContent = data.username || data.short_uuid;
                if (el.renewStatus) el.renewStatus.textContent = data.status || "активна";
                if (el.renewExpires) el.renewExpires.textContent = humanDate(data.expire_at) || "—";
                if (el.renewDuration && plan) el.renewDuration.textContent = plan.duration_days + " дн.";

                show(el.stepRenewInput, false);
                show(el.stepRenewConfirm, true);
                setError(el.renewConfirmError, "");
                setTimeout(function () {
                    if (el.renewPay) el.renewPay.focus();
                }, 60);
            })
            .catch(function () {
                if (el.renewSubmit) {
                    el.renewSubmit.disabled = false;
                    el.renewSubmit.textContent = "найти подписку";
                }
                setError(el.renewError, "Не удалось связаться с сервисом. Попробуйте ещё раз.");
            });
    }

    function submitRenewPay() {
        if (!resolvedSubscription) {
            switchMode("renew");
            return;
        }
        var plan = currentPlan();
        if (!plan) return;

        if (el.renewPay) {
            el.renewPay.disabled = true;
            el.renewPay.textContent = "создаём заказ…";
        }
        setError(el.renewConfirmError, "");
        var key = idempotencyKey();

        api("/api/v1/payments", {
            method: "POST",
            idempotencyKey: key,
            body: {
                client_uuid: clientUuid(),
                plan_id: selectedPlan,
                contact: {
                    type: "subscription_url",
                    value: resolvedSubscription.shortUuid
                },
                verification_token: resolvedSubscription.token
            }
        })
            .then(function (response) {
                return readJsonResponse(response).then(function (payload) {
                    return { status: response.status, payload: payload };
                });
            })
            .then(function (result) {
                if (el.renewPay) {
                    el.renewPay.disabled = false;
                    el.renewPay.textContent = "перейти к оплате →";
                }
                if (result.status !== 200 && result.status !== 201) {
                    store(PENDING_KEY, null);
                    setError(el.renewConfirmError, describeError(result.status, result.payload));
                    return;
                }
                closeCheckout();
                acceptedOrder(result.payload);
            })
            .catch(function () {
                if (el.renewPay) {
                    el.renewPay.disabled = false;
                    el.renewPay.textContent = "перейти к оплате →";
                }
                setError(el.renewConfirmError, "Не удалось связаться с сервисом. Попробуйте ещё раз.");
            });
    }

    function acceptedOrder(order) {
        var instructions = order.payment_instructions || {};
        store(PENDING_KEY, null);
        store(ORDER_KEY, JSON.stringify({
            payment_id: order.payment_id,
            label: instructions.label || order.label,
            amount: order.amount,
            currency: order.currency,
            plan_id: order.plan_id,
            expires_at: order.expires_at
        }));
        if (instructions.payment_url) {
            window.open(instructions.payment_url, "_blank", "noopener");
        }
        openOrder(order.payment_id);
    }

    // --- экран заказа и опрос статуса ---

    function showState(title, note, mark) {
        el.orderState.innerHTML = "<strong>" + title + "</strong><br>" +
            '<span class="meta">' + note + "</span>";
        el.orderMark.textContent = mark;
    }

    function openOrder(id) {
        paymentId = id;
        show(el.landing, false);
        show(el.order, true);
        setError(el.landingError, "");
        poll();
    }

    function backToLanding(message) {
        stopPolling();
        paymentId = null;
        store(ORDER_KEY, null);
        show(el.order, false);
        show(el.landing, true);
        setError(el.landingError, message || "");
    }

    // Опрос останавливается только на окончательных состояниях:
    // выдача выдаётся воркером, «failed» с деньгами на месте не финал.
    function isTerminal(view) {
        var status = view.status;
        var grant = view.subscription_grant;
        if (status === "expired" || status === "failed" || status === "cancelled") return true;
        if (status === "paid") {
            return !!grant && (grant.status === "succeeded" || grant.status === "permanent_failed");
        }
        return false;
    }

    function render(view) {
        if (el.orderAmount && view.amount) {
            var symbol = view.currency === "RUB" ? "₽" : (view.currency || "");
            el.orderAmount.textContent = view.amount + (symbol ? " " + symbol : "");
        }
        show(el.payDetails, view.status === "pending");
        show(el.orderRetryWrap, view.status === "expired" || view.status === "cancelled");
        show(el.orderLost, false);
        setError(el.orderError, "");

        var grant = view.subscription_grant;
        var attempts = grant && grant.attempts ? " (попытка " + grant.attempts + ")" : "";

        switch (view.status) {
            case "pending":
                showState(
                    "ждём оплату",
                    "заказ действует до " + (humanDate(view.expires_at) || "—"),
                    "···"
                );
                break;
            case "paid":
                if (grant && grant.status === "succeeded") {
                    showState("оплачено, подписка готова", "доступ открыт", "✓");
                    renderSubscription(grant);
                } else if (grant && grant.status === "permanent_failed") {
                    showState("оплачено, но выдача не удалась", "", "!");
                    setError(el.orderError,
                        "Оплата прошла, но подписку не подготовили автоматом: "
                        + (grant.last_error_message || "сервис пишет в журнал")
                        + ". Напишите нам — восстановим вручную. Заказ тоже помечен меткой.");
                } else if (grant && grant.status === "retryable_failed") {
                    showState("оплачено, готовим подписку", "пора выдачи сдвинулась, пробуем снова" + attempts, "···");
                } else {
                    showState("оплачено", "готовим подписку, обычно пара секунд" + attempts, "···");
                }
                break;
            case "expired":
                showState("время платежа вышло", "реквизиты больше не действуют", "×");
                break;
            case "cancelled":
                showState("заказ отменён", "платёж не завершался", "×");
                break;
            default:
                showState("проверяем заказ", "статус: " + view.status, "···");
        }
    }

    function renderSubscription(grant) {
        var result = grant.result || {};
        if (!result.subscription_url) return;
        el.subscriptionUrl.value = result.subscription_url;
        el.subscriptionOpen.href = result.subscription_url;
        var until = humanDate(result.expire_at || grant.target_expire_at);
        el.subscriptionExpiry.textContent = "подписка действует до " + (until || "—")
            + "; продление — тем же контактом";
        show(el.subscription, true);
    }

    function poll() {
        if (!paymentId || inFlight) return;
        inFlight = true;
        api("/api/v1/payments/" + encodeURIComponent(paymentId))
            .then(function (response) {
                // 404: заказ не знаю такого — прекращаем опрос.
                if (response.status === 404) {
                    backToLanding("Заказ не найден — создайте новый.");
                    return null;
                }
                return readJsonResponse(response).then(function (view) {
                    if (response.status !== 200) {
                        // Временная ошибка — опрос продолжается.
                        showErrorTemporarily(describeError(response.status, view));
                        schedulePoll();
                        return null;
                    }
                    render(view);
                    if (view.status === "pending") {
                        renderPayDetails(view);
                    } else if (!isTerminal(view)) {
                        // деньги пришли, но подписку ещё не выдали
                        show(el.payDetails, false);
                    }
                    if (isTerminal(view)) {
                        finish(view);
                        return null;
                    }
                    schedulePoll();
                    return null;
                });
            })
            .catch(function () {
                // Сеть моргнула — заказ на месте, продолжаем.
                schedulePoll();
            })
            .then(function () {
                inFlight = false;
            });
    }

    function renderPayDetails(view) {
        var instructions = view.payment_instructions || {};
        if (instructions.payment_url) {
            el.payOpen.setAttribute("data-payment-url", instructions.payment_url);
            el.payOpen.disabled = false;
        } else {
            el.payOpen.disabled = true;
        }
        show(el.payDetails, true);
    }

    function finish(view) {
        stopPolling();
        if (view.status === "paid" && (!view.subscription_grant || view.subscription_grant.status === "succeeded")) {
            // Заказ сохраняем: при следующем визите страница сама
            // покажет ссылку подписки.
            show(el.orderLost, true);
            return;
        }
        if (view.status === "failed") {
            setError(el.orderError,
                "Платёж не прошёл сверку" +
                (view.label ? " (метка " + view.label + ")" : "") +
                ". Если деньги списали — напишите нам, разберёмся.");
        }
        store(ORDER_KEY, null);
        show(el.orderLost, true);
    }

    function showErrorTemporarily(message) {
        setError(el.orderError, message + " (опрос продолжается)");
    }

    function stopPolling() {
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
    }

    function schedulePoll() {
        stopPolling();
        pollTimer = setTimeout(poll, POLL_MS);
    }

    // --- события ---

    el.checkoutClose.addEventListener("click", closeCheckout);
    el.checkoutModal.addEventListener("click", function (event) {
        if (event.target === el.checkoutModal) closeCheckout();
    });
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && !el.checkoutModal.hidden) {
            closeCheckout();
        }
    });

    if (el.tabNew) {
        el.tabNew.addEventListener("click", function () {
            switchMode("new");
        });
    }
    if (el.tabRenew) {
        el.tabRenew.addEventListener("click", function () {
            switchMode("renew");
        });
    }
    if (el.landingRenew) {
        el.landingRenew.addEventListener("click", function () {
            var targetPlan = selectedPlan || (plans.length > 0 ? plans[0].plan_id : null);
            if (targetPlan) {
                openCheckout(targetPlan, "renew");
            }
        });
    }

    if (el.renewSubmit) {
        el.renewSubmit.addEventListener("click", submitRenewUrl);
    }
    if (el.renewUrl) {
        el.renewUrl.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                submitRenewUrl();
            }
        });
    }
    if (el.renewPay) {
        el.renewPay.addEventListener("click", submitRenewPay);
    }
    if (el.renewChange) {
        el.renewChange.addEventListener("click", function () {
            show(el.stepRenewConfirm, false);
            show(el.stepRenewInput, true);
            setError(el.renewError, "");
            if (el.renewUrl) el.renewUrl.focus();
        });
    }

    el.changeEmail.addEventListener("click", function () {
        show(el.stepCode, false);
        show(el.stepEmail, true);
        setError(el.emailError, "");
        el.contact.focus();
    });

    el.emailSubmit.addEventListener("click", submitEmail);
    el.contact.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            submitEmail();
        }
    });

    el.codeSubmit.addEventListener("click", submitCode);
    el.code.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            submitCode();
        }
    });
    el.code.addEventListener("input", function () {
        if (/^\d{4}$/.test(el.code.value.trim())) {
            submitCode();
        }
    });

    el.orderRetry.addEventListener("click", function () {
        // Старый заказ не переплачиваем: начинаем заново.
        stopPolling();
        store(ORDER_KEY, null);
        paymentId = null;
        show(el.order, false);
        show(el.landing, true);
        setError(el.landingError, "");
    });

    el.orderRestart.addEventListener("click", function () {
        backToLanding("");
        el.contact.focus();
    });

    el.orderCancel.addEventListener("click", function () {
        if (!paymentId) return;
        el.orderCancel.disabled = true;
        api("/api/v1/payments/" + encodeURIComponent(paymentId) + "/cancel", { method: "POST" })
            .then(function (response) {
                el.orderCancel.disabled = false;
                if (response.status === 200) {
                    backToLanding("Заказ отменён. Можно оформить новый.");
                    return;
                }
                return readJsonResponse(response).then(function (payload) {
                    setError(el.orderError,
                        describeError(response.status, payload)
                        + " Если деньги уже ушли — оставить заказ можно, он доработает.");
                });
            })
            .catch(function () {
                el.orderCancel.disabled = false;
                setError(el.orderError, "Не удалось отменить заказ. Он останется ждать оплату.");
            });
    });

    el.payOpen.addEventListener("click", function () {
        var url = el.payOpen.getAttribute("data-payment-url");
        if (url) window.open(url, "_blank", "noopener");
    });

    el.subscriptionCopy.addEventListener("click", function () {
        var url = el.subscriptionUrl.value;
        if (!url) return;
        var copied = function () {
            el.subscriptionCopy.textContent = "скопировано";
            setTimeout(function () {
                el.subscriptionCopy.textContent = "скопировать";
            }, 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(copied, function () {
                el.subscriptionUrl.select();
                document.execCommand("copy");
                copied();
            });
        } else {
            el.subscriptionUrl.select();
            document.execCommand("copy");
            copied();
        }
    });

    // --- старт ---

    (function start() {
        loadPlans();

        var savedOrder = readJson(readStore(ORDER_KEY), null);
        if (savedOrder && savedOrder.payment_id) {
            openOrder(savedOrder.payment_id);
        }
    })();
})();
