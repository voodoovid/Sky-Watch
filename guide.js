'use strict';
/* SkyWatch User Guide — opened from the "User Guide" button beside the title in Options.
   Pure text and drawings (nothing is fetched). app.js calls:
     SKY_GUIDE.html(version)  -> markup for the pop-up body
     SKY_GUIDE.wire(body)     -> contents links + "where am I" tracking */
window.SKY_GUIDE = (() => {
  const CHAPTERS = [
    ['g-start', 'Quick start'],
    ['g-around', 'Finding your way around'],
    ['g-verdict', 'The Go / No Go verdict'],
    ['g-hours', 'The dark-hours forecast'],
    ['g-moon', 'The Moon'],
    ['g-tm', 'Time Machine'],
    ['g-targets', 'Targets, planets and comets'],
    ['g-popup', 'The target pop-up'],
    ['g-options', 'Options and red mode'],
    ['g-loc', 'Locations'],
    ['g-data', 'Data and accuracy'],
    ['g-tips', 'Imaging tips'],
    ['g-help', 'Troubleshooting'],
    ['g-gloss', 'Glossary'],
  ];

  const chapter = (id, body) => {
    const i = CHAPTERS.findIndex((c) => c[0] === id);
    return `<section class="g-ch" id="${id}" data-title="${CHAPTERS[i][1]}" data-n="${i + 1}">
      <header class="g-chh"><span class="g-num" aria-hidden="true">${i + 1}</span><h3>${CHAPTERS[i][1]}</h3></header>${body}</section>`;
  };
  const co = (kind, label, text) => `<aside class="co co-${kind}"><b>${label}</b><p>${text}</p></aside>`;
  const badge = (cls, t) => `<span class="gb ${cls}">${t}</span>`;
  const ts = (q, a) => `<details class="ts"><summary>${q}</summary><div class="ts-a">${a}</div></details>`;

  /* The one-screen layout (iPad landscape), drawn from the app's own grid. Numbers match the legend below it. */
  const MK = (n, x, y) => `<g class="d-mk" transform="translate(${x} ${y})"><circle r="9.5"/><text y="4.2" text-anchor="middle">${n}</text></g>`;
  const diagram = () => `<figure class="g-fig">
    <svg viewBox="-8 -12 436 268" role="img" aria-label="Map of the SkyWatch screen with nine numbered areas, explained in the list below">
      <rect class="d-box" x="0" y="0" width="112" height="26" rx="6"/><rect class="d-ln" x="22" y="9" width="62" height="8" rx="4"/>
      <rect class="d-box" x="146" y="0" width="128" height="26" rx="6"/><circle class="d-ln2" cx="166" cy="13" r="7"/><rect class="d-ln" x="182" y="9" width="40" height="8" rx="4"/>
      <rect class="d-box" x="294" y="0" width="126" height="26" rx="6"/><rect class="d-pill" x="302" y="6" width="44" height="14" rx="7"/><rect class="d-ln" x="352" y="9" width="62" height="8" rx="4"/>
      <rect class="d-box" x="0" y="34" width="88" height="142" rx="7"/><rect class="d-go" x="10" y="46" width="40" height="24" rx="6"/><rect class="d-ln" x="10" y="80" width="66" height="6" rx="3"/><rect class="d-ln" x="10" y="94" width="50" height="6" rx="3"/><rect class="d-ln2" x="10" y="112" width="30" height="22" rx="4"/><rect class="d-ln2" x="46" y="112" width="30" height="22" rx="4"/><rect class="d-ln2" x="10" y="140" width="30" height="22" rx="4"/><rect class="d-ln2" x="46" y="140" width="30" height="22" rx="4"/>
      <rect class="d-box" x="0" y="184" width="88" height="68" rx="7"/><circle class="d-moon" cx="26" cy="218" r="14"/><rect class="d-ln" x="48" y="206" width="30" height="6" rx="3"/><rect class="d-ln" x="48" y="220" width="24" height="6" rx="3"/>
      <rect class="d-box" x="94" y="34" width="210" height="64" rx="7"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect class="d-cell${i === 3 || i === 4 ? ' d-cellw' : ''}" x="${104 + i * 24}" y="${50 + (i % 2) * 0}" width="20" height="38" rx="3"/>`).join('')}
      <rect class="d-box" x="94" y="104" width="102" height="148" rx="7"/><path class="d-arc" d="M104 220 C128 120 168 120 188 220"/><rect class="d-ln" x="104" y="232" width="84" height="5" rx="2.5"/>
      <rect class="d-box" x="202" y="104" width="102" height="148" rx="7"/>${[0, 1, 2].map((i) => `<rect class="d-th" x="210" y="${114 + i * 44}" width="30" height="34" rx="4"/><rect class="d-ln" x="246" y="${122 + i * 44}" width="48" height="6" rx="3"/><rect class="d-ln" x="246" y="${136 + i * 44}" width="36" height="5" rx="2.5"/>`).join('')}
      <rect class="d-box" x="310" y="34" width="110" height="218" rx="7"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect class="d-ln" x="320" y="${46 + i * 28}" width="${i < 2 ? 60 : 74}" height="6" rx="3"/><rect class="d-ln2" x="320" y="${58 + i * 28}" width="${i < 2 ? 40 : 52}" height="5" rx="2.5"/>`).join('')}
      ${MK(1, 6, 4)}${MK(2, 150, 4)}${MK(3, 298, 4)}${MK(4, 8, 40)}${MK(5, 100, 40)}${MK(6, 100, 110)}${MK(7, 208, 110)}${MK(8, 316, 40)}${MK(9, 8, 190)}
    </svg>
    <ol class="g-key">
      <li><b>Location</b> menu, GPS and place search</li>
      <li><b>Time Machine</b> dial</li>
      <li><b>Night</b> choice and the Home, Refresh, Options and Red buttons</li>
      <li><b>Verdict</b> badge, best window and night summary</li>
      <li><b>Dark hours</b> hour-by-hour forecast</li>
      <li><b>Moon path</b> chart</li>
      <li><b>Top Ten Targets</b></li>
      <li><b>Planets</b>, <b>Comets</b> and <b>Seestar targets</b>, with search</li>
      <li><b>Moon</b> phase card</li>
    </ol>
    <figcaption>Layout on a large screen such as an iPad in landscape. On a phone the same areas stack in one column, and you scroll.</figcaption>
  </figure>`;

  const html = (ver) => `<div class="guide">
  <header class="g-cover">
    <img class="g-logo" src="icon.svg" alt="" width="64" height="64">
    <div class="g-cover-t">
      <h2>SkyWatch – Go / No Go</h2>
      <p class="g-sub">User guide for the Seestar S50</p>
    </div>
    <p class="g-cover-p">One look tells you whether tonight is worth setting up the telescope, when the best window is, and what to point it at.</p>
    <div class="g-badges" role="img" aria-label="The four verdicts: Go, Partial Go, Marginal, No Go">${badge('go', 'GO')}${badge('partial', 'PARTIAL GO')}${badge('fair', 'MARGINAL')}${badge('nogo', 'NO GO')}</div>
    <p class="g-ver">Version ${ver || ''}</p>
  </header>

  <div class="g-bar" id="gBar"><span class="g-bar-t" id="gBarT">Quick start</span><button type="button" class="g-bar-b" data-g="g-nav">Contents</button></div>

  <div class="g-wrap">
    <nav class="g-nav" id="g-nav" aria-label="Guide contents">
      <p class="g-nav-h">Contents</p>
      <ol>${CHAPTERS.map(([id, t], i) => `<li><button type="button" data-g="${id}" data-nav="${id}"><span>${i + 1}</span>${t}</button></li>`).join('')}</ol>
    </nav>

    <div class="g-main">

  ${chapter('g-start', `
    <p>Five steps from a fresh install to your first target.</p>
    <ol class="g-steps">
      <li><b>Install it.</b> In Safari, tap Share, then <b>Add to Home Screen</b>. SkyWatch then opens full-screen like any other app, with its own icon.</li>
      <li><b>Pick a place.</b> Tap the GPS button next to the location menu, or tap the magnifier, search for a town, and tap <b>Save spot</b> to keep it.</li>
      <li><b>Read the badge.</b> The big badge in the first card is the answer: GO, PARTIAL GO, MARGINAL or NO GO, with the best time window beside it.</li>
      <li><b>Check the hours.</b> The dark-hours grid shows clouds, rain chance, wind, dew, seeing and transparency for every hour. Tap an hour to see what each weather source says.</li>
      <li><b>Choose a target.</b> Top Ten Targets lists the best objects for the night. Tap one, tap <b>Copy</b> beside its name, and paste it into the Seestar app's search.</li>
    </ol>
    <p>The forecast refreshes by itself every 30 minutes while the app is open, and whenever you tap the refresh button.</p>`)}

  ${chapter('g-around', `
    ${diagram()}
    <h4>The top bar</h4>
    <dl class="g-def">
      <dt>Location</dt><dd>The pin menu switches between <b>Current location (GPS)</b> and your saved spots. The <b>GPS</b> button re-reads your position and the <b>magnifier</b> opens place search. See chapter 10.</dd>
      <dt>Time Machine</dt><dd>The round dial shows the sky at a later time tonight. See chapter 6.</dd>
      <dt>Night</dt><dd>Switches the whole page between tonight, tomorrow night and the night after (named by weekday, such as “Thu”). <b>Tonight</b> stays the current night until fewer than two hours of darkness remain, then moves on to the coming evening, so you never look at a night that is nearly over.</dd>
      <dt>Home</dt><dd>Counts a target only while it is in the part of the sky you can see from your yard. You choose those directions in Options. When Home is on, the button is lit.</dd>
      <dt>Refresh</dt><dd>Reloads every forecast. On GPS it also re-reads your position.</dd>
      <dt>Options</dt><dd>Units, appearance, Home sky and minimum elevation. This guide opens from the <b>User Guide</b> button beside its title.</dd>
      <dt>Red</dt><dd>Switches the whole app to dim red on black to protect your night vision. The button then reads <b>Normal</b>.</dd>
    </dl>
    <h4>The footer</h4>
    <p><b>Data sources</b> shows which weather services answered. Beside it are the time of the last update and the app version.</p>`)}

  ${chapter('g-verdict', `
    <p>SkyWatch scores every dark hour from 0 to 100, finds the best run of good, dry hours, and turns that into one badge.</p>
    <table class="g-tbl g-tbl-v">
      <thead><tr><th scope="col">Badge</th><th scope="col">What it means</th></tr></thead>
      <tbody>
        <tr><td>${badge('go', 'GO')}</td><td>A good, dry window of <b>2 hours or more</b>, and no rain or poor hours anywhere else in the night.</td></tr>
        <tr><td>${badge('partial', 'PARTIAL GO')}</td><td>A good, dry window of <b>at least 3 hours</b>, but rain or poor hours elsewhere in the night. Image inside the window and be ready to pack up. A note under the window says when rain is expected or when conditions worsen.</td></tr>
        <tr><td>${badge('fair', 'MARGINAL')}</td><td>Only a short good window, or only fair hours. Possible, but not a solid night.</td></tr>
        <tr><td>${badge('nogo', 'NO GO')}</td><td>No usable window.</td></tr>
      </tbody>
    </table>
    ${co('imp', 'Any chance of rain counts', 'Clouds alone do not make a no-go, because the Seestar can image through thin cloud and gaps. Rain is different, because it can damage the telescope. Any rain chance at all (1% or more) rates that hour NO. An hour is also left out of the go window if rain is possible in the hour after it, so you have time to pack up dry.')}
    <h4>How each hour is scored</h4>
    <p>An hour starts at 100 and loses points for each of these.</p>
    <table class="g-tbl">
      <thead><tr><th scope="col">Factor</th><th scope="col">Points lost</th></tr></thead>
      <tbody>
        <tr><td>Cloud cover</td><td>0.85 per percent</td></tr>
        <tr><td>Rain chance</td><td>0.35 per percent (and the hour is capped at NO if there is any chance)</td></tr>
        <tr><td>Wind gusts</td><td>10 over 20 km/h, 25 over 30, 40 over 40 (about 12, 19 and 25 mph)</td></tr>
        <tr><td>Dew</td><td>8 when the temperature is within 2 °C (about 4 °F) of the dew point</td></tr>
        <tr><td>Poor seeing or transparency</td><td>8 each, at grade 6 or worse</td></tr>
        <tr><td>Twilight</td><td>30 civil, 15 nautical, 5 astronomical, none when fully dark</td></tr>
        <tr><td>Moonlight</td><td>Up to 12 while the Moon is up, in proportion to how full it is</td></tr>
      </tbody>
    </table>
    <table class="g-tbl g-tbl-s">
      <thead><tr><th scope="col">Score</th><th scope="col">Shown as</th></tr></thead>
      <tbody>
        <tr><td>75 and above</td><td>GO (a great hour)</td></tr>
        <tr><td>55 to 74</td><td>GO (a good hour)</td></tr>
        <tr><td>35 to 54</td><td>FAIR</td></tr>
        <tr><td>Below 35</td><td>NO</td></tr>
      </tbody>
    </table>
    <p>Daylight hours show DAY. Tap an hour in the grid to see its exact score.</p>
    <h4>The summary tiles</h4>
    <p>Under the badge, tiles summarise the dark hours ahead. Green is good, plain is so-so, red or blue is a warning.</p>
    <table class="g-tbl">
      <thead><tr><th scope="col">Tile</th><th scope="col">What it shows</th></tr></thead>
      <tbody>
        <tr><td>Rain risk</td><td>The highest rain chance of the night. Blue if there is any.</td></tr>
        <tr><td>Cloud</td><td>Average cloud cover. Under 30% is good, over 60% is poor.</td></tr>
        <tr><td>Max gusts</td><td>The strongest gusts. Under 20 km/h is good, over 30 is poor.</td></tr>
        <tr><td>Moon up</td><td>How full the Moon is while it is up, or “Down” if it stays below the horizon in the dark. Under 25% is kind to faint targets, over 50% is not.</td></tr>
        <tr><td>Dew gap</td><td>The smallest gap between temperature and dew point. Under 2 °C (about 4 °F) turns the tile red and reads <b>Dew · heater on</b>.</td></tr>
        <tr><td>Bortle</td><td>How light-polluted your location is, from 1 (pristine) to 9 (city centre), with the sky brightness in sqm.</td></tr>
        <tr><td>Seeing</td><td>The best seeing reading of the night, from 7Timer!.</td></tr>
      </tbody>
    </table>
    ${co('note', 'Bortle is for information only', 'It is never part of the Go / No Go score. A bright sky changes what you can image, not whether the weather allows it.')}
    <p>The four tiles at the bottom of the card give the key times: <b>Full dark</b> (astronomical darkness begins), <b>Dark ends</b>, <b>Sunset</b> and <b>Sunrise</b>.</p>`)}

  ${chapter('g-hours', `
    <p>The grid shows only the hours that are fully inside astronomical darkness. On summer nights that never get fully dark it keeps the twilight hours, so there is still something to read. Each column is one hour, and the current hour is marked <b>now</b>.</p>
    <table class="g-tbl">
      <thead><tr><th scope="col">Row</th><th scope="col">What it shows</th></tr></thead>
      <tbody>
        <tr><td>Hour</td><td>The time, with <i>day</i>, <i>twi</i> or <i>dark</i> underneath.</td></tr>
        <tr><td>Rating</td><td>GO, FAIR or NO for the hour (the score from chapter 3).</td></tr>
        <tr><td>Precip</td><td>Chance of rain in that hour. Any chance shows blue, and the blue deepens as the odds rise (stronger from 15%, strongest from 30%). Dry hours stay quiet.</td></tr>
        <tr><td>Cloud</td><td>Average cloud cover from every source. On a computer, hover to see the low, mid and high split.</td></tr>
        <tr><td>Sky</td><td>A picture of the same data: clouds sized to the cloud cover, and a line for the rain chance.</td></tr>
        <tr><td>Temp</td><td>Temperature.</td></tr>
        <tr><td>Dew gap</td><td>Temperature minus dew point. Highlighted under 2 °C (about 4 °F), meaning dew is likely on the optics.</td></tr>
        <tr><td>Gusts</td><td>Wind gusts. Highlighted above 30 km/h (19 mph).</td></tr>
        <tr><td>Seeing</td><td>How steady the air is: Exc, Good, Avg or Poor. It matters most for planets and fine detail.</td></tr>
        <tr><td>Transp</td><td>Transparency, how clear the air is, on the same four grades. It matters most for faint nebulae and galaxies.</td></tr>
      </tbody>
    </table>
    <h4>Tap an hour for its sources</h4>
    <p>Tapping any hour opens a table of what every weather model said for cloud, rain chance and rain amount, with a one-line summary and how the score was reached. When the models disagree, treat that hour with caution.</p>
    <h4>Where the numbers come from</h4>
    <p><b>Rain chance</b> is pooled from four ensemble forecasts (ICON, GFS, ECMWF and GEM): the share of ensemble runs that put at least 0.1 mm of rain in the hour. If ensembles are unavailable, it falls back to the average of the other models' rain probabilities. <b>Cloud</b> is the average of every source that reports it. <b>Seeing</b> and <b>transparency</b> come from 7Timer! in 3-hour steps.</p>`)}

  ${chapter('g-moon', `
    <h4>The Moon card</h4>
    <p>Shows the phase and how much of the Moon is lit, whether it is waxing or waning, when it rises and sets around tonight, its age in days, and the dates of the next full and new Moon.</p>
    <h4>The Moon path</h4>
    <p>A chart of the Moon's height above the horizon through the night, on the same time axis as the forecast.</p>
    <ul>
      <li>The shading shows the twilight stages. The darkest band is full dark.</li>
      <li>Compass letters along the top show which direction the Moon is in at each hour.</li>
      <li>Pills mark when it <b>rises</b> or <b>sets</b>, and a Moon icon marks its highest point.</li>
      <li>The dashed line is <b>Now</b>, or the Time Machine time.</li>
      <li>The note in the corner sums it up, for example <i>Down during full dark</i> or <i>Up all through full dark</i>.</li>
    </ul>
    ${co('tip', 'Plan faint targets around the Moon', 'A bright Moon washes out nebulae and galaxies. Choose them for when the Moon is down or far from the target. Every target shows its Moon distance.')}`)}

  ${chapter('g-tm', `
    <p>SkyWatch normally judges everything at <b>Now</b>. The Time Machine answers “what can I film at 3:00 AM?”, which helps when a target will pass behind the house or the Moon is about to rise.</p>
    <ul>
      <li><b>Turn the dial.</b> Tap the ring to jump, or drag around it. Drag further from the dial for finer control. It moves in <b>15-minute steps</b>, from the next quarter hour to 30 minutes before dawn. The arrow keys work too.</li>
      <li><b>Now</b> returns to the present. It is greyed out when you are already on Now.</li>
      <li>Moving the dial re-picks the <b>Top Ten</b>, the rest of the top 30, the Moon path's “now” line, and the altitude chart if a target pop-up is open.</li>
      <li>Your <b>Home sky</b> directions apply, so you see what you can really film.</li>
      <li>It works on <b>Tonight</b> only, and it always starts on Now when you open the app.</li>
    </ul>`)}

  ${chapter('g-targets', `
    <h4>Top Ten Targets</h4>
    <p>The best ten objects for the night, three in view at a time (scroll the card for the rest). Each shows its rank on a picture, its catalogue ID and name, its type, how far the Moon is from it, and when it is usable, such as “To 3:40 AM” and the hours it has left. If it has not risen yet, its start time comes first.</p>
    <h4>Seestar targets</h4>
    <p>The next twenty, starting at #11 so nothing repeats. The right-hand side shows when the target becomes usable (or “To …” if it is up now) and how many hours it has. Nebula types carry an <b>LP filter</b> note as a reminder to switch the light-pollution filter on.</p>
    <h4>What makes the list</h4>
    <ul>
      <li>The catalogue holds about 200 deep-sky objects: the well-known favourites plus most bright, large NGC, IC and Messier objects, and any bright comets. Tiny objects are left out because they look like dots in a Seestar frame.</li>
      <li>An object must climb above your <b>minimum elevation</b> (40° unless you change it) in full darkness for at least half an hour.</li>
      <li>It is ranked by how long it stays up (up to 6 hours counts) plus how rewarding it is. Larger and brighter objects score higher.</li>
      <li><b>Up now wins.</b> Targets above your minimum right now with at least 1 hour left come first, then targets that rise later, then targets that are up but about to set. Finished targets are dropped. Use the Time Machine to see the ranking at another time.</li>
      <li>On tomorrow and the night after, targets are ranked on quality alone.</li>
    </ul>
    <h4>Search</h4>
    <p>The search box looks through every candidate for the night, including the Top Ten. It ignores capitals, spaces and punctuation, so “m 45”, “M45” and “pleiades” all work, and you can search by type, such as “galaxy” or “globular”. The corner shows how many were found. Tap ✕ to clear.</p>
    <h4>Planets</h4>
    <p>Planets that rise above 5° once the sky is reasonably dark, with their brightness, when they are best placed, and how high and in which direction. Tap one for details. Planets look small in a Seestar: a bright dot or tiny disc, not a close-up.</p>
    <h4>Comets</h4>
    <p>The <b>Comets</b> list under Planets shows every comet SkyWatch tracks that climbs above your minimum elevation (set in Options) during full dark hours, however faint, brightest first. Each row gives the predicted magnitude and when it is best placed. Tap one for details. A comet that only your Home sky blocks stays in the list, greyed out. If none qualifies, the list says so.</p>
    <p>Comets brighter than about magnitude 11.5 also join the Top Ten and Seestar target lists, tagged <b>Comet</b>, and can rank first. Comet brightness is hard to predict, so treat it as a guide. SkyWatch tracks a built-in set of comets, so a newly discovered one will not appear until it is added.</p>`)}

  ${chapter('g-popup', `
    <p>Tap any target or planet to open its details.</p>
    <dl class="g-def">
      <dt>Copy</dt><dd>Beside the name. Copies a plain name such as “M45” or “NGC 7000” that pastes straight into the Seestar app's search. The button briefly reads <i>Copied</i>.</dd>
      <dt>Picture</dt><dd>A sky-survey image with a dashed box showing exactly what the S50 frame will capture, and a circle showing the full Moon at the same scale. Planets and some comets show a photo instead.</dd>
      <dt>Time tiles</dt><dd>When it reaches your minimum elevation, the length of the imaging window and when it ends, its peak height and time, and whether it <b>fits the Seestar frame</b> (Yes, Just fits, or Mosaic with the number of panels needed).</dd>
      <dt>Seestar tip</dt><dd>Whether to use the LP filter, and how long to stack for that type of object.</dd>
      <dt>Altitude tonight</dt><dd>A chart of the target's height through the night against the Moon, your minimum elevation line, the imaging window (green) and full dark. A dashed line marks Now or the Time Machine time.</dd>
      <dt>Facts</dt><dd>Size (also in full-Moon widths), magnitude, distance, coordinates, and how far the Moon is at the target's peak.</dd>
    </dl>
    <p>Tap outside the pop-up, or the ✕, to close it.</p>`)}

  ${chapter('g-options', `
    <p>Tap the sliders icon in the top bar. Changes apply immediately and are remembered on your device.</p>
    <h4>Units</h4>
    <p>Metric (°C · km/h · mm) or imperial (°F · mph · in). This changes temperature, wind and rain amounts everywhere.</p>
    <h4>Appearance</h4>
    <p><b>Auto</b> follows your device's light or dark setting. Choose <b>Light</b> or <b>Dark</b> to override it. Red night mode still overrides this.</p>
    <h4>Home sky</h4>
    <p>The wheel shows your horizon in 16 wedges. Tap a wedge to include or exclude that direction. Green wedges are directions you can see, so leave out any direction blocked by trees, buildings or hills. Then switch on <b>Home</b> in the top bar and targets count only while they are in a green direction.</p>
    <ul>
      <li><b>All</b> selects the whole sky. <b>Reset (NW → S)</b> returns to the default view, from north-west clockwise through north and east to south.</li>
      <li>The line below the wheel says in words which directions are selected.</li>
      <li>Home belongs to one place. It turns on for the spot where you switched it on, switches itself off if you move more than about 3 km away, and comes back on when you return.</li>
    </ul>
    <h4>Min elevation</h4>
    <p>How high an object must be to count. One setting is used for targets, planets, comets, charts and labels everywhere. The default is 40°, and you can set anything from 0° to 85° with the slider or by typing a number. Lower it for many more targets, though low objects are murkier. Raise it for the cleanest sky. The button at the right resets it to 40°.</p>
    <h4>Red night mode</h4>
    <p>Tap <b>Red</b> in the top bar and the whole app switches to dim reds on black, so checking the forecast does not ruin your dark-adapted eyes. Tap <b>Normal</b> to switch back. The choice is remembered, and the screen never flashes bright when the app opens in red mode.</p>`)}

  ${chapter('g-loc', `
    <dl class="g-def">
      <dt>GPS</dt><dd>Tap the GPS button, or choose <i>Current location (GPS)</i> from the menu. Your device asks permission the first time. SkyWatch requests an approximate position, which is plenty for weather.</dd>
      <dt>Search</dt><dd>Tap the magnifier, type at least two letters, and tap a result.</dd>
      <dt>Save spot</dt><dd>After picking a place, tap <b>Save spot</b> and give it a name, such as “Home” or “Cabin”. It then appears in the menu on that device.</dd>
      <dt>Remove</dt><dd>Select a saved spot and tap <b>Remove</b> to delete it.</dd>
    </dl>
    <p>The line under the search shows the place name and its coordinates. SkyWatch remembers the last place you used, and all times are in the local time of the forecast location.</p>
    ${co('tip', 'Using a desktop computer', 'GPS on a desktop reports where that computer is, such as your office. To check your home sky from there, search for your home town and tap <b>Save spot</b> instead.')}
    ${co('imp', 'If GPS says “Location blocked”', 'Two settings must both allow location, and the message appears if either is off. On a Mac: (1) System Settings, Privacy &amp; Security, Location Services. Turn the main switch on, then turn on <b>Safari Websites</b>. (2) In Safari, choose Safari, Settings, Websites, Location, set this site to <b>Allow</b>, then close the tab and reopen the site. On an iPad or iPhone: Settings, Privacy &amp; Security, Location Services, Safari Websites, then choose <b>While Using the App</b>. Searching for a place always works without any of this.')}`)}

  ${chapter('g-data', `
    <p>Tap <b>Data sources</b> in the footer to see which services answered. Each shows <b>Online</b>, <b>Cached</b> or <b>Unavailable</b>.</p>
    <table class="g-tbl">
      <thead><tr><th scope="col">Source</th><th scope="col">Used for</th></tr></thead>
      <tbody>
        <tr><td>Open-Meteo</td><td>Best Match, NOAA GFS / HRRR, ECMWF IFS, Environment Canada GEM and DWD ICON forecasts, plus the ICON, GFS, ECMWF and GEM ensembles.</td></tr>
        <tr><td>MET Norway (yr.no)</td><td>A further global model, including rain probabilities.</td></tr>
        <tr><td>7Timer! ASTRO</td><td>Seeing and transparency. It is slow and sometimes down. The forecast appears without it and fills in when it arrives. Data fetched earlier in the same session shows as <i>Cached</i> until a fresh fetch works.</td></tr>
        <tr><td>Astronomy Engine</td><td>Sun, Moon, planets and every target position, computed on your device.</td></tr>
        <tr><td>Light Pollution Atlas 2025</td><td>The Bortle number (D. Lorenz).</td></tr>
        <tr><td>JPL Horizons, DSS2, Wikipedia</td><td>Comet orbits, sky-survey pictures and planet photos.</td></tr>
      </tbody>
    </table>
    ${co('note', 'How far to trust a forecast', 'Forecasts get less certain the further ahead they look, so read tomorrow and the night after as a trend. Models can all be wrong together, especially for scattered cloud and passing showers. Use the verdict as a strong guide, and look at the sky and the radar before a long session.')}
    <p>SkyWatch checks for a newer version of itself every time you open it, and updates automatically.</p>`)}

  ${chapter('g-tips', `
    <table class="g-tbl">
      <thead><tr><th scope="col">Subject</th><th scope="col">LP filter</th><th scope="col">Advice</th></tr></thead>
      <tbody>
        <tr><td>Emission nebulae, supernova remnants, cluster plus nebula</td><td>On</td><td>Reward long stacks: an hour or two, or more.</td></tr>
        <tr><td>Planetary nebulae</td><td>On</td><td>Small and bright. 20 to 40 minutes shows good detail.</td></tr>
        <tr><td>Galaxies</td><td>Off</td><td>Need dark skies and little or no Moon. Aim for an hour or more.</td></tr>
        <tr><td>Globular clusters</td><td>Off</td><td>Bright and compact. 15 to 30 minutes resolves the stars.</td></tr>
        <tr><td>Reflection nebulae</td><td>Off</td><td>Blue broadband light, and very sensitive to the Moon.</td></tr>
        <tr><td>Comets</td><td>Off</td><td>Use 15 to 30 minute sessions. Comets drift against the stars. Faint comets (about magnitude 13 or fainter) need an hour or more from a dark sky. Each comet's pop-up has its own tip: for example, Encke (2P) is too faint until December, and best from late January to mid-February 2027.</td></tr>
        <tr><td>Planets</td><td>Off</td><td>Tiny at the S50's focal length. Shoot when they are highest.</td></tr>
      </tbody>
    </table>
    <ul>
      <li><b>Dew.</b> When the Dew gap tile turns red, run the dew heater.</li>
      <li><b>Wind.</b> Strong gusts shake the mount. The app flags gusts above 30 km/h (19 mph).</li>
      <li><b>Frame.</b> The S50 sees 1.28° × 0.72° (77′ × 43′). Larger targets need a mosaic, and the pop-up tells you how many panels.</li>
    </ul>`)}

  ${chapter('g-help', `
    ${ts('The screen says “Location blocked”', '<p>Location must be allowed in both your computer or device settings and Safari. See the steps in chapter 10. Or search for a place and tap <b>Save spot</b>, which needs no permission.</p>')}
    ${ts('GPS shows the wrong place', '<p>A desktop computer reports where it sits, such as your office. Search for your home town and tap <b>Save spot</b> to use it from anywhere.</p>')}
    ${ts('“Could not reach any weather service”', '<p>Check your connection and tap the refresh button.</p>')}
    ${ts('Seeing and Transp show “–”', '<p>7Timer! is slow and sometimes down. The verdict still works without it. Tap Refresh to try again, and open Data sources to see its status.</p>')}
    ${ts('The Bortle tile shows “–” or “…”', '<p>“…” means it is still loading. “–” means it could not be fetched (offline) or your location is outside the atlas coverage.</p>')}
    ${ts('The Time Machine is greyed out', '<p>It works only on Tonight, and only while there is dark time left before dawn.</p>')}
    ${ts('A target I expected is missing', '<p>It may be below your minimum elevation, outside your Home sky directions, already in the Top Ten (the Seestar list starts at #11), or finished for the night. Use the search box to find it directly.</p>')}
    ${ts('Home turned itself off', '<p>Home is tied to the place where you switched it on. If you are more than about 3 km away it turns off, and it returns when you are back.</p>')}
    ${ts('I cannot select or copy text', '<p>That is deliberate, so a stray touch never highlights text on screen. Use the <b>Copy</b> button in a target’s pop-up.</p>')}
    ${ts('The app looks out of date', '<p>Close it and open it again. It checks for a new version each time it opens, and reloads once if there is one.</p>')}`)}

  ${chapter('g-gloss', `
    <dl class="g-gl">
      <dt>Astronomical darkness</dt><dd>When the Sun is more than 18° below the horizon. The sky is as dark as it gets, and faint targets are worth imaging. Shown as “Full dark”.</dd>
      <dt>Twilight</dt><dd>Civil (Sun 0 to 6° down), nautical (6 to 12°) and astronomical (12 to 18°). The sky gets progressively darker.</dd>
      <dt>Elevation (altitude)</dt><dd>How high something is above the horizon, in degrees. 0° is the horizon and 90° is straight up.</dd>
      <dt>Azimuth</dt><dd>Compass direction: N, NE, E, SE, S, SW, W, NW.</dd>
      <dt>Magnitude</dt><dd>Brightness on a backwards scale. The lower the number (negative is very bright), the brighter the object.</dd>
      <dt>Bortle</dt><dd>A 1 to 9 scale of sky light pollution. 1 is a pristine dark site and 9 is an inner city. SkyWatch estimates it from the sky's brightness in <b>sqm</b> (magnitudes per square arcsecond, where higher is darker).</dd>
      <dt>Seeing</dt><dd>How steady the air is. Good seeing means sharp stars and planets. Graded Excellent, Good, Average, Poor.</dd>
      <dt>Transparency</dt><dd>How clear the air is. High transparency lets faint objects show up well.</dd>
      <dt>Dew gap</dt><dd>Air temperature minus dew point. Below about 2 °C (4 °F), dew is likely to form on cold surfaces such as the lens.</dd>
      <dt>Ensemble</dt><dd>A weather forecast run many times with tiny changes. The share of runs that show rain is a genuine rain chance.</dd>
      <dt>LP filter</dt><dd>The Seestar's light-pollution filter. It helps with emission nebulae and hurts broadband targets such as galaxies and clusters.</dd>
      <dt>Moon separation</dt><dd>How far, in degrees, the Moon is from the target. The farther away, the less moonlight washes it out.</dd>
      <dt>Imaging window</dt><dd>The stretch of the night when a target is above your minimum elevation, in full darkness, and in your Home sky if that is on.</dd>
      <dt>Mosaic</dt><dd>Several overlapping frames stitched together to cover an object bigger than one Seestar frame.</dd>
    </dl>`)}

  <p class="g-end">Weather data from Open-Meteo, MET Norway and 7Timer!. Astronomy by Astronomy Engine. Light pollution by D. Lorenz.</p>
    </div>
  </div>
  </div>`;

  /* Scroll the pop-up body to a chapter (or to the contents). */
  const go = (body, id) => {
    const el = body.querySelector('#' + id);
    if (!el) return;
    const bar = body.querySelector('#gBar'), sticky = bar && getComputedStyle(bar).display !== 'none' ? bar.offsetHeight : 0;
    const y = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - sticky - 10;
    try { body.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); } catch (e) { body.scrollTop = Math.max(0, y); }
  };

  /* Contents buttons, and highlight the chapter being read. */
  const wire = (body) => {
    body.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => go(body, b.dataset.g)));
    const secs = [...body.querySelectorAll('.g-ch')];
    const bar = body.querySelector('#gBarT');
    const set = (s) => {
      body.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === s.id));
      if (bar) bar.textContent = `${s.dataset.n}. ${s.dataset.title}`;
    };
    const pick = () => {
      const top = body.getBoundingClientRect().top + 90;
      let cur = secs[0];
      for (const s of secs) if (s.getBoundingClientRect().top <= top) cur = s;
      set(cur);
    };
    let raf = 0;
    body.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; pick(); }); }, { passive: true });
    pick();
  };

  return { html, go, wire };
})();
