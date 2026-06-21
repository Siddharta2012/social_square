import type { SectorRegistry } from '../SectorLoader';

/** Maps sector keys to dynamic-import loaders. */
export const SECTOR_REGISTRY: SectorRegistry = {
  '0,0': () => import('./sector_0_0'),
  '0,1': () => import('./sector_0_1'),
  '1,0': () => import('./sector_1_0'),
  '1,1': () => import('./sector_1_1'),
};
