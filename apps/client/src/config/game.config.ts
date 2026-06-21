import Phaser from 'phaser';

export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  render: {
    pixelArt: true,
    antialias: false,
    roundPixels: true,
  },
  backgroundColor: '#1a1a2e',
  parent: 'game-container',
};
