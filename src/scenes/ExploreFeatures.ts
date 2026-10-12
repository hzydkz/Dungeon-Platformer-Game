import Phaser from 'phaser';
import { AssetKey } from '../assets/keys';
import { DISPLAY } from '../config/display';
import type { GeneratedFloor, SpecialDoor, TilePos } from '../core/generation/floor';
import { Tile } from '../core/tiles';
import { textStyle } from '../ui/text';

/** ExploreFeatures가 층 씬에 요구하는 것 */
export interface ExploreHost {
  readonly floorData: GeneratedFloor;
  readonly currentRoom: number;
  readonly player: { readonly x: number; readonly y: number };
  notifyText(text: string, seconds: number, color: string): void;
  /** 타일 격자와 타일맵을 함께 바꾼다 */
  setTiles(tiles: readonly TilePos[], tile: number): void;
  burst(x: number, y: number, color: number, count: number, speed: number): void;
  sound(key: string, volume: number): void;
}

const ZONE_NAME = { nest: '몬스터 둥지', trap: '함정 구역' } as const;
const ZONE_HINT = { nest: '몬스터가 많지만 상자도 많다', trap: '가시 함정이 많지만 상자도 많다' } as const;

/**
 * 탐사 요소 (기획자 요청): 지름길 문(레버), 열쇠와 잠긴 문, 숨은 방 발견 알림, 구역 알림.
 * 층 씬이 만들고 매 프레임 update를 부른다.
 */
