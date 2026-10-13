# Sound Cosmos

**An observatory terminal for house music.** Styles are stars, labels are planets, tracks are satellites.

Live: **https://hellomynameisdruc.github.io/spacejam/**

---

## The map

- **Star** — a Discogs style (Deep House, Garage House, Acid House…). Its size shows how many releases the style has, its glow shows how much of that came out in the last ten years, and it pulses at the tempo typical for the style.
- **Planet** — a label, orbiting its main style. Bigger label, bigger planet. Five kinds:
  gas giants (the biggest labels), ringed worlds (15+ years active), cratered worlds (went quiet before 2001), ice worlds (started after 2010) and terrestrial planets.
- **Satellites** — the label's tracks, swarming around it on tilted orbits.
- **Asteroid belt** — releases without a label or from very small labels, at the edge of a system.
- **Dotted lines between stars** — how often two styles appear on the same release.

Planets slowly orbit their stars; the camera follows whatever you select.

## What you can do

- **Zoom** with the wheel or two fingers: styles → labels → tracks → track titles.
- **Click** a star, planet or track to open its dossier on the right.
- **Play** — tracks play in the embedded YouTube player. *Play the orbit* picks a random track from a label.
- **Autopilot** — when a track ends, the ship flies to the nearest track you haven't heard yet.
- **Routes** — on any planet press *Plot route from here*, then pick another planet. Every route visits 10 planets in 5 systems, two in each: the start system, three neighbouring systems on the way and the destination system (if the two are close, the route detours through neighbours; if they share a system, it becomes a round trip). It enters and leaves each system through "gate" labels facing the previous and next systems, preferring labels that release both styles. Every route has at least 20 tracks and its own shareable link.
- **Wormhole** — jump to a random point in the cosmos.
- **Search** by style, label or artist.
- **Flight log** — your listening history (kept in your browser).
- **Share** — the address bar holds a link to the current track (`#t3-120`) or route (`#r81-0`).
- Three phosphor colours: violet, green, amber.

## Data

The catalogue comes from the monthly **Discogs data dump** (CC0 licence), where releases already carry YouTube links.
Sound Cosmos only embeds the official YouTube player — **nothing is ever downloaded from YouTube.**

Since 2026 Discogs serves dumps only from `data.discogs.com`, which blocks servers, so the dump is processed in a regular
browser: `pipeline/browser_parse.js` streams the ~11 GB file on that page and saves a small `catalog.jsonl.gz`.
`pipeline/build_map.py` turns it into the map. A new dump appears on the 1st of every month.

Current sector, House: 58 stars, 6,654 planets, 706,315 satellites from 384,690 releases.

## Hosting

The site is built with Vite + TypeScript (canvas rendering) and published to **GitHub Pages** by
`.github/workflows/deploy.yml` on every push. The full map lives on the `data` branch; `main` keeps a small sample.

## Architecture

The site is plain TypeScript (no framework) drawing on two canvases: a **static layer** (grid, links,
labels — repainted only when the camera settles, slid and scaled by CSS in between) and a **live layer**
(everything that moves, redrawn every frame). Code is split by responsibility; modules only define things
and `main.ts` starts them in order.

```
web/src/
  core/      types, small helpers, DOM access
  model/     pure logic, no DOM — galaxy (planet types, star classes, tempo), motion (orbits),
             routes (planning, track picks). Unit-tested.
  data/      fetching the map and each star's tracks
  store/     the visitor's own data: beacons, flight log, prefs — behind a storage adapter
             (browser today; a synced account store can replace it in one place)
  app/       shared state and actions (select, play, next, plot a route, wormhole)
  render/    camera, palette, layers, pulsars, planets, satellites, route line, picking
  ui/        dossier, player dock, route panel, log & beacons, search, input, effects
  main.ts    wiring and start-up
web/test/    Vitest: galaxy, motion, routes, stores
pipeline/
  build_map.py   catalogue → map, as a chain of small steps (see build()); deterministic
  tests/         pytest on fake releases
```

Every push runs types, lint (ESLint, ruff) and tests for the site and the pipeline;
the site is deployed only if they pass.

## Next

- More sectors: techno, disco, jungle.
- Saved and shared "flights" (playlists), accounts.
- A custom domain.

---

© 2026 hellomynameisdruc. All rights reserved. See [LICENSE](LICENSE).
Catalogue data © Discogs contributors, released under CC0. Videos are streamed from YouTube and belong to their owners.
