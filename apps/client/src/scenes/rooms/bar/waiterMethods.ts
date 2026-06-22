import { Direction, WAITER_OBJECT_ID, normalizeWaiterState } from '@social-square/shared';
import { RemoteAvatar } from '../../../entities/RemoteAvatar';
import { t } from '../../../i18n';
import { useGameStore } from '../../../store/gameStore';
import type { OrderItemId, Position, WaiterState } from '@social-square/shared';

export function waiterPosition(this: any): Position {
  return { x: this._waiterState.x, y: this._waiterState.y };
}

export function callWaiter(this: any): void {
  if (!this.localAvatar) return;
  if (!this._isInWaiterLocation()) {
    this._showNotice(t('waiter.available'));
    return;
  }
  if (!this._isNear(this._waiterPosition())) {
    this._showNotice(t('waiter.near'));
    return;
  }

  this._network?.emitInteract(WAITER_OBJECT_ID, 'waiter-call', {
    x: Math.round(this.movementSystem.posX),
    y: Math.round(this.movementSystem.posY),
  });
}

export function placeWaiterOrder(this: any, item: OrderItemId): void {
  if (!this._isInWaiterLocation()) {
    this._showNotice(t('waiter.ordersAtBar'));
    return;
  }
  if (!this._isNear(this._waiterPosition())) {
    this._showNotice(t('waiter.near'));
    return;
  }

  this._network?.emitInteract(WAITER_OBJECT_ID, 'waiter-order', {
    item,
    x: Math.round(this.movementSystem.posX),
    y: Math.round(this.movementSystem.posY),
  });
}

export function ensureWaiterAvatar(this: any, waiter: WaiterState): RemoteAvatar {
  if (this._waiterAvatar) return this._waiterAvatar;

  const avatar = new RemoteAvatar({
    scene: this,
    username: t('waiter.name'),
    worldX: waiter.x,
    worldY: waiter.y,
  });
  this._waiterAvatar = avatar;
  this.isoSystem.register(avatar, waiter.x, waiter.y);
  return avatar;
}

export function destroyWaiterAvatar(this: any): void {
  if (!this._waiterAvatar) return;
  this.isoSystem.unregister(this._waiterAvatar);
  this._waiterAvatar.destroy();
  this._waiterAvatar = null;
}

export function applyWaiterState(this: any, rawState: unknown): void {
  const waiter = normalizeWaiterState(rawState);
  this._waiterState = waiter;

  if (!this._isInWaiterLocation()) {
    this._destroyWaiterAvatar();
    useGameStore.getState().setWaiterStatus(null);
    return;
  }

  useGameStore.getState().setWaiterStatus(waiter);

  const avatar = this._ensureWaiterAvatar(waiter);
  const moving = waiter.phase === 'approaching' ||
    waiter.phase === 'to-counter' ||
    waiter.phase === 'delivering' ||
    waiter.phase === 'returning';
  avatar.updateTarget(waiter.x, waiter.y, Direction.SE, moving ? 'walk' : 'idle');
  avatar.setHeldItem(waiter.phase === 'delivering' || waiter.phase === 'delivered'
    ? waiter.item ?? null
    : null);

  if (
    waiter.phase === 'delivered' &&
    waiter.customerId === this._myUserId &&
    waiter.orderId &&
    waiter.item &&
    !this._deliveredOrderIds.has(waiter.orderId)
  ) {
    this._deliveredOrderIds.add(waiter.orderId);
    this._pickUp(waiter.item);
    this._showNotice(t('bar.notice.itemDelivered', { item: waiter.item === 'beer' ? t('item.beer') : t('item.pretzel') }));
  }
}

export function isInWaiterLocation(this: any): boolean {
  return this._currentLocationId() === '0,0';
}
