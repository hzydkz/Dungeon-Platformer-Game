import Phaser from 'phaser';
import { AssetKey } from '../assets/keys';

/**
 * 연출 훅 (기획서 3.2, M8): 피격 불꽃, 화면 흔들림, 히트스톱, 파티클, 사운드.
 * 에셋이 없어도 동작하도록 플레이스홀더 파티클과 무음 처리.
 */
export class Effects {
  private hitstopUntil = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  /** 히트스톱 중인지 (씬이 물리/로직 갱신을 건너뛴다) */
  get frozen(): boolean {
    return this.scene.time.now < this.hitstopUntil;
  }

  hitstop(ms: number): void {
    this.hitstopUntil = Math.max(this.hitstopUntil, this.scene.time.now + ms);
  }

  shake(intensity = 0.004, ms = 120): void {
    this.scene.cameras.main.shake(ms, intensity);
  }

  burst(x: number, y: number, color: number, count = 8, speed = 90): void {
    const emitter = this.scene.add.particles(x, y, AssetKey.particle, {
      speed: { min: speed * 0.4, max: speed },
      angle: { min: 0, max: 360 },
      lifespan: { min: 180, max: 380 },
      scale: { start: 1, end: 0 },
      tint: color,
      quantity: count,
      emitting: false,
    });
    emitter.setDepth(30);
    emitter.explode(count);
    this.scene.time.delayedCall(500, () => emitter.destroy());
  }

  hitSpark(x: number, y: number): void {
    this.burst(x, y, 0xffffff, 6, 110);
  }

  slash(x: number, y: number, angle: number, flip: boolean): void {
    const s = this.scene.add.sprite(x, y, AssetKey.slash, 0).setDepth(20).setAlpha(0.8).setRotation(angle).setFlipY(flip);
    const anim = `${AssetKey.slash}_play`;
    if (this.scene.anims.exists(anim)) {
      s.play(anim);
      s.once('animationcomplete', () => s.destroy());
    } else {
      this.scene.time.delayedCall(100, () => s.destroy());
    }
  }

  ring(x: number, y: number, radius: number, color: number): void {
    const g = this.scene.add.circle(x, y, radius, color, 0.35).setDepth(20).setStrokeStyle(1, color, 0.9);
    this.scene.tweens.add({ targets: g, alpha: 0, scale: 1.2, duration: 220, onComplete: () => g.destroy() });
  }

  sound(key: string, volume = 0.5): void {
    if (this.scene.cache.audio.exists(key)) this.scene.sound.play(key, { volume });
  }

  /** 배경음 교체 (파일이 없으면 무음). 같은 곡이면 그대로 둔다 */
  music(key: string, volume = 0.35): void {
    const sm = this.scene.sound;
    const current = sm.getAllPlaying().find((s) => s.key.startsWith('bgm_'));
    if (current?.key === key) return;
    current?.stop();
    if (!this.scene.cache.audio.exists(key)) return;
    sm.play(key, { loop: true, volume });
  }
}
