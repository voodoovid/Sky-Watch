'use strict';
/* Sky Watch — hour-by-hour night sky forecast for a Seestar S50.
   Weather: Open-Meteo (GFS, ECMWF, GEM, ICON + ensembles), MET Norway, 7Timer!.
   Astronomy: Astronomy Engine (bundled, MIT) — all sky math runs in the browser. */

const VERSION = 'v2.6';
const A = window.Astronomy;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};

const HOME_DEFAULT = Array.from({ length: 16 }, (_, i) => i <= 8 || i >= 14);
const PT16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const state = {
  units: store.get('units', 'metric'),
  red: store.get('red', false),
  spots: store.get('spots', []),
  loc: store.get('lastLoc', null), // {name, lat, lon, gps?}
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  data: null,
  night: 0, // 0 = tonight, 1 = tomorrow night
  home: store.get('home', false), // only count the part of the sky set in Options
  // 16 wedges of 22.5°, centred on N, NNE, NE … NNW. Default: NW clockwise through N and E to S.
  homeSky: (() => { const v = store.get('homeSky', null); return Array.isArray(v) && v.length === 16 ? v.map(Boolean) : HOME_DEFAULT.slice(); })(),
};

/* ---------- formatting ---------- */
const fmtTime = (d) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: state.tz }).format(d);
const fmtHour = (d) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', timeZone: state.tz }).format(d);
const fmtDay = (d) => new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: state.tz }).format(d);
const isNum = (v) => typeof v === 'number' && isFinite(v);
const avg = (a) => { const v = a.filter(isNum); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const r0 = (v) => (isNum(v) ? Math.round(v) : '–');
const pct = (v) => (isNum(v) ? Math.round(v) + '%' : '–');
const temp = (c) => (!isNum(c) ? '–' : state.units === 'metric' ? Math.round(c) + '°' : Math.round(c * 9 / 5 + 32) + '°');
const tempDiff = (c) => (!isNum(c) ? '–' : state.units === 'metric' ? Math.round(c) + '°' : Math.round(c * 9 / 5) + '°');
const wind = (k) => (!isNum(k) ? '–' : state.units === 'metric' ? String(Math.round(k)) : String(Math.round(k / 1.609344)));
const windU = () => (state.units === 'metric' ? 'km/h' : 'mph');
const rain = (mm) => (!isNum(mm) ? '–' : state.units === 'metric' ? mm.toFixed(1) + ' mm' : (mm / 25.4).toFixed(2) + ' in');
/* Home sky: the wedges picked in Options (16 × 22.5°). */
const inHome = (az) => state.homeSky[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
/* Plain description of the home sky, e.g. "NW → S" (clockwise runs). */
function homeDesc() {
  const h = state.homeSky, n = h.filter(Boolean).length;
  if (n === 16) return 'whole sky';
  if (!n) return 'nothing selected';
  const start = h.findIndex((v, i) => v && !h[(i + 15) % 16]);
  const runs = [];
  for (let k = 0; k < 16; k++) {
    const i = (start + k) % 16;
    if (h[i] && !h[(i + 15) % 16]) runs.push([i, i]);
    else if (h[i]) runs[runs.length - 1][1] = i;
  }
  runs.sort((x, y) => (y[0] > y[1]) - (x[0] > x[1]) || x[0] - y[0]); // a run through north first
  return runs.map(([a, b]) => (a === b ? PT16[a] : `${PT16[a]} → ${PT16[b]}`)).join(', ');
}
const compass = (az) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((az % 360) + 360) % 360 / 45) % 8];

/* ---------- networking ---------- */
async function getJSON(url, ms = 15000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function firstOK(urls, ms) {
  let last;
  for (const u of urls) { try { return await getJSON(u, ms); } catch (e) { last = e; } }
  throw last || new Error('failed');
}

/* Deterministic models, each from its own Open-Meteo endpoint. */
const OM_FULL = 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation_probability,precipitation,temperature_2m,dew_point_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,visibility';
const OM_MID = 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation,temperature_2m,dew_point_2m,wind_speed_10m,wind_gusts_10m';
const OM_MIN = 'cloud_cover,precipitation';
const OM_MODELS = [
  { id: 'best', name: 'Open-Meteo best match', path: 'forecast' },
  { id: 'gfs', name: 'NOAA GFS / HRRR', path: 'gfs' },
  { id: 'ecmwf', name: 'ECMWF IFS', path: 'ecmwf' },
  { id: 'gem', name: 'Env. Canada GEM', path: 'gem' },
  { id: 'icon', name: 'DWD ICON', path: 'dwd-icon' },
];
function hourlyToMap(h) {
  const m = new Map();
  (h.time || []).forEach((t, i) => {
    const row = {};
    for (const k in h) if (k !== 'time') row[k] = h[k][i];
    m.set(t, row);
  });
  return m;
}
async function fetchOM(model, lat, lon) {
  const base = `https://api.open-meteo.com/v1/${model.path}?latitude=${lat}&longitude=${lon}&timezone=auto&timeformat=unixtime`;
  const urls = [OM_FULL, OM_MID, OM_MIN].flatMap((v) => [base + '&past_days=1&forecast_days=3&hourly=' + v, base + '&forecast_days=3&hourly=' + v]);
  const j = await firstOK(urls);
  return { tz: j.timezone, rows: hourlyToMap(j.hourly) };
}

/* Ensembles: % of all members with ≥0.1 mm in the hour = a true probability of precipitation. */
const ENSEMBLES = [
  { name: 'ICON ensemble', ids: ['dwd_icon_seamless_eps', 'icon_seamless'] },
  { name: 'GFS ensemble', ids: ['ncep_gefs_seamless', 'gfs_seamless', 'gfs025'] },
  { name: 'ECMWF ensemble', ids: ['ecmwf_ifs025_ensemble', 'ecmwf_ifs025'] },
  { name: 'GEM ensemble', ids: ['cmc_gem_geps', 'gem_global'] },
];
async function fetchEnsemble(ens, lat, lon) {
  const urls = ens.ids.map((id) => `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${lat}&longitude=${lon}&timeformat=unixtime&forecast_days=3&hourly=precipitation&models=${id}`);
  const j = await firstOK(urls, 20000);
  const h = j.hourly;
  const keys = Object.keys(h).filter((k) => k.startsWith('precipitation'));
  if (!keys.length) throw new Error('no members');
  const m = new Map();
  h.time.forEach((t, i) => {
    let wet = 0, n = 0;
    for (const k of keys) { const v = h[k][i]; if (isNum(v)) { n++; if (v >= 0.1) wet++; } }
    if (n) m.set(t, { wet, n });
  });
  return { rows: m, members: keys.length };
}

/* MET Norway (yr.no) — global model, includes hourly precipitation probability. */
async function fetchMET(lat, lon) {
  const j = await getJSON(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${(+lat).toFixed(4)}&lon=${(+lon).toFixed(4)}`);
  const m = new Map();
  for (const ts of j.properties.timeseries) {
    const t = Date.parse(ts.time) / 1000;
    const d = ts.data.instant.details || {};
    const n1 = (ts.data.next_1_hours && ts.data.next_1_hours.details) || {};
    m.set(t, {
      cloud_cover: d.cloud_area_fraction,
      cloud_cover_low: d.cloud_area_fraction_low,
      cloud_cover_mid: d.cloud_area_fraction_medium,
      cloud_cover_high: d.cloud_area_fraction_high,
      precipitation_probability: n1.probability_of_precipitation,
      precipitation: n1.precipitation_amount,
      temperature_2m: d.air_temperature,
      dew_point_2m: d.dew_point_temperature,
      relative_humidity_2m: d.relative_humidity,
      wind_speed_10m: isNum(d.wind_speed) ? d.wind_speed * 3.6 : null,
      wind_gusts_10m: isNum(d.wind_speed_of_gust) ? d.wind_speed_of_gust * 3.6 : null,
    });
  }
  return { rows: m };
}

/* 7Timer! ASTRO — seeing and transparency (3-hourly). */
const SEEING = ['', '<0.5″', '0.5–0.75″', '0.75–1″', '1–1.25″', '1.25–1.5″', '1.5–2″', '2–2.5″', '>2.5″'];
const QUAL = (v) => (v <= 2 ? 'Excellent' : v <= 4 ? 'Good' : v <= 6 ? 'Average' : 'Poor');
async function fetch7Timer(lat, lon) {
  const j = await getJSON(`https://www.7timer.info/bin/astro.php?lon=${(+lon).toFixed(3)}&lat=${(+lat).toFixed(3)}&ac=0&unit=metric&output=json&tzshift=0`, 20000);
  const s = String(j.init);
  const t0 = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10)) / 1000;
  return j.dataseries.map((d) => ({
    t: t0 + d.timepoint * 3600,
    seeing: d.seeing >= 1 && d.seeing <= 8 ? d.seeing : null,
    transparency: d.transparency >= 1 && d.transparency <= 8 ? d.transparency : null,
    cloud: d.cloudcover >= 1 && d.cloudcover <= 9 ? [3, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 97][d.cloudcover - 1] : null,
  }));
}

/* ---------- astronomy ---------- */
function altAz(body, date, obs) {
  const eq = A.Equator(body, date, obs, true, true);
  const h = A.Horizon(date, obs, eq.ra, eq.dec, 'normal');
  return { alt: h.altitude, az: h.azimuth };
}
function altAzRaDec(ra, dec, date, obs) {
  const h = A.Horizon(date, obs, ra, dec, 'normal');
  return { alt: h.altitude, az: h.azimuth };
}
function skyState(sunAlt) {
  if (sunAlt > -0.833) return { k: 'day', label: 'Daylight' };
  if (sunAlt > -6) return { k: 'civil', label: 'Civil twilight' };
  if (sunAlt > -12) return { k: 'nautical', label: 'Nautical twilight' };
  if (sunAlt > -18) return { k: 'astro', label: 'Astro twilight' };
  return { k: 'dark', label: 'Dark' };
}
const tdate = (t) => (t ? t.date : null);

function nightWindow(obs, now) {
  const sunNow = altAz('Sun', now, obs).alt;
  const from = sunNow > -0.833 ? now : new Date(now.getTime() - 86400000);
  const set = tdate(A.SearchRiseSet('Sun', obs, -1, from, 1.5));
  if (!set) return { set: now, rise: new Date(now.getTime() + 12 * 3600e3), polar: true };
  const rise = tdate(A.SearchRiseSet('Sun', obs, +1, set, 1.5)) || new Date(set.getTime() + 12 * 3600e3);
  let darkStart = tdate(A.SearchAltitude('Sun', obs, -1, set, 1, -18));
  let darkEnd = darkStart ? tdate(A.SearchAltitude('Sun', obs, +1, darkStart, 1, -18)) : null;
  if (darkStart && darkStart > rise) { darkStart = null; darkEnd = null; }
  return { set, rise, darkStart, darkEnd };
}

const PHASES = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
function moonInfo(obs, now, win) {
  const angle = A.MoonPhase(now);
  const illum = A.Illumination('Moon', now).phase_fraction;
  const name = PHASES[Math.floor(((angle + 22.5) % 360) / 45)];
  const next = [
    { n: 'New', a: 0 }, { n: 'First Qtr', a: 90 }, { n: 'Full', a: 180 }, { n: 'Last Qtr', a: 270 },
  ].map((p) => ({ n: p.n, d: tdate(A.SearchMoonPhase(p.a, now, 40)) })).filter((p) => p.d).sort((a, b) => a.d - b.d);
  // Moonrise / moonset events around tonight
  const events = [];
  const start = new Date(win.set.getTime() - 12 * 3600e3), end = new Date(win.rise.getTime() + 3 * 3600e3);
  for (const dir of [+1, -1]) {
    let t = start;
    for (let i = 0; i < 4; i++) {
      const e = tdate(A.SearchRiseSet('Moon', obs, dir, t, 2));
      if (!e || e > end) break;
      events.push({ kind: dir > 0 ? 'rise' : 'set', d: e });
      t = new Date(e.getTime() + 60e3);
    }
  }
  events.sort((a, b) => a.d - b.d);
  // Path through the night (10-minute steps)
  const path = [];
  for (let t = win.set.getTime(); t <= win.rise.getTime(); t += 10 * 60e3) {
    const d = new Date(t);
    path.push({ d, ...altAz('Moon', d, obs) });
  }
  // Whole-hour marks for the path image
  const hourly = [];
  for (let t = Math.ceil(win.set.getTime() / 3600e3) * 3600e3; t <= win.rise.getTime(); t += 3600e3) {
    const d = new Date(t);
    hourly.push({ d, ...altAz('Moon', d, obs) });
  }
  return { angle, illum, name, next, events, path, hourly, ageDays: (angle / 360) * 29.530589 };
}

