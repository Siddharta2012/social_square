import { Direction } from '@social-square/shared';
import { describe, expect, it, vi } from 'vitest';
import { MOVE_EMIT_INTERVAL } from '../config/constants';
import { NetworkSystem } from './NetworkSystem';

function socketDouble() {
  return {
    connected: true,
    emit: vi.fn(),
  };
}

describe('NetworkSystem', () => {
  it('skips move payload formatting while throttled', () => {
    const network = new NetworkSystem();
    const socket = socketDouble();
    (network as unknown as { _socket: typeof socket })._socket = socket;
    const now = vi.spyOn(Date, 'now');

    now.mockReturnValue(1_000);
    network.emitMove(1.23, 2.34, Direction.SE, 'walk');
    expect(socket.emit).toHaveBeenCalledTimes(1);

    const x = { toFixed: vi.fn(() => '9.00') } as unknown as number;
    const y = { toFixed: vi.fn(() => '8.00') } as unknown as number;
    now.mockReturnValue(1_000 + MOVE_EMIT_INTERVAL - 1);

    network.emitMove(x, y, Direction.SE, 'walk');

    expect((x as unknown as { toFixed: ReturnType<typeof vi.fn> }).toFixed).not.toHaveBeenCalled();
    expect((y as unknown as { toFixed: ReturnType<typeof vi.fn> }).toFixed).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledTimes(1);

    now.mockRestore();
  });
});
