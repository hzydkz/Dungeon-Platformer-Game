import Phaser from 'phaser';
import { AssetKey } from '../assets/keys';
import type { Hittable } from '../combat/types';
import { COMBAT } from '../config/combat';
import { MOVEMENT } from '../config/movement';
import { BossBrain, classifySituation } from '../core/boss/brain';
import type { Rng } from '../core/rng';
import { BOSS_RULES, type BossDef, type BossPattern } from '../data/bosses';
import type { Effects } from '../fx/Effects';

/** 보스가 씬에 요청하는 것들 */
export interface BossWorld {
  readonly target: { x: number; y: number };
  /** 아레나 경계 (px) */
  readonly arena: Phaser.Geom.Rectangle;
  /** 아레나 바닥 높이 (px, 발 위치) */
  readonly floorY: number;
  readonly fx: Effects;
  fireBossShot(x: number, y: number, vx: number, vy: number, damage: number, opts?: { homing?: boolean; scaleY?: number; lifetime?: number }): void;
  hurtPlayerInRect(rect: Phaser.Geom.Rectangle, damage: number, sourceX: number, cause: string): void;
  spawnMinion(x: number, y: number): void;
}

interface Hazard {
  readonly rect: Phaser.Geom.Rectangle;
  until: number;
  readonly damage: number;
}

/**
 * 보스 (기획서 8.6). BossBrain(상태 머신)의 이벤트에 맞춰 행동을 실행하고,
 * 예고 구간에는 빨간 깜빡임과 바닥 표시(착지 지점, 낙석 위치, 가시 위치)를 그린다.
 */
export class Boss extends Phaser.Physics.Arcade.Sprite implements Hittable {
  readonly def: BossDef;
  readonly brain: BossBrain;
  readonly maxHp: number;
  hp: number;
  alive = true;
  fighting = false;
  private readonly scaleMult: number;
  private readonly markers: Phaser.GameObjects.Graphics;
  private hazards: Hazard[] = [];
  private targetX = 0;
  private targetY = 0;
  private dropXs: number[] = [];
  private flashTime = 0;
  private dir: 1 | -1 = -1;
  private hover = 0;
  /** 대기 중 이동 목표 */
  private intent: 'approach' | 'retreat' | 'hop' | 'hold' | 'swoop' = 'approach';
  private intentX = 0;
  private intentY = 0;
  /** 도약 중 유지할 가로 속도 (벽에 닿아 0이 되어도 공중에서 다시 적용) */
  private airVx = 0;
  /** 최근 피격 시각 (회피 판단) */
  private hitTimes: number[] = [];

