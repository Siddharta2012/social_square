import { globalToSector, sectorKey } from './coords';
import type { SectorLoader } from './SectorLoader';
import type { SectorData } from './types';
import type { WorldMap } from './WorldMap';

export type LoadingState = 'initial' | 'streaming' | null;

export interface WorldStreamerCallbacks {
  onSectorReady?: (data: SectorData) => void;
  onSectorUnload?: (sx: number, sy: number) => void;
  onLoadingChange?: (state: LoadingState) => void;
}

export interface WorldStreamerStats {
  activeKeys: string[];
  loadedKeys: string[];
  absentKeys: string[];
  inFlightKeys: string[];
  initialized: boolean;
}

/** Keeps the WorldMap populated with exactly the current screen/location. */
export class WorldStreamer {
  private _activeKeys = new Set<string>();
  private _loadedKeys = new Set<string>();
  private _absentKeys = new Set<string>();
  private _inFlight = new Set<string>();
  private _initialized = false;
  private _centerKey: string | null = null;

  constructor(
    private readonly map: WorldMap,
    private readonly loader: SectorLoader,
    private readonly callbacks: WorldStreamerCallbacks = {},
  ) {}

  async update(playerTileX: number, playerTileY: number): Promise<void> {
    const centerSx = globalToSector(playerTileX);
    const centerSy = globalToSector(playerTileY);
    const nextCenterKey = sectorKey(centerSx, centerSy);

    if (
      this._centerKey === nextCenterKey &&
      (this._loadedKeys.has(nextCenterKey) || this._absentKeys.has(nextCenterKey) || this._inFlight.has(nextCenterKey))
    ) return;

    const nextActive = new Set([nextCenterKey]);
    this._centerKey = nextCenterKey;

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

    for (const key of keysToLoad) await this._loadKey(key);

    this._initialized = true;
    this.callbacks.onLoadingChange?.(null);
  }

  stats(): WorldStreamerStats {
    return {
      activeKeys: [...this._activeKeys],
      loadedKeys: [...this._loadedKeys],
      absentKeys: [...this._absentKeys],
      inFlightKeys: [...this._inFlight],
      initialized: this._initialized,
    };
  }

  destroy(): void {
    for (const key of [...this._loadedKeys]) {
      const [sx, sy] = this._parseKey(key);
      this.map.removeSector(sx, sy);
      this.callbacks.onSectorUnload?.(sx, sy);
    }
    this._activeKeys.clear();
    this._loadedKeys.clear();
    this._absentKeys.clear();
    this._inFlight.clear();
    this._initialized = false;
    this._centerKey = null;
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
