'use strict';
/* Sky Watch — hour-by-hour night sky forecast for a Seestar S50.
   Weather: Open-Meteo (GFS, ECMWF, GEM, ICON + ensembles), MET Norway, 7Timer!.
   Astronomy: Astronomy Engine (bundled, MIT) — all sky math runs in the browser. */

const VERSION = 'v3.68';
const LIGHT = window.matchMedia('(prefers-color-scheme: light)');
const A = window.Astronomy;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};

/* Home sky: 16 wedges of 22.5°, wedge i runs from compass point i to point i+1 (N→NNE, NNE→NE …),
   so the dividing lines fall exactly on N, E, S and W. Default: NW clockwise through N and E to S. */
const HOME_DEFAULT = Array.from({ length: 16 }, (_, i) => i <= 7 || i >= 14);
const PT16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const state = {
  units: store.get('units', 'metric'),
  red: store.get('red', false),
  theme: store.get('theme', 'auto'), // 'auto' follows the system; 'light' / 'dark' override it
  spots: store.get('spots', []),
  loc: store.get('lastLoc', null), // {name, lat, lon, gps?}
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  data: null,
  night: 0, // 0 = tonight, 1 = tomorrow night, 2 = the night after
  q: '', // target search text (not saved)
  tm: null, // Time Machine time (null = now); not saved, so the app always opens on Now
  home: store.get('home', false), // only count the part of the sky set in Options
  homeLoc: store.get('homeLoc', null), // {lat, lon} where Home sky was turned on; Home is on only near here
  homeSky: (() => {
    const v = store.get('homeSky2', null);
    if (Array.isArray(v) && v.length === 16) return v.map(Boolean);
    // Older versions centred wedges on the compass points: keep a new wedge only if both old halves were on.
    const o = store.get('homeSky', null);
    return Array.isArray(o) && o.length === 16 ? o.map((x, i) => !!(x && o[(i + 1) % 16])) : HOME_DEFAULT.slice();
  })(),
};

/* ---------- formatting ---------- */
const fmtTime = (d) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: state.tz }).format(d);
const fmtHour = (d) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', timeZone: state.tz }).format(d);
const fmtDay = (d) => new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: state.tz }).format(d);
const isNum = (v) => typeof v === 'number' && isFinite(v);
const avg = (a) => { const v = a.filter(isNum); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const r0 = (v) => (isNum(v) ? Math.round(v) : '–');
const pct = (v) => (isNum(v) ? Math.round(v) + '%' : '–');
const num = (v) => (isNum(v) ? String(Math.round(v)) : '–');
const temp = (c) => (!isNum(c) ? '–' : state.units === 'metric' ? Math.round(c) + '°' : Math.round(c * 9 / 5 + 32) + '°');
const tempDiff = (c) => (!isNum(c) ? '–' : state.units === 'metric' ? Math.round(c) + '°' : Math.round(c * 9 / 5) + '°');
const wind = (k) => (!isNum(k) ? '–' : state.units === 'metric' ? String(Math.round(k)) : String(Math.round(k / 1.609344)));
const windU = () => (state.units === 'metric' ? 'km/h' : 'mph');
const rain = (mm) => (!isNum(mm) ? '–' : state.units === 'metric' ? mm.toFixed(1) + ' mm' : (mm / 25.4).toFixed(2) + ' in');
/* Home sky: the wedges picked in Options (16 × 22.5°). */
const inHome = (az) => state.homeSky[Math.floor((((az % 360) + 360) % 360) / 22.5) % 16];
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
  return runs.map(([a, b]) => `${PT16[a]} → ${PT16[(b + 1) % 16]}`).join(', ');
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
// Fallback URLs exist for rejected parameters (fast HTTP errors). A timeout means the server is slow,
// so stop there instead of waiting out every fallback in turn.
async function firstOK(urls, ms) {
  let last;
  for (const u of urls) {
    try { return await getJSON(u, ms); } catch (e) { last = e; if (e.name === 'AbortError') break; }
  }
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
  const urls = [OM_FULL, OM_MID, OM_MIN].flatMap((v) => [base + '&past_days=1&forecast_days=4&hourly=' + v, base + '&forecast_days=4&hourly=' + v]);
  const j = await firstOK(urls, 10000);
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
  const urls = ens.ids.map((id) => `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${lat}&longitude=${lon}&timeformat=unixtime&forecast_days=4&hourly=precipitation&models=${id}`);
  const j = await firstOK(urls, 12000);
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
// 7Timer! is slow (often 10–30 s) and sometimes returns broken JSON
// (e.g. `"temp2m" : ,`), so: long timeout, repair the text, retry, try both hosts.
async function get7TimerJSON(url, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = (await r.text()).replace(/:\s*(?=[,}\]])/g, ': null');
    return JSON.parse(txt);
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'timed out' : (e.message || 'failed'));
  } finally { clearTimeout(t); }
}
async function fetch7Timer(lat, lon) {
  // 7Timer! only serves plain HTTP with no CORS, which an HTTPS page (GitHub Pages) is not allowed to call.
  // So ask several HTTPS relays at the same time and take the first valid answer.
  const target = `http://www.7timer.info/bin/astro.php?lon=${(+lon).toFixed(3)}&lat=${(+lat).toFixed(3)}&ac=0&unit=metric&output=json&tzshift=0`;
  const e = encodeURIComponent(target);
  const urls = [
    `https://api.allorigins.win/raw?url=${e}`,
    `https://api.codetabs.com/v1/proxy/?quest=${e}`,
    `https://corsproxy.io/?url=${e}`,
    target.replace('http://', 'https://'),
  ];
  let j;
  try {
    j = await Promise.any(urls.map(async (u) => {
      const r = await get7TimerJSON(u, 25000);
      if (!r || !Array.isArray(r.dataseries) || !r.dataseries.length) throw new Error('no data');
      return r;
    }));
  } catch (err) {
    const msgs = (err.errors || [err]).map((x) => x && x.message).filter(Boolean);
    const last = new Error(msgs.includes('timed out') ? 'timed out' : msgs[0] || 'failed');
    state.t7err = last.message; throw last;
  }
  state.t7err = '';
  const s = String(j.init);
  const t0 = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10)) / 1000;
  return j.dataseries.map((d) => ({
    t: t0 + d.timepoint * 3600,
    seeing: d.seeing >= 1 && d.seeing <= 8 ? d.seeing : null,
    transparency: d.transparency >= 1 && d.transparency <= 8 ? d.transparency : null,
    cloud: d.cloudcover >= 1 && d.cloudcover <= 9 ? [3, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 97][d.cloudcover - 1] : null,
  }));
}

