// SkyWatch – Go / No Go widget for Scriptable
// Uses the same data sources, hour scoring and Go / Partial Go / Marginal / No Go rules as the SkyWatch app.
// Optional widget parameter: "lat,lon" (e.g. 49.28,-123.12) to fix a location instead of GPS.
// Tap the widget to open SkyWatch.

const APP_URL = "https://voodoovid.github.io/Sky-Watch/";
const WIDGET_VERSION = "w2.5 (matches app v3.32)";

const fm = FileManager.local();
const docs = fm.documentsDirectory();
const cachePath = fm.joinPath(docs, "skywatch-loc.json");
const astroPath = fm.joinPath(docs, "skywatch-astronomy.js");

const isNum = v => typeof v === "number" && isFinite(v);
const avg = a => { const v = a.filter(isNum); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

/* ---------- same rules as the app ---------- */
const RAIN_SHOW = 1, RAIN_FLAG = 15, RAIN_STOP = 30;
const ROLLOVER_HOUR = 1; // after 1 AM "Tonight" is the coming evening
const COLORS = { go: "#2fcf86", partial: "#8fd45c", fair: "#f0b543", nogo: "#ef5d68", day: "#8392b0" };
const RATE_COLOR = { great: COLORS.go, good: COLORS.partial, fair: COLORS.fair, poor: COLORS.nogo };

const OM_FULL = "cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation_probability,precipitation,temperature_2m,dew_point_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,visibility";
const OM_MID = "cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation,temperature_2m,dew_point_2m,wind_speed_10m,wind_gusts_10m";
const OM_MIN = "cloud_cover,precipitation";
const OM_MODELS = [
  { id: "best", path: "forecast" },
  { id: "gfs", path: "gfs" },
  { id: "ecmwf", path: "ecmwf" },
  { id: "gem", path: "gem" },
  { id: "icon", path: "dwd-icon" },
];
const ENSEMBLES = [
  ["dwd_icon_seamless_eps", "icon_seamless"],
  ["ncep_gefs_seamless", "gfs_seamless", "gfs025"],
  ["ecmwf_ifs025_ensemble", "ecmwf_ifs025"],
  ["cmc_gem_geps", "gem_global"],
];

/* ---------- helpers ---------- */
async function getJSON(url, secs = 15, headers) {
  const r = new Request(url);
  r.timeoutInterval = secs;
  if (headers) r.headers = headers;
  const txt = await r.loadString();
  const code = r.response && r.response.statusCode;
  if (code && code >= 400) throw new Error("HTTP " + code);
  return JSON.parse(txt);
}
async function firstOK(urls, secs) {
  let last;
  for (const u of urls) { try { return await getJSON(u, secs); } catch (e) { last = e; } }
  throw last || new Error("failed");
}
function hourlyToMap(h) {
  const m = new Map();
  (h.time || []).forEach((t, i) => {
    const row = {};
    for (const k in h) if (k !== "time") row[k] = h[k][i];
    m.set(t, row);
  });
  return m;
}

async function getLocation() {
  const p = (args.widgetParameter || "").split(",").map(Number);
  if (p.length === 2 && p.every(n => !isNaN(n))) return { latitude: p[0], longitude: p[1] };
  try {
    Location.setAccuracyToThreeKilometers();
    const loc = await Location.current();
    fm.writeString(cachePath, JSON.stringify({ latitude: loc.latitude, longitude: loc.longitude }));
    return loc;
  } catch (e) {
    if (fm.fileExists(cachePath)) return JSON.parse(fm.readString(cachePath));
    throw new Error("No location – run once in the app or set lat,lon parameter");
  }
}

/* The app's own astronomy library, downloaded from the SkyWatch site once and kept on the device. */
async function loadAstronomy() {
  let txt = fm.fileExists(astroPath) ? fm.readString(astroPath) : "";
  if (!txt || txt.length < 100000) {
    const r = new Request(APP_URL + "astronomy.browser.min.js");
    r.timeoutInterval = 20;
    txt = await r.loadString();
    if (!txt || txt.length < 100000) throw new Error("Could not download the astronomy library");
    fm.writeString(astroPath, txt);
  }
  const m = { exports: {} };
  new Function("module", "exports", txt)(m, m.exports);
  if (!m.exports || typeof m.exports.Observer !== "function") {
    if (fm.fileExists(astroPath)) fm.remove(astroPath);
    throw new Error("Astronomy library did not load");
  }
  return m.exports;
}

/* ---------- data (same sources as the app) ---------- */
async function fetchOM(model, lat, lon) {
  const base = `https://api.open-meteo.com/v1/${model.path}?latitude=${lat}&longitude=${lon}&timezone=auto&timeformat=unixtime`;
  const urls = [OM_FULL, OM_MID, OM_MIN].flatMap(v => [base + "&past_days=1&forecast_days=4&hourly=" + v, base + "&forecast_days=4&hourly=" + v]);
  const j = await firstOK(urls, 12);
  return hourlyToMap(j.hourly);
}
async function fetchEnsemble(ids, lat, lon) {
  const urls = ids.map(id => `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${lat}&longitude=${lon}&timeformat=unixtime&forecast_days=4&hourly=precipitation&models=${id}`);
  const h = (await firstOK(urls, 15)).hourly;
  const keys = Object.keys(h).filter(k => k.startsWith("precipitation"));
  if (!keys.length) throw new Error("no members");
  const m = new Map();
  h.time.forEach((t, i) => {
    let wet = 0, n = 0;
    for (const k of keys) { const v = h[k][i]; if (isNum(v)) { n++; if (v >= 0.1) wet++; } }
    if (n) m.set(t, { wet, n });
  });
  return m;
}
async function fetchMET(lat, lon) {
  const j = await getJSON(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${(+lat).toFixed(4)}&lon=${(+lon).toFixed(4)}`,
    15, { "User-Agent": "SkyWatch-widget github.com/voodoovid/Sky-Watch" });
  const m = new Map();
  for (const ts of j.properties.timeseries) {
    const t = Date.parse(ts.time) / 1000;
    const d = ts.data.instant.details || {};
    const n1 = (ts.data.next_1_hours && ts.data.next_1_hours.details) || {};
    m.set(t, {
      cloud_cover: d.cloud_area_fraction,
      precipitation_probability: n1.probability_of_precipitation,
      temperature_2m: d.air_temperature,
      dew_point_2m: d.dew_point_temperature,
      wind_gusts_10m: isNum(d.wind_speed_of_gust) ? d.wind_speed_of_gust * 3.6 : null,
    });
  }
  return m;
}
async function fetch7Timer(lat, lon) {
  const path = `www.7timer.info/bin/astro.php?lon=${(+lon).toFixed(3)}&lat=${(+lat).toFixed(3)}&ac=0&unit=metric&output=json&tzshift=0`;
  let j;
  for (const u of ["https://" + path, "http://" + path]) {
    try {
      const r = new Request(u);
      r.timeoutInterval = 12;
      j = JSON.parse((await r.loadString()).replace(/:\s*(?=[,}\]])/g, ": null"));
      if (j && Array.isArray(j.dataseries) && j.dataseries.length) break;
    } catch (e) { j = null; }
  }
  if (!j) throw new Error("7Timer unavailable");
  const s = String(j.init);
  const t0 = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10)) / 1000;
  return j.dataseries.map(d => ({
    t: t0 + d.timepoint * 3600,
    seeing: d.seeing >= 1 && d.seeing <= 8 ? d.seeing : null,
    transparency: d.transparency >= 1 && d.transparency <= 8 ? d.transparency : null,
    cloud: d.cloudcover >= 1 && d.cloudcover <= 9 ? [3, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 97][d.cloudcover - 1] : null,
  }));
}
async function fetchAll(lat, lon) {
  const settle = p => p.then(v => v, () => null);
  const [om, met, ens, t7] = await Promise.all([
    Promise.all(OM_MODELS.map(m => settle(fetchOM(m, lat, lon)))),
    settle(fetchMET(lat, lon)),
    Promise.all(ENSEMBLES.map(ids => settle(fetchEnsemble(ids, lat, lon)))),
    settle(fetch7Timer(lat, lon)),
  ]);
  if (om.every(x => !x) && !met) throw new Error("Could not reach any weather service");
  return { om, met, ens: ens.filter(Boolean), t7 };
}

/* ---------- astronomy (same as the app) ---------- */
function makeAstro(A) {
  const tdate = t => (t ? t.date : null);
  const altAz = (body, date, obs) => {
    const eq = A.Equator(body, date, obs, true, true);
    return A.Horizon(date, obs, eq.ra, eq.dec, "normal").altitude;
  };
  const skyState = a => (a > -0.833 ? "day" : a > -6 ? "civil" : a > -12 ? "nautical" : a > -18 ? "astro" : "dark");
  function nightWindow(obs, now, rollover) {
    const sunNow = altAz("Sun", now, obs);
    const h = now.getHours();
    const pastRollover = rollover && h >= ROLLOVER_HOUR && h < 12;
    const from = sunNow > -0.833 || pastRollover ? now : new Date(now.getTime() - 86400000);
    const set = tdate(A.SearchRiseSet("Sun", obs, -1, from, 1.5));
    if (!set) return { set: now, rise: new Date(now.getTime() + 12 * 3600e3) };
    const rise = tdate(A.SearchRiseSet("Sun", obs, +1, set, 1.5)) || new Date(set.getTime() + 12 * 3600e3);
    let darkStart = tdate(A.SearchAltitude("Sun", obs, -1, set, 1, -18));
    let darkEnd = darkStart ? tdate(A.SearchAltitude("Sun", obs, +1, darkStart, 1, -18)) : null;
    if (darkStart && darkStart > rise) { darkStart = null; darkEnd = null; }
    return { set, rise, darkStart, darkEnd };
  }
  return { altAz, skyState, nightWindow };
}

/* ---------- scoring (same as the app) ---------- */
function scoreHour(h) {
  if (h.sky === "day") return { k: "day", score: null };
  let s = 100;
  if (isNum(h.cloud)) s -= h.cloud * 0.85;
  if (isNum(h.pop)) s -= h.pop * 0.35;
  if (isNum(h.gust)) s -= h.gust > 40 ? 40 : h.gust > 30 ? 25 : h.gust > 20 ? 10 : 0;
  if (isNum(h.dewGap) && h.dewGap < 2) s -= 8;
  if (isNum(h.seeing) && h.seeing >= 6) s -= 8;
  if (isNum(h.transparency) && h.transparency >= 6) s -= 8;
  if (h.sky === "civil") s -= 30; else if (h.sky === "nautical") s -= 15; else if (h.sky === "astro") s -= 5;
  if (h.moonAlt > 0) s -= 12 * h.moonIllum;
  s = Math.max(0, Math.min(100, s));
  if (isNum(h.pop) && Math.round(h.pop) >= RAIN_SHOW) s = Math.min(s, 34); // any rain risk: never a usable hour
  return { k: s >= 75 ? "great" : s >= 55 ? "good" : s >= 35 ? "fair" : "poor", score: Math.round(s) };
}
function nearest7T(list, t) {
  if (!list) return null;
  let best = null;
  for (const x of list) if (!best || Math.abs(x.t - t) < Math.abs(best.t - t)) best = x;
  return best && Math.abs(best.t - t) <= 2 * 3600 ? best : null;
}
function buildHours(from, to, src, obs, illum, AS) {
  const start = Math.floor(from.getTime() / 3600e3) * 3600;
  const end = to.getTime() / 1000;
  const hours = [];
  for (let t = start; t < end; t += 3600) {
    const mid = new Date((t + 1800) * 1000);
    const det = src.om.map(m => m && m.get(t)).filter(Boolean);
    const met = src.met && src.met.get(t);
    if (met) det.push(met);
    const t7 = nearest7T(src.t7, t);
    const best = (src.om[0] && src.om[0].get(t)) || det[0] || {};
    const metRow = met || {};
    const val = k => (isNum(best[k]) ? best[k] : isNum(metRow[k]) ? metRow[k] : null);
    const clouds = det.map(r => r.cloud_cover).filter(isNum);
    if (t7 && isNum(t7.cloud)) clouds.push(t7.cloud);
    let wet = 0, n = 0;
    for (const e of src.ens) { const er = e.get(t); if (er) { wet += er.wet; n += er.n; } }
    const pop = n ? (100 * wet) / n : avg(det.map(r => r.precipitation_probability));
    const tC = val("temperature_2m"), dew = val("dew_point_2m");
    const h = {
      t, d: new Date(t * 1000),
      cloud: avg(clouds), pop,
      gust: val("wind_gusts_10m"),
      dewGap: isNum(tC) && isNum(dew) ? tC - dew : null,
      seeing: t7 ? t7.seeing : null, transparency: t7 ? t7.transparency : null,
      sky: AS.skyState(AS.altAz("Sun", mid, obs)), moonAlt: AS.altAz("Moon", mid, obs), moonIllum: illum,
    };
    h.rating = scoreHour(h);
    hours.push(h);
  }
  return hours;
}
const popOf = h => (isNum(h.pop) ? h.pop : 0);
const rainy = h => Math.round(popOf(h)) >= RAIN_SHOW; // ANY rain chance rules the hour out
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
function verdict(hours) {
  const night = hours.filter(h => h.rating.score != null);
  const best = bestWindow(hours);
  if (!night.length) return { cls: "day", txt: "NO DATA", best, night };
  const inWin = h => best && h.t >= best.start.t && h.t <= best.end.t;
  const wet = night.filter(rainy);
  const poor = night.filter(h => !inWin(h) && h.rating.k === "poor");
  let cls, txt;
  if (best && best.hrs >= 2 && !wet.length && !poor.length) { cls = "go"; txt = "GO"; }
  else if (best && best.hrs >= 3) { cls = "partial"; txt = "PARTIAL GO"; } // needs 3+ dry, usable hours
  else if (best || night.some(h => h.rating.k === "fair")) { cls = "fair"; txt = "MARGINAL"; }
  else { cls = "nogo"; txt = "NO GO"; }
  return { cls, txt, best, night, wet, poor };
}

/* ---------- display ---------- */
function fmt(d, f) {
  const df = new DateFormatter();
  df.dateFormat = f;
  return df.string(d);
}
const PHASES = ["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"];
const PHASE_EMOJI = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];

function buildWidget(v, hours, darkLabel, moon, family) {
  const w = new ListWidget();
  const bg = new LinearGradient();
  bg.colors = [new Color("#151b2b"), new Color("#0a0d16")];
  bg.locations = [0, 1];
  w.backgroundGradient = bg;
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60000); // a hint only: iOS decides when widgets refresh
  w.setPadding(8, 10, 8, 10);

  const muted = new Color("#8b95a7");
  const hex = COLORS[v.cls];

  const centred = fill => {
    const r = w.addStack();
    r.centerAlignContent();
    r.addSpacer();
    fill(r);
    r.addSpacer();
    return r;
  };
  const style = (t, font, color) => {
    t.font = font;
    t.textColor = color;
    t.lineLimit = 1;
    t.minimumScaleFactor = 0.6;
    return t;
  };

  // Title plus when this forecast was fetched, so stale data is easy to spot.
  centred(r => {
    style(r.addText("SkyWatch"), Font.heavySystemFont(18), Color.white());
    style(r.addText("  · " + fmt(new Date(), "HH:mm")), Font.mediumSystemFont(12), muted);
  });
  w.addSpacer(8);

  centred(r => {
    const pill = r.addStack();
    pill.backgroundColor = new Color(hex, 0.3);
    pill.borderColor = new Color(hex, 0.85);
    pill.borderWidth = 2;
    pill.cornerRadius = 10;
    pill.setPadding(2, 12, 2, 12);
    style(pill.addText(v.txt), Font.heavySystemFont(24), new Color(hex));
  });
  w.addSpacer(11);

  const info = (lbl, val, valColor) => {
    centred(r => {
      style(r.addText(lbl + " "), Font.mediumSystemFont(12), muted);
      style(r.addText(val), Font.semiboldSystemFont(13), valColor || Color.white());
    });
    w.addSpacer(2);
  };
  if (v.best) {
    const end = new Date((v.best.end.t + 3600) * 1000);
    info(v.cls === "partial" ? "Go" : "Best", `${fmt(v.best.start.d, "HH:mm")}–${fmt(end, "HH:mm")} (${v.best.hrs} h)`);
  }
  if (v.wet && v.wet.length) {
    const peak = Math.round(Math.max(...v.wet.map(popOf)));
    info("Rain", `from ${fmt(v.wet[0].d, "HH:mm")} · up to ${peak}%`, new Color("#4d9dff"));
  }
  info("Dark", darkLabel);
  info(moon.emoji, `${moon.name} ${moon.pct}%`);

  if (family !== "small" && hours.length) {
    w.addSpacer(6);
    centred(row => {
      hours.slice(0, 9).forEach((h, i) => {
        if (i) row.addSpacer(8);
        const c = row.addStack();
        c.layoutVertically();
        style(c.addText(fmt(h.d, "HH")), Font.systemFont(9), muted);
        const cl = isNum(h.cloud) ? Math.round(h.cloud) + "%" : "–";
        style(c.addText(cl), Font.boldSystemFont(11), new Color(RATE_COLOR[h.rating.k] || COLORS.day));
      });
    });
  }
  return w;
}

/* ---------- run ---------- */
const now = new Date();
let widget, stage = "location";
try {
  const loc = await getLocation();
  stage = "astronomy";
  const A = await loadAstronomy();
  const AS = makeAstro(A);
  const obs = new A.Observer(+loc.latitude, +loc.longitude, 0);
  stage = "forecast";
  const src = await fetchAll(loc.latitude, loc.longitude);
  stage = "tonight";

  // Tonight, exactly as the app picks it.
  const win = AS.nightWindow(obs, now, true);
  const mid = new Date((win.set.getTime() + win.rise.getTime()) / 2);
  const illum = A.Illumination("Moon", mid).phase_fraction;
  const angle = A.MoonPhase(mid);
  const moon = { pct: Math.round(illum * 100), name: PHASES[Math.floor(((angle + 22.5) % 360) / 45)], emoji: PHASE_EMOJI[Math.floor(((angle + 22.5) % 360) / 45)] };

  const from = win.set > now ? win.set : now;
  const all = buildHours(from, win.rise, src, obs, illum, AS).filter(h => h.sky !== "day");
  const ds = win.darkStart && win.darkStart.getTime() / 1000, de = win.darkEnd && win.darkEnd.getTime() / 1000;
  const dark = ds && de ? all.filter(h => h.t >= ds && h.t + 3600 <= de) : [];
  const hours = dark.length ? dark : all;

  const darkLabel = win.darkStart && win.darkEnd
    ? `${fmt(win.darkStart, "HH:mm")}–${fmt(win.darkEnd, "HH:mm")}`
    : "No full dark";
  stage = "display";
  widget = buildWidget(verdict(hours), hours, darkLabel, moon, config.widgetFamily || "medium");
} catch (e) {
  widget = new ListWidget();
  widget.backgroundColor = new Color("#0b0f1a");
  widget.url = APP_URL;
  const msg = e && e.message ? e.message : String(e);
  const t = widget.addText(`SkyWatch (${stage}): ${msg}`);
  t.textColor = Color.white();
  t.font = Font.systemFont(11);
}

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
