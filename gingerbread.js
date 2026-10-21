/* SkyWatch gingerbread man: the Christmas / New Year counterpart of the Halloween ant (ant.js).
   index.html loads this file only while the Christmas or New Year skin is on, so nothing walks in any other season.
   Now and then a little iced gingerbread man waddles across the screen, arms swinging, and sometimes stops to wave. Usually one;
   sometimes a second follows (never more than two). In the New Year week he wears a gold party hat.
   Like the ant he lives in the browser's top layer (a manual popover), so he also crosses pop-up screens, never takes clicks and
   never moves the layout. Adding ?gingerbread=now (with ?season=christmas) sends two straight away. Red night mode tints him red. */
(function () {
  'use strict';
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var NY = document.documentElement.classList.contains('ny');
  var NS = 'http://www.w3.org/2000/svg';
  var active = 0, MAX = 2;
  var canPop = typeof HTMLElement !== 'undefined' && !!HTMLElement.prototype.showPopover;
  var hosts = [];
  function lift(h) { try { h.hidePopover(); h.showPopover(); } catch (e) {} }

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  var COOKIE = '#b8733b', SHADE = '#8f5127', ICING = '#fffaf0';

  function build() {
    var svg = el('svg', { viewBox: '-15 -21 30 40', width: '30', height: '40', 'aria-hidden': 'true' });
    svg.className.baseVal = 'gbm';
    var root = el('g', {}, svg);
    var legs = [], arms = [];
    // legs: pivot at the hip, swing in opposite phase
    [-1, 1].forEach(function (s) {
      var g = el('g', { transform: 'translate(' + (2.9 * s) + ' 5)' }, root), r = el('g', {}, g);
      el('path', { d: 'M0 0L' + (1.7 * s) + ' 10', fill: 'none', stroke: SHADE, 'stroke-width': '5.6', 'stroke-linecap': 'round' }, r);
      el('path', { d: 'M0 0L' + (1.7 * s) + ' 10', fill: 'none', stroke: COOKIE, 'stroke-width': '4.6', 'stroke-linecap': 'round' }, r);
      el('path', { d: 'M' + (1.7 * s - 2.1) + ' 8.2Q' + (1.7 * s) + ' 9.4 ' + (1.7 * s + 2.1) + ' 8.2', fill: 'none', stroke: ICING, 'stroke-width': '1', 'stroke-linecap': 'round' }, r);
      legs.push({ rot: r, s: s });
    });
    // arms: pivot at the shoulder, held out a little and swinging against the legs
    [-1, 1].forEach(function (s) {
      var g = el('g', { transform: 'translate(' + (4.4 * s) + ' -3.6)' }, root), r = el('g', {}, g);
      el('path', { d: 'M0 0L' + (7.4 * s) + ' 2.4', fill: 'none', stroke: SHADE, 'stroke-width': '5', 'stroke-linecap': 'round' }, r);
      el('path', { d: 'M0 0L' + (7.4 * s) + ' 2.4', fill: 'none', stroke: COOKIE, 'stroke-width': '4', 'stroke-linecap': 'round' }, r);
      el('path', { d: 'M' + (5.6 * s) + ' 0.2Q' + (6.5 * s) + ' 2 ' + (5.7 * s) + ' 4.2', fill: 'none', stroke: ICING, 'stroke-width': '1', 'stroke-linecap': 'round' }, r);
      arms.push({ rot: r, s: s });
    });
    // torso and head, with icing
    el('rect', { x: '-5.6', y: '-8', width: '11.2', height: '15', rx: '4.6', fill: SHADE }, root);
    el('rect', { x: '-5.2', y: '-8.2', width: '10.4', height: '14.4', rx: '4.4', fill: COOKIE }, root);
    el('circle', { cx: '0', cy: '-12.4', r: '6.2', fill: SHADE }, root);
    el('circle', { cx: '0', cy: '-12.7', r: '5.9', fill: COOKIE }, root);
    el('ellipse', { cx: '-1.8', cy: '-15.4', rx: '2.6', ry: '1.1', fill: '#fff', opacity: '.2' }, root);
    el('circle', { cx: '-2.2', cy: '-13.4', r: '.95', fill: ICING }, root);
    el('circle', { cx: '2.2', cy: '-13.4', r: '.95', fill: ICING }, root);
    el('path', { d: 'M-2.6 -10.6Q0 -8.4 2.6 -10.6', fill: 'none', stroke: ICING, 'stroke-width': '.95', 'stroke-linecap': 'round' }, root);
    el('circle', { cx: '-3.6', cy: '-11.2', r: '1', fill: '#ff8f8f', opacity: '.55' }, root);
    el('circle', { cx: '3.6', cy: '-11.2', r: '1', fill: '#ff8f8f', opacity: '.55' }, root);
    // bow and buttons
    el('path', { d: 'M0 -6.2L-3.4 -8.1L-3.4 -4.3ZM0 -6.2L3.4 -8.1L3.4 -4.3Z', fill: NY ? '#f5c451' : '#d92d2d' }, root);
    el('circle', { cx: '0', cy: '-6.2', r: '1', fill: NY ? '#e0a82e' : '#b01f24' }, root);
    el('circle', { cx: '0', cy: '-1.4', r: '1.25', fill: '#d92d2d' }, root);
    el('circle', { cx: '0', cy: '2.6', r: '1.25', fill: '#2f9e56' }, root);
    // icing outline along the torso hem
    el('path', { d: 'M-3.4 6Q0 7.2 3.4 6', fill: 'none', stroke: ICING, 'stroke-width': '.9', 'stroke-linecap': 'round' }, root);
    if (NY) {
      el('path', { d: 'M-3.6 -17.6L0.4 -26L4.4 -17.6Z', fill: '#f5c451' }, root);
      el('path', { d: 'M-1.6 -20.6l3 1.2M-0.6 -23.2l2.4 .9', stroke: '#1c2550', 'stroke-width': '1', 'stroke-linecap': 'round' }, root);
      el('circle', { cx: '0.4', cy: '-26', r: '1.4', fill: ICING }, root);
    }
    return { svg: svg, legs: legs, arms: arms, root: root };
  }

  function walk() {
    if (active >= MAX) return;
    active++;
    var W = window.innerWidth, H = window.innerHeight, M = 40;
    var part = build();
    var host = document.createElement('div');
    host.className = 'gbm-host';
    host.appendChild(part.svg);
    if (canPop) host.setAttribute('popover', 'manual');
    document.body.appendChild(host);
    if (canPop) { try { host.showPopover(); } catch (e) {} }
    hosts.push(host);

    // he walks in from one side edge and heads for the other, drifting only a little up or down
    var dir = Math.random() < 0.5 ? 1 : -1;
    var y = (0.18 + Math.random() * 0.68) * H, x = dir > 0 ? -M : W + M;
    var ty = Math.max(0.1 * H, Math.min(0.92 * H, y + (Math.random() - 0.5) * 0.4 * H)), tx = dir > 0 ? W + M * 2 : -M * 2;
    var speed = 0, base = 52 + Math.random() * 28, t = 0, phase = 0, last = 0, pauseT = 0, pauses = 0, waveT = 0;
    var nextPause = 3 + Math.random() * 4, seed = Math.random() * 100, entered = false, done = false;
    var th = Math.atan2(ty - y, tx - x);

    function frame(now) {
      if (done) return;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now; t += dt;
      var moving = pauseT <= 0;
      if (moving) {
        var want = base * (0.85 + 0.2 * Math.sin(t * 0.8 + seed));
        speed += (want - speed) * Math.min(1, dt * 4);
        if (t > nextPause && pauses < 2 && x > 0.15 * W && x < 0.85 * W) {
          pauseT = 1.1 + Math.random() * 1; pauses++; nextPause = t + 4 + Math.random() * 5; waveT = 0;
        }
      } else {
        speed += (0 - speed) * Math.min(1, dt * 9);
        pauseT -= dt; waveT += dt;
      }
      var want2 = Math.atan2(ty - y, tx - x);
      th += (want2 - th) * Math.min(1, dt * 0.9);
      x += Math.cos(th) * speed * dt; y += Math.sin(th) * speed * dt;
      phase += speed * dt * 0.16;                          // one stride per ~39 px
      var sw = Math.min(1, speed / 25);
      part.legs.forEach(function (L) {
        L.rot.setAttribute('transform', 'rotate(' + (Math.sin(phase + (L.s > 0 ? 0 : Math.PI)) * 24 * sw).toFixed(1) + ')');
      });
      part.arms.forEach(function (A) {
        var a;
        // the right arm points to +x, so a negative angle lifts it; while he pauses it is raised and waves
        if (pauseT > 0 && A.s > 0) a = -(62 + 22 * Math.sin(waveT * 13));
        else a = Math.sin(phase + (A.s > 0 ? Math.PI : 0)) * 20 * sw * A.s;
        A.rot.setAttribute('transform', 'rotate(' + a.toFixed(1) + ')');
      });
      var tilt = Math.sin(phase) * 5 * sw, bob = Math.abs(Math.sin(phase)) * -1.2 * sw;
      part.root.setAttribute('transform', 'rotate(' + tilt.toFixed(1) + ' 0 5)');
      host.style.transform = 'translate3d(' + (x - 15).toFixed(1) + 'px,' + (y - 21 + bob).toFixed(1) + 'px,0)';
      var inside = x > -M && x < W + M && y > -M && y < H + M;
      if (inside) entered = true;
      if ((entered && !inside) || t > 90) { finish(); return; }
      requestAnimationFrame(frame);
    }
    function finish() {
      done = true; active--;
      var i = hosts.indexOf(host); if (i >= 0) hosts.splice(i, 1);
      if (host.parentNode) host.parentNode.removeChild(host);
    }
    requestAnimationFrame(frame);
  }

  function schedule(lo, hi) {
    setTimeout(function () {
      if (document.visibilityState === 'visible' && active === 0) {
        walk();
        if (Math.random() < 0.2) setTimeout(function () { walk(); }, 1500 + Math.random() * 3500);
      }
      schedule(35000, 90000);
    }, lo + Math.random() * (hi - lo));
  }

  function start() {
    var sheet = document.getElementById('sheet');
    if (canPop && sheet && window.MutationObserver) {
      new MutationObserver(function () { if (sheet.open) hosts.forEach(lift); }).observe(sheet, { attributes: true, attributeFilter: ['open'] });
    }
    if (/[?&]gingerbread=now/.test(location.search)) { setTimeout(walk, 600); setTimeout(walk, 3500); }
    else schedule(12000, 30000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
