/**
 * 템플릿 단위 도달성 검증 (기획서 5.4).
 *
 * 템플릿의 모든 출입구를 열고, 출입구마다 따로 떨어진 표준 이웃 공간(스텁)을 붙여 이동 그래프를 만든 뒤 확인한다:
 * 1. 모든 출입구 쌍이 서로 도달 가능 (스텁 ↔ 스텁). 스텁끼리는 이어져 있지 않으므로 방 안을 지나야 한다
 * 2. 포탈 후보(P)와 상자(C)가 출입구에서 도달 가능
 * 3. 출입구에서 도달 가능한 모든 칸에서 다시 출입구로 돌아갈 수 있다 (빠지면 못 나오는 구덩이 없음)
 * 4. 비밀 상자(c)는 비밀 벽을 부순 상태에서 도달 가능
 * 선택적 발판(o) 켜짐/꺼짐, 함정(t) 켜짐/꺼짐 조합을 모두 검사한다.
 *
 * 층에서는 출입구 일부만 열리지만(나머지는 벽), 모든 출입구 쌍이 이어져 있으므로 어떤 조합이든 열린 출입구끼리 이어진다.
 * 출입구 자리가 규격화되어 있으므로, 템플릿이 모두 통과하면 규격대로 이어 붙인 층도 방 사이 이동이 보장된다.
 * (층을 만들 때 방 경계를 넓게 트는 경우는 층 전체 검증(floorReach)이 따로 확인한다)
 */
import { DOOR, ROOM, type SideSlot, type VerticalSlot } from '../../config/generation';
import { Tile, createGrid, getTile, setTile, type TileGrid } from '../tiles';
import { capKey, isSideDir, resolveTemplate, templateHas, type DoorCap, type RoomTemplate } from './template';
import { buildReachGraph, canReach, reachableFrom, type ReachParams } from './reach';

/** 좌우 스텁 길이 */
const SIDE = 6;
/** 위/아래 스텁 공간 높이 */
const BAND = 8;

interface Stub {
  readonly name: string;
  /** 출발 칸 (스텁에서 템플릿으로 들어가는 표준 위치) */
  readonly starts: number[];
  /** 스텁 안의 모든 서 있을 수 있는 칸 */
  readonly area: number[];
}

interface Composite {
  grid: TileGrid;
  stubs: Stub[];
  ox: number;
  oy: number;
}

