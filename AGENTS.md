# Lunar Mission Planner — istruzioni per l'agente

- Avvio, test e architettura: vedi README.md.
- Scienza separata dal rendering: niente calcoli scientifici in `frontend/js/render/`; nessun import di Three.js in `frontend/js/science/`.
- Mai inventare coordinate, angoli o quote: se un dato manca si mostra «dati non disponibili». Perché: requisito di integrità scientifica del progetto.
- Horizons accetta una sola richiesta alla volta per IP (le richieste parallele ricevono 503): passare sempre da `backend/horizons.py`.
- Dati scaricati (`data/raw`, `data/cache`, `frontend/textures`) fuori da git; ogni nuovo dataset va in `scripts/fetch_data.py` e quindi in `data/registry.json`.
