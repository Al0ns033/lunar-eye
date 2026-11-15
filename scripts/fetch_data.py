"""Scarica i dataset (LOLA, texture) e aggiorna data/registry.json.

Uso: .venv/bin/python scripts/fetch_data.py
I file scaricati stanno in data/raw e frontend/textures (fuori da git, regola T3);
il registro con fonte, URL, unità, risoluzione e licenza è versionato.
"""
import datetime as dt
import json
import pathlib
import shutil
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
TEX = ROOT / "frontend" / "textures"
REGISTRY = ROOT / "data" / "registry.json"

SSS = "https://www.solarsystemscope.com/textures/download/"
SSS_LIC = "CC BY 4.0, Solar System Scope (INOVE). Mappe derivate da dati NASA/JPL/USGS. Uso estetico, non scientifico."

DATASETS = [
    {
        "id": "lola_ldem_4", "kind": "scientific-terrain", "dest": RAW / "LDEM_4.IMG",
        "url": "https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG/LDEM_4.IMG",
        "source": "NASA LRO LOLA, PDS Geosciences Node (mirror MIT imbrium)",
        "name": "LOLA GDR LDEM_4 (Digital Elevation Model)",
        "coordinate_system": "Moon ME (Mean Earth/Polar Axis), cilindrica semplice, lon 0..360 E, lat +90..-90",
        "resolution": "4 px/grado (~7.6 km/px all'equatore)",
        "units": "DN int16 LSB; altezza m = DN*0.5 rispetto a sfera R=1737400 m",
        "license": "NASA/PDS, pubblico dominio. Citare: Smith et al., LRO LOLA team.",
    },
    {
        "id": "lola_ldem_16", "kind": "scientific-terrain", "dest": RAW / "LDEM_16.IMG",
        "url": "https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG/LDEM_16.IMG",
        "source": "NASA LRO LOLA, PDS Geosciences Node (mirror MIT imbrium)",
        "name": "LOLA GDR LDEM_16 (Digital Elevation Model)",
        "coordinate_system": "Moon ME, cilindrica semplice, lon 0..360 E, lat +90..-90",
        "resolution": "16 px/grado (~1.9 km/px all'equatore)",
        "units": "DN int16 LSB; altezza m = DN*0.5 rispetto a sfera R=1737400 m",
        "license": "NASA/PDS, pubblico dominio.",
    },
    {
        "id": "moon_color", "kind": "aesthetic-texture", "dest": TEX / "moon.tif",
        "url": "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif",
        "source": "NASA Scientific Visualization Studio, CGI Moon Kit (LROC WAC)",
        "name": "LROC color mosaic with poles, 4k",
        "coordinate_system": "cilindrica semplice, centro lon 0", "resolution": "4096x2048",
        "units": "RGB 8 bit", "license": "NASA SVS, pubblico dominio (credit NASA SVS / LROC)",
    },
]
for body, fname in [("sun", "2k_sun.jpg"), ("mercury", "2k_mercury.jpg"), ("venus", "2k_venus_atmosphere.jpg"),
                    ("earth", "2k_earth_daymap.jpg"), ("earth_night", "2k_earth_nightmap.jpg"),
                    ("earth_clouds", "2k_earth_clouds.jpg"), ("earth_specular", "2k_earth_specular_map.tif"),
                    ("mars", "2k_mars.jpg"), ("jupiter", "2k_jupiter.jpg"), ("saturn", "2k_saturn.jpg"),
                    ("saturn_ring", "2k_saturn_ring_alpha.png"), ("uranus", "2k_uranus.jpg"),
                    ("neptune", "2k_neptune.jpg"), ("stars", "2k_stars_milky_way.jpg")]:
    ext = fname.rsplit(".", 1)[1]
    DATASETS.append({
        "id": f"tex_{body}", "kind": "aesthetic-texture", "dest": TEX / f"{body}.{ext}", "url": SSS + fname,
        "source": "Solar System Scope", "name": fname, "coordinate_system": "cilindrica semplice (equirettangolare)",
        "resolution": "2048x1024", "units": "RGB 8 bit", "license": SSS_LIC,
    })


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    TEX.mkdir(parents=True, exist_ok=True)
    registry = json.loads(REGISTRY.read_text()) if REGISTRY.exists() else {}
    for d in DATASETS:
        dest = d["dest"]
        if not dest.exists():
            print("scarico", d["url"])
            req = urllib.request.Request(d["url"], headers={"User-Agent": "lunar-mission-planner/0.1"})
            with urllib.request.urlopen(req, timeout=300) as r:
                dest.write_bytes(r.read())
            registry.setdefault(d["id"], {})["retrieved"] = dt.date.today().isoformat()
        if dest.suffix == ".tif":  # i browser non leggono TIFF: conversione in JPG con sips (macOS) o Pillow
            jpg = dest.with_suffix(".jpg")
            if not jpg.exists():
                if shutil.which("sips"):
                    subprocess.run(["sips", "-s", "format", "jpeg", str(dest), "--out", str(jpg)], check=True,
                                   capture_output=True)
                else:  # Linux/container: Pillow
                    from PIL import Image
                    Image.MAX_IMAGE_PIXELS = None
                    Image.open(dest).convert("RGB").save(jpg, quality=92)
        entry = {k: v for k, v in d.items() if k != "dest"}
        entry["file"] = str(dest.relative_to(ROOT))
        entry["bytes"] = dest.stat().st_size
        entry["retrieved"] = registry.get(d["id"], {}).get("retrieved", dt.date.today().isoformat())
        registry[d["id"]] = entry
    if "--no-registry" in sys.argv:  # container: il registro versionato resta quello del repository
        return
    REGISTRY.write_text(json.dumps(registry, indent=2, ensure_ascii=False))
    print("registro aggiornato:", len(registry), "voci")


if __name__ == "__main__":
    main()
