# Phase 0 — Continuous Sector World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed single-grid `BarScene` with a continuous, sector-streamed world where the camera stays centered on the player and adjacent sectors load/unload asynchronously with loading feedback.

**Architecture:** A `WorldMap` holds the currently-active sectors and answers walkability/tile queries in **global tile coordinates**. A `WorldStreamer` watches the player's tile position and loads the 3×3 ring of sectors around them (async via `SectorLoader`), unloading the rest. A `SectorRenderer` draws each loaded sector's tiles into its own Graphics layer. `MovementSystem` is decoupled from any fixed grid via a `Walkable` interface. The bar becomes sector `(0,0)` and a garden becomes sector `(0,1)`.

**Tech Stack:** TypeScript, Phaser 3, Vitest (new), Vite, pnpm.

---

## File Structure

**New files:**
- `apps/client/src/world/types.ts` — `SECTOR_SIZE`, `TileData`, `SectorData`, `SectorModule`
- `apps/client/src/world/coords.ts` — pure coordinate helpers + `computeActiveSet`
- `apps/client/src/world/coords.test.ts`
- `apps/client/src/world/SectorLoader.ts` — async sector loading via injected registry
- `apps/client/src/world/SectorLoader.test.ts`
- `apps/client/src/world/WorldMap.ts` — active-sector registry + walkability/tile queries
- `apps/client/src/world/WorldMap.test.ts`
- `apps/client/src/world/WorldStreamer.ts` — orchestrates load/unload + loading events
- `apps/client/src/world/SectorRenderer.ts` — draws a sector's tiles into a Graphics layer
- `apps/client/src/world/sectors/sector_0_0.ts` — bar sector data
- `apps/client/src/world/sectors/sector_0_1.ts` — garden sector data
- `apps/client/src/world/sectors/index.ts` — real sector registry (dynamic imports)
- `apps/client/vitest.config.ts`

**Modified files:**
- `apps/client/package.json` — add vitest + test scripts
- `apps/client/src/systems/MovementSystem.ts` — use `Walkable` interface instead of `boolean[][]`
- `apps/client/src/systems/MovementSystem.test.ts` — new tests
- `apps/client/src/systems/CameraSystem.ts` — add `setLerp`
- `apps/client/src/scenes/rooms/BaseRoomScene.ts` — use WorldMap/WorldStreamer/SectorRenderer; camera always centered
- `apps/client/src/scenes/rooms/BarScene.ts` — provide `getWorldConfig()` instead of `getRoomConfig()`
- `apps/client/src/store/gameStore.ts` — add `worldLoading`
- `apps/client/src/ui/HUD.tsx` — loading overlay

---

## Task 1: Set up Vitest

**Files:**
- Modify: `apps/client/package.json`
- Create: `apps/client/vitest.config.ts`

- [ ] **Step 1: Install vitest**

Run from repo root:
```bash
pnpm --filter client add -D vitest
```
Expected: vitest added to `apps/client` devDependencies.

- [ ] **Step 2: Create vitest config**

Create `apps/client/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, '../../packages/shared/src'),
      '@social-square/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add test scripts**

In `apps/client/package.json`, add to `"scripts"`:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Verify the runner works**

Run from repo root:
```bash
pnpm --filter client test
```
Expected: vitest runs and reports "No test files found" (exit 0) — runner is wired.

- [ ] **Step 5: Commit**

```bash
git add apps/client/package.json apps/client/vitest.config.ts pnpm-lock.yaml
git commit -m "chore: set up vitest in client"
```

---

## Task 2: Sector coordinate helpers

**Files:**
- Create: `apps/client/src/world/types.ts`
- Create: `apps/client/src/world/coords.ts`
- Test: `apps/client/src/world/coords.test.ts`

- [ ] **Step 1: Create the world types**

Create `apps/client/src/world/types.ts`:
```typescript
/** Side length (in tiles) of a square sector. */
export const SECTOR_SIZE = 24;

export interface TileData {
  walkable: boolean;
  color: number;
  /** Optional raised top-face color for obstacles. */
  topColor?: number;
}

export interface SectorData {
  sx: number;
  sy: number;
  /** SECTOR_SIZE × SECTOR_SIZE, indexed [localY][localX]. */
  tiles: TileData[][];
}

