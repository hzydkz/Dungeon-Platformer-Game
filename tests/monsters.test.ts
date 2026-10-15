import { describe, expect, it } from 'vitest';
import { MONSTER_SPAWN } from '../src/config/generation';
import { generateFloor } from '../src/core/generation/floor';
import { loadLibrary } from '../src/core/generation/templateLibrary';
import { Tile, getTile, isHazardTile } from '../src/core/tiles';
import { MONSTER_WEIGHTS, monsterById } from '../src/data/monsters';

describe('몬스터 배치 (기획자 요청: 메이플식, 막힌 블록 위에만)', () => {
  const floors = Array.from({ length: 27 }, (_, s) => generateFloor({ runSeed: s * 13 + 5, floor: (s % 9) + 1, kind: 'floor', reachCheck: false }));

  it('모든 몬스터는 벽(막힌 블록) 바로 위 빈칸에, 위로 한 칸 더 비어 있고, 가시 옆이 아니다', () => {
    for (const f of floors) {
      for (const m of f.monsters) {
        expect(getTile(f.grid, m.x, m.y + 1)).toBe(Tile.Wall);
        expect(getTile(f.grid, m.x, m.y)).toBe(Tile.Empty);
        expect(getTile(f.grid, m.x, m.y - 1)).toBe(Tile.Empty);
        expect(isHazardTile(getTile(f.grid, m.x - 1, m.y)) || isHazardTile(getTile(f.grid, m.x + 1, m.y))).toBe(false);
      }
    }
  });

  it('방마다 여러 마리, 서로 떨어져 있고, 입구 방/아레나에는 없다', () => {
    let rooms = 0;
    let total = 0;
    for (const f of floors) {
      const by = new Map<number, typeof f.monsters>();
      for (const m of f.monsters) by.set(m.room, [...(by.get(m.room) ?? []), m]);
      expect(by.has(f.layout.entrance)).toBe(false);
      expect(by.has(f.layout.boss)).toBe(false);
      const [, hi] = MONSTER_SPAWN.perRoom[f.floor - 1]!;
      for (const [r, list] of by) {
        const lr = f.layout.rooms[r]!;
        expect(list.length).toBeLessThanOrEqual(Math.round(hi * Math.min(MONSTER_SPAWN.maxCellMultiplier, lr.w * lr.h) * 1.7));
        for (let i = 0; i < list.length; i++)
          for (let j = i + 1; j < list.length; j++) {
            const a = list[i]!;
            const b = list[j]!;
            expect(Math.abs(a.x - b.x) >= MONSTER_SPAWN.spacingX || (a.y !== b.y && Math.abs(a.y - b.y) >= MONSTER_SPAWN.spacingY)).toBe(true);
          }
        rooms++;
        total += list.length;
      }
    }
    expect(total / rooms).toBeGreaterThanOrEqual(2.5);
  });

  it('일반 몬스터는 걷는 형만 나온다', () => {
    for (const table of Object.values(MONSTER_WEIGHTS)) for (const id of Object.keys(table)) expect(monsterById(id).behavior).toBe('walker');
  });

  it('방 템플릿에는 몬스터 표식(M)이 없다 (층 생성 때 놓는다)', () => {
    for (const list of loadLibrary().byShape.values()) for (const t of list) expect(t.rows.some((r) => r.includes('M')), t.id).toBe(false);
  });
});
