/* FluxPad theme switch. Light is the default; the choice is remembered in localStorage.
   Loaded synchronously in <head> so the theme is set before the first paint. */
(function () {
    var KEY = 'fluxpad-theme';
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { /* storage unavailable: keep default */ }
    var theme = saved === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);

    function syncButtons(t) {
        document.querySelectorAll('[data-theme-option]').forEach(function (btn) {
            var on = btn.getAttribute('data-theme-option') === t;
            btn.setAttribute('aria-checked', on ? 'true' : 'false');
            btn.classList.toggle('is-on', on);
        });
    }

    window.setTheme = function (t) {
        t = t === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', t);
        try { localStorage.setItem(KEY, t); } catch (e) { /* ignore */ }
        syncButtons(t);
    };

    document.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-theme-option]');
        if (btn) window.setTheme(btn.getAttribute('data-theme-option'));
    });

    document.addEventListener('DOMContentLoaded', function () {
        syncButtons(document.documentElement.getAttribute('data-theme'));
    });
})();
