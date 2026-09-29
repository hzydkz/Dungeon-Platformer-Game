import { describe, expect, it } from 'vitest';
import { computeIntegerZoom } from '../src/core/display';

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
