/* SkyWatch ant: every so often a small ant walks across the screen, then leaves (never more than two at a time).
   It is drawn in SVG and driven frame by frame, so the legs move with the distance walked (a tripod gait: three legs
   on the ground, three swinging), the antennae feel ahead, and the path wanders instead of running in a line.
   It never takes clicks and never moves the layout. Adding ?ant=now to the address sends two straight away. At most two ants are ever on screen. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  var NS = 'http://www.w3.org/2000/svg';
  var active = 0, MAX = 2;                     // never more than two ants on screen

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

  function walk() {
    if (active >= MAX) return;
    active++;
    var W = window.innerWidth, H = window.innerHeight, M = 40;
    var part = build();
    var host = document.createElement('div');
    host.className = 'ant-host';
    host.appendChild(part.svg);
    document.body.appendChild(host);

    // start just off one edge, aim for a point near the opposite edge
    var edge = Math.floor(Math.random() * 4), x, y, tx, ty;
    var rx = function (lo, hi) { return lo + Math.random() * (hi - lo); };
    if (edge === 0) { x = -M; y = rx(.15, .85) * H; tx = W + M * 2; ty = rx(.1, .9) * H; }
    else if (edge === 1) { x = W + M; y = rx(.15, .85) * H; tx = -M * 2; ty = rx(.1, .9) * H; }
    else if (edge === 2) { x = rx(.15, .85) * W; y = -M; tx = rx(.1, .9) * W; ty = H + M * 2; }
    else { x = rx(.15, .85) * W; y = H + M; tx = rx(.1, .9) * W; ty = -M * 2; }
    var th = Math.atan2(ty - y, tx - x);
    var speed = 0, base = 60 + Math.random() * 40, t = 0, phase = 0, last = 0, pauseT = 0, nextPause = 2 + Math.random() * 4, pauses = 0;
    var seed = Math.random() * 100, entered = false, done = false;

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
      var bob = Math.sin(phase * 2) * 0.35;
      host.style.transform = 'translate3d(' + (x - 17).toFixed(1) + 'px,' + (y - 11 + bob).toFixed(1) + 'px,0) rotate(' + (th * 180 / Math.PI).toFixed(1) + 'deg)';
      var inside = x > -M && x < W + M && y > -M && y < H + M;
      if (inside) entered = true;
      if ((entered && !inside) || t > 90) { finish(); return; }
      requestAnimationFrame(frame);
    }
    function finish() { done = true; active--; if (host.parentNode) host.parentNode.removeChild(host); }
    requestAnimationFrame(frame);
  }

  // A new ant every 20-60 s while the app is open, so a second one sometimes joins the first (walk() caps it at two).
  function schedule(lo, hi) {
    setTimeout(function () {
      if (document.visibilityState === 'visible') walk();
      schedule(20000, 60000);
    }, lo + Math.random() * (hi - lo));
  }
  if (/[?&]ant=now/.test(location.search)) { setTimeout(walk, 600); setTimeout(walk, 3500); }   // preview: two ants
  else schedule(10000, 30000);
})();
