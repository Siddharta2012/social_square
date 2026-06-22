import { StateService } from '../../services/StateService';
import { UserService } from '../../services/UserService';
import type {
  ClientToServerEvents,
  InterServerEvents,
  RoomState,
  ServerToClientEvents,
  SocketData,
} from '@social-square/shared';
import type { Server, Socket } from 'socket.io';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type RoomUser = RoomState['users'][number];
export type RoomObject = RoomState['objects'][number];

export const state = new StateService();
export const userService = new UserService();