// Last good 7Timer! result from THIS session only (in memory, never saved to the device).
// Used when a later fetch fails for the same location; a quiet retry follows.
let t7Cache = null; // { key, data, at }
let t7Retry = null, t7Tries = 0;
const t7Key = (lat, lon) => (+lat).toFixed(2) + ',' + (+lon).toFixed(2);
function scheduleT7Retry(lat, lon, key) {
  clearTimeout(t7Retry);
  if (t7Tries >= 3) return;
  t7Retry = setTimeout(async () => {
    t7Tries++;
    try {
      const data = await fetch7Timer(lat, lon);
      t7Cache = { key, data, at: new Date() };
      const D = state.data;
      if (!D || D.key !== key) return; // location changed
      D.src.t7 = data; D.src.t7cached = null;
      buildNights(D.src, D.now);
    } catch (e) { scheduleT7Retry(lat, lon, key); }
  }, 5 * 60e3);
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

/* Local hour (0-23) at the forecast location. */
function localHour(d) {
  const h = +new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: state.tz }).format(d);
  return isNum(h) ? h % 24 : d.getHours();
}
/* "Tonight" stays the night in progress until less than 2 hours of darkness remain; then it moves to the coming evening. */
const ROLLOVER_LEFT = 2 * 3600e3;
function nightWindow(obs, now, rollover) {
  const sunNow = altAz('Sun', now, obs).alt;
  const calc = (from) => {
    const set = tdate(A.SearchRiseSet('Sun', obs, -1, from, 1.5));
    if (!set) return { set: now, rise: new Date(now.getTime() + 12 * 3600e3), polar: true };
    const rise = tdate(A.SearchRiseSet('Sun', obs, +1, set, 1.5)) || new Date(set.getTime() + 12 * 3600e3);
    let darkStart = tdate(A.SearchAltitude('Sun', obs, -1, set, 1, -18));
    let darkEnd = darkStart ? tdate(A.SearchAltitude('Sun', obs, +1, darkStart, 1, -18)) : null;
    if (darkStart && darkStart > rise) { darkStart = null; darkEnd = null; }
    return { set, rise, darkStart, darkEnd };
  };
  const dayNow = sunNow > -0.833;
  let w = calc(dayNow ? now : new Date(now.getTime() - 86400000));
  if (rollover && !dayNow && !w.polar) {
    const end = (w.darkEnd || w.rise).getTime();   // end of the dark hours (or sunrise if it never gets fully dark)
    if (now.getTime() > end - ROLLOVER_LEFT) w = calc(now);
  }
  return w;
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

/* ---------- night sampling & minimum-elevation windows ---------- */
const ALT_DEF = 40, ALT_LO = 0, ALT_HI = 85;
let MIN_ALT = (() => { const v = +store.get('minAlt', ALT_DEF); return isNum(v) ? Math.min(ALT_HI, Math.max(ALT_LO, Math.round(v))) : ALT_DEF; })(); // minimum elevation, set in Options
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

/* Track an object through the night: altitude curve, the windows when it is ≥ MIN_ALT in darkness, and its peak. */
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
      const up = prev && dark(prev) && prev.alt < MIN_ALT; // climbed through MIN_ALT during darkness
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

/* The Comets list under Planets: every comet that climbs above the set elevation (Options) during full dark hours, however faint.
   Home sky is ignored for inclusion; a comet only the Home sky blocks stays listed but greyed out (blocked). cometsTonight() above still picks the bright ones for the target lists. */
function cometsAll(obs, S) {
  const out = [], home = state.home;
  for (const c of COMETS) {
    const pos = (d) => { const p = cometPos(c, d); return altAzRaDec(p.ra, p.dec, d, obs); };
    state.home = false;
    let tr; try { tr = track(S, pos); } finally { state.home = home; }
    if (!tr.start) continue;
    let use = tr, blocked = false;
    if (home) { const th = track(S, pos); if (th.start) use = th; else blocked = true; }
    const pk = use.peak, at = cometPos(c, pk.d);
    out.push({
      kind: 'comet', id: c.id, name: c.name, type: 'Comet', el: c, ...use, blocked, d: pk.d, alt: pk.alt, az: pk.az,
      ra: at.ra2000, dec: at.dec2000, mag: at.mag, r: at.r, delta: at.delta, moonSep: moonSepAt(pk),
    });
  }
  return out.sort((a, b) => a.mag - b.mag);
}

/* Seestar-friendly deep-sky objects (J2000 RA hours, Dec degrees). */
const DSO = [
  // Open clusters are left out (sparse star groupings image poorly) except a few rich ones.
  // Curated favourites first, then every other NGC/IC/Messier object from OpenNGC that is at least 6′ across
  // and reasonably bright (galaxies mag ≤ 10, globulars ≤ 9; nebulae by size alone), north of −40°.
  ['M31', 'Andromeda Galaxy', 'Galaxy', 0.712, 41.27],
  ['M33', 'Triangulum Galaxy', 'Galaxy', 1.564, 30.66],
  ['M45', 'Pleiades', 'Cluster + reflection', 3.79, 24.12],
  ['M42', 'Orion Nebula', 'Emission nebula', 5.588, -5.39],
  ['M1', 'Crab Nebula', 'Supernova remnant', 5.575, 22.01],
  ['NGC 2237', 'Rosette Nebula', 'Emission nebula', 6.53, 4.95],
  ['IC 434', 'Horsehead Nebula', 'Emission nebula', 5.683, -2.46],
  ['NGC 1499', 'California Nebula', 'Emission nebula', 4.05, 36.42],
  ['IC 1805', 'Heart Nebula', 'Emission nebula', 2.555, 61.45],
  ['IC 1848', 'Soul Nebula', 'Emission nebula', 2.85, 60.43],
  ['NGC 281', 'Pacman Nebula', 'Emission nebula', 0.88, 56.62],
  ['NGC 869/884', 'Double Cluster', 'Open cluster', 2.33, 57.13],
  ['NGC 7000', 'North America Nebula', 'Emission nebula', 20.98, 44.33],
  ['NGC 6960', 'Western Veil', 'Supernova remnant', 20.76, 30.71],
  ['NGC 6992', 'Eastern Veil', 'Supernova remnant', 20.94, 31.72],
  ['M27', 'Dumbbell Nebula', 'Planetary nebula', 19.993, 22.72],
  ['M13', 'Hercules Cluster', 'Globular cluster', 16.695, 36.46],
  ['M92', 'Globular in Hercules', 'Globular cluster', 17.285, 43.14],
  ['M15', 'Pegasus Cluster', 'Globular cluster', 21.5, 12.17],
  ['M2', 'Aquarius Cluster', 'Globular cluster', 21.558, -0.82],
  ['IC 1396', 'Elephant’s Trunk', 'Emission nebula', 21.65, 57.5],
  ['NGC 7635', 'Bubble Nebula', 'Emission nebula', 23.347, 61.2],
  ['IC 5146', 'Cocoon Nebula', 'Emission + dark nebula', 21.893, 47.27],
  ['NGC 7023', 'Iris Nebula', 'Reflection nebula', 21.027, 68.17],
  ['NGC 7293', 'Helix Nebula', 'Planetary nebula', 22.494, -20.84],
  ['NGC 7331', 'Deer Lick Galaxy', 'Galaxy', 22.616, 34.42],
  ['NGC 891', 'Silver Sliver Galaxy', 'Galaxy', 2.376, 42.35],
  ['M74', 'Phantom Galaxy', 'Galaxy', 1.611, 15.78],
  ['M77', 'Cetus A', 'Galaxy', 2.711, -0.01],
  ['M81', 'Bode’s Galaxy', 'Galaxy', 9.926, 69.07],
  ['M82', 'Cigar Galaxy', 'Galaxy', 9.931, 69.68],
  ['M51', 'Whirlpool Galaxy', 'Galaxy', 13.498, 47.2],
  ['M101', 'Pinwheel Galaxy', 'Galaxy', 14.054, 54.35],
  ['M106', 'Spiral in Canes Venatici', 'Galaxy', 12.316, 47.3],
  ['M63', 'Sunflower Galaxy', 'Galaxy', 13.264, 42.03],
  ['M64', 'Black Eye Galaxy', 'Galaxy', 12.946, 21.68],
  ['M3', 'Globular in Canes Venatici', 'Globular cluster', 13.703, 28.38],
  ['M8', 'Lagoon Nebula', 'Emission nebula', 18.06, -24.38],
  ['M20', 'Trifid Nebula', 'Emission nebula', 18.04, -23.03],
  ['M16', 'Eagle Nebula', 'Emission nebula', 18.313, -13.79],
  ['M17', 'Omega Nebula', 'Emission nebula', 18.346, -16.17],
  ['M11', 'Wild Duck Cluster', 'Open cluster', 18.851, -6.27],
  ['NGC 253', 'Sculptor Galaxy', 'Galaxy', 0.793, -25.29],
  ['M4', 'Globular in Scorpius', 'Globular cluster', 16.393, -26.53],
  ['M5', 'Globular in Serpens', 'Globular cluster', 15.309, 2.08],
  ['M9', 'Globular in Ophiuchus', 'Globular cluster', 17.32, -18.52],
  ['M10', 'Globular in Ophiuchus', 'Globular cluster', 16.952, -4.1],
  ['M12', 'Globular in Ophiuchus', 'Globular cluster', 16.787, -1.95],
  ['M14', 'Globular in Ophiuchus', 'Globular cluster', 17.627, -3.25],
  ['M19', 'Globular in Ophiuchus', 'Globular cluster', 17.044, -26.27],
  ['M22', 'Sagittarius Cluster', 'Globular cluster', 18.607, -23.9],
  ['M24', 'Small Sagittarius Star Cloud', 'Star cloud', 18.282, -18.51],
  ['M30', 'Globular in Capricornus', 'Globular cluster', 21.673, -23.18],
  ['M32', 'Andromeda satellite', 'Galaxy', 0.712, 40.87],
  ['M37', 'Open cluster in Auriga', 'Open cluster', 5.872, 32.55],
  ['M43', 'De Mairan’s Nebula', 'Emission nebula', 5.592, -5.27],
  ['M46', 'Open cluster in Puppis', 'Open cluster', 7.696, -14.81],
  ['M49', 'Galaxy in Virgo', 'Galaxy', 12.496, 8],
  ['M53', 'Globular in Coma Berenices', 'Globular cluster', 13.215, 18.17],
  ['M55', 'Globular in Sagittarius', 'Globular cluster', 19.666, -30.96],
  ['M60', 'Galaxy in Virgo', 'Galaxy', 12.728, 11.55],
  ['M61', 'Galaxy in Virgo', 'Galaxy', 12.365, 4.47],
  ['M62', 'Globular in Ophiuchus', 'Globular cluster', 17.02, -30.11],
  ['M65', 'Galaxy in Leo', 'Galaxy', 11.316, 13.09],
  ['M66', 'Galaxy in Leo', 'Galaxy', 11.337, 12.99],
  ['M68', 'Globular in Hydra', 'Globular cluster', 12.658, -26.74],
  ['M70', 'Globular in Sagittarius', 'Globular cluster', 18.72, -32.29],
  ['M71', 'Globular in Sagitta', 'Globular cluster', 19.896, 18.78],
  ['M79', 'Globular in Lepus', 'Globular cluster', 5.403, -24.52],
  ['M83', 'Southern Pinwheel Galaxy', 'Galaxy', 13.617, -29.87],
  ['M84', 'Galaxy in Virgo', 'Galaxy', 12.418, 12.89],
  ['M85', 'Galaxy in Coma Berenices', 'Galaxy', 12.423, 18.19],
  ['M86', 'Galaxy in Virgo', 'Galaxy', 12.437, 12.95],
  ['M87', 'Virgo A', 'Galaxy', 12.514, 12.39],
  ['M88', 'Galaxy in Coma Berenices', 'Galaxy', 12.533, 14.42],
  ['M89', 'Galaxy in Virgo', 'Galaxy', 12.594, 12.56],
  ['M90', 'Galaxy in Virgo', 'Galaxy', 12.614, 13.16],
  ['M94', 'Galaxy in Canes Venatici', 'Galaxy', 12.848, 41.12],
  ['M95', 'Galaxy in Leo', 'Galaxy', 10.733, 11.7],
  ['M96', 'Galaxy in Leo', 'Galaxy', 10.779, 11.82],
  ['M98', 'Galaxy in Coma Berenices', 'Galaxy', 12.23, 14.9],
  ['M100', 'Galaxy in Coma Berenices', 'Galaxy', 12.382, 15.82],
  ['M102', 'Spindle Galaxy', 'Galaxy', 15.108, 55.76],
  ['M104', 'Sombrero Galaxy', 'Galaxy', 12.667, -11.62],
  ['M107', 'Globular in Ophiuchus', 'Globular cluster', 16.542, -13.05],
  ['M109', 'Galaxy in Ursa Major', 'Galaxy', 11.96, 53.37],
  ['M110', 'Andromeda satellite', 'Galaxy', 0.673, 41.69],
  ['NGC 6888', 'Crescent Nebula', 'Emission nebula', 20.202, 38.35],
  ['NGC 2264', 'Cone Nebula & Christmas Tree', 'Emission nebula + cluster', 6.683, 9.9],
  ['IC 2177', 'Seagull Nebula', 'Emission nebula', 7.077, -10.47],
  ['NGC 4565', 'Needle Galaxy', 'Galaxy', 12.606, 25.99],
  ['NGC 6946', 'Fireworks Galaxy', 'Galaxy', 20.581, 60.15],
  ['NGC 7380', 'Wizard Nebula', 'Emission nebula', 22.789, 58.13],
  ['NGC 1977', 'Running Man Nebula', 'Emission + reflection nebula', 5.588, -4.84],
  ['IC 410', 'Tadpoles Nebula', 'Emission nebula', 5.378, 33.37],
  ['IC 405', 'Flaming Star Nebula', 'Emission + reflection nebula', 5.275, 34.36],
  ['NGC 2359', 'Thor’s Helmet', 'Emission nebula', 7.309, -13.23],
  ['NGC 4631', 'Whale Galaxy', 'Galaxy', 12.702, 32.54],
  ['NGC 2403', 'Galaxy in Camelopardalis', 'Galaxy', 7.614, 65.6],
  ['NGC 3628', 'Hamburger Galaxy', 'Galaxy', 11.338, 13.59],
  ['NGC 5907', 'Splinter Galaxy', 'Galaxy', 15.265, 56.33],
  ['IC 63', 'Ghost of Cassiopeia', 'Emission + reflection nebula', 0.991, 60.91],
  ['NGC 2903', 'Galaxy in Leo', 'Galaxy', 9.536, 21.5],
  ['NGC 1333', 'Embryo Nebula', 'Reflection nebula', 3.482, 31.37],
  ['NGC 1909', 'Witch Head Nebula', 'Reflection nebula', 5.082, -7.27],
  ['NGC 6727', 'Reflection nebula in Corona Australis', 'Reflection nebula', 19.028, -36.88],
  ['IC 4592', 'Reflection nebula in Scorpius', 'Reflection nebula', 16.2, -19.45],
  ['IC 4604', 'Rho Oph Nebula', 'Nebula', 16.425, -23.44],
  ['IC 4701', 'Nebula in Sagittarius', 'Nebula', 18.277, -16.65],
  ['IC 5070', 'Pelican Nebula', 'Emission nebula', 20.85, 44.4],
  ['IC 443', 'Gem A', 'Supernova remnant', 6.277, 22.53],
  ['Caldwell 9', 'Cave Nebula', 'Emission nebula', 22.965, 62.52],
  ['IC 5068', 'Emission nebula in Cygnus', 'Emission nebula', 20.842, 42.48],
  ['NGC 2174', 'Monkey Head Nebula', 'Emission nebula', 6.157, 20.66],
  ['IC 4605', 'Nebula in Scorpius', 'Nebula', 16.503, -25.12],
  ['NGC 2024', 'Flame Nebula', 'Emission nebula', 5.695, -1.86],
  ['NGC 55', 'Galaxy in Sculptor', 'Galaxy', 0.248, -39.2],
  ['IC 1340', 'Supernova remnant in Cygnus', 'Supernova remnant', 20.936, 31.05],
  ['IC 447', 'Emission nebula in Monoceros', 'Emission nebula', 6.517, 9.9],
  ['NGC 4236', 'Galaxy in Draco', 'Galaxy', 12.278, 69.46],
  ['IC 1274', 'Emission nebula in Sagittarius', 'Emission nebula', 18.164, -23.65],
  ['IC 1287', 'Reflection nebula in Scutum', 'Reflection nebula', 18.524, -10.8],
  ['IC 4601', 'Nebula in Scorpius', 'Nebula', 16.338, -20.09],
  ['IC 4603', 'Nebula in Ophiuchus', 'Nebula', 16.423, -24.47],
  ['NGC 7822', 'Cederblad 214 complex', 'Emission nebula', 0.06, 67.16],
  ['IC 342', 'Hidden Galaxy', 'Galaxy', 3.78, 68.1],
  ['NGC 247', 'Galaxy in Cetus', 'Galaxy', 0.786, -20.76],
  ['NGC 300', 'Galaxy in Sculptor', 'Galaxy', 0.915, -37.68],
  ['IC 1613', 'Galaxy in Cetus', 'Galaxy', 1.08, 2.12],
  ['IC 1284', 'Nebula in Sagittarius', 'Nebula', 18.294, -19.67],
  ['ESO 351-030', 'Sculptor Dwarf Elliptical', 'Galaxy', 1.003, -33.71],
  ['IC 359A', 'Reflection nebula in Taurus', 'Reflection nebula', 4.311, 28.29],
  ['IC 448', 'Emission nebula in Monoceros', 'Emission nebula', 6.546, 7.39],
  ['IC 1310', 'Cluster + nebula in Cygnus', 'Cluster + nebula', 20.167, 34.97],
  ['IC 4685', 'Nebula in Sagittarius', 'Nebula', 18.155, -23.99],
  ['NGC 6559', 'Nebula in Sagittarius', 'Nebula', 18.166, -24.11],
  ['NGC 1316', 'Fornax A', 'Galaxy', 3.378, -37.21],
  ['IC 417', 'Emission nebula in Auriga', 'Emission nebula', 5.468, 34.42],
  ['NGC 185', 'Galaxy in Cassiopeia', 'Galaxy', 0.649, 48.34],
  ['ESO 356-004', 'Fornax Dwarf Spheroidal', 'Galaxy', 2.666, -34.45],
  ['IC 1795', 'Fish Head Nebula', 'Emission nebula', 2.442, 62.04],
  ['IC 4591', 'Emission nebula in Scorpius', 'Emission nebula', 16.205, -27.93],
  ['NGC 2183', 'Emission nebula in Monoceros', 'Emission nebula', 6.18, -6.21],
  ['IC 430', 'Nebula in Orion', 'Nebula', 5.643, -7.08],
  ['NGC 1097', 'Galaxy in Fornax', 'Galaxy', 2.772, -30.27],
  ['NGC 4559', 'Galaxy in Coma Berenices', 'Galaxy', 12.599, 27.96],
  ['NGC 7793', 'Galaxy in Sculptor', 'Galaxy', 23.964, -32.59],
  ['NGC 2997', 'Galaxy in Antlia', 'Galaxy', 9.761, -31.19],
  ['NGC 1579', 'Cluster + nebula in Perseus', 'Cluster + nebula', 4.504, 35.27],
  ['IC 348', 'Omi Per Cloud', 'Cluster + nebula', 3.743, 32.16],
  ['IC 426', 'Nebula in Orion', 'Nebula', 5.609, -0.3],
  ['IC 432', 'Reflection nebula in Orion', 'Reflection nebula', 5.682, -1.51],
  ['NGC 2023', 'Reflection nebula in Orion', 'Reflection nebula', 5.694, -2.26],
  ['NGC 2064', 'Reflection nebula in Orion', 'Reflection nebula', 5.772, 0.01],
  ['NGC 6847', 'Cluster + nebula in Cygnus', 'Cluster + nebula', 19.944, 30.21],
  ['NGC 5897', 'Globular in Libra', 'Globular cluster', 15.29, -21.01],
  ['NGC 3621', 'Galaxy in Hydra', 'Galaxy', 11.305, -32.81],
  ['NGC 4725', 'Galaxy in Coma Berenices', 'Galaxy', 12.841, 25.5],
  ['NGC 5102', 'Galaxy in Centaurus', 'Galaxy', 13.366, -36.63],
  ['NGC 4526', 'Galaxy in Virgo', 'Galaxy', 12.568, 7.7],
  ['NGC 288', 'Globular in Sculptor', 'Globular cluster', 0.88, -26.59],
  ['NGC 2683', 'Galaxy in Lynx', 'Galaxy', 8.878, 33.42],
  ['NGC 147', 'Galaxy in Cassiopeia', 'Galaxy', 0.553, 48.51],
  ['NGC 1980', 'Lower Sword', 'Cluster + nebula', 5.591, -5.91],
  ['NGC 1491', 'Fossil Footprint Nebula', 'Emission nebula', 4.054, 51.32],
  ['NGC 1981', 'Upper Sword', 'Cluster + nebula', 5.586, -4.43],
  ['NGC 1399', 'Galaxy in Fornax', 'Galaxy', 3.641, -35.45],
  ['NGC 6334', 'Cat’s Paw Nebula', 'Emission nebula', 17.347, -36.1],
  ['NGC 3521', 'Galaxy in Leo', 'Galaxy', 11.097, -0.04],
  ['NGC 4535', 'Galaxy in Virgo', 'Galaxy', 12.572, 8.2],
  ['IC 431', 'Reflection nebula in Orion', 'Reflection nebula', 5.671, -1.46],
  ['IC 444', 'Reflection nebula in Gemini', 'Reflection nebula', 6.309, 23.31],
  ['NGC 2067', 'Reflection nebula in Orion', 'Reflection nebula', 5.776, 0.13],
  ['NGC 7538', 'Northern Lagoon', 'Cluster + nebula', 23.227, 61.51],
  ['NGC 4216', 'Galaxy in Virgo', 'Galaxy', 12.265, 13.15],
  ['IC 5134', 'Nebula in Cepheus', 'Nebula', 21.716, 66.1],
  ['NGC 1023', 'Galaxy in Perseus', 'Galaxy', 2.673, 39.06],
  ['NGC 3184', 'Galaxy in Ursa Major', 'Galaxy', 10.305, 41.42],
  ['NGC 4697', 'Galaxy in Virgo', 'Galaxy', 12.81, -5.8],
  ['IC 5076', 'Reflection nebula in Cygnus', 'Reflection nebula', 20.926, 47.4],
  ['NGC 2071', 'Cluster + nebula in Orion', 'Cluster + nebula', 5.785, 0.29],
  ['NGC 6979', 'Supernova remnant in Cygnus', 'Supernova remnant', 20.841, 32.03],
  ['NGC 1398', 'Galaxy in Fornax', 'Galaxy', 3.648, -26.34],
  ['NGC 2818A', 'Cluster + nebula in Pyxis', 'Cluster + nebula', 9.268, -36.63],
  ['NGC 6997', 'Cluster + nebula in Cygnus', 'Cluster + nebula', 20.944, 44.63],
  ['NGC 3923', 'Galaxy in Hydra', 'Galaxy', 11.85, -28.81],
  ['NGC 4214', 'Galaxy in Canes Venatici', 'Galaxy', 12.261, 36.33],
  ['NGC 4490', 'Cocoon Galaxy', 'Galaxy', 12.51, 41.64],
  ['NGC 3344', 'Galaxy in Leo Minor', 'Galaxy', 10.725, 24.92],
  ['NGC 3585', 'Galaxy in Hydra', 'Galaxy', 11.221, -26.75],
  ['NGC 6284', 'Globular in Ophiuchus', 'Globular cluster', 17.075, -24.76],
  ['NGC 4753', 'Galaxy in Virgo', 'Galaxy', 12.873, -1.2],
  ['NGC 1360', 'Planetary nebula in Fornax', 'Planetary nebula', 3.554, -25.87],
  ['NGC 4636', 'Galaxy in Virgo', 'Galaxy', 12.714, 2.69],
  ['IC 420', 'Nebula in Orion', 'Nebula', 5.536, -4.5],
  ['IC 423', 'Nebula in Orion', 'Nebula', 5.556, -0.61],
  ['NGC 6823', 'Cluster + nebula in Vulpecula', 'Cluster + nebula', 19.719, 23.3],
];
/* Approximate catalog details: [visual magnitude or null, apparent size, distance]. */
const DSO_INFO = {
  'M31': [3.4, "190′ × 60′", '2.5 million ly'],
  'M33': [5.7, "70′ × 40′", '2.7 million ly'],
  'M45': [1.6, "110′", '444 ly'],
  'M42': [4.0, "65′ × 60′", '1,344 ly'],
  'M1': [8.4, "6′ × 4′", '6,500 ly'],
  'NGC 2237': [null, "80′", '5,200 ly'],
  'IC 434': [null, "60′ × 10′", '1,375 ly'],
  'NGC 1499': [null, "145′ × 40′", '1,000 ly'],
  'IC 1805': [6.5, "150′", '7,500 ly'],
  'IC 1848': [6.5, "150′ × 75′", '7,500 ly'],
  'NGC 281': [7.4, "35′ × 30′", '9,500 ly'],
  'NGC 869/884': [3.7, "60′ (pair)", '7,500 ly'],
  'NGC 7000': [4.0, "120′ × 100′", '2,600 ly'],
  'NGC 6960': [7.0, "70′ × 6′", '2,400 ly'],
  'NGC 6992': [7.0, "60′ × 8′", '2,400 ly'],
  'M27': [7.5, "8′ × 6′", '1,360 ly'],
  'M13': [5.8, "20′", '22,200 ly'],
  'M92': [6.3, "14′", '26,700 ly'],
  'M15': [6.2, "18′", '35,000 ly'],
  'M2': [6.5, "16′", '37,500 ly'],
  'IC 1396': [3.5, "170′ × 140′", '2,400 ly'],
  'NGC 7635': [10.0, "15′ × 8′", '7,100 ly'],
  'IC 5146': [7.2, "12′", '4,000 ly'],
  'NGC 7023': [6.8, "18′", '1,300 ly'],
  'NGC 7293': [7.6, "25′", '650 ly'],
  'NGC 7331': [9.5, "10′ × 4′", '40 million ly'],
  'NGC 891': [10.0, "13′ × 3′", '30 million ly'],
  'M74': [9.4, "10′ × 9′", '32 million ly'],
  'M77': [8.9, "7′ × 6′", '47 million ly'],
  'M81': [6.9, "27′ × 14′", '11.8 million ly'],
  'M82': [8.4, "11′ × 5′", '12 million ly'],
  'M51': [8.4, "11′ × 7′", '23 million ly'],
  'M101': [7.9, "29′ × 27′", '21 million ly'],
  'M106': [8.4, "19′ × 8′", '24 million ly'],
  'M63': [8.6, "13′ × 7′", '29 million ly'],
  'M64': [8.5, "10′ × 5′", '17 million ly'],
  'M3': [6.2, "18′", '33,900 ly'],
  'M8': [6.0, "90′ × 40′", '4,100 ly'],
  'M20': [6.3, "28′", '5,200 ly'],
  'M16': [6.0, "35′ × 28′", '5,700 ly'],
  'M17': [6.0, "46′ × 37′", '5,500 ly'],
  'M11': [5.8, "14′", '6,200 ly'],
  'NGC 253': [7.1, "27′ × 7′", '11.4 million ly'],
  'M4': [5.4, "28′", '7,200 ly'],
  'M5': [6.0, "15′", '24,500 ly'],
  'M9': [8.4, "6.9′", '25,800 ly'],
  'M10': [5.0, "9.3′", '14,300 ly'],
  'M12': [6.1, "11′", '16,440 ly'],
  'M14': [5.7, "9.9′", '30,300 ly'],
  'M19': [5.6, "7.5′", '28,700 ly'],
  'M22': [5.1, "13′", '10,600 ly'],
  'M24': [4.6, "120′ × 60′", '10,000 ly'],
  'M30': [7.1, "9′", '27,140 ly'],
  'M32': [8.1, "7.7′ × 4.9′", '2.49 million ly'],
  'M37': [5.6, "11′", '4,511 ly'],
  'M43': [9.0, "20′ × 15′", '1,300 ly'],
  'M46': [6.1, "21′", '4,920 ly'],
  'M49': [8.3, "10′ × 8.4′", '55.9 million ly'],
  'M53': [7.8, "9′", '58,000 ly'],
  'M55': [6.5, "12′", '17,600 ly'],
  'M60': [8.8, "6.8′ × 5.5′", '60 million ly'],
  'M61': [10.2, "6.9′", '60 million ly'],
  'M62': [6.5, "7.8′", '21,500 ly'],
  'M65': [9.3, "7.6′ × 2′", '35 million ly'],
  'M66': [8.9, "10′ × 4.6′", '35 million ly'],
  'M68': [8.0, "6.6′", '33,300 ly'],
  'M70': [7.9, "6.6′", '28,000 ly'],
  'M71': [8.3, "6.9′", '11,700 ly'],
  'M79': [8.2, "7.2′", '41,100 ly'],
  'M83': [7.2, "14′", '15 million ly'],
  'M84': [9.8, "7.4′ × 6.4′", '60 million ly'],
  'M85': [9.1, "7′ × 5.3′", '60 million ly'],
  'M86': [8.9, "12′ × 8.4′", '60 million ly'],
  'M87': [9.0, "7.1′ × 6.7′", '60 million ly'],
  'M88': [10.3, "8.7′ × 4.4′", '60 million ly'],
  'M89': [10.1, "8.1′", '60 million ly'],
  'M90': [9.5, "9.1′ × 3.8′", '60 million ly'],
  'M94': [8.2, "7.7′ × 6.7′", '14.5 million ly'],
  'M95': [9.8, "7.2′ × 4.5′", '38 million ly'],
  'M96': [9.2, "8.3′ × 5.5′", '38 million ly'],
  'M98': [10.8, "11′ × 2.7′", '60 million ly'],
  'M100': [9.5, "6.1′ × 5.6′", '60 million ly'],
  'M102': [9.9, "6.3′ × 2.7′", '40 million ly'],
  'M104': [8.6, "8.4′ × 4.9′", '50 million ly'],
  'M107': [7.9, "7.8′", '19,600 ly'],
  'M109': [9.9, "8.1′ × 5.6′", '55 million ly'],
  'M110': [8.2, "16′ × 9.6′", '2.9 million ly'],
  'NGC 6888': [7.4, "20′ × 10′", '5,000 ly'],
  'NGC 2264': [3.9, "11′", '2,700 ly'],
  'IC 2177': [null, "20′", '–'],
  'NGC 4565': [10.9, "17′ × 2.9′", 'about 40 million ly'],
  'NGC 6946': [9.1, "11′", '25.2 million ly'],
  'NGC 7380': [null, "25′ × 20′", '8,500 ly'],
  'NGC 1977': [null, "10′", '–'],
  'IC 410': [null, "40′ × 30′", '12,000 ly'],
  'IC 405': [null, "50′ × 30′", '1,500 ly'],
  'NGC 2359': [null, "10′ × 5′", '12,000 ly'],
  'NGC 4631': [9.2, "14′ × 2.2′", '30 million ly'],
  'NGC 2403': [8.4, "20′ × 10′", '9.7 million ly'],
  'NGC 3628': [9.4, "11′ × 3.4′", '35 million ly'],
  'NGC 5907': [10.4, "11′ × 1.8′", '46.5 million ly'],
  'IC 63': [null, "10′ × 3′", '–'],
  'NGC 2903': [8.9, "12′ × 5.3′", '30 million ly'],
  'NGC 1333': [null, "20′", 'about 1,000 ly'],
  'NGC 1909': [null, "180′ × 60′", '–'],
  'NGC 6727': [null, "80′", '–'],
  'IC 4592': [3.9, "60′ × 40′", '–'],
  'IC 4604': [5.1, "60′ × 25′", '–'],
  'IC 4701': [null, "60′ × 40′", '–'],
  'IC 5070': [8.0, "60′ × 50′", '–'],
  'IC 443': [12.0, "50′ × 40′", '–'],
  'Caldwell 9': [null, "50′ × 30′", '–'],
  'IC 5068': [null, "40′ × 30′", '–'],
  'NGC 2174': [null, "40′ × 30′", '–'],
  'IC 4605': [4.7, "30′ × 15′", '–'],
  'NGC 2024': [null, "30′", '–'],
  'NGC 55': [8.5, "30′ × 3′", '–'],
  'IC 1340': [null, "25′ × 20′", '–'],
  'IC 447': [7.7, "25′ × 20′", '–'],
  'NGC 4236': [9.8, "24′ × 6.8′", '–'],
  'IC 1274': [null, "20′ × 5′", '–'],
  'IC 1287': [6.1, "20′ × 10′", '–'],
  'IC 4601': [null, "20′ × 10′", '–'],
  'IC 4603': [null, "20′ × 5′", '–'],
  'NGC 7822': [null, "20′ × 4′", '–'],
  'IC 342': [9.7, "20′ × 19′", '–'],
  'NGC 247': [9.2, "20′ × 5.5′", '–'],
  'NGC 300': [8.7, "19′ × 13′", '–'],
  'IC 1613': [9.5, "18′ × 17′", '–'],
  'IC 1284': [7.7, "17′ × 15′", '–'],
  'ESO 351-030': [8.6, "15′", '–'],
  'IC 359A': [null, "15′ × 10′", '–'],
  'IC 448': [null, "15′ × 10′", '–'],
  'IC 1310': [null, "15′ × 3′", '–'],
  'IC 4685': [null, "15′ × 10′", '–'],
  'NGC 6559': [null, "15′ × 10′", '–'],
  'NGC 1316': [8.5, "13′ × 7.7′", '–'],
  'IC 417': [null, "13′ × 10′", '–'],
  'NGC 185': [9.2, "13′ × 11′", '–'],
  'ESO 356-004': [7.4, "13′ × 10′", '–'],
  'IC 1795': [null, "12′", '–'],
  'IC 4591': [null, "12′ × 10′", '–'],
  'NGC 2183': [15.2, "12′", '–'],
  'IC 430': [14.4, "11′", '–'],
  'NGC 1097': [9.8, "11′ × 6.4′", '–'],
  'NGC 4559': [9.9, "11′ × 4.8′", '–'],
  'NGC 7793': [9.3, "10′ × 6′", '–'],
  'NGC 2997': [9.4, "10′ × 6.2′", '–'],
  'NGC 1579': [null, "10′", '–'],
  'IC 348': [null, "10′", '–'],
  'IC 426': [null, "10′ × 3′", '–'],
  'IC 432': [null, "10′", '–'],
  'NGC 2023': [null, "10′ × 8′", '–'],
  'NGC 2064': [null, "10′", '–'],
  'NGC 6847': [null, "10′", '–'],
  'NGC 5897': [8.5, "9.9′", '–'],
  'NGC 3621': [9.6, "9.8′ × 4′", '–'],
  'NGC 4725': [9.4, "9.7′ × 7.1′", '–'],
  'NGC 5102': [9.9, "9.7′ × 3.7′", '–'],
  'NGC 4526': [9.6, "9.6′ × 3.3′", '–'],
  'NGC 288': [8.1, "9.6′", '–'],
  'NGC 2683': [9.7, "9.5′ × 2.7′", '–'],
  'NGC 147': [9.7, "9.4′ × 5.4′", '–'],
  'NGC 1980': [2.5, "9.3′", '–'],
  'NGC 1491': [null, "9′ × 6′", '–'],
  'NGC 1981': [4.2, "9′", '–'],
  'NGC 1399': [9.4, "8.5′ × 7.7′", '–'],
  'NGC 6334': [null, "8.4′", '–'],
  'NGC 3521': [9.1, "8.3′ × 4.5′", '–'],
  'NGC 4535': [9.9, "8.2′ × 7.5′", '–'],
  'IC 431': [null, "8′ × 5′", '–'],
  'IC 444': [7.0, "8′ × 4′", '–'],
  'NGC 2067': [null, "8′ × 3′", '–'],
  'NGC 7538': [null, "8′ × 7′", '–'],
  'NGC 4216': [9.9, "7.8′ × 1.8′", '–'],
  'IC 5134': [null, "7.6′", '–'],
  'NGC 1023': [9.5, "7.4′ × 3.1′", '–'],
  'NGC 3184': [9.8, "7.4′ × 7.2′", '–'],
  'NGC 4697': [9.4, "7.1′ × 4.2′", '–'],
  'IC 5076': [null, "7′", '–'],
  'NGC 2071': [8.0, "7′ × 5′", '–'],
  'NGC 6979': [null, "7′ × 3′", '–'],
  'NGC 1398': [9.6, "7′ × 4.9′", '–'],
  'NGC 2818A': [12.5, "6.9′", '–'],
  'NGC 6997': [10.0, "6.9′", '–'],
  'NGC 3923': [9.6, "6.9′ × 4.5′", '–'],
  'NGC 4214': [9.8, "6.8′ × 5.3′", '–'],
  'NGC 4490': [9.7, "6.7′ × 1.6′", '–'],
  'NGC 3344': [10.0, "6.7′ × 6.4′", '–'],
  'NGC 3585': [9.7, "6.6′ × 3.3′", '–'],
  'NGC 6284': [7.4, "6.6′", '–'],
  'NGC 4753': [9.7, "6.5′ × 3.1′", '–'],
  'NGC 1360': [9.4, "6.4′", '–'],
  'NGC 4636': [10.0, "6.3′ × 4.7′", '–'],
  'IC 420': [null, "6′", '–'],
  'IC 423': [null, "6′ × 3.5′", '–'],
  'NGC 6823': [7.1, "6′", '–'],
};
const TYPE_TIP = (type) => /Emission|Supernova|^Nebula$|Cluster \+ nebula/.test(type) ? 'Turn on the LP (light-pollution) filter. Nebulae reward long stacks: aim for 1–2 h or more.'
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
/* How rewarding a target is in the Seestar frame: larger and brighter score higher. Named emission nebulae without a
   magnitude count as mag 7; unclassified catalog nebulae (often faint dust) as mag 9.5. */
function appeal(id, type) {
  const [mag, size] = DSO_INFO[id] || [];
  const sz = parseSize(size);
  return (sz ? Math.log2(Math.min(sz[0], 120)) : 0) - 0.35 * (mag != null ? mag : type === 'Nebula' ? 9.5 : 7);
}
/* Deep-sky targets that reach MIN_ALT in darkness for at least half an hour, longest window first. */
function targetsTonight(obs, S) {
  if (S.darkLim == null) return [];
  const out = [];
  for (const [id, name, type, ra, dec] of DSO) {
    const tr = track(S, (d) => altAzRaDec(ra, dec, d, obs));
    if (tr.hrs < 0.5) continue;
    const pk = tr.peak;
    out.push({ kind: 'dso', id, name, type, ra, dec, ...tr, d: pk.d, alt: pk.alt, az: pk.az, moonSep: moonSepAt(pk) });
  }
  // Rank by how long it's up in darkness (up to 6 h counts — a full Seestar session) plus how rewarding it is.
  const score = (o) => 0.6 * Math.min(o.hrs, 6) + appeal(o.id, o.type);
  // Keep the whole ranked pool: the page picks the Top Ten + 20 more from it at the chosen Time Machine time.
  return out.sort((a, b) => score(b) - score(a) || b.alt - a.alt);
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
  if (isNum(h.pop) && Math.round(h.pop) >= RAIN_SHOW) s = Math.min(s, 34); // any rain risk: never a usable hour
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
/* The Moon as a lit sphere: limb darkening, a soft terminator, faint maria (dark plains) that show only on the lit
   part, a little earthshine on the unlit part, and a glow. Same phase geometry as before. Each call gets its own
   gradient ids because several Moons can be on the page at once. */
let moonUid = 0;
const MOON_MARIA = [[-.26, -.38, .25, .19, -15], [.09, -.37, .14, .13, 0], [.23, -.08, .2, .15, 15], [.56, -.27, .1, .08, 0],
  [-.56, -.02, .15, .36, 10], [-.3, .4, .18, .12, 0], [.5, .13, .09, .12, 0], [-.06, .06, .12, .1, 0]];
function moonGlyphVec(cx, cy, r, angle, lat) {
  const id = 'mg' + (++moonUid), f = (v) => v.toFixed(2);
  const rad = angle * Math.PI / 180, k = (1 - Math.cos(rad)) / 2; // illuminated fraction
  let litRight = angle < 180;
  if (lat < 0) litRight = !litRight;
  const rx = r * Math.abs(Math.cos(rad));
  const gibbous = k > 0.5;
  const term = litRight ? (gibbous ? 1 : 0) : (gibbous ? 0 : 1);
  // The lit shape reaches past the edge on the sunlit side, so blurring it softens only the terminator; the disc clip keeps the limb sharp.
  const E = 1.4 * r, sx = litRight ? 1 : -1;
  const lit = k < 0.01 ? '' : k > 0.99
    ? `M${f(cx - E)} ${f(cy - E)} H${f(cx + E)} V${f(cy + E)} H${f(cx - E)}Z`
    : `M${f(cx)} ${f(cy - E)} H${f(cx + sx * E)} V${f(cy + E)} H${f(cx)} V${f(cy + r)} A${f(rx)} ${r} 0 0 ${term} ${f(cx)} ${f(cy - r)}Z`;
  const south = lat < 0 ? ` transform="rotate(180 ${cx} ${cy})"` : ''; // the Moon is upside down for observers in the south
  const maria = MOON_MARIA.map(([dx, dy, a, b, t]) => `<ellipse cx="${f(cx + dx * r)}" cy="${f(cy + dy * r)}" rx="${f(a * r)}" ry="${f(b * r)}" transform="rotate(${t} ${f(cx + dx * r)} ${f(cy + dy * r)})"/>`).join('');
  const box = `userSpaceOnUse" x="${f(cx - 2 * r)}" y="${f(cy - 2 * r)}" width="${f(4 * r)}" height="${f(4 * r)}"`;
  const dir = litRight ? [1, 0] : [0, 1];
  return `<defs>
    <radialGradient id="${id}h"><stop offset=".78" style="stop-color:var(--moon-lit);stop-opacity:${f(0.05 + 0.2 * k)}"/><stop offset="1" style="stop-color:var(--moon-lit);stop-opacity:0"/></radialGradient>
    <radialGradient id="${id}d" cx=".42" cy=".38" r=".7"><stop offset="0" style="stop-color:var(--moon-lit);stop-opacity:.16"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>
    <radialGradient id="${id}s"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset=".82" stop-color="#000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>
    <linearGradient id="${id}g" x1="${dir[0]}" y1="0" x2="${dir[1]}" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${f(0.3 * (1 - k))}"/></linearGradient>
    <clipPath id="${id}c"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
    <filter id="${id}b" filterUnits="${box}><feGaussianBlur stdDeviation="${f(Math.max(0.35, r * 0.05))}"/></filter>
    <filter id="${id}m" filterUnits="${box}><feGaussianBlur stdDeviation="${f(Math.max(0.25, r * 0.035))}"/></filter>
    <mask id="${id}k" maskUnits="${box}>${lit ? `<path d="${lit}" fill="#fff" filter="url(#${id}b)"/>` : ''}</mask>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${f(r * 1.1)}" fill="url(#${id}h)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" style="fill:var(--moon-dark)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}d)"/>
  <g clip-path="url(#${id}c)">
    <g${south} fill="#000" opacity=".16" filter="url(#${id}m)">${maria}</g>
    ${lit ? `<path d="${lit}" style="fill:var(--moon-lit)" filter="url(#${id}b)"/>` : ''}
    <g mask="url(#${id}k)"><g${south}><g style="fill:var(--moon-dark)" opacity=".42" filter="url(#${id}m)">${maria}</g><circle cx="${f(cx - 0.12 * r)}" cy="${f(cy + 0.7 * r)}" r="${f(Math.max(0.5, r * 0.05))}" fill="#fff" opacity=".6"/></g></g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}g)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}s)"/>
  </g>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" style="stroke:var(--moon-lit)" stroke-opacity=".28" stroke-width="1"/>`;
}

/* The real Moon: a NASA lunar map (moon.jpg, near side) lit per pixel as a sphere for the current phase — soft terminator
   that follows the surface, limb darkening, a little earthshine on the dark part. The shaded disc is baked to a small
   PNG once per phase (and per red mode) and dropped into the SVG, so it stays crisp at any size. If moon.jpg can't load,
   moonGlyphVec() above draws the old vector Moon. */
const MOON_TEX = { S: 384, px: null, cache: {} };
(function () {
  const im = new Image();
  im.onload = () => {
    try {
      const c = document.createElement('canvas'), S = MOON_TEX.S;
      c.width = c.height = S;
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0, S, S);
      MOON_TEX.px = x.getImageData(0, 0, S, S).data;
      MOON_TEX.cache = {};
      redrawMoons();
    } catch (e) { MOON_TEX.px = null; }
  };
  im.src = 'moon.jpg?v=' + VERSION.slice(1);
})();
function moonBake(angle, south, red) {
  if (!MOON_TEX.px) return null;
  const key = Math.round(angle * 2) + (south ? 's' : 'n') + (red ? 'r' : '');
  if (MOON_TEX.cache[key]) return MOON_TEX.cache[key];
  const O = 192, h = O / 2, S = MOON_TEX.S, px = MOON_TEX.px;
  const rad = angle * Math.PI / 180, ci = -Math.cos(rad), sxs = ((angle < 180) !== south ? 1 : -1) * Math.abs(Math.sin(rad));
  const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const cv = document.createElement('canvas');
  cv.width = cv.height = O;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(O, O), d = img.data;
  for (let y = 0; y < O; y++) {
    for (let x = 0; x < O; x++) {
      const nx = (x + 0.5 - h) / h, ny = (y + 0.5 - h) / h, rr = nx * nx + ny * ny;
      const cov = Math.min(1, Math.max(0, (1 - Math.sqrt(rr)) * h + 0.5));
      if (cov <= 0) continue;
      const nz = Math.sqrt(Math.max(0, 1 - rr));
      // Surface texture (turned upside down for observers in the south), kept just inside the disc at the edge.
      const q = rr > 0.98 ? Math.sqrt(0.98 / rr) : 1, sg = south ? -1 : 1;
      const tx = (sg * nx * q * 0.5 + 0.5) * (S - 1), ty = (sg * ny * q * 0.5 + 0.5) * (S - 1);
      const x0 = Math.min(S - 2, Math.max(0, Math.floor(tx))), y0 = Math.min(S - 2, Math.max(0, Math.floor(ty))), fx = tx - x0, fy = ty - y0;
      const g = (px[(y0 * S + x0) * 4] * (1 - fx) * (1 - fy) + px[(y0 * S + x0 + 1) * 4] * fx * (1 - fy)
        + px[((y0 + 1) * S + x0) * 4] * (1 - fx) * fy + px[((y0 + 1) * S + x0 + 1) * 4] * fx * fy) / 255;
      // Light: cosine of the angle to the Sun, softened Lommel–Seeliger style so craters and maria read all the way in.
      const m0 = nx * sxs + nz * ci;
      let lit = 0;
      if (m0 > 0) lit = Math.pow(0.5 * Math.min(1, 2 * m0 / (m0 + nz + 1e-3)) + 0.5 * m0, 0.85) * smooth(0, 0.07, m0);
      const lm = 0.66 + 0.34 * Math.sqrt(nz);                 // limb darkening: the edge turns away from us
      const sh = lit * lm, e = 0.1 * lm, v = g * sh, ev = g * e;
      let R, G, B;
      if (red) { const l = v + ev * 0.7; R = l * 0.88; G = B = l * 0.11; }
      else { R = v * 0.98 + ev * 0.55; G = v * 0.94 + ev * 0.7; B = v * 0.86 + ev; }
      const i = (y * O + x) * 4;
      d[i] = Math.min(255, R * 255); d[i + 1] = Math.min(255, G * 255); d[i + 2] = Math.min(255, B * 255);
      d[i + 3] = 255 * cov * (0.5 + 0.5 * Math.min(1, sh * 5));  // the dark side is part see-through so the themed backing shows
    }
  }
  ctx.putImageData(img, 0, 0);
  return (MOON_TEX.cache[key] = cv.toDataURL('image/png'));
}
function moonGlyph(cx, cy, r, angle, lat) {
  if (window.HW && HW.moon) return HW.moon(cx, cy, r, angle, lat);   // Halloween skin (October): a jack-o'-lantern Moon
  const url = moonBake(angle, lat < 0, document.documentElement.classList.contains('red'));
  if (!url) return moonGlyphVec(cx, cy, r, angle, lat);
  const id = 'mg' + (++moonUid), f = (v) => v.toFixed(2), k = (1 - Math.cos(angle * Math.PI / 180)) / 2;
  return `<defs><radialGradient id="${id}h"><stop offset=".8" style="stop-color:var(--moon-lit);stop-opacity:${f(0.05 + 0.2 * k)}"/><stop offset="1" style="stop-color:var(--moon-lit);stop-opacity:0"/></radialGradient></defs>
  <circle cx="${cx}" cy="${cy}" r="${f(r * 1.12)}" fill="url(#${id}h)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" style="fill:var(--moon-dark)"/>
  <image class="moon-tex" href="${url}" x="${f(cx - r)}" y="${f(cy - r)}" width="${f(2 * r)}" height="${f(2 * r)}"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" style="stroke:var(--moon-lit)" stroke-opacity=".22" stroke-width="1"/>`;
}
/* Redraw the Moon card and Moon path (texture just loaded, or red mode switched). */
function redrawMoons() {
  const D = state.data;
  if (!D || !D.nights[state.night]) return;
  const N = D.nights[state.night];
  renderMoon(N.moon, D.lat);
  renderPath(N, D.lat, effNow());
}

const PUFF_ICON = '<path d="M6.2 19.5h11.9a4.1 4.1 0 0 0 .9-8.1 4.3 4.3 0 0 0-5.6-3.3A5 5 0 0 0 4.6 10.6a4.5 4.5 0 0 0 1.6 8.9z" fill="currentColor"/><circle cx="9.3" cy="10.4" r="3.9" fill="currentColor"/><circle cx="14.6" cy="9.6" r="3.3" fill="currentColor"/>';
const RATE_TXT = { great: 'GO', good: 'GO', fair: 'FAIR', poor: 'NO', day: 'DAY' };
const qClass = (v) => (!isNum(v) ? 'dim' : v <= 2 ? 'q-1' : v <= 4 ? 'q-2' : v <= 6 ? 'q-3' : 'q-4');
const qShort = (v) => (!isNum(v) ? '–' : v <= 2 ? 'Exc' : v <= 4 ? 'Good' : v <= 6 ? 'Avg' : 'Poor');
const SKY_SHORT = { day: 'day', civil: 'twi', nautical: 'twi', astro: 'twi', dark: 'dark' };

/* Rain thresholds (ensemble % chance in the hour). Rain kills the Seestar, clouds alone don't:
   ANY rain chance (RAIN_SHOW, 1% or more as displayed) rates the hour NO, and it can never be part of
   the go window (nor can the hour before it, to pack up dry). RAIN_FLAG / RAIN_STOP only grade the display. */
const RAIN_SHOW = 1, RAIN_FLAG = 15, RAIN_STOP = 30;
const popOf = (h) => (isNum(h.pop) ? h.pop : 0);
const rainy = (h) => Math.round(popOf(h)) >= RAIN_SHOW;
/* Best run of Good-or-better hours that stay clear of rain. */
function bestWindow(hours) {
  let best = null, cur = null;
  hours.forEach((h, i) => {
    const next = hours[i + 1];
    const dry = !rainy(h) && !(next && rainy(next));
    if (h.rating.score != null && h.rating.score >= 55 && dry) {
      cur = cur ? { ...cur, end: h } : { start: h, end: h };
      if (!best || cur.end.t - cur.start.t > best.end.t - best.start.t) best = cur;
    } else cur = null;
  });
  if (best) best.hrs = (best.end.t - best.start.t) / 3600 + 1;
  return best;
}

/* ---------- Bortle (light pollution) ----------
   Zenith sky brightness from David Lorenz's Light Pollution Atlas 2025 (VIIRS-based, 1/120° grid).
   Same binary tiles and decoding as the atlas's own map; SQM converted to an approximate Bortle class. */
const LP_YEAR = 2025;
const lpMod = (n, m) => ((n % m) + m) % m;
const lpKey = (lat, lon) => `lp${LP_YEAR}:${(+lat).toFixed(3)},${(+lon).toFixed(3)}`;
function sqmToBortle(q) {
  return q >= 21.99 ? 1 : q >= 21.89 ? 2 : q >= 21.69 ? 3 : q >= 20.49 ? 4 : q >= 19.5 ? 5 : q >= 18.94 ? 6 : q >= 18.38 ? 7 : q >= 17.8 ? 8 : 9;
}
async function fetchBortle(lat, lon) {
  const key = lpKey(lat, lon);
  try { const c = JSON.parse(localStorage.getItem(key)); if (c && isNum(c.sqm)) return c; } catch (e) {}
  const lx = lpMod(+lon + 180, 360), ly = +lat + 65;
  const tx = Math.floor(lx / 5) + 1, ty = Math.floor(ly / 5) + 1;
  if (ty < 1 || ty > 28) return { out: true };
  const ix = Math.round(120 * (lx - 5 * (tx - 1) + 1 / 240)), iy = Math.round(120 * (ly - 5 * (ty - 1) + 1 / 240));
  const res = await fetch(`https://djlorenz.github.io/astronomy/binary_tiles/${LP_YEAR}/binary_tile_${tx}_${ty}.dat.gz`);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const raw = new Response(res.body.pipeThrough(new DecompressionStream('gzip')));
  const d = new Int8Array(await raw.arrayBuffer());
  // First value is 2 bytes; the rest are 1-byte deltas up the first column, then along row iy.
  let v = 128 * d[0] + d[1];
  for (let i = 1; i < iy; i++) v += d[600 * i + 1];
  for (let i = 1; i < ix; i++) v += d[600 * (iy - 1) + 1 + i];
  const ratio = (5 / 195) * (Math.exp(0.0195 * v) - 1); // artificial / natural brightness
  const sqm = 22 - 5 * Math.log(1 + ratio) / Math.log(100);
  const out = { sqm: Math.round(sqm * 100) / 100, bortle: sqmToBortle(sqm) };
  try { localStorage.setItem(key, JSON.stringify(out)); } catch (e) {}
  return out;
}
function bortleChip() {
  const b = state.lp;
  const tip = 'Light pollution: Light Pollution Atlas 2025 (D. Lorenz). Bortle is approximate, from zenith SQM.';
  if (!b) return ['Bortle', '…', '', '', 'vsBortle', tip];
  if (b.err || b.out) return ['Bortle', '–', '', '', 'vsBortle', tip];
  return ['Bortle', b.bortle, `${b.sqm.toFixed(1)} sqm`, '', 'vsBortle', tip];
}
function updateBortle() {
  const el = $('#vsBortle');
  if (!el) return;
  const [l, v, u, c] = bortleChip();
  el.className = 'vs ' + c;
  el.innerHTML = `<span class="lbl">${esc(l)}</span><b>${esc(v)}<small>${esc(u)}</small></b>`;
}
function loadBortle(loc) {
  const k = lpKey(loc.lat, loc.lon);
  if (state.lpFor === k && state.lp && !state.lp.err) return;
  state.lp = null; state.lpFor = k;
  fetchBortle(loc.lat, loc.lon)
    .then((r) => r, () => ({ err: true }))
    .then((r) => { if (state.loc && lpKey(state.loc.lat, state.loc.lon) === k) { state.lp = r; updateBortle(); } });
}

function renderVerdict(win, moon, hours) {
  const night = hours.filter((h) => h.rating.score != null);
  const best = bestWindow(hours);
  let cls, txt, line, note = '', chips = [];
  if (!night.length) {
    cls = 'day'; txt = 'NO DATA';
    line = 'No forecast available for this night yet';
  } else {
    const inWin = (h) => best && h.t >= best.start.t && h.t <= best.end.t;
    const wet = night.filter(rainy);
    const poor = night.filter((h) => !inWin(h) && h.rating.k === 'poor');
    if (best && best.hrs >= 2 && !wet.length && !poor.length) { cls = 'go'; txt = 'GO'; }
    // Rain or poor hours elsewhere in the night: only a partial go, and only with at least 3 dry, usable hours.
    else if (best && best.hrs >= 3) { cls = 'partial'; txt = 'PARTIAL GO'; }
    else if (best || night.some((h) => h.rating.k === 'fair')) { cls = 'fair'; txt = 'MARGINAL'; }
    else { cls = 'nogo'; txt = 'NO GO'; }
    const winEnd = best ? new Date((best.end.t + 3600) * 1000) : null;
    line = best
      ? `${cls === 'partial' ? 'Go' : 'Best window'} <b>${esc(fmtTime(best.start.d))} – ${esc(fmtTime(winEnd))}</b> <span class="muted">(${best.hrs} h)</span>`
      : cls === 'fair' ? 'Fair hours only — no solid window' : 'No usable window this night';
    // Say when the rain risk is, relative to the window.
    if (wet.length) {
      const after = best ? wet.filter((h) => h.t > best.end.t) : [];
      const before = best ? wet.filter((h) => h.t < best.start.t) : [];
      const peak = Math.round(Math.max(...wet.map(popOf)));
      const st = (d) => fmtTime(d).replace(/:00(?=\s?[AP]\.?M)/i, '');   // "12 AM", keeps the note short
      if (after.length) note = `Rain risk from ${st(after[0].d)} · up to ${peak}%`;
      else if (before.length) note = `Rain risk until ${st(new Date((before[before.length - 1].t + 3600) * 1000))} · up to ${peak}%`;
      else note = `Rain risk ${st(wet[0].d)} – ${st(new Date((wet[wet.length - 1].t + 3600) * 1000))} · up to ${peak}%`;
    } else if (cls === 'partial' && poor.length) {
      const after = poor.filter((h) => h.t > best.end.t);
      note = after.length ? `Conditions worsen from ${fmtTime(after[0].d)}` : `Poor until ${fmtTime(best.start.d)}`;
    }
    // Conditions over the dark hours ahead
    const cloud = avg(night.map((h) => h.cloud));
    const pop = Math.max(...night.map(popOf));
    const gust = Math.max(...night.map((h) => (isNum(h.gust) ? h.gust : 0)));
    const dew = Math.min(...night.map((h) => (isNum(h.dewGap) ? h.dewGap : 99)));
    const see = night.map((h) => h.seeing).filter(isNum);
    // [label, value, unit, class]
    chips.push(['Rain risk', Math.round(pop), '%', Math.round(pop) < RAIN_SHOW ? 'ok' : pop >= RAIN_STOP ? 'bad wet' : 'wet']);
    if (isNum(cloud)) chips.push(['Cloud', Math.round(cloud), '%', cloud < 30 ? 'ok' : cloud > 60 ? 'bad' : '']);
    if (gust > 0) chips.push(['Max gusts', wind(gust), windU(), gust > 30 ? 'bad' : gust < 20 ? 'ok' : '']);
    const moonUp = night.some((h) => h.moonAlt > 0);
    chips.push([moonUp ? 'Moon up' : 'Moon', moonUp ? Math.round(moon.illum * 100) : 'Down', moonUp ? '%' : '', moonUp && moon.illum > 0.5 ? 'bad' : !moonUp || moon.illum < 0.25 ? 'ok' : '']);
    chips.push([dew < 2 ? 'Dew · Heat' : 'Dew gap', dew < 99 ? tempDiff(dew) : '–', '', dew < 2 ? 'bad' : dew >= 5 ? 'ok' : '']);
    chips.push(bortleChip());
    if (see.length) { const s = Math.min(...see); chips.push(['Seeing', QUAL(s).replace('Average', 'Avg'), `(${s})`, s <= 4 ? 'ok' : s >= 7 ? 'bad' : '']); }
  }
  $('#verdict').innerHTML = `<div class="v-badge ${cls}">${txt}</div>
    <div class="v-text"><div class="v-win">${line}</div>${note ? `<div class="v-note">${esc(note)}</div>` : ''}</div>
    <div class="vstats">${chips.map(([l, v, u, c, id, tip]) => `<div class="vs ${c}"${id ? ` id="${id}"` : ''}${tip ? ` title="${esc(tip)}"` : ''}><span class="lbl">${esc(l)}</span><b>${esc(v)}<small>${esc(u)}</small></b></div>`).join('')}</div>`;
}

/* Tile text always fits: if a label or value is wider than its tile, shrink it (down to a floor) instead of clipping.
   Runs by itself whenever the tiles change or the card is resized, so new or longer text needs no manual fix. */
function fitTiles() {
  const fits = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width <= el.clientWidth - 1; };
  document.querySelectorAll('#verdict .vs').forEach((vs) => {
    vs.querySelectorAll('.lbl, b').forEach((el) => {
      el.style.fontSize = '';
      el.style.textOverflow = 'clip';   // measure the real text width, not the ellipsised one (even a fraction of a pixel over triggers "…")
      let px = parseFloat(getComputedStyle(el).fontSize);
      const floor = el.tagName === 'B' ? 13 : 8;
      while (!fits(el) && px > floor) { px -= 0.5; el.style.fontSize = px + 'px'; }
      el.style.textOverflow = '';
    });
  });
}
let fitQueued = false;
function queueFit() { if (fitQueued) return; fitQueued = true; requestAnimationFrame(() => { fitQueued = false; fitTiles(); }); }
function watchTiles() {
  const v = $('#verdict');
  if (!v) return;
  if (window.ResizeObserver) new ResizeObserver(queueFit).observe(v);
  new MutationObserver(queueFit).observe(v, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', queueFit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueFit);
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
  const ico = (svg, name, col) => `<span class="big-l ico" title="${name}" style="color:var(${col})"><svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg><span class="ico-t">${name}</span><span class="ico-pct">%</span></span>`;
  const DROP = '<path d="M12 2.5C9 7 5.5 10.6 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10.6 15 7 12 2.5z" fill="currentColor"/>';
  const CLOUD = PUFF_ICON;
  // Any chance of rain stands out: solid blue, stronger the higher the odds; dry hours stay quiet.
  const wetCls = (p) => (!isNum(p) ? 'big' : Math.round(p) < RAIN_SHOW ? 'big dry' : p >= RAIN_STOP ? 'big wet hi' : p >= RAIN_FLAG ? 'big wet mid' : 'big wet');
  html += row(ico(DROP, 'Precip', '--rain'), (h, i) => cell(h, i, num(h.pop), wetCls(h.pop), isNum(h.pop) && Math.round(h.pop) >= RAIN_SHOW ? `background:color-mix(in srgb, var(--rain) ${Math.round(28 + Math.min(h.pop, 100) * 0.6)}%, transparent)` : ''));
  html += row(ico(CLOUD, 'Cloud', '--cloud'), (h, i) => cell(h, i, num(h.cloud), 'big', tint(h.cloud, '--cloud', 0.42), `Low ${r0(h.low)} · Mid ${r0(h.midc)} · High ${r0(h.high)}`));

  // Chart: puffy clouds + precip line, drawn at real pixel size once the grid has laid out.
  html += `<div class="fc-l">Sky</div><div class="fc-chart" id="skyChart" role="img" aria-label="Cloud cover and precipitation chance by hour"></div>`;

  html += row('Temp', (h, i) => cell(h, i, temp(h.temp)));
  html += row('Dew<span class="lg-only">&nbsp;gap</span>', (h, i) => cell(h, i, tempDiff(h.dewGap), isNum(h.dewGap) && h.dewGap < 2 ? 'warn' : ''));
  html += row(`Gusts<small>${windU()}</small>`, (h, i) => cell(h, i, wind(h.gust), isNum(h.gust) && h.gust > 30 ? 'warn' : '', '', `Wind ${wind(h.wind)} · gusts ${wind(h.gust)} ${windU()}`));
  html += row('Seeing', (h, i) => cell(h, i, qShort(h.seeing), qClass(h.seeing)));
  html += row('Transp', (h, i) => cell(h, i, qShort(h.transparency), qClass(h.transparency)));
  const f = $('#forecast'), n = hours.length;
  f.style.setProperty('--n', n);
  f.classList.toggle('dense', n > 13);
  f.innerHTML = html;
  skyChart(hours);
}

/* Realistic clouds: each hour's cloud is generated on a canvas from a soft billow shape broken up by
   fractal noise, then lit from above (light is traced through the cloud, so thick parts and the flat
   base go grey). The cloud's top sits at the cloud-cover % and it grows with the cover; the noise is
   seeded by the hour so no two clouds are alike. */
function cloudShape(seed) {
  let k = 0;
  const rnd = () => ((Math.sin(seed * 12.9898 + ++k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const B = [];
  const cr = 0.2 + rnd() * 0.07, cx = 0.44 + rnd() * 0.14;
  B.push([cx, -0.07 - cr, cr]);
  if (rnd() < 0.7) { const r = cr * (0.6 + rnd() * 0.2), s = rnd() < 0.5 ? -1 : 1; B.push([cx + s * cr * (0.75 + rnd() * 0.25), -0.06 - r * 0.95, r]); }
  const lr = 0.12 + rnd() * 0.06, rr = 0.11 + rnd() * 0.06;
  B.push([0.17 + lr * 0.55 + rnd() * 0.04, -lr * (0.95 + rnd() * 0.25), lr], [0.83 - rr * 0.55 - rnd() * 0.04, -rr * (0.95 + rnd() * 0.25), rr]);
  for (let i = 0; i < 2; i++) { const r = 0.06 + rnd() * 0.05; B.push([0.2 + rnd() * 0.6, -0.08 - rnd() * 0.25, r]); }
  const er = 0.07 + rnd() * 0.03, er2 = 0.065 + rnd() * 0.03;
  B.push([0.1 + er, -er * 0.9, er], [0.9 - er2, -er2 * 0.9, er2], [0.32 + rnd() * 0.08, -0.08, 0.1 + rnd() * 0.03], [0.6 + rnd() * 0.08, -0.08, 0.1 + rnd() * 0.03], [0.48 + rnd() * 0.06, -0.1, 0.13]);
  const ox = rnd() * 100, oy = rnd() * 100;
  // Puffy underside: a row of rounded lobes hanging below the base, uneven in size and drop.
  const nb = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < nb; i++) {
    const r = 0.085 + rnd() * 0.045, x = 0.2 + (0.6 * (i + 0.5)) / nb + (rnd() - 0.5) * 0.06;
    B.push([x, -r * 0.2 + rnd() * 0.03, r]);
  }
  let x1 = 1, x2 = 0, y1 = 0, y2 = 0;
  for (const [x, y, r] of B) { x1 = Math.min(x1, x - r); x2 = Math.max(x2, x + r); y1 = Math.min(y1, y - r); y2 = Math.max(y2, y + r); }
  return { B, x1, x2, y1, y2, ox, oy };
}
const NOISE_T = Float32Array.from({ length: 65536 }, (_, i) => { const n = Math.sin((i & 255) * 127.1 + (i >> 8) * 311.7) * 43758.5453; return n - Math.floor(n); });
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const i0 = xi & 255, i1 = (xi + 1) & 255, j0 = (yi & 255) << 8, j1 = ((yi + 1) & 255) << 8;
  const a = NOISE_T[j0 | i0], b = NOISE_T[j0 | i1], c = NOISE_T[j1 | i0], d = NOISE_T[j1 | i1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function drawCloud(img, W, Hc, px, py, sc, shape, cols, alpha) {
  const { B, x1, x2, y1, y2, ox, oy } = shape;
  const dens = (ux, uy, oct = 4) => {
    let m = 0;
    for (const [cx, cy, r] of B) { const q = ((ux - cx) ** 2 + (uy - cy) ** 2) / (r * r); if (q < 1.6) m = Math.max(m, 1 - q * 0.62); }
    if (m <= 0) return 0;
    let n = 0, amp = 0.5, fr = 7;
    for (let o = 0; o < oct; o++) { n += amp * noise2(ux * fr + ox, uy * fr + oy); amp *= 0.5; fr *= 2.1; }
    let d = m + (n - (oct === 4 ? 0.47 : 0.375)) * 0.75;
    return d;
  };
  const X0 = Math.max(0, Math.floor(px + (x1 - 0.06) * sc)), X1 = Math.min(W - 1, Math.ceil(px + (x2 + 0.06) * sc));
  const Y0 = Math.max(0, Math.floor(py + (y1 - 0.06) * sc)), Y1 = Math.min(Hc - 1, Math.ceil(py + (y2 + 0.06) * sc));
  const [hi, mid, lo] = cols, d = img.data, step = 0.035;
  for (let Y = Y0; Y <= Y1; Y++) for (let X = X0; X <= X1; X++) {
    const ux = (X - px) / sc, uy = (Y - py) / sc, v = dens(ux, uy);
    if (v <= 0.18) continue;
    let acc = 0;                                                   // trace toward the light (up, a bit left)
    for (let s = 1; s <= 5; s++) acc += Math.max(0, dens(ux - step * s * 0.45, uy - step * s, 2));
    // Shadowed base: a soft, ragged gradient (wobbled by noise) instead of a level edge.
    const bz = Math.min(1, Math.max(0, (uy + 0.26 + (noise2(ux * 5 + oy, uy * 5 + ox) - 0.5) * 0.3) / 0.4)), shade = 0.36 * bz * bz * (3 - 2 * bz);
    const lit = Math.min(1, Math.exp(-acc * 0.55) * 1.05 + Math.max(0, -uy / -y1) * 0.18 - shade);
    const t = Math.max(0, lit), c = t > 0.5 ? [0, 1, 2].map((i) => mid[i] + (hi[i] - mid[i]) * (t - 0.5) * 2) : [0, 1, 2].map((i) => lo[i] + (mid[i] - lo[i]) * t * 2);
    const a = Math.min(1, (v - 0.18) / 0.22) * alpha, j = (Y * W + X) * 4, da = d[j + 3] / 255 * (1 - a), oa = a + da;
    for (let ch = 0; ch < 3; ch++) d[j + ch] = (c[ch] * a + d[j + ch] * da) / oa;
    d[j + 3] = oa * 255;
  }
}
function skyChart(hours) {
  const box = $('#skyChart');
  if (!box) return;
  const W = Math.max(120, Math.round(box.clientWidth)), H = Math.max(30, Math.round(box.clientHeight)), dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const n = hours.length, cw = W / n, top = 4, Y = (v) => top + (1 - v / 100) * (H - top), Yr = (v) => top + (1 - v / 100) * (H - top - 6);
  let pts = [], dots = '';
  hours.forEach((h, i) => {
    if (!isNum(h.pop)) return;
    const x = i * cw + cw / 2, y = Yr(h.pop);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    if (Math.round(h.pop) >= RAIN_SHOW) dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${h.pop >= RAIN_FLAG ? 4.5 : 3.2}" fill="var(--rain)" stroke="var(--card2)" stroke-width="1.5"/>`;
  });
  if (pts.length) { const f0 = pts[0].split(',')[1], fl = pts[pts.length - 1].split(',')[1]; pts.unshift(`0,${f0}`); pts.push(`${W},${fl}`); }
  const grid = hours.slice(1).map((_, i) => `<line x1="${((i + 1) * cw).toFixed(1)}" x2="${((i + 1) * cw).toFixed(1)}" y1="0" y2="${H}" stroke="var(--line2)" stroke-width="1"/>`).join('');
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${grid}
    <line x1="0" x2="${W}" y1="${Y(50)}" y2="${Y(50)}" stroke="var(--line2)" stroke-dasharray="2 3"/></svg>
    <canvas width="${Math.round(W * dpr)}" height="${Math.round(H * dpr)}" style="position:absolute;inset:0;width:${W}px;height:${H}px"></canvas>
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--rain)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="butt"/>${dots}</svg>`;
  // Cloud colours from the theme: lit tops, mid tone, shadowed base.
  const cv = box.querySelector('canvas'), ctx = cv.getContext('2d');
  ctx.fillStyle = getComputedStyle(box).getPropertyValue('--cloud').trim() || '#b9c8e6';
  const hex = ctx.fillStyle, base = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16) || 200);
  const red = document.documentElement.classList.contains('red'), light = document.documentElement.classList.contains('light') && !red;
  const mix = (c, t, f) => c.map((v, i) => v + (t[i] - v) * f);
  const cols = red ? [base, mix(base, [0, 0, 0], 0.35), mix(base, [0, 0, 0], 0.7)]
    : [mix(base, [255, 255, 255], light ? 0.95 : 0.8), mix(base, [255, 255, 255], light ? 0.35 : 0.15), mix(base, [40, 48, 64], light ? 0.55 : 0.6)];
  const img = ctx.createImageData(cv.width, cv.height);
  let rainSvg = '';
  hours.forEach((h, i) => {
    const day = h.sky && h.sky.k === 'day', cx = i * cw + cw / 2;
    let base = top, half = cw * 0.3;                               // where rain starts if there's no cloud drawn
    if (isNum(h.cloud) && h.cloud >= 0.5) {
      const seed = (isNum(h.t) ? Math.round(h.t / 3600) : i) % 9973 + 1, sh = cloudShape(seed);
      const top_ = Y(h.cloud), w = cw * 0.86 * (0.62 + 0.38 * Math.min(100, h.cloud) / 100), hgt = Math.min(w * 0.72, H - top_);
      if (hgt >= 2) {
        const sc = Math.min(w / (sh.x2 - sh.x1), hgt / (sh.y2 - sh.y1)), px = cx - ((sh.x1 + sh.x2) / 2) * sc, py = top_ - sh.y1 * sc;
        drawCloud(img, cv.width, cv.height, px * dpr, py * dpr, sc * dpr, sh, cols, day ? 0.4 : 1);
        base = py + sh.y2 * sc * 0.8; half = (sh.x2 - sh.x1) * sc * 0.32;
      }
    }
    // Rain falling from the cloud's underside: more and bolder streaks the higher the odds.
    if (isNum(h.pop) && Math.round(h.pop) >= RAIN_SHOW && H - base > 4) {
      const p = Math.min(100, h.pop), k = 2 + Math.round(p / 25), op = ((0.45 + p / 200) * (day ? 0.6 : 1)).toFixed(2);
      for (let s = 0; s < k; s++) {
        const x = cx - half + (2 * half * (s + 0.5)) / k, off = ((s * 7 + i * 3) % 9).toFixed(0);
        rainSvg += `<line x1="${x.toFixed(1)}" y1="${(base + 1).toFixed(1)}" x2="${(x - (H - base) * 0.18).toFixed(1)}" y2="${H}" stroke="var(--rain)" stroke-width="${p >= RAIN_FLAG ? 1.6 : 1.2}" stroke-linecap="round" stroke-dasharray="3 5" stroke-dashoffset="${off}" opacity="${op}"/>`;
      }
    }
  });
  ctx.putImageData(img, 0, 0);
  if (rainSvg) box.querySelectorAll('svg')[1].insertAdjacentHTML('afterbegin', rainSvg);
}

/* Copy button beside the pop-up title. The copied text is plain ASCII with no "·" separator,
   so it pastes straight into the Seestar app's search. */
let copyText = '';
function seestarName(o) {
  let s = o.kind === 'planet' ? o.name : String(o.id);
  if (o.kind === 'dso') s = s.split('/')[0]; // e.g. "NGC 869/884" → "NGC 869"
  return s.normalize('NFKC').replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim();
}
async function copyToClipboard(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* fall back */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
  ($('#sheet').open ? $('#sheet') : document.body).appendChild(ta);
  ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}
let copyTimer;
function wireCopy() {
  const b = $('#sheetCopy');
  b.addEventListener('click', async () => {
    if (!copyText) return;
    const ok = await copyToClipboard(copyText);
    b.textContent = ok ? 'Copied' : 'Copy failed';
    b.classList.toggle('done', ok);
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('done'); }, 1600);
  });
}

/* The pill beside the sheet title: "User Guide" in Options, "‹ Options" in the guide. */
let guideAct = null;
function setSheetLink(label, fn) {
  const b = $('#sheetGuide');
  b.textContent = label; b.setAttribute('aria-label', label.replace('‹ ', 'Back to '));
  b.hidden = false; guideAct = fn;
}

function showSheet(title, body, sub = '', wide = false, locked = false, copy = '') {
  copyText = copy;
  const cb = $('#sheetCopy');
  cb.hidden = !copy; cb.textContent = 'Copy'; cb.classList.remove('done');
  cb.setAttribute('aria-label', copy ? `Copy ${copy}` : 'Copy');
  $('#sheetGuide').hidden = true; // only Options and the User Guide show this button (see setSheetLink)
  guideAct = null;
  $('#sheet').classList.remove('is-guide');
  $('#sheetTitle').textContent = title;
  $('#sheetSub').textContent = sub;
  $('#sheetSub').hidden = !sub;
  $('#sheetBody').innerHTML = body;
  const d = $('#sheet');
  d.classList.toggle('wide', wide);
  d.classList.toggle('locked', locked); // locked: fixed size, contents can't be scrolled or dragged
  document.documentElement.classList.add('sheet-open'); // freeze the page behind
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
    isNum(h.seeing) ? `Seeing ${QUAL(h.seeing)} (${h.seeing}) · ${SEEING[h.seeing]} · transparency ${QUAL(h.transparency)}` : '',
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

/* Moon through the night: altitude against time (same time axis as the forecast), twilight shading,
   when it rises/sets, where it is in the sky, and its highest point. */
function renderPath(N, lat, now) {
  now = state.night === 0 && state.tm ? state.tm : new Date();   // the live clock, so the Moon moves as the night goes on
  const box = $('#moonPath'), moon = N.moon, c = N.S.s.map((p) => ({ d: p.d, sun: p.sun, alt: p.moon, az: p.moonAz }));
  if (c.length < 2) { box.innerHTML = ''; return; }
  const W = Math.max(260, Math.round(box.clientWidth || 480));
  const H = Math.max(140, Math.round(box.clientHeight || 260));
  const L = 30, R = 10, T = 20, B = 20, pw = W - L - R, ph = H - T - B;
  const f = (v) => v.toFixed(1);
  const t0 = +c[0].d, t1 = +c[c.length - 1].d;
  const up = c.filter((p) => p.alt > 0);
  const top = up.length ? up.reduce((a, b) => (b.alt > a.alt ? b : a)) : null;
  const yMax = top ? Math.min(90, Math.max(30, Math.ceil((top.alt + 12) / 15) * 15)) : 30;
  const X = (d) => L + ((+d - t0) / (t1 - t0)) * pw;
  const Y = (a) => T + (1 - Math.max(0, Math.min(a, yMax)) / yMax) * ph;
  let s = '';
  // Twilight bands (darkest = full dark)
  const half = pw / (c.length - 1) / 2;
  let k0 = 0;
  for (let k = 1; k <= c.length; k++) {
    if (k < c.length && skyState(c[k].sun).k === skyState(c[k0].sun).k) continue;
    const x0 = k0 === 0 ? L : X(c[k0].d) - half, x1 = k === c.length ? L + pw : X(c[k].d) - half;
    s += `<rect x="${f(x0)}" y="${T}" width="${f(x1 - x0 + 0.5)}" height="${f(ph)}" fill="var(--band-${skyState(c[k0].sun).k})"/>`;
    k0 = k;
  }
  // Altitude grid
  const step = yMax <= 45 ? 15 : 30;
  for (let a = step; a <= yMax; a += step) s += `<line x1="${L}" x2="${L + pw}" y1="${f(Y(a))}" y2="${f(Y(a))}" stroke="var(--grid)"/><text x="${L - 5}" y="${f(Y(a) + 4)}" font-size="10.5" text-anchor="end" fill="var(--muted)">${a}°</text>`;
  // Ground
  s += `<rect x="0" y="${f(T + ph)}" width="${W}" height="${B}" fill="var(--ground)"/><line x1="${L}" x2="${L + pw}" y1="${f(T + ph)}" y2="${f(T + ph)}" stroke="var(--muted)" stroke-opacity=".7"/>`;
  s += `<text x="${L - 5}" y="${f(T + ph + 4)}" font-size="10.5" text-anchor="end" fill="var(--muted)">0°</text>`;
  // Hour ticks and labels; the Moon's direction along the top while it is up
  const nH = (t1 - t0) / 3600e3, every = pw / nH < 30 ? 3 : pw / nH < 48 ? 2 : 1;
  for (let t = Math.ceil(t0 / 3600e3) * 3600e3; t <= t1; t += 3600e3) {
    const d = new Date(t), x = X(d), hr = +new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: state.tz }).format(d);
    if (hr % every || x < L + 10 || x > L + pw - 10) continue;
    s += `<line x1="${f(x)}" x2="${f(x)}" y1="${f(T + ph)}" y2="${f(T + ph + 4)}" stroke="var(--muted)"/><text x="${f(x)}" y="${f(H - 5)}" font-size="10.5" text-anchor="middle" fill="var(--muted)">${esc(fmtHourShort(d))}</text>`;
    const p = c[Math.min(c.length - 1, Math.round((t - t0) / STEP))];
    if (p.alt > 0) s += `<text x="${f(x)}" y="${T - 6}" font-size="10.5" font-weight="700" text-anchor="middle" fill="var(--text)" opacity=".8">${compass(p.az)}</text>`;
  }
  let marks = '', labels = '';
  if (up.length) {
    // Curve with a soft fill down to the horizon, split wherever the Moon is down.
    let line = '', area = '', run = [];
    const flush = () => {
      if (run.length > 1) {
        const pts = run.map((p) => `${f(X(p.d))} ${f(Y(p.alt))}`);
        line += `M${pts.join(' L')}`;
        area += `M${f(X(run[0].d))} ${f(T + ph)} L${pts.join(' L')} L${f(X(run[run.length - 1].d))} ${f(T + ph)}Z`;
      }
      run = [];
    };
    // Include the horizon crossings so the curve meets the ground exactly.
    const xs = crossings(c, 0);
    const pts = c.map((p) => ({ d: p.d, alt: p.alt })).concat(xs.map((x) => ({ d: x.d, alt: 0, kind: x.kind }))).sort((a, b) => a.d - b.d);
    for (const p of pts) {
      if (p.kind === 'set') { run.push(p); flush(); }
      else if (p.kind === 'rise') { flush(); run.push(p); }
      else if (p.alt > 0) run.push(p);
      else flush();
    }
    flush();
    s += `<path d="${area}" fill="var(--moon-lit)" fill-opacity=".1"/><path d="${line}" fill="none" stroke="var(--path)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
    // Rise / set on the horizon
    const pill = (x, txt, side) => {
      const w = txt.length * 6.2 + 12, hgt = 18;
      let x0 = side === 'right' ? x + 6 : x - 6 - w;
      if (x0 < L + 2) x0 = x + 6; if (x0 + w > L + pw - 2) x0 = x - 6 - w;
      const y0 = T + ph - hgt - 6;
      return `<rect x="${f(x0)}" y="${f(y0)}" width="${f(w)}" height="${hgt}" rx="9" fill="var(--card)" stroke="var(--path)" stroke-opacity=".7"/><text x="${f(x0 + w / 2)}" y="${f(y0 + 12.5)}" font-size="11" font-weight="700" text-anchor="middle" fill="var(--text)">${esc(txt)}</text>`;
    };
    // Label times match the Moon card (rise/set of the Moon's upper limb).
    const evs = moon.events.filter((e) => +e.d >= t0 && +e.d <= t1);
    for (const x of evs) {
      marks += `<circle cx="${f(X(x.d))}" cy="${f(T + ph)}" r="3.5" fill="var(--path)"/>`;
      labels += pill(X(x.d), `${x.kind === 'rise' ? 'Rises' : 'Sets'} ${fmtTime(x.d)}`, x.kind === 'set' ? 'right' : 'left');
    }
    // Moon glyph. Once the night is under way (real time, or the Time Machine) it sits on the curve at that moment;
    // before the night begins it marks the highest point, which is only useful then.
    const r = Math.max(8, Math.min(13, ph / 10));
    let at = null, txt = '';
    if (+now > t0 && +now < t1) {
      const D = state.data, pos = D && D.obs ? altAz('Moon', now, D.obs) : null;
      if (pos && pos.alt > 0) { at = { d: now, alt: pos.alt }; txt = `${Math.round(pos.alt)}° ${compass(pos.az)}`; }
    } else { at = top; txt = `Highest ${Math.round(top.alt)}° · ${fmtTime(top.d)}`; }
    if (at) {
      const gx = Math.min(Math.max(X(at.d), L + r + 1), L + pw - r - 1), gy = Y(at.alt);
      marks += moonGlyph(gx, gy, r, moon.angle, lat);
      const tw = txt.length * 7;
      const lx = Math.min(Math.max(gx, L + tw / 2 + 2), L + pw - tw / 2 - 2);
      const ly = gy - r - 7 > T + 12 ? gy - r - 7 : gy + r + 16;
      labels += `<text x="${f(lx)}" y="${f(ly)}" font-size="12.5" font-weight="800" text-anchor="middle" fill="var(--text)" stroke="var(--card)" stroke-width="3" paint-order="stroke">${esc(txt)}</text>`;
    }
  } else {
    labels = `<text x="${f(L + pw / 2)}" y="${f(T + ph / 2)}" text-anchor="middle" font-size="13" fill="var(--muted)">The Moon stays below the horizon all night.</text>`;
  }
  // Now
  if (now && +now > t0 && +now < t1) {
    const x = X(now);
    s += `<line x1="${f(x)}" x2="${f(x)}" y1="${T}" y2="${f(T + ph)}" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="3 3"/><text x="${f(x + 4)}" y="${f(T + 11)}" font-size="10.5" font-weight="700" fill="var(--accent)">${state.tm && state.night === 0 ? esc(fmtTime(now)) : 'Now'}</text>`;
  }
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Moon altitude through the night">${s}${marks}${labels}</svg>`;
  // Header: what the Moon does during the dark hours
  const dark = N.S.darkLim == null ? [] : c.filter((p) => p.sun <= N.S.darkLim);
  const dUp = dark.filter((p) => p.alt > 0);
  let note;
  if (!dark.length) note = up.length ? 'Up tonight' : 'Down all night';
  else if (!dUp.length) note = 'Down during full dark';
  else if (dUp.length === dark.length) note = 'Up all through full dark';
  else if (dark[0].alt > 0) note = `Up in full dark until ${fmtTime(dark.find((p) => p.alt <= 0).d)}`;
  else note = `Rises in full dark at ${fmtTime(dUp[0].d)}`;
  $('#pathNote').textContent = note;
}

function renderPlanets(list) {
  $('#planets').innerHTML = list.length ? list.map((p, i) => `<button type="button" class="row tgt" data-p="${i}">
    <div class="nm"><span class="t1"><b>${p.name}</b><span class="tag">mag ${p.mag.toFixed(1)}</span></span>
    <span class="sub2">${p.start ? `${MIN_ALT}°+ from ${esc(fmtTime(p.start))}` : `Stays below ${MIN_ALT}°${state.home ? ' in home sky' : ''}`}</span></div>
    <div class="r">${esc(fmtTime(p.d))}<span class="sub2">${Math.round(p.alt)}° ${compass(p.az)}</span></div></button>`).join('')
    : '<p class="empty">None well placed after dusk.</p>';
}

/* Comets: every comet in the list that is above the horizon after dusk, brightest first (even ones too faint for the target lists). */
function renderComets(list) {
  $('#comets').innerHTML = list.length ? list.map((c, i) => `<button type="button" class="row tgt${c.blocked ? ' cm-low' : ''}" data-c="${i}" title="${c.blocked ? `Above ${MIN_ALT}° only outside your Home sky` : `Above ${MIN_ALT}° from ${esc(fmtTime(c.start))}`}">
    <div class="nm"><span class="t1"><b>${esc(c.id)}</b>${esc(c.name)}</span></div>
    <div class="r"><span class="cm-m">mag ${c.mag.toFixed(1)}</span>${esc(fmtTime(c.d))}</div></button>`).join('')
    : '<p class="empty">None above the horizon after dusk.</p>';
}

/* Small survey image for the Top targets card, cropped to the object's size. */
function thumbUrl(o) {
  const sz = o.kind === 'dso' ? parseSize((DSO_INFO[o.id] || [])[1]) : null;
  const fov = Math.min(4, Math.max(0.4, ((sz ? sz[0] : 40) / 60) * 1.6));
  return skyCutout(o.ra, o.dec, fov, 240, 180);
}
/* Thumbnails are saved with the app (thumbs/<id>.jpg, made by tools/get-thumbs.sh); if one is missing, fall back to the online survey. */
const thumbLocal = (o) => (o.kind === 'dso' ? `thumbs/${String(o.id).replace(/[^A-Za-z0-9]+/g, '_')}.jpg` : null);
function thumbFb(img) { const r = img.dataset.r; if (r && img.getAttribute('src') !== r) img.src = r; else img.remove(); }
/* ---------- Time Machine: look at the sky later tonight ---------- */
const MIN_LEFT = 60 * 60e3; // a target counts as "up" for filming only if it stays usable at least this long
const segAt = (o, t) => (o.segs || []).find((g) => g.s <= t && t < g.e);       // usable window containing t
const nextSeg = (o, t) => (o.segs || []).find((g) => g.e > t);                  // that window, or the next one
/* Usable hours still to come from time t until the target is gone (not its whole night). */
const hrsLeft = (o, t) => {
  if (!o.segs || !o.segs.length) return Math.max(0, Math.min(o.hrs, (+o.end - Math.max(+o.start, +t)) / 3600e3));
  return o.segs.reduce((a, g) => a + Math.max(0, +g.e - Math.max(+g.s, +t)), 0) / 3600e3;
};
/* The time everything is judged at: the Time Machine time (tonight only), otherwise now. */
const effNow = () => (state.data ? (state.night === 0 && state.tm ? state.tm : state.data.now) : new Date());
const tmLabel = () => (state.night === 0 && state.tm ? fmtTime(state.tm) : 'Now');
/* Slider: position 0 = Now, then one stop per 15 minutes on the quarter hour (e.g. 10:15, 10:30)
   up to 30 minutes before astronomical dawn. Coarse steps keep it easy to land where you want. */
const TM_STEP = 15 * 60e3;
let tmRaf = 0, tmDrawn = null;
function tmRange() {
  const D = state.data; if (!D) return null;
  const w = D.nights[0].win, dawn = w.darkEnd || w.rise;
  const start = Math.max(+D.now, +w.set), end = +dawn - 30 * 60e3;
  const first = (Math.floor(start / TM_STEP) + 1) * TM_STEP;   // first quarter hour after now / dusk
  const n = end >= first ? Math.floor((end - first) / TM_STEP) + 1 : 0;
  return n >= 1 ? { first, n } : null;
}
const tmAt = (r, v) => new Date(r.first + (v - 1) * TM_STEP);
function syncTM() {
  const r = tmRange(), rng = $('#tmRange'), box = $('#tm');
  const on = !!r && state.night === 0;
  rng.disabled = !on; box.classList.toggle('off', !on);
  rng.step = 1;
  if (!r) { state.tm = null; rng.max = 0; rng.value = 0; }
  else {
    rng.max = r.n;
    // keep the chosen time across a refresh while it is still ahead of us and inside tonight
    const v = state.tm ? Math.round((+state.tm - r.first) / TM_STEP) + 1 : 0;
    if (!state.tm || v < 1 || v > r.n) { state.tm = null; rng.value = 0; } else { rng.value = v; state.tm = tmAt(r, v); }
  }
  $('#tmVal').textContent = tmLabel();
  $('#tmNow').disabled = !(on && state.tm);
  rng.title = on ? 'Slide to see what you can film later tonight (Home sky applies)' : 'Time Machine works on Tonight';
  tmDrawn = state.tm ? +state.tm : 0;   // whatever the page was just redrawn at
  drawDial();
}
/* The round dial: a 270° gauge (bottom-left = Now, sweeping clockwise to 30 min before dawn) with an hour tick on each full hour. */
const dPt = (th, r) => { const a = th * Math.PI / 180; return [32 + r * Math.sin(a), 32 - r * Math.cos(a)]; };
function drawDial() {
  const rng = $('#tmRange'), svg = $('#tmDial'), g = $('#tmG'); if (!rng || !svg || !g) return;
  const n = +rng.max || 0, v = Math.min(n, Math.max(0, +rng.value || 0)), on = !rng.disabled && n > 0;
  const th = n ? -135 + 270 * v / n : -135;
  const P = (t, r) => dPt(t, r).map((x) => x.toFixed(2)).join(' ');
  const arc = (t1, t2, r) => `M${P(t1, r)} A${r} ${r} 0 ${t2 - t1 > 180 ? 1 : 0} 1 ${P(t2, r)}`;
  let s = '<circle class="face" cx="32" cy="32" r="17"/>' + `<path class="trk" d="${arc(-135, 135, 23)}"/>`;
  if (v > 0) s += `<path class="prg" d="${arc(-135, th, 23)}"/>`;
  const r = tmRange();
  if (r && n) for (let k = 1; k <= n; k++) {
    if (new Date(r.first + (k - 1) * TM_STEP).getMinutes() !== 0) continue;
    const t = -135 + 270 * k / n, a = dPt(t, 27.5), b = dPt(t, 30.5);
    s += `<line class="tk" x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${b[0].toFixed(2)}" y2="${b[1].toFixed(2)}"/>`;
  }
  const nd = dPt(th, 12), kn = dPt(th, 23);
  s += `<line class="ndl" x1="32" y1="32" x2="${nd[0].toFixed(2)}" y2="${nd[1].toFixed(2)}"/><circle class="hub" cx="32" cy="32" r="2.4"/>`
    + `<circle class="knob" cx="${kn[0].toFixed(2)}" cy="${kn[1].toFixed(2)}" r="4.2"/>`;
  g.innerHTML = s;
  svg.setAttribute('aria-valuemax', n); svg.setAttribute('aria-valuenow', v); svg.setAttribute('aria-valuetext', tmLabel());
  svg.setAttribute('tabindex', on ? '0' : '-1'); svg.setAttribute('aria-disabled', on ? 'false' : 'true');
}
/* Dial input: tap the ring to jump, drag round to turn it. Dragging away from the dial gives finer control. */
function wireDial() {
  const svg = $('#tmDial'), rng = $('#tmRange'); let drag = null;
  const kDeg = () => 270 / Math.max(1, +rng.max);
  const angOf = (e, c) => Math.atan2(e.clientX - c.x, c.y - e.clientY) * 180 / Math.PI;
  const fire = (t) => rng.dispatchEvent(new Event(t, { bubbles: true }));
  const setV = (v) => { v = Math.max(0, Math.min(+rng.max, Math.round(v))); if (v !== +rng.value) { rng.value = v; fire('input'); } };
  svg.addEventListener('pointerdown', (e) => {
    if (rng.disabled || !(+rng.max)) return;
    e.preventDefault();
    const b = svg.getBoundingClientRect(), c = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    const dist = Math.hypot(e.clientX - c.x, e.clientY - c.y), a = angOf(e, c);
    let vf = +rng.value;
    if (dist > b.width * 0.18 && dist <= b.width * 0.62) vf = (Math.max(-135, Math.min(135, a)) + 135) / kDeg();
    drag = { c, last: a, vf };
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    svg.focus({ preventScroll: true });
    setV(vf);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const a = angOf(e, drag.c); let d = a - drag.last;
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    drag.last = a;
    if (Math.hypot(e.clientX - drag.c.x, e.clientY - drag.c.y) < 6) return; // angle is unreliable right at the centre
    drag.vf = Math.max(0, Math.min(+rng.max, drag.vf + d / kDeg()));
    setV(drag.vf);
  });
  const end = () => { if (drag) { drag = null; fire('change'); } };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('keydown', (e) => {
    if (rng.disabled) return;
    const v = +rng.value, n = +rng.max;
    const to = { ArrowRight: v + 1, ArrowUp: v + 1, ArrowLeft: v - 1, ArrowDown: v - 1, PageUp: v + 4, PageDown: v - 4, Home: 0, End: n }[e.key];
    if (to == null) return;
    e.preventDefault(); setV(to); fire('change');
  });
}
/* Full redraw at the chosen time: Top Ten (icons, order, times), Seestar list, Moon path, open pop-up chart. */
function applyTM() {
  const D = state.data; if (!D) return;
  const nt = D.nights[state.night];
  renderTargets(nt.targets);
  renderPath(nt, D.lat, effNow());
  if ($('#sheet').open && $('#objChart') && state.openObj) altChart($('#objChart'), state.openObj, effNow());
}
function onTM(final) {
  const r = tmRange(), v = +$('#tmRange').value;
  state.tm = r && v >= 1 ? tmAt(r, v) : null;
  $('#tmVal').textContent = tmLabel(); $('#tmNow').disabled = !state.tm; drawDial();
  const key = state.tm ? +state.tm : 0;
  if (final === true) { cancelAnimationFrame(tmRaf); tmRaf = 0; tmDrawn = key; applyTM(); return; }  // on release: always redraw
  if (key === tmDrawn || tmRaf) return;                                                              // while dragging: once per frame, only on a new stop
  tmRaf = requestAnimationFrame(() => { tmRaf = 0; tmDrawn = state.tm ? +state.tm : 0; applyTM(); });
}
const TOP_N = 3;      // ranks shown at once in the Top targets card
const TOP_MORE = 10;  // scroll down in the card for more; all ten leave the Seestar list
function renderTop(list, topIdx, now) {
  $('#topTitle').firstChild.textContent = `Top Ten Targets ${state.night === 0 ? 'Tonight' : state.night === 1 ? 'Tomorrow' : nightName(2)}`;
  $('#topTargets').innerHTML = topIdx.length ? topIdx.map((i, r) => {
    const o = list[i];
    const g = nextSeg(o, now), upNow = !!(g && g.s <= now);
    const moonTxt = o.moonSep == null ? 'Moon down' : `Moon <span class="n">${Math.round(o.moonSep)}°</span>`;
    const what = o.kind === 'comet' ? `Comet · mag <span class="n">≈${o.mag.toFixed(1)}</span>` : esc(o.type);
    const when = `${upNow || !g ? '' : `${esc(fmtTime(g.s))} `}<span class="to">To</span> ${esc(fmtTime(g ? g.e : o.end))}<span class="hr">${hrsLeft(o, now).toFixed(1)} h</span>`;
    return `<button type="button" class="top-it" data-t="${i}">
      <span class="th"><img src="${thumbLocal(o) || thumbUrl(o)}" data-r="${thumbUrl(o)}" alt="" loading="lazy" decoding="async" onload="this.parentNode.classList.add('ok')" onerror="thumbFb(this)"><i class="rk">${r + 1}</i></span>
      <span class="tx"><span class="tn"><b>${esc(o.id)}</b>${esc(o.name)}</span><span class="ts">${what} · ${moonTxt}</span><span class="tw">${when}</span></span></button>`;
  }).join('') : `<p class="empty">No targets reach ${MIN_ALT}° in darkness.</p>`;
  $('#topTargets').scrollTop = 0;
  sizeTop();
}

/* Keep exactly three Top targets in view; the rest are reached by scrolling the card. */
function sizeTop() {
  const el = $('#topTargets'); if (!el) return;
  if (innerWidth < 760) { el.style.removeProperty('--toph'); const its = [...el.querySelectorAll('.top-it')].slice(0, TOP_N); el.style.maxHeight = its.length ? `${its.reduce((a, i) => a + i.offsetHeight, 0) + 6 * (its.length - 1)}px` : ''; return; }
  el.style.maxHeight = '';
  el.style.setProperty('--toph', `${Math.max(48, (el.clientHeight - 6 * (TOP_N - 1)) / TOP_N)}px`);
}

/* Target search: ignores case, spaces and punctuation, so "m 45", "M45" and "pleiades" all match. */
const normQ = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
function renderTargets(list, skipTop) {
  const now = effNow();
  const q = normQ(state.q);
  // The top ten still-visible targets go to their own card; the Seestar list starts at #11.
  // Targets that are up right now (with at least half an hour left) come first, so tonight's ranking favours
  // what you can film now; everything else keeps its normal order. Indexes stay tied to the original list.
  const tier = (o) => { const g = segAt(o, now); return g ? (g.e - now >= MIN_LEFT ? 0 : 2) : o.end <= now ? 3 : 1; };
  const order = list.map((o, i) => i).sort((a, b) => tier(list[a]) - tier(list[b]) || a - b);
  // The list holds every candidate for the night; show the best 30 for the time being looked at (Top Ten + 20 more),
  // so moving the Time Machine re-picks them rather than just reshuffling the same 30.
  const live = order.filter((i) => list[i].end > now);
  const topIdx = live.slice(0, TOP_MORE);
  if (!skipTop) renderTop(list, topIdx, now);
  // While searching, look through every candidate for the night (Top Ten included) and list all matches.
  const hits = q ? order.filter((i) => normQ(`${list[i].id} ${list[i].name} ${list[i].type || ''}`).includes(q)) : null;
  const rest = (hits || live.slice(TOP_MORE, TOP_MORE + 20)).map((i) => [list[i], i]);
  const tt = $('#tgtTitle .eb-r');
  if (tt) tt.textContent = hits ? `${hits.length} found` : `Reaches ${MIN_ALT}°`;
  if (hits && !hits.length) { $('#targets').innerHTML = '<p class="empty">No match among tonight’s targets.</p>'; return; }
  $('#targets').innerHTML = rest.length ? rest.map(([o, i]) => {
    const neb = /Emission|Supernova|Planetary|^Nebula$|Cluster \+ nebula/.test(o.type);
    const moonTxt = o.moonSep == null ? 'Moon down' : `Moon ${Math.round(o.moonSep)}°`;
    const g = nextSeg(o, now), upNow = !!(g && g.s <= now), past = o.end <= now;
    const sub = o.kind === 'comet'
      ? `Comet · mag ≈${o.mag.toFixed(1)}${o.moonSep == null ? '' : ' · ' + moonTxt}`
      : `${esc(o.type)}${neb ? ' · LP filter' : ''}${o.moonSep == null ? '' : ' · ' + moonTxt}`;
    const when = upNow ? `To ${esc(fmtTime(g.e))}` : esc(fmtTime(g ? g.s : o.start));
    const sub2 = past ? `ended ${esc(fmtTime(o.end))}` : upNow ? `${hrsLeft(o, now).toFixed(1)} h` : `${o.startWhy === 'dark' ? 'at dark · ' : o.startWhy === 'dir' ? 'into view · ' : ''}${hrsLeft(o, now).toFixed(1)} h`;
    return `<button type="button" class="row tgt${o.kind === 'comet' ? ' comet' : ''}${past ? ' past' : ''}" data-t="${i}"><div class="nm"><span class="t1"><b>${esc(o.id)}</b>${esc(o.name)}${o.kind === 'comet' ? '<span class="tag tag-comet">Comet</span>' : ''}</span><span class="sub2">${sub}</span></div>
      <div class="r">${when}<span class="sub2">${sub2}</span></div></button>`;
  }).join('') : topIdx.length ? '<p class="empty">That’s everything for tonight — see Top Ten Targets.</p>' : `<p class="empty">${state.data && state.data.nights[state.night].darkLim == null ? 'No full darkness tonight here.' : `Nothing reaches ${MIN_ALT}° in darkness${state.home ? ` in your home sky (${esc(homeDesc())})` : ''} ${state.night === 0 ? 'tonight' : state.night === 1 ? 'tomorrow night' : 'that night'}.`}</p>`;
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
function heroSky(raHours, dec, majorArcmin, caption, marker, local) {
  const fov = Math.max(SEESTAR.w * 1.35, ((majorArcmin || 0) / 60) * 1.5); // width of the image in degrees
  const fovH = (fov * 2) / 3;
  const fw = (SEESTAR.w / fov) * 100, fh = (SEESTAR.h / fovH) * 100, mw = (MOON_DEG / fov) * 100;
  return `<figure class="hero"><div class="hero-img">
      <img src="${local || skyCutout(raHours, dec, fov)}" data-r="${skyCutout(raHours, dec, fov)}" alt="Sky survey image of the target" decoding="async">
      ${marker ? '<div class="xhair"></div>' : ''}
      <div class="frame" style="left:${((100 - fw) / 2).toFixed(2)}%;top:${((100 - fh) / 2).toFixed(2)}%;width:${fw.toFixed(2)}%;height:${fh.toFixed(2)}%"><svg aria-hidden="true"><rect class="fr-shadow" x="0" y="0" width="100%" height="100%"/><rect class="fr-line" x="0" y="0" width="100%" height="100%"/></svg><span>Seestar frame</span></div>
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
    img.addEventListener('error', () => {
      const r = img.dataset.r;
      if (r && img.getAttribute('src') !== r) img.src = r;   // saved copy missing: use the online survey
      else heroMsg(fig, !navigator.onLine);
    });
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

/* Altitude chart: twilight shading, hour axis, minimum-elevation line, the usable window and when the target reaches it. */
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
  // Usable window: ≥ MIN_ALT in darkness
  for (const g of o.segs || []) {
    const pts = [[X(g.s), Y(MIN_ALT)], [X(g.s), Y(altAt(g.s))]];
    c.forEach((p) => { if (p.d > g.s && p.d < g.e) pts.push([X(p.d), Y(p.alt)]); });
    pts.push([X(g.e), Y(altAt(g.e))], [X(g.e), Y(MIN_ALT)]);
    s += `<polygon points="${pts.map(([x, y]) => f(x) + ',' + f(y)).join(' ')}" fill="var(--go)" fill-opacity=".22"/>`;
  }
  // Minimum-elevation line
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
  // When it reaches MIN_ALT (or is already above it when darkness starts)
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
  // Now marker; its label flips to the other side of the line if it would sit on the minimum marker.
  if (now && +now > t0 && +now < t1) {
    const x = X(now), tw = sm * 1.9;
    const right = xs == null || xs < x - 2 || xs > x + tw + 8;
    const tx = right ? x + 4 : x - 4;
    marks += `<line x1="${f(x)}" x2="${f(x)}" y1="${f(T)}" y2="${f(T + ph)}" stroke="var(--text)" stroke-opacity=".55" stroke-width="1" stroke-dasharray="2 3"/>`;
    labels += `<text x="${f(tx)}" y="${f(T + ph - 5)}" font-size="${f(sm)}" font-weight="700" text-anchor="${right ? 'start' : 'end'}" fill="var(--text)" opacity=".75">${state.tm && state.night === 0 ? esc(fmtTime(now)) : 'Now'}</text>`;
    obst.push(box(right ? tx : tx - tw, T + ph - 5 - sm, tw, sm + 2));
  }
  if (o.start) {
    const x = X(o.start);
    const label = o.startWhy === 'alt' ? `Reaches ${MIN_ALT}° · ${fmtTime(o.start)}` : o.startWhy === 'dir' ? `In home sky · ${fmtTime(o.start)}` : `Dark · ${fmtTime(o.start)} · ${Math.round(o.startAlt)}°`;
    const side = x > L + pw * 0.6 ? 'end' : 'start', dx = side === 'end' ? -fs * 0.6 : fs * 0.6;
    pill([[x + dx, y40 + gap, side], [x + dx, y40 - gap, side], [x + dx, y40 + gap * 2.6, side], [x + dx, T + fs, side], [x - dx, y40 + gap, side === 'end' ? 'start' : 'end']], label, 'var(--go)');
    if (o.end) {
      const xe = X(o.end);
      const txt = `${o.endWhy === 'alt' ? `Below ${MIN_ALT}°` : o.endWhy === 'dir' ? 'Leaves home sky' : 'Dawn'} · ${fmtTime(o.end)}`;
      // Always end the pill at its own drop line (window sits between the two pills); drop a row rather than flip sides.
      const ye = Y(altAt(o.end));
      marks += `<line x1="${f(xe)}" x2="${f(xe)}" y1="${f(ye)}" y2="${f(T + ph)}" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="3 3"/>`;
      obst.push(box(xe - 2, ye, 4, T + ph - ye));
      const es = xe < L + pw * 0.4 ? 'start' : 'end', ex = es === 'end' ? xe - fs * 0.6 : xe + fs * 0.6;
      pill([[ex, y40 + gap, es], [ex, y40 + gap * 2.6, es], [ex, y40 + gap * 4, es], [ex, y40 - gap, es], [ex, T + fs, es]], txt, 'var(--muted)');
    }
  }
  if (peakTxt) {
    const [x, y] = peakTxt, tw = sm * 4.2, b = box(x - tw / 2, y - fs * 0.7 - sm, tw, sm + 2);
    if (y - fs * 0.7 - sm > T && !obst.some((o2) => hit(b, o2) > 0)) labels += `<text x="${f(x)}" y="${f(y - fs * 0.7)}" font-size="${f(sm)}" font-weight="700" text-anchor="middle" fill="var(--accent)">Peak ${Math.round(o.peak.alt)}°</text>`;
  }
  s += marks + labels;
  // Time slider: drag (or tap, or arrow keys) to read altitude and direction at any moment of the night.
  const ph2 = md * 1.75;
  s += `<g class="scrub" pointer-events="none">
    <line class="sc-line" y1="${f(T)}" y2="${f(T + ph)}" stroke="var(--text)" stroke-width="1.6"/>
    <circle class="sc-moon" r="${f(fs * 0.24)}" fill="var(--moon-lit)" stroke="var(--card)" stroke-width="1.5"/>
    <circle class="sc-dot" r="${f(fs * 0.36)}" fill="var(--card)" stroke="var(--accent)" stroke-width="3"/>
    <circle class="sc-knob" cy="${f(T + ph)}" r="${f(fs * 0.5)}" fill="var(--text)" stroke="var(--card)" stroke-width="2"/>
    <rect class="sc-box" height="${f(ph2)}" rx="${f(ph2 / 2)}"/>
    <text class="sc-txt" font-size="${f(md)}" font-weight="700" text-anchor="middle" fill="var(--card)"></text></g>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="slider" tabindex="0" aria-label="Time slider: altitude through the night" aria-valuemin="0" aria-valuemax="100">${s}</svg>`;
  const svg = el.querySelector('svg'), g = svg.querySelector('.scrub'), q = (k) => g.querySelector(k);
  const lerp = (t, key) => {
    const k = Math.min(c.length - 2, Math.max(0, Math.floor((t - t0) / STEP))), a = c[k], b = c[k + 1];
    return a[key] + (b[key] - a[key]) * ((t - a.d) / (b.d - a.d));
  };
  const setT = (t) => {
    t = Math.max(t0, Math.min(t1, t));
    el._scrub = t;
    const d = new Date(t), x = X(d), alt = lerp(t, 'alt'), moon = lerp(t, 'moon'), az = azAt(d), y = Y(Math.max(0, alt));
    const inWin = (o.segs || []).some((g2) => t >= +g2.s && t <= +g2.e);
    const txt = `${fmtTime(d)} · ${alt < 0 ? 'below horizon' : `${Math.round(alt)}° ${compass(az)}`}`;
    q('.sc-line').setAttribute('x1', f(x)); q('.sc-line').setAttribute('x2', f(x));
    q('.sc-dot').setAttribute('cx', f(x)); q('.sc-dot').setAttribute('cy', f(y));
    q('.sc-dot').setAttribute('opacity', alt < 0 ? '0' : '1');
    q('.sc-knob').setAttribute('cx', f(x));
    q('.sc-moon').setAttribute('cx', f(x)); q('.sc-moon').setAttribute('cy', f(Y(Math.max(0, moon))));
    q('.sc-moon').setAttribute('opacity', moon > 0 ? '.9' : '0');
    // Readout pill rides just above the dot (below it if there's no room), clamped inside the chart.
    const w = txt.length * md * 0.56 + md * 1.3;
    const bx = Math.max(L, Math.min(L + pw - w, x - w / 2));
    let by = y - ph2 - fs * 0.7;
    if (by < 2) by = y + fs * 0.7;
    const box2 = q('.sc-box');
    box2.setAttribute('x', f(bx)); box2.setAttribute('y', f(by)); box2.setAttribute('width', f(w));
    box2.setAttribute('fill', inWin ? 'var(--go)' : 'var(--text)');
    const tx = q('.sc-txt');
    tx.setAttribute('x', f(bx + w / 2)); tx.setAttribute('y', f(by + ph2 / 2 + md * 0.34));
    tx.textContent = txt;
    svg.setAttribute('aria-valuenow', Math.round(((t - t0) / (t1 - t0)) * 100));
    svg.setAttribute('aria-valuetext', txt);
  };
  const tAt = (e) => {
    const r = svg.getBoundingClientRect();
    return t0 + (((e.clientX - r.left) * (W / r.width) - L) / pw) * (t1 - t0);
  };
  let drag = false;
  svg.style.touchAction = 'pan-y';
  svg.style.cursor = 'ew-resize';
  // Only moves while pressed and dragged: no hover tracking, no jump on a plain tap or click.
  let x0 = 0;
  svg.addEventListener('pointerdown', (e) => { if (e.button > 0) return; drag = true; x0 = e.clientX; try { svg.setPointerCapture(e.pointerId); } catch (_) {} });
  svg.addEventListener('pointermove', (e) => { if (drag && Math.abs(e.clientX - x0) > 2) { x0 = -1e9; setT(tAt(e)); } });
  const stop = () => { drag = false; };
  svg.addEventListener('pointerup', stop);
  svg.addEventListener('pointercancel', stop);
  svg.addEventListener('keydown', (e) => {
    const step = (e.shiftKey ? 30 : 5) * 60e3;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setT(el._scrub + (e.key === 'ArrowLeft' ? -step : step)); }
  });
  // Start at now (if it is night), else at the peak.
  const keep = el._scrub != null && el._scrubFor === o ? el._scrub : null;
  el._scrubFor = o;
  setT(keep ?? (now && +now > t0 && +now < t1 ? +now : o.peak ? +o.peak.d : o.start ? +o.start : (t0 + t1) / 2));
}

const tile = (lbl, val, sub = '', cls = '') => `<div class="tile ${cls}"><span class="lbl">${esc(lbl)}</span><b>${esc(val)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
function windowTiles(o) {
  return o.start
    ? tile(o.startWhy === 'alt' ? `Reaches ${MIN_ALT}°` : o.startWhy === 'dir' ? 'Into home sky' : `Above ${MIN_ALT}° at dark`, fmtTime(o.start), (o.startWhy === 'alt' ? `rising through ${MIN_ALT}°` : o.startWhy === 'dir' ? `comes round past NW at ${Math.round(o.startAlt)}°` : `already ${Math.round(o.startAlt)}° when dark begins`), 'key')
      + tile('Imaging window', `${o.hrs.toFixed(1)} h`, `until ${fmtTime(o.end)}${o.endWhy === 'dark' ? ' (dawn)' : o.endWhy === 'dir' ? ' (passes S)' : ''}`, 'key')
    : tile(`Reaches ${MIN_ALT}°`, 'Not tonight', `in darkness`, o.kind === 'planet' ? 'warn' : 'warn span');
}
function openObject(o) {
  if (!o) return;
  const now = effNow();
  const peakTxt = o.peak ? `${Math.round(o.peak.alt)}° ${compass(o.peak.az)}` : '–'; // planets: peak = best after dusk
  let title, sub, hero, tiles, rows, tip;
  if (o.kind === 'dso') {
    const info = DSO_INFO[o.id] || [null, '', '–'];
    const sz = parseSize(info[1]);
    const [fit, fitSub] = frameFit(sz);
    title = `${o.id} · ${o.name}`;
    sub = `${o.type} in ${constellation(o.ra, o.dec)}`;
    hero = heroSky(o.ra, o.dec, sz ? sz[0] : 0, 'DSS2 sky survey · dashed box = Seestar S50 frame · circle = full Moon', false, `heroes/${String(o.id).replace(/[^A-Za-z0-9]+/g, '_')}.jpg`);
    tiles = windowTiles(o) + tile('Peak', peakTxt, o.peak ? `at ${fmtTime(o.peak.d)}` : '', 'sm') + tile('Fits Seestar frame', fit, fitSub, 'sm');
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
    tiles = windowTiles(o) + tile('Highest', peakTxt, `at ${fmtTime(o.d)}`, 'sm') + tile('Magnitude', o.mag.toFixed(1), o.mag < 0 ? 'very bright' : '', 'sm')
      + (o.start ? '' : tile('Apparent size', `${o.size.toFixed(o.size < 10 ? 1 : 0)}″`, `≈ ${Math.max(1, Math.round(px))} px in the Seestar`, 'sm'));
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
    tiles = windowTiles(o) + tile('Peak', peakTxt, `at ${fmtTime(o.peak.d)}`, 'sm') + tile('Brightness', `≈ ${o.mag.toFixed(1)}`, 'predicted magnitude', 'sm');
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
      <div class="obj-top">${hero}<div class="tiles">${tiles}<div class="tip"><b>Seestar tip</b>${esc(tip)}</div></div></div>
      <section class="chart-card">
        <div class="chart-head"><h3>Altitude tonight</h3><span>${o.start ? `In view ≥${MIN_ALT}° for ${o.hrs.toFixed(1)} h` : `Never reaches ${MIN_ALT}° in darkness`}</span></div>
        <div class="chart" id="objChart"></div>
        <div class="chart-key"><span><i class="k-tgt"></i>${esc(o.kind === 'planet' ? o.name : o.id)}</span><span><i class="k-moon"></i>Moon</span><span><i class="k-min"></i>${MIN_ALT}° minimum</span><span><i class="k-win"></i>Imaging window</span><span><i class="k-dark"></i>Full dark</span></div>
      </section>
      <dl class="facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <p class="fine">${o.kind === 'comet' ? 'Orbit: JPL Horizons. Positions computed on device.' : o.kind === 'dso' ? 'Catalog sizes and magnitudes are approximate.' : 'Positions computed on device (Astronomy Engine).'}</p>
    </div>`, sub, true, false, seestarName(o));
  state.openObj = o;
  const draw = () => altChart($('#objChart'), o, now);
  requestAnimationFrame(draw);
  wireHero($('#sheetBody'));
}
function showTarget(i) { const D = state.data; openObject(D && D.nights[state.night].targets[i]); }
function showPlanet(i) { const D = state.data; openObject(D && D.nights[state.night].planets[i]); }
function showComet(i) { const D = state.data; openObject(D && D.nights[state.night].comets[i]); }

/* ---------- options ---------- */
function homeWheel() {
  const C = 134, R1 = 38, R2 = 106, RL = 120, rad = Math.PI / 180;
  const pt = (a, r) => `${(C + r * Math.sin(a * rad)).toFixed(1)} ${(C - r * Math.cos(a * rad)).toFixed(1)}`;
  let s = '';
  state.homeSky.forEach((on, i) => {
    const a0 = i * 22.5, a1 = a0 + 22.5;
    s += `<path class="wedge${on ? ' on' : ''}" data-w="${i}" role="checkbox" aria-checked="${on}" aria-label="${PT16[i]} to ${PT16[(i + 1) % 16]}" tabindex="0"
      d="M${pt(a0, R1)} L${pt(a0, R2)} A${R2} ${R2} 0 0 1 ${pt(a1, R2)} L${pt(a1, R1)} A${R1} ${R1} 0 0 0 ${pt(a0, R1)}Z"/>`;
  });
  // N–S and E–W lines run right through the wheel to the labels.
  for (const a of [0, 90]) s += `<line class="axis" x1="${pt(a, RL - 9).split(' ')[0]}" y1="${pt(a, RL - 9).split(' ')[1]}" x2="${pt(a + 180, RL - 9).split(' ')[0]}" y2="${pt(a + 180, RL - 9).split(' ')[1]}"/>`;
  PT16.forEach((n, i) => {
    const big = i % 4 === 0, mid = i % 2 === 0, a = i * 22.5, r = big ? RL + 4 : RL;
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
  store.set('homeSky2', state.homeSky);
  renderOptions(); applyHome();
  if (state.home) { findTargets(); renderAll(); }
}
/* Minimum elevation: one value used for targets, planets, comets, charts and labels everywhere. */
let altTimer = 0;
function setMinAlt(v, commit) {
  v = Math.min(ALT_HI, Math.max(ALT_LO, Math.round(+v)));
  if (!isNum(v)) return;
  MIN_ALT = v;
  syncAltUI(commit);
  store.set('minAlt', v);
  applyMinAlt();
  clearTimeout(altTimer);
  altTimer = setTimeout(() => { findTargets(); renderAll(); }, commit ? 0 : 120);
}
function syncAltUI(commit) {
  const box = $('#optAlt');
  if (!box) return;
  const r = box.querySelector('input[type=range]'), n = box.querySelector('input[type=number]');
  if (+r.value !== MIN_ALT) r.value = MIN_ALT;
  if (document.activeElement !== n || commit) n.value = MIN_ALT;
  r.style.setProperty('--p', ((MIN_ALT - ALT_LO) / (ALT_HI - ALT_LO) * 100).toFixed(1) + '%');
}
function applyMinAlt() {
  const t = $('#tgtTitle .eb-r');
  if (t && !normQ(state.q)) t.textContent = `Reaches ${MIN_ALT}°`;
}
function showOptions() {
  showSheet('Options', `<section class="opt" id="optUnits">
      <h3 class="opt-h">Units</h3>
      <div class="night-seg theme-seg" role="group" aria-label="Units">${[['metric', '°C · km/h · mm'], ['imperial', '°F · mph · in']].map(([v, l]) => `<button type="button" data-units="${v}" aria-pressed="${state.units === v}">${l}</button>`).join('')}</div>
    </section>
    <section class="opt" id="optTheme">
      <h3 class="opt-h">Appearance</h3>
      <div class="night-seg theme-seg" role="group" aria-label="Appearance">${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<button type="button" data-theme="${v}" aria-pressed="${state.theme === v}">${l}</button>`).join('')}</div>
      <p class="note opt-note">Auto follows your device. Red night mode still overrides this.</p>
    </section>
    <section class="opt" id="optHome">
      <h3 class="opt-h">Home sky</h3>
      <p class="note opt-note">Tap wedges for the directions you can see. <b>Home</b> then only shows targets there.</p>
      <div class="wheel-wrap"></div>
      <p class="wheel-sum">Visible: <b class="wheel-desc"></b></p>
      <div class="opt-btns"><button type="button" class="tbtn" data-act="all">All</button><button type="button" class="tbtn ghost" data-act="reset">Reset (NW → S)</button></div>
    <div id="optAlt" title="Targets, planets and comets only count while at least this high in darkness">
      <h3 class="opt-h">Min elevation</h3>
      <div class="alt-row">
        <input type="range" min="${ALT_LO}" max="${ALT_HI}" step="1" value="${MIN_ALT}" aria-label="Minimum elevation in degrees">
        <label class="alt-num"><input type="number" inputmode="numeric" min="${ALT_LO}" max="${ALT_HI}" step="1" value="${MIN_ALT}" aria-label="Minimum elevation, degrees"><span>°</span></label>
        <button type="button" class="tbtn ghost alt-reset" data-alt="${ALT_DEF}" title="Reset to ${ALT_DEF}°">${ALT_DEF}°</button>
      </div>
    </div>
    </section>`, '', false, true);
  setSheetLink('User Guide', showGuide);
  $('#optUnits').addEventListener('click', (e) => {
    const b = e.target.closest('[data-units]');
    if (!b || b.dataset.units === state.units) return;
    state.units = b.dataset.units; store.set('units', state.units);
    $('#optUnits').querySelectorAll('[data-units]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderAll();
  });
  $('#optTheme').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme]');
    if (!b) return;
    state.theme = b.dataset.theme; store.set('theme', state.theme);
    $('#optTheme').querySelectorAll('[data-theme]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    applyRed(); renderAll();
  });
  const ab = $('#optAlt');
  const rng = ab.querySelector('input[type=range]'), num = ab.querySelector('input[type=number]');
  rng.addEventListener('input', () => setMinAlt(rng.value));
  rng.addEventListener('change', () => setMinAlt(rng.value, true));
  num.addEventListener('input', () => { if (num.value !== '' && +num.value >= ALT_LO && +num.value <= ALT_HI) setMinAlt(num.value); });
  num.addEventListener('change', () => setMinAlt(num.value === '' ? MIN_ALT : num.value, true));
  num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); num.blur(); } });
  ab.querySelector('[data-alt]').addEventListener('click', () => setMinAlt(ALT_DEF, true));
  syncAltUI(true);
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

/* User Guide: opens in the same pop-up as Options, with a "‹ Options" button to go back. */
function showGuide() {
  const G = window.SKY_GUIDE;
  showSheet('User Guide', G ? G.html(VERSION) : '<p class="note">The guide could not be loaded. Close the app and open it again.</p>', '', true, false);
  setSheetLink('‹ Options', showOptions);
  $('#sheet').classList.add('is-guide');
  if (G) G.wire($('#sheetBody'));
}

function showSources() {
  const src = state.data && state.data.src;
  if (!src) { showSheet('Data sources', '<p class="note">Load a forecast first.</p>'); return; }
  const items = [];
  OM_MODELS.forEach((m) => items.push([m.name + ' (Open-Meteo)', !!src.om[m.id]]));
  items.push(['MET Norway (yr.no)', !!src.met]);
  ENSEMBLES.forEach((e) => items.push([e.name + ' (Open-Meteo)', !!src.ens[e.name], src.ens[e.name] ? src.ens[e.name].members + ' runs' : '']));
  items.push(['7Timer! ASTRO — seeing & transparency', src.t7cached ? 'cached' : !!src.t7, src.t7pending ? (src.t7cached ? '(loading… showing ' + fmtTime(src.t7cached) + ' data)' : '(loading…)') : src.t7cached ? '(live fetch failed, using ' + fmtTime(src.t7cached) + ' data)' : !src.t7 && state.t7err ? '(' + state.t7err + ')' : '']);
  items.push(['Astronomy Engine — Sun, Moon, planets (on device)', true]);
  items.push(['Light Pollution Atlas 2025 (D. Lorenz) — Bortle', !!(state.lp && isNum(state.lp.sqm))]);
  showSheet('Data sources', `<table class="src"><tbody>${items.map(([n, ok, x]) => `<tr><td>${esc(n)}${x ? ` <span class="muted">${esc(x)}</span>` : ''}</td><td class="n ${ok === 'cached' ? 'cached' : ok ? 'ok' : 'bad'}">${ok === 'cached' ? 'Cached' : ok ? '✓ Online' : 'Unavailable'}</td></tr>`).join('')}</tbody></table>`);
}

function renderAll() {
  const D = state.data;
  applyNight();
  syncTM();
  if (!D) return;
  const N = D.nights[state.night];
  renderVerdict(N.win, N.moon, N.hours);
  renderTonight(N.win);
  renderForecast(N.hours);
  $('#fcTitle').innerHTML = `Dark hours<span class="fc-date">${esc(fmtDay(N.win.set))}</span>`;
  $('#pathTitle').textContent = state.night ? `Moon path · ${state.night === 1 ? 'tomorrow' : nightName(2)}` : 'Moon path';
  renderMoon(N.moon, D.lat);
  renderPath(N, D.lat, effNow());
  renderPlanets(N.planets);
  renderComets(N.comets);
  renderTargets(N.targets);
  const s = D.src, on = OM_MODELS.filter((m) => s.om[m.id]).length + ENSEMBLES.filter((e) => s.ens[e.name]).length + (s.met ? 1 : 0) + (s.t7 && !s.t7cached ? 1 : 0);
  $('#sourcesBtn').textContent = `Data sources · ${on}/${OM_MODELS.length + ENSEMBLES.length + 2} online`;
  $('#updated').textContent = 'Updated ' + fmtDay(D.now) + ', ' + fmtTime(D.now);
}

/* Planets and targets for both nights; re-run when the Home sky switch changes. */
function findTargets() {
  const D = state.data;
  if (!D) return;
  for (const N of D.nights) {
    N.planets = planetsTonight(D.obs, N.S);
    N.comets = cometsAll(D.obs, N.S);
    N.targets = [...cometsTonight(D.obs, N.S, N.win), ...targetsTonight(D.obs, N.S)];
  }
}
/* Home sky belongs to one place: it's on only when the user wants it AND the current location is that place. */
const HOME_KM = 3; // GPS without high accuracy can wander, so allow a few km
function nearHome(loc) {
  const h = state.homeLoc; if (!h || !loc) return false;
  const R = Math.PI / 180, dLat = (loc.lat - h.lat) * R, dLon = (loc.lon - h.lon) * R;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(h.lat * R) * Math.cos(loc.lat * R) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a)) <= HOME_KM;
}
function syncHome() {
  const want = store.get('home', false);
  if (want && !state.homeLoc && state.loc) { state.homeLoc = { lat: state.loc.lat, lon: state.loc.lon }; store.set('homeLoc', state.homeLoc); }
  state.home = want && (!state.loc || nearHome(state.loc));
  applyHome();
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
  loadBortle(loc);
  // 7Timer! is slow, so it never holds up the forecast: it's started now and filled in when it arrives.
  const t7p = fetch7Timer(lat, lon).then((v) => v, () => null);
  const key = t7Key(loc.lat, loc.lon);
  clearTimeout(t7Retry); t7Tries = 0;
  // Until 7Timer! answers, show this session's last good data for the same spot (if any).
  const hasCache = t7Cache && t7Cache.key === key;
  const src = { om: {}, ens: {}, met: null, t7: hasCache ? t7Cache.data : null, t7cached: hasCache ? t7Cache.at : null, t7pending: true };
  t7p.then((t7) => {
    if (run !== loading) return;
    src.t7pending = false;
    if (t7) { t7Cache = { key, data: t7, at: new Date() }; src.t7 = t7; src.t7cached = null; }
    else if (hasCache) scheduleT7Retry(lat, lon, key);
    if (state.data && state.data.key === key) buildNights(src, state.data.now, key);
  });
  // Show the forecast as soon as the first model answers, then refresh as each further source lands,
  // so one slow service can't hold the whole screen hostage.
  let pending = OM_MODELS.length + ENSEMBLES.length + 1, now = null, rt = null;
  const render = () => {
    rt = null;
    if (run !== loading) return;
    const tz = (Object.values(src.om)[0] || {}).tz;
    state.tz = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!now) now = new Date();
    buildNights(src, now, key);
  };
  const landed = () => {
    if (run !== loading) return;
    pending--;
    const have = Object.keys(src.om).length || src.met;
    if (have) {
      if (!now) render(); else if (!rt) rt = setTimeout(render, 400);
      setStatus(pending ? `Loading ${pending} more source${pending > 1 ? 's' : ''}…` : '');
    } else if (!pending) {
      setStatus('Could not reach any weather service. Check your connection and tap ↻.', true);
      render();
    }
    if (!pending && rt) { clearTimeout(rt); render(); }
  };
  OM_MODELS.forEach((m) => fetchOM(m, lat, lon).then((r) => { src.om[m.id] = r; }, () => {}).then(landed));
  ENSEMBLES.forEach((e) => fetchEnsemble(e, lat, lon).then((r) => { src.ens[e.name] = r; }, () => {}).then(landed));
  fetchMET(lat, lon).then((r) => { src.met = r; }, () => {}).then(landed);
}

