/* SkyWatch Halloween spider (October only: index.html loads this right after halloween.js).
   A black widow (glossy black, round abdomen, red hourglass) sits head-down at the hub of a web in the top-right corner of the Tonight card. It is drawn in SVG
   and, when it moves, driven frame by frame: eight jointed legs placed with two-bone IK in a tetrapod gait, the way a
   real spider walks (dashes and pauses, turns in place first). While it sits still nothing runs but two tiny SMIL
   animations (breathing, a leg twitch).
   If an ant (ant.js) walks onto the web, ant.js hands it over through HW.web.catchAnt(): the glue stops it, it
   thrashes, the web quivers, the spider runs out along a spoke, bites it, spins silk over it while turning it, tows the
   bundle back to the hub, hangs it there, and later eats it. The whole thing takes about 25 seconds, then the web is
   free again; the spider then drops on a silk thread down the screen, and climbs back up it a few seconds later. It never takes clicks and never moves the layout. Add ?ant=web to the address to send an ant straight at it. */
(function () {
  'use strict';
  var HW = window.HW = window.HW || {};
  var NS = 'http://www.w3.org/2000/svg';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 104, H = 124, HUB = { x: 60, y: 52 }, REST_H = 1.68;   // web box (px), hub, resting heading (head down)
  // where the spokes are anchored: the card's top and right edges, and open space (faded out by the mask)
  var ANCH = [[10, 0], [40, 0], [76, 0], [104, 6], [104, 44], [104, 86], [90, 118], [54, 124], [18, 112], [2, 74], [4, 34]];
  // spider geometry (px, body faces +x): hip on the carapace, resting foot, and total leg length, for legs 1-4
  var HIP = [[3.2, 2.4], [1.4, 3], [-0.6, 3.1], [-2.6, 2.7]];
  var REST = [[16, 12], [9, 17], [-6, 16.5], [-17, 11]];
  var LEN = [19, 18.5, 16.5, 19.5];
  var SL = 8.5, SPIN_X = -22.2;                                   // stride length, spinnerets at the tip of the abdomen

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function norm(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function fx(v) { return v.toFixed(1); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function css(e, v) { e.style.transform = v; e.style.webkitTransform = v; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  /* ---------- the web ---------- */
  function makeWeb(svg) {
    var n = ANCH.length, k, d;
    var defs = el('defs', {}, svg);
    // the outer edge of the web melts into the card instead of ending in thin air
    var rg = el('radialGradient', { id: 'hwwf', gradientUnits: 'userSpaceOnUse', cx: W, cy: 0, r: 140 }, defs);
    el('stop', { offset: '.5', 'stop-color': '#fff' }, rg);
    el('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': '.12' }, rg);
    var mk = el('mask', { id: 'hwwm', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H }, defs);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#hwwf)' }, mk);
    var g = el('g', { mask: 'url(#hwwm)' }, svg);

    d = '';                                                       // spokes
    ANCH.forEach(function (a) { d += 'M' + HUB.x + ' ' + HUB.y + 'L' + a[0] + ' ' + a[1]; });
    el('path', { d: d, 'class': 'th spoke' }, g);
    d = '';                                                       // frame threads (not along the card's own edge)
    for (k = 0; k < n; k++) {
      var a = ANCH[k], b = ANCH[(k + 1) % n];
      if ((a[1] === 0 && b[1] === 0) || (a[0] === W && b[0] === W)) continue;
      d += 'M' + a[0] + ' ' + a[1] + 'L' + b[0] + ' ' + b[1];
    }
    el('path', { d: d, 'class': 'th frame' }, g);

    // the catching spiral: one thread winding outward, sagging a little between spokes, like a real orb web
    var nodes = [], K = n * 9, f0 = 0.19, f1 = 0.95;
    for (k = 0; k <= K; k++) {
      var s = ANCH[k % n], f = (f0 + (f1 - f0) * k / K) * (1 + 0.022 * Math.sin(k * 2.3));
      nodes.push({ x: HUB.x + (s[0] - HUB.x) * f, y: HUB.y + (s[1] - HUB.y) * f });
    }
    d = 'M' + fx(nodes[0].x) + ' ' + fx(nodes[0].y);
    for (k = 1; k < nodes.length; k++) {
      var p = nodes[k - 1], q = nodes[k], mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      d += 'Q' + fx(mx + (HUB.x - mx) * 0.14) + ' ' + fx(my + (HUB.y - my) * 0.14) + ' ' + fx(q.x) + ' ' + fx(q.y);
    }
    el('path', { d: d, 'class': 'th spiral' }, g);
    d = '';                                                       // the tight spiral round the hub
    var HK = n * 3;
    for (k = 0; k <= HK; k++) {
      var s2 = ANCH[k % n], f2 = 0.045 + 0.125 * k / HK;
      d += (k ? 'L' : 'M') + fx(HUB.x + (s2[0] - HUB.x) * f2) + ' ' + fx(HUB.y + (s2[1] - HUB.y) * f2);
    }
    el('path', { d: d, 'class': 'th spiral' }, g);
    for (k = 4; k < nodes.length; k += 9) {                       // dew
      el('circle', { cx: fx(nodes[k].x), cy: fx(nodes[k].y), r: (0.7 + 0.35 * ((k * 7) % 3) / 2).toFixed(2), 'class': 'dew' }, g);
    }
    return nodes;
  }

  /* ---------- the spider ---------- */
  function makeSpider() {
    var svg = el('svg', { viewBox: '-32 -32 64 64', width: 64, height: 64, 'class': 'hw-spider' });
    var defs = el('defs', {}, svg), i;
    var ga = el('radialGradient', { id: 'hwsA', cx: '.42', cy: '.34', r: '.78' }, defs);
    el('stop', { offset: '0', 'stop-color': '#5b5b68' }, ga);
    el('stop', { offset: '.35', 'stop-color': '#1b1b22' }, ga);
    el('stop', { offset: '1', 'stop-color': '#040406' }, ga);
    var gc = el('radialGradient', { id: 'hwsC', cx: '.4', cy: '.35', r: '.8' }, defs);
    el('stop', { offset: '0', 'stop-color': '#4a4a56' }, gc);
    el('stop', { offset: '1', 'stop-color': '#0a0a0d' }, gc);
    var gr = el('linearGradient', { id: 'hwsR', x1: '0', y1: '0', x2: '1', y2: '0' }, defs);
    el('stop', { offset: '0', 'stop-color': '#ff3b2a' }, gr);
    el('stop', { offset: '1', 'stop-color': '#c00d10' }, gr);

    var legsG = el('g', {}, svg), legs = [];
    for (i = 0; i < 8; i++) {
      var p = i >> 1, s = (i & 1) ? -1 : 1, w = el('g', {}, legsG);
      var L = { p: p, s: s, grp: (p + (i & 1)) & 1, hx: HIP[p][0], hy: HIP[p][1] * s };
      L.fd = el('path', { 'class': 'sp-leg', 'stroke-width': '1.3' }, w);
      L.td = el('path', { 'class': 'sp-leg', 'stroke-width': '.95' }, w);
      L.fb = el('path', { 'class': 'sp-band', 'stroke-width': '.4' }, w);
      L.tb = el('path', { 'class': 'sp-band', 'stroke-width': '.3' }, w);
      L.kn = el('circle', { r: '.8', 'class': 'sp-knee' }, w);
      if (!reduce && (i === 1 || i === 4 || i === 7)) {          // now and then a leg flexes, as a resting spider's do
        var hp = L.hx + ' ' + L.hy;
        el('animateTransform', { attributeName: 'transform', type: 'rotate', dur: (6 + i * 0.9).toFixed(1) + 's', repeatCount: 'indefinite',
          values: '0 ' + hp + ';0 ' + hp + ';' + (7 * s) + ' ' + hp + ';' + (-3 * s) + ' ' + hp + ';0 ' + hp, keyTimes: '0;.8;.86;.93;1' }, w);
      }
      legs.push(L);
    }

    var body = el('g', {}, svg);
    var ab = el('g', { transform: 'translate(-12.4 0)' }, body), abi = el('g', {}, ab);
    if (!reduce) el('animateTransform', { attributeName: 'transform', type: 'scale', values: '1 1;1.035 1.075;1 1', keyTimes: '0;.5;1',
      calcMode: 'spline', keySplines: '.4 0 .6 1;.4 0 .6 1', dur: '3.8s', repeatCount: 'indefinite' }, abi);
    el('path', { d: 'M9 0C9 -6.4 4.5 -9.2 -1 -9C-6.5 -8.7 -10 -4.6 -10 0C-10 4.6 -6.5 8.7 -1 9C4.5 9.2 9 6.4 9 0Z', fill: 'url(#hwsA)', stroke: '#000', 'stroke-width': '.5' }, abi);
    el('path', { d: 'M-7.2 -3.4L-3 0L-7.2 3.4ZM1.4 -3.4L-3 0L1.4 3.4Z', fill: 'url(#hwsR)', stroke: '#7a0608', 'stroke-width': '.3', 'stroke-linejoin': 'round' }, abi);   // the red hourglass
    el('ellipse', { cx: '2.4', cy: '-5', rx: '4.4', ry: '1.7', transform: 'rotate(-14 2.4 -5)', fill: '#fff', opacity: '.26' }, abi);   // gloss
    el('ellipse', { cx: '-5.5', cy: '4.6', rx: '2.2', ry: '.9', transform: 'rotate(28 -5.5 4.6)', fill: '#fff', opacity: '.1' }, abi);
    el('ellipse', { cx: SPIN_X + 12.4, cy: '0', rx: '1.3', ry: '1', fill: '#000' }, ab);   // spinnerets
    el('ellipse', { cx: '-4.8', cy: '0', rx: '1.7', ry: '1.5', fill: '#0a0a0c' }, body);        // waist
    el('ellipse', { cx: '0', cy: '0', rx: '5.4', ry: '4.4', fill: 'url(#hwsC)', stroke: '#000', 'stroke-width': '.5' }, body);
    el('ellipse', { cx: '4.7', cy: '0', rx: '3.4', ry: '2.9', fill: 'url(#hwsC)', stroke: '#000', 'stroke-width': '.4' }, body);
    el('ellipse', { cx: '.6', cy: '-1.5', rx: '3.2', ry: '1', fill: '#fff', opacity: '.13' }, body);
    var palps = el('g', { fill: 'none', stroke: '#1c1c22', 'stroke-width': '1.1', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, body);
    el('path', { d: 'M7.4 -1.2L9.5 -2.7L10.8 -1.3M7.4 1.2L9.5 2.7L10.8 1.3' }, palps);
    [[6.7, -.8], [6.7, .8], [6, -1.9], [6, 1.9], [4.9, -1.2], [4.9, 1.2], [4.6, -2.3], [4.6, 2.3]].forEach(function (c) {
      el('circle', { cx: c[0], cy: c[1], r: '.42', fill: '#16161b' }, body);
      el('circle', { cx: c[0] - .12, cy: c[1] - .12, r: '.14', fill: '#fff', opacity: '.7' }, body);
    });
    return { svg: svg, legs: legs };
  }

  // two-bone IK: the knee bows outward, away from the body's centre line
  function ik(hx, hy, fx_, fy_, len, side) {
    var L1 = len * 0.52, L2 = len * 0.48, dx = fx_ - hx, dy = fy_ - hy, D = Math.sqrt(dx * dx + dy * dy) || 0.001, mx = L1 + L2 - 0.2;
    if (D > mx) { fx_ = hx + dx * mx / D; fy_ = hy + dy * mx / D; dx = fx_ - hx; dy = fy_ - hy; D = mx; }
    var a = (L1 * L1 - L2 * L2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, L1 * L1 - a * a)), ux = dx / D, uy = dy / D;
    var px = -uy, py = ux;
    if (py * side < 0) { px = -px; py = -py; }
    return { kx: hx + ux * a + px * h, ky: hy + uy * a + py * h, fx: fx_, fy: fy_ };
  }
  function toBody(S, wx, wy) {
    var dx = wx - S.x, dy = wy - S.y, c = Math.cos(S.h), s = Math.sin(S.h);
    return [dx * c + dy * s, -dx * s + dy * c];
  }
  function toWorld(S, bx, by) {
    var c = Math.cos(S.h), s = Math.sin(S.h);
    return [S.x + bx * c - by * s, S.y + bx * s + by * c];
  }

  // pose the spider: S = {x, y, h (rad), phase, amp}; ov[i] = {x, y, w} pulls leg i toward a point in the body frame.
  // Returns the feet in web coordinates.
  function drawSpider(sp, S, ov) {
    css(sp.svg, 'translate(' + fx(S.x - 32) + 'px,' + fx(S.y - 32) + 'px) rotate(' + (S.h * 57.2958).toFixed(1) + 'deg)');
    var feet = [];
    for (var i = 0; i < 8; i++) {
      var L = sp.legs[i], R = REST[L.p], u = (((S.phase + (L.grp ? 0.5 : 0)) % 1) + 1) % 1, off, lift = 0;
      if (u < 0.5) { var t = u * 2; off = -0.5 + t * t * (3 - 2 * t); lift = Math.sin(Math.PI * t); }   // swing
      else off = 0.5 - (u - 0.5) * 2;                                                                // stance
      var x = R[0] + off * SL * S.amp, y = L.s * (R[1] - 1.8 * lift * S.amp);
      if (ov && ov[i]) { x += (ov[i].x - x) * ov[i].w; y += (ov[i].y - y) * ov[i].w; }
      var k = ik(L.hx, L.hy, x, y, LEN[L.p], L.s);
      L.fd.setAttribute('d', 'M' + fx(L.hx) + ' ' + fx(L.hy) + 'L' + fx(k.kx) + ' ' + fx(k.ky));
      L.fb.setAttribute('d', 'M' + fx(L.hx) + ' ' + fx(L.hy) + 'L' + fx(k.kx) + ' ' + fx(k.ky));
      L.td.setAttribute('d', 'M' + fx(k.kx) + ' ' + fx(k.ky) + 'L' + fx(k.fx) + ' ' + fx(k.fy));
      L.tb.setAttribute('d', 'M' + fx(k.kx) + ' ' + fx(k.ky) + 'L' + fx(k.fx) + ' ' + fx(k.fy));
      L.kn.setAttribute('cx', fx(k.kx)); L.kn.setAttribute('cy', fx(k.ky));
      feet.push(toWorld(S, k.fx, k.fy));
    }
    return feet;
  }

  /* ---------- silk wound over the ant (drawn inside the ant's own box, so it turns with it) ---------- */
  function makeSilk(host) {
    var svg = el('svg', { viewBox: '-17 -11 34 22', width: 34, height: 22, 'class': 'hw-silk' });
    var defs = el('defs', {}, svg);
    var cp = el('clipPath', { id: 'hwsc' }, defs), cr = el('rect', { x: 12, y: -8, width: 0, height: 16 }, cp);
    var g = el('g', { 'clip-path': 'url(#hwsc)' }, svg);
    var fill = el('rect', { x: -14.5, y: -5.4, width: 27, height: 10.8, rx: 5.4, 'class': 'sk-fill' }, g);
    var bands = el('g', {}, g);
    for (var k = 0; k < 14; k++) {
      var x = 11 - k * 1.9;
      el('path', { d: (k % 2) ? 'M' + x + ' -5.8C' + (x + 1.9) + ' -2 ' + (x + 1.9) + ' 2 ' + x + ' 5.8' : 'M' + (x - 1.4) + ' -5.8L' + (x + 1.9) + ' 5.8', 'class': 'sk-band' }, bands);
    }
    host.appendChild(svg);
    return { svg: svg, cr: cr, fill: fill, bands: bands };
  }
  function setWrap(K, w, roll) {
    K.cr.setAttribute('x', fx(12 - w * 28)); K.cr.setAttribute('width', fx(w * 28 + 2));
    K.fill.style.opacity = (0.84 * clamp(w * 1.25, 0, 1)).toFixed(2);
    K.bands.setAttribute('transform', 'translate(' + (roll * 0.9).toFixed(2) + ' 0)');
  }

  /* ---------- the hunt ---------- */
  var M = null;                                                   // {box, svg, sp, S, dyn, nodes, T, cool}

  function antPt(T, lx, ly) {
    var r = T.th * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [T.ax + lx * c - ly * s, T.ay + lx * s + ly * c];
  }
  function placeAnt(T, jx, jy, jr, sc, sy, op) {
    css(T.host, 'translate3d(' + fx(T.ax + jx - 17) + 'px,' + fx(T.ay + jy - 11) + 'px,0) rotate(' + (T.th + jr).toFixed(1) + 'deg) scale(' + sc.toFixed(3) + ',' + (sc * sy).toFixed(3) + ')');
    T.host.style.opacity = op;
  }
  function thrash(T, k) {
    var ph = T.t * 38;
    T.part.legs.forEach(function (L, i) {
      var a = (Math.sin(ph + (L.grp ? Math.PI : 0) + i * 0.9) * 30 + Math.sin(ph * 1.7 + i * 2.1) * 12) * k;
      L.rot.setAttribute('transform', 'rotate(' + (a * (L.ay > 0 ? 1 : -1)).toFixed(1) + ')');
    });
    T.part.ants.forEach(function (A, i) {
      var a = (Math.sin(T.t * 31 + i * 2) * 32 + Math.sin(T.t * 11 + i) * 14) * k * A.s;
      A.rot.setAttribute('transform', 'rotate(' + a.toFixed(1) + ')');
    });
  }
  function legFade(T, o) {
    T.part.legs.forEach(function (L) { L.rot.style.opacity = o.toFixed(2); });
    T.part.ants.forEach(function (A) { A.rot.style.opacity = o.toFixed(2); });
  }

  function go(T, st) { T.st = st; T.st0 = T.t; }

  // walk toward a point: turn first, then dash and pause. Returns the distance still to go.
  function drive(S, tx, ty, dt, vmax, turn) {
    var dx = tx - S.x, dy = ty - S.y, d = Math.sqrt(dx * dx + dy * dy), err = norm(Math.atan2(dy, dx) - S.h);
    S.h += clamp(err, -turn * dt, turn * dt);
    S.dashT -= dt;
    if (S.dashT <= 0) { S.go = !S.go; S.dashT = S.go ? 0.26 + Math.random() * 0.24 : 0.06 + Math.random() * 0.1; }
    var want = (S.go ? vmax : 0) * Math.max(0, 1 - Math.abs(err) / 0.9) * Math.min(1, d / 10 + 0.15);
    S.v += (want - S.v) * Math.min(1, dt * 14);
    var mv = Math.min(d, S.v * dt);
    S.x += Math.cos(S.h) * mv; S.y += Math.sin(S.h) * mv; S.phase += mv / SL;
    S.ampT = Math.max(S.ampT, Math.min(1, S.v / 25));
    if (Math.abs(err) > 0.3) S.ampT = Math.max(S.ampT, 0.7);        // shuffling round to face the way it is going
    return d - mv;
  }
  function turnTo(S, ang, dt, rate) {
    var err = norm(ang - S.h), st = clamp(err, -rate * dt, rate * dt);
    S.h += st; S.phase += Math.abs(st) * 0.5;
    if (Math.abs(st) > 0.002) S.ampT = Math.max(S.ampT, 0.7);
    return Math.abs(err - st);
  }
  // legs that take hold of something on the ant: each goes to the nearest of four points on its body
  function holdOv(T, S, ids, w) {
    var ov = [], c = [antPt(T, 5, -3), antPt(T, 5, 3), antPt(T, -4, -3), antPt(T, -4, 3)];
    ids.forEach(function (i) {
      var L = M.sp.legs[i], rf = toWorld(S, REST[L.p][0], L.s * REST[L.p][1]), best = 0, bd = 1e9;
      c.forEach(function (p, n) { var d = (p[0] - rf[0]) * (p[0] - rf[0]) + (p[1] - rf[1]) * (p[1] - rf[1]); if (d < bd) { bd = d; best = n; } });
      var b = toBody(S, c[best][0], c[best][1]);
      ov[i] = { x: b[0], y: b[1], w: w };
    });
    return ov;
  }

  function planRun(T) {
    var dx = T.ax - HUB.x, dy = T.ay - HUB.y, dist = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dy, dx), best = 0, bd = 9;
    ANCH.forEach(function (a, i) {
      var d = Math.abs(norm(Math.atan2(a[1] - HUB.y, a[0] - HUB.x) - ang));
      if (d < bd) { bd = d; best = i; }
    });
    var sa = Math.atan2(ANCH[best][1] - HUB.y, ANCH[best][0] - HUB.x), r = dist * Math.cos(bd), pts = [];
    T.A = null;
    if (r > 10) { T.A = { x: HUB.x + Math.cos(sa) * r, y: HUB.y + Math.sin(sa) * r }; pts.push(T.A); }   // along a spoke...
    var from = T.A || HUB, vx = T.ax - from.x, vy = T.ay - from.y, vd = Math.sqrt(vx * vx + vy * vy) || 1;
    pts.push({ x: T.ax - vx / vd * 15, y: T.ay - vy / vd * 15 });                                       // ...then across to the ant
    T.path = pts;
  }

  function step(T, dt) {
    var S = T.S, t = T.t - T.st0, st = T.st, k = 0, ov = null, jr = 0, jx = 0, jy = 0, sy = 1, sc = 1, op = 1, w = 0, spin = null, i;
    S.ampT = 0;

    if (st === 'stuck') {                                         // the glue stops it within a few pixels
      T.sv *= Math.exp(-dt * 9);
      T.ax += Math.cos(T.th * Math.PI / 180) * T.sv * dt; T.ay += Math.sin(T.th * Math.PI / 180) * T.sv * dt;
      k = 1;
      if (t > 0.45) turnTo(S, Math.atan2(T.ay - S.y, T.ax - S.x), dt, 7);
      if (t > 1.3) { planRun(T); go(T, 'run'); }
    } else if (st === 'run') {
      k = 1;
      if (drive(S, T.path[0].x, T.path[0].y, dt, 95, 8) < 2.5) { T.path.shift(); if (!T.path.length) go(T, 'bite'); }
    } else if (st === 'bite') {
      var ta = Math.atan2(T.ay - S.y, T.ax - S.x);
      turnTo(S, ta, dt, 8);
      ov = holdOv(T, S, [0, 1], smooth(t / 0.28));
      k = t < 0.3 ? 1 : 1.5 * Math.exp(-(t - 0.3) * 4);          // the bite: one violent jerk, then it weakens
      if (t > 0.3 && t - dt <= 0.3) T.web.classList.add('hw-quiver');
      if (t > 0.8) go(T, 'wrap');
    } else if (st === 'wrap') {
      w = clamp(t / 5.4, 0, 1);
      k = Math.pow(1 - w, 1.3) * 0.9;
      turnTo(S, Math.atan2(T.ay - S.y, T.ax - S.x), dt, 3);
      var tp = (Math.sin(t * 7.5) + 1) / 2;                       // the hind legs draw silk out and fling it over the prey
      ov = holdOv(T, S, [0, 1], 1);
      var thr = holdOv(T, S, [6, 7], 1);
      ov[6] = thr[6]; ov[7] = thr[7]; ov[6].w = tp; ov[7].w = 1 - tp;
      jx = Math.cos(S.h + 1.57) * Math.sin(t * 29) * 0.35; jy = Math.sin(S.h + 1.57) * Math.sin(t * 29) * 0.35;   // the spider's effort
      var roll = Math.sin(t * 2.1);
      jr = 15 * roll * (1 - w * 0.4); sy = 1 - 0.13 * Math.abs(roll);
      T.roll = roll;
      if (w >= 1) go(T, 'turn');
      spin = tp > 0.5 ? 6 : 7;
    } else if (st === 'turn') {
      w = 1;
      var er = turnTo(S, Math.atan2(HUB.y - S.y, HUB.x - S.x), dt, 7);
      T.web.classList.remove('hw-quiver');
      if (t > 0.5 && er < 0.1) { T.C = { x: T.ax, y: T.ay }; T.path = T.A ? [T.A, { x: HUB.x, y: HUB.y }] : [{ x: HUB.x, y: HUB.y }]; go(T, 'carry'); }
    } else if (st === 'carry') {                                  // tows the bundle on a thread
      w = 1;
      var rem = drive(S, T.path[0].x, T.path[0].y, dt, 70, 8);
      var tx = S.x - Math.cos(S.h) * 22, ty = S.y - Math.sin(S.h) * 22;
      T.C.x += (tx - T.C.x) * Math.min(1, dt * 9); T.C.y += (ty - T.C.y) * Math.min(1, dt * 9);
      T.ax = T.C.x; T.ay = T.C.y;
      var da = Math.atan2(S.y - T.C.y, S.x - T.C.x) * 180 / Math.PI - T.th; while (da > 180) da -= 360; while (da < -180) da += 360;
      T.th += da * Math.min(1, dt * 8);
      if (rem < 2.5) { T.path.shift(); if (!T.path.length) go(T, 'settle'); }
    } else if (st === 'settle') {
      w = 1;
      turnTo(S, REST_H, dt, 4);
      T.ax = T.C.x; T.ay = T.C.y;
      T.lar = smooth(t / 0.6);
      if (t > 1) go(T, 'rest');
    } else if (st === 'rest') {                                   // the bundle hangs by the hub
      w = 1; T.lar = 1; turnTo(S, REST_H, dt, 4);
      jr = 3 * Math.sin(T.t * 1.6); jy = 0.5 * Math.sin(T.t * 1.1);
      if (t > 5.5) {
        var ux = T.C.x - HUB.x, uy = T.C.y - HUB.y, ud = Math.sqrt(ux * ux + uy * uy) || 1;
        T.F = { x: T.C.x - ux / ud * 13, y: T.C.y - uy / ud * 13 }; go(T, 'feedgo');
      }
    } else if (st === 'feedgo') {
      w = 1; T.lar = 1; jr = 3 * Math.sin(T.t * 1.6);
      if (drive(S, T.F.x, T.F.y, dt, 55, 8) < 2) go(T, 'feed');
    } else if (st === 'feed') {                                   // eats
      w = 1; T.lar = 1;
      turnTo(S, Math.atan2(T.ay - S.y, T.ax - S.x), dt, 6);
      T.cp = { x: T.ax, y: T.ay };
      ov = holdOv(T, S, [0, 1], 1);
      jx = Math.cos(S.h + 1.57) * Math.sin(t * 22) * 0.3; jy = Math.sin(S.h + 1.57) * Math.sin(t * 22) * 0.3;
      jr = 3 * Math.sin(T.t * 1.6); sc = 1 - 0.22 * smooth(t / 4.2);
      if (t > 4.2) go(T, 'vanish');
    } else if (st === 'vanish') {                                 // nothing left but a husk, then not even that
      w = 1; T.lar = 1 - smooth(t / 1.2); op = 1 - smooth(t / 1.2); sc = 0.78;
      var rh = drive(S, HUB.x, HUB.y, dt, 55, 8);
      if (t > 1.3 && rh < 2) { beginDrop(T); go(T, 'fall'); }
    } else if (st === 'fall' || st === 'away' || st === 'climb') {     // meal over: it drops from the web on a thread, down the screen
      w = 1; T.lar = 0; op = 0; sc = 0.78;
      var hr = M.box.getBoundingClientRect(), hx = hr.left + HUB.x, hy = hr.top + HUB.y;
      if (st === 'fall') {                                         // legs tucked, falling faster and faster, swaying on the thread
        T.vy = Math.min(T.vy + 760 * dt, 460);
        S.y += T.vy * dt; S.x = hx + 3 * Math.sin(T.t * 2.6) * Math.min(1, t * 2);
        S.h = 1.5708 + 0.12 * Math.sin(T.t * 3.1);
        if (S.y > window.innerHeight + 90) go(T, 'away');
      } else if (st === 'away') {                                  // out of sight below the screen for a few seconds
        S.x = hx;
        if (t > 3.2) { S.h = -1.5708; go(T, 'climb'); }
      } else {                                                     // then back up the thread, hand over hand
        var cv = 170 + Math.min(120, Math.max(0, S.y - hy) * 0.15);
        S.h = -1.5708; S.x = hx; S.y -= cv * dt; S.phase += cv * dt / SL; S.ampT = 1;
        if (S.y <= hy + 3) { reparent(T); S.x = HUB.x; S.y = HUB.y; S.amp = 0.6; go(T, 'home'); }
      }
      if (T.ov) {                                                  // the drop line, from the hub to the spider's spinnerets
        var sp1 = toWorld(S, SPIN_X, 0);
        T.line.setAttribute('x1', fx(hx)); T.line.setAttribute('y1', fx(hy)); T.line.setAttribute('x2', fx(sp1[0])); T.line.setAttribute('y2', fx(sp1[1]));
        T.line.style.opacity = '0.9';
      }
    } else if (st === 'home') {
      w = 1; T.lar = 0; op = 0; sc = 0.78;
      if (turnTo(S, REST_H, dt, 4) < 0.05 || t > 1.5) { endHunt(T); return; }
    }

    // ant: struggle, wrapping and where it sits
    if (st === 'run' || st === 'stuck' || st === 'bite' || st === 'wrap') {
      thrash(T, k);
      jx += (Math.sin(T.t * 57) + Math.sin(T.t * 31.7)) * 0.4 * k; jy += (Math.sin(T.t * 49) + Math.sin(T.t * 26.3)) * 0.4 * k;
      jr += (Math.sin(T.t * 43) * 6 + Math.sin(T.t * 17) * 4) * k;
    }
    if (w > 0.5) legFade(T, clamp(1 - (w - 0.5) / 0.3, 0, 1));
    setWrap(T.silk, w, T.roll || 0);
    placeAnt(T, jx, jy, jr, sc, sy, op);

    // spider
    S.amp += (S.ampT - S.amp) * Math.min(1, dt * 12);
    if (S.ampT === 0 && S.amp < 0.02) { S.amp = 0; S.v = 0; }
    var feet = drawSpider(M.sp, S, ov);
    // silk: the glue strands, the thread the spider draws out, the thread it tows, and the one the bundle hangs by
    var sp0 = toWorld(S, SPIN_X, 0);
    for (i = 0; i < T.strands.length; i++) {
      var sd = T.strands[i], ap = antPt(T, sd.lx, sd.ly);
      sd.e.setAttribute('x1', fx(sd.nx)); sd.e.setAttribute('y1', fx(sd.ny)); sd.e.setAttribute('x2', fx(ap[0])); sd.e.setAttribute('y2', fx(ap[1]));
      sd.e.style.opacity = (st === 'stuck' || st === 'run' || st === 'bite' || st === 'wrap') ? '0.85' : (st === 'turn' ? (1 - smooth(t / 0.4)).toFixed(2) : '0');
    }
    if (spin) {
      var ft = feet[spin], ap2 = antPt(T, -1, 0);
      T.spin.setAttribute('d', 'M' + fx(sp0[0]) + ' ' + fx(sp0[1]) + 'L' + fx(ft[0]) + ' ' + fx(ft[1]) + 'L' + fx(ap2[0]) + ' ' + fx(ap2[1]));
      T.spin.style.opacity = '0.9';
    } else T.spin.style.opacity = '0';
    if (st === 'carry') {
      T.drag.setAttribute('x1', fx(sp0[0])); T.drag.setAttribute('y1', fx(sp0[1])); T.drag.setAttribute('x2', fx(T.ax)); T.drag.setAttribute('y2', fx(T.ay));
      T.drag.style.opacity = '0.9';
    } else T.drag.style.opacity = '0';
    if (T.lar > 0 && T.C) {
      T.larder.setAttribute('x1', HUB.x); T.larder.setAttribute('y1', HUB.y); T.larder.setAttribute('x2', fx(T.ax)); T.larder.setAttribute('y2', fx(T.ay));
      T.larder.style.opacity = (0.85 * T.lar).toFixed(2);
    } else T.larder.style.opacity = '0';
    if (T.t > 80) endHunt(T);
  }

  // the spider leaves the web box for a full-screen layer above the cards, so it can drop down the screen
  function beginDrop(T) {
    var r = M.box.getBoundingClientRect(), S = M.S, ov = document.createElement('div'), ln = document.createElementNS(NS, 'svg');
    ov.className = 'hw-fall';
    ln.setAttribute('class', 'hw-threads hw-line');
    T.line = el('line', { 'class': 'th spin', 'stroke-width': '1' }, ln);
    ov.appendChild(ln);
    ov.appendChild(M.sp.svg);
    document.body.appendChild(ov);
    T.ov = ov; T.vy = 40;
    S.x += r.left; S.y += r.top; S.h = 1.5708; S.v = 0; S.amp = 0; S.ampT = 0;
    if (!T.fin) { T.fin = true; T.finish(); }                     // the ant is long gone: free its slot now
  }
  function reparent(T) {
    if (!T.ov) return;
    M.box.appendChild(M.sp.svg);
    if (T.ov.parentNode) T.ov.parentNode.removeChild(T.ov);
    T.ov = null;
  }

  function endHunt(T) {
    reparent(T);
    M.T = null;
    M.web.classList.remove('hw-quiver');
    M.S.x = HUB.x; M.S.y = HUB.y; M.S.h = REST_H; M.S.v = 0; M.S.amp = 0; M.S.ampT = 0; M.S.phase = 0;
    drawSpider(M.sp, M.S, null);
    while (M.dyn.firstChild) M.dyn.removeChild(M.dyn.firstChild);
    M.cool = performance.now() + 20000;
    if (!T.fin) { T.fin = true; T.finish(); }                     // ant.js removes the bundle and frees its slot
  }

  function tick(now) {
    var T = M && M.T;
    if (!T) return;
    var dt = T.last ? Math.min(0.05, (now - T.last) / 1000) : 0.016;
    T.last = now; T.t += dt;
    step(T, dt);
    if (M.T === T) requestAnimationFrame(tick);
  }

  // ant.js asks this every frame: is the ant (centre x, y in the viewport, heading th in degrees) on the web?
  function catchAnt(host, part, x, y, th, speed, finish) {
    if (!M || M.T || reduce || performance.now() < M.cool) return false;
    if (document.documentElement.classList.contains('red')) return false;
    var r = M.box.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > window.innerHeight) return false;
    var ax = x - r.left, ay = y - r.top, ex = (ax - HUB.x) / 40, ey = (ay - HUB.y) / 46;
    if (ex * ex + ey * ey > 1) return false;
    var T = M.T = { host: host, part: part, finish: finish, ax: ax, ay: ay, th: th, sv: speed, t: 0, st: 'stuck', st0: 0, last: 0, S: M.S,
      web: M.svg, roll: 0, lar: 0, C: null, A: null, path: [] };
    M.box.insertBefore(host, M.sp.svg);                           // the ant now lives on the web, under the spider
    host.style.position = 'absolute'; host.style.zIndex = '1';
    T.silk = makeSilk(host);
    // sticky strands from the ant to the nearest spiral threads, spread around it
    var near = M.nodes.slice().sort(function (a, b) { return Math.hypot(a.x - ax, a.y - ay) - Math.hypot(b.x - ax, b.y - ay); }), chosen = [], rad = th * Math.PI / 180;
    near.forEach(function (nd) {
      if (chosen.length >= 4) return;
      var an = Math.atan2(nd.y - ay, nd.x - ax), ok = true;
      chosen.forEach(function (c) { if (Math.abs(norm(c.an - an)) < 1.1) ok = false; });
      if (ok) chosen.push({ nd: nd, an: an });
    });
    T.strands = chosen.map(function (c) {
      var lx = Math.cos(c.an - rad) * 7, ly = Math.sin(c.an - rad) * 3.2;     // where on the ant's body it clings
      return { nx: c.nd.x, ny: c.nd.y, lx: lx, ly: ly, e: el('line', { 'class': 'th strand' }, M.dyn) };
    });
    T.spin = el('path', { 'class': 'th spin', fill: 'none' }, M.dyn);
    T.drag = el('line', { 'class': 'th spin' }, M.dyn);
    T.larder = el('line', { 'class': 'th spin' }, M.dyn);
    M.svg.classList.add('hw-quiver');
    requestAnimationFrame(tick);
    return true;
  }

  function build() {
    var card = document.getElementById('verdictCard');
    if (!card || M) return;
    var box = document.createElement('div');
    box.className = 'hw-web';
    box.setAttribute('aria-hidden', 'true');
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'class': 'hw-threads' });
    box.appendChild(svg);
    var nodes = makeWeb(svg);
    var dyn = el('g', {}, svg);
    var sp = makeSpider();
    box.appendChild(sp.svg);
    card.appendChild(box);
    var S = { x: HUB.x, y: HUB.y, h: REST_H, v: 0, phase: 0, amp: 0, ampT: 0, go: true, dashT: 0.3 };
    drawSpider(sp, S, null);
    M = { box: box, svg: svg, sp: sp, S: S, dyn: dyn, nodes: nodes, T: null, cool: 0, web: svg };
    document.documentElement.classList.add('hw-web-on');
  }

  HW.web = {
    catchAnt: catchAnt,
    center: function () {                                          // the hub in viewport coordinates (null if not showing)
      if (!M || reduce || document.documentElement.classList.contains('red')) return null;
      var r = M.box.getBoundingClientRect();
      return r.width ? { x: r.left + HUB.x, y: r.top + HUB.y } : null;
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