/** Shape of a dynamically-imported sector module. */
export interface SectorModule {
  sector: SectorData;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/client/src/world/coords.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { sectorKey, globalToSector, toLocal, computeActiveSet } from './coords';

describe('coords', () => {
  it('builds a stable sector key', () => {
    expect(sectorKey(0, 0)).toBe('0,0');
    expect(sectorKey(-1, 2)).toBe('-1,2');
  });

  it('maps global tile coords to sector index', () => {
    expect(globalToSector(0)).toBe(0);
    expect(globalToSector(23)).toBe(0);
    expect(globalToSector(24)).toBe(1);
    expect(globalToSector(-1)).toBe(-1);
  });

  it('maps global tile coords to local coords (always 0..SECTOR_SIZE-1)', () => {
    expect(toLocal(0)).toBe(0);
    expect(toLocal(23)).toBe(23);
    expect(toLocal(24)).toBe(0);
    expect(toLocal(-1)).toBe(23);
  });

  it('computes the 3x3 active set around a center sector', () => {
    const set = computeActiveSet(0, 0, 1).sort();
    expect(set).toEqual(
      ['-1,-1', '-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,-1', '1,0', '1,1'].sort(),
    );
    expect(set).toHaveLength(9);
  });
});
```

- [ ] **Step 2b: Run test to verify it fails**

Run: `pnpm --filter client test`
Expected: FAIL — `./coords` not found.

- [ ] **Step 3: Implement coords.ts**

Create `apps/client/src/world/coords.ts`:
```typescript
import { SECTOR_SIZE } from './types';

export function sectorKey(sx: number, sy: number): string {
  return `${sx},${sy}`;
}

export function globalToSector(g: number): number {
  return Math.floor(g / SECTOR_SIZE);
}

/** Local coordinate within a sector, always in [0, SECTOR_SIZE). */
export function toLocal(g: number): number {
  return ((g % SECTOR_SIZE) + SECTOR_SIZE) % SECTOR_SIZE;
}

/** Keys of all sectors within `radius` (Chebyshev) of the center sector. */
export function computeActiveSet(cx: number, cy: number, radius: number): string[] {
  const keys: string[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      keys.push(sectorKey(cx + dx, cy + dy));
    }
  }
  return keys;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client test`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/world/types.ts apps/client/src/world/coords.ts apps/client/src/world/coords.test.ts
git commit -m "feat: world sector types and coordinate helpers"
```

---

## Task 3: SectorLoader

**Files:**
- Create: `apps/client/src/world/SectorLoader.ts`
- Test: `apps/client/src/world/SectorLoader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/client/src/world/SectorLoader.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { SectorLoader, type SectorRegistry } from './SectorLoader';
import type { SectorData } from './types';

function fakeSector(sx: number, sy: number): SectorData {
  return { sx, sy, tiles: [] };
}

describe('SectorLoader', () => {
  const registry: SectorRegistry = {
    '0,0': () => Promise.resolve({ sector: fakeSector(0, 0) }),
  };

  it('loads a known sector', async () => {
    const loader = new SectorLoader(registry);
    const data = await loader.load(0, 0);
    expect(data).not.toBeNull();
    expect(data?.sx).toBe(0);
  });

  it('returns null for an unknown sector', async () => {
    const loader = new SectorLoader(registry);
    expect(await loader.load(5, 5)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client test SectorLoader`
Expected: FAIL — `./SectorLoader` not found.

- [ ] **Step 3: Implement SectorLoader.ts**

Create `apps/client/src/world/SectorLoader.ts`:
```typescript
import { sectorKey } from './coords';
import type { SectorData, SectorModule } from './types';

export type SectorRegistry = Record<string, () => Promise<SectorModule>>;

/** Loads sector data asynchronously from an injected registry. */
export class SectorLoader {
  constructor(private readonly registry: SectorRegistry) {}

  /** Returns the sector data, or null if no sector is registered at (sx, sy). */
  async load(sx: number, sy: number): Promise<SectorData | null> {
    const importer = this.registry[sectorKey(sx, sy)];
    if (!importer) return null;
    const mod = await importer();
    return mod.sector;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client test SectorLoader`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/world/SectorLoader.ts apps/client/src/world/SectorLoader.test.ts
git commit -m "feat: async sector loader with injectable registry"
```

---

## Task 4: WorldMap

**Files:**
- Create: `apps/client/src/world/WorldMap.ts`
- Test: `apps/client/src/world/WorldMap.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/client/src/world/WorldMap.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { WorldMap } from './WorldMap';
import { SECTOR_SIZE, type SectorData, type TileData } from './types';

function solidSector(sx: number, sy: number, walkable: boolean): SectorData {
  const tiles: TileData[][] = [];
  for (let y = 0; y < SECTOR_SIZE; y++) {
    tiles[y] = [];
    for (let x = 0; x < SECTOR_SIZE; x++) {
      tiles[y][x] = { walkable, color: 0x000000 };
    }
  }
  return { sx, sy, tiles };
}

describe('WorldMap', () => {
  it('returns not-walkable for tiles in unloaded sectors', () => {
    const map = new WorldMap();
    expect(map.isWalkable(0, 0)).toBe(false);
    expect(map.getTile(0, 0)).toBeNull();
  });

  it('reads walkability from a loaded sector in global coords', () => {
    const map = new WorldMap();
    map.setSector(solidSector(0, 0, true));
    expect(map.isWalkable(5, 5)).toBe(true);
    expect(map.getTile(5, 5)?.walkable).toBe(true);
  });

  it('resolves the correct sector for global coords beyond the first sector', () => {
    const map = new WorldMap();
    map.setSector(solidSector(0, 1, true)); // covers gy in [24, 48)
    expect(map.isWalkable(3, SECTOR_SIZE + 2)).toBe(true);
    expect(map.isWalkable(3, 2)).toBe(false); // sector (0,0) not loaded
  });

  it('removes a sector', () => {
    const map = new WorldMap();
    map.setSector(solidSector(0, 0, true));
    map.removeSector(0, 0);
    expect(map.isWalkable(5, 5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client test WorldMap`
Expected: FAIL — `./WorldMap` not found.

- [ ] **Step 3: Implement WorldMap.ts**

Create `apps/client/src/world/WorldMap.ts`:
```typescript
import { globalToSector, sectorKey, toLocal } from './coords';
import type { SectorData, TileData } from './types';

/** Holds the currently-active sectors and answers queries in global tile coords. */
export class WorldMap {
  private _sectors = new Map<string, SectorData>();

  setSector(data: SectorData): void {
    this._sectors.set(sectorKey(data.sx, data.sy), data);
  }

  removeSector(sx: number, sy: number): void {
    this._sectors.delete(sectorKey(sx, sy));
  }

  hasSector(sx: number, sy: number): boolean {
    return this._sectors.has(sectorKey(sx, sy));
  }

  getTile(gx: number, gy: number): TileData | null {
    const sx = globalToSector(gx);
    const sy = globalToSector(gy);
    const sector = this._sectors.get(sectorKey(sx, sy));
    if (!sector) return null;
    return sector.tiles[toLocal(gy)]?.[toLocal(gx)] ?? null;
  }

  isWalkable(gx: number, gy: number): boolean {
    return this.getTile(gx, gy)?.walkable ?? false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client test WorldMap`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/world/WorldMap.ts apps/client/src/world/WorldMap.test.ts
git commit -m "feat: WorldMap active-sector registry with global-coord queries"
```

---

## Task 5: Refactor MovementSystem onto a Walkable interface

**Files:**
- Modify: `apps/client/src/systems/MovementSystem.ts`
- Test: `apps/client/src/systems/MovementSystem.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/client/src/systems/MovementSystem.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { MovementSystem, type Walkable } from './MovementSystem';

/** Walkable backed by a small dense grid (true = walkable). */
function gridWalkable(grid: boolean[][]): Walkable {
  return {
    isWalkable: (x, y) => grid[y]?.[x] ?? false,
  };
}

describe('MovementSystem', () => {
  it('paths in a straight line on an open grid', () => {
    const grid = Array.from({ length: 3 }, () => [true, true, true]);
    const ms = new MovementSystem(gridWalkable(grid), 5);
    ms.setPosition(0, 0);
    ms.moveTo(2, 0);
    expect(ms.isMoving).toBe(true);
  });

  it('does not move to a non-walkable target', () => {
    const grid = [[true, false]];
    const ms = new MovementSystem(gridWalkable(grid), 5);
    ms.setPosition(0, 0);
    ms.moveTo(1, 0);
    expect(ms.isMoving).toBe(false);
  });

  it('advances position over time toward the target', () => {
    const grid = Array.from({ length: 1 }, () => [true, true, true]);
    const ms = new MovementSystem(gridWalkable(grid), 1); // 1 cell/sec
    ms.setPosition(0, 0);
    ms.moveTo(2, 0);
    ms.update(1); // 1 second → ~1 cell
    expect(ms.posX).toBeGreaterThan(0.5);
    expect(ms.posY).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client test MovementSystem`
Expected: FAIL — `Walkable` is not exported / constructor signature mismatch.

- [ ] **Step 3: Refactor MovementSystem to use Walkable**

In `apps/client/src/systems/MovementSystem.ts`:

Replace the top of the file (the `GridPoint` block and the class fields/constructor) — change the class to depend on a `Walkable` instead of a `boolean[][]`.

Add this exported interface near `GridPoint`:
```typescript
export interface Walkable {
  isWalkable(x: number, y: number): boolean;
}
```

Replace these class fields:
```typescript
  private _grid: boolean[][];
  private _cols: number;
  private _rows: number;
```
with:
```typescript
  private _map: Walkable;
```

Replace the constructor:
```typescript
  constructor(grid: boolean[][], speed = 4) {
    this._grid = grid;
    this._rows = grid.length;
    this._cols = grid[0]?.length ?? 0;
    this.speed = speed;
  }
```
with:
```typescript
  constructor(map: Walkable, speed = 4) {
    this._map = map;
    this.speed = speed;
  }
```

Replace `_isWalkable`:
```typescript
  private _isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this._cols || y >= this._rows) return false;
    return this._grid[y][x];
  }
```
with:
```typescript
  private _isWalkable(x: number, y: number): boolean {
    return this._map.isWalkable(x, y);
  }
```

Replace `setGrid`:
```typescript
  /** Replace the walkability grid (e.g. after obstacles change). */
  setGrid(grid: boolean[][]): void {
    this._grid = grid;
    this._rows = grid.length;
    this._cols = grid[0]?.length ?? 0;
  }
```
with:
```typescript
  /** Replace the walkability source. */
  setMap(map: Walkable): void {
    this._map = map;
  }
```

> Note: A* over an unbounded `Walkable` could wander far if asked to reach an unreachable cell. `moveTo` already early-returns when the target is not walkable, so unloaded/blocked targets cost nothing. This is acceptable for Phase 0 (targets are always within loaded, on-screen sectors).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client test MovementSystem`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/systems/MovementSystem.ts apps/client/src/systems/MovementSystem.test.ts
git commit -m "refactor: MovementSystem depends on Walkable interface"
```

---

## Task 6: WorldStreamer

**Files:**
- Create: `apps/client/src/world/WorldStreamer.ts`
- Test: `apps/client/src/world/WorldStreamer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/client/src/world/WorldStreamer.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { WorldStreamer } from './WorldStreamer';
import { SectorLoader, type SectorRegistry } from './SectorLoader';
import { WorldMap } from './WorldMap';
import { SECTOR_SIZE, type SectorData } from './types';

function emptySector(sx: number, sy: number): SectorData {
  return { sx, sy, tiles: [] };
}

function registryForAll(): SectorRegistry {
  // Any requested sector resolves to an empty sector.
  return new Proxy({}, {
    get: (_t, key: string) => {
      const [sx, sy] = key.split(',').map(Number);
      return () => Promise.resolve({ sector: emptySector(sx, sy) });
    },
    has: () => true,
  }) as SectorRegistry;
}

describe('WorldStreamer', () => {
  it('loads the 3x3 ring around the starting tile', async () => {
    const map = new WorldMap();
    const loader = new SectorLoader(registryForAll());
    const ready = vi.fn();
    const streamer = new WorldStreamer(map, loader, { onSectorReady: ready });

    await streamer.update(0, 0); // sector (0,0)
    expect(ready).toHaveBeenCalledTimes(9);
    expect(map.hasSector(0, 0)).toBe(true);
    expect(map.hasSector(1, 1)).toBe(true);
    expect(map.hasSector(-1, -1)).toBe(true);
  });

  it('unloads sectors that leave the active ring when the player moves', async () => {
    const map = new WorldMap();
    const loader = new SectorLoader(registryForAll());
    const unloaded = vi.fn();
    const streamer = new WorldStreamer(map, loader, { onSectorUnload: unloaded });

    await streamer.update(0, 0);            // center (0,0)
    await streamer.update(SECTOR_SIZE * 3, 0); // jump to sector (3,0)

    // (-1,-1) was in the first ring, not the second → unloaded
    expect(map.hasSector(-1, -1)).toBe(false);
    expect(unloaded).toHaveBeenCalled();
  });

  it('fires loading state callbacks (initial then null)', async () => {
    const map = new WorldMap();
    const loader = new SectorLoader(registryForAll());
    const states: Array<string | null> = [];
    const streamer = new WorldStreamer(map, loader, {
      onLoadingChange: (s) => states.push(s),
    });

    await streamer.update(0, 0);
    expect(states[0]).toBe('initial');
    expect(states[states.length - 1]).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client test WorldStreamer`
Expected: FAIL — `./WorldStreamer` not found.

- [ ] **Step 3: Implement WorldStreamer.ts**

Create `apps/client/src/world/WorldStreamer.ts`:
```typescript
import { computeActiveSet, globalToSector, sectorKey } from './coords';
import type { SectorLoader } from './SectorLoader';
import type { WorldMap } from './WorldMap';
import type { SectorData } from './types';

export type LoadingState = 'initial' | 'streaming' | null;

export interface WorldStreamerCallbacks {
  onSectorReady?: (data: SectorData) => void;
  onSectorUnload?: (sx: number, sy: number) => void;
  onLoadingChange?: (state: LoadingState) => void;
}

const RADIUS = 1; // 3x3 ring

/** Keeps the WorldMap populated with the sectors around the player. */
export class WorldStreamer {
  private _currentKey: string | null = null;
  private _firstLoadDone = false;

  constructor(
    private readonly map: WorldMap,
    private readonly loader: SectorLoader,
    private readonly cb: WorldStreamerCallbacks = {},
  ) {}

  /** Call with the player's global tile position. Loads/unloads as needed. */
  async update(gx: number, gy: number): Promise<void> {
    const cx = globalToSector(gx);
    const cy = globalToSector(gy);
    const key = sectorKey(cx, cy);
    if (key === this._currentKey) return;
    this._currentKey = key;

    const desired = new Set(computeActiveSet(cx, cy, RADIUS));

    // Unload sectors no longer in range
    for (const k of this._loadedKeys()) {
      if (!desired.has(k)) {
        const [sx, sy] = k.split(',').map(Number);
        this.map.removeSector(sx, sy);
        this.cb.onSectorUnload?.(sx, sy);
      }
    }

    // Determine which desired sectors still need loading
    const toLoad: Array<[number, number]> = [];
    for (const k of desired) {
      const [sx, sy] = k.split(',').map(Number);
      if (!this.map.hasSector(sx, sy)) toLoad.push([sx, sy]);
    }

    if (toLoad.length > 0) {
      this.cb.onLoadingChange?.(this._firstLoadDone ? 'streaming' : 'initial');
      await Promise.all(
        toLoad.map(async ([sx, sy]) => {
          const data = await this.loader.load(sx, sy);
          if (data) {
            this.map.setSector(data);
            this.cb.onSectorReady?.(data);
          }
        }),
      );
      this._firstLoadDone = true;
      this.cb.onLoadingChange?.(null);
    }
  }

  private _loadedKeys(): string[] {
    // Reconstruct from the previous desired ring + current; cheap for small worlds.
    // We track via the map: ask for the union of the last two rings.
    const keys = new Set<string>();
    if (this._currentKey) {
      const [cx, cy] = this._currentKey.split(',').map(Number);
      for (const k of computeActiveSet(cx, cy, RADIUS + 1)) keys.add(k);
    }
    return [...keys].filter((k) => {
      const [sx, sy] = k.split(',').map(Number);
      return this.map.hasSector(sx, sy);
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client test WorldStreamer`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/world/WorldStreamer.ts apps/client/src/world/WorldStreamer.test.ts
git commit -m "feat: WorldStreamer loads/unloads sector rings with loading state"
```

---

## Task 7: SectorRenderer

**Files:**
- Create: `apps/client/src/world/SectorRenderer.ts`

> Rendering depends on Phaser at runtime; verification is manual (covered in Task 11's integration run). This task only adds the renderer and confirms it type-checks.

- [ ] **Step 1: Implement SectorRenderer.ts**

Create `apps/client/src/world/SectorRenderer.ts`:
```typescript
import Phaser from 'phaser';
import { IsometricSystem } from '../systems/IsometricSystem';
import { sectorKey } from './coords';
import { SECTOR_SIZE, type SectorData, type TileData } from './types';

/** Draws each sector's tiles into its own Graphics layer (below entities). */
export class SectorRenderer {
  private _layers = new Map<string, Phaser.GameObjects.Graphics>();

  constructor(private readonly scene: Phaser.Scene) {}

  render(data: SectorData): void {
    const key = sectorKey(data.sx, data.sy);
    this.remove(data.sx, data.sy); // replace if already present

    const gfx = this.scene.add.graphics();
    gfx.setDepth(-1);

    const baseX = data.sx * SECTOR_SIZE;
    const baseY = data.sy * SECTOR_SIZE;

    for (let ly = 0; ly < data.tiles.length; ly++) {
      const row = data.tiles[ly];
      if (!row) continue;
      for (let lx = 0; lx < row.length; lx++) {
        this._drawTile(gfx, baseX + lx, baseY + ly, row[lx]);
      }
    }

    this._layers.set(key, gfx);
  }

  remove(sx: number, sy: number): void {
    const key = sectorKey(sx, sy);
    this._layers.get(key)?.destroy();
    this._layers.delete(key);
  }

  destroyAll(): void {
    this._layers.forEach((g) => g.destroy());
    this._layers.clear();
  }

  private _drawTile(gfx: Phaser.GameObjects.Graphics, gx: number, gy: number, tile: TileData): void {
    const iso = IsometricSystem.worldToIso(gx, gy);
    const hw = IsometricSystem.TILE_HALF_W;
    const hh = IsometricSystem.TILE_HALF_H;

    const top    = { x: iso.x,      y: iso.y - hh };
    const right  = { x: iso.x + hw, y: iso.y };
    const bottom = { x: iso.x,      y: iso.y + hh };
    const left   = { x: iso.x - hw, y: iso.y };

    gfx.fillStyle(tile.color, 1);
    gfx.fillPoints([top, right, bottom, left], true);

    if (tile.walkable) {
      // Bevel lighting: top-left bright, bottom-right shadow
      gfx.lineStyle(1.5, 0xffffff, 0.13);
      gfx.lineBetween(left.x, left.y, top.x, top.y);
      gfx.lineBetween(top.x, top.y, right.x, right.y);
      gfx.lineStyle(1.5, 0x000000, 0.18);
      gfx.lineBetween(right.x, right.y, bottom.x, bottom.y);
      gfx.lineBetween(bottom.x, bottom.y, left.x, left.y);
    } else {
      gfx.lineStyle(1, 0x000000, 0.5);
      gfx.strokePoints([top, right, bottom, left], true);

      // Raised top face + side faces
      const topColor = tile.topColor ?? 0x884422;
      const lift = 8;
      const tTop    = { x: iso.x,      y: iso.y - hh - lift };
      const tRight  = { x: iso.x + hw, y: iso.y - lift };
      const tBottom = { x: iso.x,      y: iso.y + hh - lift };
      const tLeft   = { x: iso.x - hw, y: iso.y - lift };
      gfx.fillStyle(topColor, 1);
      gfx.fillPoints([tTop, tRight, tBottom, tLeft], true);
      gfx.lineStyle(1, 0x000000, 0.4);
      gfx.strokePoints([tTop, tRight, tBottom, tLeft], true);
      gfx.fillStyle(0x663311, 1);
      gfx.fillPoints([tRight, right, bottom, tBottom], true);
      gfx.fillStyle(0x552200, 1);
      gfx.fillPoints([tLeft, left, bottom, tBottom], true);
    }
  }
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm --filter client typecheck`
Expected: exit 0 (no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/world/SectorRenderer.ts
git commit -m "feat: SectorRenderer draws per-sector tile layers"
```

---

## Task 8: Bar and garden sector data + registry

**Files:**
- Create: `apps/client/src/world/sectors/sector_0_0.ts`
- Create: `apps/client/src/world/sectors/sector_0_1.ts`
- Create: `apps/client/src/world/sectors/index.ts`

- [ ] **Step 1: Create the bar sector (0,0)**

Create `apps/client/src/world/sectors/sector_0_0.ts`:
```typescript
import { SECTOR_SIZE, type SectorData, type TileData } from '../types';

const FLOOR_A = 0x3d2b1f;  // dark wood
const FLOOR_B = 0x4a3525;  // lighter wood
const OBSTACLE = 0x6b3a2a; // warm brown obstacle
const WALL = 0x2c1d14;     // dark wall

// Obstacles in LOCAL sector coords [col, row]
const OBSTACLES: [number, number][] = [
  [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], // bar counter
  [15, 0], [16, 0], [17, 0],                                       // shelf
  [16, 3],                                                          // jukebox spot
  [4, 5], [5, 5], [12, 5], [13, 5],                                 // tables
  [4, 10], [5, 10], [12, 10], [13, 10],
];

// The bar is an 18×17 room inside the 24×24 sector. Tiles outside that are walls.
const BAR_COLS = 18;
const BAR_ROWS = 17;

function build(): SectorData {
  const tiles: TileData[][] = [];
  for (let y = 0; y < SECTOR_SIZE; y++) {
    tiles[y] = [];
    for (let x = 0; x < SECTOR_SIZE; x++) {
      const insideBar = x < BAR_COLS && y < BAR_ROWS;
      tiles[y][x] = insideBar
        ? { walkable: true, color: (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B }
        : { walkable: false, color: WALL, topColor: WALL };
    }
  }
  for (const [x, y] of OBSTACLES) {
    tiles[y][x] = { walkable: false, color: OBSTACLE };
  }
  // Open a doorway on the south edge of the bar (row BAR_ROWS-1) so players can
  // walk down into the garden sector (0,1).
  tiles[BAR_ROWS - 1][9] = { walkable: true, color: FLOOR_A };
  tiles[BAR_ROWS - 1][10] = { walkable: true, color: FLOOR_B };

  return { sx: 0, sy: 0, tiles };
}

export const sector: SectorData = build();
```

- [ ] **Step 2: Create the garden sector (0,1)**

Create `apps/client/src/world/sectors/sector_0_1.ts`:
```typescript
import { SECTOR_SIZE, type SectorData, type TileData } from '../types';

const GRASS_A = 0x3f6f3a;
const GRASS_B = 0x477a40;
const PATH = 0x8a7a55;
const HEDGE = 0x274d24;

function build(): SectorData {
  const tiles: TileData[][] = [];
  for (let y = 0; y < SECTOR_SIZE; y++) {
    tiles[y] = [];
    for (let x = 0; x < SECTOR_SIZE; x++) {
      tiles[y][x] = { walkable: true, color: (x + y) % 2 === 0 ? GRASS_A : GRASS_B };
    }
  }
  // A path leading down from the bar doorway (cols 9-10) into the garden.
  for (let y = 0; y < 6; y++) {
    tiles[y][9] = { walkable: true, color: PATH };
    tiles[y][10] = { walkable: true, color: PATH };
  }
  // Hedge border on the far (south) edge of the garden.
  for (let x = 0; x < SECTOR_SIZE; x++) {
    tiles[SECTOR_SIZE - 1][x] = { walkable: false, color: HEDGE, topColor: HEDGE };
  }
  return { sx: 0, sy: 1, tiles };
}

export const sector: SectorData = build();
```

- [ ] **Step 3: Create the registry**

Create `apps/client/src/world/sectors/index.ts`:
```typescript
import type { SectorRegistry } from '../SectorLoader';

/** Maps sector keys to dynamic-import loaders (code-split per sector). */
export const SECTOR_REGISTRY: SectorRegistry = {
  '0,0': () => import('./sector_0_0'),
  '0,1': () => import('./sector_0_1'),
};
```

- [ ] **Step 4: Verify type-check**

Run: `pnpm --filter client typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/world/sectors/
git commit -m "feat: bar (0,0) and garden (0,1) sector data + registry"
```

---

## Task 9: CameraSystem always-centered support

**Files:**
- Modify: `apps/client/src/systems/CameraSystem.ts`

- [ ] **Step 1: Add a setLerp method**

In `apps/client/src/systems/CameraSystem.ts`, add this method to the `CameraSystem` class (e.g. after `follow`):
```typescript
  /** Set the follow lerp (1,1 = always perfectly centered). */
  setLerp(x: number, y: number): void {
    this._camera.setLerp(x, y);
  }
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm --filter client typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/systems/CameraSystem.ts
git commit -m "feat: CameraSystem.setLerp for always-centered follow"
```

---

## Task 10: gameStore + HUD loading overlay

**Files:**
- Modify: `apps/client/src/store/gameStore.ts`
- Modify: `apps/client/src/ui/HUD.tsx`

- [ ] **Step 1: Add worldLoading to the store**

In `apps/client/src/store/gameStore.ts`:

Add the import at the top (if not already present it already imports HeldItem — keep that line) and add a type alias above `interface GameState`:
```typescript
export type WorldLoadingState = 'initial' | 'streaming' | null;
```

Add to the `GameState` interface (next to `heldItem`):
```typescript
  worldLoading: WorldLoadingState;
  setWorldLoading: (s: WorldLoadingState) => void;
```

Add to the store body (next to `heldItem`):
```typescript
  worldLoading: null,
  setWorldLoading: (s) => set({ worldLoading: s }),
```

- [ ] **Step 2: Add the loading overlay to the HUD**

In `apps/client/src/ui/HUD.tsx`:

Add a selector near the other `useGameStore` calls:
```typescript
  const worldLoading = useGameStore((s) => s.worldLoading);
```

Add this block just before the `{/* Auth form overlay */}` comment in the returned JSX:
```tsx
      {/* World loading feedback */}
      {worldLoading === 'initial' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 150,
          display: 'flex', flexDirection: 'column', gap: '14px',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(8,8,20,0.95)',
          color: '#aaaaff', fontFamily: 'monospace', fontSize: '14px',
          pointerEvents: 'auto',
        }}>
          <div style={{
            width: '28px', height: '28px',
            border: '3px solid rgba(120,120,255,0.25)',
            borderTopColor: '#8888ff',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }} />
          Caricamento mondo…
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {worldLoading === 'streaming' && (
        <div style={{
          position: 'absolute', top: '48px', right: '12px', zIndex: 150,
          background: 'rgba(10,10,30,0.85)',
          border: '1px solid rgba(120,120,255,0.3)',
          borderRadius: '4px', padding: '5px 10px',
          color: '#8888cc', fontFamily: 'monospace', fontSize: '11px',
          pointerEvents: 'none',
        }}>
          Caricamento area…
        </div>
      )}
```

- [ ] **Step 3: Verify type-check**

Run: `pnpm --filter client typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/store/gameStore.ts apps/client/src/ui/HUD.tsx
git commit -m "feat: world loading state in store + HUD overlay"
```

---

## Task 11: Integrate the world into BaseRoomScene + BarScene

**Files:**
- Modify: `apps/client/src/scenes/rooms/BaseRoomScene.ts`
- Modify: `apps/client/src/scenes/rooms/BarScene.ts`

> This wires everything together. Verification is a manual dev run (Phaser runtime).

- [ ] **Step 1: Rewrite BaseRoomScene to use the world systems**

Replace the entire contents of `apps/client/src/scenes/rooms/BaseRoomScene.ts` with:
```typescript
/**
 * BaseRoomScene
 * Abstract base for isometric scenes backed by a streamed sector world.
 *
 * Subclasses implement getWorldConfig(): spawn point + username.
 * The camera stays centered on the player; sectors stream in/out as they move.
 */

import Phaser from 'phaser';
import { IsometricSystem } from '../../systems/IsometricSystem';
import { MovementSystem } from '../../systems/MovementSystem';
import { CameraSystem } from '../../systems/CameraSystem';
import { Avatar } from '../../entities/Avatar';
import { WorldMap } from '../../world/WorldMap';
import { SectorLoader } from '../../world/SectorLoader';
import { SectorRenderer } from '../../world/SectorRenderer';
import { WorldStreamer } from '../../world/WorldStreamer';
import { SECTOR_REGISTRY } from '../../world/sectors';
import { useGameStore } from '../../store/gameStore';

export interface WorldConfig {
  spawnX: number;
  spawnY: number;
  username?: string;
}

export abstract class BaseRoomScene extends Phaser.Scene {
  protected isoSystem!: IsometricSystem;
  protected movementSystem!: MovementSystem;
  protected cameraSystem!: CameraSystem;
  protected localAvatar!: Avatar;
  protected worldMap!: WorldMap;

  private _streamer!: WorldStreamer;
  private _renderer!: SectorRenderer;
  private _hoverGraphics!: Phaser.GameObjects.Graphics;
  private _hoveredTile: { x: number; y: number } | null = null;
  private _config!: WorldConfig;
  private _prevAvatarX = 0;
  private _prevAvatarY = 0;

  protected abstract getWorldConfig(): WorldConfig;

  create(): void {
    this._config = this.getWorldConfig();

    this.worldMap = new WorldMap();
    this._renderer = new SectorRenderer(this);
    const loader = new SectorLoader(SECTOR_REGISTRY);
    this._streamer = new WorldStreamer(this.worldMap, loader, {
      onSectorReady: (data) => this._renderer.render(data),
      onSectorUnload: (sx, sy) => this._renderer.remove(sx, sy),
      onLoadingChange: (s) => useGameStore.getState().setWorldLoading(s),
    });

    this.isoSystem = new IsometricSystem();
    this.movementSystem = new MovementSystem(this.worldMap, 5);
    this.cameraSystem = new CameraSystem(this.cameras.main, {
      zoom: 1.5, minZoom: 0.5, maxZoom: 3,
    });

    this._hoverGraphics = this.add.graphics();
    this._hoverGraphics.setDepth(-0.5);

    // Stream the starting ring, then spawn the player on top of it.
    void this._streamer.update(this._config.spawnX, this._config.spawnY).then(() => {
      this._spawnAvatar();
      this._setupCamera();
    });

    this._setupInput();
    this._setupBackButton();

    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      this.cameras.main.setSize(size.width, size.height);
    });
  }

  update(_time: number, delta: number): void {
    if (!this.localAvatar) return; // still loading initial ring

    this.movementSystem.update(delta / 1000);

    const newX = this.movementSystem.posX;
    const newY = this.movementSystem.posY;
    this.localAvatar.setWorldPosition(newX, newY);

    if (newX !== this._prevAvatarX || newY !== this._prevAvatarY) {
      const dx = newX - this._prevAvatarX;
      const dy = newY - this._prevAvatarY;
      this.localAvatar.setFacing(dx < 0 || (dx === 0 && dy > 0));
      this._prevAvatarX = newX;
      this._prevAvatarY = newY;
      // Drive sector streaming from the player's position.
      void this._streamer.update(Math.round(newX), Math.round(newY));
    }

    this.localAvatar.playAnimation(this.movementSystem.isMoving ? 'walk' : 'idle');
    this.isoSystem.update();
    this._updateHoverHighlight();
  }

  // ── Avatar ──────────────────────────────────────────────────────────────────

  private _spawnAvatar(): void {
    const { spawnX, spawnY, username } = this._config;
    this.localAvatar = new Avatar({
      scene: this, username: username ?? 'Player',
      worldX: spawnX, worldY: spawnY, isLocal: true,
    });
    this._prevAvatarX = spawnX;
    this._prevAvatarY = spawnY;
    this.movementSystem.setPosition(spawnX, spawnY);
    this.isoSystem.register(this.localAvatar, spawnX, spawnY);

    this.movementSystem.onMove = (x, y, _moving) => {
      this.isoSystem.updatePosition(this.localAvatar, x, y);
    };
  }

  // ── Input ───────────────────────────────────────────────────────────────────

  private _setupInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return;
      if (!this.localAvatar) return;
      const hits = this.input.hitTestPointer(pointer);
      if (hits.some((o) => o.getData('interactable'))) return;

      const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const world = IsometricSystem.isoToWorld(wp.x, wp.y);
      const tileX = Math.round(world.x);
      const tileY = Math.round(world.y);
      if (this.worldMap.isWalkable(tileX, tileY)) this._spawnClickRipple(tileX, tileY);
      this.movementSystem.moveTo(tileX, tileY);
    });

    this.cameraSystem.bindWheelZoom(this);
  }

  private _spawnClickRipple(tileX: number, tileY: number): void {
    const iso = IsometricSystem.worldToIso(tileX, tileY);
    const hw = IsometricSystem.TILE_HALF_W;
    const hh = IsometricSystem.TILE_HALF_H;
    const gfx = this.add.graphics();
    gfx.setDepth(-0.3);
    const state = { t: 0 };
    this.tweens.add({
      targets: state, t: 1, duration: 380, ease: 'Quad.easeOut',
      onUpdate: () => {
        const s = 0.15 + state.t * 0.95;
        const alpha = (1 - state.t) * 0.75;
        gfx.clear();
        gfx.lineStyle(2, 0xffffff, alpha);
        gfx.strokePoints([
          { x: iso.x,          y: iso.y - hh * s },
          { x: iso.x + hw * s, y: iso.y },
          { x: iso.x,          y: iso.y + hh * s },
          { x: iso.x - hw * s, y: iso.y },
        ], true);
      },
      onComplete: () => gfx.destroy(),
    });
  }

  private _updateHoverHighlight(): void {
    const pointer = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const world = IsometricSystem.isoToWorld(wp.x, wp.y);
    const tileX = Math.floor(world.x + 0.5);
    const tileY = Math.floor(world.y + 0.5);

    if (this.worldMap.getTile(tileX, tileY) === null) {
      this._hoverGraphics.clear();
      this._hoveredTile = null;
      return;
    }
    if (this._hoveredTile?.x === tileX && this._hoveredTile?.y === tileY) return;
    this._hoveredTile = { x: tileX, y: tileY };

    this._hoverGraphics.clear();
    const hoverColor = this.worldMap.isWalkable(tileX, tileY) ? 0xffffff : 0xff4444;
    const iso = IsometricSystem.worldToIso(tileX, tileY);
    const hw = IsometricSystem.TILE_HALF_W;
    const hh = IsometricSystem.TILE_HALF_H;
    this._hoverGraphics.lineStyle(2, hoverColor, 0.8);
    this._hoverGraphics.strokePoints([
      { x: iso.x, y: iso.y - hh }, { x: iso.x + hw, y: iso.y },
      { x: iso.x, y: iso.y + hh }, { x: iso.x - hw, y: iso.y },
    ], true);
  }

  // ── Camera ────────────────────────────────────────────────────────────────────

  private _setupCamera(): void {
    // No bounds: the camera is free to keep the player perfectly centered.
    this.cameraSystem.follow(this.localAvatar);
    this.cameraSystem.setLerp(1, 1);
  }

  // ── Back button ────────────────────────────────────────────────────────────────

  private _setupBackButton(): void {
    const btn = this.add.text(16, 16, '< Menu', {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
      backgroundColor: '#00000088', padding: { x: 8, y: 4 },
    }).setScrollFactor(0).setDepth(1000).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setStyle({ color: '#aaddff' }));
    btn.on('pointerout',  () => btn.setStyle({ color: '#ffffff' }));
    btn.on('pointerup',   () => this.scene.start('MenuScene'));
  }

  protected destroyWorld(): void {
    this._renderer?.destroyAll();
    useGameStore.getState().setWorldLoading(null);
  }
}
```

- [ ] **Step 2: Update BarScene to provide a WorldConfig**

In `apps/client/src/scenes/rooms/BarScene.ts`:

Change the import of the base types:
```typescript
import { BaseRoomScene, type RoomConfig, type TileData } from './BaseRoomScene';
```
to:
```typescript
import { BaseRoomScene, type WorldConfig } from './BaseRoomScene';
```

Delete the now-unused layout helpers `FLOOR_A`, `FLOOR_B`, `OBSTACLE`, `COLS`, `ROWS`, `OBSTACLES`, and the entire `buildBarConfig()` function (lines defining the old tile palette and room config). The sector data now lives in `world/sectors/sector_0_0.ts`.

Replace the `getRoomConfig` method:
```typescript
  protected getRoomConfig(): RoomConfig {
    return buildBarConfig();
  }
```
with:
```typescript
  protected getWorldConfig(): WorldConfig {
    return {
      spawnX: 9,
      spawnY: 14,
      username: useUserStore.getState().username ?? 'Player',
    };
  }
```

In the `_onShutdown` method, add a call to clean up world layers — add this line near the other cleanup calls (after `this._stations = [];`):
```typescript
    this.destroyWorld();
```

> The interactive stations stay at global tile coords (2,0) and (6,0), which fall inside sector (0,0), so no station changes are needed.

- [ ] **Step 3: Type-check and build**

Run:
```bash
pnpm --filter client typecheck
pnpm --filter client build
```
Expected: both exit 0.

- [ ] **Step 4: Manual verification — run the app**

Run from repo root:
```bash
pnpm dev
```
Open http://localhost:5173, log in, enter the bar. Verify:
1. A brief "Caricamento mondo…" full-screen loader appears, then the bar renders.
2. The player avatar is **centered** on screen and stays centered while moving.
3. Walking south through the doorway (around tile col 9-10, row 16) leads onto a **garden** area (green grass) with no seam/teleport — continuous movement.
4. The beer tap and pretzel stations still work (hover glow + click to grab).
5. Walking back north returns to the bar; no fl/glitches at the sector boundary.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/scenes/rooms/BaseRoomScene.ts apps/client/src/scenes/rooms/BarScene.ts
git commit -m "feat: continuous sector world in BaseRoomScene + BarScene"
```

---

## Task 12: Deploy

- [ ] **Step 1: Push and let Railway deploy**

```bash
git push
```
Expected: Railway auto-deploys the latest commit. After the deploy is green, verify the live URL serves the new build and the bar→garden walk works.

---

## Self-Review Notes

- **Spec coverage:** sector model (Tasks 2-4,8), WorldMap + global coords (Task 4), async loading + feedback (Tasks 3,6,10), camera always centered (Tasks 9,11), MovementSystem on WorldMap (Task 5), bar→garden continuity validating streaming (Tasks 8,11). All Phase 0 design points covered.
- **Type consistency:** `SectorData`/`TileData`/`SectorModule` from `types.ts` used everywhere; `Walkable` defined in MovementSystem (Task 5) and implemented by WorldMap (Task 4) — note WorldMap structurally satisfies `Walkable` via its `isWalkable` method, so `new MovementSystem(this.worldMap, …)` in Task 11 type-checks. `LoadingState` (streamer) and `WorldLoadingState` (store) are the same union `'initial'|'streaming'|null`.
- **Known limitation:** A* is unbounded; mitigated because `moveTo` rejects non-walkable targets and Phase 0 targets are always within the loaded on-screen ring.
