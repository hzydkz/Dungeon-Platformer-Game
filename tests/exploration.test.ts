import { describe, expect, it } from 'vitest';
import { generateFloor } from '../src/core/generation/floor';
import { Exploration } from '../src/core/map/exploration';

describe('지도 공개 (기획서 6장)', () => {
  const f = generateFloor({ runSeed: 42, floor: 2, kind: 'floor' });
  const L = f.layout;

  it('처음에는 보스방만 보인다', () => {
    const ex = new Exploration(L);
    const shown = L.rooms.filter((r) => ex.isShown(r.index, true)).map((r) => r.index);
    expect(shown).toEqual([L.boss]);
  });

  it('방에 들어가면 그 방이 공개되고 인접 방은 공개되지 않는다', () => {
    const ex = new Exploration(L);
    expect(ex.enter(L.entrance)).toBe(true);
    expect(ex.enter(L.entrance)).toBe(false);
    expect(ex.isShown(L.entrance, true)).toBe(true);
    for (const n of ex.neighbors(L.entrance)) if (n !== L.boss) expect(ex.isShown(n, true)).toBe(false);
  });

  it('인접 공개 옵션이면 연결된 방도 공개된다', () => {
    const ex = new Exploration(L);
    ex.enter(L.entrance, true);
    for (const n of ex.neighbors(L.entrance)) expect(ex.isShown(n, true)).toBe(true);
  });
});