  constructor(scene: Phaser.Scene, x: number, feetY: number, def: BossDef, tier: 1 | 2 | 3, scale: number, rng: Rng) {
    super(scene, x, feetY, AssetKey.boss(def.id), 0);
    this.def = def;
    this.scaleMult = scale;
    this.maxHp = Math.round(def.hp * scale);
    this.hp = this.maxHp;
    this.brain = new BossBrain(def, tier, rng);
    this.rng = rng;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1).setDepth(9);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(def.bodyWidth, def.bodyHeight);
    body.setOffset((this.width - def.bodyWidth) / 2, this.height - def.bodyHeight);
    body.setAllowGravity(!def.flying);
    body.enable = false;
    if (def.flying) this.y -= 70;
    this.markers = scene.add.graphics().setDepth(7);
    this.playAnim('idle');
  }

  private readonly rng: Rng;

  get arcadeBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  get contactDamage(): number {
    return Math.round(this.def.contactDamage * this.scaleMult);
  }

  private dmg(p: BossPattern): number {
    return Math.round(p.damage * this.scaleMult);
  }

  private playAnim(action: string): void {
    const key = `${AssetKey.boss(this.def.id)}_${action}`;
    if (this.scene.anims.exists(key)) this.anims.play(key, true);
  }

  startFight(): void {
    this.fighting = true;
    this.arcadeBody.enable = true;
    if (this.def.flying) this.arcadeBody.setAllowGravity(false);
  }

  hitRect(out: Phaser.Geom.Rectangle): Phaser.Geom.Rectangle {
    const b = this.arcadeBody;
    return out.setTo(b.x, b.y, b.width, b.height);
  }

  hurt(amount: number, _fromX: number): boolean {
    if (!this.alive || !this.fighting) return false;
    if (this.brain.invulnerable) return false;
    this.hp -= amount;
    this.flashTime = COMBAT.monster.flashTime;
    this.hitTimes.push(this.scene.time.now / 1000);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.arcadeBody.enable = false;
      this.markers.clear();
      this.hazards = [];
      return true;
    }
    return false;
  }

  tick(dt: number, w: BossWorld): void {
    if (!this.alive || !this.fighting) return;
    const body = this.arcadeBody;
    this.flashTime -= dt;
    const now = this.scene.time.now / 1000;

    const situation = classifySituation(w.target.x - this.x, w.target.y + 12 - this.y);
    for (const e of this.brain.update(dt, this.hp / this.maxHp, situation)) {
      switch (e.type) {
        case 'telegraph':
          this.onTelegraph(e.pattern, w);
          break;
        case 'attack':
          this.onAttack(e.pattern, w);
          break;
        case 'recover':
          this.markers.clear();
          this.playAnim('recover');
          if (!this.def.flying) body.setVelocityX(0);
          else body.setVelocity(0, 0);
          break;
        case 'idle':
          this.markers.clear();
          this.playAnim('idle');
          this.chooseIntent(w);
          break;
        case 'phase2':
          this.markers.clear();
          body.setVelocity(0, body.velocity.y);
          w.fx.shake(0.008, 500);
          w.fx.burst(this.x, this.y - body.height / 2, 0xb050ff, 20, 140);
          w.fx.sound('sfx_boss_roar', 0.7);
          this.playAnim('hurt');
          break;
        case 'dead':
          break;
      }
    }

    const state = this.brain.state;
    const p = this.brain.current;
    if (state === 'idle') this.idleMove(dt, w);
    // 대기 중에 연속으로 맞으면 회피 도약 (후딜레이는 반격 기회로 남겨 둔다)
    if (state === 'idle' && this.shouldEvade(now)) this.evade(w);
    if (state === 'active' && p) this.activeUpdate(p, w);
    if ((state === 'telegraph' || state === 'intro' || state === 'phaseShift') && !this.def.flying && body.blocked.down) body.setVelocityX(0);
    if (this.def.flying && state !== 'active' && state !== 'idle') {
      // 비행형: 아레나 위쪽 높이로 돌아간다
      const wantY = w.arena.top + 80;
      body.setVelocityY((wantY - this.y) * 2);
      body.setVelocityX(0);
    }

    // 바닥 가시 등 지속 피해 구역
    this.hazards = this.hazards.filter((h) => h.until > now);
    for (const h of this.hazards) w.hurtPlayerInRect(h.rect, h.damage, h.rect.centerX, this.def.name);

    this.setFlipX(this.dir > 0);
    if (this.flashTime > 0) this.setTintFill(0xffffff);
    else if (state === 'telegraph') {
      if (Math.floor(this.brain.time * 14) % 2 === 0) this.setTint(0xff5050);
      else this.clearTint();
    } else if (this.brain.invulnerable) this.setTint(0x9090a0);
    else this.clearTint();
  }

  /**
   * 대기 구간마다 이동 목표를 정한다: 거리를 좁히기, 물러나기, 플레이어를 뛰어넘기,
   * 발판 위의 플레이어에게 도약, (비행형) 아레나의 다른 곳으로 이동.
   */
  private chooseIntent(w: BossWorld): void {
    const dx = w.target.x - this.x;
    const dy = w.target.y + 12 - this.y;
    const dist = Math.abs(dx);
    const a = w.arena;
    if (this.def.flying) {
      this.intent = 'swoop';
      // 플레이어 반대쪽이나 위쪽 임의 지점
      const side = this.rng.chance(0.5) ? -1 : 1;
      this.intentX = Phaser.Math.Clamp(w.target.x + side * this.rng.float(80, 200), a.left + 40, a.right - 40);
      this.intentY = this.rng.float(a.top + 50, a.top + 130);
      return;
    }
    if (dy < -BOSS_RULES.aboveThreshold && dist < 200) {
      this.intent = 'hop';
      this.intentX = w.target.x;
    } else if (dist < 70) {
      if (this.rng.chance(0.5)) {
        this.intent = 'hop';
        // 플레이어를 뛰어넘어 반대편으로
        this.intentX = Phaser.Math.Clamp(w.target.x + Math.sign(dx || 1) * 90, a.left + 30, a.right - 30);
      } else {
        this.intent = 'retreat';
        this.intentX = Phaser.Math.Clamp(this.x - Math.sign(dx || 1) * 140, a.left + 30, a.right - 30);
      }
    } else if (dist > 160) {
      this.intent = this.rng.chance(0.3) ? 'hop' : 'approach';
      this.intentX = w.target.x - Math.sign(dx) * 60;
    } else {
      const r = this.rng.int(0, 2);
      this.intent = r === 0 ? 'approach' : r === 1 ? 'hold' : 'hop';
      this.intentX = r === 2 ? Phaser.Math.Clamp(this.x + this.rng.float(-120, 120), a.left + 30, a.right - 30) : w.target.x;
    }
  }

  private jump(vx: number): void {
    const body = this.arcadeBody;
    if (!body.blocked.down || this.def.flying) return;
    this.airVx = vx;
    body.setVelocity(vx, -this.def.jumpVelocity);
  }

  private idleMove(dt: number, w: BossWorld): void {
    const body = this.arcadeBody;
    const dx = w.target.x - this.x;
    this.dir = dx >= 0 ? 1 : -1;
    const speed = this.def.moveSpeed;
    if (this.def.flying) {
      this.hover += dt * 3;
      const tx = this.intentX - this.x;
      const ty = this.intentY - (this.y - body.height / 2);
      const len = Math.max(1, Math.hypot(tx, ty));
      const k = len > 8 ? 1.6 : 0;
      body.setVelocity((tx / len) * speed * k, (ty / len) * speed * k + Math.sin(this.hover) * 15);
      return;
    }
    const tx = this.intentX - this.x;
    // 공중에서는 도약할 때의 가로 속도를 유지한다 (기둥 옆면에 닿아도 넘어가게)
    if (!body.blocked.down) {
      body.setVelocityX(this.airVx);
      return;
    }
    this.airVx = 0;
    switch (this.intent) {
      case 'hold':
        if (body.blocked.down) body.setVelocityX(0);
        break;
      case 'hop':
        if (body.blocked.down) {
          // 도약 시간 동안 목표 x에 닿도록
          const air = (2 * this.def.jumpVelocity) / MOVEMENT.gravity;
          this.jump(Phaser.Math.Clamp(tx / air, -speed * 2.2, speed * 2.2));
          this.intent = 'hold';
        }
        break;
      default: {
        const moving = Math.abs(tx) > 10;
        if (body.blocked.down) body.setVelocityX(moving ? Math.sign(tx) * speed * (this.intent === 'retreat' ? 1.4 : 1.2) : 0);
        // 기둥 등에 막히면 뛰어넘는다
        if (moving && (body.blocked.left || body.blocked.right)) this.jump(Math.sign(tx) * speed * 1.3);
        if (this.intent === 'retreat' && moving) this.dir = tx > 0 ? 1 : -1;
      }
    }
  }

  private shouldEvade(now: number): boolean {
    this.hitTimes = this.hitTimes.filter((t) => now - t < BOSS_RULES.evadeWindow);
    return this.hitTimes.length >= BOSS_RULES.evadeHits;
  }

  /** 연속으로 맞으면 플레이어에게서 멀어지는 쪽으로 도약 (비행형은 위로 이탈) */
  private evade(w: BossWorld): void {
    this.hitTimes = [];
    const body = this.arcadeBody;
    const away = this.x >= w.target.x ? 1 : -1;
    const roomLeft = away > 0 ? w.arena.right - this.x : this.x - w.arena.left;
    const dirX = roomLeft > 100 ? away : -away;
    if (this.def.flying) {
      this.intent = 'swoop';
      this.intentX = Phaser.Math.Clamp(this.x + dirX * 220, w.arena.left + 40, w.arena.right - 40);
      this.intentY = w.arena.top + 50;
      body.setVelocity(dirX * this.def.moveSpeed * 2, -this.def.moveSpeed);
    } else if (body.blocked.down) {
      this.airVx = dirX * this.def.moveSpeed * 2.4;
      body.setVelocity(this.airVx, -this.def.jumpVelocity * 0.85);
      this.intent = 'hold';
    }
    w.fx.burst(this.x, this.y - 8, 0xc0b0e0, 10, 90);
  }

  private onTelegraph(p: BossPattern, w: BossWorld): void {
    this.playAnim('telegraph');
    this.targetX = Phaser.Math.Clamp(w.target.x, w.arena.left + 24, w.arena.right - 24);
    this.targetY = w.target.y;
    this.dir = this.targetX >= this.x ? 1 : -1;
    const g = this.markers;
    g.clear();
    const floor = w.floorY;
    switch (p.action) {
      case 'charge':
        g.fillStyle(0xff3030, 0.35).fillRect(Math.min(this.x, this.dir > 0 ? w.arena.right : w.arena.left), floor - 4, Math.abs((this.dir > 0 ? w.arena.right : w.arena.left) - this.x), 4);
        break;
      case 'leapSlam':
        g.lineStyle(1, 0xff4040, 0.9).strokeEllipse(this.targetX, floor - 2, 48, 8);
        g.fillStyle(0xff3030, 0.25).fillRect(w.arena.left, floor - 3, w.arena.width, 3);
        break;
      case 'rockfall': {
        const n = p.count ?? 4;
        this.dropXs = [];
        for (let i = 0; i < n; i++) this.dropXs.push(this.rng.float(w.arena.left + 24, w.arena.right - 24));
        // 한 개는 항상 플레이어 위
        this.dropXs[0] = this.targetX;
        for (const x of this.dropXs) g.fillStyle(0xff3030, 0.35).fillRect(x - 8, floor - 6, 16, 6);
        break;
      }
      case 'groundSpikes': {
        const n = p.count ?? 2;
        this.dropXs = [];
        for (let i = 0; i < n; i++) this.dropXs.push(Phaser.Math.Clamp(this.targetX + (i - (n - 1) / 2) * 64, w.arena.left + 20, w.arena.right - 20));
        for (const x of this.dropXs) g.fillStyle(0xff3030, 0.4).fillRect(x - 20, floor - 5, 40, 5);
        break;
      }
      case 'dive':
        g.lineStyle(1, 0xff4040, 0.7).lineBetween(this.x, this.y - this.arcadeBody.height / 2, this.targetX, this.targetY);
        break;
      default:
        g.fillStyle(0xff3030, 0.3).fillCircle(this.x, this.y - this.arcadeBody.height / 2, 20);
    }
  }

  private onAttack(p: BossPattern, w: BossWorld): void {
    this.playAnim('attack');
    this.markers.clear();
    const body = this.arcadeBody;
    const cy = this.y - body.height / 2;
    const d = this.dmg(p);
    const speed = p.speed ?? 150;
    switch (p.action) {
      case 'charge':
        body.setVelocityX(this.dir * speed);
        break;
      case 'leapSlam': {
        const t = 0.8;
        body.setVelocity(Phaser.Math.Clamp((this.targetX - this.x) / t, -260, 260), -360);
        break;
      }
      case 'rockfall':
        for (const x of this.dropXs) w.fireBossShot(x, w.arena.top + 20, 0, 280, d, { lifetime: 2 });
        break;
      case 'groundSpikes': {
        const until = this.scene.time.now / 1000 + this.brain.activeTime(p);
        for (const x of this.dropXs) {
          const rect = new Phaser.Geom.Rectangle(x - 20, w.floorY - 22, 40, 22);
          this.hazards.push({ rect, until, damage: d });
          const g = this.scene.add.graphics().setDepth(11);
          g.fillStyle(0xd8d0f0, 1);
          for (let i = 0; i < 5; i++) g.fillTriangle(x - 20 + i * 8, w.floorY, x - 16 + i * 8, w.floorY - 20, x - 12 + i * 8, w.floorY);
          this.scene.time.delayedCall(this.brain.activeTime(p) * 1000, () => g.destroy());
        }
        w.fx.shake(0.004, 120);
        break;
      }
      case 'volley': {
        const n = p.count ?? 5;
        const base = Math.atan2(w.target.y - cy, w.target.x - this.x);
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.22;
          w.fireBossShot(this.x, cy, Math.cos(a) * speed, Math.sin(a) * speed, d);
        }
        break;
      }
      case 'homingOrbs': {
        const n = p.count ?? 3;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.8;
          w.fireBossShot(this.x, cy, Math.cos(a) * speed, Math.sin(a) * speed, d, { homing: true, lifetime: 4 });
        }
        break;
      }
      case 'slashWave':
        w.fireBossShot(this.x + this.dir * 16, w.floorY - 14, this.dir * speed, 0, d, { scaleY: 2.6, lifetime: 2.5 });
        break;
      case 'dive': {
        const a = Math.atan2(this.targetY - cy, this.targetX - this.x);
        body.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
        break;
      }
      case 'summon':
        for (let i = 0; i < (p.count ?? 2); i++) w.spawnMinion(this.x + (i === 0 ? -40 : 40), w.floorY);
        break;
    }
  }

  private activeUpdate(p: BossPattern, w: BossWorld): void {
    const body = this.arcadeBody;
    switch (p.action) {
      case 'charge':
        body.setVelocityX(this.dir * (p.speed ?? 250));
        if (body.blocked.left || body.blocked.right) {
          w.fx.shake(0.006, 150);
          this.brain.endActive();
        }
        break;
      case 'leapSlam':
        if (this.brain.time > 0.2 && body.blocked.down) {
          body.setVelocityX(0);
          const d = this.dmg(p);
          const speed = p.speed ?? 170;
          w.fireBossShot(this.x - 20, w.floorY - 6, -speed, 0, d, { lifetime: 3 });
          w.fireBossShot(this.x + 20, w.floorY - 6, speed, 0, d, { lifetime: 3 });
          w.fx.shake(0.008, 180);
          w.fx.burst(this.x, w.floorY, 0xc8b8a0, 14, 120);
          this.brain.endActive();
        }
        break;
      case 'dive':
        if (Math.hypot(this.targetX - this.x, this.targetY - this.y) < 16 || body.blocked.down || body.blocked.left || body.blocked.right) {
          body.setVelocity(0, 0);
          w.fx.shake(0.005, 120);
          this.brain.endActive();
        }
        break;
      default:
        break;
    }
  }

  destroyAll(): void {
    this.markers.destroy();
    this.destroy();
  }
}
