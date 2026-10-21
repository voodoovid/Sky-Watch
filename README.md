# SkyWatch - Go / No Go

Go / no-go night sky forecast for imaging with a Seestar S50 — a one-screen dashboard that runs entirely in the browser on GitHub Pages.

On iPad/iPhone: open the site in Safari → Share → **Add to Home Screen** to install it with its icon (opens full-screen, no browser bars).

- Tonight / Tomorrow toggle; hour-by-hour for the dark hours only: cloud cover (low/mid/high), precipitation chance, seeing, transparency, wind, gusts, temperature and dew gap, with a go/no-go score
- Precipitation chance pooled from ICON, GFS, ECMWF and GEM ensemble runs, cross-checked against MET Norway and deterministic models
- Tonight: sunset, astronomical darkness, sunrise, moonrise/set, best imaging window
- Moon phase and a chart of the Moon's path across the sky tonight
- Planets and well-placed Seestar targets for tonight
- GPS or saved locations, metric/imperial, and a red night-vision mode
- Halloween skin: all of October (by the device's date) the app wears a pumpkin Moon, cobwebs and a ghost, then returns to the normal look on Nov 1 and again each Oct 1. The Tonight card has a web with a realistic black widow spider; an ant that walks onto the web gets stuck, and the spider runs out, bites it, wraps it in silk, tows it to the hub and eats it. Preview any time with `?season=halloween`, or `?season=normal`; add `&ant=web` to send an ant straight at the web
- Christmas skin: Dec 1-25 (by the device's date) the app gets a candy-cane header, a string of bubble lights, falling snow, Santa and a snowman (tap the snowman and Pancake purrs). Dec 26-31 it turns to New Year (midnight and gold, champagne-colored lights, confetti, party hats), then returns to the normal look on Jan 1 and again each Dec 1. Preview any time with `?season=christmas` or `?season=newyear`.
- A small ant walks across the screen every half minute or so (never more than two at a time), in every season. Add `?ant=now` to the address to see two right away.
- Built-in User Guide: Options → **User Guide** (beside the Options title)

Data: Open-Meteo, MET Norway, 7Timer!. Astronomy: [Astronomy Engine](https://github.com/cosinekitty/astronomy) (MIT, bundled). Moon image: NASA lunar map (public domain), projected to the near side.
