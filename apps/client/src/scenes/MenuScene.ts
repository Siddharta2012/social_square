import Phaser from 'phaser';
import { useGameStore } from '../store/gameStore';
import { useUserStore } from '../store/userStore';
import { eventBus } from '../eventBus';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    this.add
      .text(width / 2, height / 2 - 80, 'Social Square', {
        fontSize: '32px', color: '#e0e0ff',
        fontFamily: 'monospace', stroke: '#6060cc', strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 - 30, 'Spazio sociale virtuale in pixel-art isometrica', {
        fontSize: '14px', color: '#8888cc', fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    const btn = this.add
      .text(width / 2, height / 2 + 40, '[ Entra ]', {
        fontSize: '22px', color: '#44ff88', fontFamily: 'monospace',
        stroke: '#006622', strokeThickness: 3,
        backgroundColor: '#00000066', padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setStyle({ color: '#aaffcc' }));
    btn.on('pointerout', () => btn.setStyle({ color: '#44ff88' }));
    btn.on('pointerup', () => {
      // If already authenticated (token in store), go straight to game
      const { token, username } = useUserStore.getState();
      if (token && username) {
        this.scene.start('BarScene');
      } else {
        useGameStore.getState().setShowAuthForm(true);
      }
    });

    this.add
      .text(width / 2, height / 2 + 100, 'Sceglierai il tuo nome prima di entrare', {
        fontSize: '11px', color: '#555588', fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    // Listen for successful auth from React form
    eventBus.on('start-game', (_username: string) => {
      this.scene.start('BarScene');
    });

    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.cameras.main.setSize(gameSize.width, gameSize.height);
    });
  }

  shutdown(): void {
    eventBus.off('start-game');
  }
}
