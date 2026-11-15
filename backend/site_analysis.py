"""Analisi di un sito lunare: Sole e Terra visti dal suolo, orizzonte topografico, energia, comunicazioni.

Geometria: JPL Horizons (osservatore topocentrico sulla Luna). Orizzonte: LOLA (terrain.horizon_mask).
Le soglie delle valutazioni sono euristiche di pianificazione di questo strumento, dichiarate nel testo.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import math

import numpy as np

from . import horizons, terrain

SOLAR_CONSTANT = 1361.0  # W/m^2 a 1 au (Kopp & Lean 2011)


def disk_fraction(center_el, mask_el, diam_deg):
    """Frazione del disco sopra un orizzonte localmente orizzontale (area del segmento circolare)."""
    r = np.maximum(np.asarray(diam_deg) / 2.0, 1e-6)
    s = np.clip((np.asarray(center_el) - mask_el) / r, -1.0, 1.0)
    return 1.0 - (np.arccos(s) - s * np.sqrt(1 - s * s)) / math.pi


def events(times: list[str], flag: np.ndarray, rise: str, set_: str) -> list[dict]:
    """Transizioni di un indicatore booleano; l'istante è il punto medio tra due campioni."""
    out = []
    for i in range(1, len(flag)):
        if flag[i] != flag[i - 1]:
            t0 = dt.datetime.fromisoformat(times[i - 1]); t1 = dt.datetime.fromisoformat(times[i])
            out.append({"type": rise if flag[i] else set_, "t": (t0 + (t1 - t0) / 2).isoformat(),
                        "uncertainty_min": (t1 - t0).total_seconds() / 120})
    return out


def periods(times: list[str], flag: np.ndarray) -> list[dict]:
    out, start = [], None
    for i, f in enumerate(flag):
        if f and start is None:
            start = times[i]
        if (not f or i == len(flag) - 1) and start is not None:
            out.append({"start": start, "end": times[i]})
            start = None
    return out


def longest_false(flag: np.ndarray, step_h: float) -> float:
    best = cur = 0
    for f in flag:
        cur = 0 if f else cur + 1
        best = max(best, cur)
    return best * step_h


def level(value, fav, mod, higher_better=True):
    if value is None:
        return "insufficient"
    if higher_better:
        return "favorable" if value >= fav else "moderate" if value >= mod else "unfavorable"
    return "favorable" if value <= fav else "moderate" if value <= mod else "unfavorable"


