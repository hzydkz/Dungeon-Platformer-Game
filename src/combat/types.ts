import type Phaser from 'phaser';

/** 플레이어 공격에 맞을 수 있는 대상 (몬스터, 보스) */
export interface Hittable {
  readonly alive: boolean;
  readonly x: number;
  readonly y: number;
  hitRect(out: Phaser.Geom.Rectangle): Phaser.Geom.Rectangle;
  /** 피해를 받는다. 죽으면 true */
  hurt(amount: number, fromX: number): boolean;
  stun?(seconds: number): void;
}
