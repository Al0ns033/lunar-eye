"""Client JPL Horizons con cache su disco.

Fonte: https://ssd.jpl.nasa.gov/api/horizons.api (documentazione: https://ssd-api.jpl.nasa.gov/doc/horizons.html).
Nessuna chiamata per frame: il frontend chiede finestre temporali, qui si scaricano una volta e si salvano.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import hashlib
import json
import pathlib
import re

import httpx

from .cache_budget import store

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
CACHE = pathlib.Path(__file__).resolve().parents[1] / "data" / "cache"
CACHE.mkdir(parents=True, exist_ok=True)
_sems: dict = {}  # Horizons rifiuta (503) le richieste simultanee dallo stesso IP: una alla volta per event loop


def _sem_for_loop() -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    return _sems.setdefault(id(loop), asyncio.Semaphore(1))


class HorizonsError(RuntimeError):
    pass


def _q(v: str) -> str:
    return f"'{v}'"


async def _call(params: dict) -> dict:
    """Esegue (o legge dalla cache) una richiesta Horizons; ritorna testo e metadati."""
    p = {"format": "json", "MAKE_EPHEM": "'YES'", "OBJ_DATA": "'NO'", "CSV_FORMAT": "'YES'"}
    p.update({k: _q(v) for k, v in params.items()})
    key = hashlib.sha1(json.dumps(p, sort_keys=True).encode()).hexdigest()[:20]
    f = CACHE / f"{key}.json"
    if f.exists():
        return json.loads(f.read_text())
    async with _sem_for_loop():
        if f.exists():  # scritto da una richiesta concorrente identica
            return json.loads(f.read_text())
        async with httpx.AsyncClient(timeout=90) as c:
            for attempt in range(4):
                r = await c.get(API, params=p)
                if r.status_code != 503:
                    break
                await asyncio.sleep(1.5 * (attempt + 1))
    if r.status_code != 200:
        raise HorizonsError(f"Horizons HTTP {r.status_code}")
    j = r.json()
    text = j.get("result", "")
    if "$$SOE" not in text:
        raise HorizonsError(text[-600:] or j.get("error", "risposta vuota"))
    eph = re.search(r"\{source:\s*([^}]+)\}", text) or re.search(r"Target body name:.*?\{source:\s*([^}]+)\}", text, re.S)
    out = {
        "text": text,
        "meta": {
            "source": "NASA/JPL Horizons API",
            "api_version": j.get("signature", {}).get("version"),
            "ephemeris": eph.group(1).strip() if eph else None,
            "retrieved_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        },
    }
    store(f, json.dumps(out))
    return out


def _rows(text: str) -> list[list[str]]:
    body = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    return [[c.strip() for c in ln.split(",")] for ln in body.strip().splitlines() if ln.strip()]


def _fmt(t: dt.datetime) -> str:
    return t.strftime("%Y-%m-%d %H:%M")


async def vectors(command: str, center: str, start: dt.datetime, stop: dt.datetime, step: str) -> dict:
    """Stati cartesiani ICRF (km, km/s), tempi in JD UT. Ritorna {jd:[...], state:[[x,y,z,vx,vy,vz],...], meta}."""
    res = await _call({
        "COMMAND": command, "EPHEM_TYPE": "VECTORS", "CENTER": center,
        "START_TIME": _fmt(start), "STOP_TIME": _fmt(stop), "STEP_SIZE": step,
        "VEC_TABLE": "2", "REF_PLANE": "FRAME", "REF_SYSTEM": "ICRF", "OUT_UNITS": "KM-S",
        "TIME_TYPE": "UT", "VEC_CORR": "NONE",
    })
    jd, st = [], []
    for row in _rows(res["text"]):
        jd.append(float(row[0]))
        st.append([float(x) for x in row[2:8]])
    meta = dict(res["meta"], frame="ICRF", center=center, time_standard="UT (JD)", units="km, km/s",
                correction="geometrica (nessuna aberrazione)")
    return {"jd": jd, "state": st, "meta": meta}


async def observer_from_moon(command: str, lon_e: float, lat: float, alt_km: float,
                             start: dt.datetime, stop: dt.datetime, step: str) -> dict:
    """Azimut/elevazione apparenti (senza rifrazione: Luna priva di atmosfera) di un corpo visto da un sito lunare.

    Coordinate del sito: geodetiche sul corpo 301 (frame lunare di Horizons), longitudine Est.
    Quantità 4 (Az/El), 13 (diametro angolare), 20 (distanza).
    """
    res = await _call({
        "COMMAND": command, "EPHEM_TYPE": "OBSERVER", "CENTER": "coord@301", "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"{lon_e % 360:.6f},{lat:.6f},{alt_km:.4f}",
        "START_TIME": _fmt(start), "STOP_TIME": _fmt(stop), "STEP_SIZE": step,
        "QUANTITIES": "4,13,20", "ANG_FORMAT": "DEG", "TIME_TYPE": "UT", "EXTRA_PREC": "YES",
    })
    t, az, el, diam, dist = [], [], [], [], []
    for row in _rows(res["text"]):
        t.append(dt.datetime.strptime(row[0], "%Y-%b-%d %H:%M").replace(tzinfo=dt.timezone.utc).isoformat())
        az.append(float(row[3])); el.append(float(row[4]))
        diam.append(float(row[5]) / 3600.0)  # arcsec -> gradi
        dist.append(float(row[6]))  # au
    meta = dict(res["meta"], frame="topocentrico lunare (Az da Nord verso Est)", time_standard="UTC",
                site={"lon_e": lon_e, "lat": lat, "alt_km": alt_km})
    return {"t": t, "az": az, "el": el, "diam_deg": diam, "dist_au": dist, "meta": meta}
