import Phaser from 'phaser';
import { eventBus } from '../eventBus';
import { t } from '../i18n';
import { useGameStore } from '../store/gameStore';
import { useUserStore } from '../store/userStore';
import { IsometricSystem } from '../systems/IsometricSystem';

interface Particle {
  x: number; y: number;
  alpha: number; size: number; speed: number;
}

export class MenuScene extends Phaser.Scene {
  private _particleGfx!: Phaser.GameObjects.Graphics;
  private _particles: Particle[] = [];

  constructor() {
    super('MenuScene');
  }

  create(): void {
    const { width, height } = this.scale;

    // ── Background ──────────────────────────────────────────────────────────
    this.add.rectangle(width / 2, height / 2, width, height, 0x0d0d1e);

    // Subtle radial vignette (dark outer ring)
    const vignette = this.add.graphics();
    const gradient = this.add.graphics();
    gradient.fillStyle(0x1a1a40, 0.5);
    gradient.fillCircle(width / 2, height / 2, Math.max(width, height) * 0.55);
    void vignette;

    // ── Decorative isometric tiles ──────────────────────────────────────────
    this._drawDecorativeTiles(width, height);

    // ── Particle system ─────────────────────────────────────────────────────
    this._particleGfx = this.add.graphics();
    this._particles = Array.from({ length: 28 }, () => this._makeParticle(width, height, true));

    // ── Title ────────────────────────────────────────────────────────────────
    const title = this.add
      .text(width / 2, height / 2 - 90, 'Social Square', {
        fontSize: '34px', color: '#e0e0ff',
        fontFamily: 'monospace', stroke: '#5050cc', strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: title,
      scaleX: { from: 1, to: 1.02 },
      scaleY: { from: 1, to: 1.02 },
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // ── Subtitle ─────────────────────────────────────────────────────────────
    this.add
      .text(width / 2, height / 2 - 36, 'Spazio sociale virtuale in pixel-art isometrica', {
        fontSize: '13px', color: '#6666aa', fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    // ── Enter button ──────────────────────────────────────────────────────────
    const btn = this.add
      .text(width / 2, height / 2 + 38, t('menu.enter'), {
        fontSize: '22px', color: '#44ff88', fontFamily: 'monospace',
        stroke: '#006622', strokeThickness: 3,
        backgroundColor: '#00000066', padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.tweens.add({
      targets: btn,
      alpha: { from: 1, to: 0.75 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    btn.on('pointerover', () => { btn.setStyle({ color: '#aaffcc' }); btn.setAlpha(1); });
    btn.on('pointerout',  () => btn.setStyle({ color: '#44ff88' }));
    btn.on('pointerup', () => {
      const { token, username } = useUserStore.getState();
      if (token && username) {
        this._fadeToScene('BarScene');
      } else {
        useGameStore.getState().setShowAuthForm(true);
      }
    });

    // ── Hint ──────────────────────────────────────────────────────────────────
    this.add
      .text(width / 2, height / 2 + 100, 'Prima volta? L\'account viene creato automaticamente', {
        fontSize: '11px', color: '#444466', fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    // ── Auth event ────────────────────────────────────────────────────────────
    eventBus.on('start-game', (_username: string) => {
      this._fadeToScene('BarScene');
    });

    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.cameras.main.setSize(gameSize.width, gameSize.height);
    });
  }

  update(): void {
    const { width, height } = this.scale;

    // Animate particles upward
    this._particles.forEach((p) => {
      p.y -= p.speed;
      p.alpha -= 0.0008;
      if (p.y < 0 || p.alpha <= 0) {
        Object.assign(p, this._makeParticle(width, height, false));
      }
    });

    this._particleGfx.clear();
    for (const p of this._particles) {
      this._particleGfx.fillStyle(0x8888ff, p.alpha);
      this._particleGfx.fillCircle(p.x, p.y, p.size);
    }
  }

  shutdown(): void {
    eventBus.off('start-game');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private _makeParticle(width: number, height: number, randomY: boolean): Particle {
    return {
      x: Math.random() * width,
      y: randomY ? Math.random() * height : height + 4,
      alpha: Math.random() * 0.35 + 0.08,
      size: Math.random() * 1.8 + 0.6,
      speed: Math.random() * 0.35 + 0.12,
    };
  }

  private _drawDecorativeTiles(width: number, height: number): void {
    const gfx = this.add.graphics();
    const hw = IsometricSystem.TILE_HALF_W;
    const hh = IsometricSystem.TILE_HALF_H;

    const configs = [
      { cx: width * 0.12, cy: height * 0.25, scale: 1.8, color: 0x2a2a6a, alpha: 0.55 },
      { cx: width * 0.88, cy: height * 0.30, scale: 1.4, color: 0x223355, alpha: 0.45 },
      { cx: width * 0.08, cy: height * 0.72, scale: 2.2, color: 0x1e3a5f, alpha: 0.40 },
      { cx: width * 0.92, cy: height * 0.70, scale: 1.6, color: 0x2d2d6e, alpha: 0.50 },
      { cx: width * 0.50, cy: height * 0.88, scale: 1.2, color: 0x334466, alpha: 0.35 },
    ];

    for (const { cx, cy, scale, color, alpha } of configs) {
      const s = scale;
      const pts = [
        { x: cx,          y: cy - hh * s },
        { x: cx + hw * s, y: cy },
        { x: cx,          y: cy + hh * s },
        { x: cx - hw * s, y: cy },
      ];
      gfx.fillStyle(color, alpha);
      gfx.fillPoints(pts, true);
      gfx.lineStyle(1, 0xffffff, alpha * 0.3);
      gfx.strokePoints(pts, true);
    }

    // Slow alpha pulse on decorative tiles
    this.tweens.add({
      targets: gfx,
      alpha: { from: 0.7, to: 1 },
      duration: 3500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private _fadeToScene(key: string): void {
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(key);
    });
  }
}
