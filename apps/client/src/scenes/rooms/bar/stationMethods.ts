import {
  BAR_BEER_POSITION,
  BAR_PRETZEL_POSITION,
  BAR_SERVICE_OBJECT_ID,
  POOL_PLAY_COST,
  POOL_POSITION,
} from '@social-square/shared';
import { InteractStation } from '../../../entities/InteractStation';
import { t } from '../../../i18n';
import { useGameStore } from '../../../store/gameStore';
import {
  INTERACTION_RADIUS_TILES,
  JUKEBOX_POSITION,
  PETAL_ACTION_COST,
  SEAT_DEFINITIONS,
  isWithinInteractionRange,
} from '../../../world/interactions';
import { locationForPosition, locationIdForPosition, targetName } from '../../../world/locations';
import {
  drawBeerTap,
  drawHotspot,
  drawPretzelStand,
} from './stationIcons';
import type { HeldItem, Position } from '@social-square/shared';

const BEER_SIPS = 3;
const PRETZEL_BITES = 2;
const COUNTER_FIXTURE_DEPTH = 8.6;

export function rebuildLocationStations(this: any): void {
  this._destroyLocationStations();
  const locationId = this._currentLocationId();

  if (locationId === '0,0') {
    this._stations.push(new InteractStation({
      scene: this,
      worldX: BAR_BEER_POSITION.x,
      worldY: BAR_BEER_POSITION.y,
      label: t('bar.station.beer', { cost: PETAL_ACTION_COST }),
      draw: drawBeerTap,
      hitWidth: 26,
      hitHeight: 60,
      depth: COUNTER_FIXTURE_DEPTH,
      ambientGlow: true,
      onInteract: () => this._pickUpFromStation('beer', BAR_BEER_POSITION),
    }));

    this._stations.push(new InteractStation({
      scene: this,
      worldX: BAR_PRETZEL_POSITION.x,
      worldY: BAR_PRETZEL_POSITION.y,
      label: t('bar.station.pretzel', { cost: PETAL_ACTION_COST }),
      draw: drawPretzelStand,
      hitWidth: 30,
      hitHeight: 44,
      depth: COUNTER_FIXTURE_DEPTH,
      ambientGlow: true,
      onInteract: () => this._pickUpFromStation('pretzel', BAR_PRETZEL_POSITION),
    }));

    this._stations.push(new InteractStation({
      scene: this,
      worldX: JUKEBOX_POSITION.x,
      worldY: JUKEBOX_POSITION.y,
      label: t('bar.station.jukebox'),
      draw: drawHotspot,
      hitWidth: 54,
      hitHeight: 62,
      onInteract: () => this._requestJukeboxNext(),
    }));

    this._stations.push(new InteractStation({
      scene: this,
      worldX: POOL_POSITION.x,
      worldY: POOL_POSITION.y,
      label: t('bar.station.pool', { cost: POOL_PLAY_COST }),
      draw: drawHotspot,
      hitWidth: 92,
      hitHeight: 58,
      onInteract: () => this._requestPoolOpen(),
    }));
  }

  for (const seat of SEAT_DEFINITIONS) {
    if (locationIdForPosition(seat) !== locationId) continue;
    this._stations.push(new InteractStation({
      scene: this,
      worldX: seat.x,
      worldY: seat.y,
      label: t('bar.station.seat', { seat: seat.label }),
      draw: drawHotspot,
      hitWidth: seat.kind === 'bench' ? 72 : 58,
      hitHeight: seat.kind === 'bench' ? 48 : 52,
      onInteract: () => this._beginSeatInteraction(seat),
    }));
  }
}

export function destroyLocationStations(this: any): void {
  this._stations.forEach((station: InteractStation) => station.destroy());
  this._stations = [];
}

export function pickUpFromStation(this: any, item: HeldItem, position: Position): void {
  if (!this._isNear(position)) {
    this._showNotice(t('bar.notice.counterNear'));
    return;
  }

  this._network?.emitInteract(BAR_SERVICE_OBJECT_ID, 'pickup-item', { item });
}

export function pickUp(this: any, item: HeldItem): void {
  if (!item) return;

  this._sipsLeft = item === 'beer' ? BEER_SIPS : PRETZEL_BITES;
  this.localAvatar.setHeldItem(item, 1);
  useGameStore.getState().setHeldItem(item);
  this._network.emitHoldItem(item);
}

export function consume(this: any): void {
  const item = this.localAvatar?.heldItem;
  if (!item) return;

  this.localAvatar.consume();
  this._sipsLeft--;

  if (this._sipsLeft <= 0) {
    this.localAvatar.setHeldItem(null);
    useGameStore.getState().setHeldItem(null);
    this._network.emitHoldItem(null);
  } else if (item === 'beer') {
    this.localAvatar.setHeldItem('beer', this._sipsLeft / BEER_SIPS);
  }
}

export function localPosition(this: any): Position | null {
  if (!this.localAvatar) return null;
  return { x: this.movementSystem.posX, y: this.movementSystem.posY };
}

export function isNear(this: any, position: Position, radius = INTERACTION_RADIUS_TILES): boolean {
  const local = this._localPosition();
  return local ? isWithinInteractionRange(local, position, radius) : false;
}

export function syncLocalContext(this: any): void {
  const local = this._localPosition();
  if (!local) return;

  const locationInfo = locationForPosition(local);
  const location = locationInfo.name;
  const inBarInterior = locationInfo.id === '0,0';
  const nearJukebox = inBarInterior && this._isNear(JUKEBOX_POSITION);
  const nearWaiter = inBarInterior && this._isNear(this._waiterPosition());
  const nearPool = inBarInterior && this._isNear(POOL_POSITION);
  const store = useGameStore.getState();
  const canAffordAction = store.petals >= PETAL_ACTION_COST;
  const canAffordPool = store.petals >= POOL_PLAY_COST;
  const nearbyExit = this._nearestExit(local);
  const routeHint = nearbyExit ? t('bar.station.route', { target: targetName(nearbyExit) }) : null;
  const key = `${location}|${nearJukebox ? 1 : 0}|${nearWaiter ? 1 : 0}|${nearPool ? 1 : 0}|${canAffordAction ? 1 : 0}|${canAffordPool ? 1 : 0}|${routeHint ?? ''}`;
  if (key === this._lastLocalContextKey) return;

  this._lastLocalContextKey = key;
  store.setLocationName(location);
  store.setRouteHint(routeHint);
  store.setActionAvailability({ nearJukebox, nearWaiter, nearPool, canAffordAction, canAffordPool });
}

export function showNotice(this: any, message: string): void {
  if (!this._noticeText) {
    this._noticeText = this.add.text(this.scale.width / 2, 62, message, {
      fontSize: '12px',
      color: '#fff4d0',
      fontFamily: 'monospace',
      backgroundColor: '#1a1206dd',
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1001);
  }

  this._noticeText.setText(message).setAlpha(1).setVisible(true);
  this._noticeText.setX(this.scale.width / 2);
  this.tweens.add({
    targets: this._noticeText,
    alpha: 0,
    delay: 1400,
    duration: 450,
    ease: 'Quad.easeOut',
    onComplete: () => this._noticeText?.setVisible(false),
  });
}
