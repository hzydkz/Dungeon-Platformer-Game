import Phaser from 'phaser';
import { AssetKey, type BgLayer } from '../assets/keys';
import { DISPLAY } from '../config/display';
import type { ThemeDef } from '../config/themes';

/** 시차 배율 (카메라 이동 대비 배경 이동) */
const PARALLAX: Readonly<Record<BgLayer, number>> = { far: 0.08, mid: 0.25, near: 0.55 };
const FOREGROUND_PARALLAX = 1.25;

/**
 * 층 테마 연출 (기획서 3.2): 시차 배경 3겹(원경/중경/근경), 전경 장식(플레이어 앞), 환경 파티클.
 * 모두 화면 고정 TileSprite로 두고 카메라 위치에 비례해 무늬를 움직인다.
 */
export class Scenery {
  private readonly layers: { sprite: Phaser.GameObjects.TileSprite; factor: number }[] = [];
  private readonly fg: Phaser.GameObjects.TileSprite;

  constructor(
    private readonly scene: Phaser.Scene,
    theme: ThemeDef,
  ) {
    const w = DISPLAY.width;
    const h = DISPLAY.height;
    (['far', 'mid', 'near'] as const).forEach((layer, i) => {
      const sprite = scene.add.tileSprite(0, 0, w, h, AssetKey.bg(theme.id, layer)).setOrigin(0, 0).setScrollFactor(0).setDepth(-30 + i * 5);
      this.layers.push({ sprite, factor: PARALLAX[layer] });
    });
    this.fg = scene.add.tileSprite(0, 0, w, h, AssetKey.fg(theme.id)).setOrigin(0, 0).setScrollFactor(0).setDepth(40).setAlpha(0.7);

    // 환경 파티클 (먼지, 포자): 화면 공간에서 천천히 떠다닌다
    const a = theme.ambient;
    scene.add
      .particles(0, 0, AssetKey.particle, {
        x: { min: 0, max: w },
        y: { min: 0, max: h },
        lifespan: { min: 4000, max: 8000 },
        speedX: { min: -a.speed, max: a.speed },
        speedY: { min: -a.speed * 0.6, max: a.speed * 0.3 },
        scale: { min: 0.25, max: 0.6 },
        alpha: { start: 0, end: 0, ease: (t: number) => Math.sin(t * Math.PI) * 0.8 } as never,
        tint: a.color,
        frequency: 8000 / a.count,
        maxAliveParticles: a.count,
      })
      .setScrollFactor(0)
      .setDepth(-5);
  }

  update(): void {
    const cam = this.scene.cameras.main;
    for (const l of this.layers) l.sprite.tilePositionX = cam.scrollX * l.factor;
    this.fg.tilePositionX = cam.scrollX * FOREGROUND_PARALLAX;
  }
}

/** 화면 가장자리를 어둡게 하는 비네트 (조명 구조 대용, Light2D는 선택 사항) */
export function addVignette(scene: Phaser.Scene, key = 'fx_vignette'): Phaser.GameObjects.Image {
  const w = DISPLAY.width;
  const h = DISPLAY.height;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, w, h);
    if (tex) {
      const ctx = tex.getContext();
      const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.95);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      tex.refresh();
    }
  }
  return scene.add.image(0, 0, key).setOrigin(0, 0).setScrollFactor(0);
}
