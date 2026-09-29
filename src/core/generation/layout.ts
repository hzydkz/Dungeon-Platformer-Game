/**
 * 방 그리드 배치 (기획서 5.3-1, 5.5). Phaser 비의존.
 * 입구(중앙)에서 성장 트리로 방을 연결하고, 루프 연결을 더한 뒤,
 * 방 그래프 BFS 거리로 보스방(2×1 아레나, 막다른 곳에 붙임)과 출구/빨간 포탈 방을 정한다.
 */
import type { Rng } from '../rng';
import { DIR_BIT, DIR_DELTA, OPPOSITE, type Dir } from './template';

export interface LayoutParams {
  readonly gridW: number;
  readonly gridH: number;
  /** 일반 방 개수 (보스 아레나 제외) */
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
}

export interface Link {
  readonly a: number;
  readonly b: number;
  /** a에서 b로 가는 방향 */
  readonly dir: Dir;
}

export interface LayoutRoom {
  readonly index: number;
  /** 차지하는 칸들 (일반 방 1칸, 보스 아레나 2칸, 왼쪽부터) */
  readonly cells: readonly (readonly [number, number])[];
  /** 일반 방: 출입구 마스크. 아레나: 아레나 기준 출입구 마스크(왼쪽 또는 오른쪽) */
  doors: number;
  readonly arena: boolean;
}

export interface Layout {
  readonly gridW: number;
  readonly gridH: number;
  readonly rooms: readonly LayoutRoom[];
  /** 칸 → 방 인덱스 (-1: 빈 칸) */
  readonly cellRoom: Int16Array;
  readonly links: readonly Link[];
  readonly entrance: number;
  readonly boss: number;
  /** 보스 아레나와 연결된 일반 방 */
  readonly bossGate: number;
  readonly exit: number;
  readonly red: number;
  /** 입구 기준 방 그래프 BFS 거리 */
  readonly dist: readonly number[];
}

const inBounds = (p: LayoutParams, x: number, y: number) => x >= 0 && y >= 0 && x < p.gridW && y < p.gridH;

/** 방 그래프 BFS 거리 */
export function roomDistances(roomCount: number, links: readonly Link[], from: number): number[] {
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
  const addRoom = (x: number, y: number) => {
    const index = rooms.length;
    rooms.push({ index, cells: [[x, y]], doors: 0, arena: false });
    cellRoom[idx(x, y)] = index;
    return index;
  };
  const link = (a: number, b: number, dir: Dir) => {
    links.push({ a, b, dir });
    rooms[a]!.doors |= DIR_BIT[dir];
    rooms[b]!.doors |= DIR_BIT[OPPOSITE[dir]];
  };

  // 1. 성장 트리
  const ex = Math.floor(p.gridW / 2);
  const ey = Math.floor(p.gridH / 2);
  const entrance = addRoom(ex, ey);
  const active = [entrance];
  const dirs: Dir[] = ['left', 'right', 'up', 'down'];
  while (rooms.length < p.roomCount && active.length) {
    const ai = rng.chance(p.newestBias) ? active.length - 1 : rng.int(0, active.length - 1);
    const r = active[ai] as number;
    const [x, y] = rooms[r]!.cells[0]!;
    const options = dirs.filter((d) => {
      const [dx, dy] = DIR_DELTA[d];
      return inBounds(p, x + dx, y + dy) && cellRoom[idx(x + dx, y + dy)] === -1;
    });
    if (options.length === 0) {
      active.splice(ai, 1);
      continue;
    }
    const d = rng.pick(options);
    const [dx, dy] = DIR_DELTA[d];
    const n = addRoom(x + dx, y + dy);
    link(r, n, d);
    active.push(n);
  }
  if (rooms.length < p.roomCount) return null;

  // 2. 루프 연결
  const treeEdges = links.length;
  const candidates: Link[] = [];
  for (const room of rooms) {
    const [x, y] = room.cells[0]!;
    for (const d of ['right', 'down'] as const) {
      const [dx, dy] = DIR_DELTA[d];
      if (!inBounds(p, x + dx, y + dy)) continue;
      const other = cellRoom[idx(x + dx, y + dy)] as number;
      if (other < 0) continue;
      if (links.some((l) => (l.a === room.index && l.b === other) || (l.a === other && l.b === room.index))) continue;
      candidates.push({ a: room.index, b: other, dir: d });
    }
  }
  const loops = Math.round(treeEdges * p.loopRatio);
  for (const c of rng.shuffle(candidates).slice(0, loops)) link(c.a, c.b, c.dir);

  // 3. 거리
  const dist = roomDistances(rooms.length, links, entrance);
  const maxDist = Math.max(...dist);

  // 4. 보스 아레나: 일반 방 c 옆의 빈 칸 2개(가로)에 붙인다. 아레나 거리 = dist(c) + 1
  interface BossCandidate {
    gate: number;
    side: 'left' | 'right';
    d: number;
  }
  const bossCandidates: BossCandidate[] = [];
  for (const room of rooms) {
    if (room.index === entrance) continue;
    const [x, y] = room.cells[0]!;
    for (const side of ['left', 'right'] as const) {
      const s = side === 'left' ? -1 : 1;
      const c1 = [x + s, y] as const;
      const c2 = [x + 2 * s, y] as const;
      if (!inBounds(p, c1[0], c1[1]) || !inBounds(p, c2[0], c2[1])) continue;
      if (cellRoom[idx(c1[0], c1[1])] !== -1 || cellRoom[idx(c2[0], c2[1])] !== -1) continue;
      bossCandidates.push({ gate: room.index, side, d: (dist[room.index] as number) + 1 });
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
  const [gx, gy] = rooms[bc.gate]!.cells[0]!;
  const s = bc.side === 'left' ? -1 : 1;
  const arenaCells: [number, number][] =
    bc.side === 'left'
      ? [
          [gx - 2, gy],
          [gx - 1, gy],
        ]
      : [
          [gx + 1, gy],
          [gx + 2, gy],
        ];
  const boss = rooms.length;
  // 아레나의 출입구는 게이트 방을 향한다
  rooms.push({ index: boss, cells: arenaCells, doors: bc.side === 'left' ? DIR_BIT.right : DIR_BIT.left, arena: true });
  for (const [x, y] of arenaCells) cellRoom[idx(x, y)] = boss;
  links.push({ a: bc.gate, b: boss, dir: bc.side });
  rooms[bc.gate]!.doors |= DIR_BIT[bc.side];
  void s;
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
