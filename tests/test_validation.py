"""Validazione contro JPL Horizons e LOLA. Richiede rete al primo avvio (poi cache in data/cache).

Uso: .venv/bin/python -m pytest -q tests
"""
import asyncio
import datetime as dt
import json
import subprocess
import pathlib

import numpy as np
import pytest

from backend import horizons, terrain, site_analysis

ROOT = pathlib.Path(__file__).resolve().parents[1]
T0 = dt.datetime(2026, 12, 1, tzinfo=dt.timezone.utc)

# soglie: errore di interpolazione accettato per la visualizzazione e l'informazione in pannello
CASES = {  # corpo, centro, passo campioni (come /api/states), soglia km
    "mercury": ("199", "500@0", "20", 10.0),
    "earth": ("399", "500@0", "20", 1.0),
    "mars": ("499", "500@0", "20", 0.5),
    "moon": ("301", "500@399", "480", 0.01),
}


def test_hermite_interpolation_against_horizons(tmp_path):
    async def fetch():
        fx = {}
        t1 = T0 + dt.timedelta(days=20)
        for k, (cmd, center, n, _) in CASES.items():
            series = await horizons.vectors(cmd, center, T0, t1, n)
            # riferimento: istanti a metà tra i campioni (caso peggiore), calcolati direttamente da Horizons
            ref = await horizons.vectors(cmd, center, T0 + dt.timedelta(hours=7, minutes=13), t1 - dt.timedelta(days=1), "37")
            fx[k] = {"series": series, "ref": ref}
        return fx
    fx = asyncio.run(fetch())
    f = tmp_path / "fx.json"
    f.write_text(json.dumps(fx))
    out = json.loads(subprocess.run(["node", str(ROOT / "tests" / "interp_check.mjs"), str(f)],
                                    capture_output=True, text=True, check=True).stdout)
    print("errore massimo di interpolazione (km):", out)
    for k, (*_, tol) in CASES.items():
        assert out[k] < tol, f"{k}: {out[k]:.3f} km > {tol} km"


def test_lola_dem_range_and_reference_points():
    d = terrain.dem(16)
    # estremi pubblicati di LOLA rispetto a 1737.4 km: circa -9.1 km (bacino SPA) e +10.8 km
    assert -9500 < d.min() < -8500 and 10000 < d.max() < 11000
    # alla risoluzione di 16 px/grado il fondo di Shackleton (centro, IAU) è molto più basso del bordo
    assert terrain.sample(-89.67, 129.78) < terrain.sample(-89.45, 222.69) - 2000


def test_horizon_mask_smooth_sphere_dips_below_zero():
    """Su un terreno senza rilievi l'orizzonte visto da 2 m è sotto 0° (curvatura). Si verifica la formula."""
    R = terrain.R_MOON_M
    h = terrain.OBSERVER_HEIGHT_M
    expected = -np.degrees(np.arccos(R / (R + h)))
    th = np.linspace(1e-5, 0.01, 20000)
    el = np.degrees(np.arctan2(R * np.cos(th) - (R + h), R * np.sin(th)))
    assert abs(el.max() - expected) < 0.01


def test_site_geometry_consistency():
    """Il Sole al polo sud resta entro ~1.6° dall'orizzonte matematico (inclinazione dell'asse lunare)."""
    async def both():
        return (await site_analysis.analyze(-90.0, 0.0, T0, 24 * 28, 60),
                await site_analysis.analyze(0.674, 23.473, T0, 24 * 30, 120))
    r, r2 = asyncio.run(both())
    assert max(abs(e) for e in r["sun"]["el"]) < 1.7
    # a una latitudine equatoriale il Sole raggiunge elevazioni alte nel mese
    assert max(r2["sun"]["el"]) > 60
