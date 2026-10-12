/**
 * 방 그리드 배치 (기획서 5.3-1, 5.5). Phaser 비의존.
 * 입구(중앙)에서 성장 트리로 방을 연결하고, 루프 연결을 더한 뒤,
 * 방 그래프 BFS 거리로 보스방(2×1 아레나, 막다른 곳에 붙임)과 출구/빨간 포탈 방을 정한다.
 * 방은 여러 칸을 차지할 수 있다 (긴 복도, 세로 굴, 큰 홀: config/generation.ts의 ROOM_SHAPES).
 */
import { ROOM_SHAPES } from '../../config/generation';
import type { Rng } from '../rng';
import { DIR_DELTA, OPPOSITE, isSideDir, type Dir } from './template';

export interface LayoutParams {
  readonly gridW: number;
  readonly gridH: number;
  /** 일반 방이 차지할 칸 수 (보스 아레나 제외) */
  readonly roomCount: number;
  readonly loopRatio: number;
  readonly newestBias: number;
  /** 보스방 BFS 거리 구간 (최대 거리 대비 비율) */
  readonly bossRange: readonly [number, number];
  /** 출구 포탈 방을 둘지 (9층, 빨간 던전은 없음) */
  readonly hasExit: boolean;
  readonly exitTopFraction: number;
  /** 빨간 포탈 방을 둘지 */
  readonly hasRedPortal: boolean;
  /** true면 보스방 거리 구간을 만족하는 후보가 없을 때 실패(null)한다 */
  readonly strictBossRange?: boolean;
  /** 여러 칸 방을 쓸지 (기본 true) */
  readonly bigRooms?: boolean;
}

/**
 * 방 사이 연결. a의 칸 (ax, ay)에서 dir 방향 이웃 칸이 b에 속한다.
 * kind: open 일반, gate 지름길(한쪽에서만 여는 문), lock 열쇠로 여는 문, secret 부서지는 벽으로 숨긴 입구
 */
export type LinkKind = 'open' | 'gate' | 'lock' | 'secret';
export interface Link {
  readonly a: number;
  readonly b: number;
  /** a에서 b로 가는 방향 */
  readonly dir: Dir;
  readonly ax: number;
  readonly ay: number;
  kind: LinkKind;
}

export interface LayoutRoom {
  readonly index: number;
  /** 칸 좌표의 사각형 */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** 차지하는 칸들 */
  readonly cells: readonly (readonly [number, number])[];
  readonly arena: boolean;
}

export interface Layout {
  readonly gridW: number;
  readonly gridH: number;
  readonly rooms: readonly LayoutRoom[];
  /** 칸 → 방 인덱스 (-1: 빈 칸) */
  readonly cellRoom: Int16Array;
  readonly links: Link[];
  readonly entrance: number;
  readonly boss: number;
  /** 보스 아레나와 연결된 일반 방 */
  readonly bossGate: number;
  readonly exit: number;
  readonly red: number;
  /** 입구 기준 방 그래프 BFS 거리 */
  readonly dist: readonly number[];
}

/** 방 r에서 본 연결의 방향과 변의 칸 구간 */
export interface RoomEdge {
  readonly link: number;
  readonly dir: Dir;
  readonly seg: number;
  /** 방 r 쪽 칸 */
  readonly cx: number;
  readonly cy: number;
}

export function roomEdges(layout: Pick<Layout, 'rooms' | 'links'>, r: number): RoomEdge[] {
  const room = layout.rooms[r]!;
  const out: RoomEdge[] = [];
  layout.links.forEach((l, i) => {
    if (l.a !== r && l.b !== r) return;
    const mine = l.a === r;
    const dir = mine ? l.dir : OPPOSITE[l.dir];
    const [dx, dy] = DIR_DELTA[l.dir];
    const cx = mine ? l.ax : l.ax + dx;
    const cy = mine ? l.ay : l.ay + dy;
    out.push({ link: i, dir, seg: isSideDir(dir) ? cy - room.y : cx - room.x, cx, cy });
  });
  return out;
}

const inBounds = (p: LayoutParams, x: number, y: number) => x >= 0 && y >= 0 && x < p.gridW && y < p.gridH;

