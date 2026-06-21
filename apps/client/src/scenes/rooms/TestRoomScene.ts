/**
 * TestRoomScene
 * Lightweight streamed-world scene used for engine checks.
 */

import { BaseRoomScene, type WorldConfig } from './BaseRoomScene';

export class TestRoomScene extends BaseRoomScene {
  constructor() {
    super('TestRoomScene');
  }

  protected getWorldConfig(): WorldConfig {
    return {
      spawnX: 9,
      spawnY: 14,
      username: 'Player',
    };
  }
}
