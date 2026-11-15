# Lunar Eye — Mission Planner

[English](README.md) · **Italiano**

Production domain: `lunar-eye.it`.

Simulatore 3D del Sistema Solare e piattaforma di pianificazione di missioni lunari (NASA Space Apps Challenge).
Le posizioni e gli angoli vengono da **NASA/JPL Horizons**, il terreno da **NASA LRO LOLA**.

## Avvio

```bash
python3 -m venv .venv && .venv/bin/pip install fastapi uvicorn httpx numpy pytest
.venv/bin/python scripts/fetch_data.py        # LOLA LDEM_4/LDEM_16 (~35 MB) + texture, aggiorna data/registry.json
.venv/bin/uvicorn backend.app:app --port 8765 # poi aprire http://127.0.0.1:8765
.venv/bin/python -m pytest -q tests           # validazione contro Horizons (serve Node 18+ per il test JS)
```

Il frontend non ha passaggio di build: Three.js 0.169 e Chart.js 4.4 arrivano da jsDelivr tramite import map.
Al primo avvio serve la rete. Le risposte di Horizons restano in `data/cache/` e si riusano anche offline.

## Lingue e demo

- Interfaccia in **English / Italiano**, selezionabile con i pulsanti IT/EN nella barra in alto a destra. Inglese alla prima visita, scelta salvata nel browser (`lmp.language`).
- Leggibilità: menu a pulsanti da 15 px, controlli Explorer da 14 px e note da 13 px; canvas con etichette da 14 px. Barra temporale compatta con data/ora e velocità da 14 px.
- I pannelli Sito di allunaggio e Vista di Lunar Explorer si chiudono dalla testata e si riaprono dai pulsanti sul bordo inferiore del canvas; campi e controlli restano invariati. La visibilità viene ricordata nel browser (`lmp.explorer.panels`). Fonti e limiti del pannello Vista sono espandibili.
- Il cambio lingua conserva sito, campi modificati, tempo globale e risultati in memoria; non ripete i calcoli Horizons. Il ricaricamento della pagina azzera i risultati calcolati.
- Traduzioni: `frontend/js/locales/en.js`; i messaggi sorgente costituiscono il catalogo italiano. Testi statici marcati con `data-i18n`, testi dinamici tramite `t()`/`message()` in `frontend/js/i18n.js`. Solo le etichette dei siti predefiniti con `nameKey` vengono tradotte; i nomi scelti dall'utente restano invariati.
- Date e dati scientifici restano in UTC e unità dichiarate. Le colonne CSV hanno identificatori inglesi stabili per l'analisi dei dati; il PDF segue la lingua dell'interfaccia.
- [Percorso demo e copione IT/EN di 2 minuti](docs/demo.md), con configurazione e controlli prima della presentazione.

Verifiche della localizzazione: `node tests/i18n_check.mjs` (senza rete). Per il flusso completo con analisi reale, CSV e PDF: `node tests/demo_browser.mjs`, con app locale avviata e Playwright disponibile. `LMP_URL` cambia l'URL; `PLAYWRIGHT_MODULE` e `PLAYWRIGHT_EXECUTABLE` permettono di usare un'installazione esistente. Il controllo produce report e immagini in una cartella temporanea, stampata al termine.

## Deploy (Docker)

```bash
LUNAR_PORT=8765 docker compose up -d --build   # http://127.0.0.1:8765; reverse proxy: https://lunar-eye.it
docker compose logs -f lunar                   # il primo avvio scarica LOLA e texture (~55 MB) nei volumi
docker compose down                            # i volumi (dati e cache Horizons) restano; con -v si cancellano
```

- Un solo container, un solo worker (Horizons accetta una richiesta alla volta). Limiti: 512 MB di RAM, 1 CPU, filesystem in sola lettura, utente non root.
- Misurato in locale: ~170 MB di RAM dopo un'analisi di sito (3,4 s la prima volta), ~0,2% di CPU a riposo.
- La porta è legata a `127.0.0.1`: l'esposizione pubblica passa dal reverse proxy (HTTPS) del server.
- Health check: `GET /api/meta`. Serve accesso in uscita verso `ssd.jpl.nasa.gov`, `imbrium.mit.edu`, `svs.gsfc.nasa.gov` e `solarsystemscope.com`.
- Aggiornamento: `git pull && docker compose up -d --build`. Rollback: tornare al commit precedente e ripetere.
- Il registro `data/registry.json` resta quello del repository: nel container lo script gira con `--no-registry`.