/* Build the three nights from fetched data (also re-run when a 7Timer! retry succeeds). */
function buildNights(src, now, key) {
  const loc = state.loc;
  key = key || (state.data && state.data.key);
  const obs = new A.Observer(+loc.lat, +loc.lon, 0);
  // Tonight (the night in progress until under 2 h of darkness remain, otherwise the coming evening), tomorrow night and the night after.
  const w0 = nightWindow(obs, now, true);
  const w1 = nightWindow(obs, new Date(w0.rise.getTime() + 3600e3));
  const w2 = nightWindow(obs, new Date(w1.rise.getTime() + 3600e3));
  const night = (win, from) => {
    const mid = new Date((win.set.getTime() + win.rise.getTime()) / 2);
    const moon = moonInfo(obs, mid, win);
    const S = nightSamples(obs, win);
    // Only hours that are completely inside astronomical darkness; if the night never gets fully dark, keep the twilight hours.
    const all = buildHours(from, win.rise, src, obs, moon.illum).filter((h) => h.sky.k !== 'day');
    const ds = win.darkStart && win.darkStart.getTime() / 1000, de = win.darkEnd && win.darkEnd.getTime() / 1000;
    const dark = ds && de ? all.filter((h) => h.t >= ds && h.t + 3600 <= de) : [];
    return { win, moon, S, darkLim: S.darkLim, hours: dark.length ? dark : all };
  };
  const nights = [night(w0, w0.set > now ? w0.set : now), night(w1, w1.set), night(w2, w2.set)];
  const prev = state.data;
  state.data = { now, lat: +loc.lat, obs, src, nights, key };
  // Targets depend only on place and time, not weather: reuse them when a late source just refreshes the forecast.
  if (prev && prev.key === key && prev.now === now && prev.nights) nights.forEach((N, i) => { N.planets = prev.nights[i].planets; N.comets = prev.nights[i].comets; N.targets = prev.nights[i].targets; });
  else findTargets();
  renderAll();
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
  syncHome(); // leaving home turns Home off; coming back to it turns it back on
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
const isLight = () => state.theme === 'light' || (state.theme === 'auto' && LIGHT.matches);
function applyRed() {
  document.documentElement.classList.toggle('red', state.red);
  document.documentElement.classList.toggle('light', isLight());
  $('#redBtn').setAttribute('aria-pressed', String(state.red));
  $('#redBtn .lbl').textContent = state.red ? 'Normal' : 'Red';
  document.querySelector('meta[name=theme-color]').setAttribute('content', state.red ? '#000000' : isLight() ? '#eef2f8' : '#070b16');
  // The cloud chart is painted on a canvas with the theme's colours baked in, so repaint it for the new theme.
  const D = state.data;
  if (D && D.nights[state.night]) skyChart(D.nights[state.night].hours);
  redrawMoons();
}
function applyUnits() {
  document.querySelectorAll('#unitsBtn span').forEach((s) => s.classList.toggle('on', s.dataset.u === state.units));
}
/* Weekday name of a night's evening, e.g. "Tuesday" (from the forecast once loaded, else from today). */
function nightName(i) {
  const D = state.data;
  const d = D && D.nights[i] ? D.nights[i].win.set : new Date(Date.now() + i * 86400e3);
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: state.tz }).format(d);
}
function applyNight() {
  document.querySelectorAll('#nightSeg button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.n === state.night)));
  const n = state.night === 0 ? 'Tonight' : state.night === 1 ? 'Tomorrow night' : `${nightName(2)} night`;
  $('#verdictEyebrow').textContent = n;
  const b2 = $('#nightSeg [data-n="2"]');
  if (b2) { b2.textContent = innerWidth < 1100 ? nightName(2).slice(0, 3) : nightName(2); b2.title = `${nightName(2)} night`; }
}
function toggleSearch(open) {
  const p = $('#searchPanel');
  const show = open == null ? p.hidden : open;
  p.hidden = !show;
  $('#searchBtn').setAttribute('aria-expanded', String(show));
  if (show) setTimeout(() => $('#searchInput').focus(), 30);
  else $('#searchResults').hidden = true;
}

// Home-screen (standalone) iPad apps keep a cached index.html, so they can sit on an old version.
// Ask the server for the live version (never cached); if it's newer, reload once with a cache-busting URL.
function checkUpdate() {
  fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j || !j.v || j.v === VERSION) return;
      let tried = null; try { tried = sessionStorage.getItem('updTried'); } catch (e) { /* ignore */ }
      if (tried === j.v) return; // already tried this version this session; don't loop if the CDN is still catching up
      try { sessionStorage.setItem('updTried', j.v); } catch (e) { /* ignore */ }
      location.replace(location.pathname + '?u=' + encodeURIComponent(j.v) + '-' + Date.now());
    })
    .catch(() => { /* offline: keep running the current version */ });
}

