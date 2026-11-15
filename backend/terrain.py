"""Topografia lunare da NASA LOLA (GDR LDEM, cilindrica semplice, frame Moon ME).

Altezza (m) = DN * 0.5 rispetto alla sfera di riferimento R = 1737.4 km.
Colonna 0 = longitudine 0 E (centro pixel a +0.5 px), riga 0 = latitudine +90.
"""
from __future__ import annotations

import functools
import pathlib

import numpy as np

R_MOON_M = 1737400.0
RAW = pathlib.Path(__file__).resolve().parents[1] / "data" / "raw"
OBSERVER_HEIGHT_M = 2.0  # altezza dell'osservatore/antenna sopra il suolo per il calcolo dell'orizzonte


@functools.lru_cache(maxsize=2)
def dem(ppd: int) -> np.ndarray:
    f = RAW / f"LDEM_{ppd}.IMG"
    if not f.exists():
        raise FileNotFoundError(f"{f} mancante: eseguire scripts/fetch_data.py")
    a = np.fromfile(f, dtype="<i2").reshape(180 * ppd, 360 * ppd)
    return a.astype(np.float32) * 0.5


def sample(lat, lon, ppd: int = 16) -> np.ndarray:
    """Quota in metri con interpolazione bilineare (lat, lon in gradi, array o scalari)."""
    d = dem(ppd)
    h, w = d.shape
    lat = np.asarray(lat, dtype=np.float64)
    lon = np.mod(np.asarray(lon, dtype=np.float64), 360.0)
    y = np.clip((90.0 - lat) * ppd - 0.5, 0, h - 1.001)
    x = lon * ppd - 0.5
    y0 = np.floor(y).astype(int); fy = y - y0
    x0 = np.floor(x).astype(int); fx = x - x0
    x0m = np.mod(x0, w); x1m = np.mod(x0 + 1, w)
    y1 = np.minimum(y0 + 1, h - 1)
    return ((d[y0, x0m] * (1 - fx) + d[y0, x1m] * fx) * (1 - fy)
            + (d[y1, x0m] * (1 - fx) + d[y1, x1m] * fx) * fy)


def _destination(lat, lon, az_deg, dist_m):
    """Punto a distanza geodetica dist_m lungo l'azimut az (da Nord verso Est) sulla sfera lunare."""
    p1 = np.radians(lat); l1 = np.radians(lon)
    az = np.radians(az_deg)[:, None]
    th = (np.asarray(dist_m) / R_MOON_M)[None, :]
    p2 = np.arcsin(np.sin(p1) * np.cos(th) + np.cos(p1) * np.sin(th) * np.cos(az))
    l2 = l1 + np.arctan2(np.sin(az) * np.sin(th) * np.cos(p1), np.cos(th) - np.sin(p1) * np.sin(p2))
    return np.degrees(p2), np.degrees(l2)


def site_info(lat: float, lon: float) -> dict:
    """Quota e pendenza locale (differenze finite su LDEM_16, base ~2 km)."""
    h = float(sample(lat, lon))
    ds = 2000.0
    az = np.array([0.0, 90.0, 180.0, 270.0])
    plat, plon = _destination(lat, lon, az, np.array([ds]))
    hn, he, hs, hw = sample(plat[:, 0], plon[:, 0])
    dzdn = (hn - hs) / (2 * ds); dzde = (he - hw) / (2 * ds)
    slope = float(np.degrees(np.arctan(np.hypot(dzdn, dzde))))
    aspect = float((np.degrees(np.arctan2(-dzde, -dzdn))) % 360)  # direzione verso cui scende il pendio
    # normale locale in coordinate ENU (East, North, Up)
    n = np.array([-dzde, -dzdn, 1.0]); n /= np.linalg.norm(n)
    return {"elevation_m": h, "slope_deg": slope, "aspect_deg": aspect, "normal_enu": n.tolist(),
            "dem": "LOLA LDEM_16 (~1.9 km/px all'equatore)", "status": "real (interpolazione bilineare)"}


@functools.lru_cache(maxsize=256)
def horizon_mask(lat: float, lon: float, az_step: float = 1.0, max_km: float = 250.0) -> dict:
    """Elevazione dell'orizzonte topografico per ogni azimut (ray casting sul DEM, curvatura inclusa).

    Per ogni azimut si campiona il terreno lungo il cerchio massimo e si prende il massimo angolo
    di elevazione apparente: el = atan2(r1*cos(t) - r0, r1*sin(t)), t = angolo al centro.
    """
    az = np.arange(0.0, 360.0, az_step)
    # passi più fitti vicino al sito, poi crescenti (risoluzione DEM ~1.9 km)
    d = np.concatenate([np.arange(500, 10000, 500), np.arange(10000, 60000, 1500),
                        np.arange(60000, max_km * 1000, 4000)]).astype(np.float64)
    h0 = float(sample(lat, lon)) + OBSERVER_HEIGHT_M
    plat, plon = _destination(lat, lon, az, d)
    h1 = sample(plat, plon)
    r0 = R_MOON_M + h0
    r1 = R_MOON_M + h1
    th = d / R_MOON_M
    el = np.degrees(np.arctan2(r1 * np.cos(th) - r0, r1 * np.sin(th)))
    idx = el.argmax(axis=1)
    return {
        "az_deg": az.tolist(),
        "elev_deg": el.max(axis=1).round(3).tolist(),
        "dist_km": (d[idx] / 1000).round(1).tolist(),
        "method": f"ray casting su LOLA LDEM_16, {len(d)} campioni per azimut fino a {max_km:.0f} km, "
                  f"osservatore a {OBSERVER_HEIGHT_M} m dal suolo, curvatura lunare inclusa",
        "limits": "Risoluzione ~1.9 km/px: rilievi più piccoli, massi e bordi di crateri minori non sono risolti.",
        "status": "real-derived",
    }


def mask_at(mask: dict, az_deg) -> np.ndarray:
    az = np.asarray(mask["az_deg"]); el = np.asarray(mask["elev_deg"])
    return np.interp(np.mod(az_deg, 360), np.append(az, 360.0), np.append(el, el[0]))


def globe_heights(ppd_out: int = 2) -> np.ndarray:
    """Griglia di quote ridotta per la mesh del globo (media a blocchi da LDEM_4)."""
    d = dem(4)
    k = 4 // ppd_out
    return d.reshape(d.shape[0] // k, k, d.shape[1] // k, k).mean(axis=(1, 3))


def patch(lat: float, lon: float, half_km: float = 30.0, n: int = 121) -> dict:
    """Griglia locale ENU (km) di quote per la vista 3D dell'orizzonte locale."""
    xs = np.linspace(-half_km, half_km, n)
    E, N = np.meshgrid(xs, xs)
    dist = np.hypot(E, N) * 1000.0
    az = np.degrees(np.arctan2(E, N)) % 360
    p1 = np.radians(lat); l1 = np.radians(lon)
    th = dist / R_MOON_M; a = np.radians(az)
    p2 = np.arcsin(np.sin(p1) * np.cos(th) + np.cos(p1) * np.sin(th) * np.cos(a))
    l2 = l1 + np.arctan2(np.sin(a) * np.sin(th) * np.cos(p1), np.cos(th) - np.sin(p1) * np.sin(p2))
    h = sample(np.degrees(p2), np.degrees(l2))
    drop = (dist ** 2) / (2 * R_MOON_M)  # caduta per curvatura
    return {"n": n, "half_km": half_km, "h_m": (h - drop).round(1).ravel().tolist(),
            "h0_m": float(sample(lat, lon))}
