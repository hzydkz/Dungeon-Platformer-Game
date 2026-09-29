import Phaser from 'phaser';

export interface ProjectileOptions {
  readonly owner: 'player' | 'enemy';
  readonly texture: string;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly damage: number;
  readonly lifetime: number;
  /** 관통 (맞춰도 사라지지 않음) */
  readonly pierce?: boolean;
  /** 명중/소멸 시 주변 피해 반경 */
  readonly splashRadius?: number;
  /** 유도 대상 (초당 회전 속도, rad/s) */
  readonly homing?: { target: Phaser.GameObjects.Components.Transform; turnRate: number };
  /** 벽을 통과 */
  readonly ghost?: boolean;
}

/** 플레이어/적 투사체. 중력 없음. */
export class Projectile extends Phaser.Physics.Arcade.Image {
  readonly owner: 'player' | 'enemy';
  readonly damage: number;
  readonly pierce: boolean;
  readonly splashRadius: number;
  readonly ghost: boolean;
  /** 관통 투사체가 이미 맞춘 대상 */
  readonly hitSet = new Set<unknown>();
  private life: number;
  private readonly homing?: ProjectileOptions['homing'];
  private readonly speed: number;

  constructor(scene: Phaser.Scene, o: ProjectileOptions) {
    super(scene, o.x, o.y, o.texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.owner = o.owner;
    this.damage = o.damage;
    this.pierce = o.pierce ?? false;
    this.splashRadius = o.splashRadius ?? 0;
    this.ghost = o.ghost ?? false;
    this.life = o.lifetime;
    this.homing = o.homing;
    this.speed = Math.hypot(o.vx, o.vy);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocity(o.vx, o.vy);
    this.setRotation(Math.atan2(o.vy, o.vx));
    this.setDepth(12);
  }

  tick(dt: number): void {
    this.life -= dt;
    if (this.life <= 0) {
      this.destroy();
      return;
    }
    if (this.homing) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      const want = Math.atan2(this.homing.target.y - this.y, this.homing.target.x - this.x);
      const cur = Math.atan2(body.velocity.y, body.velocity.x);
      const diff = Phaser.Math.Angle.Wrap(want - cur);
      const turn = Math.max(-this.homing.turnRate * dt, Math.min(this.homing.turnRate * dt, diff));
      const a = cur + turn;
      body.setVelocity(Math.cos(a) * this.speed, Math.sin(a) * this.speed);
      this.setRotation(a);
    }
  }
}
