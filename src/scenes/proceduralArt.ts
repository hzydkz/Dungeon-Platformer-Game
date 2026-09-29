/**
 * 배경/전경 플레이스홀더 절차 생성 (기획서 3.2). 에셋 파일이 없을 때만 쓴다.
 * 모든 모양은 키에서 만든 시드로 결정적으로 그린다 (Math.random 금지).
 * 가로로 반복(타일링)되도록 가장자리를 넘는 모양은 반대편에도 그린다.
 */
import type { BgLayer, ThemeId } from '../assets/keys';
import { themeById } from '../config/themes';
import { Rng, deriveSeed } from '../core/rng';

type Ctx = CanvasRenderingContext2D;

function wrapDraw(w: number, draw: (dx: number) => void): void {
  for (const dx of [-w, 0, w]) draw(dx);
}

function stalactites(ctx: Ctx, rng: Rng, w: number, h: number, color: string, count: number, maxLen: number, fromTop: boolean): void {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = rng.float(0, w);
    const bw = rng.float(10, 40);
    const len = rng.float(maxLen * 0.3, maxLen);
    wrapDraw(w, (dx) => {
      ctx.beginPath();
      if (fromTop) {
        ctx.moveTo(x + dx - bw / 2, 0);
        ctx.lineTo(x + dx + bw / 2, 0);
        ctx.lineTo(x + dx + rng.float(-3, 3), len);
      } else {
        ctx.moveTo(x + dx - bw / 2, h);
        ctx.lineTo(x + dx + bw / 2, h);
        ctx.lineTo(x + dx, h - len);
      }
      ctx.fill();
    });
  }
}

function mounds(ctx: Ctx, rng: Rng, w: number, h: number, color: string, baseY: number, amp: number): void {
  ctx.fillStyle = color;
  const pts: [number, number][] = [];
  const steps = 16;
  const phase = rng.float(0, Math.PI * 2);
  const phase2 = rng.float(0, Math.PI * 2);
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w;
    // 가로로 이어지도록 주기 함수
    const y = baseY - amp * (0.6 * Math.sin((i / steps) * Math.PI * 2 + phase) + 0.4 * Math.sin((i / steps) * Math.PI * 6 + phase2));
    pts.push([x, y]);
  }
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

function pillars(ctx: Ctx, rng: Rng, w: number, h: number, color: string, count: number, minH: number, maxH: number): void {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = rng.float(0, w);
    const pw = rng.float(12, 26);
    const ph = rng.float(minH, maxH);
    const broken = rng.float(0, 8);
    wrapDraw(w, (dx) => {
      ctx.fillRect(x + dx, h - ph, pw, ph);
      ctx.fillRect(x + dx - 3, h - ph - 4, pw + 6, 5);
      ctx.clearRect(x + dx + pw * 0.6, h - ph - 4, pw * 0.5, broken);
    });
  }
}

function islands(ctx: Ctx, rng: Rng, w: number, h: number, color: string, count: number): void {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = rng.float(0, w);
    const y = rng.float(h * 0.2, h * 0.7);
    const iw = rng.float(30, 80);
    wrapDraw(w, (dx) => {
      ctx.beginPath();
      ctx.moveTo(x + dx - iw / 2, y);
      ctx.lineTo(x + dx + iw / 2, y);
      ctx.lineTo(x + dx + iw * 0.15, y + iw * 0.6);
      ctx.lineTo(x + dx - iw * 0.2, y + iw * 0.45);
      ctx.closePath();
      ctx.fill();
    });
  }
}

function dots(ctx: Ctx, rng: Rng, w: number, h: number, color: string, count: number, alpha: number): void {
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    const s = rng.chance(0.2) ? 2 : 1;
    ctx.fillRect(Math.floor(rng.float(0, w)), Math.floor(rng.float(0, h)), s, s);
  }
  ctx.globalAlpha = 1;
}

/** 배경 레이어 (far/mid/near) */
export function drawBackground(ctx: Ctx, theme: ThemeId, layer: BgLayer, w: number, h: number): void {
  const p = themeById(theme).palette;
  const rng = new Rng(deriveSeed(theme, layer, 'bg'));
  if (layer === 'far') {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, p.skyTop);
    g.addColorStop(1, p.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    dots(ctx, rng, w, h, p.accent, theme === 'abyss' ? 90 : 30, 0.35);
    if (theme === 'cave') {
      stalactites(ctx, rng, w, h, p.far, 14, 90, true);
      mounds(ctx, rng, w, h, p.far, h * 0.82, 18);
    } else if (theme === 'ruins') {
      pillars(ctx, rng, w, h, p.far, 7, 90, 170);
      mounds(ctx, rng, w, h, p.far, h * 0.9, 8);
    } else {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(w * 0.7, h * 0.3, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      islands(ctx, rng, w, h, p.far, 6);
    }
  } else if (layer === 'mid') {
    if (theme === 'cave') {
      stalactites(ctx, rng, w, h, p.mid, 9, 70, true);
      mounds(ctx, rng, w, h, p.mid, h * 0.88, 26);
    } else if (theme === 'ruins') {
      pillars(ctx, rng, w, h, p.mid, 5, 60, 130);
    } else {
      islands(ctx, rng, w, h, p.mid, 5);
    }
  } else {
    if (theme === 'cave') {
      stalactites(ctx, rng, w, h, p.near, 6, 50, true);
      stalactites(ctx, rng, w, h, p.near, 6, 40, false);
    } else if (theme === 'ruins') {
      pillars(ctx, rng, w, h, p.near, 3, 40, 80);
      stalactites(ctx, rng, w, h, p.near, 5, 30, true);
    } else {
      islands(ctx, rng, w, h, p.near, 3);
      stalactites(ctx, rng, w, h, p.near, 5, 30, false);
    }
  }
}

/** 전경 장식 (플레이어 앞): 덩굴, 먼지 띠, 안개 */
export function drawForeground(ctx: Ctx, theme: ThemeId, w: number, h: number): void {
  const p = themeById(theme).palette;
  const rng = new Rng(deriveSeed(theme, 'fg'));
  if (theme === 'cave') {
    ctx.strokeStyle = p.near;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const x = rng.float(0, w);
      const len = rng.float(20, 60);
      wrapDraw(w, (dx) => {
        ctx.beginPath();
        ctx.moveTo(x + dx, 0);
        ctx.quadraticCurveTo(x + dx + 8, len / 2, x + dx - 2, len);
        ctx.stroke();
      });
    }
  }
  const g = ctx.createLinearGradient(0, h * 0.7, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, theme === 'abyss' ? 'rgba(60,40,140,0.25)' : 'rgba(120,110,140,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, h * 0.7, w, h * 0.3);
}
