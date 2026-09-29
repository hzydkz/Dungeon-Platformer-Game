/**
 * 템플릿 단위 도달성 검증 (기획서 5.4).
 *
 * 템플릿을 표준 이웃 방(스텁) 사이에 놓고 이동 그래프를 만든 뒤 확인한다:
 * 1. 모든 출입구 쌍이 서로 도달 가능 (스텁 ↔ 스텁)
 * 2. 포탈 후보(P)와 상자(C)가 출입구에서 도달 가능
 * 3. 출입구에서 도달 가능한 모든 칸에서 다시 출입구로 돌아갈 수 있다 (빠지면 못 나오는 구덩이 없음)
 * 4. 비밀 상자(c)는 비밀 벽을 부순 상태에서 도달 가능
 * 선택적 발판(o) 켜짐/꺼짐, 함정(t) 켜짐/꺼짐 조합을 모두 검사한다.
 *
 * 출입구 규격이 고정되어 있으므로, 템플릿이 모두 통과하면 규격대로 이어 붙인 층도 방 사이 이동이 보장된다.
 */
import { DOOR, ROOM } from '../../config/generation';
import { Tile, createGrid, getTile, setTile, type TileGrid } from '../tiles';
import { DIR_BIT, resolveTemplate, templateHas, type RoomTemplate } from './template';
import { buildReachGraph, canReach, reachableFrom, type ReachParams } from './reach';

const SIDE = 6;

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

export function buildComposite(t: RoomTemplate, templateGrid: TileGrid): Composite {
  const H = ROOM.heightTiles;
  const W = t.width;
  const ox = SIDE;
  const oy = H;
  const grid = createGrid(W + SIDE * 2, H * 3, Tile.Wall);
  const idx = (x: number, y: number) => y * grid.width + x;
  for (let y = 0; y < templateGrid.height; y++) {
    for (let x = 0; x < templateGrid.width; x++) setTile(grid, ox + x, oy + y, getTile(templateGrid, x, y) as never);
  }
  const stubs: Stub[] = [];
  const sideTop = oy + DOOR.sideRows[0];
  const sideBottom = oy + DOOR.sideRows[3];

  if (t.doors & DIR_BIT.left) {
    const area: number[] = [];
    for (let x = 1; x < SIDE; x++) {
      for (let y = sideTop; y <= sideBottom; y++) setTile(grid, x, y, Tile.Empty);
      area.push(idx(x, sideBottom));
    }
    stubs.push({ name: 'left', starts: [idx(SIDE - 2, sideBottom)], area });
  }
  if (t.doors & DIR_BIT.right) {
    const area: number[] = [];
    for (let x = ox + W; x < grid.width - 1; x++) {
      for (let y = sideTop; y <= sideBottom; y++) setTile(grid, x, y, Tile.Empty);
      area.push(idx(x, sideBottom));
    }
    stubs.push({ name: 'right', starts: [idx(ox + W + 1, sideBottom)], area });
  }
  const [c0, , , c3] = DOOR.verticalCols;
  if (t.doors & DIR_BIT.up) {
    // 위 스텁: 바닥(16행)에 구멍과 착지 턱이 있는 빈 방
    const area: number[] = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < ROOM.widthTiles - 1; x++) setTile(grid, ox + x, y, Tile.Empty);
    for (const x of DOOR.verticalCols) setTile(grid, ox + x, H - 1, Tile.Empty);
    for (let x = 1; x < ROOM.widthTiles - 1; x++) if (x < c0 || x > c3) area.push(idx(ox + x, H - 2));
    stubs.push({ name: 'up', starts: DOOR.ledgeCols.map((x) => idx(ox + x, H - 2)), area });
  }
  if (t.doors & DIR_BIT.down) {
    // 아래 스텁: 천장(0행)에 구멍, 2행에 발사대 발판이 있는 빈 방
    const by = oy + H;
    const area: number[] = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < ROOM.widthTiles - 1; x++) setTile(grid, ox + x, by + y, Tile.Empty);
    for (const x of DOOR.verticalCols) {
      setTile(grid, ox + x, by, Tile.Empty);
      setTile(grid, ox + x, by + DOOR.launchRow, Tile.OneWay);
    }
    const launch = DOOR.verticalCols.map((x) => idx(ox + x, by + DOOR.launchRow - 1));
    for (let x = 1; x < ROOM.widthTiles - 1; x++) area.push(idx(ox + x, by + H - 2));
    area.push(...launch);
    stubs.push({ name: 'down', starts: launch, area });
  }
  return { grid, stubs, ox, oy };
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
    openDoors: t.doors,
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
