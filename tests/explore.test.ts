import { describe, expect, it } from 'vitest';
import { EXPLORE } from '../src/config/generation';
import { generateFloor, type GeneratedFloor } from '../src/core/generation/floor';
import { REACH_PARAMS } from '../src/core/generation/params';
import { buildReachGraph, canReach, reachableFrom } from '../src/core/generation/reach';
import { isStandable } from '../src/core/generation/reach';
import { Tile, getTile, setTile, type TileGrid } from '../src/core/tiles';

const gen = (runSeed: number, floor: number) => generateFloor({ runSeed, floor, kind: 'floor', reachCheck: false });

describe('탐사 요소 배치 (지름길, 잠긴 방, 숨은 방, 구역)', () => {
  const floors: GeneratedFloor[] = [];
  for (let s = 0; s < 80; s++) floors.push(gen(s * 37 + 11, (s % 9) + 1));

  it('대부분의 층에 지름길, 잠긴 방, 구역이 있고 숨은 방도 자주 나온다', () => {
    const count = (p: (f: GeneratedFloor) => boolean) => floors.filter(p).length / floors.length;
    expect(count((f) => f.specialDoors.some((d) => d.kind === 'gate'))).toBeGreaterThan(0.7);
    expect(count((f) => f.vault !== null)).toBeGreaterThan(0.6);
    expect(count((f) => f.hiddenRoom >= 0)).toBeGreaterThan(0.3);
    expect(count((f) => f.zones.length > 0)).toBeGreaterThan(0.7);
  });

  it('지름길 문: 좌우 연결, 문 타일이 Gate, 레버는 입구에서 더 먼 쪽 방에서 서 있을 수 있는 칸', () => {
    for (const f of floors) {
      for (const d of f.specialDoors.filter((x) => x.kind === 'gate')) {
        const l = f.layout.links[d.link]!;
        expect(l.kind).toBe('gate');
        expect(['left', 'right']).toContain(l.dir);
        for (const t of d.tiles) expect(getTile(f.grid, t.x, t.y)).toBe(Tile.Gate);
        const other = d.openRoom === l.a ? l.b : l.a;
        expect(f.layout.dist[d.openRoom!]!).toBeGreaterThan(f.layout.dist[other]!);
        expect(isStandable(f.grid, d.lever!.x, d.lever!.y)).toBe(true);
        expect(f.layout.rooms[f.layout.cellRoom[Math.floor(d.lever!.y / 17) * f.layout.gridW + Math.floor(d.lever!.x / 30)]!]!.index).toBe(d.openRoom);
      }
    }
  });

  it('잠긴 방: 막다른 방, 문은 Lock, 안의 상자는 잠김 표시, 몬스터 없음, 열쇠는 다른 방', () => {
    for (const f of floors) {
      if (!f.vault) continue;
      const v = f.vault.room;
      const links = f.layout.links.filter((l) => l.a === v || l.b === v);
      expect(links).toHaveLength(1);
      expect(links[0]!.kind).toBe('lock');
      const door = f.specialDoors.find((d) => d.kind === 'lock')!;
      for (const t of door.tiles) expect(getTile(f.grid, t.x, t.y)).toBe(Tile.Lock);
      expect(f.monsters.some((m) => m.room === v)).toBe(false);
      for (const c of f.chests.filter((x) => x.room === v)) expect(c.locked).toBe(true);
      expect(f.key).not.toBeNull();
      expect(f.key!.room).not.toBe(v);
      expect(f.key!.room).not.toBe(f.hiddenRoom);
    }
  });

  it('숨은 방: 막다른 방, 입구는 부서지는 벽, 상자는 숨김, 몬스터 없음', () => {
    for (const f of floors) {
      if (f.hiddenRoom < 0) continue;
      const h = f.hiddenRoom;
      const links = f.layout.links.filter((l) => l.a === h || l.b === h);
      expect(links).toHaveLength(1);
      expect(links[0]!.kind).toBe('secret');
      const door = f.specialDoors.find((d) => d.kind === 'secret')!;
      for (const t of door.tiles) expect(getTile(f.grid, t.x, t.y)).toBe(Tile.Breakable);
      expect(f.monsters.some((m) => m.room === h)).toBe(false);
      for (const c of f.chests.filter((x) => x.room === h)) expect(c.secret).toBe(true);
    }
  });

  it('구역: 크기 범위 안의 이어진 일반 방들, 입구/출구/보스/잠긴 방/숨은 방 제외', () => {
    for (const f of floors) {
      expect(f.zones.length).toBeLessThanOrEqual(EXPLORE.zones[f.floor - 1]!);
      for (const z of f.zones) {
        expect(z.rooms.length).toBeGreaterThanOrEqual(1);
        expect(z.rooms.length).toBeLessThanOrEqual(EXPLORE.zoneSize[1]);
        const L = f.layout;
        for (const r of z.rooms) {
          expect([L.entrance, L.exit, L.red, L.boss, L.bossGate, f.vault?.room, f.hiddenRoom]).not.toContain(r);
        }
      }
    }
    expect(gen(5, 1).zones).toHaveLength(0);
  });

  it('빨간 던전에는 탐사 요소가 없다', () => {
    const r = generateFloor({ runSeed: 3, floor: 4, kind: 'red', reachCheck: false });
    expect([r.specialDoors.length, r.vault, r.key, r.hiddenRoom, r.zones.length]).toEqual([0, null, null, -1, 0]);
  });
});

/** 특별한 문을 모두 연 격자 (열쇠/레버/비밀 벽을 모두 쓴 상태) */
function opened(f: GeneratedFloor): TileGrid {
  const g: TileGrid = { width: f.grid.width, height: f.grid.height, tiles: new Uint8Array(f.grid.tiles) };
  for (const d of f.specialDoors) for (const t of d.tiles) setTile(g, t.x, t.y, Tile.Empty);
  return g;
}

describe('탐사 요소 도달성 (게임과 같은 이동 시뮬레이션)', () => {
  for (const [seed, floor] of [
    [101, 3],
    [202, 6],
    [303, 8],
  ] as const) {
    it(`시드 ${seed}, ${floor}층: 문을 모두 열면 보물 상자/숨은 방 상자에 가고 돌아올 수 있다`, () => {
      const f = generateFloor({ runSeed: seed, floor, kind: 'floor' });
      const grid = opened(f);
      const g = buildReachGraph(grid, REACH_PARAMS);
      const cell = (p: { x: number; y: number }) => p.y * grid.width + p.x;
      const reach = reachableFrom(g, [cell(f.entrance)]);
      const back = canReach(g, [cell(f.entrance)]);
      const has = (p: { x: number; y: number }) => reach.has(g.nodeOf[cell(p)] as number);
      if (f.vault) expect(has(f.vault.chest)).toBe(true);
      for (const c of f.chests.filter((x) => x.room === f.hiddenRoom)) expect(has(c)).toBe(true);
      for (const n of reach) expect(back.has(n)).toBe(true);
    }, 60_000);
  }
});
