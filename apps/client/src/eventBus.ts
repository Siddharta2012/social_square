import Phaser from 'phaser';

// Shared event bus for Phaser ↔ React communication.
// Events: 'start-game' (username: string)
export const eventBus = new Phaser.Events.EventEmitter();