/* ---------- night sampling & 40° windows ---------- */
const MIN_ALT = 40;          // Seestar minimum: only list targets that reach this altitude in darkness
const STEP = 5 * 60e3;       // 5-minute sampling through the night
const SEESTAR = { w: 1.28, h: 0.72, scale: 2.39 }; // S50 field in degrees, arcsec per pixel
const MOON_DEG = 0.52;       // full Moon diameter

function nightSamples(obs, win) {
  const s = [];
  for (let t = win.set.getTime(); t <= win.rise.getTime() + 1; t += STEP) {
    const d = new Date(t), m = altAz('Moon', d, obs);
    s.push({ d, sun: altAz('Sun', d, obs).alt, moon: m.alt, moonAz: m.az });
  }
  // Full darkness, falling back to nautical darkness at high latitude in summer.
  const darkLim = s.some((p) => p.sun <= -18) ? -18 : s.some((p) => p.sun <= -12) ? -12 : null;
  return { s, darkLim };
}
const lerpT = (a, b, f) => new Date(a.getTime() + (b.getTime() - a.getTime()) * f);

/* Track an object through the night: altitude curve, the windows when it is ≥40° in darkness, and its peak. */
function track(S, pos) {
  const { s, darkLim } = S;
  const curve = s.map((p) => { const h = pos(p.d); return { d: p.d, sun: p.sun, moon: p.moon, moonAz: p.moonAz, alt: h.alt, az: h.az }; });
  const dark = (p) => darkLim != null && p.sun <= darkLim;
  const home = state.home, dirOK = (p) => !home || inHome(p.az);
  const ok = (p) => dark(p) && p.alt >= MIN_ALT && dirOK(p);
  const segs = [];
  let cur = null, peak = null;
  curve.forEach((p, k) => {
    if (dark(p) && dirOK(p) && (!peak || p.alt > peak.alt)) peak = p;
    if (!ok(p)) return;
    const prev = curve[k - 1], next = curve[k + 1];
    if (!cur) {
      const up = prev && dark(prev) && prev.alt < MIN_ALT; // climbed through 40° during darkness
      const turn = prev && dark(prev) && prev.alt >= MIN_ALT && !dirOK(prev); // came round into the home sky
      cur = { s: up ? lerpT(prev.d, p.d, (MIN_ALT - prev.alt) / (p.alt - prev.alt)) : p.d, why: up ? 'alt' : turn ? 'dir' : 'dark', altS: up ? MIN_ALT : p.alt };
    }
    if (!next || !ok(next)) {
      const down = next && dark(next) && next.alt < MIN_ALT;
      const turn = next && dark(next) && next.alt >= MIN_ALT && !dirOK(next);
      cur.e = down ? lerpT(p.d, next.d, (p.alt - MIN_ALT) / (p.alt - next.alt)) : p.d;
      cur.why2 = down ? 'alt' : turn ? 'dir' : 'dark';
      segs.push(cur); cur = null;
    }
  });
  if (!peak) curve.forEach((p) => { if (dark(p) && (!peak || p.alt > peak.alt)) peak = p; });
  const hrs = segs.reduce((a, g) => a + (g.e - g.s), 0) / 3600e3;
  const first = segs[0], last = segs[segs.length - 1];
  return {
    curve, segs, hrs, peak, darkLim,
    start: first ? first.s : null, startWhy: first ? first.why : null, startAlt: first ? first.altS : null,
    end: last ? last.e : null, endWhy: last ? last.why2 : null,
  };
}
function moonSepAt(p) {
  return p && p.moon > 0 ? angSep(p, { alt: p.moon, az: p.moonAz }) : null;
}
/* Crossing times of an altitude (e.g. 0° = rise/set) along a curve. */
function crossings(curve, alt) {
  const out = [];
  for (let k = 1; k < curve.length; k++) {
    const a = curve[k - 1], b = curve[k];
    if ((a.alt < alt) !== (b.alt < alt)) out.push({ kind: b.alt >= alt ? 'rise' : 'set', d: lerpT(a.d, b.d, (alt - a.alt) / (b.alt - a.alt)) });
  }
  return out;
}

const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const PLANET_KM = { Mercury: 4879, Venus: 12104, Mars: 6779, Jupiter: 139820, Saturn: 116460, Uranus: 50724, Neptune: 49244 };
const PLANET_WIKI = { Mercury: 'Mercury (planet)' };
function planetsTonight(obs, S) {
  const out = [];
  for (const p of PLANETS) {
    const tr = track(S, (d) => altAz(p, d, obs));
    // Best placement once the sky is reasonably dark (sun below −6°).
    let best = null;
    for (const c of tr.curve) if (c.sun <= -6 && (!state.home || inHome(c.az)) && (!best || c.alt > best.alt)) best = c;
    if (!best || best.alt <= 5) continue;
    const il = A.Illumination(p, best.d);
    const distAU = il.geo_dist;
    out.push({
      kind: 'planet', id: p, name: p, type: 'Planet', ...tr, peak: best, d: best.d, alt: best.alt, az: best.az,
      mag: il.mag, phase: il.phase_fraction, distAU, size: (206265 * PLANET_KM[p]) / (distAU * 149597870.7),
      moonSep: moonSepAt(best),
    });
  }
  return out.sort((a, b) => a.d - b.d);
}

/* ---------- comets ----------
   Osculating heliocentric elements (ecliptic J2000) from JPL Horizons, each taken near the comet's
   best apparition, so two-body motion is accurate for months. Brightness: m = H + 5·log Δ + K·log r,
   with H and K fitted to published predictions for the apparition (comet brightness is never exact). */
const KM_AU = 149597870.7;
const COMETS = [
  { id: '161P', name: 'Hartley–IRAS', wiki: '161P/Hartley–IRAS', e: 0.8361681179993331, q: 1.892587535102966e8 / KM_AU, inc: 95.79191664116654, node: 1.473521009996639, peri: 47.06488486978249, tp: 2461371.678606211673, H: 9.38, K: 19.46 },
  { id: '10P', name: 'Tempel 2', wiki: '10P/Tempel', e: 0.5374246119408251, q: 2.120911443309039e8 / KM_AU, inc: 12.02706054930059, node: 117.7967585729341, peri: 195.4698312346460, tp: 2461254.616015025880, H: 9.78, K: 5.49 },
  { id: '2P', name: 'Encke', wiki: '2P/Encke', e: 0.8473340638414451, q: 5.065083253790976e7 / KM_AU, inc: 11.34784086782815, node: 334.0194576625117, peri: 187.2890785797148, tp: 2461446.726827991661, H: 11.48, K: 10.08 },
  { id: 'C/2025 Y1', name: 'ATLAS', wiki: null, e: 1.000118294982386, q: 3.892757552483266e8 / KM_AU, inc: 14.55564311402980, node: 166.5470759820520, peri: 124.2847724407763, tp: 2461692.436876253225, H: 4.96, K: 10.71 },
  { id: '45P', name: 'Honda–Mrkos–Pajdušáková', wiki: '45P/Honda–Mrkos–Pajdušáková', e: 0.8172071616460846, q: 8.355766393563002e7 / KM_AU, inc: 4.323084023780162, node: 87.66434595425542, peri: 327.9580341553426, tp: 2461648.493411391042, H: 8.45, K: 14.14 },
  { id: '104P', name: 'Kowal 2', wiki: '104P/Kowal', e: 0.6655180060584900, q: 1.604468700319012e8 / KM_AU, inc: 5.699625978696875, node: 207.1284782570459, peri: 227.3620030123528, tp: 2461691.118663450237, H: 9.84, K: 21.1 },
];
const COMET_MAG_LIMIT = 11.5; // "prominent" for a Seestar: brighter than about magnitude 11.5
const KGAUSS = 0.01720209895;
function cometHelioEcl(el, jd) {
  const q = el.q, e = el.e, dt = jd - el.tp;
  let r, nu;
  if (Math.abs(e - 1) < 1e-3) { // near-parabolic: Barker's equation
    const W = (3 * KGAUSS / Math.sqrt(2 * q * q * q)) * dt;
    const Y = Math.cbrt(W / 2 + Math.sqrt(W * W / 4 + 1));
    const s = Y - 1 / Y;
    nu = 2 * Math.atan(s); r = q * (1 + s * s);
  } else if (e < 1) {
    const a = q / (1 - e), n = KGAUSS / Math.pow(a, 1.5);
    const M = (n * dt) % (2 * Math.PI);
    let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
    for (let k = 0; k < 60; k++) { const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-13) break; }
    r = a * (1 - e * Math.cos(E));
    nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  } else {
    const a = q / (e - 1), n = KGAUSS / Math.pow(a, 1.5), M = n * dt;
    let Hh = Math.asinh(M / e);
    for (let k = 0; k < 80; k++) { const d = (e * Math.sinh(Hh) - Hh - M) / (e * Math.cosh(Hh) - 1); Hh -= d; if (Math.abs(d) < 1e-13) break; }
    r = a * (e * Math.cosh(Hh) - 1);
    nu = 2 * Math.atan2(Math.sqrt(e + 1) * Math.sinh(Hh / 2), Math.sqrt(e - 1) * Math.cosh(Hh / 2));
  }
  const D = Math.PI / 180, O = el.node * D, i = el.inc * D, u = el.peri * D + nu;
  return {
    x: r * (Math.cos(O) * Math.cos(u) - Math.sin(O) * Math.sin(u) * Math.cos(i)),
    y: r * (Math.sin(O) * Math.cos(u) + Math.cos(O) * Math.sin(u) * Math.cos(i)),
    z: r * Math.sin(u) * Math.sin(i), r,
  };
}
/* Geocentric position with light-time correction. ra/dec of date (for altitude) and J2000 (for star charts). */
function cometPos(el, date) {
  const time = A.MakeTime(date), jd = time.tt + 2451545.0;
  const earth = A.HelioVector('Earth', time);
  const eps = 23.4392911 * Math.PI / 180;
  let p = cometHelioEcl(el, jd), g, delta = 0;
  for (let k = 0; k < 2; k++) {
    const c = { x: p.x, y: p.y * Math.cos(eps) - p.z * Math.sin(eps), z: p.y * Math.sin(eps) + p.z * Math.cos(eps) };
    g = { x: c.x - earth.x, y: c.y - earth.y, z: c.z - earth.z };
    delta = Math.hypot(g.x, g.y, g.z);
    p = cometHelioEcl(el, jd - delta / 173.1446);
  }
  const vJ = new A.Vector(g.x, g.y, g.z, time);
  const j2000 = A.EquatorFromVector(vJ);
  const ofDate = A.EquatorFromVector(A.RotateVector(A.Rotation_EQJ_EQD(time), vJ));
  return { ra: ofDate.ra, dec: ofDate.dec, ra2000: j2000.ra, dec2000: j2000.dec, r: p.r, delta, mag: el.H + 5 * Math.log10(delta) + el.K * Math.log10(p.r) };
}
function cometsTonight(obs, S, win) {
  const mid = new Date((win.set.getTime() + win.rise.getTime()) / 2);
  const out = [];
  for (const c of COMETS) {
    const p0 = cometPos(c, mid);
    if (!(p0.mag <= COMET_MAG_LIMIT)) continue;
    const tr = track(S, (d) => { const p = cometPos(c, d); return altAzRaDec(p.ra, p.dec, d, obs); });
    if (tr.hrs < 0.5) continue;
    const pk = tr.peak;
    const at = cometPos(c, pk.d);
    out.push({
      kind: 'comet', id: c.id, name: c.name, type: 'Comet', el: c, ...tr, d: pk.d, alt: pk.alt, az: pk.az,
      ra: at.ra2000, dec: at.dec2000, mag: at.mag, r: at.r, delta: at.delta, moonSep: moonSepAt(pk),
    });
  }
  return out.sort((a, b) => a.mag - b.mag);
}

