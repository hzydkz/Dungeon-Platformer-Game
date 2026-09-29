import Phaser from 'phaser';
import {
  TILESET_SLOTS,
  type AssetManifest,
  type ImageEntry,
  type SpritesheetEntry,
  type TilesetEntry,
} from '../core/assets/manifest';

/**
 * 에셋 파일이 없을 때 단색 플레이스홀더 텍스처를 만든다 (기획서 3.1).
 * 스프라이트시트는 프레임마다 살짝 다른 모양(위아래 흔들림)을 넣어 애니메이션이 보이게 한다.
 */

function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) * amount);
  const g = clamp(((n >> 8) & 255) * amount);
  const b = clamp((n & 255) * amount);
  return `rgb(${r},${g},${b})`;
}

function makeSpritesheet(scene: Phaser.Scene, e: SpritesheetEntry): void {
  const { frameWidth: w, frameHeight: h, frameCount: n } = e;
  const tex = scene.textures.createCanvas(e.key, w * n, h);
  if (!tex) return;
  const ctx = tex.getContext();
  for (let i = 0; i < n; i++) {
    const ox = i * w;
    const bob = i % 2 === 1 ? 1 : 0;
    ctx.fillStyle = shade(e.color, 0.55);
    ctx.fillRect(ox, bob, w, h - bob);
    ctx.fillStyle = e.color;
    ctx.fillRect(ox + 1, bob + 1, w - 2, h - bob - 2);
    // 오른쪽을 바라보는 방향 표시 (눈)
    ctx.fillStyle = shade(e.color, 0.3);
    const eye = Math.max(1, Math.floor(Math.min(w, h) / 8));
    ctx.fillRect(ox + w - 2 - eye * 2, bob + Math.floor(h / 4), eye, eye);
    tex.add(i, 0, ox, 0, w, h);
  }
  tex.refresh();
}

function makeImage(scene: Phaser.Scene, e: ImageEntry): void {
  const tex = scene.textures.createCanvas(e.key, e.width, e.height);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.fillStyle = e.color;
  ctx.fillRect(0, 0, e.width, e.height);
  tex.refresh();
}

function makeTileset(scene: Phaser.Scene, e: TilesetEntry): void {
  const s = e.tileSize;
  const tex = scene.textures.createCanvas(e.key, s * (TILESET_SLOTS.length + 1), s);
  if (!tex) return;
  const ctx = tex.getContext();
  TILESET_SLOTS.forEach((slot, i) => {
    const ox = (i + 1) * s;
    const color = e.tiles[slot];
    switch (slot) {
      case 'oneway':
        ctx.fillStyle = color;
        ctx.fillRect(ox, 0, s, 4);
        ctx.fillStyle = shade(color, 0.6);
        ctx.fillRect(ox, 4, s, 1);
        break;
      case 'spike':
        ctx.fillStyle = color;
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.moveTo(ox + k * 4, s);
          ctx.lineTo(ox + k * 4 + 2, s - 8);
          ctx.lineTo(ox + k * 4 + 4, s);
          ctx.fill();
        }
        break;
      default:
        ctx.fillStyle = shade(color, 0.7);
        ctx.fillRect(ox, 0, s, s);
        ctx.fillStyle = color;
        ctx.fillRect(ox + 1, 1, s - 2, s - 2);
        if (slot === 'breakable') {
          ctx.fillStyle = shade(color, 0.5);
          ctx.fillRect(ox + 3, 7, 10, 1);
          ctx.fillRect(ox + 7, 3, 1, 10);
        }
    }
  });
  tex.refresh();
}

/** 텍스처가 없는 키에 대해 플레이스홀더를 만든다. 만든 키 목록을 반환. */
export function createMissingPlaceholders(scene: Phaser.Scene, m: AssetManifest): string[] {
  const made: string[] = [];
  for (const e of m.images) {
    if (!scene.textures.exists(e.key)) {
      makeImage(scene, e);
      made.push(e.key);
    }
  }
  for (const e of m.spritesheets) {
    if (!scene.textures.exists(e.key)) {
      makeSpritesheet(scene, e);
      made.push(e.key);
    }
  }
  for (const e of m.tilesets) {
    if (!scene.textures.exists(e.key)) {
      makeTileset(scene, e);
      made.push(e.key);
    }
  }
  return made;
}
