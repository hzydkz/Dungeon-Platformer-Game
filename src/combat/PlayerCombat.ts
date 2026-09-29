import Phaser from 'phaser';
import { AssetKey } from '../assets/keys';
import { COMBAT } from '../config/combat';
import { incomingDamage, invulnTime, thornsDamage } from '../core/combat/damage';
import type { Stats } from '../core/combat/stats';
import type { MeleeAttack, RoleDef } from '../data/roles';
import type { Player } from '../entities/Player';
import type { ProjectileOptions } from '../entities/Projectile';
import type { Effects } from '../fx/Effects';
import type { InputFrame } from '../input/Controls';
import type { Hittable } from './types';

/** 전투가 씬에 요청하는 것들 */
export interface CombatHost {
  targets(): Iterable<Hittable>;
  /** 대상에게 플레이어 공격 피해를 준다 (배율/치명타/처치 보상은 씬이 처리) */
  damageTarget(target: Hittable, base: number, fromX: number): void;
  spawnPlayerProjectile(o: Omit<ProjectileOptions, 'owner'>): void;
  /** 근접 공격이 닿은 타일 처리 (비밀 벽) */
  hitTiles(rect: Phaser.Geom.Rectangle): void;
  onPlayerDeath(cause: string): void;
  readonly fx: Effects;
}

interface Swing {
  readonly attack: MeleeAttack;
  readonly dir: 'side' | 'up' | 'down';
  until: number;
  readonly hit: Set<Hittable>;
  pogoDone: boolean;
}

/**
 * 역할군별 기본 공격/스킬, 체력, 피격/무적/넉백 (기획서 8.2, 8.5).
 */
