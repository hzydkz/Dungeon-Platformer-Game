import Phaser from 'phaser';
import { AssetKey } from '../assets/keys';
import { COMBAT } from '../config/combat';
import { DISPLAY } from '../config/display';
import type { Rng } from '../core/rng';
import { getTile, isOneWayTile, isSolidTile, type TileGrid } from '../core/tiles';
import type { MonsterDef } from '../data/monsters';
import type { Hittable } from '../combat/types';

type State = 'move' | 'telegraph' | 'attack' | 'recover' | 'hitstun';

/** 몬스터가 주변 세계에 요청하는 것들 */
export interface MonsterWorld {
  readonly grid: TileGrid;
  readonly target: { x: number; y: number };
  canSee(fromX: number, fromY: number, toX: number, toY: number): boolean;
  fireEnemyShot(from: Monster, angle: number, speed: number, damage: number, homing: boolean): void;
}

/**
 * 몬스터 (기획서 8.5). 행동: 걷는 근접형 / 비행형 / 원거리형 + 테마별 특수 공격.
 * 모든 공격은 예고(빨간 깜빡임) → 실행 → 후딜 순서로 진행한다.
 */
export class Monster extends Phaser.Physics.Arcade.Sprite implements Hittable {
  readonly def: MonsterDef;
  /** 현재 있는 방. 떨어지거나 날아서 다른 방으로 가면 씬이 갱신한다 */
  room: number;
  hp: number;
  readonly maxHp: number;
  readonly contactDamage: number;
  readonly attackDamage: number;
  alive = true;
  private aiState: State = 'move';
  private stateTime = 0;
  private cooldown = 0;
  private dir: 1 | -1;
  private flashTime = 0;
  private wavePhase: number;
  private readonly spawnY: number;
  /** 돌진/도약처럼 몸으로 공격하는 중이면 접촉 피해 대신 공격 피해 */
  bodyAttack = false;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number, def: MonsterDef, scale: number, room: number, rng: Rng) {
    const s = DISPLAY.tileSize;
    super(scene, tileX * s + s / 2, (tileY + 1) * s, AssetKey.monster(def.id), 0);
    this.def = def;
    this.room = room;
    this.maxHp = Math.round(def.hp * scale);
    this.hp = this.maxHp;
    this.contactDamage = Math.round(def.contactDamage * scale);
    this.attackDamage = Math.round((def.attack?.damage ?? 0) * scale);
    this.dir = rng.chance(0.5) ? 1 : -1;
    this.wavePhase = rng.float(0, Math.PI * 2);
    this.cooldown = rng.float(0.3, 1.2);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(def.bodyWidth, def.bodyHeight);
    body.setOffset((this.width - def.bodyWidth) / 2, this.height - def.bodyHeight);
    if (def.behavior === 'flyer') {
      body.setAllowGravity(false);
      this.y -= s; // 바닥에서 한 칸 띄운다
    }
    this.spawnY = this.y;
    this.setDepth(8);
    this.playAnim('move');
    this.setActiveInRoom(false);
  }

  get arcadeBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  /** 플레이어가 있는 방의 몬스터만 움직인다 */
  setActiveInRoom(active: boolean): void {
    const body = this.arcadeBody;
    body.enable = active && this.alive;
    if (!active) body.setVelocity(0, 0);
  }

  private playAnim(action: string): void {
    const key = `${AssetKey.monster(this.def.id)}_${action}`;
    if (this.scene.anims.exists(key)) this.anims.play(key, true);
  }

  private setAiState(s: State): void {
    this.aiState = s;
    this.stateTime = 0;
    this.bodyAttack = false;
    if (s === 'move') this.playAnim('move');
    if (s === 'telegraph' || s === 'attack') this.playAnim('attack');
  }

  hitRect(out: Phaser.Geom.Rectangle): Phaser.Geom.Rectangle {
    const b = this.arcadeBody;
    return out.setTo(b.x, b.y, b.width, b.height);
  }

  /** 피해를 받는다. 죽으면 true */
  hurt(amount: number, fromX: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flashTime = COMBAT.monster.flashTime;
    if (this.hp <= 0) {
      this.alive = false;
      this.arcadeBody.enable = false;
      return true;
    }
    // 예고 중이던 공격은 취소하지 않는다(패턴 읽기), 이동 중에만 경직
    if (this.aiState === 'move' || this.aiState === 'recover') {
      this.setAiState('hitstun');
      const away = this.x >= fromX ? 1 : -1;
      this.arcadeBody.setVelocityX(away * COMBAT.monster.knockback);
      if (this.def.behavior === 'flyer') this.arcadeBody.setVelocityY(-40);
    }
    return false;
  }

  /** 밀려나며 잠시 멈춤 (완벽 막기 반격 등) */
  stun(seconds: number): void {
    this.setAiState('hitstun');
    this.stateTime = -seconds + COMBAT.monster.hitstun;
    this.arcadeBody.setVelocity(0, 0);
  }

  private solidAt(px: number, py: number, grid: TileGrid, includeOneWay: boolean): boolean {
    const t = getTile(grid, Math.floor(px / DISPLAY.tileSize), Math.floor(py / DISPLAY.tileSize));
    return isSolidTile(t) || (includeOneWay && isOneWayTile(t));
  }

  tick(dt: number, w: MonsterWorld): void {
    if (!this.alive || !this.arcadeBody.enable) return;
    const body = this.arcadeBody;
    this.stateTime += dt;
    this.cooldown -= dt;
    this.flashTime -= dt;

    const dx = w.target.x - this.x;
    const dy = w.target.y - (this.y - body.height / 2);
    const dist = Math.hypot(dx, dy);
    const sees = dist < this.def.sight && w.canSee(this.x, this.y - body.height / 2, w.target.x, w.target.y);
    const atk = this.def.attack;

    switch (this.aiState) {
      case 'hitstun':
        if (this.stateTime >= COMBAT.monster.hitstun) this.setAiState('move');
        if (this.def.behavior !== 'flyer') body.setVelocityX(body.velocity.x * 0.9);
        else body.setVelocity(body.velocity.x * 0.9, body.velocity.y * 0.9);
        break;
      case 'telegraph':
        if (this.def.behavior !== 'flyer') body.setVelocityX(0);
        else body.setVelocity(0, 0);
        if (atk && this.stateTime >= atk.telegraph) {
          this.setAiState('attack');
          this.beginAttack(w, dx, dy);
        }
        break;
      case 'attack':
        if (atk && atk.kind === 'charge') {
          this.bodyAttack = true;
          body.setVelocityX(this.dir * atk.speed);
          if (body.blocked.left || body.blocked.right) this.stateTime = atk.duration;
        }
        if (atk && atk.kind === 'hop') {
          this.bodyAttack = true;
          if (this.stateTime > 0.1 && body.blocked.down) this.stateTime = atk.duration;
        }
        if (atk && this.stateTime >= atk.duration) {
          this.setAiState('recover');
          if (this.def.behavior !== 'flyer') body.setVelocityX(0);
        }
        break;
      case 'recover':
        if (this.def.behavior !== 'flyer') body.setVelocityX(0);
        else body.setVelocity(0, 0);
        if (atk && this.stateTime >= atk.recovery) {
          this.cooldown = atk.cooldown;
          this.setAiState('move');
        }
        break;
      case 'move':
        this.move(dt, w, dx, dy, sees);
        if (atk && sees && this.cooldown <= 0 && this.inAttackRange(atk.kind, atk.range, dx, dy)) {
          this.dir = dx >= 0 ? 1 : -1;
          this.setAiState('telegraph');
        }
        break;
    }

    this.setFlipX(this.dir < 0);
    // 예고: 빨간 깜빡임, 피격: 흰색
    if (this.flashTime > 0) this.setTintFill(0xffffff);
    else if (this.aiState === 'telegraph') {
      if (Math.floor(this.stateTime * 16) % 2 === 0) this.setTint(0xff4040);
      else this.clearTint();
    } else this.clearTint();
  }

  private inAttackRange(kind: string, range: number, dx: number, dy: number): boolean {
    if (kind === 'charge' || kind === 'hop') return Math.abs(dx) < range && Math.abs(dy) < 28;
    return Math.hypot(dx, dy) < range;
  }

  private beginAttack(w: MonsterWorld, dx: number, dy: number): void {
    const atk = this.def.attack;
    if (!atk) return;
    const body = this.arcadeBody;
    const angle = Math.atan2(dy, dx);
    switch (atk.kind) {
      case 'charge':
        body.setVelocityX(this.dir * atk.speed);
        break;
      case 'hop':
        body.setVelocity(this.dir * atk.speed, -260);
        break;
      case 'shot':
        w.fireEnemyShot(this, angle, atk.speed, this.attackDamage, false);
        break;
      case 'spread':
        for (const off of [-0.3, 0, 0.3]) w.fireEnemyShot(this, angle + off, atk.speed, this.attackDamage, false);
        break;
      case 'homing':
        w.fireEnemyShot(this, angle, atk.speed, this.attackDamage, true);
        break;
    }
  }

  private move(dt: number, w: MonsterWorld, dx: number, dy: number, sees: boolean): void {
    const body = this.arcadeBody;
    const d = this.def;
    if (d.behavior === 'walker') {
      if (sees && Math.abs(dy) < 40) this.dir = dx >= 0 ? 1 : -1;
      const speed = d.speed * (sees ? 1.4 : 1);
      // 벽이나 낭떠러지 앞에서 방향 전환
      const aheadX = this.x + this.dir * (body.width / 2 + 2);
      const wall = this.solidAt(aheadX, this.y - 4, w.grid, false);
      const ground = this.solidAt(aheadX, this.y + 2, w.grid, true);
      if (body.blocked.down && (wall || !ground)) {
        this.dir = this.dir === 1 ? -1 : 1;
        body.setVelocityX(0);
      } else {
        body.setVelocityX(this.dir * speed);
      }
    } else if (d.behavior === 'flyer') {
      this.wavePhase += dt * 3;
      if (!sees) {
        body.setVelocity(0, Math.sin(this.wavePhase) * 12 + (this.spawnY - this.y) * 0.8);
        return;
      }
      const len = Math.max(1, Math.hypot(dx, dy));
      let vx = (dx / len) * d.speed;
      let vy = (dy / len) * d.speed;
      if (d.flight === 'wave') {
        vx += (-dy / len) * Math.sin(this.wavePhase) * d.speed * 0.8;
        vy += (dx / len) * Math.sin(this.wavePhase) * d.speed * 0.8;
      } else if (d.flight === 'keepDistance') {
        const want = 90;
        const k = len > want + 10 ? 1 : len < want - 10 ? -1 : 0;
        vx = (dx / len) * d.speed * k;
        vy = (dy / len) * d.speed * k + Math.sin(this.wavePhase) * 15;
      }
      body.setVelocity(vx, vy);
      this.dir = dx >= 0 ? 1 : -1;
    } else {
      // 원거리형: 제자리에서 플레이어를 바라본다
      body.setVelocityX(0);
      if (sees) this.dir = dx >= 0 ? 1 : -1;
    }
  }
}