/** 방 그래프 BFS 거리 */
export function roomDistances(roomCount: number, links: readonly Pick<Link, 'a' | 'b'>[], from: number): number[] {
  const adj: number[][] = Array.from({ length: roomCount }, () => []);
  for (const l of links) {
    adj[l.a]!.push(l.b);
    adj[l.b]!.push(l.a);
  }
  const dist = new Array<number>(roomCount).fill(-1);
  dist[from] = 0;
  const queue = [from];
  while (queue.length) {
    const r = queue.shift() as number;
    for (const n of adj[r]!) {
      if (dist[n] === -1) {
        dist[n] = (dist[r] as number) + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

/** 레이아웃을 만든다. 조건을 만족하는 배치가 없으면 null (호출 측이 시드를 바꿔 재시도). */
export function generateLayout(rng: Rng, p: LayoutParams): Layout | null {
  const cellRoom = new Int16Array(p.gridW * p.gridH).fill(-1);
  const rooms: LayoutRoom[] = [];
  const links: Link[] = [];
  const idx = (x: number, y: number) => y * p.gridW + x;
  const free = (x: number, y: number) => inBounds(p, x, y) && cellRoom[idx(x, y)] === -1;
  const addRoom = (x: number, y: number, w: number, h: number, arena = false) => {
    const index = rooms.length;
    const cells: [number, number][] = [];
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) cells.push([xx, yy]);
    rooms.push({ index, x, y, w, h, cells, arena });
    for (const [cx, cy] of cells) cellRoom[idx(cx, cy)] = index;
    return index;
  };
  const link = (a: number, b: number, dir: Dir, ax: number, ay: number) => links.push({ a, b, dir, ax, ay, kind: 'open' });
  const linked = (a: number, b: number) => links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));

  // 1. 성장 트리 (방 모양은 가중치로, 들어갈 자리가 없으면 1칸)
  const ex = Math.floor(p.gridW / 2);
  const ey = Math.floor(p.gridH / 2);
  const entrance = addRoom(ex, ey, 1, 1);
  let covered = 1;
  const active = [entrance];
  const dirs: Dir[] = ['left', 'right', 'up', 'down'];
  const shapes = p.bigRooms === false ? ROOM_SHAPES.filter((s) => s.w * s.h === 1) : ROOM_SHAPES;
  while (covered < p.roomCount && active.length) {
    const ai = rng.chance(p.newestBias) ? active.length - 1 : rng.int(0, active.length - 1);
    const r = active[ai] as number;
    const options: { cx: number; cy: number; d: Dir; nx: number; ny: number }[] = [];
    for (const [cx, cy] of rooms[r]!.cells) {
      for (const d of dirs) {
        const [dx, dy] = DIR_DELTA[d];
        if (free(cx + dx, cy + dy)) options.push({ cx, cy, d, nx: cx + dx, ny: cy + dy });
      }
    }
    if (options.length === 0) {
      active.splice(ai, 1);
      continue;
    }
    const o = rng.pick(options);
    const remaining = p.roomCount - covered;
    const fits = shapes.filter((s) => s.w * s.h <= Math.max(1, remaining));
    let shape = fits[rng.weightedIndex(fits.map((s) => s.weight))]!;
    const placements: [number, number][] = [];
    for (let ox = o.nx - shape.w + 1; ox <= o.nx; ox++) {
      for (let oy = o.ny - shape.h + 1; oy <= o.ny; oy++) {
        let ok = true;
        for (let yy = oy; yy < oy + shape.h && ok; yy++) for (let xx = ox; xx < ox + shape.w && ok; xx++) if (!free(xx, yy)) ok = false;
        if (ok) placements.push([ox, oy]);
      }
    }
    if (placements.length === 0) {
      shape = { w: 1, h: 1, weight: 1 };
      placements.push([o.nx, o.ny]);
    }
    const [px, py] = rng.pick(placements);
    const n = addRoom(px, py, shape.w, shape.h);
    link(r, n, o.d, o.cx, o.cy);
    covered += shape.w * shape.h;
    active.push(n);
  }
  if (covered < p.roomCount) return null;

  // 2. 루프 연결: 맞닿아 있지만 이어지지 않은 방 쌍 중 일부
  const treeEdges = links.length;
  const pairCandidates = new Map<string, { a: number; b: number; dir: Dir; ax: number; ay: number }[]>();
  for (const room of rooms) {
    for (const [cx, cy] of room.cells) {
      for (const d of ['right', 'down'] as const) {
        const [dx, dy] = DIR_DELTA[d];
        if (!inBounds(p, cx + dx, cy + dy)) continue;
        const other = cellRoom[idx(cx + dx, cy + dy)] as number;
        if (other < 0 || other === room.index || linked(room.index, other)) continue;
        const key = `${Math.min(room.index, other)}-${Math.max(room.index, other)}`;
        const list = pairCandidates.get(key) ?? [];
        list.push({ a: room.index, b: other, dir: d, ax: cx, ay: cy });
        pairCandidates.set(key, list);
      }
    }
  }
  const loops = Math.round(treeEdges * p.loopRatio);
  for (const list of rng.shuffle([...pairCandidates.values()]).slice(0, loops)) {
    const c = rng.pick(list);
    link(c.a, c.b, c.dir, c.ax, c.ay);
  }

  // 3. 거리
  const dist = roomDistances(rooms.length, links, entrance);
  const maxDist = Math.max(...dist);

  // 4. 보스 아레나: 일반 방의 한 칸 옆 빈 칸 2개(가로)에 붙인다. 아레나 거리 = dist(게이트) + 1
  interface BossCandidate {
    gate: number;
    cx: number;
    cy: number;
    side: 'left' | 'right';
    d: number;
  }
  const bossCandidates: BossCandidate[] = [];
  for (const room of rooms) {
    if (room.index === entrance) continue;
    for (const [cx, cy] of room.cells) {
      for (const side of ['left', 'right'] as const) {
        const s = side === 'left' ? -1 : 1;
        if (!free(cx + s, cy) || !free(cx + 2 * s, cy)) continue;
        bossCandidates.push({ gate: room.index, cx, cy, side, d: (dist[room.index] as number) + 1 });
      }
    }
  }
  if (bossCandidates.length === 0) return null;
  const total = maxDist + 1;
  const lo = p.bossRange[0] * total;
  const hi = p.bossRange[1] * total;
  let inRange = bossCandidates.filter((c) => c.d >= lo && c.d <= hi);
  if (inRange.length === 0) {
    if (p.strictBossRange) return null;
    // 구간 안에 후보가 없으면 구간에 가장 가까운 후보들
    const gap = (c: BossCandidate) => (c.d < lo ? lo - c.d : c.d > hi ? c.d - hi : 0);
    const best = Math.min(...bossCandidates.map(gap));
    inRange = bossCandidates.filter((c) => gap(c) === best);
  }
  const bc = rng.pick(inRange);
  const ax0 = bc.side === 'left' ? bc.cx - 2 : bc.cx + 1;
  const boss = addRoom(ax0, bc.cy, 2, 1, true);
  link(bc.gate, boss, bc.side, bc.cx, bc.cy);
  const fullDist = [...dist, bc.d];

  // 5. 출구 포탈: 거리 상위 비율의 방 중 하나 (입구/아레나 제외)
  const normal = rooms.filter((r) => !r.arena && r.index !== entrance);
  let exit = -1;
  if (p.hasExit) {
    const sorted = [...normal].sort((a, b) => (fullDist[b.index] as number) - (fullDist[a.index] as number) || a.index - b.index);
    const topN = Math.max(1, Math.ceil(normal.length * p.exitTopFraction));
    exit = rng.pick(sorted.slice(0, topN)).index;
  }

  // 6. 빨간 포탈: 입구/출구/보스방이 아닌 방
  let red = -1;
  if (p.hasRedPortal) {
    const pool = normal.filter((r) => r.index !== exit);
    if (pool.length) red = rng.pick(pool).index;
  }

  return {
    gridW: p.gridW,
    gridH: p.gridH,
    rooms,
    cellRoom,
    links,
    entrance,
    boss,
    bossGate: bc.gate,
    exit,
    red,
    dist: fullDist,
  };
}