/* Seestar-friendly deep-sky objects (J2000 RA hours, Dec degrees). */
const DSO = [
  ['M31', 'Andromeda Galaxy', 'Galaxy', 0.712, 41.27], ['M33', 'Triangulum Galaxy', 'Galaxy', 1.564, 30.66],
  ['M45', 'Pleiades', 'Cluster + reflection', 3.79, 24.12], ['M42', 'Orion Nebula', 'Emission nebula', 5.588, -5.39],
  ['M1', 'Crab Nebula', 'Supernova remnant', 5.575, 22.01], ['NGC 2237', 'Rosette Nebula', 'Emission nebula', 6.53, 4.95],
  ['IC 434', 'Horsehead Nebula', 'Emission nebula', 5.683, -2.46], ['NGC 1499', 'California Nebula', 'Emission nebula', 4.05, 36.42],
  ['IC 1805', 'Heart Nebula', 'Emission nebula', 2.555, 61.45], ['IC 1848', 'Soul Nebula', 'Emission nebula', 2.85, 60.43],
  ['NGC 281', 'Pacman Nebula', 'Emission nebula', 0.88, 56.62], ['NGC 869/884', 'Double Cluster', 'Open cluster', 2.33, 57.13],
  ['NGC 7000', 'North America Nebula', 'Emission nebula', 20.98, 44.33], ['NGC 6960', 'Western Veil', 'Supernova remnant', 20.76, 30.71],
  ['NGC 6992', 'Eastern Veil', 'Supernova remnant', 20.94, 31.72], ['M27', 'Dumbbell Nebula', 'Planetary nebula', 19.993, 22.72],
  ['M57', 'Ring Nebula', 'Planetary nebula', 18.893, 33.03], ['M13', 'Hercules Cluster', 'Globular cluster', 16.695, 36.46],
  ['M92', 'Globular in Hercules', 'Globular cluster', 17.285, 43.14], ['M15', 'Pegasus Cluster', 'Globular cluster', 21.50, 12.17],
  ['M2', 'Aquarius Cluster', 'Globular cluster', 21.558, -0.82], ['IC 1396', 'Elephant’s Trunk', 'Emission nebula', 21.65, 57.5],
  ['NGC 7635', 'Bubble Nebula', 'Emission nebula', 23.347, 61.2], ['IC 5146', 'Cocoon Nebula', 'Emission + dark nebula', 21.893, 47.27],
  ['NGC 7023', 'Iris Nebula', 'Reflection nebula', 21.027, 68.17], ['NGC 7293', 'Helix Nebula', 'Planetary nebula', 22.494, -20.84],
  ['NGC 7331', 'Deer Lick Galaxy', 'Galaxy', 22.616, 34.42], ['NGC 891', 'Silver Sliver Galaxy', 'Galaxy', 2.376, 42.35],
  ['M74', 'Phantom Galaxy', 'Galaxy', 1.611, 15.78], ['M77', 'Cetus A', 'Galaxy', 2.711, -0.01],
  ['M81', 'Bode’s Galaxy', 'Galaxy', 9.926, 69.07], ['M82', 'Cigar Galaxy', 'Galaxy', 9.931, 69.68],
  ['M51', 'Whirlpool Galaxy', 'Galaxy', 13.498, 47.2], ['M101', 'Pinwheel Galaxy', 'Galaxy', 14.054, 54.35],
  ['M97', 'Owl Nebula', 'Planetary nebula', 11.247, 55.02], ['M106', 'Spiral in Canes Venatici', 'Galaxy', 12.316, 47.3],
  ['M63', 'Sunflower Galaxy', 'Galaxy', 13.264, 42.03], ['M64', 'Black Eye Galaxy', 'Galaxy', 12.946, 21.68],
  ['M3', 'Globular in Canes Venatici', 'Globular cluster', 13.703, 28.38], ['M8', 'Lagoon Nebula', 'Emission nebula', 18.06, -24.38],
  ['M20', 'Trifid Nebula', 'Emission nebula', 18.04, -23.03], ['M16', 'Eagle Nebula', 'Emission nebula', 18.313, -13.79],
  ['M17', 'Omega Nebula', 'Emission nebula', 18.346, -16.17], ['M11', 'Wild Duck Cluster', 'Open cluster', 18.851, -6.27],
  ['M35', 'Open cluster in Gemini', 'Open cluster', 6.15, 24.33], ['M44', 'Beehive Cluster', 'Open cluster', 8.67, 19.67],
  ['NGC 253', 'Sculptor Galaxy', 'Galaxy', 0.793, -25.29],
];
/* Approximate catalog details: [visual magnitude or null, apparent size, distance]. */
const DSO_INFO = {
  'M31': [3.4, "190′ × 60′", '2.5 million ly'], 'M33': [5.7, "70′ × 40′", '2.7 million ly'],
  'M45': [1.6, "110′", '444 ly'], 'M42': [4.0, "65′ × 60′", '1,344 ly'], 'M1': [8.4, "6′ × 4′", '6,500 ly'],
  'NGC 2237': [null, "80′", '5,200 ly'], 'IC 434': [null, "60′ × 10′", '1,375 ly'], 'NGC 1499': [null, "145′ × 40′", '1,000 ly'],
  'IC 1805': [6.5, "150′", '7,500 ly'], 'IC 1848': [6.5, "150′ × 75′", '7,500 ly'], 'NGC 281': [7.4, "35′ × 30′", '9,500 ly'],
  'NGC 869/884': [3.7, "60′ (pair)", '7,500 ly'], 'NGC 7000': [4.0, "120′ × 100′", '2,600 ly'],
  'NGC 6960': [7.0, "70′ × 6′", '2,400 ly'], 'NGC 6992': [7.0, "60′ × 8′", '2,400 ly'], 'M27': [7.5, "8′ × 6′", '1,360 ly'],
  'M57': [8.8, "1.4′ × 1′", '2,300 ly'], 'M13': [5.8, "20′", '22,200 ly'], 'M92': [6.3, "14′", '26,700 ly'],
  'M15': [6.2, "18′", '35,000 ly'], 'M2': [6.5, "16′", '37,500 ly'], 'IC 1396': [3.5, "170′ × 140′", '2,400 ly'],
  'NGC 7635': [10.0, "15′ × 8′", '7,100 ly'], 'IC 5146': [7.2, "12′", '4,000 ly'], 'NGC 7023': [6.8, "18′", '1,300 ly'],
  'NGC 7293': [7.6, "25′", '650 ly'], 'NGC 7331': [9.5, "10′ × 4′", '40 million ly'], 'NGC 891': [10.0, "13′ × 3′", '30 million ly'],
  'M74': [9.4, "10′ × 9′", '32 million ly'], 'M77': [8.9, "7′ × 6′", '47 million ly'], 'M81': [6.9, "27′ × 14′", '11.8 million ly'],
  'M82': [8.4, "11′ × 5′", '12 million ly'], 'M51': [8.4, "11′ × 7′", '23 million ly'], 'M101': [7.9, "29′ × 27′", '21 million ly'],
  'M97': [9.9, "3.4′", '2,030 ly'], 'M106': [8.4, "19′ × 8′", '24 million ly'], 'M63': [8.6, "13′ × 7′", '29 million ly'],
  'M64': [8.5, "10′ × 5′", '17 million ly'], 'M3': [6.2, "18′", '33,900 ly'], 'M8': [6.0, "90′ × 40′", '4,100 ly'],
  'M20': [6.3, "28′", '5,200 ly'], 'M16': [6.0, "35′ × 28′", '5,700 ly'], 'M17': [6.0, "46′ × 37′", '5,500 ly'],
  'M11': [5.8, "14′", '6,200 ly'], 'M35': [5.3, "28′", '2,800 ly'], 'M44': [3.7, "95′", '577 ly'], 'NGC 253': [7.1, "27′ × 7′", '11.4 million ly'],
};
const TYPE_TIP = (type) => /Emission|Supernova/.test(type) ? 'Turn on the LP (light-pollution) filter. Nebulae reward long stacks: aim for 1–2 h or more.'
  : /Planetary/.test(type) ? 'LP filter helps. Small and bright, so 20–40 min shows good detail.'
  : /Galaxy/.test(type) ? 'Leave the LP filter off (broadband target). Needs dark skies and a low or absent Moon; aim for 1 h+.'
  : /Globular/.test(type) ? 'LP filter off. Bright and compact: 15–30 min resolves stars nicely.'
  : /Reflection|Cluster \+ reflection/.test(type) ? 'LP filter off — reflection nebulae are blue broadband light. Very Moon-sensitive.'
  : 'LP filter off. Bright target: 10–20 min is plenty.';

function angSep(a, b) {
  const r = Math.PI / 180;
  const c = Math.sin(a.alt * r) * Math.sin(b.alt * r) + Math.cos(a.alt * r) * Math.cos(b.alt * r) * Math.cos((a.az - b.az) * r);
  return Math.acos(Math.max(-1, Math.min(1, c))) / r;
}
/* Deep-sky targets that reach 40° in darkness for at least half an hour, longest window first. */
function targetsTonight(obs, S) {
  if (S.darkLim == null) return [];
  const out = [];
  for (const [id, name, type, ra, dec] of DSO) {
    const tr = track(S, (d) => altAzRaDec(ra, dec, d, obs));
    if (tr.hrs < 0.5) continue;
    const pk = tr.peak;
    out.push({ kind: 'dso', id, name, type, ra, dec, ...tr, d: pk.d, alt: pk.alt, az: pk.az, moonSep: moonSepAt(pk) });
  }
  return out.sort((a, b) => b.hrs - a.hrs || b.alt - a.alt).slice(0, 15);
}

/* ---------- combining & scoring ---------- */
function pick(rows, t) {
  if (!rows) return null;
  return rows.get(t) || null;
}
function nearest7T(list, t) {
  if (!list) return null;
  let best = null;
  for (const x of list) if (!best || Math.abs(x.t - t) < Math.abs(best.t - t)) best = x;
  return best && Math.abs(best.t - t) <= 2 * 3600 ? best : null;
}
function scoreHour(h) {
  if (h.sky.k === 'day') return { k: 'day', label: 'Day', score: null };
  let s = 100;
  if (isNum(h.cloud)) s -= h.cloud * 0.85;
  if (isNum(h.pop)) s -= h.pop * 0.35;
  if (isNum(h.gust)) s -= h.gust > 40 ? 40 : h.gust > 30 ? 25 : h.gust > 20 ? 10 : 0;
  if (isNum(h.dewGap) && h.dewGap < 2) s -= 8;
  if (isNum(h.seeing) && h.seeing >= 6) s -= 8;
  if (isNum(h.transparency) && h.transparency >= 6) s -= 8;
  if (h.sky.k === 'civil') s -= 30; else if (h.sky.k === 'nautical') s -= 15; else if (h.sky.k === 'astro') s -= 5;
  if (h.moonAlt > 0) s -= 12 * h.moonIllum;
  s = Math.max(0, Math.min(100, s));
  const k = s >= 75 ? 'great' : s >= 55 ? 'good' : s >= 35 ? 'fair' : 'poor';
  return { k, label: k[0].toUpperCase() + k.slice(1), score: Math.round(s) };
}
function buildHours(from, to, src, obs, illum) {
  const start = Math.floor(from.getTime() / 3600e3) * 3600;
  const end = to.getTime() / 1000;
  const hours = [];
  for (let t = start; t < end; t += 3600) {
    const d = new Date(t * 1000);
    const mid = new Date((t + 1800) * 1000);
    const det = [];
    for (const m of OM_MODELS) { const r = src.om[m.id] && pick(src.om[m.id].rows, t); if (r) det.push({ name: m.name, r }); }
    const met = src.met && pick(src.met.rows, t);
    if (met) det.push({ name: 'MET Norway', r: met });
    const t7 = nearest7T(src.t7, t);
    const best = (det.find((x) => x.name === OM_MODELS[0].name) || det[0] || { r: {} }).r;
    const metRow = met || {};
    const val = (k) => (isNum(best[k]) ? best[k] : isNum(metRow[k]) ? metRow[k] : null);

    // Cloud: average of every model that reports it (7Timer included).
    const clouds = det.map((x) => x.r.cloud_cover).filter(isNum);
    if (t7 && isNum(t7.cloud)) clouds.push(t7.cloud);
    // Precipitation probability: pooled ensemble members first, else average of reported probabilities.
    let wet = 0, n = 0;
    const ensRows = [];
    for (const e of ENSEMBLES) {
      const er = src.ens[e.name] && src.ens[e.name].rows.get(t);
      if (er) { wet += er.wet; n += er.n; ensRows.push({ name: e.name, p: (100 * er.wet) / er.n, members: er.n }); }
    }
    const detPops = det.map((x) => x.r.precipitation_probability).filter(isNum);
    const pop = n ? (100 * wet) / n : avg(detPops);
    const tC = val('temperature_2m'), dew = val('dew_point_2m');
    const sun = altAz('Sun', mid, obs).alt;
    const moon = altAz('Moon', mid, obs);
    const h = {
      t, d, det, ensRows, t7,
      cloud: avg(clouds), cloudMin: clouds.length ? Math.min(...clouds) : null, cloudMax: clouds.length ? Math.max(...clouds) : null,
      low: avg(det.map((x) => x.r.cloud_cover_low)), midc: avg(det.map((x) => x.r.cloud_cover_mid)), high: avg(det.map((x) => x.r.cloud_cover_high)),
      pop, popMembers: n, precip: avg(det.map((x) => x.r.precipitation)),
      temp: tC, dew, dewGap: isNum(tC) && isNum(dew) ? tC - dew : null,
      wind: val('wind_speed_10m'), gust: val('wind_gusts_10m'), rh: val('relative_humidity_2m'), vis: val('visibility'),
      seeing: t7 ? t7.seeing : null, transparency: t7 ? t7.transparency : null,
      sky: skyState(sun), moonAlt: moon.alt, moonIllum: illum,
    };
    h.rating = scoreHour(h);
    hours.push(h);
  }
  return hours;
}

