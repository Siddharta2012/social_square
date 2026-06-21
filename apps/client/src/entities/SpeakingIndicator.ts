import Phaser from 'phaser';

/** Three concentric pulsing rings that appear above an avatar when speaking. */
export class SpeakingIndicator extends Phaser.GameObjects.Container {
  private _rings: Phaser.GameObjects.Arc[] = [];
  private _tween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, -54);

    for (let i = 0; i < 3; i++) {
      const r = i * 5;
      const ring = scene.add.arc(0, 0, 6 + r, 0, 360, false, 0x44ff88, 0);
      ring.setStrokeStyle(1.5, 0x44ff88, 0.7 - i * 0.2);
      this.add(ring);
      this._rings.push(ring);
    }

    this.setVisible(false);
    scene.add.existing(this);
  }

  show(): void {
    if (this.visible) return;
    this.setVisible(true);
    this._tween = this.scene.tweens.add({
      targets: this._rings,
      scaleX: 1.6,
      scaleY: 1.6,
      alpha: 0.15,
      duration: 550,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      offset: 0,
    });
  }

  hide(): void {
    if (!this.visible) return;
    this._tween?.stop();
    this._tween = null;
    this._rings.forEach((r) => { r.setScale(1); r.setAlpha(1); });
    this.setVisible(false);
  }

  override destroy(fromScene?: boolean): void {
    this._tween?.stop();
    super.destroy(fromScene);
  }
}