/* Redraw the Moon path against the live clock (the Time Machine drives it itself while it is in use). */
function refreshPath() {
  const D = state.data;
  if (!D || state.tm || !D.nights[state.night]) return;
  renderPath(D.nights[state.night], D.lat, effNow());
}

function init() {
  $('#ver').textContent = VERSION; $('#verTop').textContent = VERSION;
  watchTiles();
  checkUpdate();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { checkUpdate(); refreshPath(); } });
  window.addEventListener('pageshow', (e) => { if (e.persisted) checkUpdate(); });
  applyRed(); applyUnits(); applyNight(); syncHome(); applyMinAlt(); renderSpots();
  const onScheme = () => applyRed();
  if (LIGHT.addEventListener) LIGHT.addEventListener('change', onScheme); else if (LIGHT.addListener) LIGHT.addListener(onScheme);
  $('#homeBtn').addEventListener('click', () => {
    state.home = !state.home; store.set('home', state.home);
    if (state.home && state.loc) { state.homeLoc = { lat: state.loc.lat, lon: state.loc.lon }; store.set('homeLoc', state.homeLoc); }
    applyHome(); findTargets(); renderAll();
  });
  $('#redBtn').addEventListener('click', () => { state.red = !state.red; store.set('red', state.red); applyRed(); });
  $('#refreshBtn').addEventListener('click', () => (state.loc && state.loc.gps ? useGPS() : load()));
  $('#gpsBtn').addEventListener('click', useGPS);
  $('#searchBtn').addEventListener('click', () => toggleSearch());
  document.querySelectorAll('#nightSeg button').forEach((b) => b.addEventListener('click', () => { state.night = +b.dataset.n; renderAll(); }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleSearch(false); });
  document.addEventListener('click', (e) => {
    if (!$('#searchPanel').hidden && !e.target.closest('#searchPanel, #searchBtn')) toggleSearch(false);
  });
  $('#forecast').addEventListener('click', (e) => { const c = e.target.closest('[data-i]'); if (c) showHour(+c.dataset.i); });
  wireCopy();
  $('#sheetGuide').addEventListener('click', () => { if (guideAct) guideAct(); });
  wireDial();
  $('#tmRange').addEventListener('input', () => onTM());
  $('#tmRange').addEventListener('change', () => onTM(true));
  $('#tmNow').addEventListener('click', () => { $('#tmRange').value = 0; onTM(true); });
  // iPad 13" landscape: make the title + location block exactly as wide as the buttons block, so the gap left of Time Machine equals the gap right of it.
  (() => {
    const ctl = $('.controls'), left = $('.top-l');
    const sync = () => { left.style.width = matchMedia('(min-width: 1300px) and (min-height: 560px) and (min-aspect-ratio: 5/4)').matches ? ctl.offsetWidth + 'px' : ''; };
    if (window.ResizeObserver) new ResizeObserver(sync).observe(ctl);
    addEventListener('resize', sync); sync();
  })();
  $('#sourcesBtn').addEventListener('click', showSources);
  $('#optBtn').addEventListener('click', showOptions);
  $('#topTargets').addEventListener('click', (e) => { const t = e.target.closest('[data-t]'); if (t) showTarget(+t.dataset.t); });
  $('#targets').addEventListener('click', (e) => { const t = e.target.closest('[data-t]'); if (t) showTarget(+t.dataset.t); });
  const tq = $('#tgtQ'), tqx = $('#tgtQx');
  const redoSearch = () => { state.q = tq.value.trim(); tqx.hidden = !tq.value; const D = state.data; if (D) { renderTargets(D.nights[state.night].targets, true); $('#targets').scrollTop = 0; } };
  tq.addEventListener('input', redoSearch);
  tq.addEventListener('keydown', (e) => { if (e.key === 'Enter') tq.blur(); });
  tqx.addEventListener('click', () => { tq.value = ''; redoSearch(); tq.focus(); });
  $('#planets').addEventListener('click', (e) => { const t = e.target.closest('[data-p]'); if (t) showPlanet(+t.dataset.p); });
  $('#comets').addEventListener('click', (e) => { const t = e.target.closest('[data-c]'); if (t) showComet(+t.dataset.c); });
  $('#sheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $('#sheet').addEventListener('close', () => document.documentElement.classList.remove('sheet-open'));
  // Stop the page behind an open sheet from scrolling or rubber-banding on iPad; only the sheet's own body may scroll.
  $('#sheet').addEventListener('touchmove', (e) => {
    if (e.target.closest('input, textarea, select')) return; // keep sliders and fields draggable
    const b = $('#sheetBody');
    if ($('#sheet').classList.contains('locked') || !b.contains(e.target) || b.scrollHeight <= b.clientHeight) e.preventDefault();
  }, { passive: false });
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => {
    sizeTop();
    const D = state.data; if (!D) return;
    renderPath(D.nights[state.night], D.lat, effNow());
    skyChart(D.nights[state.night].hours);
    if ($('#sheet').open && $('#objChart') && state.openObj) altChart($('#objChart'), state.openObj, effNow());
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
  setInterval(() => { if (document.visibilityState === 'visible') refreshPath(); }, 60e3);
}

if (!A) { setStatus('Astronomy library failed to load.', true); } else init();