/* ---------- rendering ---------- */
function moonGlyph(cx, cy, r, angle, lat) {
  const k = (1 - Math.cos(angle * Math.PI / 180)) / 2; // illuminated fraction
  let litRight = angle < 180;
  if (lat < 0) litRight = !litRight;
  const rx = r * Math.abs(Math.cos(angle * Math.PI / 180));
  const gibbous = k > 0.5;
  const outer = litRight ? 1 : 0;
  const term = litRight ? (gibbous ? 1 : 0) : (gibbous ? 0 : 1);
  const lit = k < 0.01 ? '' : k > 0.99
    ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--moon-lit)"/>`
    : `<path d="M${cx} ${cy - r} A${r} ${r} 0 0 ${outer} ${cx} ${cy + r} A${rx.toFixed(2)} ${r} 0 0 ${term} ${cx} ${cy - r}Z" fill="var(--moon-lit)"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--moon-dark)" stroke="var(--moon-lit)" stroke-opacity=".35" stroke-width="1"/>${lit}`;
}

const RATE_TXT = { great: 'GO', good: 'GO', fair: 'FAIR', poor: 'NO', day: 'DAY' };
const qClass = (v) => (!isNum(v) ? 'dim' : v <= 2 ? 'q-1' : v <= 4 ? 'q-2' : v <= 6 ? 'q-3' : 'q-4');
const qShort = (v) => (!isNum(v) ? '–' : v <= 2 ? 'Exc' : v <= 4 ? 'Good' : v <= 6 ? 'Avg' : 'Poor');
const SKY_SHORT = { day: 'day', civil: 'twi', nautical: 'twi', astro: 'twi', dark: 'dark' };

/* Best run of Good-or-better hours. */
function bestWindow(hours) {
  let best = null, cur = null;
  for (const h of hours) {
    if (h.rating.score != null && h.rating.score >= 55) {
      cur = cur ? { ...cur, end: h } : { start: h, end: h };
      if (!best || cur.end.t - cur.start.t > best.end.t - best.start.t) best = cur;
    } else cur = null;
  }
  if (best) best.hrs = (best.end.t - best.start.t) / 3600 + 1;
  return best;
}

function renderVerdict(win, moon, hours) {
  const night = hours.filter((h) => h.rating.score != null);
  const best = bestWindow(hours);
  let cls, txt, line, chips = [];
  if (!night.length) {
    cls = 'day'; txt = 'NO DATA';
    line = 'No forecast available for this night yet';
  } else {
    const hasGood = best && night.some((h) => h.rating.score >= 55);
    if (best && best.hrs >= 2 && hasGood) { cls = 'go'; txt = 'GO'; }
    else if (best || night.some((h) => h.rating.k === 'fair')) { cls = 'fair'; txt = 'MARGINAL'; }
    else { cls = 'nogo'; txt = 'NO GO'; }
    line = best
      ? `Best window <b>${esc(fmtTime(best.start.d))} – ${esc(fmtTime(new Date((best.end.t + 3600) * 1000)))}</b> <span class="muted">(${best.hrs} h)</span>`
      : cls === 'fair' ? 'Fair hours only — no solid window' : 'No usable window this night';
    // Conditions over the dark hours ahead
    const cloud = avg(night.map((h) => h.cloud));
    const pop = Math.max(...night.map((h) => (isNum(h.pop) ? h.pop : 0)));
    const gust = Math.max(...night.map((h) => (isNum(h.gust) ? h.gust : 0)));
    const dew = Math.min(...night.map((h) => (isNum(h.dewGap) ? h.dewGap : 99)));
    const see = night.map((h) => h.seeing).filter(isNum);
    // [label, value, unit, class]
    chips.push(['Rain risk', isNum(pop) ? Math.round(pop) : '–', '%', pop < 15 ? 'ok' : pop >= 40 ? 'bad' : '']);
    if (isNum(cloud)) chips.push(['Cloud', Math.round(cloud), '%', cloud < 30 ? 'ok' : cloud > 60 ? 'bad' : '']);
    if (gust > 0) chips.push(['Max gusts', wind(gust), windU(), gust > 30 ? 'bad' : gust < 20 ? 'ok' : '']);
    const moonUp = night.some((h) => h.moonAlt > 0);
    chips.push([moonUp ? 'Moon up' : 'Moon', moonUp ? Math.round(moon.illum * 100) : 'Down', moonUp ? '%' : '', moonUp && moon.illum > 0.5 ? 'bad' : !moonUp || moon.illum < 0.25 ? 'ok' : '']);
    chips.push([dew < 2 ? 'Dew · heater on' : 'Dew gap', dew < 99 ? tempDiff(dew) : '–', '', dew < 2 ? 'bad' : dew >= 5 ? 'ok' : '']);
    if (see.length) { const s = Math.min(...see); chips.push(['Seeing', QUAL(s), '', s <= 4 ? 'ok' : s >= 7 ? 'bad' : '']); }
  }
  $('#verdict').innerHTML = `<div class="v-badge ${cls}">${txt}</div>
    <div class="v-text"><div class="v-win">${line}</div></div>
    <div class="vstats">${chips.map(([l, v, u, c]) => `<div class="vs ${c}"><span class="lbl">${esc(l)}</span><b>${esc(v)}<small>${esc(u)}</small></b></div>`).join('')}</div>`;
}

function renderTonight(win) {
  const stat = (l, v, cls = '') => `<div class="stat ${cls}"><span class="lbl">${l}</span><b>${v}</b></div>`;
  $('#tonight').innerHTML = stat('Full dark', win.darkStart ? esc(fmtTime(win.darkStart)) : 'None', 'prime')
    + stat('Dark ends', win.darkEnd ? esc(fmtTime(win.darkEnd)) : '–', 'prime')
    + stat('Sunset', esc(fmtTime(win.set)))
    + stat('Sunrise', esc(fmtTime(win.rise)));
}

function renderForecast(hours) {
  const nowT = Math.floor(Date.now() / 3600e3) * 3600;
  const cell = (h, i, inner, cls = '', style = '', title = '') => `<div class="fc-c ${cls}${h.sky.k !== 'day' ? ' night' : ''}${h.t === nowT ? ' now' : ''}" data-i="${i}"${style ? ` style="${style}"` : ''}${title ? ` title="${esc(title)}"` : ''}>${inner}</div>`;
  const row = (label, fn) => `<div class="fc-l">${label}</div>` + hours.map(fn).join('');
  const tint = (v, col, k) => (isNum(v) ? `background:color-mix(in srgb, var(${col}) ${Math.round(v * k)}%, transparent)` : '');

  let html = '<div class="fc-l"></div>' + hours.map((h, i) => `<button type="button" class="fc-c fc-h" data-i="${i}">${esc(fmtHour(h.d).replace(/\s?([AP])\.?M\.?/i, (m, p) => p.toLowerCase()))}<small>${SKY_SHORT[h.sky.k]}</small></button>`).join('');
  // Rating, then precip and cloud (large), the sky chart, temp, dew, wind, seeing, transparency.
  html += row('Rating', (h, i) => `<div class="fc-c rate ${h.rating.k}" data-i="${i}" title="${h.rating.score == null ? 'Daylight' : 'Score ' + h.rating.score + '/100'}">${RATE_TXT[h.rating.k]}</div>`);
  const ico = (svg, name, col) => `<span class="big-l ico" title="${name}" style="color:var(${col})"><svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg><span class="ico-t">${name}</span></span>`;
  const DROP = '<path d="M12 2.5C9 7 5.5 10.6 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10.6 15 7 12 2.5z" fill="currentColor"/>';
  const CLOUD = '<path d="M7 19h10.5a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.6 9.1 5 5 0 0 0 7 19z" fill="currentColor"/>';
  html += row(ico(DROP, 'Precip', '--rain'), (h, i) => cell(h, i, pct(h.pop), 'big', tint(h.pop, '--rain', 0.55)));
  html += row(ico(CLOUD, 'Cloud', '--cloud'), (h, i) => cell(h, i, pct(h.cloud), 'big', tint(h.cloud, '--cloud', 0.42), `Low ${r0(h.low)} · Mid ${r0(h.midc)} · High ${r0(h.high)}`));

  // Chart: cloud bars + precip line (stretches to fill the card)
  const n = hours.length;
  let bars = '', pts = [];
  hours.forEach((h, i) => {
    const c = isNum(h.cloud) ? h.cloud : 0;
    bars += `<rect x="${i * 10 + 1.2}" y="${100 - c}" width="7.6" height="${c}" fill="var(--cloud)" opacity="${h.sky.k === 'day' ? 0.3 : 0.7}"/>`;
    if (isNum(h.pop)) pts.push(`${i * 10 + 5},${(100 - h.pop).toFixed(1)}`);
  });
  html += `<div class="fc-l">Sky<small>%</small></div><div class="fc-chart"><svg viewBox="0 0 ${n * 10} 100" preserveAspectRatio="none" aria-label="Cloud cover and precipitation chance by hour">
    <line x1="0" x2="${n * 10}" y1="50" y2="50" stroke="var(--line2)" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>${bars}
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--rain)" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg></div>`;

  html += row('Temp', (h, i) => cell(h, i, temp(h.temp)));
  html += row('Dew<span class="lg-only">&nbsp;gap</span>', (h, i) => cell(h, i, tempDiff(h.dewGap), isNum(h.dewGap) && h.dewGap < 2 ? 'warn' : ''));
  html += row(`Gusts<small>${windU()}</small>`, (h, i) => cell(h, i, wind(h.gust), isNum(h.gust) && h.gust > 30 ? 'warn' : '', '', `Wind ${wind(h.wind)} · gusts ${wind(h.gust)} ${windU()}`));
  html += row('Seeing', (h, i) => cell(h, i, qShort(h.seeing), qClass(h.seeing)));
  html += row('Transp', (h, i) => cell(h, i, qShort(h.transparency), qClass(h.transparency)));
  const f = $('#forecast');
  f.style.setProperty('--n', n);
  f.classList.toggle('dense', n > 13);
  f.innerHTML = html;
}

function showSheet(title, body, sub = '', wide = false) {
  $('#sheetTitle').textContent = title;
  $('#sheetSub').textContent = sub;
  $('#sheetSub').hidden = !sub;
  $('#sheetBody').innerHTML = body;
  const d = $('#sheet');
  d.classList.toggle('wide', wide);
  if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
  $('#sheetBody').scrollTop = 0;
}

function showHour(i) {
  const h = state.data && state.data.nights[state.night].hours[i];
  if (!h) return;
  const srcRows = h.det.map((x) => `<tr><td>${esc(x.name)}</td><td class="n">${pct(x.r.cloud_cover)}</td><td class="n">${pct(x.r.precipitation_probability)}</td><td class="n">${rain(x.r.precipitation)}</td></tr>`).join('');
  const t7Row = h.t7 ? `<tr><td>7Timer! ASTRO</td><td class="n">${pct(h.t7.cloud)}</td><td class="n">–</td><td class="n">–</td></tr>` : '';
  const ensRows = h.ensRows.map((e) => `<tr><td>${esc(e.name)} <span class="muted">(${e.members} runs)</span></td><td class="n">–</td><td class="n">${pct(e.p)}</td><td class="n">–</td></tr>`).join('');
  const facts = [
    h.rating.score == null ? 'Daylight' : `${RATE_TXT[h.rating.k]} · score ${h.rating.score}/100`,
    h.sky.label,
    h.moonAlt > 0 ? `Moon ${Math.round(h.moonAlt)}° up` : 'Moon down',
    `Cloud spread ${pct(h.cloudMin)}–${pct(h.cloudMax)} (low ${r0(h.low)} · mid ${r0(h.midc)} · high ${r0(h.high)})`,
    `Wind ${wind(h.wind)} ${windU()}, gusts ${wind(h.gust)}`,
    isNum(h.seeing) ? `Seeing ${SEEING[h.seeing]} (${QUAL(h.seeing)}) · transparency ${QUAL(h.transparency)}` : '',
    isNum(h.rh) ? `Humidity ${Math.round(h.rh)}%` : '',
    isNum(h.dewGap) && h.dewGap < 2 ? 'Dew likely — run the dew heater' : '',
  ].filter(Boolean);
  showSheet(`${fmtDay(h.d)} · ${fmtTime(h.d)}`,
    `<p class="note" style="margin:0 0 10px">${facts.map(esc).join(' · ')}</p>
    <table class="src"><thead><tr><th>Source</th><th class="n">Cloud</th><th class="n">Precip %</th><th class="n">Amount</th></tr></thead>
    <tbody>${srcRows}${t7Row}${ensRows}</tbody></table>
    <p class="note">The rating combines clouds, rain odds, wind, dew, seeing, darkness and moonlight. GO = score 55+.</p>`);
}

