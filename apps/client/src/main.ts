import Phaser from 'phaser';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { GAME_CONFIG } from './config/game.config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { BarScene } from './scenes/rooms/BarScene';
import { TestRoomScene } from './scenes/rooms/TestRoomScene';
import { HUD } from './ui/HUD';
import { installClientErrorHandlers } from './utils/errorReporter';

const game = new Phaser.Game({
  ...GAME_CONFIG,
  scene: [BootScene, MenuScene, TestRoomScene, BarScene],
});

installClientErrorHandlers();

// Dev-only: expose the game instance for headless tooling (screenshots, scene control).
if (import.meta.env.DEV) {
  (window as unknown as { __game?: Phaser.Game }).__game = game;
}

const hudRoot = document.getElementById('hud-root');
if (hudRoot) {
  const root = createRoot(hudRoot);
  root.render(React.createElement(HUD));
}

export { game };
