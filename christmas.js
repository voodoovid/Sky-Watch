/* SkyWatch Christmas / New Year skin.
   index.html loads this file, and christmas.css, only from December 1 to 31 (device date), or with ?season=christmas /
   ?season=newyear for a preview. Dec 1-25 is "Christmas" (html.xm); Dec 26-31 adds html.ny, which swaps the reds and
   greens for midnight and gold and puts party hats on the characters. Nothing here runs the rest of the year, so the
   normal skin returns on its own on January 1 and the Christmas skin returns every December 1.
   Red night mode keeps its pure-red palette and hides every decoration. */
(function () {
  'use strict';
  var h = document.documentElement;
  var NY = h.classList.contains('ny');
  var YEAR = new Date().getFullYear() + (NY ? 1 : 0);

  /* ---------- the characters (flat, rounded, mid-century TV-special style; drawn from scratch) ---------- */
  var SANTA_HAT = NY
    ? '<path d="M17 21L33 -2L48 21Z" fill="#f5c451"/><path d="M22 14l7 4M26 6l11 6" stroke="#1c2550" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="32.5" cy="21.5" rx="17" ry="4.2" fill="#fffaf0"/><circle cx="33" cy="-2" r="4.4" fill="#fffaf0"/>'
    : '<path d="M17 20C16 6 28 0 40 3C49 6 54 14 55 25C48 15 36 13 17 20Z" fill="#d92d2d"/><path d="M42 4C49 6 54 13 55 25C53 18 49 12 42 9Z" fill="#b01f24"/><rect x="15" y="16" width="34" height="9" rx="4.5" fill="#fffaf0"/><circle cx="55" cy="26" r="5.2" fill="#fffaf0"/>';
  var SANTA_WAVE = NY
    ? '<g class="xm-wave"><path d="M12 62C10 52 8 46 9 38" stroke="#d92d2d" stroke-width="9" stroke-linecap="round" fill="none"/><circle cx="9" cy="35" r="5.2" fill="#fffaf0"/><path d="M9 33L5 20" stroke="#8a8a96" stroke-width="1.6" stroke-linecap="round"/><g class="xm-spark" fill="#ffe08a"><path d="M5 12l1.5 4.5 4.5 1.5-4.5 1.5L5 24l-1.5-4.5L-1 18l4.5-1.5z"/></g></g>'
    : '<g class="xm-wave"><path d="M12 62C10 52 8 46 9 38" stroke="#d92d2d" stroke-width="9" stroke-linecap="round" fill="none"/><circle cx="9" cy="35" r="5.4" fill="#fffaf0"/></g>';
  var SANTA =
    '<svg viewBox="-6 -6 74 70" aria-hidden="true">' +
      '<path d="M5 64C6 48 17 45 32 45C47 45 58 48 59 64Z" fill="#d92d2d"/>' +
      '<ellipse cx="32" cy="46.5" rx="19" ry="4.4" fill="#fffaf0"/>' +
      '<rect x="27" y="56" width="10" height="8" rx="1.5" fill="#1d1d26"/><rect x="29" y="57.5" width="6" height="5" rx="1" fill="none" stroke="#f5c451" stroke-width="1.6"/>' +
      '<circle cx="32" cy="30" r="14" fill="#ffd9b8"/>' +
      '<path d="M16.5 30C15 49 24 54 32 54C40 54 49 49 47.5 30C42 38 38 39 32 39C26 39 22 38 16.5 30Z" fill="#fffaf0"/>' +
      '<path d="M20 50.5c3 3 7 4 12 4s9-1 12-4" fill="none" stroke="#e8e2d6" stroke-width="1.2" stroke-linecap="round"/>' +
      '<ellipse cx="25.5" cy="36.5" rx="6.6" ry="3.6" transform="rotate(14 25.5 36.5)" fill="#fffaf0"/><ellipse cx="38.5" cy="36.5" rx="6.6" ry="3.6" transform="rotate(-14 38.5 36.5)" fill="#fffaf0"/>' +
      '<circle cx="32" cy="33" r="3.3" fill="#ff9b8f"/>' +
      '<circle cx="23.2" cy="31" r="3" fill="#ff8f8f" opacity=".55"/><circle cx="40.8" cy="31" r="3" fill="#ff8f8f" opacity=".55"/>' +
      '<ellipse cx="27" cy="27" rx="1.5" ry="2" fill="#2b1b17"/><ellipse cx="37" cy="27" rx="1.5" ry="2" fill="#2b1b17"/>' +
      '<path d="M23.5 23.6q3.5-2.4 7 0M33.5 23.6q3.5-2.4 7 0" fill="none" stroke="#fffaf0" stroke-width="2" stroke-linecap="round"/>' +
      SANTA_HAT + SANTA_WAVE +
    '</svg>';

  var SNOW_HAT = NY
    ? '<path d="M20 12L31 -12L42 12Z" fill="#dfe6f2"/><path d="M23 6l6 3M26 -2l8 4" stroke="#f5c451" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="31" cy="12.5" rx="12" ry="3" fill="#f5c451"/><circle cx="31" cy="-12" r="3.6" fill="#f5c451"/>'
    : '<ellipse cx="31" cy="12.5" rx="17" ry="3.6" fill="#22222e"/><rect x="21" y="-8" width="20" height="21" rx="2.4" fill="#2b2b3a"/><rect x="21" y="6" width="20" height="4.4" fill="#d92d2d"/><path d="M36 5c3-3 7-2 8 1-3 2-7 2-8-1z" fill="#2f9e56"/><path d="M36 5c-1-4-5-5-8-3 2 3 6 4 8 3z" fill="#26874a"/><circle cx="37" cy="5.4" r="1.9" fill="#e23b3b"/>';
  var SNOWMAN =
    '<svg viewBox="-6 -16 74 90" aria-hidden="true">' +
      '<defs><radialGradient id="xmsb" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#eef5fb"/><stop offset="1" stop-color="#c9d9ea"/></radialGradient></defs>' +
      '<path d="M13 54L-2 42M7 48L0 52M-1 43L-3 38" stroke="#7a5230" stroke-width="2.6" stroke-linecap="round" fill="none"/>' +
      '<path d="M49 54L64 40M57 47L61 52M63 41L66 37" stroke="#7a5230" stroke-width="2.6" stroke-linecap="round" fill="none"/>' +
      '<circle cx="31" cy="64" r="22" fill="url(#xmsb)"/>' +
      '<circle cx="31" cy="27" r="16" fill="url(#xmsb)"/>' +
      '<circle cx="25.6" cy="24" r="1.9" fill="#1f1f27"/><circle cx="36.4" cy="24" r="1.9" fill="#1f1f27"/>' +
      '<path d="M31 27.4L43.5 30.2L31 32.4Z" fill="#ff8a1f"/><path d="M31 27.4L43.5 30.2L36 29Z" fill="#ffb15c"/>' +
      '<circle cx="22.4" cy="29" r="3.2" fill="#ff9d9d" opacity=".5"/><circle cx="39.6" cy="29" r="3.2" fill="#ff9d9d" opacity=".5"/>' +
      '<g fill="#1f1f27"><circle cx="24" cy="34.4" r="1.15"/><circle cx="27.2" cy="36.4" r="1.15"/><circle cx="31" cy="37" r="1.15"/><circle cx="34.8" cy="36.4" r="1.15"/><circle cx="38" cy="34.4" r="1.15"/></g>' +
      '<path d="M16 42Q31 50 46 42L47.5 49Q31 57 14.5 49Z" fill="' + (NY ? '#f5c451' : '#d92d2d') + '"/>' +
      '<path d="M21 46.6l1.4 7M28 49l1.2 7M35 49l-1.2 7M42 46.6l-1.4 7" stroke="' + (NY ? '#fffaf0' : '#fffaf0') + '" stroke-width="2" stroke-linecap="round" opacity=".9"/>' +
      '<path d="M39 50l9 4 -2 11 -7 -2Z" fill="' + (NY ? '#f5c451' : '#d92d2d') + '"/>' +
      '<g fill="#1f1f27"><circle cx="31" cy="62" r="1.9"/><circle cx="31" cy="69" r="1.9"/></g>' +
      SNOW_HAT +
    '</svg>';

  /* ---------- purr ---------- */
  // The snowman purrs when tapped: Pancake's recording, the same one the Halloween ghost uses.
  var purr = null;
  function playPurr(el) {
    try {
      if (!purr) { purr = new Audio('pancake-purr.mp3?v=3.74'); purr.preload = 'auto'; }
      purr.currentTime = 0;
      var pr = purr.play(); if (pr && pr.catch) pr.catch(function () {});
    } catch (err) { /* no audio: stay silent */ }
    el.classList.remove('xm-pop'); void el.offsetWidth; el.classList.add('xm-pop');
  }

  /* ---------- bubble lights ---------- */
  // A string of 1960s bubble lights standing on a cord just under the header. Count follows the screen width.
  function lights(box) {
    var n = Math.max(8, Math.floor(box.clientWidth / 34)), s = '';
    for (var i = 0; i < n; i++) {
      s += '<i class="bl c' + (i % 5) + '" style="--d:' + (((i * 37) % 23) / 10).toFixed(1) + 's"><b></b><b></b><b></b></i>';
    }
    box.innerHTML = s;
  }

  /* ---------- falling snow / confetti, twinkles ---------- */
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function fall(kind, n) {
    var s = '';
    for (var i = 0; i < n; i++) {
      var sz = kind === 'flake' ? 3 + rnd() * 4 : 6 + rnd() * 4;
      s += '<i class="xm-' + kind + ' k' + (i % 5) + '" style="left:' + (rnd() * 100).toFixed(1) + '%;width:' + sz.toFixed(1) + 'px;' +
        (kind === 'conf' ? 'height:' + (sz * 1.7).toFixed(1) + 'px;' : 'height:' + sz.toFixed(1) + 'px;') +
        '--dx:' + ((rnd() - .5) * 90).toFixed(0) + 'px;animation-duration:' + (11 + rnd() * 9).toFixed(1) + 's;animation-delay:-' + (rnd() * 20).toFixed(1) + 's"></i>';
    }
    return s;
  }
  function twinkles(n) {
    var s = '';
    for (var i = 0; i < n; i++) {
      s += '<i class="xm-tw" style="left:' + (4 + rnd() * 92).toFixed(1) + '%;top:' + (10 + rnd() * 78).toFixed(1) + '%;--s:' + (9 + rnd() * 8).toFixed(0) + 'px;animation-delay:-' + (rnd() * 6).toFixed(1) + 's;animation-duration:' + (2.4 + rnd() * 2.4).toFixed(1) + 's"></i>';
    }
    return s;
  }

  function build() {
    // Header logo, tab icon and a seasonal greeting.
    var icon = NY ? 'icon-newyear.svg' : 'icon-christmas.svg';
    var logo = document.querySelector('.logo');
    if (logo) logo.src = icon;
    document.querySelectorAll('link[rel=icon][type="image/svg+xml"]').forEach(function (l) { l.href = icon; });
    var ft = document.querySelector('.foot');
    if (ft) {
      var g = document.createElement('span');
      g.className = 'xm-greet';
      g.textContent = NY ? '🥂 Happy New Year ' + YEAR + ' 🥂' : '🎄 Merry Christmas 🎄';
      ft.insertBefore(g, ft.querySelector('#updated') || null);
    }

    // Bubble lights on the header (never take clicks, never move the layout).
    var top = document.querySelector('.top');
    if (top) {
      var lb = document.createElement('div');
      lb.className = 'xm-lights';
      lb.setAttribute('aria-hidden', 'true');
      top.appendChild(lb);
      lights(lb);
      var t = 0;
      window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { lights(lb); }, 200); });
    }

    // Falling snow (Christmas) or confetti and twinkles (New Year), plus Santa and the snowman peeking up from the bottom edge.
    var d = document.createElement('div');
    d.id = 'xm-decor';
    d.innerHTML =
      (NY ? fall('conf', 26) + twinkles(9) : fall('flake', 26)) +
      '<i class="xm-santa" aria-hidden="true">' + SANTA + '</i>' +
      '<i class="xm-snowman" role="button" tabindex="0" aria-label="Play Pancake\'s purr">' + SNOWMAN + '</i>';
    document.body.appendChild(d);
    var sm = d.querySelector('.xm-snowman');
    var go = function (e) {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); playPurr(sm);
    };
    sm.addEventListener('click', go);
    sm.addEventListener('keydown', go);
    h.classList.add('xm-ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