function renderMoon(moon, lat) {
  const ev = moon.events.slice(0, 2).map((e) => [e.kind === 'rise' ? 'Rises' : 'Sets', fmtTime(e.d)]);
  const nextOf = (n) => moon.next.find((p) => p.n === n);
  const waxing = moon.angle < 180;
  const shape = moon.illum < 0.03 ? 'New' : moon.illum > 0.97 ? 'Full' : moon.illum < 0.5 ? 'Crescent' : 'Gibbous';
  const rows = [['Phase', `${waxing ? 'Waxing' : 'Waning'} ${shape.toLowerCase()}`], ...ev, ['Age', moon.ageDays.toFixed(1) + ' d'],
    ...['Full', 'New'].map((n) => nextOf(n)).filter(Boolean).map((p) => [`Next ${p.n.toLowerCase()}`, fmtDay(p.d)])];
  $('#moonInfo').innerHTML = `<svg viewBox="0 0 84 84" aria-label="Moon phase">${moonGlyph(42, 42, 38, moon.angle, lat)}</svg>
    <div class="moon-txt"><div class="moon-name">${esc(moon.name)} <span>${Math.round(moon.illum * 100)}%</span></div>
    <dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`;
}

function renderPath(moon, lat, now) {
  const box = $('#moonPath');
  const W = Math.max(280, Math.round(box.clientWidth || 480));
  const H = Math.max(140, Math.round(box.clientHeight || 260));
  const L = 30, R = 10, T = 14, B = 22, pw = W - L - R, ph = H - T - B;
  const X = (az) => L + (az / 360) * pw;
  const Y = (alt) => T + (1 - Math.max(alt, 0) / 90) * ph;
  let grid = '';
  for (const a of [30, 60]) grid += `<line x1="${L}" x2="${W - R}" y1="${Y(a)}" y2="${Y(a)}" stroke="var(--line2)" stroke-dasharray="3 5"/><text x="${L - 6}" y="${Y(a) + 4}" font-size="11" text-anchor="end" fill="var(--muted)">${a}°</text>`;
  const step = pw < 360 ? 90 : 45;
  const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW', 360: 'N' };
  for (let a = 0; a <= 360; a += step) {
    const x = X(a);
    grid += `<line x1="${x}" x2="${x}" y1="${T}" y2="${T + ph}" stroke="var(--line2)" stroke-opacity=".45"/><text x="${x}" y="${H - 6}" font-size="11" font-weight="600" text-anchor="middle" fill="var(--muted)">${names[a]}</text>`;
  }
  const up = moon.path.filter((p) => p.alt > 0);
  let segs = '', marks = '', glyphs = '';
  if (up.length) {
    let d = '', prev = null;
    for (const p of moon.path) {
      if (p.alt <= 0) { prev = null; continue; }
      d += `${!prev || Math.abs(p.az - prev.az) > 180 ? 'M' : 'L'}${X(p.az).toFixed(1)} ${Y(p.alt).toFixed(1)}`;
      prev = p;
    }
    segs = `<path d="${d}" fill="none" stroke="var(--path)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`;
    const top = up.reduce((a, b) => (b.alt > a.alt ? b : a));
    let lastX = -99;
    moon.hourly.forEach((p) => {
      if (p.alt <= 0) return;
      const x = X(p.az), y = Y(p.alt);
      marks += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4" fill="var(--path)"/>`;
      if (Math.abs(x - lastX) < 40 || (Math.abs(x - X(top.az)) < 30 && Math.abs(y - Y(top.alt)) < 30)) return;
      lastX = x;
      marks += `<text x="${x.toFixed(1)}" y="${(y - 7).toFixed(1)}" font-size="10" text-anchor="middle" fill="var(--muted)">${esc(fmtHour(p.d))}</text>`;
    });
    const r = Math.max(9, Math.min(14, ph / 12));
    const lx = Math.min(Math.max(X(top.az), L + 75), W - R - 75);
    glyphs += moonGlyph(X(top.az), Y(top.alt), r, moon.angle, lat)
      + `<text x="${lx}" y="${top.alt < 45 ? Y(top.alt) - r - 8 : Y(top.alt) + r + 15}" font-size="12" font-weight="600" text-anchor="middle" fill="var(--text)">Highest ${Math.round(top.alt)}° · ${esc(fmtTime(top.d))}</text>`;
    const nowP = moon.path.find((p) => Math.abs(p.d - now) <= 5 * 60e3);
    if (nowP && nowP.alt > 0) glyphs += `<circle cx="${X(nowP.az)}" cy="${Y(nowP.alt)}" r="7" fill="none" stroke="var(--accent)" stroke-width="2"/><text x="${X(nowP.az) + 10}" y="${Y(nowP.alt) - 8}" font-size="11" fill="var(--accent)">Now</text>`;
  } else {
    glyphs = `<text x="${W / 2}" y="${T + ph / 2}" text-anchor="middle" font-size="13" fill="var(--muted)">The Moon stays below the horizon tonight.</text>`;
  }
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Moon path across the sky tonight">
    <defs><linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sky-top)"/><stop offset="1" stop-color="var(--sky-bot)"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#skyg)"/><rect x="0" y="${T + ph}" width="${W}" height="${B}" fill="var(--ground)"/>
    ${grid}<line x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}" stroke="var(--muted)" stroke-opacity=".6"/>${segs}${marks}${glyphs}</svg>`;
  $('#pathNote').textContent = `${fmtTime(moon.path[0].d)} → ${fmtTime(moon.path[moon.path.length - 1].d)}`;
}

function renderPlanets(list) {
  $('#planets').innerHTML = list.length ? list.map((p, i) => `<button type="button" class="row tgt" data-p="${i}">
    <div class="nm"><span class="t1"><b>${p.name}</b><span class="tag">mag ${p.mag.toFixed(1)}</span></span>
    <span class="sub2">${p.start ? `40°+ from ${esc(fmtTime(p.start))}` : `Stays below ${MIN_ALT}°${state.home ? ' in home sky' : ''}`}</span></div>
    <div class="r">${esc(fmtTime(p.d))}<span class="sub2">${Math.round(p.alt)}° ${compass(p.az)}</span></div></button>`).join('')
    : '<p class="empty">None well placed after dusk.</p>';
}

/* Small survey image for the Top targets card, cropped to the object's size. */
function thumbUrl(o) {
  const sz = o.kind === 'dso' ? parseSize((DSO_INFO[o.id] || [])[1]) : null;
  const fov = Math.min(4, Math.max(0.4, ((sz ? sz[0] : 40) / 60) * 1.6));
  return skyCutout(o.ra, o.dec, fov, 240, 180);
}
const TOP_N = 3;
function renderTop(list, topIdx, now) {
  $('#topTitle').firstChild.textContent = state.night ? 'Top targets tomorrow' : 'Top targets tonight';
  $('#topTargets').innerHTML = topIdx.length ? topIdx.map((i, r) => {
    const o = list[i];
    const upNow = o.start <= now && now < o.end;
    const moonTxt = o.moonSep == null ? 'Moon down' : `Moon ${Math.round(o.moonSep)}°`;
    const what = o.kind === 'comet' ? `Comet · mag ≈${o.mag.toFixed(1)}` : esc(o.type);
    const when = `${upNow ? 'Up now' : esc(fmtTime(o.start))} → ${esc(fmtTime(o.end))} · ${o.hrs.toFixed(1)} h`;
    return `<button type="button" class="top-it" data-t="${i}">
      <span class="th"><img src="${thumbUrl(o)}" alt="" loading="lazy" decoding="async" onload="this.parentNode.classList.add('ok')" onerror="this.remove()"><i class="rk">${r + 1}</i></span>
      <span class="tx"><span class="tn"><b>${esc(o.id)}</b>${esc(o.name)}</span><span class="ts">${what} · ${moonTxt}</span><span class="tw">${when}</span></span></button>`;
  }).join('') : '<p class="empty">No targets reach 40° in darkness.</p>';
}

function renderTargets(list) {
  const now = state.data ? state.data.now : new Date();
  // Top few still-visible targets go to their own card; the list continues with the rest.
  const topIdx = [];
  list.forEach((o, i) => { if (topIdx.length < TOP_N && o.end > now) topIdx.push(i); });
  renderTop(list, topIdx, now);
  const rest = list.map((o, i) => [o, i]).filter(([, i]) => !topIdx.includes(i));
  $('#targets').innerHTML = rest.length ? rest.map(([o, i]) => {
    const neb = /Emission|Supernova|Planetary/.test(o.type);
    const moonTxt = o.moonSep == null ? 'Moon down' : `Moon ${Math.round(o.moonSep)}°`;
    const upNow = o.start <= now && now < o.end, past = o.end <= now;
    const sub = o.kind === 'comet'
      ? `Comet · mag ≈${o.mag.toFixed(1)}${o.moonSep == null ? '' : ' · ' + moonTxt}`
      : `${esc(o.type)}${neb ? ' · LP filter' : ''}${o.moonSep == null ? '' : ' · ' + moonTxt}`;
    const when = esc(fmtTime(o.start));
    const sub2 = past ? `ended ${esc(fmtTime(o.end))}` : upNow ? `up now · to ${esc(fmtTime(o.end))}` : `${o.startWhy === 'dark' ? 'at dark · ' : o.startWhy === 'dir' ? 'into view · ' : ''}${o.hrs.toFixed(1)} h`;
    return `<button type="button" class="row tgt${o.kind === 'comet' ? ' comet' : ''}${past ? ' past' : ''}" data-t="${i}"><div class="nm"><span class="t1"><b>${esc(o.id)}</b>${esc(o.name)}${o.kind === 'comet' ? '<span class="tag tag-comet">Comet</span>' : ''}</span><span class="sub2">${sub}</span></div>
      <div class="r">${when}<span class="sub2">${sub2}</span></div></button>`;
  }).join('') : topIdx.length ? '<p class="empty">That’s everything for tonight — see Top targets.</p>' : `<p class="empty">${state.data && state.data.nights[state.night].darkLim == null ? 'No full darkness tonight here.' : `Nothing reaches ${MIN_ALT}° in darkness${state.home ? ` in your home sky (${esc(homeDesc())})` : ''} tonight.`}</p>`;
}