export function buildComposite(t: RoomTemplate, templateGrid: TileGrid, caps: readonly DoorCap[] = t.caps): Composite {
  const RW = ROOM.widthTiles;
  const RH = ROOM.heightTiles;
  const W = t.width;
  const H = t.height;
  const ox = SIDE;
  const oy = BAND;
  const grid = createGrid(W + SIDE * 2, H + BAND * 2, Tile.Wall);
  const idx = (x: number, y: number) => y * grid.width + x;
  for (let y = 0; y < templateGrid.height; y++) {
    for (let x = 0; x < templateGrid.width; x++) setTile(grid, ox + x, oy + y, getTile(templateGrid, x, y) as never);
  }
  const stubs: Stub[] = [];
  const upStubs: { x0: number; x1: number }[] = [];
  for (const c of caps) {
    const name = capKey(c);
    if (isSideDir(c.dir)) {
      // 좌우: 출입구 높이의 짧은 통로 (바닥은 출입구 아래 줄)
      const rows = DOOR.side[c.slot as SideSlot];
      const top = oy + c.seg * RH + rows[0]!;
      const bottom = oy + c.seg * RH + rows[3]!;
      const xs = c.dir === 'left' ? range(1, SIDE - 1) : range(ox + W, grid.width - 2);
      const area: number[] = [];
      for (const x of xs) {
        for (let y = top; y <= bottom; y++) setTile(grid, x, y, Tile.Empty);
        area.push(idx(x, bottom));
      }
      const startX = c.dir === 'left' ? SIDE - 2 : ox + W + 1;
      stubs.push({ name, starts: [idx(startX, bottom)], area });
    } else if (c.dir === 'up') {
      // 위: 바닥에 구멍과 착지 턱이 있는 좁은 공간 (자리마다 따로 떨어지도록 폭을 줄인다)
      // 실제 위 방의 착지 턱(구멍 양옆 2칸)과 같은 폭. 같은 칸의 다른 자리 스텁과 맞닿으면 사이를 벽으로 막는다
      const cols = DOOR.vertical[c.slot as VerticalSlot].map((x) => ox + c.seg * RW + x);
      const floorY = oy - 1;
      const x0 = cols[0]! - 2;
      const x1 = cols[3]! + 2;
      for (let y = 1; y < floorY; y++) for (let x = x0; x <= x1; x++) setTile(grid, x, y, Tile.Empty);
      for (const x of cols) setTile(grid, x, floorY, Tile.Empty);
      const ledges = [x0, x0 + 1, x1 - 1, x1].map((x) => idx(x, floorY - 1));
      upStubs.push({ x0, x1 });
      stubs.push({ name, starts: ledges, area: ledges });
    } else {
      // 아래: 천장에 구멍, 2행에 발사대 발판이 있는 좁은 공간
      const cols = DOOR.vertical[c.slot as VerticalSlot].map((x) => ox + c.seg * RW + x);
      const by = oy + H;
      // 구멍 바로 아래 발사대 위 공간만 연다 (발판 아래/옆 구석은 실제 아래 방의 몫)
      for (const x of cols) {
        for (let y = 0; y < DOOR.launchRow; y++) setTile(grid, x, by + y, Tile.Empty);
        setTile(grid, x, by + DOOR.launchRow, Tile.OneWay);
      }
      const launch = cols.map((x) => idx(x, by + DOOR.launchRow - 1));
      stubs.push({ name, starts: launch, area: launch });
    }
  }
  // 맞닿은 위 스텁 사이를 벽으로 나눈다 (실제로는 한 칸에 위 출입구가 하나만 열린다)
  for (const a of upStubs) {
    for (const b of upStubs) {
      if (b.x0 !== a.x1 + 1) continue;
      for (let y = 1; y < oy - 1; y++) setTile(grid, a.x1, y, Tile.Wall);
      for (const s of stubs) {
        const keep = (cell: number) => cell % grid.width !== a.x1;
        s.starts.splice(0, s.starts.length, ...s.starts.filter(keep));
        s.area.splice(0, s.area.length, ...s.area.filter(keep));
      }
    }
  }
  return { grid, stubs, ox, oy };
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

export interface TemplateCheck {
  readonly variant: string;
  readonly errors: string[];
}

function checkVariant(
  t: RoomTemplate,
  p: ReachParams,
  variant: { optionalOn: boolean; trapOn: boolean; secretBroken: boolean },
): string[] {
  const { grid: tg, markers } = resolveTemplate(t, {
    open: t.caps,
    optionalOn: variant.optionalOn,
    trapOn: variant.trapOn,
    secretActive: true,
    secretBroken: variant.secretBroken,
  });
  const comp = buildComposite(t, tg);
  const g = buildReachGraph(comp.grid, p);
  const errors: string[] = [];
  const cellOf = (x: number, y: number) => (comp.oy + y) * comp.grid.width + comp.ox + x;

  const allTargets = comp.stubs.flatMap((s) => s.area);
  const returnable = canReach(g, allTargets);
  for (const from of comp.stubs) {
    const reach = reachableFrom(g, from.starts);
    if (reach.size === 0) errors.push(`${from.name} 스텁 출발점이 노드가 아님`);
    for (const to of comp.stubs) {
      if (to === from) continue;
      if (!to.area.some((c) => reach.has(g.nodeOf[c] as number))) errors.push(`${from.name} → ${to.name} 도달 불가`);
    }
    for (const n of reach) {
      if (!returnable.has(n)) {
        const c = g.cells[n] as number;
        const x = (c % comp.grid.width) - comp.ox;
        const y = Math.floor(c / comp.grid.width) - comp.oy;
        errors.push(`(${x},${y})에 들어가면 출입구로 돌아올 수 없음`);
        break;
      }
    }
  }
  const firstReach = comp.stubs[0] ? reachableFrom(g, comp.stubs[0].starts) : new Set<number>();
  for (const m of markers) {
    const needed = m.kind === 'portal' || m.kind === 'chest' || (m.kind === 'secretChest' && variant.secretBroken);
    if (!needed) continue;
    const n = g.nodeOf[cellOf(m.x, m.y)] ?? -1;
    if (n < 0 || !firstReach.has(n)) errors.push(`${m.kind} (${m.x},${m.y}) 도달 불가`);
  }
  return errors;
}

/** 템플릿의 모든 변형을 검사한다. 오류가 없으면 빈 배열. */
export function validateTemplate(t: RoomTemplate, p: ReachParams): TemplateCheck[] {
  const hasO = templateHas(t, 'o');
  const hasT = templateHas(t, 't');
  const hasSecret = templateHas(t, 'c');
  const out: TemplateCheck[] = [];
  for (const optionalOn of hasO ? [false, true] : [false]) {
    for (const trapOn of hasT ? [false, true] : [false]) {
      for (const secretBroken of hasSecret ? [false, true] : [false]) {
        const errors = checkVariant(t, p, { optionalOn, trapOn, secretBroken });
        if (errors.length) {
          out.push({ variant: `o=${optionalOn ? 1 : 0} t=${trapOn ? 1 : 0} s=${secretBroken ? 1 : 0}`, errors });
        }
      }
    }
  }
  return out;
}

