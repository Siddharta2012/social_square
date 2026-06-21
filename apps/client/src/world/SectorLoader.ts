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
