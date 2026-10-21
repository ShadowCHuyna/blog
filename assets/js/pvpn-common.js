(function (window) {
    "use strict";

    var cfgApi = (window.PVPN_CONFIG && window.PVPN_CONFIG.api_base) || "";
    var queryApi = new URLSearchParams(window.location.search).get("api");
    var apiBase = (queryApi || cfgApi || window.location.origin || "").replace(/\/+$/, "");
    var landingUrl = (window.PVPN_CONFIG && window.PVPN_CONFIG.landing_url) || "/pvpn/";

    var CLIENT_KEY = "pvpn_client_uuid";
    var PENDING_KEY = "pvpn_pending_idempotency";
    var ORDER_KEY = "pvpn_order";

    function store(key, value) {
        try {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, typeof value === "object" ? JSON.stringify(value) : String(value));
        } catch (e) {}
    }

    function readStore(key) {
        try {
            return localStorage.getItem(key) || "";
        } catch (e) {
            return "";
        }
    }

    function readJson(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
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

    function idempotencyKey(freshNew) {
        if (!freshNew) {
            var saved = readStore(PENDING_KEY);
            if (saved) return saved;
        }
        var fresh = (window.crypto && window.crypto.randomUUID)
            ? window.crypto.randomUUID()
            : "k" + Date.now() + Math.random().toString(36).slice(2);
        store(PENDING_KEY, fresh);
        return fresh;
    }

    function clearIdempotencyKey() {
        store(PENDING_KEY, null);
    }

    function saveOrder(order) {
        store(ORDER_KEY, order);
    }

    function getOrder() {
        return readJson(ORDER_KEY, null);
    }

    function clearOrder() {
        store(ORDER_KEY, null);
    }

    function humanDate(value) {
        if (!value) return "";
        var parsed = new Date(value);
        if (isNaN(parsed.getTime())) return "";
        var options = { day: "numeric", month: "long" };
        if (parsed.getFullYear() !== new Date().getFullYear()) {
            options.year = "numeric";
        }
        return parsed.toLocaleDateString("ru-RU", options);
    }

    function money(amount, currency) {
        var num = typeof amount === "number" ? amount : parseFloat(amount);
        if (isNaN(num)) num = amount;
        var sym = currency === "RUB" || currency === "₽" || !currency ? "₽" : currency;
        return num + " " + sym;
    }

    function describeError(status, payload) {
        var error = payload && payload.error;
        if (error && error.message) return error.message;
        if (status === 429) return "Слишком много запросов. Пожалуйста, подождите минуту.";
        if (status === 404) return "Объект не найден.";
        if (status >= 500) return "Сервис временно недоступен. Попробуйте через минуту.";
        return "Произошла ошибка при обращении к серверу.";
    }

    function api(path, options) {
        var settings = options || {};
        var init = { method: settings.method || "GET", cache: "no-store" };
        var headers = {};
        if (settings.body !== undefined) {
            headers["Content-Type"] = "application/json";
            init.body = JSON.stringify(settings.body);
        }
        if (settings.idempotencyKey) {
            headers["Idempotency-Key"] = settings.idempotencyKey;
        }
        if (Object.keys(headers).length > 0) init.headers = headers;

        return fetch(apiBase + path, init).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
                return { ok: response.ok, status: response.status, data: data };
            });
        });
    }

    window.PVPN = {
        apiBase: apiBase,
        landingUrl: landingUrl,
        api: api,
        clientUuid: clientUuid,
        idempotencyKey: idempotencyKey,
        clearIdempotencyKey: clearIdempotencyKey,
        saveOrder: saveOrder,
        getOrder: getOrder,
        clearOrder: clearOrder,
        humanDate: humanDate,
        money: money,
        describeError: describeError
    };

})(window);