/* ---------- object pop-up ---------- */
const fmtHourShort = (d) => fmtHour(d).replace(/\s?([AP])\.?\s?M\.?/i, (m, p) => ' ' + p.toUpperCase() + 'M');
const raHM = (ra) => { const m = Math.round(ra * 60) % 1440; return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
const decDM = (dec) => `${dec >= 0 ? '+' : '−'}${Math.abs(dec).toFixed(1)}°`;
const constellation = (ra, dec) => { try { return A.Constellation(ra, dec).name; } catch (e) { return '–'; } };
/* Apparent size string like "170′ × 140′" → [major, minor] in arcminutes. */
function parseSize(s) {
  const m = /^([\d.]+)′(?:\s*×\s*([\d.]+)′)?/.exec(s || '');
  return m ? [+m[1], m[2] ? +m[2] : +m[1]] : null;
}
const nice = (v) => (v >= 10 ? Math.round(v) : v >= 1 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(1));
/* Plain-English scale: arcminutes → degrees and full-Moon widths. */
function sizeScale(sz) {
  if (!sz) return '';
  const [a, b] = sz, deg = (v) => nice(v / 60), moons = (v) => nice(v / (MOON_DEG * 60));
  if (a === b) return `${deg(a)}° across — about ${moons(a)}× the full Moon`;
  return `${deg(a)}° × ${deg(b)}° — about ${moons(a)} × ${moons(b)} full Moons`;
}
function frameFit(sz) {
  if (!sz) return ['–', ''];
  const fw = SEESTAR.w * 60, fh = SEESTAR.h * 60, [a, b] = sz;
  if (a <= fw * 0.9 && b <= fh * 0.9) {
    const pct = Math.round((a / fw) * 100);
    return [pct < 15 ? 'Yes — small in frame' : 'Yes', `fills about ${pct}% of the frame width`];
  }
  if (a <= fw && b <= fh) return ['Just fits', 'tight — centre carefully'];
  const nx = Math.ceil(a / (fw * 0.85)), ny = Math.ceil(b / (fh * 0.85));
  return ['Mosaic', `about ${nx} × ${ny} panels to cover it`];
}
function skyCutout(raHours, dec, fovDeg, w = 900, h = 600) {
  return `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=CDS%2FP%2FDSS2%2Fcolor&width=${w}&height=${h}`
    + `&fov=${fovDeg.toFixed(3)}&projection=TAN&coordsys=icrs&ra=${(raHours * 15).toFixed(4)}&dec=${dec.toFixed(4)}&format=jpg`;
}
/* Survey image with the Seestar frame and a full Moon drawn to the same scale. */
function heroSky(raHours, dec, majorArcmin, caption, marker) {
  const fov = Math.max(SEESTAR.w * 1.35, ((majorArcmin || 0) / 60) * 1.5); // width of the image in degrees
  const fovH = (fov * 2) / 3;
  const fw = (SEESTAR.w / fov) * 100, fh = (SEESTAR.h / fovH) * 100, mw = (MOON_DEG / fov) * 100;
  return `<figure class="hero"><div class="hero-img">
      <img src="${skyCutout(raHours, dec, fov)}" alt="Sky survey image of the target" decoding="async">
      ${marker ? '<div class="xhair"></div>' : ''}
      <div class="frame" style="width:${fw.toFixed(2)}%;height:${fh.toFixed(2)}%"><span>Seestar frame</span></div>
      <div class="moonscale" style="width:${mw.toFixed(2)}%"><span>Full Moon</span></div>
    </div><figcaption>${caption} · image ${nice(fov)}° wide</figcaption></figure>`;
}
function heroPhoto(wikiTitle, fallback) {
  return `<figure class="hero photo"><div class="hero-img"><img data-wiki="${esc(wikiTitle)}" alt="Photo of the target" decoding="async"></div>
    <figcaption>Photo: Wikipedia</figcaption></figure>${fallback ? `<template class="hero-fallback">${fallback}</template>` : ''}`;
}
const wikiCache = {};
// Wikimedia only serves thumbnails at its standard widths now (custom sizes like 800px fail),
// so try a standard size, then the API's own thumbnail, then the original file.
async function wikiImage(title) {
  if (title in wikiCache) return wikiCache[title];
  let urls = [];
  try {
    const j = await getJSON('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')), 10000);
    const o = j.originalimage, t = j.thumbnail;
    if (t && t.source && o && o.width > 960) urls.push(t.source.replace(/\/\d+px-/, '/960px-'));
    if (t && t.source) urls.push(t.source);
    if (o && o.source && !/\.(tiff?|svg)$/i.test(o.source)) urls.push(o.source);
  } catch (e) { urls = null; /* network or API failure */ }
  return (wikiCache[title] = urls && [...new Set(urls)]);
}
const heroMsg = (fig, offline) => fig.classList.add('failed', offline ? 'offline' : 'nophoto');
function wireHero(root) {
  root.querySelectorAll('.hero-img img:not([data-wiki])').forEach((img) => {
    const fig = img.closest('.hero');
    img.addEventListener('load', () => fig.classList.add('loaded'));
    img.addEventListener('error', () => heroMsg(fig, !navigator.onLine));
  });
  root.querySelectorAll('img[data-wiki]').forEach(async (img) => {
    const fig = img.closest('.hero');
    const urls = await wikiImage(img.dataset.wiki);
    const fallback = () => {
      const fb = fig.nextElementSibling;
      if (fb && fb.classList.contains('hero-fallback')) { fig.outerHTML = fb.innerHTML; wireHero(root); return true; }
    };
    if (!urls || !urls.length) { if (!fallback()) heroMsg(fig, !navigator.onLine); return; }
    let i = 0;
    img.addEventListener('load', () => fig.classList.add('loaded'));
    img.addEventListener('error', () => {
      if (++i < urls.length) img.src = urls[i];
      else if (!fallback()) heroMsg(fig, !navigator.onLine);
    });
    img.src = urls[0];
  });
}

/* Altitude chart: twilight shading, hour axis, 40° line, the usable window and when the target reaches 40°. */
function altChart(el, o, now) {
  const c = o.curve;
  if (!el || !c || c.length < 2) return;
  const fs = parseFloat(getComputedStyle(el).fontSize) || 14;
  const W = Math.max(280, Math.round(el.clientWidth));
  const H = Math.round(Math.min(330, Math.max(210, W * 0.4)));
  const L = fs * 2.7, R = fs * 0.9, T = fs * 2.6, B = fs * 2.2;
  const pw = W - L - R, ph = H - T - B;
  const t0 = c[0].d.getTime(), t1 = c[c.length - 1].d.getTime();
  const X = (d) => L + ((+d - t0) / (t1 - t0)) * pw;
  const Y = (a) => T + (1 - a / 90) * ph;
  const altAt = (d) => {
    const k = Math.min(c.length - 2, Math.max(0, Math.floor((+d - t0) / STEP)));
    const a = c[k], b = c[k + 1];
    return a.alt + (b.alt - a.alt) * ((+d - a.d) / (b.d - a.d));
  };
  const f = (v) => v.toFixed(1);
  const sm = fs * 0.78, md = fs * 0.86;
  let s = `<defs><clipPath id="plotClip"><rect x="${f(L)}" y="${f(T)}" width="${f(pw)}" height="${f(ph)}"/></clipPath></defs>`;
  // Twilight bands
  const half = pw / (c.length - 1) / 2;
  let k0 = 0;
  for (let k = 1; k <= c.length; k++) {
    if (k < c.length && skyState(c[k].sun).k === skyState(c[k0].sun).k) continue;
    const x0 = k0 === 0 ? L : X(c[k0].d) - half, x1 = k === c.length ? L + pw : X(c[k].d) - half;
    s += `<rect x="${f(x0)}" y="${f(T)}" width="${f(x1 - x0 + 0.5)}" height="${f(ph)}" fill="var(--band-${skyState(c[k0].sun).k})"/>`;
    k0 = k;
  }
  // Altitude grid
  for (const a of [20, 60, 80]) s += `<line x1="${f(L)}" x2="${f(L + pw)}" y1="${f(Y(a))}" y2="${f(Y(a))}" stroke="var(--grid)" stroke-width="1"/>`;
  s += `<text x="${f(L - 6)}" y="${f(T - fs * 0.55)}" font-size="${f(sm * 0.9)}" text-anchor="end" fill="var(--muted)">Dir</text>`;
  for (const a of [0, 20, 40, 60, 80]) s += `<text x="${f(L - 6)}" y="${f(Y(a) + sm * 0.35)}" font-size="${f(sm)}" text-anchor="end" fill="var(--muted)">${a}°</text>`;
  // Usable window: ≥40° in darkness
  for (const g of o.segs || []) {
    const pts = [[X(g.s), Y(MIN_ALT)], [X(g.s), Y(altAt(g.s))]];
    c.forEach((p) => { if (p.d > g.s && p.d < g.e) pts.push([X(p.d), Y(p.alt)]); });
    pts.push([X(g.e), Y(altAt(g.e))], [X(g.e), Y(MIN_ALT)]);
    s += `<polygon points="${pts.map(([x, y]) => f(x) + ',' + f(y)).join(' ')}" fill="var(--go)" fill-opacity=".22"/>`;
  }
  // 40° minimum line
  s += `<line x1="${f(L)}" x2="${f(L + pw)}" y1="${f(Y(MIN_ALT))}" y2="${f(Y(MIN_ALT))}" stroke="var(--fair)" stroke-width="1.5" stroke-dasharray="6 4"/>`;
  // Moon and target curves
  const poly = (key) => c.map((p) => f(X(p.d)) + ',' + f(Y(p[key]))).join(' ');
  s += `<g clip-path="url(#plotClip)"><polyline points="${poly('moon')}" fill="none" stroke="var(--moon-lit)" stroke-width="1.6" stroke-dasharray="4 4" opacity=".55"/>
    <polyline points="${poly('alt')}" fill="none" stroke="var(--accent)" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/></g>`;
  // Direction of the target at each labelled hour, along the top (dimmed outside the home sky when Home is on)
  const azAt = (d) => c[Math.min(c.length - 1, Math.max(0, Math.round((+d - t0) / STEP)))].az;
  // Time axis: baseline, hourly ticks, labels
  const nH = (t1 - t0) / 3600e3, every = pw / nH < fs * 2.6 ? 3 : pw / nH < fs * 4.2 ? 2 : 1;
  s += `<line x1="${f(L)}" x2="${f(L + pw)}" y1="${f(T + ph)}" y2="${f(T + ph)}" stroke="var(--muted)" stroke-width="1.2"/>`;
  for (let t = Math.ceil(t0 / 3600e3) * 3600e3; t <= t1; t += 3600e3) {
    const d = new Date(t), x = X(d), hr = +new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: state.tz }).format(d);
    const lab = hr % every === 0;
    s += `<line x1="${f(x)}" x2="${f(x)}" y1="${f(T + ph)}" y2="${f(T + ph + (lab ? 6 : 3.5))}" stroke="var(--muted)" stroke-width="1"/>`;
    if (lab && x > L + fs * 1.2 && x < L + pw - fs * 1.2) {
      s += `<text x="${f(x)}" y="${f(T + ph + 7 + sm)}" font-size="${f(sm)}" text-anchor="middle" fill="var(--muted)">${esc(fmtHourShort(d))}</text>`;
      const az = azAt(d), out = state.home && !inHome(az);
      s += `<text x="${f(x)}" y="${f(T - fs * 0.55)}" font-size="${f(sm)}" font-weight="700" text-anchor="middle" fill="var(${out ? '--dim' : '--text'})"${out ? ' opacity=".6"' : ''}>${compass(az)}</text>`;
    }
  }
  // Callouts are placed after everything else so they can dodge the curves, markers and each other.
  const obst = [];
  const box = (x, y, w, h) => ({ x, y, w, h });
  const hit = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const dot = (x, y, r) => obst.push(box(x - r - 2, y - r - 2, 2 * r + 4, 2 * r + 4));
  c.forEach((p) => { dot(X(p.d), Y(p.alt), 2.5); if (p.moon > 0) dot(X(p.d), Y(p.moon), 1); });
  let marks = '', labels = '';
  // Pill: try each candidate spot, keep the one that covers the least of what's already drawn.
  const pill = (cands, txt, color) => {
    const w = txt.length * md * 0.56 + md * 1.1, h = md * 1.7;
    let best = null;
    for (const [x, y, anchor] of cands) {
      let x0 = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2;
      x0 = Math.max(L + 2, Math.min(L + pw - w - 2, x0));
      const y0 = Math.max(T + 2, Math.min(T + ph - h - 2, y - h / 2));
      const b = box(x0, y0, w, h), cost = obst.reduce((t, o) => t + hit(b, o), 0);
      if (!best || cost < best.cost) best = { b, cost };
      if (cost === 0) break;
    }
    const { x: x0, y: y0 } = best.b;
    obst.push(best.b);
    labels += `<rect x="${f(x0)}" y="${f(y0)}" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}" fill="var(--card)" stroke="${color}" stroke-width="1.2"/>
      <text x="${f(x0 + w / 2)}" y="${f(y0 + h / 2 + md * 0.34)}" font-size="${f(md)}" font-weight="700" text-anchor="middle" fill="${color}">${esc(txt)}</text>`;
  };
  const y40 = Y(MIN_ALT), gap = fs * 1.2;
  let xs = null;
  // When it reaches 40° (or is already above it when darkness starts)
  if (o.start) {
    const x = X(o.start), y = Y(altAt(o.start));
    xs = x;
    marks += `<line x1="${f(x)}" x2="${f(x)}" y1="${f(y)}" y2="${f(T + ph)}" stroke="var(--go)" stroke-width="1.4" stroke-dasharray="3 3"/>
      <circle cx="${f(x)}" cy="${f(y)}" r="${f(fs * 0.38)}" fill="var(--go)" stroke="var(--card)" stroke-width="2"/>`;
    dot(x, y, fs * 0.38);
    obst.push(box(x - 2, y, 4, T + ph - y));
    if (o.end) {
      const xe = X(o.end), ye = Y(altAt(o.end));
      marks += `<circle cx="${f(xe)}" cy="${f(ye)}" r="${f(fs * 0.3)}" fill="var(--card)" stroke="var(--go)" stroke-width="2"/>`;
      dot(xe, ye, fs * 0.3);
    }
  }
  // Peak
  let peakTxt = null;
  if (o.peak && o.peak.alt > 0) {
    const x = X(o.peak.d), y = Y(o.peak.alt);
    marks += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(fs * 0.26)}" fill="var(--accent)"/>`;
    dot(x, y, fs * 0.26);
    peakTxt = [x, y];
  }
  // Now marker; its label flips to the other side of the line if it would sit on the 40° marker.
  if (now && +now > t0 && +now < t1) {
    const x = X(now), tw = sm * 1.9;
    const right = xs == null || xs < x - 2 || xs > x + tw + 8;
    const tx = right ? x + 4 : x - 4;
    marks += `<line x1="${f(x)}" x2="${f(x)}" y1="${f(T)}" y2="${f(T + ph)}" stroke="var(--text)" stroke-opacity=".55" stroke-width="1" stroke-dasharray="2 3"/>`;
    labels += `<text x="${f(tx)}" y="${f(T + ph - 5)}" font-size="${f(sm)}" font-weight="700" text-anchor="${right ? 'start' : 'end'}" fill="var(--text)" opacity=".75">Now</text>`;
    obst.push(box(right ? tx : tx - tw, T + ph - 5 - sm, tw, sm + 2));
  }
  if (o.start) {
    const x = X(o.start);
    const label = o.startWhy === 'alt' ? `Reaches 40° · ${fmtTime(o.start)}` : o.startWhy === 'dir' ? `In home sky · ${fmtTime(o.start)}` : `Dark · ${fmtTime(o.start)} · ${Math.round(o.startAlt)}°`;
    const side = x > L + pw * 0.6 ? 'end' : 'start', dx = side === 'end' ? -fs * 0.6 : fs * 0.6;
    pill([[x + dx, y40 + gap, side], [x + dx, y40 - gap, side], [x + dx, y40 + gap * 2.6, side], [x + dx, T + fs, side], [x - dx, y40 + gap, side === 'end' ? 'start' : 'end']], label, 'var(--go)');
    if (o.end) {
      const xe = X(o.end);
      const txt = `${o.endWhy === 'alt' ? 'Below 40°' : o.endWhy === 'dir' ? 'Leaves home sky' : 'Dawn'} · ${fmtTime(o.end)}`;
      pill([[xe - fs * 0.6, y40 + gap, 'end'], [xe + fs * 0.6, y40 + gap, 'start'], [xe - fs * 0.6, y40 + gap * 2.6, 'end'], [xe + fs * 0.6, y40 + gap * 2.6, 'start'], [xe, T + ph - gap * 2, 'middle'], [xe, T + fs * 2.8, 'middle']], txt, 'var(--muted)');
    }
  }
  if (peakTxt) {
    const [x, y] = peakTxt, tw = sm * 4.2, b = box(x - tw / 2, y - fs * 0.7 - sm, tw, sm + 2);
    if (y - fs * 0.7 - sm > T && !obst.some((o2) => hit(b, o2) > 0)) labels += `<text x="${f(x)}" y="${f(y - fs * 0.7)}" font-size="${f(sm)}" font-weight="700" text-anchor="middle" fill="var(--accent)">Peak ${Math.round(o.peak.alt)}°</text>`;
  }
  s += marks + labels;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Altitude through the night">${s}</svg>`;
}

