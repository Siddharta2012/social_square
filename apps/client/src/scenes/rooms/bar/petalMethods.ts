import {
  Direction,
  PETAL_BLOOM_OBJECT_ID,
  type Position,
} from '@social-square/shared';
import { InteractStation } from '../../../entities/InteractStation';
import { t } from '../../../i18n';
import { useGameStore } from '../../../store/gameStore';
import { IsometricSystem } from '../../../systems/IsometricSystem';
import {
  isWithinInteractionRange,
  petalPointKey,
  petalSpawnConfigForLocation,
} from '../../../world/interactions';
import { drawPetalBloom } from './stationIcons';
import { PETAL_AUTO_COLLECT_CHECK_MS } from './timing';

export interface PetalBloom {
  station: InteractStation;
  position: Position;
}

export interface PendingPetalCollect {
  position: Position;
  amount: number;
  requestedAt: number;
}

export const PETAL_COLLECT_RADIUS_TILES = 2.75;
export const PETAL_AUTO_COLLECT_RADIUS_TILES = 1.35;
export const PETAL_PENDING_TIMEOUT_MS = 6000;
export const PETAL_RETRY_COOLDOWN_MS = 1500;
export const PETAL_SPAWN_TICK_MS = 3000;
export { PETAL_AUTO_COLLECT_CHECK_MS };

export function startPetalSpawns(this: any): void {
  this.time.delayedCall(1200, () => this._seedPetalBloomsForLocation());

  this._petalSpawnTimer = this.time.addEvent({
    delay: PETAL_SPAWN_TICK_MS,
    loop: true,
    callback: () => this._maybeSpawnPetalBloom(),
  });
}

export function seedPetalBloomsForLocation(this: any): void {
  const config = petalSpawnConfigForLocation(this._currentLocationId());
  if (!config) return;
  for (let i = 0; i < config.initialActive; i++) this._spawnPetalBloom();
  this._lastPetalSpawnByLocation.set(config.locationId, Date.now());
}

export function maybeSpawnPetalBloom(this: any): void {
  const locationId = this._currentLocationId();
  const config = petalSpawnConfigForLocation(locationId);
  if (!config) return;
  const last = this._lastPetalSpawnByLocation.get(locationId) ?? 0;
  if (Date.now() - last < config.intervalMs) return;
  if (this._spawnPetalBloom()) this._lastPetalSpawnByLocation.set(locationId, Date.now());
}

export function spawnPetalBloom(this: any): boolean {
  const config = petalSpawnConfigForLocation(this._currentLocationId());
  if (!config) return false;
  if (this._petalBlooms.length >= config.maxActive) return false;

  const available = config.points.filter((point) => {
    const occupied = this._petalBlooms.some((bloom: PetalBloom) => (
      Math.round(bloom.position.x) === Math.round(point.x) &&
      Math.round(bloom.position.y) === Math.round(point.y)
    ));
    if (occupied) return false;
    const tile = this.worldMap.getTile(Math.round(point.x), Math.round(point.y));
    return tile?.walkable === true;
  });
  if (available.length === 0) return false;

  const index = Phaser.Math.Between(0, available.length - 1);
  const position = { ...available[index] };
  const bloom = this._createPetalBloom(position, config.value);
  this._petalBlooms.push(bloom);
  return true;
}

export function createPetalBloom(this: any, position: Position, amount: number): PetalBloom {
  const bloom = { position } as PetalBloom;
  const station = new InteractStation({
    scene: this,
    worldX: position.x,
    worldY: position.y,
    label: t('bar.station.petals', { amount }),
    draw: drawPetalBloom,
    hitWidth: 38,
    hitHeight: 42,
    ambientGlow: true,
    onInteract: () => this._collectPetalBloom(bloom),
  });

  bloom.station = station;
  return bloom;
}

export function sweepStalePetalCollects(this: any): void {
  if (this._pendingPetalCollects.size === 0) return;
  const now = Date.now();
  for (const [key, pending] of this._pendingPetalCollects) {
    if (now - pending.requestedAt >= PETAL_PENDING_TIMEOUT_MS) {
      this._pendingPetalCollects.delete(key);
      this._removeOptimisticPetalCredit(pending);
    }
  }
}

