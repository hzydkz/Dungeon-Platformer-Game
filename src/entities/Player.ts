import Phaser from 'phaser';
import { MOVEMENT, PLAYER_SIZE } from '../config/movement';
import { PlayerMotor } from '../core/movement/motor';
import { isOneWayTile } from '../core/tiles';
import { DISPLAY } from '../config/display';
import type { InputFrame } from '../input/Controls';

export type TileQuery = (tileX: number, tileY: number) => number;

/**
 * 플레이어 이동 (기획서 4장). 이동 능력은 모든 역할군이 같다.
 * 전투는 M3에서 역할군별 컴포넌트로 붙는다.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  readonly motor: PlayerMotor;
  facing: 1 | -1 = 1;
  /** 단방향 발판 무시 종료 시각 (씬 시간, 초) */
  private dropUntil = 0;
  /** 이동 조작을 잠시 막는 시간 (넉백, 대시 등) */
  controlLockUntil = 0;
  /** 공중에서 ↓를 누르고 있으면 단방향 발판을 통과한다 */
  private downHeldInAir = false;
  /** 마지막으로 안전하게 서 있던 위치 (가시에 닿으면 여기로 복귀) */
  readonly lastSafe = new Phaser.Math.Vector2();

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly textureKey: string,
    private readonly tileAt: TileQuery,
  ) {
    super(scene, x, y, textureKey, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.motor = new PlayerMotor(MOVEMENT);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(PLAYER_SIZE.bodyWidth, PLAYER_SIZE.bodyHeight);
    body.setOffset((PLAYER_SIZE.spriteWidth - PLAYER_SIZE.bodyWidth) / 2, PLAYER_SIZE.spriteHeight - PLAYER_SIZE.bodyHeight);
    body.setMaxVelocity(10000, MOVEMENT.maxFallSpeed);
    this.lastSafe.set(x, y);
  }

  get arcadeBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  get onGround(): boolean {
    return this.arcadeBody.blocked.down;
  }

  /** 단방향 발판과 충돌할지 (Arcade processCallback용) */
  shouldCollideOneWay(tile: Phaser.Tilemaps.Tile): boolean {
    if (!isOneWayTile(tile.index)) return true;
    if (this.scene.time.now / 1000 < this.dropUntil || this.downHeldInAir) return false;
    const body = this.arcadeBody;
    // 이전 프레임에 발판 위에 있었을 때만 착지
    return body.velocity.y >= 0 && body.prev.y + body.height <= tile.pixelY + 2;
  }

  private standingOnOneWay(): boolean {
    const body = this.arcadeBody;
    const ty = Math.floor((body.bottom + 1) / DISPLAY.tileSize);
    const x0 = Math.floor(body.left / DISPLAY.tileSize);
    const x1 = Math.floor((body.right - 1) / DISPLAY.tileSize);
    let oneWay = false;
    for (let tx = x0; tx <= x1; tx++) {
      const t = this.tileAt(tx, ty);
      if (isOneWayTile(t)) oneWay = true;
      else if (t !== 0) return false;
    }
    return oneWay;
  }

  tick(dt: number, input: InputFrame): void {
    const now = this.scene.time.now / 1000;
    const body = this.arcadeBody;
    const locked = now < this.controlLockUntil;
    this.downHeldInAir = input.downHeld && !this.onGround;
    let jumpPressed = input.jumpPressed && !locked;

    if (jumpPressed && input.downHeld && this.onGround && this.standingOnOneWay()) {
      this.dropUntil = now + MOVEMENT.dropThroughTime;
      jumpPressed = false;
    }

    const r = this.motor.step(
      dt,
      { moveX: locked ? 0 : input.moveX, jumpPressed, jumpHeld: input.jumpHeld },
      this.onGround,
      body.velocity.y,
    );
    if (!locked) body.setVelocityX(r.vx);
    body.setVelocityY(r.vy);
    if (!locked && input.moveX !== 0) this.facing = input.moveX > 0 ? 1 : -1;
    this.setFlipX(this.facing < 0);

    this.updateAnimation();
  }

  /** 공격/피격 애니메이션이 끝날 때까지 이동 애니메이션으로 덮지 않는다 */
  private actionLockUntil = 0;

  playAction(action: string, ignoreIfPlaying = true): void {
    const key = `${this.textureKey}_${action}`;
    if (!this.scene.anims.exists(key)) return;
    this.anims.play(key, ignoreIfPlaying);
    if (!ignoreIfPlaying) this.actionLockUntil = this.scene.time.now + 160;
  }

  private updateAnimation(): void {
    if (this.scene.time.now < this.actionLockUntil) return;
    const body = this.arcadeBody;
    if (!this.onGround) this.playAction(body.velocity.y < 0 ? 'jump' : 'fall');
    else if (Math.abs(body.velocity.x) > 1) this.playAction('run');
    else this.playAction('idle');
  }
}
