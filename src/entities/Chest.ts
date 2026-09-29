import Phaser from 'phaser';
import { AssetKey } from '../assets/keys';
import type { Hittable } from '../combat/types';
import { DISPLAY } from '../config/display';

/** 상자 (기획서 5.6): 공격하거나 ↑로 연다. 비밀 상자는 비밀 벽 뒤에 있다. */
export class Chest extends Phaser.GameObjects.Sprite implements Hittable {
  alive = true;
  readonly room: number;
  readonly secret: boolean;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number, room: number, secret: boolean) {
    const s = DISPLAY.tileSize;
    super(scene, tileX * s + s / 2, (tileY + 1) * s, AssetKey.chest, 0);
    this.room = room;
    this.secret = secret;
    this.setOrigin(0.5, 1).setDepth(6);
    scene.add.existing(this);
    if (secret) this.setTint(0xffe8a0);
  }

  hitRect(out: Phaser.Geom.Rectangle): Phaser.Geom.Rectangle {
    return out.setTo(this.x - 8, this.y - 16, 16, 16);
  }

  /** 열기: 한 번만. 처음 열리면 true */
  hurt(): boolean {
    if (!this.alive) return false;
    this.alive = false;
    const anim = `${AssetKey.chest}_open`;
    if (this.scene.anims.exists(anim)) this.play(anim);
    this.setAlpha(0.7);
    return true;
  }

  contains(x: number, y: number): boolean {
    return Math.abs(x - this.x) < 12 && y <= this.y && y >= this.y - 28;
  }
}
