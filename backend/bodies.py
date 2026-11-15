"""Costanti fisiche e orientamento dei corpi.

Orientamento: IAU WGCCRE 2015 (Archinal et al. 2018, Celest. Mech. Dyn. Astr. 130:22), solo termini
secolari principali: alpha0, delta0 (polo nord in ICRF, gradi) e W = W0 + Wdot*d (d = giorni da J2000 TDB).
Raggi medi: stesso rapporto. Periodi orbitali: NASA Planetary Fact Sheet (solo per campionare le orbite).
"""

BODIES = {
    "sun":     {"id": "10",  "name": "Sole",     "radius_km": 695700.0, "ra0": 286.13,     "dec0": 63.87,     "w0": 84.176,     "wdot": 14.1844000},
    "mercury": {"id": "199", "name": "Mercurio", "radius_km": 2439.4,   "ra0": 281.0103,   "dec0": 61.4155,   "w0": 329.5988,   "wdot": 6.1385108,   "period_d": 87.969,  "orbit_id": "199"},
    "venus":   {"id": "299", "name": "Venere",   "radius_km": 6051.8,   "ra0": 272.76,     "dec0": 67.16,     "w0": 160.20,     "wdot": -1.4813688,  "period_d": 224.701, "orbit_id": "299"},
    "earth":   {"id": "399", "name": "Terra",    "radius_km": 6371.0,   "ra0": 0.0,        "dec0": 90.0,      "w0": 190.147,    "wdot": 360.9856235, "period_d": 365.256, "orbit_id": "399"},
    "moon":    {"id": "301", "name": "Luna",     "radius_km": 1737.4,   "ra0": 269.9949,   "dec0": 66.5392,   "w0": 38.3213,    "wdot": 13.17635815},
    "mars":    {"id": "499", "name": "Marte",    "radius_km": 3389.5,   "ra0": 317.269202, "dec0": 54.432516, "w0": 176.049863, "wdot": 350.891982443297, "period_d": 686.980, "orbit_id": "499"},
    "jupiter": {"id": "599", "name": "Giove",    "radius_km": 69911.0,  "ra0": 268.056595, "dec0": 64.495303, "w0": 284.95,     "wdot": 870.5360000, "period_d": 4332.59, "orbit_id": "5"},
    "saturn":  {"id": "699", "name": "Saturno",  "radius_km": 58232.0,  "ra0": 40.589,     "dec0": 83.537,    "w0": 38.90,      "wdot": 810.7939024, "period_d": 10759.22, "orbit_id": "6",
                "rings_km": [74500.0, 140220.0]},
    "uranus":  {"id": "799", "name": "Urano",    "radius_km": 25362.0,  "ra0": 257.311,    "dec0": -15.175,   "w0": 203.81,     "wdot": -501.1600928, "period_d": 30685.4, "orbit_id": "7"},
    "neptune": {"id": "899", "name": "Nettuno",  "radius_km": 24622.0,  "ra0": 299.36,     "dec0": 43.46,     "w0": 249.978,    "wdot": 541.1397757, "period_d": 60189.0, "orbit_id": "8"},
}

ORIENTATION_SOURCE = "IAU WGCCRE 2015 (Archinal et al. 2018), termini secolari principali; precisione visuale (~0.1°)"