const tile = (lbl, val, sub = '', cls = '') => `<div class="tile ${cls}"><span class="lbl">${esc(lbl)}</span><b>${esc(val)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
function windowTiles(o) {
  const now = state.data ? state.data.now : new Date();
  const upNow = o.start && o.start <= now && now < o.end;
  return o.start
    ? tile(o.startWhy === 'alt' ? 'Reaches 40°' : o.startWhy === 'dir' ? 'Into home sky' : 'Above 40° at dark', fmtTime(o.start), (o.startWhy === 'alt' ? 'rising through 40°' : o.startWhy === 'dir' ? `comes round past NW at ${Math.round(o.startAlt)}°` : `already ${Math.round(o.startAlt)}° when dark begins`) + (upNow ? ' · up now' : ''), 'key')
      + tile('Imaging window', `${o.hrs.toFixed(1)} h`, `until ${fmtTime(o.end)}${o.endWhy === 'dark' ? ' (dawn)' : o.endWhy === 'dir' ? ' (passes S)' : ''}`, 'key')
    : tile('Reaches 40°', 'Not tonight', `in darkness`, 'warn');
}
function openObject(o) {
  if (!o) return;
  const now = state.data.now;
  const peakTxt = o.peak ? `${Math.round(o.peak.alt)}° ${compass(o.peak.az)}` : '–'; // planets: peak = best after dusk
  let title, sub, hero, tiles, rows, tip;
  if (o.kind === 'dso') {
    const info = DSO_INFO[o.id] || [null, '', '–'];
    const sz = parseSize(info[1]);
    const [fit, fitSub] = frameFit(sz);
    title = `${o.id} · ${o.name}`;
    sub = `${o.type} in ${constellation(o.ra, o.dec)}`;
    hero = heroSky(o.ra, o.dec, sz ? sz[0] : 0, 'DSS2 sky survey · dashed box = Seestar S50 frame · circle = full Moon');
    tiles = windowTiles(o) + tile('Peak', peakTxt, o.peak ? `at ${fmtTime(o.peak.d)}` : '') + tile('Fits Seestar frame', fit, fitSub);
    rows = [
      ['Size', info[1] ? `${info[1]} (arcminutes)` : '–'], ['In plain terms', sizeScale(sz) || '–'],
      ['Seestar frame', `${SEESTAR.w}° × ${SEESTAR.h}° (77′ × 43′)`],
      ['Magnitude', info[0] == null ? 'Faint, diffuse nebula' : info[0].toFixed(1)], ['Distance', info[2]],
      ['RA / Dec (J2000)', `${raHM(o.ra)} / ${decDM(o.dec)}`],
      ['Moon at peak', o.moonSep == null ? 'Below horizon' : `${Math.round(o.moonSep)}° away`],
    ];
    tip = TYPE_TIP(o.type);
  } else if (o.kind === 'planet') {
    const px = o.size / SEESTAR.scale;
    title = o.name;
    const eq = A.Equator(o.name, o.d, state.data.obs, false, true);
    sub = `Planet in ${constellation(eq.ra, eq.dec)}`;
    hero = heroPhoto(PLANET_WIKI[o.name] || o.name);
    const rs = crossings(o.curve, 0);
    const rise = rs.find((x) => x.kind === 'rise'), set = rs.find((x) => x.kind === 'set');
    tiles = windowTiles(o) + tile('Highest', peakTxt, `at ${fmtTime(o.d)}`) + tile('Magnitude', o.mag.toFixed(1), o.mag < 0 ? 'very bright' : '')
      + (o.start ? '' : tile('Apparent size', `${o.size.toFixed(o.size < 10 ? 1 : 0)}″`, `≈ ${Math.max(1, Math.round(px))} px in the Seestar`));
    rows = [
      ['Apparent size', `${o.size.toFixed(o.size < 10 ? 1 : 0)}″ (arcseconds${o.name === 'Saturn' ? ', globe' : ''})`],
      ['In the Seestar', `≈ ${Math.max(1, Math.round(px))} px across (frame 1080 × 1920 px)`],
      ['Lit', `${Math.round(o.phase * 100)}%`],
      ['Distance', `${o.distAU.toFixed(2)} AU · ${Math.round((o.distAU * 149.5978707) * 10) / 10} million km`],
      ['Rises / sets', `${rise ? fmtTime(rise.d) : '–'} / ${set ? fmtTime(set.d) : '–'}`],
      ['Moon at best time', o.moonSep == null ? 'Below horizon' : `${Math.round(o.moonSep)}° away`],
    ];
    tip = `Planets are tiny at the S50's 250 mm focal length — ${o.name} will be a small bright disc (about ${Math.max(1, Math.round(px))} px), not a detailed close-up. Higher is sharper: shoot near ${fmtTime(o.d)}.`;
  } else {
    const c = o.el;
    title = `${o.id} · ${o.name}`;
    sub = `Comet in ${constellation(o.ra, o.dec)}`;
    const sky = heroSky(o.ra, o.dec, 0, 'Star field at the comet’s position tonight (DSS2) · the comet moves nightly', true);
    hero = c.wiki ? heroPhoto(c.wiki, sky) : sky;
    const tp = new Date((c.tp - 2440587.5) * 86400e3);
    tiles = windowTiles(o) + tile('Peak', peakTxt, `at ${fmtTime(o.peak.d)}`) + tile('Brightness', `≈ ${o.mag.toFixed(1)}`, 'predicted magnitude');
    rows = [
      ['Perihelion', `${fmtDay(tp)}, ${tp.getFullYear()}`],
      ['From Earth', `${o.delta.toFixed(2)} AU · ${Math.round(o.delta * 149.6)} million km`],
      ['From Sun', `${o.r.toFixed(2)} AU`],
      ['RA / Dec (J2000)', `${raHM(o.ra)} / ${decDM(o.dec)} at peak`],
      ['Moon at peak', o.moonSep == null ? 'Below horizon' : `${Math.round(o.moonSep)}° away`],
    ];
    tip = 'Comets drift against the stars, so 15–30 minute sessions keep the head sharp. LP filter off. Brightness predictions are uncertain — comets can surprise either way.';
  }
  showSheet(title, `<div class="obj">
      <div class="obj-top">${hero}<div class="tiles">${tiles}</div></div>
      <section class="chart-card">
        <div class="chart-head"><h3>Altitude tonight</h3><span>${o.start ? `In view ≥40° for ${o.hrs.toFixed(1)} h` : `Never reaches ${MIN_ALT}° in darkness`}</span></div>
        <div class="chart" id="objChart"></div>
        <div class="chart-key"><span><i class="k-tgt"></i>${esc(o.kind === 'planet' ? o.name : o.id)}</span><span><i class="k-moon"></i>Moon</span><span><i class="k-min"></i>40° minimum</span><span><i class="k-win"></i>Imaging window</span><span><i class="k-dark"></i>Full dark</span></div>
      </section>
      <dl class="facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <div class="tip"><b>Seestar tip</b>${esc(tip)}</div>
      <p class="fine">${o.kind === 'comet' ? 'Orbit: JPL Horizons. Positions computed on device.' : o.kind === 'dso' ? 'Catalog sizes and magnitudes are approximate.' : 'Positions computed on device (Astronomy Engine).'}</p>
    </div>`, sub, true);
  state.openObj = o;
  const draw = () => altChart($('#objChart'), o, now);
  requestAnimationFrame(draw);
  wireHero($('#sheetBody'));
}
function showTarget(i) { const D = state.data; openObject(D && D.nights[state.night].targets[i]); }
function showPlanet(i) { const D = state.data; openObject(D && D.nights[state.night].planets[i]); }

/* ---------- options ---------- */
function homeWheel() {
  const C = 130, R1 = 38, R2 = 108, RL = 122, rad = Math.PI / 180;
  const pt = (a, r) => `${(C + r * Math.sin(a * rad)).toFixed(1)} ${(C - r * Math.cos(a * rad)).toFixed(1)}`;
  let s = '';
  state.homeSky.forEach((on, i) => {
    const a0 = i * 22.5 - 11.25, a1 = a0 + 22.5;
    s += `<path class="wedge${on ? ' on' : ''}" data-w="${i}" role="checkbox" aria-checked="${on}" aria-label="${PT16[i]}" tabindex="0"
      d="M${pt(a0, R1)} L${pt(a0, R2)} A${R2} ${R2} 0 0 1 ${pt(a1, R2)} L${pt(a1, R1)} A${R1} ${R1} 0 0 0 ${pt(a0, R1)}Z"/>`;
  });
  PT16.forEach((n, i) => {
    const big = i % 4 === 0, mid = i % 2 === 0, a = i * 22.5, r = big || mid ? RL : RL - 2;
    const [x, y] = pt(a, r).split(' ');
    s += `<text x="${x}" y="${(+y + (big ? 5 : 4)).toFixed(1)}" text-anchor="middle" class="wl${big ? ' big' : mid ? '' : ' sm'}">${big || mid ? n : '·'}</text>`;
  });
  s += `<circle cx="${C}" cy="${C}" r="${R1 - 6}" class="hub"/><text x="${C}" y="${C + 5}" text-anchor="middle" class="wl big">You</text>`;
  return `<svg viewBox="0 0 ${C * 2} ${C * 2}" class="wheel" aria-label="Home sky directions">${s}</svg>`;
}
function renderOptions() {
  const box = $('#optHome');
  if (!box) return;
  box.querySelector('.wheel-wrap').innerHTML = homeWheel();
  box.querySelector('.wheel-desc').textContent = homeDesc();
}
function saveHome() {
  store.set('homeSky', state.homeSky);
  renderOptions(); applyHome();
  if (state.home) { findTargets(); renderAll(); }
}
function showOptions() {
  showSheet('Options', `<section class="opt" id="optHome">
      <h3 class="opt-h">Home sky</h3>
      <p class="note" style="margin:0 0 .6em">Tap wedges to add or remove the directions you can see from home. The <b>Home</b> switch then only shows targets in these directions.</p>
      <div class="wheel-wrap"></div>
      <p class="wheel-sum">Visible: <b class="wheel-desc"></b></p>
      <div class="opt-btns"><button type="button" class="tbtn" data-act="all">All</button><button type="button" class="tbtn" data-act="none">None</button><button type="button" class="tbtn ghost" data-act="reset">Reset (NW → S)</button></div>
    </section>`);
  const box = $('#optHome');
  const toggle = (w) => { state.homeSky[+w.dataset.w] = !state.homeSky[+w.dataset.w]; saveHome(); };
  box.addEventListener('click', (e) => {
    const w = e.target.closest('[data-w]');
    if (w) return toggle(w);
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    state.homeSky = act === 'all' ? Array(16).fill(true) : act === 'none' ? Array(16).fill(false) : HOME_DEFAULT.slice();
    saveHome();
  });
  box.addEventListener('keydown', (e) => { const w = e.target.closest('[data-w]'); if (w && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(w); box.querySelector(`[data-w="${w.dataset.w}"]`).focus(); } });
  renderOptions();
}

