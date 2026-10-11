import { describe, expect, it } from 'vitest';
import { computeIntegerZoom, computeView } from '../src/core/display';

describe('computeIntegerZoom', () => {
  it('창에 들어가는 최대 정수배', () => {
    expect(computeIntegerZoom(1920, 1080, 480, 270)).toBe(4);
    expect(computeIntegerZoom(1919, 1080, 480, 270)).toBe(3);
    expect(computeIntegerZoom(2560, 1080, 480, 270)).toBe(4);
    expect(computeIntegerZoom(1366, 768, 480, 270)).toBe(2);
  });

  it('창이 내부 해상도보다 작아도 최소 1배', () => {
    expect(computeIntegerZoom(300, 200, 480, 270)).toBe(1);
    expect(computeIntegerZoom(0, 0, 480, 270)).toBe(1);
  });
});

describe('computeView', () => {
  const v = (w: number, h: number) => computeView(w, h, 480, 270, 640, 360);

  it('16:9 창은 기준 해상도 그대로, 창에 꽉 차게', () => {
    expect(v(1920, 1080)).toEqual({ width: 480, height: 270, zoom: 4 });
    expect(v(1000, 562.5).zoom).toBeCloseTo(1000 / 480);
  });

  it('가로가 넓은 창은 가로로 넓게 본다', () => {
    const r = v(2000, 1050);
    expect(r.height).toBe(270);
    expect(r.width).toBeGreaterThan(480);
    expect(r.width * r.zoom).toBeCloseTo(2000, -1);
    expect(r.height * r.zoom).toBeCloseTo(1050, 0);
  });

  it('4:3(아이패드 가로)은 세로로 넓게 본다', () => {
    const r = v(1024, 768);
    expect(r).toMatchObject({ width: 480, height: 360 });
    expect(r.zoom).toBeCloseTo(1024 / 480);
  });

  it('최대 범위를 넘는 비율은 최대값에서 멈추고 창 안에 들어간다', () => {
    const tall = v(800, 1600);
    expect(tall.height).toBe(360);
    expect(tall.width * tall.zoom).toBeLessThanOrEqual(800 + 1e-6);
    const wide = v(3000, 600);
    expect(wide.width).toBe(640);
    expect(wide.height * wide.zoom).toBeLessThanOrEqual(600 + 1e-6);
  });

  it('창 크기가 0이면 기준 해상도', () => {
    expect(v(0, 0)).toEqual({ width: 480, height: 270, zoom: 1 });
  });
});
