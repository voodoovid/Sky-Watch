/* SkyWatch Halloween skin (October only).
   index.html loads this file, and halloween.css, only while the device's date is in October (or with ?season=halloween
   for a preview). Nothing here runs the rest of the year, so the normal skin comes back on its own on November 1 and
   returns every October 1. app.js asks HW.moon() for the Moon glyph, so the Moon card and the Moon path show a
   jack-o'-lantern whose shaded side follows the real phase. */
(function () {
  'use strict';
  var HW = window.HW = {};
  var uid = 0;
  var f = function (v) { return v.toFixed(2); };

  /* ---------- the pumpkin Moon ---------- */
  var BODY = [[-48, 2, 52, 82], [48, 2, 52, 82], [-24, 3, 50, 86], [24, 3, 50, 86], [0, 3, 44, 88]];
  HW.moon = function (cx, cy, r, angle, lat) {
    var id = 'hw' + (++uid);
    var rad = angle * Math.PI / 180, k = (1 - Math.cos(rad)) / 2;   // lit fraction
    var litRight = angle < 180;
    if (lat < 0) litRight = !litRight;
    var rx = r * Math.abs(Math.cos(rad)), gibbous = k > 0.5;
    var term = litRight ? (gibbous ? 1 : 0) : (gibbous ? 0 : 1);
    var E = 1.4 * r, sx = litRight ? 1 : -1;
    var lit = k < 0.01 ? '' : k > 0.99
      ? 'M' + f(cx - E) + ' ' + f(cy - E) + ' H' + f(cx + E) + ' V' + f(cy + E) + ' H' + f(cx - E) + 'Z'
      : 'M' + f(cx) + ' ' + f(cy - E) + ' H' + f(cx + sx * E) + ' V' + f(cy + E) + ' H' + f(cx) + ' V' + f(cy + r) +
        ' A' + f(rx) + ' ' + r + ' 0 0 ' + term + ' ' + f(cx) + ' ' + f(cy - r) + 'Z';
    var s = r * 0.009, dy = 0.1 * r;                                // pumpkin drawn in a 200-unit box, scaled to fit the disc
    var ell = BODY.map(function (e) { return '<ellipse cx="' + e[0] + '" cy="' + e[1] + '" rx="' + e[2] + '" ry="' + e[3] + '"/>'; }).join('');
    var tf = 'translate(' + f(cx) + ' ' + f(cy + dy) + ') scale(' + f(s) + ')';
    var ellT = BODY.map(function (e) { return '<ellipse transform="' + tf + '" cx="' + e[0] + '" cy="' + e[1] + '" rx="' + e[2] + '" ry="' + e[3] + '"/>'; }).join('');
    var box = 'userSpaceOnUse" x="' + f(cx - 2 * r) + '" y="' + f(cy - 2 * r) + '" width="' + f(4 * r) + '" height="' + f(4 * r) + '"';
    var small = r < 16;                                             // tiny Moon on the path: skip the fine detail
    // eyes, nose and mouth are separate paths so the Great Pumpkin can wink and chew (ant.js)
    var face = '<path class="hw-eyeL" d="M-62 -18 L-22 -38 L-14 -6Z"/><path class="hw-eyeR" d="M62 -18 L22 -38 L14 -6Z"/><path d="M0 4 L-12 26 H12Z"/><path class="hw-mouth" d="M-68 36 L-50 52 L-36 40 L-20 58 L0 42 L20 58 L36 40 L50 52 L68 36 Q50 84 0 86 Q-50 84 -68 36Z"/>';
    return '<defs>' +
      '<radialGradient id="' + id + 'o" cx=".38" cy=".32" r=".8"><stop offset="0" style="stop-color:var(--hw-o1)"/><stop offset=".55" style="stop-color:var(--hw-o2)"/><stop offset="1" style="stop-color:var(--hw-o3)"/></radialGradient>' +
      '<radialGradient id="' + id + 'h"><stop offset=".55" style="stop-color:var(--hw-o1);stop-opacity:.34"/><stop offset="1" style="stop-color:var(--hw-o1);stop-opacity:0"/></radialGradient>' +
      '<clipPath id="' + id + 'c">' + ellT + '</clipPath>' +
      '<filter id="' + id + 'b" filterUnits="' + box + '><feGaussianBlur stdDeviation="' + f(Math.max(0.35, r * 0.06)) + '"/></filter>' +
      '<filter id="' + id + 'g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>' +
      '<mask id="' + id + 'k" maskUnits="' + box + '><rect x="' + f(cx - 2 * r) + '" y="' + f(cy - 2 * r) + '" width="' + f(4 * r) + '" height="' + f(4 * r) + '" fill="#fff"/>' +
      (lit ? '<path d="' + lit + '" fill="#000" filter="url(#' + id + 'b)"/>' : '') + '</mask>' +
      '</defs>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + f(r * 1.12) + '" fill="url(#' + id + 'h)"/>' +
      '<g transform="' + tf + '">' +
        '<g fill="url(#' + id + 'o)">' + ell + '</g>' +
        (small ? '' : '<g fill="none" style="stroke:var(--hw-o3)" stroke-opacity=".55" stroke-width="4" stroke-linecap="round"><path d="M-72 -62C-96 -20 -96 30 -72 72"/><path d="M-38 -76C-54 -30 -54 40 -38 80"/><path d="M38 -76C54 -30 54 40 38 80"/><path d="M72 -62C96 -20 96 30 72 72"/></g>') +
        '<path d="M-10 -78C-16 -96 -4 -108 14 -114C14 -104 11 -96 7 -90C5 -86 5 -82 5 -78Z" style="fill:var(--hw-stem)"/>' +
      '</g>' +
      // the unlit side of the pumpkin, from the real Moon phase
      '<g clip-path="url(#' + id + 'c)"><g mask="url(#' + id + 'k)">' +
        '<rect x="' + f(cx - 2 * r) + '" y="' + f(cy - 2 * r) + '" width="' + f(4 * r) + '" height="' + f(4 * r) + '" style="fill:var(--hw-shade)" opacity=".74"/></g></g>' +
      // the candle inside: the face always glows, even at New Moon
      '<g class="hw-flame" transform="' + tf + '"><g style="fill:var(--hw-glow)" opacity=".7" filter="url(#' + id + 'g)">' + face + '</g><g style="fill:var(--hw-glow)">' + face + '</g></g>';
  };

  /* ---------- decorations ---------- */
  var GHOST = '<svg viewBox="0 0 40 48" aria-hidden="true"><path d="M20 3C11 3 5 10 5 19v24l5-4 5 5 5-5 5 5 5-5 5 4V19C35 10 29 3 20 3z" fill="#f4efff"/><ellipse cx="14.5" cy="19" rx="3.2" ry="4.4" fill="#2a1740"/><ellipse cx="25.5" cy="19" rx="3.2" ry="4.4" fill="#2a1740"/><ellipse cx="20" cy="30" rx="3.6" ry="4.6" fill="#2a1740"/></svg>';

  function build() {
    var h = document.documentElement;
    // Header logo, tab icon and a Halloween greeting.
    var logo = document.querySelector('.logo');
    if (logo) logo.src = 'icon-halloween.svg';
    document.querySelectorAll('link[rel=icon][type="image/svg+xml"]').forEach(function (l) { l.href = 'icon-halloween.svg'; });
    var mc = document.querySelector('#moonCard .eyebrow');
    if (mc) mc.textContent = 'Great Pumpkin';
    var ft = document.querySelector('.foot');
    if (ft) {
      var g = document.createElement('span');
      g.className = 'hw-greet';
      g.textContent = '🎃 Happy Halloween 🎃';
      var up = ft.querySelector('#updated');
      ft.insertBefore(g, up || null);
    }
    // A floating ghost, on a layer that never takes clicks (the ghost itself does: tap it).
    var d = document.createElement('div');
    d.id = 'hw-decor';
    d.innerHTML =
      '<i class="hw-ghost" role="button" tabindex="0" aria-label="Play Pancake\'s purr">' + GHOST + '</i>';
    document.body.appendChild(d);
    // Tap the ghost and Pancake purrs (the recording from Scareisdale). Everything else on this layer stays click-through.
    var gh = d.querySelector('.hw-ghost'), purr = null;
    var play = function (e) {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      try {
        if (!purr) { purr = new Audio('pancake-purr.mp3?v=3.73'); purr.preload = 'auto'; }
        purr.currentTime = 0;
        var pr = purr.play(); if (pr && pr.catch) pr.catch(function () {});
      } catch (err) { /* no audio: stay silent */ }
      gh.classList.remove('hw-pop'); void gh.offsetWidth; gh.classList.add('hw-pop');
    };
    gh.addEventListener('click', play);
    gh.addEventListener('keydown', play);
    h.classList.add('hw-ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
