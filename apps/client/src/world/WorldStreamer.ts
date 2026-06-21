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

const RADIUS = 1;

/** Keeps the WorldMap populated with the sectors around the player. */
export class WorldStreamer {
  private _activeKeys = new Set<string>();
  private _loadedKeys = new Set<string>();
  private _absentKeys = new Set<string>();
  private _inFlight = new Set<string>();
  private _initialized = false;

  constructor(
    private readonly map: WorldMap,
    private readonly loader: SectorLoader,
    private readonly callbacks: WorldStreamerCallbacks = {},
  ) {}

  async update(playerTileX: number, playerTileY: number): Promise<void> {
    const centerSx = globalToSector(playerTileX);
    const centerSy = globalToSector(playerTileY);
    const nextActive = new Set(computeActiveSet(centerSx, centerSy, RADIUS));

    const keysToUnload = [...this._loadedKeys].filter((key) => !nextActive.has(key));
    for (const key of keysToUnload) {
      const [sx, sy] = this._parseKey(key);
      this.map.removeSector(sx, sy);
      this._loadedKeys.delete(key);
      this.callbacks.onSectorUnload?.(sx, sy);
    }
    for (const key of [...this._absentKeys]) {
      if (!nextActive.has(key)) this._absentKeys.delete(key);
    }

    const keysToLoad = [...nextActive].filter(
      (key) => !this._loadedKeys.has(key) && !this._absentKeys.has(key) && !this._inFlight.has(key),
    );

    this._activeKeys = nextActive;
    if (keysToLoad.length === 0) return;

    this.callbacks.onLoadingChange?.(this._initialized ? 'streaming' : 'initial');

    await Promise.all(keysToLoad.map((key) => this._loadKey(key)));

    this._initialized = true;
    this.callbacks.onLoadingChange?.(null);
  }

  private async _loadKey(key: string): Promise<void> {
    const [sx, sy] = this._parseKey(key);
    this._inFlight.add(key);
    try {
      const data = await this.loader.load(sx, sy);
      if (!data) {
        if (this._activeKeys.has(key)) this._absentKeys.add(key);
        return;
      }
      if (!this._activeKeys.has(sectorKey(data.sx, data.sy))) return;
      this.map.setSector(data);
      this._loadedKeys.add(sectorKey(data.sx, data.sy));
      this.callbacks.onSectorReady?.(data);
    } finally {
      this._inFlight.delete(key);
    }
  }

  private _parseKey(key: string): [number, number] {
    const [sx, sy] = key.split(',').map(Number);
    return [sx, sy];
  }
}
