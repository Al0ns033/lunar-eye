"""Catalogo controllato: nessun comando Horizons arbitrario dal browser."""
import datetime as dt
from . import horizons

OBJECTS = {
    "ceres": {"name": "1 Ceres", "kind": "asteroid", "command": "1;"},
    "vesta": {"name": "4 Vesta", "kind": "asteroid", "command": "4;"},
    "halley": {"name": "1P/Halley", "kind": "comet", "command": "DES=1P;CAP;"},
    "voyager1": {"name": "Voyager 1", "kind": "spacecraft", "command": "-31"},
    "jwst": {"name": "James Webb", "kind": "spacecraft", "command": "-170"},
}

async def states(key, start):
    # Finestre fisse di 30 giorni: niente date arbitrarie che moltiplicano la cache.
    epoch = dt.datetime(2000, 1, 1, tzinfo=dt.timezone.utc)
    offset = (start - epoch).days // 30 * 30
    t0 = epoch + dt.timedelta(days=offset)
    return await horizons.vectors(OBJECTS[key]["command"], "500@0", t0, t0 + dt.timedelta(days=30), "720")
