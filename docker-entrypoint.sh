#!/bin/sh
# Al primo avvio scarica i dataset nei volumi (LOLA + texture, ~55 MB); poi li riusa.
set -e
if [ ! -f data/raw/LDEM_16.IMG ] || [ ! -f frontend/textures/moon.jpg ] || [ ! -f frontend/textures/earth.jpg ]; then
  echo "dataset mancanti: scarico (primo avvio)"
  python scripts/fetch_data.py --no-registry
fi
exec "$@"