export function collectNearbyPetals(this: any): void {
  const local = this._localPosition();
  if (!local || this._petalBlooms.length === 0) return;

  const now = Date.now();
  for (const bloom of [...this._petalBlooms]) {
    const key = petalPointKey(bloom.position);
    if (this._pendingPetalCollects.has(key)) continue;
    if (now < (this._petalAttemptCooldowns.get(key) ?? 0)) continue;
    if (isWithinInteractionRange(local, bloom.position, PETAL_AUTO_COLLECT_RADIUS_TILES)) {
      this._collectPetalBloom(bloom, true);
    }
  }
}

export function collectPetalBloom(this: any, bloom: PetalBloom, automatic = false): void {
  if (!automatic && !this._isNear(bloom.position, PETAL_COLLECT_RADIUS_TILES)) {
    this._showNotice(t('petal.near'));
    return;
  }

  const key = petalPointKey(bloom.position);
  if (this._pendingPetalCollects.has(key)) return;
  const config = petalSpawnConfigForLocation(this._currentLocationId());
  const amount = config?.value ?? 0;
  this._pendingPetalCollects.set(key, {
    position: { ...bloom.position },
    amount,
    requestedAt: Date.now(),
  });
  this._removePetalBloom(bloom);
  if (amount > 0) {
    useGameStore.getState().setPetals(useGameStore.getState().petals + amount);
    this._spawnPetalCollectBurst(bloom.position, amount);
    this._playPetalCollectSound();
  }
  this._petalAttemptCooldowns.set(key, Date.now() + PETAL_RETRY_COOLDOWN_MS);
  this._syncPetalPositionForServer();
  this._network?.emitInteract(PETAL_BLOOM_OBJECT_ID, 'petal-collect', {
    x: bloom.position.x,
    y: bloom.position.y,
    requestId: key,
  });
}

export function confirmPetalCollected(
  this: any,
  position: Position,
  amount: number,
  petals: number,
  requestId?: string,
): void {
  const key = requestId ?? petalPointKey(position);
  const pending = this._pendingPetalCollects.get(key);
  const bloom = this._petalBlooms.find((candidate: PetalBloom) => petalPointKey(candidate.position) === key);
  this._pendingPetalCollects.delete(key);
  this._petalAttemptCooldowns.delete(key);
  if (bloom) this._removePetalBloom(bloom);
  if (!pending) {
    this._spawnPetalCollectBurst(position, amount);
    this._playPetalCollectSound();
  }
  this._applyServerPetals(petals);
  this._showNotice(t('bar.notice.petalsGained', { amount }));
  this._syncLocalContext();
}

export function removePetalBloom(this: any, bloom: PetalBloom): void {
  this._petalBlooms = this._petalBlooms.filter((candidate: PetalBloom) => candidate !== bloom);
  bloom.station.destroy();
}

export function syncPetalPositionForServer(this: any): void {
  const local = this._localPosition();
  if (!local) return;
  this._network?.emitMove(local.x, local.y, Direction.SE, this.movementSystem.isMoving ? 'walk' : 'idle', true);
}

export function rollbackPendingPetalCollect(this: any, requestId: string | undefined, message: string): void {
  if (!requestId) return;
  const pending = this._pendingPetalCollects.get(requestId);
  if (!pending) return;
  this._pendingPetalCollects.delete(requestId);
  this._removeOptimisticPetalCredit(pending);
  const config = petalSpawnConfigForLocation(this._currentLocationId());
  const isValidLocationPoint = Boolean(config?.points.some((point) => petalPointKey(point) === petalPointKey(pending.position)));
  const alreadyVisible = this._petalBlooms.some((bloom: PetalBloom) => petalPointKey(bloom.position) === petalPointKey(pending.position));
  if (config && isValidLocationPoint && !alreadyVisible) {
    this._petalBlooms.push(this._createPetalBloom({ ...pending.position }, config.value));
  }
  this._showNotice(message);
}

export function rollbackLatestPendingPetalCollect(this: any, message: string): void {
  const requestIds = Array.from(this._pendingPetalCollects.keys());
  const latestRequestId = requestIds[requestIds.length - 1];
  this._rollbackPendingPetalCollect(latestRequestId, message);
}

