# Demo — Lunar Eye · Mission Planner

## Preparazione / Preparation

1. Avviare l'app seguendo il README. Aprire `http://127.0.0.1:8765`. / Start the app using the README and open that URL.
2. Scegliere **EN** o **IT** con i pulsanti nella barra in alto a destra. La prima visita usa l'inglese. / Choose EN or IT in the upper-right toolbar; first visits default to English.
3. In **Lunar Explorer**, selezionare **Apollo 17** dai siti noti. Coordinate pubblicate: 20.191° N, 30.772° E (NASA/LROC). / Select Apollo 17 from Known sites; these are published landing coordinates.
4. In **Planning / Pianificazione**, usare: nome `Lunar Demo`, inizio `2026-12-01 00:00 UTC`, durata `14` giorni, area `4 m²`, efficienza `0.30`, modalità verticale con inseguimento azimut, carico `300 W`. Sono impostazioni dimostrative della missione, non requisiti NASA. / These are demonstration mission settings, not NASA requirements.
5. Premere **Calculate geometry / Calcola geometria** e attendere i risultati reali. In **Site comparison / Confronto siti**, scegliere Apollo 17 e IM-1 Odysseus, stessa data e durata, quindi calcolare. Se non presenti nei salvati, aggiungerli dall'Explorer. / Calculate the mission, then compare Apollo 17 and IM-1 Odysseus over the same period; save them from Explorer if needed.
6. Controllare **Mission analysis / Analisi missione** e le fonti, quindi tornare a **Solar System / Sistema Solare**. I risultati restano in memoria finché la pagina non viene ricaricata; il cambio lingua li conserva. / Inspect the analysis and sources, then return to Solar System. Results remain in memory until reload; language changes preserve them.

Prima di presentare, completare i calcoli con la stessa configurazione: le risposte Horizons in cache riducono la dipendenza dalla rete. Texture, librerie e font possono comunque richiedere rete; non promettere una demo offline. Se mancano dati, mostrare il messaggio e riprovare: non sostituirli con numeri inventati.

Before presenting, calculate the exact configuration once to populate the Horizons cache. Textures, libraries and fonts may still need a connection; do not promise an offline demo. If data is unavailable, show the message and retry; never substitute invented numbers.

## Copione italiano — 2 minuti

| Tempo | Pagina e azione | Testo |
|---|---|---|
| 0:00–0:20 | Sistema Solare: selezionare Terra, mostrare le due scale | «Partiamo dal contesto: queste posizioni vengono da NASA/JPL Horizons. La scala di visualizzazione rende leggibili i pianeti; la scala scientifica mantiene distanze e raggi reali. I calcoli usano sempre le coordinate reali.» |
| 0:20–0:40 | Lunar Explorer: sito Apollo 17, poi vista Polo Sud | «Passiamo alla superficie lunare. Possiamo scegliere un sito noto o un punto sul globo e leggere quota e pendenza dal terreno LOLA. Le quote e la grafica dichiarano risoluzione ed esagerazione verticale.» |
| 0:40–1:10 | Pianificazione: risultati già calcolati; spostare il cursore | «Per questa missione dimostrativa analizziamo quattordici giorni. Il tempo collega la vista del cielo ai grafici: vediamo il Sole, la Terra, l'orizzonte del terreno e la potenza stimata del pannello. Gli eventi dichiarano l'incertezza dovuta al campionamento.» |
| 1:10–1:30 | Confronto siti: Apollo 17 e IM-1 | «Confrontiamo due siti nello stesso periodo. Luce, durata della notte e visibilità della Terra aiutano a capire i compromessi. Le valutazioni usano soglie dichiarate dello strumento, non sono una certificazione di sicurezza.» |
| 1:30–1:50 | Analisi missione: valutazioni, fonti, pulsanti export | «Il riepilogo rende consultabili risultati, criteri e fonti, con esportazione CSV e stampa in PDF. La visibilità della Terra è geometrica: non garantisce un collegamento radio. Il terreno attuale non risolve massi e piccoli rilievi.» |
| 1:50–2:00 | Centro didattico: muovere longitudine solare | «Chiudiamo con un esperimento didattico sull'illuminazione polare. Qui il Sole è controllato a mano: la dimostrazione è esplicitamente illustrativa. L'interfaccia è disponibile in italiano e inglese.» |

## English script — 2 minutes

| Time | Page and action | Narration |
|---|---|---|
| 0:00–0:20 | Solar System: select Earth and show both scales | “We start with the context: these positions come from NASA/JPL Horizons. The visual scale makes planets readable; the scientific scale preserves real distances and radii. Calculations always use real coordinates.” |
| 0:20–0:40 | Lunar Explorer: Apollo 17 site, then South Pole view | “Now we move to the lunar surface. We can choose a known landing site or a point on the globe and inspect elevation and slope from LOLA terrain. The interface states the resolution and vertical exaggeration.” |
| 0:40–1:10 | Planning: precomputed results; move the timeline cursor | “For this demonstration mission we analyse fourteen days. Time links the sky view to the charts: we see the Sun, Earth, terrain horizon and estimated panel power. Events state their sampling uncertainty.” |
| 1:10–1:30 | Site comparison: Apollo 17 and IM-1 | “We compare two sites over the same period. Sunlight, night duration and Earth visibility help us understand the trade-offs. Assessments use declared tool thresholds; they are not a safety certification.” |
| 1:30–1:50 | Mission analysis: assessments, sources and export buttons | “The summary brings together results, criteria and sources, with CSV export and PDF printing. Earth visibility is geometric: it does not guarantee a radio link. The current terrain does not resolve boulders and small features.” |
| 1:50–2:00 | Learning centre: move subsolar longitude | “We finish with an educational experiment on polar illumination. Here the Sun is controlled manually: the demonstration is explicitly illustrative. The interface is available in English and Italian.” |

## Controllo prima della presentazione / Preflight

- Lingua corretta, nome `Lunar Demo`, sito Apollo 17 e periodo coerente nelle due pagine. / Correct language, mission name, site and matching comparison period.
- Nessun caricamento o errore pendente; nessun valore del copione presume un risultato numerico. / No pending loading or errors; the script assumes no numerical outcome.
- Barra globale dentro il periodo della missione; pausa prima di iniziare. / Global time inside the mission period; pause before starting.
- Browser desktop a schermo intero; provare CSV e stampa PDF prima della presentazione. / Full-screen desktop browser; try CSV and PDF printing before presenting.
