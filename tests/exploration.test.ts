import { describe, expect, it } from 'vitest';
import { ROOM } from '../src/config/generation';
import { generateFloor } from '../src/core/generation/floor';
import { Exploration } from '../src/core/map/exploration';

describe('지도 공개 (기획자 요청: 본 칸만)', () => {
  const f = generateFloor({ runSeed: 42, floor: 2, kind: 'floor', reachCheck: false });
  const L = f.layout;

  it('처음에는 보스방만 표시되고 본 칸은 없다', () => {
    const ex = new Exploration(L);
    const shown = L.rooms.filter((r) => ex.isShown(r.index, true)).map((r) => r.index);
    expect(shown).toEqual([L.boss]);
    expect(ex.width).toBe(f.grid.width);
    expect(ex.height).toBe(f.grid.height);
    expect(ex.seen.every((v) => v === 0)).toBe(true);
  });

  it('방에 들어가도 그 방 전체가 공개되지는 않는다 (본 칸만 공개)', () => {
    const ex = new Exploration(L);
    expect(ex.enter(L.entrance)).toBe(true);
    expect(ex.enter(L.entrance)).toBe(false);
    expect(ex.isShown(L.entrance, true)).toBe(false);
    const r = L.rooms[L.entrance]!;
    const x = r.x * ROOM.widthTiles + 3;
    const y = r.y * ROOM.heightTiles + 3;
    expect(ex.markSeen(y * ex.width + x)).toBe(true);
    expect(ex.markSeen(y * ex.width + x)).toBe(false);
    expect(ex.isSeen(x, y)).toBe(true);
    expect(ex.isSeen(x + 1, y)).toBe(false);
    expect(ex.isShown(L.entrance, true)).toBe(true);
  });

  it('인접 공개 옵션(신중)이면 연결된 방 전체를 본 것으로 한다', () => {
    const ex = new Exploration(L);
    ex.enter(L.entrance, true);
    for (const n of ex.neighbors(L.entrance)) {
      expect(ex.isShown(n, true)).toBe(true);
      const r = L.rooms[n]!;
      expect(ex.isSeen(r.x * ROOM.widthTiles, r.y * ROOM.heightTiles)).toBe(true);
    }
  });

  it('본 칸이 늘면 version이 오른다', () => {
    const ex = new Exploration(L);
    const v = ex.version;
    ex.revealAll();
    expect(ex.version).toBeGreaterThan(v);
    expect(ex.isSeen(f.exitPortal!.x, f.exitPortal!.y)).toBe(true);
  });
});
