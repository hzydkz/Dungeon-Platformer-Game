import Phaser from 'phaser';
import { AssetKey } from '../assets/keys';
import type { Hittable } from '../combat/types';
import { COMBAT } from '../config/combat';
import { BossBrain } from '../core/boss/brain';
import type { Rng } from '../core/rng';
import type { BossDef, BossPattern } from '../data/bosses';
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

    for (const e of this.brain.update(dt, this.hp / this.maxHp)) {
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
    if (state === 'active' && p) this.activeUpdate(p, w);
    if ((state === 'telegraph' || state === 'intro' || state === 'phaseShift') && !this.def.flying) body.setVelocityX(0);
    if (this.def.flying && state !== 'active') {
      // 비행형: 아레나 위쪽 높이로 돌아간다
      const wantY = w.arena.top + 80;
      body.setVelocityY((wantY - this.y) * 2);
      if (state !== 'idle') body.setVelocityX(0);
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

  private idleMove(dt: number, w: BossWorld): void {
    const body = this.arcadeBody;
    const dx = w.target.x - this.x;
    this.dir = dx >= 0 ? 1 : -1;
    if (this.def.flying) {
      this.hover += dt * 2;
      body.setVelocityX(Math.abs(dx) > 40 ? this.dir * this.def.moveSpeed : Math.sin(this.hover) * 20);
    } else {
      body.setVelocityX(Math.abs(dx) > 50 ? this.dir * this.def.moveSpeed : 0);
    }
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
