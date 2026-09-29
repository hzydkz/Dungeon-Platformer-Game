import { describe, expect, it } from 'vitest';
import { LAYOUT, RED_LAYOUT } from '../src/config/generation';
import { generateFloor, validateFloor, type GeneratedFloor } from '../src/core/generation/floor';
import { REACH_PARAMS } from '../src/core/generation/params';
import { buildReachGraph, reachableFrom } from '../src/core/generation/reach';

const gen = (runSeed: number, floor: number, kind: 'floor' | 'red' = 'floor') => generateFloor({ runSeed, floor, kind });

describe('층 생성 재현성', () => {
  it('같은 시드와 층은 항상 같은 맵', () => {
    for (const s of [1, 12345, 0xdeadbeef]) {
      const a = gen(s, 3);
      const b = gen(s, 3);
      expect(Array.from(a.grid.tiles)).toEqual(Array.from(b.grid.tiles));
      expect(a.rooms.map((r) => r.templateId)).toEqual(b.rooms.map((r) => r.templateId));
      expect([a.entrance, a.exitPortal, a.redPortal, a.monsters, a.chests]).toEqual([b.entrance, b.exitPortal, b.redPortal, b.monsters, b.chests]);
    }
  });

  it('다른 시드, 다른 층, 빨간 던전은 서로 다른 맵', () => {
    const a = gen(1, 3);
    expect(Array.from(gen(2, 3).grid.tiles)).not.toEqual(Array.from(a.grid.tiles));
    expect(Array.from(gen(1, 4).grid.tiles)).not.toEqual(Array.from(a.grid.tiles));
    expect(gen(1, 3, 'red').grid.width).not.toBe(a.grid.width);
  });
});

describe('시드 1,000개 생성 (기획서 5.4)', () => {
  it('모든 시드에서 층 검증 통과 (실패율 0%)', () => {
    let retries = 0;
    const failures: string[] = [];
    for (let s = 0; s < 1000; s++) {
      const floor = (s % 9) + 1;
      try {
        const f = gen(s * 7919 + 13, floor);
        retries += f.attempts - 1;
        const errs = validateFloor(f);
        if (errs.length) failures.push(`${s}: ${errs.join(', ')}`);
      } catch (e) {
        failures.push(`${s}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
    // 재생성은 드물어야 한다 (참고용 상한)
    expect(retries).toBeLessThan(1500);
    console.info(`재생성 횟수: ${retries} / 1000`);
  }, 120_000);

  it('빨간 던전 300개: 방 6~10개 + 보스 아레나, 보스는 먼 곳', () => {
    for (let s = 0; s < 300; s++) {
      const f = gen(s, (s % 9) + 1, 'red');
      const normal = f.layout.rooms.filter((r) => !r.arena).length;
      expect(normal).toBeGreaterThanOrEqual(RED_LAYOUT.roomCount[0]);
      expect(normal).toBeLessThanOrEqual(RED_LAYOUT.roomCount[1]);
      expect(f.exitPortal).toBeNull();
      expect(f.redPortal).toBeNull();
    }
  }, 60_000);
});

describe('특수 방 배치 (기획서 5.5)', () => {
  const floors: GeneratedFloor[] = [];
  for (let s = 0; s < 150; s++) floors.push(gen(s, (s % 8) + 1));

  it('입구는 그리드 중앙', () => {
    for (const f of floors) {
      const [x, y] = f.layout.rooms[f.layout.entrance]!.cells[0]!;
      expect([x, y]).toEqual([Math.floor(f.layout.gridW / 2), Math.floor(f.layout.gridH / 2)]);
    }
  });

  it('출구 포탈은 BFS 거리 상위 20% 방', () => {
    for (const f of floors) {
      const L = f.layout;
      const normal = L.rooms.filter((r) => !r.arena && r.index !== L.entrance).map((r) => L.dist[r.index]!);
      normal.sort((a, b) => b - a);
      const topN = Math.max(1, Math.ceil(normal.length * LAYOUT.exitTopFraction));
      expect(L.dist[L.exit]!).toBeGreaterThanOrEqual(normal[topN - 1]!);
    }
  });

  it('보스방은 대부분 BFS 거리 40~80% 구간, 출구와 다른 방', () => {
    let inRange = 0;
    for (const f of floors) {
      const L = f.layout;
      const total = Math.max(...L.dist.filter((_, i) => i !== L.boss)) + 1;
      const d = L.dist[L.boss]!;
      if (d >= LAYOUT.bossDistanceRange[0] * total && d <= LAYOUT.bossDistanceRange[1] * total) inRange++;
      expect(L.boss).not.toBe(L.exit);
      expect(L.rooms[L.boss]!.arena).toBe(true);
    }
    expect(inRange / floors.length).toBeGreaterThan(0.97);
  });

  it('빨간 포탈: 1층과 9층에는 없고, 다른 층에는 가끔 생긴다', () => {
    let count = 0;
    for (let s = 0; s < 200; s++) {
      expect(gen(s, 1).redPortal).toBeNull();
      expect(gen(s, 9).redPortal).toBeNull();
      if (gen(s, 5).redPortal) count++;
    }
    expect(count).toBeGreaterThan(20);
    expect(count).toBeLessThan(90);
  }, 60_000);

  it('9층에는 출구 포탈이 없다', () => {
    expect(gen(3, 9).exitPortal).toBeNull();
  });
});

describe('층 전체 타일 도달성 (방 그래프에 의존하지 않는 종단 검증)', () => {
  for (const [seed, floor] of [
    [11, 1],
    [22, 5],
  ] as const) {
    it(`시드 ${seed}, ${floor}층: 입구에서 출구/보스/빨간 포탈 도달 가능`, () => {
      const f = gen(seed, floor);
      const g = buildReachGraph(f.grid, REACH_PARAMS);
      const cell = (p: { x: number; y: number }) => p.y * f.grid.width + p.x;
      const r = reachableFrom(g, [cell(f.entrance)]);
      const has = (p: { x: number; y: number }) => r.has(g.nodeOf[cell(p)] as number);
      if (f.exitPortal) expect(has(f.exitPortal)).toBe(true);
      if (f.redPortal) expect(has(f.redPortal)).toBe(true);
      expect(has(f.boss.spawn)).toBe(true);
    }, 60_000);
  }
});