async def analyze(lat: float, lon: float, start: dt.datetime, hours: float, step_min: int,
                  panel: dict | None = None) -> dict:
    info = terrain.site_info(lat, lon)
    mask = terrain.horizon_mask(round(lat, 4), round(lon, 4))
    stop = start + dt.timedelta(hours=hours)
    alt_km = (info["elevation_m"] + terrain.OBSERVER_HEIGHT_M) / 1000.0
    sun, earth = await asyncio.gather(
        horizons.observer_from_moon("10", lon, lat, alt_km, start, stop, f"{step_min} m"),
        horizons.observer_from_moon("399", lon, lat, alt_km, start, stop, f"{step_min} m"),
    )
    t = sun["t"]
    step_h = step_min / 60.0
    res = {"site": {"lat": lat, "lon": lon, **info}, "horizon": mask, "t": t, "step_min": step_min}
    for name, d in (("sun", sun), ("earth", earth)):
        az = np.array(d["az"]); el = np.array(d["el"]); diam = np.array(d["diam_deg"])
        m = terrain.mask_at(mask, az)
        frac_terrain = disk_fraction(el, m, diam)
        frac_smooth = disk_fraction(el, 0.0, diam)
        res[name] = {"az": d["az"], "el": d["el"], "mask_el": m.round(3).tolist(),
                     "visible_frac": frac_terrain.round(4).tolist(),
                     "visible_frac_smooth": frac_smooth.round(4).tolist(),
                     "diam_deg": d["diam_deg"], "dist_au": d["dist_au"], "meta": d["meta"]}
    sun_on = np.array(res["sun"]["visible_frac"]) > 0
    earth_on = np.array(res["earth"]["visible_frac"]) > 0
    sun_on_smooth = np.array(res["sun"]["visible_frac_smooth"]) > 0
    earth_on_smooth = np.array(res["earth"]["visible_frac_smooth"]) > 0

    # incidenza sul terreno locale (normale da LOLA)
    saz = np.radians(res["sun"]["az"]); sel = np.radians(res["sun"]["el"])
    sdir = np.stack([np.sin(saz) * np.cos(sel), np.cos(saz) * np.cos(sel), np.sin(sel)], axis=1)  # ENU
    cos_terrain = sdir @ np.array(info["normal_enu"])
    res["sun"]["incidence_terrain_deg"] = np.degrees(np.arccos(np.clip(cos_terrain, -1, 1))).round(2).tolist()
    irr = SOLAR_CONSTANT / np.array(res["sun"]["dist_au"]) ** 2

    power = None
    if panel and panel.get("area_m2") and panel.get("efficiency"):
        mode = panel.get("mode", "fixed")
        if mode == "tracking":  # pannello verticale che segue l'azimut del Sole
            cos_i = np.cos(sel)
        else:
            tilt = math.radians(panel.get("tilt_deg", 90.0)); paz = math.radians(panel.get("azimuth_deg", 0.0))
            n = np.array([math.sin(paz) * math.sin(tilt), math.cos(paz) * math.sin(tilt), math.cos(tilt)])
            cos_i = sdir @ n
        cos_i = np.clip(cos_i, 0, 1)
        p = irr * panel["area_m2"] * panel["efficiency"] * cos_i * np.array(res["sun"]["visible_frac"])
        res["sun"]["incidence_panel_deg"] = np.degrees(np.arccos(cos_i)).round(2).tolist()
        power = {"W": p.round(1).tolist(), "mean_W": float(p.mean()), "max_W": float(p.max()),
                 "energy_Wh": float(p.sum() * step_h), "panel": panel,
                 "model": "P = S0/d^2 * A * eta * cos(i) * frazione disco visibile; senza perdite termiche, "
                          "polvere, degrado o efficienza del sistema di accumulo",
                 "status": "approximate"}
    res["power"] = power

    total_h = len(t) * step_h
    sun_frac = float(sun_on.mean()); earth_frac = float(earth_on.mean())
    dark_h = longest_false(sun_on, step_h)
    no_comm_h = longest_false(earth_on, step_h)
    res["events"] = sorted(events(t, sun_on, "sunrise", "sunset") + events(t, earth_on, "earthrise", "earthset"),
                           key=lambda e: e["t"])
    res["events_smooth"] = sorted(events(t, sun_on_smooth, "sunrise", "sunset")
                                  + events(t, earth_on_smooth, "earthrise", "earthset"), key=lambda e: e["t"])
    res["sunlit_periods"] = periods(t, sun_on)
    res["comm_windows"] = periods(t, earth_on)
    res["comm_gaps"] = periods(t, ~earth_on)

    nxt_set = next((e["t"] for e in res["events"] if e["type"] == "sunset"), None)
    summary = {
        "span_h": total_h, "sunlit_fraction": sun_frac, "sunlit_h": float(sun_on.sum() * step_h),
        "sunlit_fraction_smooth_horizon": float(sun_on_smooth.mean()),
        "earth_visible_fraction": earth_frac, "earth_visible_h": float(earth_on.sum() * step_h),
        "earth_visible_fraction_smooth_horizon": float(earth_on_smooth.mean()),
        "longest_dark_h": dark_h, "longest_comm_gap_h": no_comm_h,
        "sun_el_start": res["sun"]["el"][0], "sun_az_start": res["sun"]["az"][0],
        "earth_el_start": res["earth"]["el"][0], "earth_az_start": res["earth"]["az"][0],
        "sun_el_max": float(np.max(res["sun"]["el"])), "sun_el_mean": float(np.mean(res["sun"]["el"])),
        "sunlit_at_start": bool(sun_on[0]), "earth_visible_at_start": bool(earth_on[0]),
        "hours_to_sunset": ((dt.datetime.fromisoformat(nxt_set) - start).total_seconds() / 3600) if (nxt_set and sun_on[0]) else None,
        "incidence_terrain_start_deg": res["sun"]["incidence_terrain_deg"][0],
    }
    res["summary"] = summary
    load = (panel or {}).get("load_W")
    res["assessments"] = [
        {"id": "illumination", "label": "Illuminazione solare", "value": sun_frac, "unit": "frazione",
         "level": level(sun_frac, 0.7, 0.4),
         "basis": "Frazione del periodo con il disco solare (anche parziale) sopra l'orizzonte topografico LOLA. "
                  "Effemeridi JPL Horizons. Soglie dello strumento: ≥70% favorevole, ≥40% moderato."},
        {"id": "night", "label": "Notte più lunga", "value": dark_h, "unit": "ore",
         "level": level(dark_h, 48, 100, higher_better=False),
         "basis": "Intervallo continuo più lungo senza Sole visibile nel periodo analizzato (lo stesso orizzonte LOLA). "
                  "Soglie dello strumento: ≤48 h favorevole, ≤100 h moderato (sopravvivenza con batterie)."},
        {"id": "comm", "label": "Visibilità geometrica della Terra", "value": earth_frac, "unit": "frazione",
         "level": level(earth_frac, 0.9, 0.5),
         "basis": "Terra (anche parziale) sopra l'orizzonte topografico. È solo geometria: un collegamento reale richiede "
                  "anche antenna, puntamento, link budget e una stazione DSN visibile. Sotto il 50% serve un relay."},
        {"id": "slope", "label": "Pendenza del terreno", "value": info["slope_deg"], "unit": "gradi",
         "level": level(info["slope_deg"], 8, 15, higher_better=False),
         "basis": "Pendenza da LOLA LDEM_16 su base di circa 4 km: sottostima le pendenze locali. Soglia di "
                  "riferimento: <8° (requisito tipico per l'allunaggio Artemis). Serve un DEM più fine (LDEM 20 m) per una decisione."},
        {"id": "power", "label": "Energia solare", "value": power["mean_W"] if power else None, "unit": "W medi",
         "level": (level(power["mean_W"] / load, 1.0, 0.6) if (power and load) else "insufficient"),
         "basis": ("Potenza media del pannello configurato rispetto al carico richiesto: ≥100% favorevole, ≥60% moderato. "
                   + (power["model"] if power else "Configurare area, efficienza e carico del pannello.")) },
    ]
    return res