Per Nginx è disponibile un esempio in `deploy/nginx/lunar-eye.it.conf.example`. Va adattato alla configurazione del VPS e completato con HTTPS prima di renderlo pubblico; il file non contiene certificati né segreti.

## Architettura

| Modulo | Ruolo |
|---|---|
| `backend/horizons.py` | Client Horizons: vettori ICRF e osservatore topocentrico sulla Luna, cache su disco, una richiesta alla volta (Horizons risponde 503 alle richieste parallele) |
| `backend/terrain.py` | DEM LOLA: quota, pendenza, maschera d'orizzonte (ray casting con curvatura), patch locali |
| `backend/site_analysis.py` | Sole e Terra dal sito, frazione del disco visibile, eventi, potenza dei pannelli, valutazioni |
| `backend/bodies.py` | Raggi e orientamento IAU WGCCRE 2015 |
| `frontend/js/science/` | Tempo, frame, interpolazione di Hermite, orientamento IAU (senza Three.js) |
| `frontend/js/render/` | Scene Three.js: Sistema Solare, globo lunare LOLA, vista dell'orizzonte locale |
| `frontend/js/ui/` | Le 6 pagine |
| `data/registry.json` | Registro delle fonti: URL, frame, risoluzione, unità, data, licenza |

## Dati e affidabilità

- **Reale**: campioni Horizons (DE441, ICRF, UTC), quote LOLA.
- **Interpolato**: posizioni tra i campioni, con Hermite cubica su posizione e velocità. Errore massimo misurato dai test: Mercurio 3,1 km (campioni ogni giorno), Terra 0,06 km, Marte 0,003 km, Luna 0,07 m (campioni ogni ora).
- **Approssimato**: visibilità con l'orizzonte LOLA (~1,9 km/px), potenza dei pannelli (senza perdite termiche, polvere o degrado), pendenze (base ~4 km, quindi sottostimate). Gli istanti degli eventi hanno un'incertezza di ±metà passo.
- **Illustrativo**: scala di visualizzazione (distanze compresse r′ = 40·√(r/AU), raggi ingranditi), nubi di Terra e Venere, dimostrazione del Centro didattico.
- Se Horizons non risponde, l'app mostra «dati non disponibili» e non inventa valori sostitutivi.

## Limiti noti

- **SPICE non è integrato.** Al suo posto si usa Horizons, che si basa sulle stesse effemeridi DE. L'orientamento dei pianeti segue IAU 2015, solo termini secolari.
- **Manca il DEM polare ad alta risoluzione** (LDEM 20 m). Il terreno usa LDEM_16, al massimo ~1,9 km/px.
- **Ombre:** quelle reciproche tra anelli e Saturno ci sono, calcolate per pixel. Mancano le eclissi Terra–Luna nella scena 3D.
- **Polo del globo:** oltre i 75° la quota è mediata su un disco di ~12 km per evitare le creste a raggiera della griglia lat/lon. Negli ultimi 1–2° resta una leggera raggiera, che viene dalla texture.
- **Comunicazioni solo geometriche:** manca il link budget radio, la visibilità delle stazioni DSN non è calcolata e la Terra visibile non garantisce il collegamento.
- **Grafica:** texture non compresse (niente KTX2) e un solo livello di dettaglio per il globo lunare.
- **Siti noti:** coordinate pubblicate arrotondate a 0,001°. Le regioni candidate per Artemis III non sono incluse, perché NASA non pubblica coordinate puntuali.

## Fonti

JPL Horizons API: https://ssd.jpl.nasa.gov/api/horizons.api ·
LOLA GDR: https://imbrium.mit.edu/DATA/LOLA_GDR/ ·
NASA SVS CGI Moon Kit: https://svs.gsfc.nasa.gov/4720 ·
Texture dei pianeti: Solar System Scope (CC BY 4.0) ·
Orientamento: Archinal et al. 2018, *Celest. Mech. Dyn. Astr.* 130:22.

## Spazio di lavoro e pannelli

Il pulsante con le doppie frecce nella barra temporale alterna navigazione estesa e compatta; la scelta viene ricordata in `lmp.sidebar`. Nella barra compatta i pulsanti numerati conservano titoli e nomi accessibili. Su schermi piccoli la prima visita parte compatta; il menu esteso si apre sopra il contenuto.

