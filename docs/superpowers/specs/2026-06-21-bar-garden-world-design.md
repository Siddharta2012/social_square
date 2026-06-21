# Social Square — Da Bar a Paese: Design & Roadmap

**Data:** 2026-06-21
**Stato:** Bozza in revisione
**Autore:** Valentino De Pietro (+ Claude)

## Visione

Trasformare l'attuale singola stanza `BarScene` in un **mondo continuo** — un bar con
giardino che nel tempo cresce fino a diventare un piccolo paese. Il mondo si carica
**a settori** con feedback di caricamento, la camera resta **sempre centrata sul
giocatore**, la grafica è vettoriale ma ricca, e le funzionalità sociali aumentano
(sedute, chat, emote, jukebox, camerieri-bot).

Il progetto è troppo ampio per un singolo spec: viene decomposto in **fasi**, ciascuna
con il proprio spec di dettaglio e il proprio ciclo implementazione → verifica.

---

## Architettura di fondo: mondo a settori

### Modello dati

- Il mondo è diviso in **settori (chunk)** di `SECTOR_SIZE × SECTOR_SIZE` tile
  (valore iniziale proposto: 24).
- Ogni settore ha:
  - ID `(sx, sy)` in coordinate di settore;
  - una matrice di tile con: tipo di terreno, `walkable`, eventuali decorazioni e
    riferimenti a oggetti interattivi.
- I dati di un settore sono **caricabili in modo asincrono** tramite `loadSector(sx, sy)`
  (dynamic import di un modulo TS o fetch di un JSON). Questo abilita loader reali e la
  futura espansione senza gonfiare il bundle iniziale.

### Coordinate

- **Coordinate tile globali** `(gx, gy)`: usate da movimento, pathfinding, posizioni
  avatar e oggetti. Sono la fonte di verità.
- Conversione: `sx = floor(gx / SECTOR_SIZE)`, `localX = gx mod SECTOR_SIZE` (idem y).
- Le coordinate iso (schermo) restano calcolate da `IsometricSystem.worldToIso(gx, gy)`.

### Streaming dei settori

- Si tengono attivi il settore del giocatore + l'anello 3×3 attorno.
- Al cambio di settore: l'anello successivo viene **pre-caricato in background**, quelli
  fuori raggio vengono **scaricati** (Graphics/Container distrutti) per liberare memoria.
- Ogni settore renderizza i propri tile in un proprio layer Graphics, aggiunto/rimosso al
  load/unload (no redraw dell'intero mondo).
- Depth sorting iso resta globale (avatar e decorazioni ordinati per `gx+gy`).

### Loading feedback

- **Primo ingresso nel mondo:** loader a schermo intero ("Caricamento mondo…") finché il
  ring iniziale è pronto.
- **Settori successivi:** pre-caricamento anticipato così l'area è pronta prima di
  arrivarci; indicatore discreto in un angolo ("Caricamento area…") mentre uno stream è in
  corso.
- **Caso limite:** se il giocatore raggiunge il bordo di un settore non ancora pronto, il
  movimento oltre il bordo è bloccato con messaggio finché il settore è caricato.

### Camera sempre centrata

- Rimuovere il clamp dei bounds (niente `setBounds`, o bounds molto ampi non vincolanti).
- `startFollow(avatar, roundPixels, lerpX, lerpY)` con lerp stretto: il giocatore resta al
  centro dello schermo in ogni momento, anche ai bordi della porzione caricata.

### Astrazione WorldMap

- Nuova classe `WorldMap` che incapsula i settori attivi ed espone:
  - `isWalkable(gx, gy): boolean`
  - `getTile(gx, gy): TileData | null`
  - `ensureLoaded(sx, sy): Promise<void>` / `unload(sx, sy)`
- `MovementSystem` viene rifattorizzato per interrogare `WorldMap.isWalkable` in coordinate
  globali, invece di ricevere una singola matrice `boolean[][]`.

### Implicazioni di rete (per fasi successive)

- Con una mappa grande, fare broadcast di tutti i giocatori a tutti non scala. L'**interest
  management per settore** (ricevi solo i giocatori vicini) è previsto in Fase 6. Per ora si
  mantiene il broadcast a singola stanza (adeguato a pochi utenti).

---

## Roadmap a fasi

### Fase 0 — Mondo continuo (fondamenta)
- Sistema a settori + `WorldMap` + coordinate globali.
- Refactor `MovementSystem` su `WorldMap`.
- Camera sempre centrata (rimozione bounds).
- Loader async + feedback (full-screen iniziale, indicatore per settore, blocco al bordo).
- Migrazione del bar attuale come settore `(0,0)` + un settore giardino adiacente, per
  validare lo streaming con due aree contigue.
- **Criterio di completamento:** ci si muove con continuità tra bar e giardino, camera
  centrata, settori che caricano/scaricano senza glitch.

### Fase 1 — Grafica ricca
- Bar: muri con altezza, pavimento a doghe, bancone 3D, sgabelli, scaffali con bottiglie,
  tavoli.
- Giardino: erba, vialetti, alberi, cespugli, ombrelloni, panche, tavolini, lucine.
- Ambiente: ombre morbide sotto entità, **ciclo giorno/notte** (overlay di tinta nel tempo)
  con glow delle luci di notte.

### Fase 2 — Sedute + emote
- Sedersi su sedie/panche: nuovo stato `sit` sincronizzato; click su una seduta libera.
- Emote (saluto, ballo, applauso) usando gli eventi `emote` / `user-emote` già nel
  protocollo; animazioni client + tasti rapidi + voci HUD.

### Fase 3 — Chat testuale + bolle
- Input chat nell'HUD; nuovo evento socket per i messaggi.
- Fumetti sopra l'avatar con dissolvenza automatica; cronologia recente opzionale.

### Fase 4 — Jukebox + musica
- Oggetto interattivo jukebox; stato musicale condiviso (traccia + posizione) sincronizzato
  via `object-state-changed`.
- Riproduzione audio lato client (HTML Audio) con tracce royalty-free.

### Fase 5 — Camerieri bot + ordinazioni
- NPC lato server con macchina a stati (idle → vai al bancone → porta al cliente →
  consegna); inclusi nello stato stanza e sincronizzati ai client come avatar speciali con
  vassoio.
- UI di ordinazione: "chiama cameriere" → il bot raggiunge il giocatore → menu ordine → il
  bot recupera e consegna l'oggetto in mano.

### Fase 6+ — Espansione paese
- Nuovi settori: strade, piazza, negozi, altri POI.
- Interest management di rete per settore/area.

---

## Approccio e ordine

Si parte dalla **Fase 0**: è il prerequisito architetturale di tutto il resto e consegna
subito il requisito chiave ("mappa continua sempre centrata sul giocatore"). Costruire le
funzionalità prima della base significherebbe doverle rifare.

Ogni fase: spec di dettaglio → piano implementativo → implementazione → verifica → deploy.

## Rischi e note

- **Performance Phaser Graphics** su mondo grande: mitigata dal rendering per-settore e
  unload aggressivo; valutare cache su texture statiche se necessario.
- **Bundle Phaser già grande** (~1.5 MB): i settori async evitano di peggiorarlo.
- **Sync di rete** su mappa estesa: rimandata a Fase 6 con interest management.
- **Asset audio/musica** (Fase 4) e bilanciamento bot (Fase 5) richiederanno scelte di
  contenuto dedicate.
