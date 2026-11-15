# Lunar Eye — Mission Planner

**English** · [Italiano](README.it.md)

A 3D Solar System simulator and lunar mission planning platform, built for the **NASA Space Apps Challenge**.
Positions and angles come from **NASA/JPL Horizons**; lunar terrain comes from **NASA LRO LOLA**.

Live site: <https://lunar-eye.it>

## What it does

- **Lunar Explorer** — a LOLA-based 3D Moon globe: pick a landing site and inspect elevation, slope and the local horizon.
- **Mission Planning** — for a site and time window, computes Sun and Earth visibility from the surface (accounting for terrain horizon), illumination events and solar panel power, with an interactive timeline.
- **Site comparison** — side-by-side evaluation of candidate landing sites.
- **Solar System** — a 3D scene of planets, the Moon and selected extra objects (Ceres, Vesta, 1P/Halley, Voyager 1, James Webb) driven by Horizons ephemerides.
- **Education center** — didactic explanations and a 3D experiment.
- Export results as **CSV** (stable English column names) and **PDF**.
- Interface in **English and Italian** (IT/EN toggle, top right), with an interactive tutorial from the home page.

## Quick start

```bash
python3 -m venv .venv && .venv/bin/pip install fastapi uvicorn httpx numpy pytest
.venv/bin/python scripts/fetch_data.py        # LOLA LDEM_4/LDEM_16 (~35 MB) + textures; updates data/registry.json
.venv/bin/uvicorn backend.app:app --port 8765 # then open http://127.0.0.1:8765
.venv/bin/python -m pytest -q tests           # validation against Horizons (Node 18+ needed for the JS test)
```

The frontend has no build step: Three.js 0.169 and Chart.js 4.4 load from jsDelivr via an import map.
The first run needs network access; Horizons responses are cached in `data/cache/` and reused offline.

A 2-minute demo walkthrough (EN/IT) is in [docs/demo.md](docs/demo.md).

### Docker

```bash
LUNAR_PORT=8765 docker compose up -d --build   # http://127.0.0.1:8765
docker compose logs -f lunar                   # first start downloads LOLA data and textures (~55 MB) into volumes
docker compose down                            # volumes (data, Horizons cache) are kept; add -v to delete them
```

Single container, single worker (Horizons accepts one request at a time), 512 MB RAM / 1 CPU limit, read-only filesystem, non-root user. Health check: `GET /api/meta`. Outbound access is required to `ssd.jpl.nasa.gov`, `imbrium.mit.edu`, `svs.gsfc.nasa.gov` and `solarsystemscope.com`.

## Architecture

| Module | Role |
|---|---|
| `backend/horizons.py` | Horizons client: ICRF vectors and topocentric observer on the Moon, disk cache, one request at a time (Horizons returns 503 on parallel requests) |
| `backend/terrain.py` | LOLA DEM: elevation, slope, horizon mask (ray casting with curvature), local patches |
| `backend/site_analysis.py` | Sun and Earth from the site, visible disk fraction, events, panel power, ratings |
| `backend/bodies.py` | Radii and orientation, IAU WGCCRE 2015 |
| `frontend/js/science/` | Time, frames, Hermite interpolation, IAU orientation (no Three.js) |
| `frontend/js/render/` | Three.js scenes: Solar System, LOLA Moon globe, local horizon view |
| `frontend/js/ui/` | The six app views |
| `data/registry.json` | Data source registry: URL, frame, resolution, units, date, license |

Science code is kept separate from rendering: no scientific computation in `render/`, no Three.js in `science/`.

## Data and reliability

- **Real**: Horizons samples (DE441, ICRF, UTC), LOLA elevations.
- **Interpolated**: positions between samples, cubic Hermite on position and velocity. Maximum error measured by the tests: Mercury 3.1 km (daily samples), Earth 0.06 km, Mars 0.003 km, Moon 0.07 m (hourly samples).
- **Approximated**: visibility against the LOLA horizon (~1.9 km/px), panel power (no thermal losses, dust or degradation), slopes (~4 km baseline, hence underestimated). Event times carry an uncertainty of ±half a step.
- **Illustrative**: display scale (compressed distances r′ = 40·√(r/AU), enlarged radii), Earth and Venus clouds, education center demo.
- If Horizons does not respond, the app shows "data not available" and never fabricates substitute values.

## Known limitations

- **No SPICE integration.** Horizons is used instead, based on the same DE ephemerides. Planet orientation follows IAU 2015, secular terms only.
- **No high-resolution polar DEM** (LDEM 20 m). Terrain uses LDEM_16, at most ~1.9 km/px.
- **Shadows:** mutual ring/Saturn shadows are computed per pixel; Earth–Moon eclipses are not shown in the 3D scene.
- **Globe pole:** above 75° elevation is averaged over a ~12 km disk to avoid lat/lon grid artifacts; a slight radial pattern from the texture remains in the last 1–2°.
- **Communications are geometric only:** no radio link budget, no DSN station visibility; Earth being visible does not guarantee a link.
- **Graphics:** uncompressed textures (no KTX2), a single level of detail for the Moon globe.
- **Known sites:** published coordinates rounded to 0.001°. Artemis III candidate regions are not included, since NASA does not publish point coordinates.
- Extra objects (probes, comets) have limited coverage and updatable predictions: they are not live telemetry.

## Tests

- `pytest -q tests` — validation against Horizons, request limits and cache budget.
- `node tests/i18n_check.mjs` — localization check (offline).
- Browser tests (`tests/*_browser.mjs`) need the app running and Playwright; `LMP_URL` overrides the app URL.

## Sources

JPL Horizons API: https://ssd.jpl.nasa.gov/api/horizons.api ·
LOLA GDR: https://imbrium.mit.edu/DATA/LOLA_GDR/ ·
NASA SVS CGI Moon Kit: https://svs.gsfc.nasa.gov/4720 ·
Planet textures: Solar System Scope (CC BY 4.0) ·
Orientation: Archinal et al. 2018, *Celest. Mech. Dyn. Astr.* 130:22.

## License

[MIT](LICENSE)
