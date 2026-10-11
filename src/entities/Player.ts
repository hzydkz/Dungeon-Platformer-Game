import Phaser from 'phaser';
import { LEDGE_GRAB, MOVEMENT, PLAYER_SIZE } from '../config/movement';
import { PlayerMotor } from '../core/movement/motor';
import { findLedgeGrab, isLedgeCorner } from '../core/movement/ledge';
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
  /** 매달린 모서리 (없으면 null) */
  private hang: { tileX: number; tileY: number; dir: 1 | -1 } | null = null;
  /** 이 시각(씬 시간, 초)까지 모서리를 다시 잡지 않는다 */
  private regrabAt = 0;
  /** 이전 프레임의 몸 윗변 (모서리 통과 판정) */
  private prevBodyTop: number | null = null;

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

  /** 모서리에 매달려 있는가 */
  get hanging(): boolean {
    return this.hang !== null;
  }

  /** 매달리기를 풀고 중력을 되돌린다. 속도는 호출 측이 정한다 */
  releaseHang(now = this.scene.time.now / 1000): void {
    if (!this.hang) return;
    this.hang = null;
    this.regrabAt = now + LEDGE_GRAB.regrabCooldown;
    this.arcadeBody.setAllowGravity(true);
  }

  /** 떨어지는 중에 벽 쪽 모서리를 지나가면 붙잡는다 */
  private tryGrab(input: InputFrame, now: number): boolean {
    const body = this.arcadeBody;
    const prevTop = this.prevBodyTop ?? body.top;
    if (this.onGround || input.downHeld || now < this.regrabAt || body.velocity.y < 0 || input.moveX === 0) return false;
    // 순간이동(복귀 등) 직후에는 판정하지 않는다. 느린 기기의 한 프레임 낙하(최대 20px)보다는 크게
    if (Math.abs(body.top - prevTop) > DISPLAY.tileSize * 2) return false;
    const dir: 1 | -1 = input.moveX > 0 ? 1 : -1;
    const g = findLedgeGrab(
      this.tileAt,
      { left: body.left, right: body.right, top: body.top, prevTop, height: body.height },
      dir,
      DISPLAY.tileSize,
      LEDGE_GRAB,
    );
    if (!g) return false;
    this.hang = { tileX: g.tileX, tileY: g.tileY, dir };
    this.facing = dir;
    body.setAllowGravity(false);
    // 몸 왼쪽/윗변을 매달린 위치로. 물리 단계 직후라 스프라이트 좌표는 아직 갱신 전이므로 몸 기준으로 계산한다
    body.reset(g.bodyLeft - body.offset.x + this.displayOriginX, g.bodyTop - body.offset.y + this.displayOriginY);
    this.motor.reset();
    return true;
  }

  /** 매달린 동안의 입력. 매달리기가 계속되면 true */
  private tickHang(input: InputFrame, now: number, locked: boolean): boolean {
    const h = this.hang;
    if (!h) return false;
    const body = this.arcadeBody;
    // 맞아서 밀려나거나, 잡은 블록이 부서지면 떨어진다
    if (locked || !isLedgeCorner(this.tileAt, h.tileX, h.tileY)) {
      this.releaseHang(now);
      this.motor.reset();
      return false;
    }
    if (input.downHeld) {
      // ↓ 또는 ↓+점프: 놓고 떨어진다
      this.releaseHang(now);
      this.motor.reset();
      body.setVelocity(0, 0);
      return false;
    }
    if (input.jumpPressed) {
      // 매달린 상태의 점프는 가변 점프 없이 항상 최대 높이: 짧게 눌러도 모서리 위로 올라선다
      this.releaseHang(now);
      this.motor.reset();
      const moveX = Math.max(-1, Math.min(1, input.moveX));
      body.setVelocity(moveX * MOVEMENT.runSpeed * this.motor.speedMultiplier, -MOVEMENT.jumpVelocity);
      if (input.moveX !== 0) this.facing = input.moveX > 0 ? 1 : -1;
      return false;
    }
    body.setVelocity(0, 0);
    this.facing = h.dir;
    return true;
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
    if (this.hang) {
      const stillHanging = this.tickHang(input, now, locked);
      // 매달린 채로, 또는 점프/↓로 막 놓았으면 이번 프레임 이동은 끝 (속도는 tickHang이 정했다)
      if (stillHanging || (!locked && (input.jumpPressed || input.downHeld))) {
        this.prevBodyTop = body.top;
        this.setFlipX(this.facing < 0);
        this.updateAnimation();
        return;
      }
    } else if (!locked && this.tryGrab(input, now)) {
      this.prevBodyTop = body.top;
      this.setFlipX(this.facing < 0);
      this.updateAnimation();
      return;
    }
    this.prevBodyTop = body.top;
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
    if (this.hang) this.playAction(this.scene.anims.exists(`${this.textureKey}_hang`) ? 'hang' : 'jump');
    else if (!this.onGround) this.playAction(body.velocity.y < 0 ? 'jump' : 'fall');
    else if (Math.abs(body.velocity.x) > 1) this.playAction('run');
    else this.playAction('idle');
  }
}
