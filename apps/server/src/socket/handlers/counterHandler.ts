import {
  BAR_BEER_POSITION,
  BAR_PRETZEL_POSITION,
  PETAL_ACTION_COST,
} from '@social-square/shared';
import { logInfo } from '../../utils/logger';
import { economyEvent } from '../../utils/metrics';
import { emitHeldItemToInterested } from './interestBroadcaster';
import { state, userService, type IoServer, type IoSocket } from './roomContext';
import { ensureUserNear, isHeldItem, isSafeEventText, locationIdFor } from './roomUtils';
import type { ObjectState } from '@social-square/shared';

export async function handleCounterInteraction(
  io: IoServer,
  socket: IoSocket,
  roomId: string,
  userId: string,
  action: string,
  payload: ObjectState,
): Promise<void> {
  if (action !== 'pickup-item') {
    socket.emit('error', { code: 'UNKNOWN_INTERACTION', message: 'Azione banco sconosciuta' });
    return;
  }

  const item = isHeldItem(payload.item) ? payload.item : null;
  const requestId = isSafeEventText(payload.requestId, 80) ? payload.requestId : undefined;
  if (!item) {
    socket.emit('error', { code: 'INVALID_ITEM', message: 'Oggetto non valido' });
    return;
  }

  const target = item === 'beer' ? BAR_BEER_POSITION : BAR_PRETZEL_POSITION;
  const buyer = await ensureUserNear(socket, roomId, userId, target, 'Avvicinati al bancone');
  if (!buyer) return;
  if (locationIdFor(buyer.position) !== '0,0') {
    socket.emit('error', { code: 'WRONG_LOCATION', message: 'Il bancone e nel bar' });
    return;
  }

  const paidUser = await userService.spendPetals(
    userId,
    PETAL_ACTION_COST,
    'counter',
    requestId ? `counter:${requestId}` : undefined,
  );
  if (!paidUser) {
    socket.emit('error', { code: 'INSUFFICIENT_PETALS', message: `Servono ${PETAL_ACTION_COST} petali` });
    return;
  }

  await state.updateHeldItem(roomId, userId, item);
  const roomState = await state.getRoomState(roomId);
  const holder = roomState.users.find((user) => user.userId === userId);
  socket.emit('item-granted', { item, petals: paidUser.petals, cost: PETAL_ACTION_COST, source: 'counter' });
  socket.emit('account-updated', { petals: paidUser.petals, stats: { ...paidUser.stats } });
  economyEvent();
  logInfo('economy.spend', { userId, source: 'counter', item, amount: PETAL_ACTION_COST, petals: paidUser.petals });
  if (holder) await emitHeldItemToInterested(io, roomId, holder, item, roomState.users);
}
