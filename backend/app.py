"""API FastAPI di Lunar Mission Planner. Avvio: .venv/bin/uvicorn backend.app:app --port 8000"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import pathlib

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from . import horizons, site_analysis, terrain
from .bodies import BODIES, ORIENTATION_SOURCE
from .request_limits import RequestLimits
from .objects import OBJECTS, states as object_states

ROOT = pathlib.Path(__file__).resolve().parents[1]
app = FastAPI(title="Lunar Mission Planner API")
app.add_middleware(RequestLimits)


@app.middleware("http")
async def revalidate_code(request, call_next):
    """JS/CSS/HTML sempre rivalidati (ETag): evita moduli ES vecchi in cache dopo un aggiornamento."""
    resp = await call_next(request)
    if request.url.path.endswith((".js", ".css", ".html", "/")):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


def _utc(s: str) -> dt.datetime:
    try:
        t = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(422, "Invalid ISO date")
    return (t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)).astimezone(dt.timezone.utc).replace(second=0, microsecond=0)


async def _guard(coro):
    try:
        return await coro
    except horizons.HorizonsError as e:
        raise HTTPException(502, f"JPL Horizons: {e}")
    except Exception as e:  # rete assente ecc.
        raise HTTPException(503, f"Dati non disponibili: {e}")


@app.get("/api/meta")
def meta():
    reg = json.loads((ROOT / "data" / "registry.json").read_text())
    return {"objects": {k: {"name": v["name"], "kind": v["kind"]} for k, v in OBJECTS.items()}, "bodies": BODIES, "orientation_source": ORIENTATION_SOURCE, "registry": reg,
            "horizons": {"endpoint": horizons.API, "frame": "ICRF", "center": "Baricentro del Sistema Solare (500@0)",
                         "time_standard": "UTC (Horizons converte internamente TDB↔UT)"}}


@app.get("/api/states")
async def states(start: str, days: float = Query(60, ge=2, le=3660)):
    """Stati ICRF baricentrici di Sole e pianeti + Luna geocentrica su una finestra temporale."""
    t0 = _utc(start)
    t0 = t0.replace(hour=0, minute=0)  # finestre allineate al giorno: più riuso della cache
    t1 = t0 + dt.timedelta(days=days)
    n_pl = str(int(min(800, max(2, days))))
    n_moon = str(int(min(2000, days * 24)))

    async def one(key):
        b = BODIES[key]
        if key == "moon":
            return key, await horizons.vectors("301", "500@399", t0, t1, n_moon)
        return key, await horizons.vectors(b["id"], "500@0", t0, t1, n_pl)

    res = await _guard(asyncio.gather(*(one(k) for k in BODIES)))
    out = dict(res)
    return {"start": t0.isoformat(), "stop": t1.isoformat(), "bodies": out,
            "note": "Luna: geocentrica (500@399). Altri corpi: baricentrici (500@0). Interpolazione di Hermite cubica nel frontend."}


@app.get("/api/objects/{key}")
async def object_ephemeris(key: str, start: str):
    if key not in OBJECTS:
        raise HTTPException(404, "Unknown object")
    t = _utc(start)
    if not 1950 <= t.year <= 2100:
        raise HTTPException(422, "Date outside supported range (1950–2100)")
    return await _guard(object_states(key, t))


@app.get("/api/orbits")
async def orbits(date: str):
    """Un periodo orbitale per pianeta, centrato sulla data, 360 campioni (percorsi reali, non circonferenze)."""
    t = _utc(date).replace(hour=0, minute=0)
    t = t.replace(day=1)  # stessa cache per tutto il mese

    async def one(key):
        b = BODIES[key]
        half = dt.timedelta(days=b["period_d"] / 2)
        v = await horizons.vectors(b["orbit_id"], "500@0", t - half, t + half, "360")
        return key, {"jd": v["jd"], "pos": [s[:3] for s in v["state"]], "meta": v["meta"]}

    res = await _guard(asyncio.gather(*(one(k) for k in BODIES if "period_d" in BODIES[k])))
    return dict(res)


@app.get("/api/terrain/globe")
def globe(ppd: int = Query(2, ge=1, le=4)):
    if ppd not in (1, 2, 4):
        raise HTTPException(422, "ppd must be 1, 2 or 4")
    h = terrain.globe_heights(ppd).astype("<i2")
    return Response(h.tobytes(), media_type="application/octet-stream",
                    headers={"X-Shape": f"{h.shape[0]}x{h.shape[1]}", "X-Units": "m",
                             "X-Source": "LOLA LDEM_4 (media a blocchi)", "Cache-Control": "max-age=86400"})


@app.get("/api/terrain/point")
def point(lat: float = Query(ge=-90, le=90), lon: float = Query()):
    return terrain.site_info(lat, lon)


@app.get("/api/terrain/patch")
def tpatch(lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-360, le=360), half_km: float = Query(30.0, gt=0, le=200), n: int = Query(121, ge=3, le=201)):
    return terrain.patch(lat, lon, half_km, min(n, 201))


@app.get("/api/terrain/horizon")
def thorizon(lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-360, le=360)):
    return terrain.horizon_mask(round(lat, 4), round(lon, 4))


@app.get("/api/site")
async def site(lat: float = Query(ge=-90, le=90), lon: float = Query(), start: str = Query(),
               hours: float = Query(336, ge=1, le=24 * 60), step_min: int = Query(0, ge=0, le=1440),
               area_m2: float | None = None, efficiency: float | None = None, tilt_deg: float = 90.0,
               azimuth_deg: float = 0.0, mode: str = "tracking", load_W: float | None = None):
    if step_min <= 0:  # passo automatico: ~1500 campioni al massimo
        step_min = max(10, int(np.ceil(hours * 60 / 1500 / 10) * 10))
    if hours * 60 / step_min > 2000:
        raise HTTPException(422, "Too many samples: increase step_min")
    panel = {"area_m2": area_m2, "efficiency": efficiency, "tilt_deg": tilt_deg, "azimuth_deg": azimuth_deg,
             "mode": mode, "load_W": load_W}
    return await _guard(site_analysis.analyze(lat, lon, _utc(start), hours, step_min, panel))


@app.get("/")
def index():
    return FileResponse(ROOT / "frontend" / "index.html")


app.mount("/", StaticFiles(directory=ROOT / "frontend"), name="static")