export class PlayerCombat {
  hp: number;
  mana: number;
  attackCooldown = 0;
  skillCooldown = 0;
  invulnUntil = 0;
  /** 디버그 무적 */
  godMode = false;
  blocking = false;
  private blockStart = 0;
  charge = 0;
  private charging = false;
  private dashTime = 0;
  private swing: Swing | null = null;
  private readonly rect = new Phaser.Geom.Rectangle();
  private readonly tmp = new Phaser.Geom.Rectangle();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    readonly role: RoleDef,
    public stats: Stats,
    hp: number,
    private readonly host: CombatHost,
  ) {
    this.hp = hp > 0 ? Math.min(hp, stats.maxHp) : stats.maxHp;
    this.mana = role.maxMana;
  }

  private get now(): number {
    return this.scene.time.now / 1000;
  }

  get invulnerable(): boolean {
    return this.godMode || this.now < this.invulnUntil;
  }

  get dashing(): boolean {
    return this.dashTime > 0;
  }

  /** 입력 처리. Player.tick 전에 호출 */
  update(dt: number, input: InputFrame): void {
    const stats = this.stats;
    this.attackCooldown -= dt;
    this.skillCooldown -= dt;
    if (stats.regenPerSecond > 0) this.hp = Math.min(stats.maxHp, this.hp + stats.maxHp * stats.regenPerSecond * dt);
    if (this.role.maxMana > 0) this.mana = Math.min(this.role.maxMana, this.mana + this.role.manaRegen * dt);

    const hurtLocked = this.now < this.player.controlLockUntil && !this.dashing;
    if (input.attackPressed && this.attackCooldown <= 0 && !this.blocking && !hurtLocked) this.basicAttack(input);
    this.updateSkill(dt, input);
    this.updateSwing();

    const blockFactor = this.blocking && this.role.skill.kind === 'block' ? this.role.skill.moveFactor : 1;
    this.player.motor.speedMultiplier = stats.moveSpeed * blockFactor;

    // 무적 깜빡임
    const blink = this.invulnerable && !this.godMode && Math.floor(this.now / COMBAT.player.blinkInterval) % 2 === 0;
    this.player.setAlpha(blink ? 0.35 : 1);
  }

  private aim(input: InputFrame): 'side' | 'up' | 'down' {
    if (input.moveY < 0) return 'up';
    if (input.moveY > 0 && !this.player.onGround) return 'down';
    return 'side';
  }

  private basicAttack(input: InputFrame): void {
    const a = this.role.attack;
    this.attackCooldown = a.cooldown / this.stats.attackSpeed;
    this.player.playAction('attack', false);
    this.host.fx.sound('sfx_attack', 0.4);
    const dir = this.aim(input);
    if (a.kind === 'melee') {
      this.swing = { attack: a, dir, until: this.now + a.active, hit: new Set(), pogoDone: false };
      const r = this.swingRect(this.swing);
      const angle = dir === 'up' ? -Math.PI / 2 : dir === 'down' ? Math.PI / 2 : this.player.facing > 0 ? 0 : Math.PI;
      this.host.fx.slash(r.centerX, r.centerY, angle, this.player.facing < 0 && dir === 'side');
      this.host.hitTiles(r);
    } else {
      const speed = a.speed;
      const up = dir === 'up';
      const count = 1 + Math.round(this.stats.extraProjectiles);
      for (let i = 0; i < count; i++) {
        const spread = (i - (count - 1) / 2) * 0.12;
        const angle = up ? -Math.PI / 2 + spread : (this.player.facing > 0 ? 0 : Math.PI) + spread * this.player.facing;
        this.host.spawnPlayerProjectile({
          texture: a.texture === 'arrow' ? AssetKey.arrow : AssetKey.orb,
          x: this.player.x + (up ? 0 : this.player.facing * 8),
          // 옆으로 쏠 때는 발 위 7px 높이: 키 작은 몬스터(10px)도 맞는다
          y: this.player.y + (up ? -12 : 5),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          damage: a.damage,
          lifetime: a.lifetime,
          splashRadius: a.splashRadius,
        });
      }
    }
  }

  private swingRect(s: Swing): Phaser.Geom.Rectangle {
    const p = this.player;
    const a = s.attack;
    if (s.dir === 'side') {
      const x = p.facing > 0 ? p.x + 3 : p.x - 3 - a.width;
      return this.rect.setTo(x, p.y - a.height / 2 - 1, a.width, a.height);
    }
    const w = a.height + 6;
    const h = a.width - 4;
    if (s.dir === 'up') return this.rect.setTo(p.x - w / 2, p.y - 12 - h, w, h);
    return this.rect.setTo(p.x - w / 2, p.y + 10, w, h);
  }

  private updateSwing(): void {
    const s = this.swing;
    if (!s) return;
    if (this.now > s.until) {
      this.swing = null;
      return;
    }
    const r = this.swingRect(s);
    for (const t of this.host.targets()) {
      if (!t.alive || s.hit.has(t)) continue;
      if (!Phaser.Geom.Intersects.RectangleToRectangle(r, t.hitRect(this.tmp))) continue;
      s.hit.add(t);
      this.host.damageTarget(t, s.attack.damage, this.player.x);
      if (s.dir === 'down' && !s.pogoDone) {
        s.pogoDone = true;
        this.player.arcadeBody.setVelocityY(-COMBAT.player.pogoVelocity);
      }
    }
  }

  private updateSkill(dt: number, input: InputFrame): void {
    const sk = this.role.skill;
    const body = this.player.arcadeBody;
    switch (sk.kind) {
      case 'block': {
        const want = input.skillHeld && this.player.onGround;
        if (want && !this.blocking && this.skillCooldown <= 0) {
          this.blocking = true;
          this.blockStart = this.now;
          this.player.playAction('skill');
        } else if (!want && this.blocking) {
          this.blocking = false;
          this.skillCooldown = sk.cooldown * this.stats.skillCooldown;
        }
        break;
      }
      case 'dash': {
        if (this.dashTime > 0) {
          this.dashTime -= dt;
          body.setVelocity(this.player.facing * sk.speed, 0);
          if (this.dashTime <= 0) body.setAllowGravity(true);
        } else if (input.skillPressed && this.skillCooldown <= 0) {
          this.dashTime = sk.duration;
          this.skillCooldown = sk.cooldown * this.stats.skillCooldown;
          this.invulnUntil = Math.max(this.invulnUntil, this.now + sk.invuln);
          this.player.controlLockUntil = this.now + sk.duration;
          if (input.moveX !== 0) this.player.facing = input.moveX > 0 ? 1 : -1;
          body.setAllowGravity(false);
          body.setVelocity(this.player.facing * sk.speed, 0);
          this.player.playAction('skill', false);
          this.host.fx.burst(this.player.x, this.player.y + 8, 0xd9f2d0, 6, 60);
        }
        break;
      }
      case 'chargeShot': {
        if (input.skillHeld && this.skillCooldown <= 0) {
          this.charging = true;
          this.charge = Math.min(1, this.charge + dt / sk.chargeTime);
        } else if (this.charging && !input.skillHeld) {
          const dmg = sk.minDamage + (sk.maxDamage - sk.minDamage) * this.charge;
          const dir = this.player.facing;
          this.host.spawnPlayerProjectile({
            texture: AssetKey.arrow,
            x: this.player.x + dir * 8,
            y: this.player.y + 5,
            vx: dir * sk.speed,
            vy: 0,
            damage: dmg,
            lifetime: 1.2,
            pierce: true,
          });
          this.host.fx.sound('sfx_attack', 0.6);
          this.charging = false;
          this.charge = 0;
          this.skillCooldown = sk.cooldown * this.stats.skillCooldown;
          this.player.playAction('skill', false);
        }
        break;
      }
      case 'explosion': {
        if (input.skillPressed && this.skillCooldown <= 0 && this.mana >= sk.manaCost) {
          this.mana -= sk.manaCost;
          this.skillCooldown = sk.cooldown * this.stats.skillCooldown;
          const cx = this.player.x + this.player.facing * sk.offset;
          const cy = this.player.y;
          this.host.fx.ring(cx, cy, sk.radius, 0x7fa8ff);
          this.host.fx.burst(cx, cy, 0x9fc0ff, 14, 120);
          this.host.fx.shake(0.003, 100);
          for (const t of this.host.targets()) {
            if (!t.alive) continue;
            const r = t.hitRect(this.tmp);
            const nx = Math.max(r.left, Math.min(cx, r.right));
            const ny = Math.max(r.top, Math.min(cy, r.bottom));
            if (Math.hypot(nx - cx, ny - cy) <= sk.radius) this.host.damageTarget(t, sk.damage, cx);
          }
          this.player.playAction('skill', false);
        }
        break;
      }
    }
  }

  /**
   * 플레이어 피격. 실제로 받은 피해를 반환한다.
   * `attacker`가 있으면 완벽 막기 반격/가시 갑옷 반사 대상이 된다.
   */
  hurt(raw: number, sourceX: number, cause: string, attacker?: Hittable): number {
    if (this.invulnerable || this.hp <= 0) return 0;
    let factor = 1;
    const sk = this.role.skill;
    if (this.blocking && sk.kind === 'block') {
      const fromFront = (sourceX - this.player.x) * this.player.facing >= 0;
      if (fromFront) {
        if (this.now - this.blockStart <= sk.perfectWindow) {
          // 완벽 막기: 피해 없음 + 반격
          this.host.fx.ring(this.player.x + this.player.facing * 10, this.player.y, 14, 0xffffff);
          this.host.fx.hitstop(70);
          if (attacker) {
            this.host.damageTarget(attacker, sk.counterDamage, this.player.x);
            attacker.stun?.(0.6);
          }
          this.invulnUntil = this.now + 0.3;
          return 0;
        }
        factor = sk.frontDamageFactor;
      }
    }
    const dmg = incomingDamage(this.stats, raw, factor);
    this.hp -= dmg;
    this.invulnUntil = this.now + invulnTime(this.stats);
    this.host.fx.sound('sfx_hurt', 0.6);
    this.host.fx.shake(0.006, 140);
    this.host.fx.hitstop(60);
    this.host.fx.burst(this.player.x, this.player.y, 0xff5050, 8, 80);
    if (factor === 1) {
      const away = this.player.x >= sourceX ? 1 : -1;
      this.player.arcadeBody.setVelocity(away * COMBAT.player.knockbackX, -COMBAT.player.knockbackY);
      this.player.controlLockUntil = this.now + COMBAT.player.hurtLock;
      this.player.playAction('hurt', false);
    }
    if (attacker && this.stats.thorns > 0) this.host.damageTarget(attacker, thornsDamage(this.stats, dmg), this.player.x);
    if (this.hp <= 0) {
      this.hp = 0;
      this.host.onPlayerDeath(cause);
    }
    return dmg;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
  }
}