export function forgetLatestPendingPetalCollect(this: any): void {
  const requestIds = Array.from(this._pendingPetalCollects.keys());
  const latestRequestId = requestIds[requestIds.length - 1];
  if (latestRequestId) this._forgetPendingPetalCollect(latestRequestId);
}

export function forgetPendingPetalCollect(this: any, requestId: string): void {
  const pending = this._pendingPetalCollects.get(requestId);
  this._pendingPetalCollects.delete(requestId);
  if (pending) this._removeOptimisticPetalCredit(pending);
}

export function removeOptimisticPetalCredit(this: any, pending: PendingPetalCollect): void {
  if (pending.amount <= 0) return;
  useGameStore.getState().setPetals(useGameStore.getState().petals - pending.amount);
}

export function applyServerPetals(this: any, petals: number): void {
  useGameStore.getState().setPetals(petals + this._pendingPetalValue());
}

export function pendingPetalValue(this: any): number {
  let total = 0;
  this._pendingPetalCollects.forEach((pending: PendingPetalCollect) => {
    total += pending.amount;
  });
  return total;
}

export function spawnPetalCollectBurst(this: any, position: Position, amount: number): void {
  const iso = IsometricSystem.worldToIso(position.x, position.y);
  const colors = [0xffd166, 0xe85d75, 0x9b7cff, 0xffffff, 0x88ffbb];

  for (let i = 0; i < 10; i++) {
    const petal = this.add.graphics({ x: iso.x, y: iso.y - 22 });
    petal.fillStyle(colors[i % colors.length], 1);
    petal.fillEllipse(0, 0, 8, 4);
    petal.setDepth(IsometricSystem.depth(position.x, position.y) + 8);
    petal.setRotation((Math.PI * 2 * i) / 10);

    const angle = (Math.PI * 2 * i) / 10;
    const distance = 24 + (i % 3) * 8;
    this.tweens.add({
      targets: petal,
      x: iso.x + Math.cos(angle) * distance,
      y: iso.y - 52 + Math.sin(angle) * 12,
      alpha: 0,
      scale: 0.45,
      duration: 520,
      ease: 'Cubic.easeOut',
      onComplete: () => petal.destroy(),
    });
  }

  const text = this.add.text(iso.x, iso.y - 46, `+${amount}`, {
    fontSize: '18px',
    color: '#fff4d0',
    fontFamily: 'monospace',
    fontStyle: 'bold',
    stroke: '#1a1206',
    strokeThickness: 4,
  }).setOrigin(0.5).setDepth(IsometricSystem.depth(position.x, position.y) + 9);

  this.tweens.add({
    targets: text,
    y: iso.y - 86,
    alpha: 0,
    scale: 1.18,
    duration: 720,
    ease: 'Quad.easeOut',
    onComplete: () => text.destroy(),
  });
}

export function playPetalCollectSound(this: any): void {
  const context = this._getPetalAudioContext();
  if (!context) return;

  void context.resume();

  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.16, now + 0.018);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
  master.connect(context.destination);

  for (const [index, frequency] of [660, 920, 1180].entries()) {
    const oscillator = context.createOscillator();
    oscillator.type = index === 0 ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, now + index * 0.045);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.18, now + 0.2 + index * 0.03);
    oscillator.connect(master);
    oscillator.start(now + index * 0.045);
    oscillator.stop(now + 0.36 + index * 0.035);
  }

  navigator.vibrate?.(18);
}

export function primePetalAudio(this: any): void {
  const context = this._getPetalAudioContext();
  if (context) void context.resume();
}

export function getPetalAudioContext(): AudioContext | null {
  const win = window as Window & {
    webkitAudioContext?: typeof AudioContext;
    __socialSquarePetalAudioContext?: AudioContext;
  };
  const AudioContextCtor = window.AudioContext ?? win.webkitAudioContext;
  if (!AudioContextCtor) return null;

  const context = win.__socialSquarePetalAudioContext ?? new AudioContextCtor();
  win.__socialSquarePetalAudioContext = context;
  return context;
}

export function clearPetalBlooms(this: any): void {
  this._petalBlooms.forEach((bloom: PetalBloom) => bloom.station.destroy());
  this._petalBlooms = [];
  this._pendingPetalCollects.clear();
  this._petalAttemptCooldowns.clear();
}
