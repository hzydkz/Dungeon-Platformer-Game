import Phaser from 'phaser';
import { LEDGE_GRAB, MOVEMENT, PLAYER_SIZE, VINE } from '../config/movement';
import { PlayerMotor } from '../core/movement/motor';
import { findLedgeGrab, isLedgeCorner } from '../core/movement/ledge';
import { isOneWayTile, isSolidTile, isVineTile } from '../core/tiles';
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
  /** 붙잡은 넝쿨 (열, 맨 위/아래 행) */
  private vine: { col: number; top: number; bottom: number } | null = null;
  /** 넝쿨에서 점프/옆으로 놓은 직후: 이 넝쿨 열은 until까지, 그리고 떨어지기 시작할 때까지 다시 붙잡지 않는다 */
  private vineLeft: { col: number; until: number } | null = null;

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

  /** 모서리에 매달려 있거나 넝쿨을 타고 있는가 (공격/스킬 불가) */
  get hanging(): boolean {
    return this.hang !== null || this.vine !== null;
  }

  get climbing(): boolean {
    return this.vine !== null;
  }

  private isVine(tx: number, ty: number): boolean {
    return isVineTile(this.tileAt(tx, ty));
  }

  /** 넝쿨에서 내린다 */
  releaseVine(): void {
    if (!this.vine) return;
    this.vine = null;
    this.arcadeBody.setAllowGravity(true);
  }

  /** ↑(공중이면 ↓도)를 누른 채 몸 중심이 넝쿨 칸에 있으면 붙잡는다 */
  private tryVine(input: InputFrame): boolean {
    const wantUp = input.moveY < 0;
    const wantDown = input.moveY > 0 && !this.onGround;
    if (!wantUp && !wantDown) return false;
    const body = this.arcadeBody;
    const s = DISPLAY.tileSize;
    const cx = body.center.x;
    const col = Math.floor(cx / s);
    if (Math.abs(cx - (col * s + s / 2)) > VINE.grabReach) return false;
    // 방금 뛰어내린 넝쿨을 곧바로 다시 붙잡지 않는다 (↑를 누른 채 점프하면 점프가 취소되던 버그)
    const left = this.vineLeft;
    if (left && left.col === col && (this.scene.time.now / 1000 < left.until || body.velocity.y < 0)) return false;
    const feetRow = Math.floor(body.bottom / s);
    const lowRow = Math.floor((body.bottom - 1) / s);
    const hit = [feetRow, lowRow, Math.floor((body.top + 2) / s)].find((r) => this.isVine(col, r));
    if (hit === undefined) return false;
    let top = hit;
    while (this.isVine(col, top - 1)) top--;
    let bottom = hit;
    while (this.isVine(col, bottom + 1)) bottom++;
    // 위로 오를 때 이미 맨 위면 붙잡지 않는다 (넝쿨 꼭대기 옆 턱에 서 있을 때 계속 붙잡히지 않게)
    if (wantUp && this.onGround && body.bottom <= top * s + 0.5) return false;
    this.vine = { col, top, bottom };
    this.motor.reset();
    body.setAllowGravity(false);
    body.setVelocity(0, 0);
    return true;
  }

  /** 넝쿨 타기. 계속 타고 있으면 true */
  private tickVine(input: InputFrame, locked: boolean): boolean {
    const v = this.vine;
    if (!v) return false;
    const body = this.arcadeBody;
    const s = DISPLAY.tileSize;
    if (locked) {
      this.releaseVine();
      return false;
    }
    if (input.jumpPressed) {
      this.releaseVine();
      this.vineLeft = { col: v.col, until: this.scene.time.now / 1000 + VINE.regrabDelay };
      const moveX = Math.max(-1, Math.min(1, input.moveX));
      body.setVelocity(moveX * MOVEMENT.runSpeed * this.motor.speedMultiplier, input.downHeld ? 0 : -MOVEMENT.jumpVelocity * VINE.jumpMultiplier);
      if (moveX !== 0) this.facing = moveX > 0 ? 1 : -1;
      return false;
    }
    // 옆으로만 누르면 내린다 (위/아래와 함께 누르면 계속 오른다)
    if (input.moveX !== 0 && input.moveY === 0) {
      this.releaseVine();
      this.vineLeft = { col: v.col, until: this.scene.time.now / 1000 + VINE.regrabDelay };
      const dir = input.moveX > 0 ? 1 : -1;
      body.setVelocityX(input.moveX * MOVEMENT.runSpeed * this.motor.speedMultiplier);
      // 옆 칸 바닥이 발보다 조금 높으면 살짝 뛰어 올라선다 (높이를 정확히 맞추지 않아도 옆 턱에 내릴 수 있게)
      const rise = this.stepUpHeight(v.col + dir);
      if (rise > 0) body.setVelocityY(-Math.sqrt(2 * MOVEMENT.gravity * (rise + 3)));
      this.facing = dir;
      return false;
    }
    const minFeet = v.top * s;
    const maxFeet = (v.bottom + 1) * s;
    // 아래로 내려가다 바닥에 닿았거나 넝쿨 아래 끝을 지나면 놓는다
    if ((input.moveY > 0 && this.onGround) || body.bottom > maxFeet + 1) {
      this.releaseVine();
      return false;
    }
    let vy = input.moveY * VINE.climbSpeed;
    // 넝쿨 꼭대기에서 멈춘다. 위치를 직접 옮기지 않고 속도로 맞춘다 (직접 옮기면 충돌을 건너뛰어 벽에 끼고 튕겨 나갔다)
    if (vy < 0 && body.bottom + vy / 60 < minFeet) vy = Math.min(0, (minFeet - body.bottom) * 60);
    if (body.bottom < minFeet - 0.5) vy = Math.min(VINE.climbSpeed, (minFeet - body.bottom) * 10);
    // 몸을 넝쿨 가운데로
    const targetX = v.col * s + s / 2;
    body.setVelocity((targetX - body.center.x) * 12, vy);
    return true;
  }

  /** 열 tx에서 발 높이 근처(VINE.stepUp 이내 위)의 바닥까지 올라야 하는 높이(px). 없으면 0 */
  private stepUpHeight(tx: number): number {
    const body = this.arcadeBody;
    const s = DISPLAY.tileSize;
    const ty = Math.floor((body.bottom - 1) / s);
    const t = this.tileAt(tx, ty);
    if (!isSolidTile(t) && !isOneWayTile(t)) return 0;
    const rise = body.bottom - ty * s;
    if (rise <= 0 || rise > VINE.stepUp) return 0;
    // 올라선 자리에 몸이 들어갈 공간
    const headRow = Math.floor((ty * s - body.height) / s);
    for (let r = headRow; r < ty; r++) if (isSolidTile(this.tileAt(tx, r))) return 0;
    return rise;
  }

  /** 매달리기를 풀고 중력을 되돌린다. 속도는 호출 측이 정한다 */
  releaseHang(now = this.scene.time.now / 1000): void {
    this.releaseVine();
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
    if (this.vine) {
      const still = this.tickVine(input, locked);
      if (still || (!locked && (input.jumpPressed || input.moveX !== 0))) {
        this.prevBodyTop = body.top;
        this.setFlipX(this.facing < 0);
        this.updateAnimation();
        return;
      }
    } else if (!locked && !this.hang && this.tryVine(input)) {
      this.prevBodyTop = body.top;
      this.updateAnimation();
      return;
    }
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
    if (this.vine) this.playAction(this.scene.anims.exists(`${this.textureKey}_climb`) ? 'climb' : 'jump');
    else if (this.hang) this.playAction(this.scene.anims.exists(`${this.textureKey}_hang`) ? 'hang' : 'jump');
    else if (!this.onGround) this.playAction(body.velocity.y < 0 ? 'jump' : 'fall');
    else if (Math.abs(body.velocity.x) > 1) this.playAction('run');
    else this.playAction('idle');
  }
}
