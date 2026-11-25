/* ==========================================================================
   FluxPad quick tour: controller.

   - Opens by itself on the very first visit, then never again on that browser.
     "Already seen" is kept in localStorage (the device ROM is not touched).
   - Can be reopened any time from the bottom menu (Tools > Quick tour):
         FluxIntro.open()
   - ?intro=1 forces it, ?intro=0 suppresses it (useful for development).
   - The heavy parts (three.js, the 3D parts, the scene) are only downloaded when
     the tour is actually shown, so returning visitors pay nothing.
   ========================================================================== */
(function () {
    'use strict';

    var script = document.currentScript;
    var BASE = script && script.src ? script.src.replace(/[^\/]*$/, '') : 'intro/';
    var SEEN_KEY = 'fluxpad-intro-seen-v1';

    var STEPS = [
        { h: 'FluxPad Configurator', p: 'Remap every key right from your browser. Nothing to install.' },
        { h: 'Plug the cable into your FluxPad', p: 'Connect it with a USB-C cable, then press Connect. Works in Chrome and Edge.' },
        { h: 'Meet the encoder', p: 'Turn it for volume, scrolling or anything you choose. Press it for one more shortcut.' },
        { h: 'Start your journey', p: 'Pick a key. Make it yours.' }
    ];
    var ARRIVE = [0, 9.4, 17.8, 27.4];     // camera has settled on each step
    var BOUNDS = [0, 8.2, 16.8, 25.0];     // which step the playhead belongs to
    var HOLD_REDUCED = [4.5, 14.0, 21.5, 28.6];

    var active = null;

    /* ---------- "already seen" flag ---------- */
    function hasSeen() {
        try { if (localStorage.getItem(SEEN_KEY) === '1') return true; } catch (e) { /* storage blocked */ }
        try { if (sessionStorage.getItem(SEEN_KEY) === '1') return true; } catch (e2) { /* storage blocked */ }
        return false;
    }
    function markSeen() {
        try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* ignore */ }
        try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (e2) { /* ignore */ }
    }
    function forget() {
        try { localStorage.removeItem(SEEN_KEY); } catch (e) { /* ignore */ }
        try { sessionStorage.removeItem(SEEN_KEY); } catch (e2) { /* ignore */ }
    }

    /* ---------- lazy loading ---------- */
    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src; s.async = false;
            s.onload = resolve;
            s.onerror = function () { reject(new Error('Could not load ' + src)); };
            document.head.appendChild(s);
        });
    }
    var libPromise = null;
    function loadLib() {
        if (window.FluxIntroScene) return Promise.resolve();
        if (!libPromise) {
            libPromise = loadScript(BASE + 'three.min.js')
                .then(function () { return loadScript(BASE + 'models.js'); })
                .then(function () { return loadScript(BASE + 'intro-scene.js'); })
                .catch(function (e) { libPromise = null; throw e; });
        }
        return libPromise;
    }

    /* ---------- DOM ---------- */
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

    function buildDom() {
        var root = document.createElement('div');
        root.className = 'intro is-loading';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', 'FluxPad quick tour');
        var caps = STEPS.map(function (s, i) {
            return '<div class="intro-cap" data-i="' + i + '">' +
                '<p class="intro-eyebrow">' + (i + 1) + ' / ' + STEPS.length + '</p>' +
                '<h2 class="intro-h">' + esc(s.h) + '</h2>' +
                '<p class="intro-p">' + esc(s.p) + '</p>' +
                (i === STEPS.length - 1 ? '<button type="button" class="intro-start">Open the configurator</button>' : '') +
                '</div>';
        }).join('');
        var bars = STEPS.map(function (s, i) {
            return '<button type="button" class="intro-step" data-go="' + i + '" aria-label="Step ' + (i + 1) + ': ' + esc(s.h) + '">' +
                '<span class="intro-bar"><i></i></span></button>';
        }).join('');
        root.innerHTML =
            '<canvas class="intro-canvas" aria-hidden="true"></canvas>' +
            '<div class="intro-loader" aria-hidden="true">FluxPad</div>' +
            '<div class="intro-top"><span class="intro-brand">FluxPad</span>' +
            '<button type="button" class="intro-skip">Skip</button></div>' +
            '<div class="intro-captions" aria-live="polite">' + caps + '</div>' +
            '<div class="intro-steps">' + bars + '</div>' +
            '<button type="button" class="intro-next">Next</button>';
        return {
            root: root,
            canvas: root.querySelector('.intro-canvas'),
            caps: [].slice.call(root.querySelectorAll('.intro-cap')),
            fills: [].slice.call(root.querySelectorAll('.intro-bar i')),
            steps: [].slice.call(root.querySelectorAll('.intro-step')),
            skip: root.querySelector('.intro-skip'),
            next: root.querySelector('.intro-next'),
            start: root.querySelector('.intro-start')
        };
    }

    /* Position of on-screen key 3 and the key pitch, so the last camera shot can land
       exactly on top of the real keypad in the interface. */
    function measure() {
        var k = document.querySelectorAll('.key');
        if (k.length < 3) return null;
        var a = k[0].getBoundingClientRect(), b = k[1].getBoundingClientRect(), c = k[2].getBoundingClientRect();
        var m = { kx: c.left + c.width / 2, ky: c.top + c.height / 2, pitch: (b.left + b.width / 2) - (a.left + a.width / 2) };
        if (!(m.pitch > 20) || m.ky < 0 || m.ky > window.innerHeight || m.kx < 0 || m.kx > window.innerWidth) return null;
        return m;
    }

    function stepAt(t) {
        var i = 0;
        for (var j = 0; j < BOUNDS.length; j++) if (t >= BOUNDS[j]) i = j;
        return i;
    }
    function smooth(u) { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); }

    /* ---------- open / close ---------- */
    function open(opts) {
        if (active) return;
        opts = opts || {};
        var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        var dom = buildDom();
        var prevFocus = document.activeElement;
        var inertEls = [].slice.call(document.querySelectorAll('.main-container, .app-footer'));
        inertEls.forEach(function (el) { el.setAttribute('inert', ''); });
        document.body.appendChild(dom.root);

        var st = active = {
            dom: dom, scene: null, raf: 0, t: 0, last: 0, seek: null, paused: false,
            leaving: false, reduced: reduced, step: 0, keyHandler: null, resizeHandler: null
        };

        function cleanup() {
            if (st.raf) cancelAnimationFrame(st.raf);
            document.removeEventListener('keydown', st.keyHandler, true);
            window.removeEventListener('resize', st.resizeHandler);
            if (st.scene) { try { st.scene.dispose(); } catch (e) { /* ignore */ } }
            if (dom.root.parentNode) dom.root.parentNode.removeChild(dom.root);
            inertEls.forEach(function (el) { el.removeAttribute('inert'); });
            active = null;
            if (prevFocus && prevFocus.focus && document.contains(prevFocus)) { try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
        }

        function finish() {
            if (st.leaving) return;
            st.leaving = true;
            markSeen();
            dom.root.classList.add('is-leaving');
            setTimeout(cleanup, reduced ? 50 : 1000);
        }

        function abort() {            // could not start (no WebGL, offline...): leave the page as it was
            st.leaving = true;
            cleanup();
        }

        function goStep(i) {
            if (i < 0) i = 0;
            if (i >= STEPS.length) { finish(); return; }
            if (reduced) { st.t = HOLD_REDUCED[i]; st.seek = null; return; }
            if (i > stepAt(st.t)) st.seek = BOUNDS[i] - (i === 1 ? 1.4 : i === 2 ? 1.8 : 1.2);
            else { st.t = ARRIVE[i]; st.seek = null; }
        }

        function update(t) {
            var step = stepAt(t), caps = st.scene.captions;
            st.step = step;
            dom.caps.forEach(function (el, i) { el.classList.toggle('is-in', t >= caps[i][0] && t < caps[i][1]); });
            dom.fills.forEach(function (el, i) {
                var a = BOUNDS[i], b = i + 1 < BOUNDS.length ? BOUNDS[i + 1] : st.scene.duration;
                el.style.width = (Math.max(0, Math.min(1, (t - a) / (b - a))) * 100).toFixed(1) + '%';
            });
            dom.steps.forEach(function (el, i) { if (i === step) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current'); });
            // white studio at first, melting into the app's own panel colour for the hand-off
            dom.root.style.setProperty('--intro-white', (1 - smooth((t - 23.6) / 3.8)).toFixed(3));
            dom.root.classList.toggle('is-last', t >= 28.6);
            dom.next.style.visibility = step === STEPS.length - 1 ? 'hidden' : 'visible';
        }

        function frame(ts) {
            st.raf = requestAnimationFrame(frame);
            if (!st.last) st.last = ts;
            var dt = Math.min(0.1, (ts - st.last) / 1000); st.last = ts;
            if (!st.paused && !st.reduced) {
                if (st.seek !== null) {
                    st.t += dt * 4.5;
                    if (st.t >= st.seek) { st.t = st.seek; st.seek = null; }
                } else {
                    st.t += dt;
                }
                if (st.t >= st.scene.autoFinish) { st.t = st.scene.autoFinish; finish(); }
            }
            if (st.paused && st.t === st.drawn) return;     // nothing moved: do not redraw
            st.scene.setTime(st.t);
            update(st.t);
            st.drawn = st.t;
        }

        st.keyHandler = function (e) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); }
            else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goStep(stepAt(st.t) + 1); }
            else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goStep(stepAt(st.t) - 1); }
        };
        st.resizeHandler = function () { if (st.scene) st.scene.resize(); };
        document.addEventListener('keydown', st.keyHandler, true);
        window.addEventListener('resize', st.resizeHandler);

        dom.skip.addEventListener('click', finish);
        dom.next.addEventListener('click', function () { goStep(stepAt(st.t) + 1); });
        dom.start.addEventListener('click', finish);
        dom.steps.forEach(function (b) {
            b.addEventListener('click', function () { goStep(parseInt(b.getAttribute('data-go'), 10)); });
        });
        dom.root.addEventListener('click', function (e) {
            if (e.target === dom.canvas || e.target === dom.root) goStep(stepAt(st.t) + 1);
        });
        dom.root.tabIndex = -1;
        dom.root.focus({ preventScroll: true });

        loadLib().then(function () {
            if (!active || active !== st) return;
            try { st.scene = window.FluxIntroScene.create(dom.canvas, { measure: measure }); }
            catch (err) { if (window.console) console.warn('FluxPad tour needs WebGL:', err); abort(); return; }
            if (reduced) st.t = HOLD_REDUCED[0];
            dom.root.classList.remove('is-loading');
            dom.root.classList.add('is-ready');
            // test hook: lets automated checks jump to any second without waiting
            window.__introSeek = function (t) { st.paused = true; st.t = t; st.scene.setTime(t); update(t); st.drawn = t; return t; };
            st.raf = requestAnimationFrame(frame);
        }).catch(function (err) {
            if (window.console) console.warn('FluxPad tour could not load:', err);
            if (active === st) abort();
        });
    }

    window.FluxIntro = { open: open, hasSeen: hasSeen, reset: forget };

    function auto() {
        var q = location.search || '';
        if (/[?&]intro=0\b/.test(q)) return;
        if (/[?&]intro=1\b/.test(q) || !hasSeen()) open({ auto: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
    else auto();
})();
