import Phaser from 'phaser';
import { DISPLAY } from '../config/display';

export type PortalKind = 'entrance' | 'exit' | 'red';

/** 파란/빨간 포탈 (기획서 7장). 발밑 타일 좌표에 놓인다. */
export class Portal extends Phaser.GameObjects.Sprite {
  constructor(
    scene: Phaser.Scene,
    tileX: number,
    tileY: number,
    readonly kind: PortalKind,
    textureKey: string,
  ) {
    const s = DISPLAY.tileSize;
    super(scene, tileX * s + s / 2, (tileY + 1) * s, textureKey, 0);
    this.setOrigin(0.5, 1);
    scene.add.existing(this);
    const anim = `${textureKey}_idle`;
    if (scene.anims.exists(anim)) this.play(anim);
    if (kind === 'entrance') this.setAlpha(0.55);
  }

  /** 플레이어 중심이 포탈 영역 안에 있는지 */
  contains(x: number, y: number): boolean {
    return Math.abs(x - this.x) < this.displayWidth / 2 && y <= this.y && y >= this.y - this.displayHeight;
  }
}