Ogni vista permette di chiudere i pannelli con × e ripristinarli: Lunar Explorer conserva i suoi pulsanti, le altre viste hanno il menu “Pannelli” in alto a destra. Stato separato per vista in `lmp.panels` (Explorer: `lmp.explorer.panels`). Nascondere non elimina i campi o i risultati e non avvia analisi. Il ripristino funziona da tastiera; il cambio lingua conserva le preferenze. Il reload continua ad azzerare i risultati scientifici in memoria. Nella stampa i pannelli informativi vengono inclusi anche se nascosti nello spazio di lavoro.

Mission Planning usa una scena centrale più ampia, tre strumenti per Sole/Terra/potenza, dettagli tecnici espandibili e una timeline collegata al tempo globale. Gli eventi sono pulsanti che spostano il cursore al campione più vicino all’evento, con l’incertezza dichiarata. Si riutilizzano risultati già calcolati; il calcolo resta esplicito con “Calcola geometria”. Il disegno della scena didattica si interrompe quando il suo pannello è nascosto.

Verifica dei controlli: `node tests/panels_browser.mjs` con le variabili Playwright/LMP_URL già descritte. Include sidebar persistente, pannelli nelle cinque viste oltre Explorer, campi conservati, timeline/lingue senza nuove analisi e screenshot a 1440/1100/390 px.

## Oggetti aggiuntivi e risorse

La scena Sistema Solare include un catalogo controllato: Ceres, Vesta, 1P/Halley, Voyager 1 e James Webb. Si attivano singolarmente dal pannello Scena; pianeti e Luna hanno checkbox di visibilità, collegate anche alle rispettive orbite. La scelta di un pianeta dalla lista lo rende visibile e lo segue. Il catalogo aggiuntivo parte disattivato e non viene scaricato finché non serve.

Gli oggetti aggiuntivi usano `/api/objects/{key}`: vettori Horizons ICRF baricentrici, finestre condivise di 30 giorni con campioni ogni ora, interpolazione Hermite. Intervallo dell’interfaccia API: 1950–2100, subordinato alla copertura di ciascun oggetto. Le sonde hanno copertura limitata e previsioni aggiornabili: non sono telemetria in diretta. Nessuna posizione viene inventata se manca la copertura. Icone e dimensioni sono illustrative; non vengono rappresentati assetti delle sonde o code delle comete. Le selezioni non persistono al reload. Non è un motore di ricerca sull’intero catalogo Horizons.

Rendering limitato a 30 fps e pixel ratio massimo 1,5. Il Sistema Solare ridisegna su cambiamenti (tempo, camera, oggetti, dimensioni); le schede nascoste sospendono rendering e avanzamento del tempo. Dopo errori delle effemeridi/orbite si attende almeno 30 s prima del retry; gli oggetti aggiuntivi richiedono disattivazione e riattivazione. Questi limiti riducono lavoro inutile, senza garantire consumi o fluidità su ogni dispositivo.

Verifica aggiuntiva: `node tests/objects_browser.mjs`, con le stesse variabili Playwright e LMP_URL della demo. Controlla caricamento dei cinque oggetti, visibilità e rendering a riposo; salva report e screenshot in `/tmp`. La misura headless non rappresenta un benchmark della GPU fisica.

## Esposizione pubblica

L’app resta senza login. Il singolo worker ammette al massimo 4 richieste API contemporanee e 120 al minuto complessive (esclusa `/api/meta`); oltre restituisce 429 con Retry-After. Questi valori sono iniziali, non una capacità multiutente misurata. I parametri di globo e patch sono limitati; le analisi con passo esplicito non possono superare 2000 intervalli. Il nuovo endpoint accetta solo identificatori del catalogo interno, non comandi Horizons arbitrari.

Prima del deploy pubblico: configurare HTTPS e limiti per IP/connessioni sul reverse proxy, verificare le pagine e i casi 429 con il proxy effettivo, verificare budget della cache, spazio libero del volume e monitoraggio memoria/CPU/errori. La cache scientifica ammette nuove scritture fino a 128 MiB o 4096 file JSON, senza scadenza automatica; la cache delle sonde va aggiornata quando servono previsioni recenti. Non è stato eseguito un test di carico né un penetration test. Un’eventuale password di preview va applicata sul proxy a sito e API insieme e trasmessa solo tramite HTTPS; non sostituisce questi limiti.

## Protezione delle risorse del VPS