export class ExploreFeatures {
  /** 열린 특별 출입구 (link 번호) */
  readonly opened = new Set<number>();
  hasKey = false;
  keyTaken = false;
  hiddenFound = false;
  private readonly levers = new Map<number, Phaser.GameObjects.Sprite>();
  private keySprite: Phaser.GameObjects.Sprite | null = null;
  private readonly zoneNoticed = new Set<number>();
  private lockHintAt = 0;
  private gateHintAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly host: ExploreHost,
  ) {
    const s = DISPLAY.tileSize;
    const f = host.floorData;
    for (const d of f.specialDoors) {
      if (d.kind !== 'gate' || !d.lever) continue;
      const lever = scene.add.sprite(d.lever.x * s + s / 2, (d.lever.y + 1) * s, AssetKey.lever, 0).setOrigin(0.5, 1).setDepth(6);
      scene.add
        .text(lever.x, lever.y - 20, '레버 ↑', textStyle('tiny', '#a0f0c0', { stroke: '#000000', strokeThickness: 2 }))
        .setOrigin(0.5, 1)
        .setDepth(6);
      this.levers.set(d.link, lever);
    }
    if (f.key) {
      this.keySprite = scene.add.sprite(f.key.x * s + s / 2, (f.key.y + 1) * s - 10, AssetKey.key, 0).setDepth(7);
      scene.tweens.add({ targets: this.keySprite, y: this.keySprite.y - 4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  private door(link: number): SpecialDoor | undefined {
    return this.host.floorData.specialDoors.find((d) => d.link === link);
  }

  private openDoor(d: SpecialDoor, message: string, color: string): void {
    if (this.opened.has(d.link)) return;
    this.opened.add(d.link);
    this.host.setTiles(d.tiles, Tile.Empty);
    const s = DISPLAY.tileSize;
    for (const t of d.tiles) this.host.burst(t.x * s + s / 2, t.y * s + s / 2, d.kind === 'gate' ? 0x80e0b0 : 0xffd060, 4, 60);
    this.host.sound('sfx_break', 0.6);
    this.host.notifyText(message, 2.5, color);
  }

  /** ↑ 입력: 레버 당기기. 처리했으면 true */
  interact(): boolean {
    const p = this.host.player;
    for (const [link, lever] of this.levers) {
      if (this.opened.has(link)) continue;
      if (Math.abs(lever.x - p.x) < 14 && Math.abs(lever.y - 12 - p.y) < 22) {
        this.pullLever(link);
        return true;
      }
    }
    return false;
  }

  private pullLever(link: number): void {
    const d = this.door(link);
    const lever = this.levers.get(link);
    if (!d || !lever) return;
    lever.setFrame(1);
    this.openDoor(d, '지름길이 열렸다', '#a0f0c0');
  }

  /** 근접 공격 판정: 레버를 치면 당긴 것으로, 반대편에서 지름길 문을 치면 안내 */
  hitRect(rect: Phaser.Geom.Rectangle): void {
    const s = DISPLAY.tileSize;
    for (const [link, lever] of this.levers) {
      if (this.opened.has(link)) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, new Phaser.Geom.Rectangle(lever.x - 4, lever.y - 16, 8, 16))) this.pullLever(link);
    }
    const now = this.scene.time.now;
    if (now < this.gateHintAt) return;
    for (const d of this.host.floorData.specialDoors) {
      if (d.kind !== 'gate' || this.opened.has(d.link)) continue;
      if (d.tiles.some((t) => Phaser.Geom.Intersects.RectangleToRectangle(rect, new Phaser.Geom.Rectangle(t.x * s, t.y * s, s, s)))) {
        this.gateHintAt = now + 2500;
        this.host.notifyText('반대편 레버로 여는 문이다', 2, '#a0f0c0');
      }
    }
  }

  /** 부서진 비밀 벽 타일: 숨은 방 입구였으면 알림 */
  onWallBroken(tx: number, ty: number): void {
    if (this.hiddenFound) return;
    const d = this.host.floorData.specialDoors.find((x) => x.kind === 'secret');
    if (d && d.tiles.some((t) => t.x === tx && t.y === ty)) {
      this.hiddenFound = true;
      this.opened.add(d.link);
      this.host.notifyText('숨은 방을 찾았다!', 3, '#fff0a0');
    }
  }

  /** 방에 처음 들어갈 때 구역 알림 */
  onEnterRoom(room: number): void {
    const z = this.host.floorData.zones.findIndex((zone) => zone.rooms.includes(room));
    if (z < 0 || this.zoneNoticed.has(z)) return;
    this.zoneNoticed.add(z);
    const kind = this.host.floorData.zones[z]!.kind;
    this.host.notifyText(`${ZONE_NAME[kind]}: ${ZONE_HINT[kind]}`, 3, '#ffc080');
  }

  update(): void {
    const p = this.host.player;
    const s = DISPLAY.tileSize;
    // 열쇠 줍기
    if (this.keySprite && !this.keyTaken && Math.abs(this.keySprite.x - p.x) < 12 && Math.abs(this.keySprite.y - p.y) < 20) {
      this.keyTaken = true;
      this.hasKey = true;
      this.host.burst(this.keySprite.x, this.keySprite.y, 0xffd040, 14, 80);
      this.host.sound('sfx_chest', 0.6);
      this.keySprite.destroy();
      this.keySprite = null;
      this.host.notifyText('열쇠를 얻었다: 잠긴 문을 열 수 있다', 3, '#ffd860');
    }
    // 잠긴 문: 열쇠가 있으면 다가가면 열린다
    for (const d of this.host.floorData.specialDoors) {
      if (d.kind !== 'lock' || this.opened.has(d.link)) continue;
      const near = d.tiles.some((t) => Math.abs(t.x * s + s / 2 - p.x) < 22 && Math.abs(t.y * s + s / 2 - p.y) < 24);
      if (!near) continue;
      if (this.hasKey) {
        this.hasKey = false;
        this.openDoor(d, '잠긴 문이 열렸다', '#ffd860');
      } else if (this.scene.time.now > this.lockHintAt) {
        this.lockHintAt = this.scene.time.now + 3000;
        this.host.notifyText('잠긴 문: 이 층 어딘가의 열쇠가 필요하다', 2.5, '#ffd860');
      }
    }
  }
}
