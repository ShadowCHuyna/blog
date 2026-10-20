/*
 * Общий каркас статической панели PVPN.
 * Без фреймворков и сборки: единственная зависимость — fetch.
 *
 * Каждый раздел лежит в своём HTML-файле; NAV определяет активный пункт,
 * boot() проверяет токен и вызывает обработчик раздела.
 */
"use strict";

(function () {
    var TOKEN_KEY = "pvpn_admin_token";
    var API_KEY = "pvpn_admin_api";
    // Боевой API по умолчанию (тот же адрес, что и у страницы покупки).
    var DEFAULT_API = "https://api.potatom.net";

    var NAV_ITEMS = [
        ["index.html", "plans", "Тарифы"],
        ["payments.html", "payments", "Платежи"],
        ["order.html", "order", "Заказ"],
        ["grants.html", "grants", "Выдачи"],
        ["webhooks.html", "webhooks", "Уведомления"]
    ];

    var onPageOpen = null;

    // ------------------------------------------------------------ хранилище
    function store(key, value) {
        try {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
        } catch (e) {
            /* приватный режим: токен придётся вводить на каждой странице */
        }
    }

    function load(key) {
        try {
            return localStorage.getItem(key) || "";
        } catch (e) {
            return "";
        }
    }

    function getApi() {
        return normalizeApi(load(API_KEY) || DEFAULT_API);
    }

    function getToken() {
        return load(TOKEN_KEY);
    }

    function setToken(value) {
        store(TOKEN_KEY, value);
    }

    function normalizeApi(raw) {
        var value = String(raw || "").trim();
        if (!value) return "";
        if (!/^https?:\/\//i.test(value)) value = "https://" + value;
        // Хост без базового пути — API живёт на /api/v1/... от корня.
        try {
            var url = new URL(value);
            return url.origin;
        } catch (e) {
            return "";
        }
    }

    // ------------------------------------------------------------------ API
    function api(path, options) {
        var opts = options || {};
        var headers = opts.headers ? Object.assign({}, opts.headers) : {};
        var token = getToken();
        if (token) headers["X-Admin-Token"] = token;
        var init = { method: opts.method || "GET", headers: headers, cache: "no-store" };
        if (opts.body !== undefined) {
            headers["Content-Type"] = "application/json";
            init.body = JSON.stringify(opts.body);
        }
        return fetch(getApi() + path, init).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (payload) {
                return { ok: response.ok, status: response.status, payload: payload };
            });
        });
    }

    // Распаковывает конверт ошибки {error:{code,message,request_id,details}}.
    function describe(result) {
        var error = result.payload && result.payload.error;
        var message = error && error.message ? error.message : "HTTP " + result.status;
        return {
            status: result.status,
            code: error && error.code ? error.code : "",
            message: message,
            details: error && error.details ? error.details : null
        };
    }

    // Выполняет запрос и распаковывает ошибки. 401 разлогинивает.
    function request(path, options) {
        return api(path, options).then(function (result) {
            if (result.ok) return result.payload;
            var error = describe(result);
            if (result.status === 401) {
                setToken(null);
                renderLogin(onPageOpen, "Токен не принят сервером. Введите его заново.");
                throw error;
            }
            throw error;
        });
    }

    // -------------------------------------------------------------- helpers
    function esc(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function pick(id) {
        return document.getElementById(id);
    }

    function flash(message, level) {
        var slot = pick("flash-slot");
        if (!slot) return;
        if (!message) {
            slot.innerHTML = "";
            return;
        }
        var text = esc(message);
        if (level === "info") level = "info";
        slot.innerHTML = '<div class="flash flash-' + (level || "info") + '" role="status">' + text + "</div>";
    }

    var INVALID_DATE = "—";
    function fmtDate(value) {
        if (!value) return INVALID_DATE;
        var parsed = new Date(value);
        if (isNaN(parsed.getTime())) return INVALID_DATE;
        return parsed.toLocaleString("ru-RU", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit"
        });
    }

    function fmtMoney(amount, currency) {
        var symbol = currency === "RUB" ? "₽" : currency || "";
        return String(amount === null || amount === undefined ? "—" : amount) +
            (symbol ? " " + symbol : "");
    }

    function fmtBool(value) {
        if (value === true) return '<span class="badge badge-success">да</span>';
        if (value === false) return '<span class="badge badge-muted">нет</span>';
        return "—";
    }

    function short(value) {
        value = String(value || "");
        return value.length > 8 ? value.slice(0, 8) : value;
    }

    var BADGE_STATUS = {
        paid: "success", succeeded: "success",
        pending: "warning", processing: "warning",
        failed: "danger", expired: "danger", cancelled: "danger",
        permanent_failed: "danger", retryable_failed: "danger"
    };

    function statusBadge(status) {
        var level = BADGE_STATUS[status] || "muted";
        return '<span class="badge badge-' + level + '">' + esc(status) + "</span>";
    }

    function kvTable(pairs) {
        var rows = "";
        for (var i = 0; i < pairs.length; i++) {
            var label = pairs[i][0];
            var value = pairs[i][1];
            var rendered = (value === null || value === undefined || value === "")
                ? esc("—")
                : (typeof value === "string" ? esc(value) : value);
            rows += "<tr><th>" + esc(label) + "</th><td>" + rendered + "</td></tr>";
        }
        return '<table class="kv"><tbody>' + rows + "</tbody></table>";
    }

    function detailsJson(title, data) {
        if (data === null || data === undefined) return "";
        return '<details class="json-details"><summary>' + esc(title) + "</summary>" +
            '<pre class="json">' + esc(JSON.stringify(data, null, 2)) + "</pre></details>";
    }

    // ----------------------------------------------------------- pagination
    function renderPagination(container, pagination, onChange) {
        var limit = pagination.limit;
        var offset = pagination.offset;
        var total = pagination.total;
        var hasMore = pagination.has_more;
        var from = total === 0 ? 0 : offset + 1;
        var to = Math.min(offset + limit, total);
        var html =
            '<span class="muted">с ' + from + " по " + to + " из " + total + "</span>" +
            '<span class="pagination-buttons">' +
            '<button type="button" class="button small" data-page="prev"' +
            (offset <= 0 ? " disabled" : "") + ">назад</button>" +
            '<button type="button" class="button small" data-page="next"' +
            (hasMore ? "" : " disabled") + ">далее</button></span>";
        container.innerHTML = '<div class="pagination">' + html + "</div>";
        container.querySelectorAll("button[data-page]").forEach(function (button) {
            button.addEventListener("click", function () {
                var delta = button.getAttribute("data-page") === "prev" ? -limit : limit;
                var next = Math.max(0, offset + delta);
                onChange(next);
            });
        });
    }

    // ---------------------------------------------------------------- shell
    function renderShell(active) {
        var topbar = pick("topbar");
        if (topbar) {
            topbar.querySelectorAll(".nav a").forEach(function (link) {
                if (link.getAttribute("data-nav") === active) link.classList.add("active");
                else link.classList.remove("active");
            });
        }
        var info = pick("operator-info");
        var button = pick("logout");
        var token = getToken();
        if (token) {
            if (info) {
                info.hidden = false;
                info.textContent = "API: " + (new URL(getApi()).host) + " · токен установлен";
            }
            if (button) {
                button.hidden = false;
                button.onclick = function () {
                    setToken(null);
                    location.reload();
                };
            }
        } else {
            if (info) info.hidden = true;
            if (button) button.hidden = true;
        }
    }

    function renderLogin(onOpen, note) {
        onPageOpen = onOpen;
        var page = pick("page");
        if (!page) return;
        page.innerHTML =
            '<div class="card card-narrow"><h1>Вход в панель</h1>' +
            '<form id="login-form" class="stack">' +
            '<label><span>Адрес API</span>' +
            '<input type="text" id="login-api" required spellcheck="false"></label>' +
            '<label><span>X-Admin-Token</span>' +
            '<input type="password" id="login-token" required autocomplete="off" spellcheck="false"></label>' +
            '<p class="hint">Токен хранится только в этом браузере и уходит в заголовке ' +
            "X-Admin-Token. «Выйти» в шапке стирает его.</p>" +
            '<p class="field-error" id="login-note"></p>' +
            '<div class="form-actions"><button type="submit" class="button primary">войти</button></div>' +
            "</form></div>";
        pick("login-api").value = load(API_KEY) || DEFAULT_API;
        pick("login-token").value = "";
        setNote(note);

        pick("login-form").addEventListener("submit", function (event) {
            event.preventDefault();
            var rawApi = pick("login-api").value.trim();
            var token = pick("login-token").value.trim();
            var host = normalizeApi(rawApi);
            if (!rawApi || !host) {
                setNote("Укажите корректный адрес API (например, https://api.example.com)");
                return;
            }
            if (!token) {
                setNote("Введите X-Admin-Token");
                return;
            }
            store(API_KEY, rawApi);
            setToken(token);
            var submit = pick("login-form").querySelector("button");
            submit.disabled = true;
            api("/api/v1/admin/plans?limit=1").then(function (result) {
                if (result.status === 200) {
                    renderShell(null);
                    flash("Вход выполнен", "success");
                    if (onOpen) onOpen();
                    return;
                }
                setToken(null);
                setNote(describe(result).message);
                submit.disabled = false;
            }).catch(function () {
                setToken(null);
                setNote("Не удалось связаться с API " + host + ". Проверьте адрес и доступность сервиса.");
                submit.disabled = false;
            });
        });

        function setNote(text) {
            var el = pick("login-note");
            if (el) el.textContent = text || "";
        }
    }

    function boot(active, onOpen) {
        document.addEventListener("DOMContentLoaded", function () {
            renderShell(active);
            onPageOpen = onOpen;
            if (getToken()) {
                if (onOpen) onOpen();
                return;
            }
            renderLogin(onOpen, null);
        });
    }

    // Пересобрать страницу после истёкшего токена: разделы рендерит onPageOpen.
    function reopenLogin(note) {
        renderLogin(onPageOpen, note);
    }

    window.PAdmin = {
        boot: boot,
        reopenLogin: reopenLogin,
        request: request,
        describe: describe,
        esc: esc,
        flash: flash,
        fmtDate: fmtDate,
        fmtMoney: fmtMoney,
        fmtBool: fmtBool,
        short: short,
        statusBadge: statusBadge,
        kvTable: kvTable,
        detailsJson: detailsJson,
        renderPagination: renderPagination,
        getApi: getApi
    };
})();
