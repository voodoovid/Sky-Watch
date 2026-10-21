/* SkyWatch ant: only while the Halloween skin is on (html.hw), now and then a small ant walks across the screen, then leaves.
   In every other season, and with Options > Holiday skins Off, no ants walk (the Christmas skin has gingerbread.js instead). Usually one; sometimes a second follows (never more than two).
   Each ant lives in the browser's top layer (a manual popover), so it also crawls across pop-up screens (target details, options, guide) instead of walking behind them.
   It is drawn in SVG and driven frame by frame, so the legs move with the distance walked (a tripod gait: three legs
   on the ground, three swinging), the antennae feel ahead, and the path wanders instead of running in a line.
   It never takes clicks and never moves the layout. Adding ?ant=now to the address sends two straight away. At most two ants are ever on screen.
   In October (spider.js) an ant that walks onto the spider's web is handed over to it: see HW.web.catchAnt. Adding ?ant=web sends one at the web. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  if (!document.documentElement.classList.contains('hw')) return;   // ants belong to the Halloween skin only
  var NS = 'http://www.w3.org/2000/svg';
  var active = 0, MAX = 2;                     // never more than two ants on screen
  var canPop = typeof HTMLElement !== 'undefined' && !!HTMLElement.prototype.showPopover;
  var hosts = [];                              // ants currently walking (so they can be lifted above a pop-up that opens)
  function lift(h) { try { h.hidePopover(); h.showPopover(); } catch (e) {} }   // re-showing puts it back on top of the top layer
  var sheet = document.getElementById('sheet');
  if (canPop && sheet && window.MutationObserver) {
    new MutationObserver(function () { if (sheet.open) hosts.forEach(lift); }).observe(sheet, { attributes: true, attributeFilter: ['open'] });
  }

  // leg anchors along the thorax and each leg's resting knee and foot (side +1; side -1 mirrors y)
  var LEGS = [
    { ax: 2.4, knee: [2.6, 4.4], foot: [5.8, 7.2], grp: 0 },    // front
    { ax: 0.4, knee: [0.2, 4.8], foot: [1.2, 8.2], grp: 1 },    // middle
    { ax: -1.6, knee: [-2.6, 4.4], foot: [-6.2, 7.0], grp: 0 }  // hind
  ];

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function build() {
    var svg = el('svg', { viewBox: '-17 -11 34 22', width: '34', height: '22', 'aria-hidden': 'true' });
    svg.className.baseVal = 'ant';
    var defs = el('defs', {}, svg);
    var g = el('linearGradient', { id: 'antg', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    el('stop', { offset: '0', 'stop-color': '#4a2a1a' }, g);
    el('stop', { offset: '.5', 'stop-color': '#1d1009' }, g);
    el('stop', { offset: '1', 'stop-color': '#0a0605' }, g);
    var root = el('g', {}, svg);
    var legs = [];
    LEGS.forEach(function (L) {
      [1, -1].forEach(function (s) {
        var grp = el('g', { transform: 'translate(' + L.ax + ' ' + (1.4 * s) + ')' }, root);
        var rot = el('g', {}, grp);
        // coordinates are relative to the anchor so the swing pivots on the body
        el('path', { d: 'M0 0L' + (L.knee[0] - L.ax) + ' ' + (L.knee[1] * s - 1.4 * s) + 'L' + (L.foot[0] - L.ax) + ' ' + (L.foot[1] * s - 1.4 * s),
          fill: 'none', stroke: '#150b06', 'stroke-width': '.95', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, rot);
        legs.push({ rot: rot, ax: L.ax, ay: 1.4 * s, grp: (L.grp + (s > 0 ? 0 : 1)) % 2, idx: L.ax });
      });
    });
    var ants = [];
    [1, -1].forEach(function (s) {
      var a = el('g', { transform: 'translate(8.2 ' + (0.9 * s) + ')' }, root), r = el('g', {}, a);
      el('path', { d: 'M0 0L3 ' + (2.2 * s) + 'L6 ' + (1.2 * s), fill: 'none', stroke: '#150b06', 'stroke-width': '.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, r);
      ants.push({ rot: r, s: s });
    });
    // body: gaster, petiole, thorax, head, with a little sheen
    el('ellipse', { cx: '-7.4', cy: '0', rx: '5.6', ry: '3.7', fill: 'url(#antg)' }, root);
    el('ellipse', { cx: '-2.6', cy: '0', rx: '1.3', ry: '1', fill: '#150b06' }, root);
    el('ellipse', { cx: '0.4', cy: '0', rx: '3.7', ry: '2.2', fill: 'url(#antg)' }, root);
    el('ellipse', { cx: '6', cy: '0', rx: '3.3', ry: '2.7', fill: 'url(#antg)' }, root);
    el('path', { d: 'M8.6 -1.4L10.6 -.5M8.6 1.4L10.6 .5', stroke: '#150b06', 'stroke-width': '.8', 'stroke-linecap': 'round' }, root);
    el('ellipse', { cx: '-8.6', cy: '-1.4', rx: '2.8', ry: '1', fill: '#fff', opacity: '.16' }, root);
    el('ellipse', { cx: '0.6', cy: '-.8', rx: '1.9', ry: '.7', fill: '#fff', opacity: '.14' }, root);
    el('circle', { cx: '7', cy: '-1.9', r: '.55', fill: '#fff', opacity: '.22' }, root);
    el('circle', { cx: '7', cy: '1.9', r: '.55', fill: '#fff', opacity: '.22' }, root);
    return { svg: svg, legs: legs, ants: ants };
  }

  function norm(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  function walk(aim) {
    if (active >= MAX) return;
    active++;
    var W = window.innerWidth, H = window.innerHeight, M = 40;
    var part = build();
    var host = document.createElement('div');
    host.className = 'ant-host';
    host.appendChild(part.svg);
    if (canPop) host.setAttribute('popover', 'manual');
    document.body.appendChild(host);
    if (canPop) { try { host.showPopover(); } catch (e) {} }
    hosts.push(host);

    // start just off one edge, aim for a point near the opposite edge
    var edge = Math.floor(Math.random() * 4), x, y, tx, ty;
    var rx = function (lo, hi) { return lo + Math.random() * (hi - lo); };
    if (edge === 0) { x = -M; y = rx(.15, .85) * H; tx = W + M * 2; ty = rx(.1, .9) * H; }
    else if (edge === 1) { x = W + M; y = rx(.15, .85) * H; tx = -M * 2; ty = rx(.1, .9) * H; }
    else if (edge === 2) { x = rx(.15, .85) * W; y = -M; tx = rx(.1, .9) * W; ty = H + M * 2; }
    else { x = rx(.15, .85) * W; y = H + M; tx = rx(.1, .9) * W; ty = -M * 2; }
    // in October some ants head for the spider's web (HW.web.center is null in every other season)
    var web = window.HW && HW.web && HW.web.center && HW.web.center(), aimOn = false;
    if (web && (aim === true || Math.random() < 0.25)) {
      var side = Math.floor(Math.random() * 3), cl = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
      if (side === 0) { x = -M; y = cl(web.y + rx(-.25, .25) * H, M, H - M); }
      else if (side === 1) { x = rx(.2, .8) * W; y = H + M; }
      else { x = W + M; y = cl(web.y + rx(-.25, .25) * H, M, H - M); }
      tx = web.x; ty = web.y; aimOn = true;
    }
    var th = Math.atan2(ty - y, tx - x);
    var speed = 0, base = 60 + Math.random() * 40, t = 0, phase = 0, last = 0, pauseT = 0, nextPause = 2 + Math.random() * 4, pauses = 0;
    var seed = Math.random() * 100, entered = false, done = false, caught = false;

    function frame(now) {
      if (done) return;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now; t += dt;
      var moving = pauseT <= 0;
      if (moving) {
        // ease up to cruising speed, with slow surges as a real ant has
        var want = base * (0.8 + 0.3 * Math.sin(t * 0.9 + seed));
        speed += (want - speed) * Math.min(1, dt * 4);
        if (t > nextPause && pauses < 2 && x > 0.12 * W && x < 0.88 * W && y > 0.12 * H && y < 0.88 * H) {
          pauseT = 0.7 + Math.random() * 1.3; pauses++; nextPause = t + 4 + Math.random() * 5;
        }
      } else {
        speed += (0 - speed) * Math.min(1, dt * 9);
        pauseT -= dt;
      }
      if (aimOn) {                                       // keep heading for the web; once past it, carry on out the far side
        var wc = HW.web.center();
        if (wc && Math.hypot(wc.x - x, wc.y - y) > 30) { tx = wc.x; ty = wc.y; }
        else { aimOn = false; tx = x + Math.cos(th) * 900; ty = y + Math.sin(th) * 900; }
      }
      // wander: a smooth, uneven sway on top of a steady pull toward the exit
      var want2 = Math.atan2(ty - y, tx - x);
      var sway = 0.55 * Math.sin(t * 1.3 + seed) + 0.35 * Math.sin(t * 2.9 + seed * 2.1);
      th += norm(want2 - th) * Math.min(1, dt * 0.9) + sway * dt * (speed > 4 ? 1 : 0.2);
      x += Math.cos(th) * speed * dt; y += Math.sin(th) * speed * dt;
      phase += speed * dt * 0.3;                         // one leg cycle per ~21 px walked
      part.legs.forEach(function (L) {
        var a = Math.sin(phase + (L.grp ? Math.PI : 0)) * 17 * Math.min(1, speed / 25);
        var lift = Math.max(0, Math.cos(phase + (L.grp ? Math.PI : 0)));
        L.rot.setAttribute('transform', 'rotate(' + (a * (L.ay > 0 ? 1 : -1)).toFixed(1) + ')');
        L.rot.style.opacity = (0.82 + 0.18 * (1 - lift)).toFixed(2);
      });
      part.ants.forEach(function (A) {
        var a = (14 * Math.sin(t * 7.5 + (A.s > 0 ? 0 : 1.7) + seed) + (pauseT > 0 ? 10 * Math.sin(t * 17) : 0)) * A.s;
        A.rot.setAttribute('transform', 'rotate(' + a.toFixed(1) + ')');
      });
      // an ant that steps onto the Halloween spider's web sticks, and the spider takes it from here
      if (!caught && window.HW && HW.web && HW.web.catchAnt && HW.web.catchAnt(host, part, x, y, th * 180 / Math.PI, speed, finish)) {
        caught = true; host.removeAttribute('popover'); return;   // the web takes it from here (it is no longer a popover)
      }
      var bob = Math.sin(phase * 2) * 0.35;
      host.style.transform = 'translate3d(' + (x - 17).toFixed(1) + 'px,' + (y - 11 + bob).toFixed(1) + 'px,0) rotate(' + (th * 180 / Math.PI).toFixed(1) + 'deg)';
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

  // An ant every 35-90 s while the app is open, only when none is already walking.
  // About one visit in five brings a second ant a few seconds behind the first.
  function schedule(lo, hi) {
    setTimeout(function () {
      if (document.visibilityState === 'visible' && active === 0) {
        walk();
        if (Math.random() < 0.2) setTimeout(function () { walk(); }, 1500 + Math.random() * 3500);
      }
      schedule(35000, 90000);
    }, lo + Math.random() * (hi - lo));
  }
  if (/[?&]ant=now/.test(location.search)) { setTimeout(walk, 600); setTimeout(walk, 3500); }   // preview: two ants
  else if (/[?&]ant=web/.test(location.search)) { setTimeout(function () { walk(true); }, 1200); }   // preview: one ant, straight at the web
  else schedule(12000, 30000);
})();
