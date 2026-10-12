import { describe, expect, it } from 'vitest';
import { computeVisible } from '../src/core/map/vision';
import { Tile, type TileGrid } from '../src/core/tiles';

function grid(rows: string[]): TileGrid {
  const width = rows[0]!.length;
  const tiles = new Uint8Array(width * rows.length);
  rows.forEach((r, y) => [...r].forEach((c, x) => (tiles[y * width + x] = c === '#' ? Tile.Wall : c === '=' ? Tile.OneWay : Tile.Empty)));
  return { width, height: rows.length, tiles };
}

function visibleSet(g: TileGrid, ox: number, oy: number, r: number): Set<string> {
  const out = new Set<string>();
  computeVisible(g, ox, oy, r, (i) => out.add(`${i % g.width},${Math.floor(i / g.width)}`));
  return out;
}

describe('시야 (섀도캐스팅)', () => {
  it('열린 공간에서는 반지름 안이 모두 보이고 밖은 안 보인다', () => {
    const g = grid(Array.from({ length: 21 }, () => '.'.repeat(21)));
    const v = visibleSet(g, 10, 10, 5);
    expect(v.has('10,10')).toBe(true);
    expect(v.has('15,10')).toBe(true);
    expect(v.has('10,5')).toBe(true);
    expect(v.has('14,13')).toBe(true);
    expect(v.has('16,10')).toBe(false);
    expect(v.has('15,15')).toBe(false);
  });

  it('벽 표면은 보이지만 벽 너머는 안 보인다', () => {
    const g = grid([
      '...........',
      '...........',
      '.....#.....',
      '.....#.....',
      '..@..#.....',
      '.....#.....',
      '.....#.....',
      '...........',
    ]);
    const v = visibleSet(g, 2, 4, 10);
    expect(v.has('5,4')).toBe(true);
    expect(v.has('6,4')).toBe(false);
    expect(v.has('9,4')).toBe(false);
    // 벽 위로 넘어가는 대각선은 보인다
    expect(v.has('6,0')).toBe(true);
  });

  it('단방향 발판은 시야를 가리지 않는다', () => {
    const g = grid(['.....', '.....', '=====', '.....', '.....']);
    expect(visibleSet(g, 2, 0, 6).has('2,4')).toBe(true);
  });

  it('닫힌 방 밖은 보이지 않는다', () => {
    const g = grid(['#######......', '#.....#......', '#.....#......', '#######......']);
    const v = visibleSet(g, 2, 1, 20);
    for (const k of v) expect(Number(k.split(',')[0])).toBeLessThanOrEqual(6);
  });
});
