/*
  Плеер для музыкальных блоков на страницах команды.

  Разметка — из _includes/music.html:
    [data-music]         секция, data-artist = имя исполнителя
    [data-player]        всплывающая панель внизу экрана, скрыта пока не выбран трек
    a[data-track]        трек: href/data-src = путь к файлу
    details[data-album]  альбом, свёрнут по умолчанию
    [data-play-album]    играть альбом с первого трека
    [data-close]         закрыть плеер
    [data-toggle-all]    развернуть/свернуть все альбомы

  Что умеет: последовательное воспроизведение (дальше по списку, через альбомы),
  следующий/предыдущий, перемешивание (оно же меняет играющий трек),
  повтор (нет / всё / один трек), перемотка, громкость, медиа-кнопки системы.
*/
(function () {
    "use strict";

    var section = document.querySelector("[data-music]");
    if (!section) return;

    var player = section.querySelector("[data-player]");
    var links = [].slice.call(section.querySelectorAll("a[data-track]"));
    if (!player || !links.length) return;

    function q(name) { return player.querySelector("[data-" + name + "]"); }

    var btnPlay = q("play"), btnPrev = q("prev"), btnNext = q("next"), btnStop = q("stop"),
        btnShuffle = q("shuffle"), btnRepeat = q("repeat"), btnClose = q("close"),
        seek = q("seek"), volume = q("volume"),
        npAlbum = q("np-album"), npTitle = q("np-title"),
        timeNow = q("time-now"), timeTotal = q("time-total"),
        status = q("status");
    var btnAll = section.querySelector("[data-toggle-all]");
    var albumEls = [].slice.call(section.querySelectorAll("details[data-album]"));

    var artist = section.getAttribute("data-artist") || "";
    var baseTitle = document.title;
    var REPEAT = ["\u21bb повтор: нет", "\u21bb повтор: всё", "\u21bb повтор: трек"];

    function albumElOf(el) {
        while (el && el !== section) {
            if (el.hasAttribute && el.hasAttribute("data-album")) return el;
            el = el.parentNode;
        }
        return null;
    }

    function albumOf(el) {
        var a = albumElOf(el);
        return a ? a.getAttribute("data-album") : "";
    }

    var tracks = links.map(function (el, i) {
        var titleEl = el.querySelector("[data-title]");
        return {
            i: i,
            el: el,
            src: el.getAttribute("data-src") || el.getAttribute("href") || "",
            title: (titleEl || el).textContent.trim(),
            album: albumOf(el)
        };
    });

    var audio = new Audio();
    audio.preload = "metadata";

    var order = tracks.map(function (t) { return t.i; });
    var pos = -1;        // позиция в порядке воспроизведения
    var current = -1;    // индекс в tracks
    var shuffleOn = false;
    var repeat = 0;      // 0 — нет, 1 — всё, 2 — один трек
    var errors = 0;
    var dragging = false;

    function fmt(t) {
        if (!isFinite(t) || t < 0) t = 0;
        var m = Math.floor(t / 60), s = Math.floor(t % 60);
        return m + ":" + (s < 10 ? "0" : "") + s;
    }

    function say(text) {
        if (!status) return;
        status.textContent = text || "";
    }

    function buildOrder() {
        var all = tracks.map(function (t) { return t.i; });
        if (!shuffleOn) {
            order = all;
            pos = current >= 0 ? order.indexOf(current) : -1;
            return;
        }
        var rest = all.filter(function (i) { return i !== current; });
        for (var k = rest.length - 1; k > 0; k--) {
            var j = Math.floor(Math.random() * (k + 1));
            var tmp = rest[k]; rest[k] = rest[j]; rest[j] = tmp;
        }
        order = current >= 0 ? [current].concat(rest) : rest;
        pos = current >= 0 ? 0 : -1;
    }

    function syncAlbums() {
        var live = current >= 0 ? tracks[current] : null;
        var liveAlbum = live ? albumElOf(live.el) : null;
        for (var i = 0; i < albumEls.length; i++) {
            var d = albumEls[i];
            d.classList.toggle("is-current", d === liveAlbum);
            d.classList.toggle("is-playing", d === liveAlbum && !audio.paused && current >= 0);
        }
        if (btnAll) {
            var anyClosed = albumEls.some(function (d) { return !d.open; });
            btnAll.textContent = anyClosed ? "+ развернуть всё" : "\u2212 свернуть всё";
        }
    }

    function render() {
        // панель — всплывающая: показываем, только когда есть выбранный трек
        player.hidden = current < 0;
        try { document.body.classList.toggle("has-player", current >= 0); } catch (e) {}

        for (var i = 0; i < tracks.length; i++) {
            var t = tracks[i];
            t.el.classList.toggle("is-current", i === current);
            t.el.classList.toggle("is-playing", i === current && !audio.paused);
            if (i === current) t.el.setAttribute("aria-current", "true");
            else t.el.removeAttribute("aria-current");
        }

        var live = current >= 0 ? tracks[current] : null;
        var playing = live && !audio.paused && !audio.ended;

        npTitle.textContent = live ? live.title : "\u2014";
        npAlbum.textContent = live ? live.album : "";
        btnPlay.textContent = playing ? "||" : "\u25b6";
        btnPlay.setAttribute("aria-label", playing ? "пауза" : "играть");
        btnShuffle.setAttribute("aria-pressed", shuffleOn ? "true" : "false");
        btnRepeat.setAttribute("aria-pressed", repeat ? "true" : "false");
        btnRepeat.textContent = REPEAT[repeat];

        document.title = playing ? "\u25b6 " + live.title + " — " + baseTitle : baseTitle;

        if (live && "mediaSession" in navigator) {
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: live.title,
                    artist: live.album ? artist + " — " + live.album : artist,
                    album: live.album
                });
            } catch (e) {}
        }

        syncAlbums();
    }

    function load(i, autoplay) {
        if (i < 0 || i >= order.length) return;
        pos = i;
        current = order[i];
        errors = 0;
        say("");
        tracks[current].el.classList.remove("is-broken");

        var holder = albumElOf(tracks[current].el);
        if (holder) holder.open = true;   // показываем альбом того, что играет

        audio.src = encodeURI(tracks[current].src);
        seek.max = 0;
        seek.value = 0;
        timeNow.textContent = "0:00";
        timeTotal.textContent = "0:00";
        section.classList.add("player-busy");
        render();
        if (autoplay === false) return;
        play();
    }

    function play() {
        if (current < 0) { load(0); return; }
        var p = audio.play();
        if (p && p.catch) p.catch(function () { render(); });
    }

    function toggle() {
        if (current < 0) { load(0); return; }
        if (audio.paused) play();
        else { audio.pause(); render(); }
    }

    function next(auto) {
        if (current < 0) { load(0); return; }
        if (auto && repeat === 2) { audio.currentTime = 0; play(); return; }
        if (pos + 1 < order.length) { load(pos + 1); return; }
        if (repeat === 1) { load(0); return; }
        say("конец списка");
        stop();
    }

    function prev() {
        if (current < 0) { load(0); return; }
        if (audio.currentTime > 3) { audio.currentTime = 0; return; }
        if (pos - 1 >= 0) { load(pos - 1); return; }
        if (repeat === 1) { load(order.length - 1); return; }
        audio.currentTime = 0;
    }

    function stop() {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        current = -1;
        pos = -1;
        seek.max = 0;
        seek.value = 0;
        timeNow.textContent = "0:00";
        timeTotal.textContent = "0:00";
        section.classList.remove("player-busy");
        render();
    }

    /* --- кнопки --- */

    btnPlay.addEventListener("click", toggle);
    btnPrev.addEventListener("click", function () { prev(); });
    btnNext.addEventListener("click", function () { next(false); });
    btnStop.addEventListener("click", function () { say(""); stop(); });
    if (btnClose) btnClose.addEventListener("click", function () { say(""); stop(); });

    btnShuffle.addEventListener("click", function () {
        var wasActive = current >= 0;
        var wasPlaying = wasActive && !audio.paused && !audio.ended;

        shuffleOn = !shuffleOn;
        buildOrder();

        if (shuffleOn) {
            // перемешивание меняет и сам играющий трек
            if (order.length > 1) {
                var pick = Math.floor(Math.random() * order.length);
                if (order[pick] === current) pick = (pick + 1) % order.length;
                if (wasActive) {
                    load(pick, wasPlaying);
                    say("перемешано");
                } else {
                    pos = pick;
                    current = order[pick];
                    say("перемешано");
                    render();
                }
            } else {
                say("перемешано");
                render();
            }
        } else {
            say("обычный порядок");
            render();
        }
    });

    btnRepeat.addEventListener("click", function () {
        repeat = (repeat + 1) % 3;
        say("");
        render();
    });

    if (btnAll) btnAll.addEventListener("click", function () {
        var open = albumEls.some(function (d) { return !d.open; });
        albumEls.forEach(function (d) { d.open = open; });
        say("");
        syncAlbums();
    });

    // если альбом свернули/развернули руками — подпись кнопки должна быть правдой
    albumEls.forEach(function (d) {
        d.addEventListener("toggle", function () { syncAlbums(); });
    });

    [].slice.call(section.querySelectorAll("[data-play-album]")).forEach(function (btn) {
        btn.addEventListener("click", function () {
            var name = albumOf(btn);
            for (var i = 0; i < order.length; i++) {
                if (tracks[order[i]].album === name) { load(i); return; }
            }
        });
    });

    tracks.forEach(function (t) {
        t.el.addEventListener("click", function (e) {
            e.preventDefault();
            if (current === t.i) {
                if (audio.paused) play(); else audio.pause();
                render();
                return;
            }
            var at = order.indexOf(t.i);
            if (at < 0) { shuffleOn = false; buildOrder(); at = order.indexOf(t.i); }
            load(at);
        });
    });

    /* --- перемотка и громкость --- */

    seek.addEventListener("input", function () {
        if (current < 0) return;
        dragging = true;
        audio.currentTime = parseFloat(seek.value) || 0;
        timeNow.textContent = fmt(audio.currentTime);
    });
    seek.addEventListener("change", function () { dragging = false; });

    var saved = null;
    try { saved = parseFloat(localStorage.getItem("potatom-volume")); } catch (e) {}
    if (saved !== null && isFinite(saved)) {
        audio.volume = Math.min(1, Math.max(0, saved));
        volume.value = audio.volume;
    }
    volume.addEventListener("input", function () {
        var v = Math.min(1, Math.max(0, parseFloat(volume.value) || 0));
        audio.volume = v;
        try { localStorage.setItem("potatom-volume", String(v)); } catch (e) {}
    });

    /* --- сам аудиоэлемент --- */

    audio.addEventListener("loadedmetadata", function () {
        seek.max = isFinite(audio.duration) ? audio.duration : 0;
        timeTotal.textContent = fmt(audio.duration);
        section.classList.remove("player-busy");
    });
    audio.addEventListener("timeupdate", function () {
        if (!dragging) seek.value = audio.currentTime;
        timeNow.textContent = fmt(audio.currentTime);
    });
    audio.addEventListener("play", render);
    audio.addEventListener("pause", function () {
        section.classList.remove("player-busy");
        render();
    });
    audio.addEventListener("waiting", function () { section.classList.add("player-busy"); });
    audio.addEventListener("playing", function () { section.classList.remove("player-busy"); });
    audio.addEventListener("ended", function () { next(true); });
    audio.addEventListener("error", function () {
        if (current < 0) return;
        errors++;
        tracks[current].el.classList.add("is-broken");
        section.classList.remove("player-busy");
        if (errors < 3) {
            say("не удалось загрузить, пробую дальше");
            next(false);
        } else {
            say("звук не загрузился");
            stop();
        }
    });

    /* --- медиа-кнопки системы --- */

    if ("mediaSession" in navigator) {
        var set = function (action, fn) {
            try { navigator.mediaSession.setActionHandler(action, fn); } catch (e) {}
        };
        set("play", function () { play(); });
        set("pause", function () { audio.pause(); });
        set("previoustrack", function () { prev(); });
        set("nexttrack", function () { next(false); });
    }

    /* --- клавиатура: space в плеере, shift+стрелки где угодно, esc закрывает --- */

    document.addEventListener("keydown", function (e) {
        var el = e.target || {};
        var tag = (el.tagName || "").toLowerCase();
        if (e.metaKey || e.ctrlKey || e.altKey) return;

        if (e.key === "Escape" && current >= 0) { e.preventDefault(); say(""); stop(); return; }

        if (tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable) return;

        if (e.key === "ArrowRight" && e.shiftKey) { e.preventDefault(); next(false); return; }
        if (e.key === "ArrowLeft" && e.shiftKey) { e.preventDefault(); prev(); return; }

        if (e.key === " " || e.code === "Space") {
            var ae = document.activeElement;
            var at = ((ae && ae.tagName) || "").toLowerCase();
            // кнопкам и ссылкам space нужен по своему прямому назначению
            if (at === "a" || at === "button" || at === "input" || at === "select" || at === "textarea") return;
            // и странице не отбираем прокрутку: играем, только если фокус в панели плеера
            if (ae !== player && !player.contains(ae)) return;
            e.preventDefault();
            toggle();
        }
    });

    render();
})();
