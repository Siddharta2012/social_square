# Social Square — Piano di Progetto Completo

> **Versione:** 1.0  
> **Data:** Giugno 2026  
> **Autore:** Game Design & Architecture Team  
> **Stato:** Draft — In revisione

---

## Indice

1. [Visione del Prodotto](#1-visione-del-prodotto)
2. [Architettura Tecnica](#2-architettura-tecnica)
3. [Struttura del Progetto](#3-struttura-del-progetto)
4. [Design delle Stanze](#4-design-delle-stanze)
5. [Sistema Avatar](#5-sistema-avatar)
6. [Voice Chat](#6-voice-chat)
7. [Backend — API e Sincronizzazione](#7-backend--api-e-sincronizzazione)
8. [UI/UX](#8-uiux)
9. [Asset Pipeline](#9-asset-pipeline)
10. [Fasi di Sviluppo — Roadmap](#10-fasi-di-sviluppo--roadmap)
11. [Performance Budget](#11-performance-budget)
12. [Sicurezza e Moderazione](#12-sicurezza-e-moderazione)

---

## 1. Visione del Prodotto

### 1.1 Concept

Social Square è un **social space browser-based** in pixel-art isometrica. Gli utenti scelgono un avatar, entrano in stanze tematiche e interagiscono tra loro tramite **voice chat in tempo reale** mentre i loro personaggi si muovono nell'ambiente. Non è un gioco con obiettivi o punteggi: è uno **spazio sociale virtuale leggero**, pensato per essere aperto in un tab del browser come si aprirebbe una chat.

### 1.2 Principi Guida

| Principio | Descrizione |
|-----------|-------------|
| **Zero Friction** | Nessuna installazione, nessun plugin. Funziona subito nel browser. |
| **Leggerezza** | Bundle < 2 MB, 60 FPS su hardware modesto (Intel HD 620, 4 GB RAM). |
| **Presenza Sociale** | La voce e il movimento dell'avatar trasmettono presenza reale. |
| **Espandibilità** | Aggiungere una nuova stanza richiede solo un nuovo modulo, senza toccare il core. |
| **Accessibilità** | Funziona su mobile e desktop, tastiera e touch. |

### 1.3 Utenti Target

- **Amici** che vogliono "stare insieme" online senza la rigidità di una videochiamata
- **Community** di giocatori, streamer, studenti che cercano uno spazio informale
- **Lavoratori remoti** che vogliono un "ufficio virtuale" leggero

---

## 2. Architettura Tecnica

### 2.1 Panoramica dei Componenti

```mermaid
graph TB
    subgraph Client["Browser Client"]
        PH[Phaser 3 Engine]
        TS[TypeScript App]
        LK[LiveKit SDK]
        UI[React HUD Layer]
    end

    subgraph Gateway["API Gateway / Nginx"]
        NG[Nginx Reverse Proxy]
        SSL[SSL Termination]
    end

    subgraph AppServer["App Server — Node.js"]
        EX[Express REST API]
        SIO[Socket.IO Server]
        AUTH[Auth Middleware]
        RM[Room Manager]
        SM[State Manager]
    end

    subgraph VoiceServer["Voice Server"]
        LKS[LiveKit Server]
        SFU[SFU — Selective Forwarding Unit]
    end

    subgraph DataLayer["Data Layer"]
        RD[(Redis — Presenza/Stanze)]
        PG[(PostgreSQL — Utenti/Profili)]
    end

    Client -->|HTTPS / WSS| Gateway
    Gateway --> AppServer
    Gateway --> VoiceServer
    AppServer --> DataLayer
    LK -->|WebRTC| SFU
    SIO <-->|WebSocket| TS
```

### 2.2 Flusso Dati — Ingresso in una Stanza

```mermaid
sequenceDiagram
    participant U as Utente (Browser)
    participant API as REST API
    participant SIO as Socket.IO
    participant LK as LiveKit
    participant RD as Redis

    U->>API: POST /auth/login
    API-->>U: JWT Token

    U->>API: GET /rooms (lista stanze disponibili)
    API->>RD: HGETALL rooms:*
    RD-->>API: Stanze + conteggio utenti
    API-->>U: Lista stanze con metadati

    U->>API: POST /rooms/:id/join
    API->>LK: Genera token LiveKit per la stanza
    LK-->>API: Token audio
    API-->>U: { roomToken, liveKitToken, roomState }

    U->>SIO: connect() + emit('join-room', { roomId, avatarData })
    SIO->>RD: HSET room:{id}:users {userId} {avatarData}
    SIO-->>U: emit('room-state', { users[], objects[] })
    SIO-->>OtherUsers: emit('user-joined', { userId, avatarData, position })

    U->>LK: room.connect(liveKitUrl, liveKitToken)
    LK-->>U: Audio stream attivo
```

### 2.3 Flusso Dati — Movimento Avatar

```mermaid
sequenceDiagram
    participant U as Utente
    participant PH as Phaser (Client)
    participant SIO as Socket.IO
    participant RD as Redis
    participant Others as Altri Utenti

    U->>PH: Click/Touch su destinazione
    PH->>PH: Calcola path (A* semplificato)
    PH->>PH: Avvia animazione movimento

    loop Ogni 50ms (throttled)
        PH->>SIO: emit('move', { x, y, direction, animation })
        SIO->>RD: HSET room:{id}:users:{userId} position {x,y}
        SIO->>Others: emit('user-moved', { userId, x, y, direction })
    end

    Others->>Others: Interpola posizione avatar remoto
```

### 2.4 Scelte Tecnologiche — Motivazioni

#### Frontend: Phaser 3 + TypeScript

**Perché Phaser 3:**
- Engine 2D maturo, ottimizzato per browser (WebGL con fallback Canvas)
- Gestione nativa di sprite sheet, tilemap, animazioni, input
- Bundle minificato ~1 MB, nessuna dipendenza pesante
- Ottimo supporto per pixel-art (nearest-neighbor scaling nativo)
- Community attiva, documentazione eccellente

**Alternative scartate:**
- *PixiJS*: Ottimo renderer ma manca di game loop, input, physics integrati — richiederebbe più boilerplate
- *Unity WebGL*: Bundle > 20 MB, non adatto a dispositivi modesti
- *Three.js*: Overkill per 2D isometrico, complessità non necessaria

#### Voice Chat: LiveKit

**Perché LiveKit:**
- Open source, self-hostable (nessun costo per chiamata)
- SDK JavaScript moderno con TypeScript support nativo
- SFU architecture: scalabile, bassa latenza
- Supporto nativo per "room" audio — perfetto per il modello a stanze
- Indicatori di volume/speaking integrati nell'SDK

**Alternative valutate:**
- *Agora SDK*: Eccellente ma pricing per minuto, vendor lock-in
- *Daily.co*: Semplice ma meno controllo, pricing
- *Mediasoup*: Più flessibile ma richiede più infrastruttura custom

#### Backend: Node.js + Socket.IO

**Perché Socket.IO:**
- Gestione automatica di reconnect, fallback polling
- Rooms e namespaces nativi — mappano perfettamente alle stanze del gioco
- Bassa latenza per aggiornamenti di posizione
- Integrazione semplice con Redis adapter per scaling orizzontale

#### Database: Redis + PostgreSQL

**Redis** per dati volatili ad alta frequenza:
- Stato corrente delle stanze (chi è dentro, posizioni)
- Presenza utenti (online/offline)
- Rate limiting
- TTL automatico per cleanup

**PostgreSQL** per dati persistenti:
- Profili utente, avatar personalizzati
- Statistiche, storico
- Configurazione stanze

---

## 3. Struttura del Progetto

### 3.1 Directory Tree Completo

```
social-square/
├── apps/
│   ├── client/                          # Frontend Phaser + TypeScript
│   │   ├── public/
│   │   │   ├── index.html
│   │   │   ├── favicon.ico
│   │   │   └── assets/                  # Asset statici (copiati dal build)
│   │   ├── src/
│   │   │   ├── main.ts                  # Entry point
│   │   │   ├── config/
│   │   │   │   ├── game.config.ts       # Configurazione Phaser
│   │   │   │   ├── rooms.config.ts      # Definizioni stanze
│   │   │   │   └── constants.ts         # Costanti globali
│   │   │   ├── scenes/
│   │   │   │   ├── BootScene.ts         # Preload assets globali
│   │   │   │   ├── PreloadScene.ts      # Loading screen
│   │   │   │   ├── MenuScene.ts         # Menu principale
│   │   │   │   ├── LobbyScene.ts        # Selezione stanza
│   │   │   │   ├── AvatarScene.ts       # Personalizzazione avatar
│   │   │   │   └── rooms/
│   │   │   │       ├── BaseRoomScene.ts # Classe base per tutte le stanze
│   │   │   │       ├── MallScene.ts     # Centro Commerciale
│   │   │   │       ├── BarScene.ts      # Bar
│   │   │   │       ├── ParkScene.ts     # Picnic al Parco
│   │   │   │       └── LakeScene.ts     # Pesca al Lago
│   │   │   ├── systems/
│   │   │   │   ├── IsometricSystem.ts   # Conversioni coordinate iso
│   │   │   │   ├── MovementSystem.ts    # Pathfinding e movimento
│   │   │   │   ├── NetworkSystem.ts     # Socket.IO client wrapper
│   │   │   │   ├── VoiceSystem.ts       # LiveKit integration
│   │   │   │   ├── AvatarSystem.ts      # Gestione avatar locali/remoti
│   │   │   │   ├── InteractionSystem.ts # Click su oggetti interattivi
│   │   │   │   └── CameraSystem.ts      # Camera follow, zoom
│   │   │   ├── entities/
│   │   │   │   ├── Avatar.ts            # Classe avatar (locale e remoto)
│   │   │   │   ├── RemoteAvatar.ts      # Avatar altri utenti
│   │   │   │   ├── InteractiveObject.ts # Oggetti cliccabili
│   │   │   │   └── SpeakingIndicator.ts # Indicatore visivo voce
│   │   │   ├── ui/
│   │   │   │   ├── HUD.tsx              # React overlay HUD
│   │   │   │   ├── RoomList.tsx         # Lista stanze
│   │   │   │   ├── AvatarCustomizer.tsx # UI personalizzazione
│   │   │   │   ├── VoiceControls.tsx    # Mute/unmute, volume
│   │   │   │   ├── UserList.tsx         # Lista utenti in stanza
│   │   │   │   └── Tooltip.tsx          # Tooltip oggetti
│   │   │   ├── store/
│   │   │   │   ├── gameStore.ts         # Zustand store globale
│   │   │   │   ├── roomStore.ts         # Stato stanza corrente
│   │   │   │   └── userStore.ts         # Dati utente locale
│   │   │   ├── utils/
│   │   │   │   ├── isoMath.ts           # Matematica isometrica
│   │   │   │   ├── pathfinder.ts        # A* pathfinding
│   │   │   │   ├── interpolation.ts     # Interpolazione posizioni
│   │   │   │   └── assetLoader.ts       # Utility caricamento asset
│   │   │   └── types/
│   │   │       ├── room.types.ts
│   │   │       ├── avatar.types.ts
│   │   │       ├── network.types.ts
│   │   │       └── voice.types.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   │
│   └── server/                          # Backend Node.js
│       ├── src/
│       │   ├── index.ts                 # Entry point server
│       │   ├── config/
│       │   │   ├── env.ts               # Variabili d'ambiente
│       │   │   ├── redis.ts             # Connessione Redis
│       │   │   └── database.ts          # Connessione PostgreSQL
│       │   ├── api/
│       │   │   ├── routes/
│       │   │   │   ├── auth.routes.ts
│       │   │   │   ├── rooms.routes.ts
│       │   │   │   ├── users.routes.ts
│       │   │   │   └── voice.routes.ts
│       │   │   └── middleware/
│       │   │       ├── auth.middleware.ts
│       │   │       ├── rateLimit.middleware.ts
│       │   │       └── validation.middleware.ts
│       │   ├── socket/
│       │   │   ├── socketServer.ts      # Setup Socket.IO
│       │   │   ├── handlers/
│       │   │   │   ├── roomHandlers.ts  # join/leave/move
│       │   │   │   ├── chatHandlers.ts  # Messaggi testo (futuro)
│       │   │   │   └── interactionHandlers.ts
│       │   │   └── middleware/
│       │   │       └── socketAuth.ts
│       │   ├── services/
│       │   │   ├── RoomService.ts       # Logica stanze
│       │   │   ├── UserService.ts       # Logica utenti
│       │   │   ├── VoiceService.ts      # LiveKit token generation
│       │   │   ├── PresenceService.ts   # Tracciamento presenza
│       │   │   └── StateService.ts      # Sincronizzazione stato
│       │   └── models/
│       │       ├── User.ts              # Modello PostgreSQL
│       │       ├── Room.ts
│       │       └── AvatarConfig.ts
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/                          # Tipi e costanti condivisi
│       ├── src/
│       │   ├── types/
│       │   │   ├── events.ts            # Nomi eventi Socket.IO
│       │   │   ├── room.ts
│       │   │   └── avatar.ts
│       │   └── constants/
│       │       └── rooms.ts
│       └── package.json
│
├── assets/                              # Asset sorgente (non nel bundle)
│   ├── sprites/
│   │   ├── avatars/
│   │   │   ├── base/                    # Sprite base avatar
│   │   │   └── accessories/             # Accessori
│   │   ├── rooms/
│   │   │   ├── mall/
│   │   │   ├── bar/
│   │   │   ├── park/
│   │   │   └── lake/
│   │   └── ui/
│   ├── tilesets/
│   │   ├── isometric_base.png
│   │   └── isometric_objects.png
│   └── audio/
│       └── sfx/
│
├── docker/
│   ├── Dockerfile.client
│   ├── Dockerfile.server
│   └── livekit.yaml
├── docker-compose.yml
├── docker-compose.prod.yml
├── nginx/
│   └── nginx.conf
├── scripts/
│   ├── generate-sprites.js
│   └── pack-atlas.js
├── GAME_PLAN.md
└── README.md
```

### 3.2 Moduli Principali — Responsabilità

| Modulo | File | Responsabilità |
|--------|------|----------------|
| `IsometricSystem` | `systems/IsometricSystem.ts` | Conversione coordinate cartesiane ↔ isometriche, depth sorting |
| `MovementSystem` | `systems/MovementSystem.ts` | A* pathfinding, animazione movimento, collision detection |
| `NetworkSystem` | `systems/NetworkSystem.ts` | Wrapper Socket.IO, gestione eventi, reconnect logic |
| `VoiceSystem` | `systems/VoiceSystem.ts` | LiveKit room, publish/subscribe audio, speaking detection |
| `AvatarSystem` | `systems/AvatarSystem.ts` | Spawn/despawn avatar, sincronizzazione stato remoto |
| `BaseRoomScene` | `scenes/rooms/BaseRoomScene.ts` | Tilemap, camera, sistemi comuni a tutte le stanze |

---

## 4. Design delle Stanze

### 4.1 Sistema Isometrico — Fondamenti

La proiezione isometrica usata è la **2:1 dimetrica** (standard pixel-art):
- Tile base: **64×32 px** (larghezza × altezza)
- Angolo di proiezione: 26.565° (arctan(0.5))
- Ogni tile occupa una cella logica di **32×32** unità nel mondo

```typescript
// utils/isoMath.ts
export function worldToIso(worldX: number, worldY: number): { x: number; y: number } {
  return {
    x: (worldX - worldY) * 32,   // 32 = metà larghezza tile
    y: (worldX + worldY) * 16,   // 16 = metà altezza tile
  };
}

export function isoToWorld(isoX: number, isoY: number): { x: number; y: number } {
  return {
    x: (isoX / 32 + isoY / 16) / 2,
    y: (isoY / 16 - isoX / 32) / 2,
  };
}

// Depth sorting: gli oggetti più "in basso" sullo schermo sono davanti
export function getDepth(worldX: number, worldY: number): number {
  return worldX + worldY;
}
```

### 4.2 Stanza 1 — Centro Commerciale

**Atmosfera:** Vivace, colorata, luci al neon, musica pop leggera in sottofondo.

**Dimensioni griglia:** 24×20 tile

**Layout:**

```
+--------------------------------------------------+
|  [Vetrina Moda]  [Vetrina Tech]  [Vetrina Cibo]  |
|                                                  |
|  [Negozio A]     [Fontana]       [Negozio B]     |
|                  Centrale                        |
|  [Panchine]      [Corridoio]     [Panchine]      |
|                                                  |
|  [Negozio C]     [Scala Mobile]  [Negozio D]     |
|                                                  |
|  [Entrata principale — spawn point]              |
+--------------------------------------------------+
```

**Elementi Interattivi:**

| Elemento | Interazione | Effetto |
|----------|-------------|---------|
| Vetrina Negozio | Click | Apre popup con "prodotti" decorativi |
| Fontana Centrale | Click | Animazione acqua, suono splash |
| Scala Mobile | Calpesta | Animazione salita, teletrasporto al piano superiore (futuro) |
| Panchina | Click | Avatar si siede, animazione idle seduto |
| Jukebox Mall | Click | Cambia traccia musicale ambientale |

**Tileset specifico:**
- Pavimento: marmo bianco/grigio con riflessi
- Pareti: vetro e acciaio
- Oggetti: insegne luminose, manichini, scaffali

**Configurazione stanza:**
```typescript
// config/rooms.config.ts
export const MALL_ROOM_CONFIG: RoomConfig = {
  id: 'mall',
  name: 'Centro Commerciale',
  description: 'Negozi, fontane e musica pop. Il posto perfetto per fare shopping virtuale.',
  maxUsers: 30,
  spawnPoints: [
    { x: 12, y: 19 }, // Entrata principale
    { x: 10, y: 19 },
    { x: 14, y: 19 },
  ],
  tilemap: 'assets/tilemaps/mall.json',
  backgroundMusic: 'assets/audio/mall_ambient.mp3',
  ambientColor: 0xfff5e6,
  interactiveObjects: [
    { id: 'fountain', x: 12, y: 10, type: 'animation', sprite: 'fountain_anim' },
    { id: 'bench_left', x: 4, y: 12, type: 'sit', sprite: 'bench' },
    { id: 'bench_right', x: 20, y: 12, type: 'sit', sprite: 'bench' },
    { id: 'jukebox', x: 2, y: 5, type: 'music', sprite: 'jukebox' },
  ],
};
```

### 4.3 Stanza 2 — Bar

**Atmosfera:** Calda, intima, luci soffuse, jazz/lounge in sottofondo.

**Dimensioni griglia:** 18×16 tile

**Layout:**

```
+------------------------------------+
|  [Bancone Bar]  [Scaffale Bottiglie]|
|  [Sgabelli]                        |
|                                    |
|  [Tavolino 1]  [Tavolino 2]        |
|  [Sedie]       [Sedie]             |
|                                    |
|  [Tavolino 3]  [Jukebox]           |
|  [Sedie]                           |
|                                    |
|  [Entrata]                         |
+------------------------------------+
```

**Elementi Interattivi:**

| Elemento | Interazione | Effetto |
|----------|-------------|---------|
| Sgabello al Bancone | Click | Avatar si siede, animazione "bere" |
| Tavolino | Click vicino | Avatar si siede al tavolo |
| Jukebox | Click | Seleziona genere musicale (jazz/blues/pop) |
| Bancone | Click | Animazione barista, suono bicchieri |
| Lampada | Click | Toggle luce calda/fredda (cambia tint stanza) |

**Dettagli visivi:**
- Pavimento: legno scuro con texture
- Pareti: mattoni rossi con quadri
- Luci: lampade a sospensione con alone giallo-arancio
- Bancone: legno lucido con riflessi

### 4.4 Stanza 3 — Picnic al Parco

**Atmosfera:** Luminosa, verde, all'aperto, uccellini e vento tra le foglie.

**Dimensioni griglia:** 28×24 tile

**Layout:**

```
+--------------------------------------------------+
|  [Alberi]  [Alberi]  [Alberi]  [Alberi]          |
|                                                  |
|  [Coperta 1]         [Coperta 2]                 |
|  [Cesto picnic]      [Cesto picnic]              |
|                                                  |
|  [Albero Grande]     [Altalena]                  |
|                                                  |
|  [Coperta 3]         [Frisbee area]              |
|                                                  |
|  [Sentiero]          [Fontanella]                |
|                                                  |
|  [Entrata parco — cancello]                      |
+--------------------------------------------------+
```

**Elementi Interattivi:**

| Elemento | Interazione | Effetto |
|----------|-------------|---------|
| Coperta Picnic | Click | Avatar si siede/sdraia, animazione relax |
| Altalena | Click | Animazione dondolio, suono cigolìo |
| Frisbee | Click | Animazione lancio frisbee tra utenti vicini |
| Albero Grande | Click | Appare scoiattolo animato |
| Fontanella | Click | Animazione bere, suono acqua |
| Cesto Picnic | Click | Popup con "cibo" decorativo |

**Dettagli visivi:**
- Terreno: erba verde con variazioni di colore
- Alberi: pixel-art con ombre proiettate
- Cielo: gradiente azzurro con nuvole animate (parallax)
- Effetti: foglie che cadono (particle system leggero)

### 4.5 Stanza 4 — Pesca al Lago

**Atmosfera:** Tranquilla, rilassante, suoni d'acqua, tramonto arancione.

**Dimensioni griglia:** 26×22 tile

**Layout:**

```
+--------------------------------------------------+
|  [Lago — area acqua non calpestabile]            |
|  [Lago]  [Lago]  [Lago]  [Lago]  [Lago]         |
|                                                  |
|  [Pontile principale]                            |
|  [Sedie da pesca]  [Sedie da pesca]              |
|                                                  |
|  [Riva]  [Riva]  [Riva]  [Riva]                 |
|                                                  |
|  [Alberi]  [Capanna]  [Alberi]                   |
|                                                  |
|  [Sentiero]  [Panchina]  [Sentiero]              |
+--------------------------------------------------+
```

**Elementi Interattivi:**

| Elemento | Interazione | Effetto |
|----------|-------------|---------|
| Sedia da Pesca | Click | Avatar si siede, appare canna da pesca, animazione lancio |
| Lago (acqua) | Click (da riva) | Animazione cerchi nell'acqua |
| Capanna | Click | Apre "inventario pesci" decorativo |
| Barca | Click | Avatar sale sulla barca, si muove sull'acqua |
| Tramonto | Automatico | Ciclo giorno/notte ogni 10 minuti (tint graduale) |

**Dettagli visivi:**
- Acqua: animazione tile con shimmer effect
- Riflessi: sprite riflesso degli alberi sull'acqua
- Cielo: gradiente tramonto arancio/viola
- Effetti: pesci che saltano occasionalmente (random timer)

### 4.6 Architettura Espandibile — Aggiungere Nuove Stanze

Per aggiungere una nuova stanza sono necessari **solo 4 passi**:

```typescript
// 1. Creare la configurazione in config/rooms.config.ts
export const NEW_ROOM_CONFIG: RoomConfig = {
  id: 'cinema',
  name: 'Cinema',
  // ...
};

// 2. Creare la scena estendendo BaseRoomScene
// scenes/rooms/CinemaScene.ts
export class CinemaScene extends BaseRoomScene {
  constructor() {
    super('CinemaScene', NEW_ROOM_CONFIG);
  }

  protected setupInteractiveObjects(): void {
    // Solo gli oggetti specifici di questa stanza
    this.addInteractiveObject('screen', 10, 5, 'cinema_screen');
    this.addInteractiveObject('popcorn', 8, 12, 'popcorn_stand');
  }
}

// 3. Registrare la scena in main.ts
const config: Phaser.Types.Core.GameConfig = {
  scene: [...existingScenes, CinemaScene],
};

// 4. Aggiungere la stanza al database (migration SQL)
INSERT INTO rooms (id, name, config) VALUES ('cinema', 'Cinema', '{}');
```

---

## 5. Sistema Avatar

### 5.1 Struttura Sprite Sheet

Ogni avatar è composto da **layer sovrapposti** per la personalizzazione:

```
Avatar Sprite Sheet — 8 direzioni × 4 frame animazione = 32 frame per layer

Direzioni (isometriche):
  0: Sud-Est (default)
  1: Sud
  2: Sud-Ovest
  3: Ovest
  4: Nord-Ovest
  5: Nord
  6: Nord-Est
  7: Est

Animazioni per direzione:
  Frame 0: Idle (statico)
  Frame 1-3: Walk cycle (3 frame)
  Frame 4: Sit
  Frame 5: Wave (saluto)
  Frame 6-7: Dance (2 frame)

Dimensione sprite: 32×48 px per frame
Sheet totale: 256×336 px (8 col × 7 row)
```

**Layer avatar (dal basso all'alto):**
1. `body` — Corpo base (10 varianti di carnagione)
2. `outfit` — Vestiti (20+ outfit)
3. `hair` — Capelli (15+ stili)
4. `accessory` — Accessori (cappelli, occhiali, etc.)
5. `expression` — Espressione facciale (5 varianti)

### 5.2 Classe Avatar

```typescript
// entities/Avatar.ts
import Phaser from 'phaser';
import { AvatarConfig, AvatarState, Direction } from '../types/avatar.types';
import { getDepth } from '../utils/isoMath';

export class Avatar extends Phaser.GameObjects.Container {
  private layers: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private nameTag: Phaser.GameObjects.Text;
  private speakingIndicator: SpeakingIndicator;
  private currentState: AvatarState = 'idle';
  private currentDirection: Direction = Direction.SE;
  private config: AvatarConfig;

  constructor(scene: Phaser.Scene, x: number, y: number, config: AvatarConfig) {
    super(scene, x, y);
    this.config = config;
    this.buildLayers();
    this.buildNameTag();
    this.buildSpeakingIndicator();
    scene.add.existing(this);
  }

  private buildLayers(): void {
    const layerOrder = ['body', 'outfit', 'hair', 'accessory', 'expression'];
    layerOrder.forEach(layer => {
      const key = `avatar_${layer}_${this.config[layer]}`;
      const sprite = this.scene.add.sprite(0, 0, key);
      sprite.setOrigin(0.5, 1); // Ancoraggio ai piedi
      this.add(sprite);
      this.layers.set(layer, sprite);
    });
  }

  private buildNameTag(): void {
    this.nameTag = this.scene.add.text(0, -52, this.config.username, {
      fontSize: '10px',
      fontFamily: 'Press Start 2P, monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1);
    this.add(this.nameTag);
  }

  playAnimation(state: AvatarState, direction: Direction): void {
    if (this.currentState === state && this.currentDirection === direction) return;
    this.currentState = state;
    this.currentDirection = direction;

    const animKey = `avatar_${state}_${direction}`;
    this.layers.forEach(sprite => {
      const layerAnimKey = `${sprite.texture.key}_${state}_${direction}`;
      sprite.play(layerAnimKey, true);
    });
  }

  setSpeaking(isSpeaking: boolean): void {
    this.speakingIndicator.setVisible(isSpeaking);
    if (isSpeaking) {
      this.speakingIndicator.play('speaking_pulse');
    }
  }

  updateDepth(worldX: number, worldY: number): void {
    this.setDepth(getDepth(worldX, worldY));
  }
}
```

### 5.3 Personalizzazione Avatar

```typescript
// types/avatar.types.ts
export interface AvatarConfig {
  userId: string;
  username: string;
  body: number;       // 0-9 (carnagione)
  outfit: number;     // 0-19
  hair: number;       // 0-14
  hairColor: string;  // hex color
  accessory: number;  // 0-9 (0 = nessuno)
  expression: number; // 0-4
}

export type AvatarState = 'idle' | 'walk' | 'sit' | 'wave' | 'dance' | 'fish';
export enum Direction { SE = 0, S = 1, SW = 2, W = 3, NW = 4, N = 5, NE = 6, E = 7 }
```

### 5.4 Animazioni — Definizione

```typescript
// systems/AvatarSystem.ts — Registrazione animazioni
export function registerAvatarAnimations(scene: Phaser.Scene): void {
  const layers = ['body', 'outfit', 'hair', 'accessory'];
  const states: AvatarState[] = ['idle', 'walk', 'sit', 'wave', 'dance'];
  const directions = [0, 1, 2, 3, 4, 5, 6, 7];

  layers.forEach(layer => {
    states.forEach(state => {
      directions.forEach(dir => {
        const frameCount = state === 'walk' ? 4 : state === 'dance' ? 2 : 1;
        const startFrame = getStartFrame(state, dir);

        scene.anims.create({
          key: `avatar_${layer}_${state}_${dir}`,
          frames: scene.anims.generateFrameNumbers(`avatar_${layer}`, {
            start: startFrame,
            end: startFrame + frameCount - 1,
          }),
          frameRate: state === 'walk' ? 8 : state === 'dance' ? 4 : 2,
          repeat: state === 'idle' || state === 'walk' || state === 'dance' ? -1 : 0,
        });
      });
    });
  });
}
```

### 5.5 Interpolazione Avatar Remoti

Per evitare movimenti a scatti degli avatar degli altri utenti, si usa l'interpolazione lineare:

```typescript
// entities/RemoteAvatar.ts
export class RemoteAvatar extends Avatar {
  private targetX: number;
  private targetY: number;
  private lerpFactor = 0.15; // Velocità interpolazione (0.1 = lento, 0.3 = veloce)

  updateTargetPosition(worldX: number, worldY: number, direction: Direction): void {
    this.targetX = worldX;
    this.targetY = worldY;
    const isMoving = Math.abs(this.targetX - this.x) > 1 || Math.abs(this.targetY - this.y) > 1;
    this.playAnimation(isMoving ? 'walk' : 'idle', direction);
  }

  preUpdate(time: number, delta: number): void {
    // Lerp verso la posizione target
    this.x = Phaser.Math.Linear(this.x, this.targetX, this.lerpFactor);
    this.y = Phaser.Math.Linear(this.y, this.targetY, this.lerpFactor);
    this.updateDepth(this.x, this.y);
  }
}
```

---

## 6. Voice Chat

### 6.1 Architettura Audio

```mermaid
graph LR
    subgraph Client A
        MIC_A[Microfono]
        SDK_A[LiveKit SDK]
    end

    subgraph Client B
        MIC_B[Microfono]
        SDK_B[LiveKit SDK]
        SPK_B[Altoparlante]
    end

    subgraph Client C
        SDK_C[LiveKit SDK]
        SPK_C[Altoparlante]
    end

    subgraph LiveKit Server
        SFU[SFU]
        ROOM[Room: mall_1]
    end

    MIC_A --> SDK_A
    SDK_A -->|Publish Track| SFU
    SFU --> ROOM
    ROOM -->|Subscribe| SDK_B
    ROOM -->|Subscribe| SDK_C
    SDK_B --> SPK_B
    SDK_C --> SPK_C
```

**Vantaggi SFU vs Mesh P2P:**
- Con 10 utenti in stanza, P2P richiederebbe 45 connessioni; SFU ne richiede 10
- Qualità audio uniforme indipendentemente dal numero di utenti
- Possibilità di registrare/moderare lato server

### 6.2 VoiceSystem — Implementazione

```typescript
// systems/VoiceSystem.ts
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  LocalParticipant,
  Track,
  createLocalAudioTrack,
} from 'livekit-client';

export class VoiceSystem {
  private room: Room;
  private localParticipant: LocalParticipant | null = null;
  private isMuted = false;
  private onSpeakingChange: (userId: string, isSpeaking: boolean) => void;

  constructor(onSpeakingChange: (userId: string, isSpeaking: boolean) => void) {
    this.onSpeakingChange = onSpeakingChange;
    this.room = new Room({
      adaptiveStream: true,       // Adatta qualità alla banda disponibile
      dynacast: true,             // Ottimizza encoding per numero partecipanti
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.setupEventListeners();
  }

  async connect(liveKitUrl: string, token: string): Promise<void> {
    await this.room.connect(liveKitUrl, token);
    this.localParticipant = this.room.localParticipant;

    // Pubblica il microfono locale
    const audioTrack = await createLocalAudioTrack({
      echoCancellation: true,
      noiseSuppression: true,
    });
    await this.localParticipant.publishTrack(audioTrack);
  }

  private setupEventListeners(): void {
    // Nuovo partecipante entra
    this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log(`[Voice] ${participant.identity} connesso`);
    });

    // Rilevamento chi sta parlando
    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const speakingIds = new Set(speakers.map(s => s.identity));

      // Notifica chi ha iniziato/smesso di parlare
      this.room.participants.forEach((participant, identity) => {
        const isSpeaking = speakingIds.has(identity);
        this.onSpeakingChange(identity, isSpeaking);
      });

      // Controlla anche il partecipante locale
      if (this.localParticipant) {
        const localSpeaking = speakingIds.has(this.localParticipant.identity);
        this.onSpeakingChange(this.localParticipant.identity, localSpeaking);
      }
    });

    // Track remoto disponibile — riproduce automaticamente
    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        const audioElement = track.attach();
        audioElement.volume = 1.0;
        document.body.appendChild(audioElement);
      }
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach();
    });
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    this.localParticipant?.setMicrophoneEnabled(!this.isMuted);
    return this.isMuted;
  }

  async disconnect(): Promise<void> {
    await this.room.disconnect();
  }

  getParticipantCount(): number {
    return this.room.participants.size + 1; // +1 per il locale
  }
}
```

### 6.3 Indicatori Visivi — Chi Sta Parlando

```typescript
// entities/SpeakingIndicator.ts
export class SpeakingIndicator extends Phaser.GameObjects.Container {
  private rings: Phaser.GameObjects.Arc[] = [];
  private animationTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, -60); // Sopra la testa dell'avatar

    // Tre cerchi concentrici che pulsano
    for (let i = 0; i < 3; i++) {
      const ring = scene.add.arc(0, 0, 8 + i * 5, 0, 360, false, 0x00ff88, 0.6 - i * 0.15);
      ring.setStrokeStyle(2, 0x00ff88);
      ring.setFillStyle(0x00ff88, 0);
      this.add(ring);
      this.rings.push(ring);
    }

    this.setVisible(false);
    scene.add.existing(this);
  }

  startPulsing(): void {
    this.setVisible(true);
    this.animationTween = this.scene.tweens.add({
      targets: this.rings,
      scaleX: 1.4,
      scaleY: 1.4,
      alpha: 0.2,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  stopPulsing(): void {
    this.animationTween?.stop();
    this.setVisible(false);
    this.rings.forEach(r => { r.setScale(1); r.setAlpha(0.6); });
  }
}
```

### 6.4 Generazione Token LiveKit — Backend

```typescript
// server/src/services/VoiceService.ts
import { AccessToken } from 'livekit-server-sdk';

export class VoiceService {
  private apiKey: string;
  private apiSecret: string;
  private livekitUrl: string;

  constructor() {
    this.apiKey = process.env.LIVEKIT_API_KEY!;
    this.apiSecret = process.env.LIVEKIT_API_SECRET!;
    this.livekitUrl = process.env.LIVEKIT_URL!;
  }

  generateToken(userId: string, roomId: string, username: string): string {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: userId,
      name: username,
      ttl: '4h', // Token valido 4 ore
    });

    token.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false, // Solo audio, no data channel
    });

    return token.toJwt();
  }
}
```

### 6.5 Gestione Permessi Microfono

```typescript
// ui/VoiceControls.tsx
import React, { useState, useEffect } from 'react';

export const VoiceControls: React.FC = () => {
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    navigator.permissions.query({ name: 'microphone' as PermissionName })
      .then(result => setPermissionState(result.state as any));
  }, []);

  const requestMicPermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setPermissionState('granted');
    } catch {
      setPermissionState('denied');
    }
  };

  if (permissionState === 'denied') {
    return (
      <div className="voice-blocked">
        <span>Microfono bloccato. Abilita nelle impostazioni del browser.</span>
      </div>
    );
  }

  return (
    <div className="voice-controls">
      {permissionState === 'prompt' && (
        <button onClick={requestMicPermission} className="btn-allow-mic">
          Abilita Microfono
        </button>
      )}
      {permissionState === 'granted' && (
        <button
          onClick={() => setIsMuted(m => !m)}
          className={`btn-mute ${isMuted ? 'muted' : 'active'}`}
          title={isMuted ? 'Riattiva microfono' : 'Silenzia microfono'}
        >
          {isMuted ? '🔇' : '🎤'}
        </button>
      )}
    </div>
  );
};
```

---

## 7. Backend — API e Sincronizzazione

### 7.1 API REST — Endpoints

```
AUTH
  POST   /api/auth/register          Registrazione nuovo utente
  POST   /api/auth/login             Login, ritorna JWT
  POST   /api/auth/refresh           Refresh token
  DELETE /api/auth/logout            Logout, invalida token

USERS
  GET    /api/users/me               Profilo utente corrente
  PATCH  /api/users/me               Aggiorna profilo
  GET    /api/users/me/avatar        Configurazione avatar
  PATCH  /api/users/me/avatar        Salva personalizzazione avatar

ROOMS
  GET    /api/rooms                  Lista stanze con conteggio utenti
  GET    /api/rooms/:id              Dettaglio stanza
  POST   /api/rooms/:id/join         Entra in stanza (ritorna token LiveKit)
  POST   /api/rooms/:id/leave        Esci dalla stanza

VOICE
  POST   /api/voice/token            Genera token LiveKit per stanza
```

### 7.2 Socket.IO — Eventi

```typescript
// packages/shared/src/types/events.ts

// Client → Server
export interface ClientToServerEvents {
  'join-room': (data: { roomId: string; avatarConfig: AvatarConfig }) => void;
  'leave-room': (data: { roomId: string }) => void;
  'move': (data: { x: number; y: number; direction: Direction; state: AvatarState }) => void;
  'interact': (data: { objectId: string; action: string }) => void;
  'emote': (data: { emoteId: string }) => void;
}

// Server → Client
export interface ServerToClientEvents {
  'room-state': (data: RoomState) => void;
  'user-joined': (data: { userId: string; avatarConfig: AvatarConfig; position: Position }) => void;
  'user-left': (data: { userId: string }) => void;
  'user-moved': (data: { userId: string; x: number; y: number; direction: Direction; state: AvatarState }) => void;
  'object-state-changed': (data: { objectId: string; state: ObjectState }) => void;
  'user-emote': (data: { userId: string; emoteId: string }) => void;
  'room-users-count': (data: { roomId: string; count: number }) => void;
  'error': (data: { code: string; message: string }) => void;
}

export interface RoomState {
  roomId: string;
  users: Array<{
    userId: string;
    avatarConfig: AvatarConfig;
    position: Position;
    state: AvatarState;
  }>;
  objects: Array<{
    objectId: string;
    state: ObjectState;
  }>;
}
```

### 7.3 Room Handlers — Socket.IO

```typescript
// server/src/socket/handlers/roomHandlers.ts
import { Server, Socket } from 'socket.io';
import { RoomService } from '../../services/RoomService';
import { StateService } from '../../services/StateService';

export function registerRoomHandlers(io: Server, socket: Socket): void {
  const roomService = new RoomService();
  const stateService = new StateService();

  socket.on('join-room', async ({ roomId, avatarConfig }) => {
    const userId = socket.data.userId;

    // Verifica capienza stanza
    const room = await roomService.getRoom(roomId);
    if (!room) return socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Stanza non trovata' });

    const currentCount = await stateService.getRoomUserCount(roomId);
    if (currentCount >= room.maxUsers) {
      return socket.emit('error', { code: 'ROOM_FULL', message: 'Stanza piena' });
    }

    // Lascia stanza precedente se presente
    const previousRoom = socket.data.currentRoom;
    if (previousRoom) {
      await socket.leave(previousRoom);
      await stateService.removeUserFromRoom(previousRoom, userId);
      socket.to(previousRoom).emit('user-left', { userId });
    }

    // Entra nella nuova stanza
    await socket.join(roomId);
    socket.data.currentRoom = roomId;

    // Calcola spawn point
    const spawnPoint = await roomService.getSpawnPoint(roomId);
    const userState = { userId, avatarConfig, position: spawnPoint, state: 'idle' };

    await stateService.addUserToRoom(roomId, userState);

    // Invia stato corrente della stanza al nuovo utente
    const roomState = await stateService.getRoomState(roomId);
    socket.emit('room-state', roomState);

    // Notifica gli altri utenti
    socket.to(roomId).emit('user-joined', userState);

    // Aggiorna conteggio globale
    io.emit('room-users-count', { roomId, count: currentCount + 1 });
  });

  socket.on('move', async ({ x, y, direction, state }) => {
    const userId = socket.data.userId;
    const roomId = socket.data.currentRoom;
    if (!roomId) return;

    // Validazione server-side della posizione (anti-cheat base)
    const isValid = await roomService.isValidPosition(roomId, x, y);
    if (!isValid) return;

    await stateService.updateUserPosition(roomId, userId, { x, y });

    // Broadcast agli altri utenti nella stanza (non al mittente)
    socket.to(roomId).emit('user-moved', { userId, x, y, direction, state });
  });

  socket.on('disconnect', async () => {
    const userId = socket.data.userId;
    const roomId = socket.data.currentRoom;
    if (roomId) {
      await stateService.removeUserFromRoom(roomId, userId);
      socket.to(roomId).emit('user-left', { userId });
      const count = await stateService.getRoomUserCount(roomId);
      io.emit('room-users-count', { roomId, count });
    }
  });
}
```

### 7.4 StateService — Redis

```typescript
// server/src/services/StateService.ts
import { redis } from '../config/redis';

export class StateService {
  private readonly ROOM_PREFIX = 'room';
  private readonly USER_TTL = 3600; // 1 ora

  async addUserToRoom(roomId: string, userState: UserState): Promise<void> {
    const key = `${this.ROOM_PREFIX}:${roomId}:users`;
    await redis.hset(key, userState.userId, JSON.stringify(userState));
    await redis.expire(key, this.USER_TTL);
  }

  async removeUserFromRoom(roomId: string, userId: string): Promise<void> {
    const key = `${this.ROOM_PREFIX}:${roomId}:users`;
    await redis.hdel(key, userId);
  }

  async updateUserPosition(roomId: string, userId: string, position: Position): Promise<void> {
    const key = `${this.ROOM_PREFIX}:${roomId}:users`;
    const raw = await redis.hget(key, userId);
    if (!raw) return;
    const userState = JSON.parse(raw);
    userState.position = position;
    await redis.hset(key, userId, JSON.stringify(userState));
  }

  async getRoomState(roomId: string): Promise<RoomState> {
    const usersKey = `${this.ROOM_PREFIX}:${roomId}:users`;
    const objectsKey = `${this.ROOM_PREFIX}:${roomId}:objects`;

    const [usersRaw, objectsRaw] = await Promise.all([
      redis.hgetall(usersKey),
      redis.hgetall(objectsKey),
    ]);

    const users = Object.values(usersRaw || {}).map(v => JSON.parse(v));
    const objects = Object.values(objectsRaw || {}).map(v => JSON.parse(v));

    return { roomId, users, objects };
  }

  async getRoomUserCount(roomId: string): Promise<number> {
    const key = `${this.ROOM_PREFIX}:${roomId}:users`;
    return redis.hlen(key);
  }
}
```

### 7.5 Autenticazione — JWT

```typescript
// server/src/api/middleware/auth.middleware.ts
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  userId?: string;
  username?: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'Token mancante' });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; username: string };
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch {
    res.status(401).json({ error: 'Token non valido o scaduto' });
  }
}
```

### 7.6 Schema Database PostgreSQL

```sql
-- Utenti
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    VARCHAR(30) UNIQUE NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  last_seen   TIMESTAMP DEFAULT NOW(),
  is_banned   BOOLEAN DEFAULT FALSE
);

-- Configurazione Avatar
CREATE TABLE avatar_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  body        SMALLINT DEFAULT 0,
  outfit      SMALLINT DEFAULT 0,
  hair        SMALLINT DEFAULT 0,
  hair_color  VARCHAR(7) DEFAULT '#8B4513',
  accessory   SMALLINT DEFAULT 0,
  expression  SMALLINT DEFAULT 0,
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Stanze (configurazione statica)
CREATE TABLE rooms (
  id          VARCHAR(50) PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  max_users   SMALLINT DEFAULT 30,
  is_active   BOOLEAN DEFAULT TRUE,
  config      JSONB DEFAULT '{}'
);

-- Seed stanze iniziali
INSERT INTO rooms (id, name, description, max_users) VALUES
  ('mall',  'Centro Commerciale', 'Negozi, fontane e musica pop.', 30),
  ('bar',   'Bar',                'Bancone, tavolini e jukebox.', 20),
  ('park',  'Picnic al Parco',    'Coperte, alberi e giochi.', 25),
  ('lake',  'Pesca al Lago',      'Pontile, lago e tramonto.', 20);
```

---

## 8. UI/UX

### 8.1 Flusso Navigazione

```mermaid
flowchart TD
    A[Landing Page] --> B{Utente registrato?}
    B -->|No| C[Registrazione / Login]
    B -->|Sì| D[Menu Principale]
    C --> D
    D --> E[Personalizzazione Avatar]
    D --> F[Selezione Stanza — Lobby]
    E --> F
    F --> G[Caricamento Stanza]
    G --> H[In-Game — Stanza]
    H --> I[Menu Pausa]
    I --> F
    I --> E
    H --> J[Cambio Stanza]
    J --> G
```

### 8.2 Menu Principale

**Layout:** Schermata full-screen con sfondo animato (pixel-art della città isometrica in loop).

**Elementi:**
- Logo "Social Square" in pixel-art, animato con effetto glitch leggero
- Pulsante **"Entra"** — porta alla lobby
- Pulsante **"Personalizza Avatar"** — editor avatar
- Pulsante **"Impostazioni"** — audio, grafica, account
- Contatore utenti online in tempo reale (WebSocket)

### 8.3 Lobby — Selezione Stanza

```typescript
// ui/RoomList.tsx
interface RoomCardProps {
  room: RoomInfo;
  onJoin: (roomId: string) => void;
}

const RoomCard: React.FC<RoomCardProps> = ({ room, onJoin }) => {
  const isFull = room.currentUsers >= room.maxUsers;
  const fillPercent = (room.currentUsers / room.maxUsers) * 100;

  return (
    <div className={`room-card ${isFull ? 'full' : ''}`}>
      <div className="room-preview">
        {/* Thumbnail isometrica della stanza */}
        <img src={`/assets/previews/${room.id}.png`} alt={room.name} />
        <div className="user-count-badge">
          <span>{room.currentUsers}/{room.maxUsers}</span>
        </div>
      </div>
      <div className="room-info">
        <h3>{room.name}</h3>
        <p>{room.description}</p>
        <div className="fill-bar">
          <div className="fill-bar-inner" style={{ width: `${fillPercent}%` }} />
        </div>
      </div>
      <button
        onClick={() => onJoin(room.id)}
        disabled={isFull}
        className="btn-join"
      >
        {isFull ? 'Piena' : 'Entra'}
      </button>
    </div>
  );
};
```

### 8.4 HUD In-Game

**Struttura HUD (overlay React sopra canvas Phaser):**

```
+--------------------------------------------------+
| [Logo]              [Nome Stanza]    [Utenti: 12] |  ← Top Bar
+--------------------------------------------------+
|                                                  |
|                  CANVAS PHASER                   |
|              (Stanza isometrica)                 |
|                                                  |
+--------------------------------------------------+
| [🎤 Muto] [🔊 Vol] [😊 Emote] [🚪 Esci]         |  ← Bottom Bar
+--------------------------------------------------+
|                              [Lista Utenti ▼]    |  ← Collapsible
```

**Componenti HUD:**

| Componente | Posizione | Funzione |
|------------|-----------|----------|
| `TopBar` | Alto | Nome stanza, contatore utenti, pulsante impostazioni |
| `VoiceControls` | Basso sinistra | Mute/unmute, volume slider |
| `EmoteBar` | Basso centro | 6 emote rapide (wave, dance, sit, etc.) |
| `ExitButton` | Basso destra | Torna alla lobby |
| `UserList` | Destra collapsible | Lista utenti con indicatore speaking |
| `Tooltip` | Contestuale | Appare su hover oggetti interattivi |

### 8.5 Responsive Design — Mobile vs Desktop

**Desktop (≥ 1024px):**
- Canvas occupa l'intera finestra
- HUD con tutti i controlli visibili
- Click per muoversi, hover per tooltip
- Shortcut tastiera: M = mute, E = emote, ESC = menu

**Mobile (< 768px):**
- Canvas full-screen con pinch-to-zoom disabilitato
- HUD semplificato: solo mute e exit
- Joystick virtuale in basso a sinistra per movimento
- Tap su oggetti per interagire
- Tap su avatar per vedere profilo

```typescript
// config/game.config.ts
export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.RESIZE,        // Si adatta alla finestra
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  render: {
    pixelArt: true,                   // Nearest-neighbor per pixel-art
    antialias: false,
    roundPixels: true,                // Evita sub-pixel rendering
  },
  backgroundColor: '#1a1a2e',
  parent: 'game-container',
};
```

### 8.6 Accessibilità

- **Contrasto:** Tutti i testi HUD rispettano WCAG AA (4.5:1)
- **Font:** "Press Start 2P" per titoli, sistema sans-serif per testi lunghi
- **Daltonismo:** Indicatori speaking usano forma + colore (non solo colore)
- **Riduzione movimento:** Rispetta `prefers-reduced-motion` per animazioni UI
- **Screen reader:** Elementi HUD con `aria-label` appropriati

---

## 9. Asset Pipeline

### 9.1 Workflow Creazione Asset

```mermaid
flowchart LR
    A[Aseprite\nPixel Art Editor] --> B[PNG Sprite Sheet\n+ JSON Metadata]
    B --> C[TexturePacker\nAtlas Generator]
    C --> D[Atlas PNG + JSON\nper Phaser]
    D --> E[Vite Build\nOptimizzazione]
    E --> F[CDN / Static Files]
```

### 9.2 Specifiche Tecniche Asset

**Tile Isometrici:**
- Dimensione tile base: **64×32 px**
- Tile con altezza (muri, oggetti): **64×(32+H)** dove H è l'altezza in pixel
- Palette: max 64 colori per tileset (ottimizzazione PNG)
- Formato: PNG-8 con trasparenza

**Sprite Avatar:**
- Dimensione frame: **32×48 px**
- Sheet: 8 direzioni × 8 frame = 64 frame per layer
- 5 layer × 64 frame = 320 frame totali per avatar completo
- Formato: PNG-32 con canale alpha

**Atlas Texture (Phaser):**
- Max dimensione atlas: **2048×2048 px** (compatibilità mobile)
- Separazione per categoria: `atlas_tiles.png`, `atlas_avatars.png`, `atlas_ui.png`
- Formato JSON: Phaser 3 Hash format

### 9.3 Convenzioni Naming Asset

```
sprites/
  avatars/
    body_0.png          → body variante 0
    body_1.png          → body variante 1
    outfit_casual_0.png → outfit "casual" variante 0
    hair_short_0.png    → capelli "corti" variante 0

  rooms/
    mall/
      floor_marble.png      → tile pavimento
      wall_glass.png        → tile muro
      obj_fountain.png      → oggetto fontana
      obj_fountain_anim.png → fontana animata (sheet)

  ui/
    btn_primary.png
    icon_mic_on.png
    icon_mic_off.png
    speaking_ring.png
```

### 9.4 Script Generazione Atlas

```javascript
// scripts/pack-atlas.js
const TexturePacker = require('free-tex-packer-core');
const fs = require('fs');
const path = require('path');

async function packAtlas(inputDir, outputName) {
  const files = fs.readdirSync(inputDir)
    .filter(f => f.endsWith('.png'))
    .map(f => ({
      path: f,
      contents: fs.readFileSync(path.join(inputDir, f)),
    }));

  const result = await TexturePacker(files, {
    textureName: outputName,
    width: 2048,
    height: 2048,
    fixedSize: false,
    padding: 2,
    allowRotation: false,   // Importante: no rotazione per pixel-art
    detectIdentical: true,
    allowTrim: false,        // No trim per pixel-art (rompe l'allineamento)
    exporter: 'Phaser3',
    removeFileExtension: true,
    prependFolderName: false,
  });

  result.forEach(({ name, buffer }) => {
    fs.writeFileSync(path.join('apps/client/public/assets', name), buffer);
  });

  console.log(`Atlas ${outputName} generato con ${files.length} sprite`);
}

packAtlas('assets/sprites/rooms/mall', 'atlas_mall');
packAtlas('assets/sprites/rooms/bar', 'atlas_bar');
packAtlas('assets/sprites/avatars', 'atlas_avatars');
packAtlas('assets/sprites/ui', 'atlas_ui');
```

### 9.5 Caricamento Asset in Phaser

```typescript
// scenes/BootScene.ts
export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload(): void {
    // Asset comuni a tutte le stanze
    this.load.atlas('atlas_avatars', 'assets/atlas_avatars.png', 'assets/atlas_avatars.json');
    this.load.atlas('atlas_ui', 'assets/atlas_ui.png', 'assets/atlas_ui.json');

    // Font pixel-art
    this.load.bitmapFont('pixel', 'assets/fonts/pixel.png', 'assets/fonts/pixel.xml');

    // Mostra progress bar
    this.load.on('progress', (value: number) => {
      this.events.emit('loading-progress', value);
    });
  }

  create(): void {
    this.scene.start('MenuScene');
  }
}

// scenes/rooms/MallScene.ts — Carica asset specifici della stanza
export class MallScene extends BaseRoomScene {
  preload(): void {
    super.preload(); // Asset comuni
    this.load.atlas('atlas_mall', 'assets/atlas_mall.png', 'assets/atlas_mall.json');
    this.load.tilemapTiledJSON('tilemap_mall', 'assets/tilemaps/mall.json');
    this.load.audio('music_mall', 'assets/audio/mall_ambient.mp3');
  }
}
```

---

## 10. Fasi di Sviluppo — Roadmap

### 10.1 Overview Milestone

```mermaid
gantt
    title Social Square — Roadmap di Sviluppo
    dateFormat  YYYY-MM-DD
    section Fase 1 — Foundation
    Setup progetto e tooling          :f1a, 2026-07-01, 7d
    Prototipo isometrico base         :f1b, after f1a, 14d
    Sistema movimento avatar          :f1c, after f1b, 10d
    Backend base + Socket.IO          :f1d, after f1a, 14d

    section Fase 2 — Core Features
    Autenticazione + profili          :f2a, after f1d, 10d
    Voice chat LiveKit                :f2b, after f1c, 14d
    Prima stanza completa (Bar)       :f2c, after f1c, 21d
    HUD e UI base                     :f2d, after f2a, 14d

    section Fase 3 — Contenuto
    Stanza Mall                       :f3a, after f2c, 14d
    Stanza Parco                      :f3b, after f2c, 14d
    Stanza Lago                       :f3c, after f3a, 14d
    Personalizzazione avatar          :f3d, after f2d, 14d

    section Fase 4 — Polish
    Ottimizzazioni performance        :f4a, after f3c, 10d
    Mobile responsive                 :f4b, after f3c, 10d
    Testing e bug fix                 :f4c, after f4a, 14d
    Deploy produzione                 :f4d, after f4c, 7d
```

### 10.2 Fase 1 — Foundation (Settimane 1-4)

**Obiettivo:** Prototipo funzionante con un avatar che si muove in una stanza isometrica.

**Task:**

- [ ] Setup monorepo (pnpm workspaces)
- [ ] Configurazione Vite + TypeScript + Phaser 3
- [ ] Configurazione Node.js + Socket.IO + TypeScript
- [ ] Docker Compose per sviluppo locale (Redis, PostgreSQL)
- [ ] Implementazione `IsometricSystem` (coordinate, depth sorting)
- [ ] Tilemap isometrica base (griglia 20×20)
- [ ] Avatar locale con movimento click-to-move
- [ ] A* pathfinding su griglia isometrica
- [ ] Connessione Socket.IO base
- [ ] Sincronizzazione posizione avatar tra 2 client

**Deliverable:** Demo con 2 avatar che si muovono nella stessa stanza.

**Criteri di accettazione:**
- 60 FPS su Chrome con 2 avatar
- Latenza movimento < 100ms su LAN
- Nessun artefatto visivo nel depth sorting

### 10.3 Fase 2 — Core Features (Settimane 5-9)

**Obiettivo:** Prodotto utilizzabile con voice chat e autenticazione.

**Task:**

- [ ] Sistema autenticazione JWT (register/login)
- [ ] Integrazione LiveKit (server + client SDK)
- [ ] Indicatori visivi speaking (SpeakingIndicator)
- [ ] Prima stanza completa: Bar (tilemap, oggetti, musica)
- [ ] Sistema interazione oggetti (click → animazione)
- [ ] HUD React base (mute, exit, user list)
- [ ] Gestione disconnessione/reconnect
- [ ] Personalizzazione avatar base (3 layer)

**Deliverable:** MVP con voice chat funzionante nel Bar.

**Criteri di accettazione:**
- Voice chat con latenza < 200ms
- Indicatore speaking visibile entro 100ms dall'inizio del parlato
- Gestione corretta di join/leave con 10+ utenti simultanei

### 10.4 Fase 3 — Contenuto (Settimane 10-16)

**Obiettivo:** Tutte e 4 le stanze complete con contenuto ricco.

**Task:**

- [ ] Stanza Mall (tilemap, negozi, fontana, scala mobile)
- [ ] Stanza Parco (tilemap, alberi, coperte, altalena, particle effects)
- [ ] Stanza Lago (tilemap, acqua animata, pontile, barca, ciclo giorno/notte)
- [ ] Personalizzazione avatar completa (5 layer, 50+ opzioni)
- [ ] Sistema emote (6 emote con animazioni)
- [ ] Lobby con preview stanze e contatori utenti live
- [ ] Effetti sonori per interazioni
- [ ] Ottimizzazione asset (atlas, compressione)

**Deliverable:** Prodotto completo con tutte le stanze.

### 10.5 Fase 4 — Polish e Deploy (Settimane 17-20)

**Obiettivo:** Prodotto stabile, ottimizzato e deployato.

**Task:**

- [ ] Profiling performance (Chrome DevTools, Lighthouse)
- [ ] Ottimizzazione bundle (code splitting, lazy loading stanze)
- [ ] Responsive mobile (joystick virtuale, HUD adattivo)
- [ ] Test cross-browser (Chrome, Firefox, Safari, Edge)
- [ ] Test su dispositivi mobili (iOS Safari, Android Chrome)
- [ ] Setup CI/CD (GitHub Actions)
- [ ] Deploy su VPS con Docker + Nginx
- [ ] Configurazione SSL (Let's Encrypt)
- [ ] Monitoring (uptime, errori, latenza)

**Deliverable:** Produzione live, accessibile pubblicamente.

### 10.6 Dipendenze Critiche

```mermaid
graph TD
    A[IsometricSystem] --> B[MovementSystem]
    A --> C[AvatarSystem]
    B --> C
    D[NetworkSystem] --> C
    D --> E[RoomHandlers]
    F[VoiceSystem] --> G[SpeakingIndicator]
    G --> C
    H[Auth Backend] --> E
    H --> I[VoiceService]
    I --> F
    C --> J[BaseRoomScene]
    J --> K[MallScene]
    J --> L[BarScene]
    J --> M[ParkScene]
    J --> N[LakeScene]
```

---

## 11. Performance Budget

### 11.1 Target di Performance

| Metrica | Target | Critico |
|---------|--------|---------|
| FPS (desktop) | 60 FPS | < 30 FPS inaccettabile |
| FPS (mobile mid-range) | 30 FPS | < 20 FPS inaccettabile |
| Bundle JS iniziale | < 800 KB gzip | > 2 MB inaccettabile |
| Bundle totale (con assets) | < 5 MB | > 15 MB inaccettabile |
| Time to Interactive | < 3s (3G) | > 8s inaccettabile |
| Latenza Socket.IO (LAN) | < 50ms | > 200ms inaccettabile |
| Latenza Voice (WebRTC) | < 150ms | > 400ms inaccettabile |
| Memoria RAM (browser) | < 150 MB | > 400 MB inaccettabile |

### 11.2 Ottimizzazioni Phaser

```typescript
// Ottimizzazione 1: Object Pooling per avatar remoti
export class AvatarPool {
  private pool: RemoteAvatar[] = [];
  private active: Map<string, RemoteAvatar> = new Map();

  acquire(userId: string, config: AvatarConfig): RemoteAvatar {
    let avatar = this.pool.pop();
    if (!avatar) {
      avatar = new RemoteAvatar(this.scene, 0, 0, config);
    } else {
      avatar.reconfigure(config);
    }
    avatar.setActive(true).setVisible(true);
    this.active.set(userId, avatar);
    return avatar;
  }

  release(userId: string): void {
    const avatar = this.active.get(userId);
    if (avatar) {
      avatar.setActive(false).setVisible(false);
      this.active.delete(userId);
      this.pool.push(avatar);
    }
  }
}

// Ottimizzazione 2: Throttle aggiornamenti posizione
export class MovementSystem {
  private lastEmitTime = 0;
  private readonly EMIT_INTERVAL = 50; // 20 aggiornamenti/secondo max

  update(time: number): void {
    if (time - this.lastEmitTime < this.EMIT_INTERVAL) return;
    this.lastEmitTime = time;
    this.emitPosition();
  }
}

// Ottimizzazione 3: Dirty flag per depth sorting
export class DepthSortSystem {
  private isDirty = false;
  private objects: Phaser.GameObjects.GameObject[] = [];

  markDirty(): void { this.isDirty = true; }

  update(): void {
    if (!this.isDirty) return;
    this.isDirty = false;
    // Ordina solo quando necessario
    this.objects.sort((a, b) => a.depth - b.depth);
  }
}
```

### 11.3 Ottimizzazioni Bundle

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separa Phaser dal codice applicativo
          'phaser': ['phaser'],
          // Separa LiveKit
          'livekit': ['livekit-client'],
          // Stanze caricate lazy
          'room-mall': ['./src/scenes/rooms/MallScene'],
          'room-bar': ['./src/scenes/rooms/BarScene'],
          'room-park': ['./src/scenes/rooms/ParkScene'],
          'room-lake': ['./src/scenes/rooms/LakeScene'],
        },
      },
    },
    // Compressione aggressiva
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
});
```

### 11.4 Ottimizzazioni Rete

```typescript
// Compressione messaggi Socket.IO con msgpack
// server/src/index.ts
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import msgpack from 'socket.io-msgpack-parser';

const io = new Server(httpServer, {
  parser: msgpack,              // Riduce dimensione messaggi ~30%
  pingTimeout: 20000,
  pingInterval: 25000,
  transports: ['websocket'],    // Forza WebSocket, evita polling
  perMessageDeflate: {          // Compressione WebSocket
    threshold: 1024,
  },
});

// Adapter Redis per scaling orizzontale
const pubClient = redis.duplicate();
const subClient = redis.duplicate();
io.adapter(createAdapter(pubClient, subClient));
```

### 11.5 Monitoraggio Performance in Produzione

```typescript
// client: Performance Observer per FPS
export class PerformanceMonitor {
  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 60;

  update(): void {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastTime = now;

      // Invia metriche al server se FPS < 30
      if (this.fps < 30) {
        this.reportLowFPS(this.fps);
      }
    }
  }

  private reportLowFPS(fps: number): void {
    navigator.sendBeacon('/api/metrics', JSON.stringify({
      type: 'low_fps',
      fps,
      userAgent: navigator.userAgent,
      timestamp: Date.now(),
    }));
  }
}
```

---

## 12. Sicurezza e Moderazione

### 12.1 Sicurezza Backend

**Autenticazione:**
- JWT con scadenza 24h + refresh token (7 giorni)
- Password hashate con bcrypt (cost factor 12)
- Rate limiting su `/auth/login`: 5 tentativi/minuto per IP

**Validazione Input:**
- Tutti gli input validati con Zod (TypeScript-first schema validation)
- Sanitizzazione username (solo alfanumerici + underscore, 3-30 caratteri)
- Validazione posizioni server-side (anti-teleport cheat)

**WebSocket:**
- Autenticazione JWT obbligatoria alla connessione Socket.IO
- Rate limiting su eventi `move`: max 30/secondo per utente
- Validazione coordinate: devono essere dentro i bounds della stanza

```typescript
// server/src/socket/middleware/socketAuth.ts
import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

export function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void): void {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('AUTH_REQUIRED'));

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    socket.data.userId = payload.userId;
    socket.data.username = payload.username;
    next();
  } catch {
    next(new Error('AUTH_INVALID'));
  }
}
```

### 12.2 Moderazione

**Strumenti:**
- **Mute locale:** Ogni utente può silenziare altri utenti localmente (lato client)
- **Report:** Pulsante "Segnala utente" nel profilo avatar
- **Ban:** Admin panel per ban temporaneo/permanente
- **Kick da stanza:** Moderatori possono rimuovere utenti da una stanza

**Privacy:**
- Nessuna registrazione audio lato server
- IP non loggati nei log applicativi
- GDPR: export e cancellazione dati utente disponibili

### 12.3 Configurazione Docker e Deploy

```yaml
# docker-compose.prod.yml
version: '3.9'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - client_build:/usr/share/nginx/html:ro
    depends_on:
      - server
      - livekit

  server:
    build:
      context: .
      dockerfile: docker/Dockerfile.server
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
      - LIVEKIT_URL=${LIVEKIT_URL}
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  livekit:
    image: livekit/livekit-server:latest
    ports:
      - "7880:7880"
      - "7881:7881"
      - "7882:7882/udp"
    volumes:
      - ./docker/livekit.yaml:/etc/livekit.yaml:ro
    command: --config /etc/livekit.yaml
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=socialsquare
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  client_build:
```

```nginx
# nginx/nginx.conf
server {
    listen 443 ssl http2;
    server_name socialsquare.app;

    ssl_certificate /etc/letsencrypt/live/socialsquare.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/socialsquare.app/privkey.pem;

    # Serve client statico
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API REST
    location /api/ {
        proxy_pass http://server:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Socket.IO WebSocket
    location /socket.io/ {
        proxy_pass http://server:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    # LiveKit WebRTC
    location /livekit/ {
        proxy_pass http://livekit:7880/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Appendice A — Variabili d'Ambiente

```bash
# .env.example

# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/socialsquare
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-key

# LiveKit
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
LIVEKIT_URL=wss://your-livekit-server.com

# Client (Vite)
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
VITE_LIVEKIT_URL=wss://your-livekit-server.com
```

---

## Appendice B — Comandi di Sviluppo

```bash
# Installazione dipendenze (monorepo pnpm)
pnpm install

# Avvio sviluppo locale (tutti i servizi)
docker-compose up -d          # Redis + PostgreSQL
pnpm dev                      # Client + Server in parallelo

# Solo client
pnpm --filter client dev

# Solo server
pnpm --filter server dev

# Build produzione
pnpm build

# Test
pnpm test

# Generazione atlas sprite
node scripts/pack-atlas.js

# Migrazione database
pnpm --filter server db:migrate

# Deploy
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## Appendice C — Glossario

| Termine | Definizione |
|---------|-------------|
| **Tile isometrico** | Elemento grafico a forma di rombo che compone la mappa di gioco |
| **Depth sorting** | Ordinamento degli oggetti per simulare la profondità in 2D |
| **SFU** | Selective Forwarding Unit — server che instrada stream audio/video senza decodificarli |
| **Sprite sheet** | Immagine singola contenente tutti i frame di un'animazione |
| **Atlas texture** | Immagine singola contenente più sprite, ottimizza le draw call GPU |
| **Object pooling** | Riutilizzo di oggetti già creati per evitare garbage collection |
| **Lerp** | Linear interpolation — tecnica per movimenti fluidi tra due posizioni |
| **A\*** | Algoritmo di pathfinding per trovare il percorso ottimale su una griglia |
| **WebRTC** | Web Real-Time Communication — protocollo per audio/video P2P nel browser |
| **JWT** | JSON Web Token — standard per autenticazione stateless |

---

*Fine del documento — Social Square Game Plan v1.0*

*Prossimo passo consigliato: Setup del monorepo e implementazione del prototipo isometrico (Fase 1, Settimana 1).*