Compose mantiene il limite di 512 MiB e una CPU, con memoria+swap pari al limite RAM (niente swap del container), /tmp limitata a 64 MiB, log Docker ruotati (3 file da 10 MB) e al massimo tre riavvii per errore. I limiti effettivi e il supporto del kernel vanno controllati sul server prima di pubblicare.

Le richieste API soggette al limite di ammissione hanno un timeout di 120 secondi, che annulla il lavoro asincrono e libera lo slot. Non interrompe immediatamente una funzione sincrona bloccante o un thread già in esecuzione: resta necessario il limite CPU/RAM del container. La cache Horizons non scrive nuovi file oltre 128 MiB o 4096 JSON; i dati appena calcolati vengono comunque restituiti. File preesistenti non sono cancellati: un volume già oltre soglia richiede gestione operativa. Cache piena può aumentare le richieste remote, entro i limiti API. Nessuna di queste misure dimostra la capacità del VPS condiviso.

Prima del deploy: misurare RAM/CPU/disco disponibili e carico degli altri servizi; provare il container con concorrenza crescente e controllare memoria di picco, latenza, errori, OOM e limiti effettivi. I criteri di arresto sono: altri servizi degradati, memoria al limite, OOM o spazio libero sotto il margine concordato. Se manca margine per il budget del container e del proxy, non pubblicare su quel VPS. La geometria Three.js viene disegnata dal browser del visitatore; il backend sostiene richieste, topografia e analisi.

## Riproduzione nella pianificazione

Il controllo del menu laterale è nella barra temporale, vicino a UTC. Nel menu compatto ogni numero mostra subito l’etichetta al passaggio del puntatore o al focus da tastiera; Escape la chiude. La vista dell’orizzonte mostra Sole e Terra soltanto dopo un calcolo disponibile; non rappresenta l’intero Sistema Solare. “Ricentra vista” ripristina camera e punto di osservazione; lo zoom è limitato e le etichette sono sfalsate senza alterare le posizioni scientifiche.

Play/Pausa è un unico controllo nella barra in testata, condiviso fra le viste. In Pianificazione è disabilitato finché manca un risultato e la timeline sotto la scena permette soltanto di scegliere il campione. In Pianificazione la riproduzione si arresta ai bordi del periodo calcolato; ripartendo dal bordo riprende dall’estremo opposto secondo il verso della velocità selezionata. Grafico e strumenti temporali si aggiornano al massimo quattro volte al secondo, riutilizzando i campioni. La scena dell’orizzonte ridisegna solo quando cambiano dati, camera, dimensioni o lingua. Il rendering continua durante l’assestamento della camera con smorzamento.

Verifica: `node tests/playback_browser.mjs`, con le variabili Playwright/LMP_URL descritte sopra. Controlla icone immediate, limite agli aggiornamenti, assenza di disegni a riposo e richieste API durante playback, arresto a fine missione e ricentratura. Le misure headless non garantiscono consumi CPU/GPU su ogni dispositivo. Il tutorial iniziale è ancora una proposta, non è implementato.


## Home e ingresso nell’app

L’URL senza hash apre una home IT/EN statica con accessi a Lunar Explorer, Pianificazione, Confronto siti e Sistema Solare, una guida rapida in cinque passi e fonti/limiti. La guida non avvia calcoli. `frontend/js/entry.js` inizializza la lingua e importa l’app soltanto entrando in una vista: in home non vengono caricati Three.js, Chart.js, texture o dati API e non si creano canvas. L’illustrazione è CSS, decorativa e senza animazione continua.

I link diretti `/#planning`, `/#explorer` e le altre viste restano validi. “Torna alla home” ricarica il documento, liberando renderer e ciclo dell’app. L’animazione orbitale di caricamento è conservata durante l’ingresso e si ferma quando nascosta; rispetta la preferenza di movimento ridotto. Nessun nuovo calcolo server automatico.

Verifica: `node tests/home_browser.mjs` con le variabili Playwright/LMP_URL già descritte. Copre lingue, guida, larghezze 1440/390px, assenza di richieste pesanti in home, ingresso in Pianificazione senza calcolo, ritorno home e link diretto Explorer. I test dell’app usano ora `/#solar` per saltare l’introduzione.

La guida rapida nella home offre anche “Avvia tutorial interattivo”: tre passi tra scelta del sito, configurazione e risultati. Il tutorial è chiudibile e non avvia calcoli. Nel Centro didattico si nasconde e ripristina l’intero esperimento 3D insieme ai suoi controlli; le schede degli argomenti restano visibili.
