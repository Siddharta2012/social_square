import Phaser from 'phaser';
import { IsometricSystem } from '../systems/IsometricSystem';
import { SectorBarDecorationPainter } from './SectorBarDecorationPainter';
import { SectorOutdoorDecorationPainter } from './SectorOutdoorDecorationPainter';
import type { DecorationData } from './types';

export class SectorDecorationPainter {
  private readonly _bar: SectorBarDecorationPainter;
  private readonly _outdoor = new SectorOutdoorDecorationPainter();

  constructor(private readonly scene: Phaser.Scene) {
    this._bar = new SectorBarDecorationPainter(scene);
  }

  drawDecoration(
    gx: number,
    gy: number,
    decoration: DecorationData,
    lights: Phaser.GameObjects.Graphics[],
  ): Phaser.GameObjects.Container {
    const iso = IsometricSystem.worldToIso(gx, gy);
    const container = this.scene.add.container(iso.x, iso.y);
    const light = this.scene.add.graphics();
    container.add(light);
    const gfx = this.scene.add.graphics();
    container.add(gfx);

    switch (decoration.kind) {
      case 'barWall':
        this._bar.drawBarWall(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) - 0.65);
        break;
      case 'barCounter':
        this._bar.drawBarCounter(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) - 0.08);
        break;
      case 'bottleShelf':
        this._bar.drawBottleShelf(gfx, light, decoration);
        lights.push(this._registerLight(light, 0.45));
        container.setDepth(IsometricSystem.depth(gx, gy) - 0.25);
        break;
      case 'barSign':
        this._bar.drawBarSign(container, gfx, light, decoration);
        lights.push(this._registerLight(light, 0.62));
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.22);
        break;
      case 'stool':
        this._bar.drawStool(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.08);
        break;
      case 'table':
        this._bar.drawBarTable(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.08);
        break;
      case 'poolTable':
        this._bar.drawPoolTable(gfx, light, decoration);
        lights.push(this._registerLight(light, 0.32));
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.11);
        break;
      case 'jukebox':
        this._bar.drawJukebox(gfx, light, decoration);
        lights.push(this._registerLight(light, 0.7));
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.1);
        break;
      case 'tree':
        this._outdoor.drawTree(gfx, light, decoration);
        lights.push(this._registerLight(light, 0.22));
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.28);
        break;
      case 'shrub':
        this._outdoor.drawShrub(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.08);
        break;
      case 'bench':
        this._outdoor.drawBench(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.08);
        break;
      case 'umbrella':
        this._outdoor.drawUmbrella(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.2);
        break;
      case 'gardenTable':
        this._outdoor.drawGardenTable(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.08);
        break;
      case 'stringLight':
        this._outdoor.drawStringLight(gfx, light, decoration);
        lights.push(this._registerLight(light, 0.55));
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.16);
        break;
      case 'flowerPatch':
        this._outdoor.drawFlowerPatch(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.03);
        break;
      case 'grassTuft':
        this._outdoor.drawGrassTuft(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.02);
        break;
      case 'streetLamp':
        this._outdoor.drawStreetLamp(gfx, light, decoration);
        lights.push(this._registerLight(light, 0.72));
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.18);
        break;
      case 'fountain':
        this._outdoor.drawFountain(gfx, light, decoration);
        lights.push(this._registerLight(light, 0.2));
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.16);
        break;
      case 'marketStall':
        this._outdoor.drawMarketStall(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.15);
        break;
      case 'shopFront':
        this._outdoor.drawShopFront(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) - 0.22);
        break;
      case 'signpost':
        this._outdoor.drawSignpost(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.12);
        break;
      case 'planter':
        this._outdoor.drawPlanter(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.08);
        break;
      case 'well':
        this._outdoor.drawWell(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.12);
        break;
    }

    return container;
  }

  private _registerLight(gfx: Phaser.GameObjects.Graphics, baseAlpha: number): Phaser.GameObjects.Graphics {
    gfx.setData('baseAlpha', baseAlpha);
    return gfx;
  }

}
