import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    // Placeholder: load global assets here in future phases
    // this.load.atlas('atlas_avatars', 'assets/atlas_avatars.png', 'assets/atlas_avatars.json');
    // this.load.atlas('atlas_ui', 'assets/atlas_ui.png', 'assets/atlas_ui.json');
  }

  create(): void {
    this.scene.start('MenuScene');
  }
}