function showSources() {
  const src = state.data && state.data.src;
  if (!src) { showSheet('Data sources', '<p class="note">Load a forecast first.</p>'); return; }
  const items = [];
  OM_MODELS.forEach((m) => items.push([m.name + ' (Open-Meteo)', !!src.om[m.id]]));
  items.push(['MET Norway (yr.no)', !!src.met]);
  ENSEMBLES.forEach((e) => items.push([e.name + ' (Open-Meteo)', !!src.ens[e.name], src.ens[e.name] ? src.ens[e.name].members + ' runs' : '']));
  items.push(['7Timer! ASTRO — seeing & transparency', !!src.t7]);
  items.push(['Astronomy Engine — Sun, Moon, planets (on device)', true]);
  showSheet('Data sources', `<table class="src"><tbody>${items.map(([n, ok, x]) => `<tr><td>${esc(n)}${x ? ` <span class="muted">${esc(x)}</span>` : ''}</td><td class="n ${ok ? 'ok' : 'bad'}">${ok ? '✓ Online' : 'Unavailable'}</td></tr>`).join('')}</tbody></table>`);
}

function renderAll() {
  const D = state.data;
  applyNight();
  if (!D) return;
  const N = D.nights[state.night];
  renderVerdict(N.win, N.moon, N.hours);
  renderTonight(N.win);
  renderForecast(N.hours);
  $('#fcTitle').textContent = `Dark hours · ${fmtDay(N.win.set)}`;
  $('#pathTitle').textContent = state.night ? 'Moon path · tomorrow' : 'Moon path';
  renderMoon(N.moon, D.lat);
  renderPath(N.moon, D.lat, D.now);
  renderPlanets(N.planets);
  renderTargets(N.targets);
  const s = D.src, on = OM_MODELS.filter((m) => s.om[m.id]).length + ENSEMBLES.filter((e) => s.ens[e.name]).length + (s.met ? 1 : 0) + (s.t7 ? 1 : 0);
  $('#sourcesBtn').textContent = `Data sources · ${on}/${OM_MODELS.length + ENSEMBLES.length + 2} online`;
  $('#updated').textContent = 'Updated ' + fmtDay(D.now) + ', ' + fmtTime(D.now);
}

/* Planets and targets for both nights; re-run when the Home sky switch changes. */
function findTargets() {
  const D = state.data;
  if (!D) return;
  for (const N of D.nights) {
    N.planets = planetsTonight(D.obs, N.S);
    N.targets = [...cometsTonight(D.obs, N.S, N.win), ...targetsTonight(D.obs, N.S)];
  }
}
function applyHome() {
  const b = $('#homeBtn');
  b.setAttribute('aria-pressed', String(state.home));
  b.title = state.home ? `Home sky on: only ${homeDesc()}` : `Home sky: only show targets in ${homeDesc()} (set in Options)`;
  b.setAttribute('aria-label', b.title);
}

/* ---------- main load ---------- */
function setStatus(msg, err) { const s = $('#status'); s.textContent = msg || ''; s.classList.toggle('err', !!err); }

let loading = 0;
async function load() {
  const loc = state.loc;
  if (!loc) { setStatus('Choose a location: tap 📍 GPS or search for a place.'); return; }
  const run = ++loading;
  const lat = (+loc.lat).toFixed(4), lon = (+loc.lon).toFixed(4);
  $('#locLabel').textContent = `${loc.name} · ${(+loc.lat).toFixed(3)}, ${(+loc.lon).toFixed(3)}`;
  setStatus('Loading forecasts…');
  const settle = (p) => p.then((v) => v, () => null);
  const [omRes, ensRes, met, t7] = await Promise.all([
    Promise.all(OM_MODELS.map((m) => settle(fetchOM(m, lat, lon)))),
    Promise.all(ENSEMBLES.map((e) => settle(fetchEnsemble(e, lat, lon)))),
    settle(fetchMET(lat, lon)),
    settle(fetch7Timer(lat, lon)),
  ]);
  if (run !== loading) return; // a newer load started
  const src = { om: {}, ens: {}, met, t7 };
  OM_MODELS.forEach((m, i) => { if (omRes[i]) src.om[m.id] = omRes[i]; });
  ENSEMBLES.forEach((e, i) => { if (ensRes[i]) src.ens[e.name] = ensRes[i]; });
  const tz = (Object.values(src.om)[0] || {}).tz;
  state.tz = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!Object.keys(src.om).length && !met) {
    setStatus('Could not reach any weather service. Check your connection and tap ↻.', true);
  }
  const now = new Date();
  const obs = new A.Observer(+loc.lat, +loc.lon, 0);
  // Tonight (the night in progress, or the next one if it's daytime) and tomorrow night.
  const w0 = nightWindow(obs, now);
  const w1 = nightWindow(obs, new Date(w0.rise.getTime() + 3600e3));
  const night = (win, from) => {
    const mid = new Date((win.set.getTime() + win.rise.getTime()) / 2);
    const moon = moonInfo(obs, mid, win);
    const S = nightSamples(obs, win);
    return { win, moon, S, darkLim: S.darkLim, hours: buildHours(from, win.rise, src, obs, moon.illum).filter((h) => h.sky.k !== 'day') };
  };
  const nights = [night(w0, w0.set > now ? w0.set : now), night(w1, w1.set)];
  state.data = { now, lat: +loc.lat, obs, src, nights };
  findTargets();
  renderAll();
  if (Object.keys(src.om).length || met) setStatus('');
}

/* ---------- locations ---------- */
function renderSpots() {
  const sel = $('#spotSelect');
  const opts = ['<option value="gps">📍 Current location (GPS)</option>'];
  state.spots.forEach((s, i) => opts.push(`<option value="${i}">${esc(s.name)}</option>`));
  if (state.loc && !state.loc.gps && !state.spots.some((s) => s.lat === state.loc.lat && s.lon === state.loc.lon)) {
    opts.push(`<option value="cur">${esc(state.loc.name)} (not saved)</option>`);
  }
  sel.innerHTML = opts.join('');
  if (!state.loc || state.loc.gps) sel.value = 'gps';
  else {
    const i = state.spots.findIndex((s) => s.lat === state.loc.lat && s.lon === state.loc.lon);
    sel.value = i >= 0 ? String(i) : 'cur';
  }
  $('#removeBtn').hidden = !(sel.value !== 'gps' && sel.value !== 'cur');
}
function setLoc(loc) {
  state.loc = loc;
  store.set('lastLoc', loc);
  renderSpots();
  load();
}
function useGPS() {
  if (!navigator.geolocation) { setStatus('This device has no GPS access in the browser. Search for a place instead.', true); return; }
  setStatus('Getting your location…');
  navigator.geolocation.getCurrentPosition(
    (p) => setLoc({ name: 'Current location', lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), gps: true }),
    (e) => setStatus('Location blocked or unavailable (' + e.message + '). Search for a place instead.', true),
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60e3 },
  );
}
let searchTimer;
function onSearch() {
  clearTimeout(searchTimer);
  const q = $('#searchInput').value.trim();
  const ul = $('#searchResults');
  if (q.length < 2) { ul.hidden = true; return; }
  searchTimer = setTimeout(async () => {
    try {
      const j = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
      const res = j.results || [];
      ul.innerHTML = res.length ? res.map((r, i) => `<li data-i="${i}">${esc(r.name)}<span class="muted small">${esc([r.admin1, r.country].filter(Boolean).join(', '))}</span></li>`).join('') : '<li class="muted">No matches</li>';
      ul.hidden = false;
      ul.querySelectorAll('li[data-i]').forEach((li) => li.addEventListener('click', () => {
        const r = res[+li.dataset.i];
        ul.hidden = true; $('#searchInput').value = ''; toggleSearch(false);
        setLoc({ name: [r.name, r.admin1].filter(Boolean).join(', '), lat: +r.latitude.toFixed(4), lon: +r.longitude.toFixed(4) });
      }));
    } catch (e) { ul.innerHTML = '<li class="muted">Search unavailable</li>'; ul.hidden = false; }
  }, 350);
}

/* ---------- settings ---------- */
function applyRed() {
  document.documentElement.classList.toggle('red', state.red);
  $('#redBtn').setAttribute('aria-pressed', String(state.red));
  $('#redBtn .lbl').textContent = state.red ? 'Normal' : 'Red';
  document.querySelector('meta[name=theme-color]').setAttribute('content', state.red ? '#000000' : '#070b16');
}
function applyUnits() {
  document.querySelectorAll('#unitsBtn span').forEach((s) => s.classList.toggle('on', s.dataset.u === state.units));
}
function applyNight() {
  document.querySelectorAll('#nightSeg button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.n === state.night)));
  const n = state.night ? 'Tomorrow night' : 'Tonight';
  $('#verdictEyebrow').textContent = n;
}
function toggleSearch(open) {
  const p = $('#searchPanel');
  const show = open == null ? p.hidden : open;
  p.hidden = !show;
  $('#searchBtn').setAttribute('aria-expanded', String(show));
  if (show) setTimeout(() => $('#searchInput').focus(), 30);
  else $('#searchResults').hidden = true;
}

function init() {
  $('#ver').textContent = VERSION;
  applyRed(); applyUnits(); applyNight(); applyHome(); renderSpots();
  $('#homeBtn').addEventListener('click', () => { state.home = !state.home; store.set('home', state.home); applyHome(); findTargets(); renderAll(); });
  $('#redBtn').addEventListener('click', () => { state.red = !state.red; store.set('red', state.red); applyRed(); });
  $('#unitsBtn').addEventListener('click', () => { state.units = state.units === 'metric' ? 'imperial' : 'metric'; store.set('units', state.units); applyUnits(); renderAll(); });
  $('#refreshBtn').addEventListener('click', () => (state.loc && state.loc.gps ? useGPS() : load()));
  $('#gpsBtn').addEventListener('click', useGPS);
  $('#searchBtn').addEventListener('click', () => toggleSearch());
  document.querySelectorAll('#nightSeg button').forEach((b) => b.addEventListener('click', () => { state.night = +b.dataset.n; renderAll(); }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleSearch(false); });
  document.addEventListener('click', (e) => {
    if (!$('#searchPanel').hidden && !e.target.closest('#searchPanel, #searchBtn')) toggleSearch(false);
  });
  $('#forecast').addEventListener('click', (e) => { const c = e.target.closest('[data-i]'); if (c) showHour(+c.dataset.i); });
  $('#sourcesBtn').addEventListener('click', showSources);
  $('#optBtn').addEventListener('click', showOptions);
  $('#topTargets').addEventListener('click', (e) => { const t = e.target.closest('[data-t]'); if (t) showTarget(+t.dataset.t); });
  $('#targets').addEventListener('click', (e) => { const t = e.target.closest('[data-t]'); if (t) showTarget(+t.dataset.t); });
  $('#planets').addEventListener('click', (e) => { const t = e.target.closest('[data-p]'); if (t) showPlanet(+t.dataset.p); });
  $('#sheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => {
    const D = state.data; if (!D) return;
    renderPath(D.nights[state.night].moon, D.lat, D.now);
    if ($('#sheet').open && $('#objChart') && state.openObj) altChart($('#objChart'), state.openObj, D.now);
  }, 150); });
  $('#searchInput').addEventListener('input', onSearch);
  $('#spotSelect').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === 'gps') useGPS();
    else if (v !== 'cur') setLoc({ ...state.spots[+v] });
  });
  $('#saveBtn').addEventListener('click', () => {
    if (!state.loc) { setStatus('Pick a location first.', true); return; }
    const name = (prompt('Name this spot (e.g. Home, Shuswap cabin):', state.loc.gps ? '' : state.loc.name) || '').trim();
    if (!name) return;
    const spot = { name, lat: state.loc.lat, lon: state.loc.lon };
    state.spots = state.spots.filter((s) => !(s.lat === spot.lat && s.lon === spot.lon)).concat(spot);
    store.set('spots', state.spots);
    setLoc(spot);
  });
  $('#removeBtn').addEventListener('click', () => {
    const v = $('#spotSelect').value;
    if (v === 'gps' || v === 'cur') return;
    const s = state.spots[+v];
    if (!confirm(`Remove “${s.name}”?`)) return;
    state.spots.splice(+v, 1);
    store.set('spots', state.spots);
    state.loc = { ...s }; store.set('lastLoc', state.loc);
    renderSpots();
  });
  if (state.loc) load(); else useGPS();
  setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30 * 60e3);
}

if (!A) { setStatus('Astronomy library failed to load.', true); } else init();
