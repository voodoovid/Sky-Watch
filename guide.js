'use strict';
/* SkyWatch User Guide — opened from the "User Guide" button beside the title in Options.
   Pure text (no data fetched). app.js calls SKY_GUIDE.html() and SKY_GUIDE.go(box, id). */
window.SKY_GUIDE = (() => {
  const SECTIONS = [
    ['g-start', 'Quick start'],
    ['g-screen', 'The screen'],
    ['g-header', 'Top bar'],
    ['g-verdict', 'Go / No Go'],
    ['g-hours', 'Dark hours'],
    ['g-moon', 'Moon'],
    ['g-tm', 'Time Machine'],
    ['g-targets', 'Targets'],
    ['g-popup', 'Target pop-up'],
    ['g-options', 'Options'],
    ['g-red', 'Red mode'],
    ['g-loc', 'Locations'],
    ['g-data', 'Data & accuracy'],
    ['g-tips', 'Imaging tips'],
    ['g-help', 'Troubleshooting'],
    ['g-gloss', 'Glossary'],
  ];

  const sec = (id, title, body) => `<section class="g-sec" id="${id}">
    <div class="g-sh"><h3>${title}</h3><button type="button" class="g-top" data-g="top" aria-label="Back to contents">↑ Contents</button></div>${body}</section>`;
  const badge = (cls, t) => `<span class="gb ${cls}">${t}</span>`;

  const html = () => `<div class="guide">
  <p class="g-lead">SkyWatch – Go / No Go tells you, in one glance, whether tonight is worth setting up your Seestar S50 — and what to point it at. This guide covers every part of the app.</p>
  <nav class="g-toc" aria-label="Guide contents">${SECTIONS.map(([id, t]) => `<button type="button" data-g="${id}">${t}</button>`).join('')}</nav>

  ${sec('g-start', 'Quick start', `
    <ol>
      <li><b>Install it.</b> In Safari, tap Share → <b>Add to Home Screen</b>. SkyWatch then opens full-screen like any app, with its own icon.</li>
      <li><b>Pick a place.</b> Tap the GPS button (target icon) next to the location menu, or tap the magnifier, search for a town, and tap <b>Save spot</b> to keep it.</li>
      <li><b>Read the badge.</b> The big badge in the first card is the answer: GO, PARTIAL GO, MARGINAL or NO GO, with the best time window beside it.</li>
      <li><b>Check the hours.</b> The Dark hours grid shows clouds, rain chance, wind, dew, seeing and transparency hour by hour. Tap any hour to see what each weather source says.</li>
      <li><b>Choose a target.</b> The Top Ten Targets card lists the best objects for the night. Tap one for details, then tap <b>Copy</b> beside its name and paste it into the Seestar app's search.</li>
    </ol>
    <p>Everything refreshes by itself every 30 minutes while the app is open, and again whenever you tap the refresh button.</p>`)}

  ${sec('g-screen', 'The screen at a glance', `
    <p>On larger screens such as an iPad, the page is laid out to fit on one screen. On a phone the cards stack and you scroll down.</p>
    <ul>
      <li><b>Top bar</b> – location, Time Machine, night selector and the Home, Refresh, Options and Red buttons.</li>
      <li><b>Verdict card</b> – the Go / No Go badge, the best window, a summary of the night's conditions, and the key times (full dark, dark ends, sunset, sunrise).</li>
      <li><b>Moon card</b> – phase, rise/set, age and the next full and new Moon.</li>
      <li><b>Dark hours</b> – the hour-by-hour forecast grid.</li>
      <li><b>Moon path</b> – a chart of where the Moon is through the night.</li>
      <li><b>Top Ten Targets</b> – the best objects for the night, with pictures.</li>
      <li><b>Planets</b> and <b>Seestar targets</b> – more things to image, plus a search box.</li>
      <li><b>Footer</b> – <b>Data sources</b> (what is online), when the forecast was last updated, and the app version.</li>
    </ul>`)}

  ${sec('g-header', 'Top bar', `
    <h4>Location</h4>
    <p>The pin menu switches between <b>Current location (GPS)</b> and your saved spots. The <b>GPS</b> button re-reads your position; the <b>magnifier</b> opens a place search. See <i>Locations</i> below.</p>
    <h4>Time Machine</h4>
    <p>The round dial lets you look at the sky later tonight. See <i>Time Machine</i> below.</p>
    <h4>Tonight / Tomorrow / third day</h4>
    <p>Switches the whole page between nights. The third button is named for the weekday (for example “Thu”). <b>Tonight</b> stays the current night until fewer than two hours of darkness remain, then it moves on to the coming evening, so you never look at a night that is almost over.</p>
    <h4>Home</h4>
    <p>Limits targets to the part of the sky you can actually see from your yard (trees, house, hills). You choose those directions in Options. When Home is on, the button is lit and the target lists only count the time an object is in your chosen directions.</p>
    <h4>Refresh</h4>
    <p>Reloads every forecast. If you are on GPS it also re-reads your position.</p>
    <h4>Options (sliders icon)</h4>
    <p>Units, appearance, Home sky directions and minimum elevation. The <b>User Guide</b> button sits beside the title at the top of that window.</p>
    <h4>Red</h4>
    <p>Switches the whole app to dim red on black to protect your night vision. The button then reads <b>Normal</b>; tap it to switch back.</p>`)}

  ${sec('g-verdict', 'Go / No Go: how the verdict works', `
    <p>SkyWatch scores every dark hour from 0 to 100, finds the best stretch of good, dry hours, and turns that into one badge.</p>
    <h4>The badges</h4>
    <ul>
      <li>${badge('go', 'GO')} – a good, dry window of <b>2 hours or more</b>, with no rain and no poor hours anywhere else in the night.</li>
      <li>${badge('partial', 'PARTIAL GO')} – there is a good, dry window of <b>at least 3 hours</b>, but rain or poor hours elsewhere in the night. Image inside the window and be ready to pack up. A note under the window says when rain is expected or when conditions worsen.</li>
      <li>${badge('fair', 'MARGINAL')} – only a short good window, or only fair hours. Possible, but not a solid night.</li>
      <li>${badge('nogo', 'NO GO')} – no usable window.</li>
    </ul>
    <h4>Rain is the deal-breaker</h4>
    <p>Clouds alone do not make a no-go — the Seestar can image through thin cloud and gaps. But rain would damage it. So <b>any chance of rain at all</b> (1% or more) rates that hour NO, and an hour is never part of the go window if rain is possible in it or in the hour right after (so you have time to pack up dry).</p>
    <h4>How each hour is scored</h4>
    <p>An hour starts at 100 and loses points for:</p>
    <ul>
      <li><b>Cloud cover</b> – 0.85 points per percent.</li>
      <li><b>Rain chance</b> – 0.35 points per percent (and the hour is capped at NO if there is any chance).</li>
      <li><b>Wind gusts</b> – over 20 km/h −10, over 30 −25, over 40 −40 (about 12, 19 and 25 mph).</li>
      <li><b>Dew</b> – temperature within 2 °C (about 4 °F) of the dew point: −8.</li>
      <li><b>Poor seeing</b> or <b>poor transparency</b> (grade 6 or worse): −8 each.</li>
      <li><b>Twilight</b> – civil −30, nautical −15, astronomical −5; fully dark costs nothing.</li>
      <li><b>Moonlight</b> – up to −12 while the Moon is above the horizon, in proportion to how full it is.</li>
    </ul>
    <p>A score of 55 or more shows as GO (75+ is a great hour, 55–74 a good one), 35–54 as FAIR, and below 35 as NO. Daylight hours show DAY. Tap an hour to see its exact score.</p>
    <h4>The summary chips</h4>
    <p>Below the badge, small tiles summarise the dark hours ahead. Green means good, plain means so-so, and red or blue means a warning:</p>
    <ul>
      <li><b>Rain risk</b> – the highest rain chance of the night (blue if there is any).</li>
      <li><b>Cloud</b> – average cloud cover. Under 30% is good, over 60% is poor.</li>
      <li><b>Max gusts</b> – strongest gusts. Under 20 km/h is good, over 30 is poor.</li>
      <li><b>Moon up</b> – how full the Moon is while it is up (or “Down” if it never rises in the dark). Under 25% is kind to faint targets; over 50% is not.</li>
      <li><b>Dew gap</b> – the smallest gap between temperature and dew point. Under 2 °C (about 4 °F) turns the tile red and reads <b>Dew · heater on</b>: run the Seestar's dew heater.</li>
      <li><b>Bortle</b> – how light-polluted your location is (1 is pristine, 9 is a city centre), with the sky brightness in sqm. It is for information only and is <b>never part of the Go / No Go score</b>.</li>
      <li><b>Seeing</b> – the best seeing reading of the night, from 7Timer!.</li>
    </ul>
    <h4>Key times</h4>
    <p>The four tiles under the chips: <b>Full dark</b> (astronomical darkness begins), <b>Dark ends</b>, <b>Sunset</b> and <b>Sunrise</b>.</p>`)}

  ${sec('g-hours', 'Dark hours forecast', `
    <p>The grid shows only the hours that are fully inside astronomical darkness (on summer nights that never get fully dark, it keeps the twilight hours so there is still something to read). Each column is one hour; the current hour is marked <b>now</b>.</p>
    <h4>The rows</h4>
    <ul>
      <li><b>Hour</b> – the time, with <i>day</i>, <i>twi</i> or <i>dark</i> underneath.</li>
      <li><b>Rating</b> – GO, FAIR or NO for the hour (the score above).</li>
      <li><b>Precip</b> – chance of rain in that hour, in %. Any chance shows blue, and the blue gets stronger as the odds rise (a brighter blue from 15%, strongest from 30%). Dry hours stay quiet.</li>
      <li><b>Cloud</b> – average cloud cover from every source, in %. On a computer, hover to see the low / mid / high split; the tap-an-hour table below has it on any device.</li>
      <li><b>Sky</b> – a picture of the same information: puffy clouds sized to the cloud cover, with a line for the rain chance.</li>
      <li><b>Temp</b> – temperature.</li>
      <li><b>Dew gap</b> – temperature minus dew point. Highlighted when under 2 °C (about 4 °F), meaning dew is likely on the optics.</li>
      <li><b>Gusts</b> – wind gusts. Highlighted above 30 km/h (19 mph).</li>
      <li><b>Seeing</b> – steadiness of the air: Exc, Good, Avg or Poor. Matters most for planets and small, fine detail.</li>
      <li><b>Transp</b> – transparency: how clear the air is, same four grades. Matters most for faint nebulae and galaxies.</li>
    </ul>
    <h4>Tap an hour for the sources</h4>
    <p>Tapping any hour opens a table with what every weather model said for cloud, rain chance and rain amount, a one-line summary (score, sky state, Moon, wind, humidity, dew warning) and how the score was reached. Use it to see whether the models agree: when they disagree, treat the hour with caution.</p>
    <h4>Where the numbers come from</h4>
    <p><b>Rain chance</b> is pooled from four ensemble forecasts (ICON, GFS, ECMWF, GEM) — the percentage of ensemble runs that put at least 0.1 mm of rain in the hour. If ensembles are unavailable it falls back to the average of the other models' rain probabilities. <b>Cloud</b> is the average of every source that reports it. <b>Seeing</b> and <b>transparency</b> come from 7Timer! in 3-hour steps.</p>`)}

  ${sec('g-moon', 'Moon card and Moon path', `
    <h4>Moon card</h4>
    <p>Shows the Moon's phase and how much of it is lit, whether it is waxing or waning, when it rises and sets around tonight, its age in days, and the dates of the next full and new Moon.</p>
    <h4>Moon path</h4>
    <p>A chart of the Moon's height above the horizon across the night, on the same time axis as the forecast.</p>
    <ul>
      <li>The shading shows twilight stages; the darkest band is full dark.</li>
      <li>Compass letters along the top show which direction the Moon is in at each hour.</li>
      <li>Pills mark when it <b>Rises</b> or <b>Sets</b>, and a Moon icon marks its highest point.</li>
      <li>The dashed line is <b>Now</b> (or the Time Machine time).</li>
      <li>The note in the corner sums it up: for example <i>Down during full dark</i> (ideal for faint objects) or <i>Up all through full dark</i>.</li>
    </ul>
    <p>A bright Moon washes out nebulae and galaxies. Plan faint targets for when the Moon is down or far from the target (each target shows its Moon distance).</p>`)}

  ${sec('g-tm', 'Time Machine', `
    <p>By default SkyWatch judges everything at <b>Now</b>. The Time Machine lets you ask “what will I be able to film at 3:00 AM?” — useful when a target will pass behind the house or the Moon will rise.</p>
    <ul>
      <li><b>Turn the dial</b>: tap the ring to jump, or drag around it. Drag further away from the dial for finer control. It moves in <b>15-minute steps</b>, from the next quarter hour up to 30 minutes before dawn. Arrow keys work too.</li>
      <li><b>Now</b> button: snaps back to the present. It is greyed out when you are already on Now.</li>
      <li>Moving the dial instantly re-picks the <b>Top Ten</b> (icons, order and times), the rest of the <b>top 30</b>, the <b>Moon path</b> “now” line, and the altitude chart if a target pop-up is open.</li>
      <li>Your <b>Home sky</b> directions apply, so what you see is what you can actually film.</li>
      <li>It works on <b>Tonight</b> only (it is greyed out for Tomorrow and the third night) and always starts on Now when you open the app.</li>
    </ul>`)}

  ${sec('g-targets', 'Targets, planets and comets', `
    <h4>Top Ten Targets</h4>
    <p>The best ten objects for the night, shown three at a time — scroll the card to see the rest. Each shows its rank on a picture, its catalogue ID and name, its type, how far the Moon is from it, and when it is usable (“To 3:40 AM” plus the hours it has left). If it has not risen yet, its start time is shown first.</p>
    <h4>Seestar targets (#11–30)</h4>
    <p>The next twenty, starting at #11 so nothing repeats. The right-hand side shows when the target becomes usable (or “To …” if it is up now) and how many hours it has. Nebula types carry an <b>LP filter</b> tag as a reminder to switch the light-pollution filter on.</p>
    <h4>What gets listed</h4>
    <ul>
      <li>The catalogue holds about 200 deep-sky objects — the well-known favourites plus most bright, large NGC, IC and Messier objects — and any bright comets. Tiny objects are left out because they look like dots in a Seestar frame.</li>
      <li>An object must climb above your <b>minimum elevation</b> (40° unless you change it in Options) during full darkness for at least half an hour.</li>
      <li>It is ranked by how long it stays up (up to 6 hours counts) plus how rewarding it is: larger and brighter objects score higher.</li>
      <li><b>Up now wins.</b> Targets that are above your minimum right now with at least 1 hour left come first, then targets that will rise later, then targets that are up but about to set. Finished targets are dropped. Use the Time Machine to see the ranking at another time.</li>
      <li>On Tomorrow and the third night, targets are ranked on quality alone.</li>
    </ul>
    <h4>Search</h4>
    <p>The <b>Search targets</b> box looks through every candidate for the night, including the Top Ten. It ignores capitals, spaces and punctuation, so “m 45”, “M45” and “pleiades” all work, and you can search by type (“galaxy”, “globular”). The corner shows how many were found; tap ✕ to clear.</p>
    <h4>Planets</h4>
    <p>Planets that get above 5° once the sky is reasonably dark, with their brightness (magnitude), when they are best placed, and how high and in which direction. Tap one for details. Planets look small in a Seestar — a bright dot or tiny disc, not a close-up.</p>
    <h4>Comets</h4>
    <p>Comets brighter than about magnitude 11.5 appear in the target lists, tagged <b>Comet</b>, with a predicted brightness. Comet brightness is hard to predict, so treat it as a guide.</p>`)}

  ${sec('g-popup', 'The target pop-up', `
    <p>Tap any target or planet to open its details.</p>
    <ul>
      <li><b>Copy</b> (beside the name) – copies a plain name such as “M45” or “NGC 7000” that pastes straight into the Seestar app's search. The button briefly reads <i>Copied</i> to confirm.</li>
      <li><b>Picture</b> – a sky-survey image with a dashed box showing exactly what the Seestar S50 frame will capture, and a circle showing the size of the full Moon for scale. Planets and some comets show a photo instead.</li>
      <li><b>Time tiles</b> – when it reaches your minimum elevation, the length of the imaging window and when it ends, its peak height and time, and whether it <b>fits the Seestar frame</b> (Yes, Just fits, or Mosaic with the number of panels needed).</li>
      <li><b>Seestar tip</b> – whether to use the LP filter and how long to stack for that type of object.</li>
      <li><b>Altitude tonight</b> – a chart of the target's height through the night against the Moon, your minimum elevation line, the imaging window (green) and full dark. A dashed line marks Now or the Time Machine time.</li>
      <li><b>Facts</b> – size (also in plain terms, in full-Moon widths), magnitude, distance, coordinates and how far the Moon is from it at its peak.</li>
    </ul>
    <p>Tap outside the pop-up or the ✕ to close it.</p>`)}

  ${sec('g-options', 'Options', `
    <p>Tap the sliders icon in the top bar. Changes apply immediately and are remembered on your device.</p>
    <h4>Units</h4>
    <p>Metric (°C · km/h · mm) or imperial (°F · mph · in). This changes temperature, wind and rain amounts everywhere.</p>
    <h4>Appearance</h4>
    <p><b>Auto</b> follows your device's light or dark setting, or choose <b>Light</b> or <b>Dark</b>. Red night mode still overrides this.</p>
    <h4>Home sky</h4>
    <p>The wheel shows the horizon in 16 wedges. Tap a wedge to include or exclude that direction. Green wedges are directions you can see; leave out any direction blocked by trees, buildings or hills. Then switch on the <b>Home</b> button in the top bar and targets only count while they are in a green direction.</p>
    <ul>
      <li><b>All</b> selects the whole sky; <b>Reset (NW → S)</b> goes back to the default view from north-west clockwise through north and east to south.</li>
      <li>The line below the wheel says in words which directions are selected.</li>
      <li>Home belongs to one place: it turns on for the spot where you switched it on. If you move more than about 3 km away it switches itself off, and it comes back on when you return.</li>
    </ul>
    <h4>Min elevation</h4>
    <p>How high an object must be to count — one setting used for targets, planets, comets, charts and labels everywhere. The default is 40°; you can set anything from 0° to 85° with the slider or by typing a number. Lower it for a lot more targets (low objects are murkier and closer to haze); raise it for the cleanest sky. The small button at the right resets it to 40°.</p>`)}

  ${sec('g-red', 'Red night mode', `
    <p>Tap <b>Red</b> in the top bar and the whole app switches to dim reds on black, so checking the forecast does not ruin your dark-adapted eyes (or spoil an exposure). Tap <b>Normal</b> to switch back. The choice is remembered, and the screen never flashes bright when the app opens in red mode.</p>`)}

  ${sec('g-loc', 'Locations', `
    <ul>
      <li><b>GPS</b> – tap the GPS button or choose <i>Current location (GPS)</i> from the menu. Your device will ask permission the first time. SkyWatch asks for an approximate position, which is plenty for weather.</li>
      <li><b>Search</b> – tap the magnifier, type at least two letters, and tap a result.</li>
      <li><b>Save spot</b> – after picking a place, tap <b>Save spot</b> and give it a name (for example “Home” or “Cabin”). It then appears in the menu.</li>
      <li><b>Remove</b> – select a saved spot and tap <b>Remove</b> to delete it.</li>
    </ul>
    <p>The line under the search shows the place name and its coordinates. SkyWatch remembers the last place you used. All times are shown in the local time of the forecast location.</p>`)}

  ${sec('g-data', 'Data sources and accuracy', `
    <p>Tap <b>Data sources</b> in the footer to see which sources answered. Each shows <b>✓ Online</b>, <b>Cached</b> or <b>Unavailable</b>.</p>
    <ul>
      <li><b>Open-Meteo</b> – Best Match, NOAA GFS / HRRR, ECMWF IFS, Environment Canada GEM and DWD ICON, plus the ICON, GFS, ECMWF and GEM ensembles.</li>
      <li><b>MET Norway</b> (yr.no) – a further global model with rain probabilities.</li>
      <li><b>7Timer! ASTRO</b> – seeing and transparency. It is slow and sometimes unavailable; the forecast appears without it and fills in when it arrives. If it was fetched earlier in the same session, that earlier data is shown as <i>Cached</i> until a fresh fetch works.</li>
      <li><b>Astronomy Engine</b> – Sun, Moon, planets and all target positions, computed on your device.</li>
      <li><b>Light Pollution Atlas 2025</b> (D. Lorenz) – the Bortle number.</li>
      <li><b>JPL Horizons</b> orbits for comets; <b>DSS2</b> sky survey and <b>Wikipedia</b> for pictures.</li>
    </ul>
    <p>Weather forecasts get less certain the further ahead they look, so Tomorrow and the third night are best read as a trend. Models can all be wrong together, especially for scattered cloud and passing showers. Use the verdict as a strong guide, and check the sky and the radar before you commit to a long session.</p>
    <p>SkyWatch checks for a newer version of itself every time you open it, and updates automatically.</p>`)}

  ${sec('g-tips', 'Imaging tips for the Seestar S50', `
    <ul>
      <li><b>Nebulae</b> (emission, supernova remnants, planetary, cluster + nebula): turn the <b>LP filter on</b>. Emission nebulae reward long stacks, an hour or two or more; planetary nebulae are small and bright, 20–40 minutes shows good detail.</li>
      <li><b>Galaxies</b>: LP filter <b>off</b>. They need dark skies and little or no Moon; aim for an hour or more.</li>
      <li><b>Globular clusters</b>: LP filter off. Bright and compact; 15–30 minutes resolves the stars nicely.</li>
      <li><b>Reflection nebulae</b>: LP filter off — they are blue broadband light and very Moon-sensitive.</li>
      <li><b>Comets</b>: 15–30 minute sessions keep the head sharp because comets drift against the stars. LP filter off.</li>
      <li><b>Planets</b> are tiny at the S50's focal length; shoot when they are highest.</li>
      <li><b>Dew</b>: when the Dew gap tile turns red, run the dew heater.</li>
      <li><b>Wind</b>: strong gusts shake the mount. The app flags gusts above 30 km/h (19 mph).</li>
      <li><b>Frame</b>: the S50 sees 1.28° × 0.72° (77′ × 43′). Targets larger than that need a mosaic, which the pop-up tells you.</li>
    </ul>`)}

  ${sec('g-help', 'Troubleshooting', `
    <h4>“Could not reach any weather service”</h4>
    <p>Check your connection and tap the refresh button.</p>
    <h4>Seeing and Transp show “–”, or Data sources shows 7Timer! unavailable</h4>
    <p>7Timer! is slow and sometimes down. The verdict still works without it. Tap Refresh to try again.</p>
    <h4>The Bortle tile shows “–” or “…”</h4>
    <p>“…” means it is still loading. “–” means it could not be fetched (offline) or your location is outside the atlas coverage.</p>
    <h4>The Time Machine is greyed out</h4>
    <p>It only works on Tonight, and only while there is dark time left before dawn.</p>
    <h4>A target I expected is missing</h4>
    <p>It may be below your minimum elevation, outside your Home sky directions, already in the Top Ten (the Seestar list starts at #11), or finished for the night. Use the search box to find it directly.</p>
    <h4>Home turned itself off</h4>
    <p>Home is tied to the place where you switched it on. If you are more than about 3 km away it turns off; it returns when you are back.</p>
    <h4>Location is blocked</h4>
    <p>Allow location for Safari / the app in your device settings, or search for a place instead.</p>
    <h4>I cannot select or copy text</h4>
    <p>That is deliberate, so a stray touch never highlights text on the screen. Use the <b>Copy</b> button in a target's pop-up.</p>
    <h4>The app looks out of date</h4>
    <p>Close it and reopen it. It checks for a new version each time it opens and reloads once if there is one.</p>`)}

  ${sec('g-gloss', 'Glossary', `
    <dl class="g-dl">
      <dt>Astronomical darkness</dt><dd>When the Sun is more than 18° below the horizon. The sky is as dark as it gets; this is when faint targets are worth imaging. “Full dark” in the app.</dd>
      <dt>Twilight</dt><dd>Civil (Sun 0–6° down), nautical (6–12°) and astronomical (12–18°) — the sky is progressively darker.</dd>
      <dt>Elevation / altitude</dt><dd>How high something is above the horizon, in degrees (0° is the horizon, 90° is straight up).</dd>
      <dt>Azimuth / direction</dt><dd>Compass direction: N, NE, E, SE, S, SW, W, NW.</dd>
      <dt>Magnitude</dt><dd>Brightness on a backwards scale: the lower the number (negative is very bright), the brighter the object.</dd>
      <dt>Bortle</dt><dd>A 1–9 scale of how light-polluted the sky is; 1 is a pristine dark site and 9 is an inner city. SkyWatch estimates it from the sky's brightness in <b>sqm</b> (magnitudes per square arcsecond; higher is darker).</dd>
      <dt>Seeing</dt><dd>How steady the air is. Good seeing means sharp stars and planets. The grades run Excellent, Good, Average, Poor.</dd>
      <dt>Transparency</dt><dd>How clear the air is. High transparency means faint objects show up well.</dd>
      <dt>Dew gap</dt><dd>Air temperature minus dew point. When it falls below about 2 °C (4 °F), dew is likely to form on cold surfaces such as the lens.</dd>
      <dt>Ensemble</dt><dd>A weather forecast run many times with tiny changes. The share of runs that show rain is a genuine rain chance.</dd>
      <dt>LP filter</dt><dd>The Seestar's light-pollution filter. Helps with emission nebulae; hurts broadband targets like galaxies and clusters.</dd>
      <dt>Moon separation</dt><dd>How far, in degrees, the Moon is from the target. The farther, the less moonlight washes it out.</dd>
      <dt>Imaging window</dt><dd>The stretch of the night when a target is above your minimum elevation, in full darkness, and in your Home sky if that is on.</dd>
      <dt>Mosaic</dt><dd>Several overlapping frames stitched together to cover an object bigger than one Seestar frame.</dd>
    </dl>`)}
  <p class="fine g-end">SkyWatch – Go / No Go. Data from Open-Meteo, MET Norway and 7Timer!; astronomy by Astronomy Engine; light pollution by D. Lorenz.</p>
  </div>`;

  /* Scroll the open sheet to a section (or back to the contents). */
  const go = (body, id) => {
    const el = id === 'top' ? body.querySelector('.g-toc') : body.querySelector('#' + id);
    if (!el) return;
    const y = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - (id === 'top' ? 56 : 6);
    try { body.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); } catch (e) { body.scrollTop = Math.max(0, y); }
  };
  return { html, go };
})();
