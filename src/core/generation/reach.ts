/**
 * 타일 단위 이동 그래프와 도달 가능성 (기획서 5.4). Phaser 비의존.
 *
 * 노드는 "서 있을 수 있는 칸"(자신과 위 칸이 비어 있고 아래가 벽/발판). 간선은 게임과 같은
 * PlayerMotor와 타일 충돌 규칙으로 여러 조작(걷기, 걸어서 떨어지기, 점프 높이/방향/타이밍,
 * 발판 내려가기)을 실제로 시뮬레이션해서 착지한 칸으로 만든다. 가시에 닿는 경로는 버린다.
 * 조작 조합이 유한하므로 결과는 보수적이다(여기서 도달 가능하면 게임에서도 도달 가능).
 */
import { PlayerMotor, type MotorParams } from '../movement/motor';
import { getTile, isHazardTile, isOneWayTile, isSolidTile, type TileGrid } from '../tiles';

export interface ReachParams {
  readonly motor: MotorParams;
  readonly tileSize: number;
  readonly bodyWidth: number;
  readonly bodyHeight: number;
  /** 가장 느린 이동속도 배율 */
  readonly speedMultiplier: number;
  readonly dropThroughTime: number;
  readonly dt: number;
  readonly maxTime: number;
  /** 단방향 발판 착지 허용 오차 (px). 게임 쪽 판정과 같아야 한다 */
  readonly oneWayTolerance: number;
  /** 가시 판정 영역 (타일 내부 px) */
  readonly spike: { readonly insetX: number; readonly top: number };
}

interface Strategy {
  readonly dir: -1 | 0 | 1;
  readonly jump: boolean;
  /** 점프 키를 누르고 있는 시간 */
  readonly hold: number;
  /** 방향 입력 시작 시각 */
  readonly delay: number;
  /** 방향 입력 종료 시각 */
  readonly stop: number;
  readonly drop: boolean;
  /** 출발 위치: 칸 중앙 또는 진행 방향 끝 */
  readonly fromEdge: boolean;
}

const INF = Number.POSITIVE_INFINITY;

function buildStrategies(): Strategy[] {
  const s: Strategy[] = [];
  const base = { jump: false, hold: 0, delay: 0, stop: INF, drop: false, fromEdge: false };
  for (const dir of [-1, 1] as const) {
    // 걸어서 떨어지기 (계속 / 곧 멈추기)
    s.push({ ...base, dir });
    s.push({ ...base, dir, stop: 0.12 });
    // 점프: 높이 × 방향 시작 시점 × 방향 종료 시점, 끝에서 출발
    for (const hold of [INF, 0.12]) {
      for (const delay of [0, 0.15]) {
        for (const stop of [INF, 0.3]) {
          s.push({ ...base, dir, jump: true, hold, delay, stop, fromEdge: true });
        }
      }
    }
    s.push({ ...base, dir, jump: true, hold: INF });
    s.push({ ...base, dir, jump: true, hold: INF, delay: 0.3 });
    s.push({ ...base, dir, drop: true });
  }
  s.push({ ...base, dir: 0, jump: true, hold: INF });
  s.push({ ...base, dir: 0, jump: true, hold: 0.12 });
  s.push({ ...base, dir: 0, drop: true });
  return s;
}

const STRATEGIES = buildStrategies();

export interface ReachGraph {
  readonly grid: TileGrid;
  /** 노드 인덱스 → 칸 번호 (y * width + x) */
  readonly cells: readonly number[];
  /** 칸 번호 → 노드 인덱스 (-1이면 노드 아님) */
  readonly nodeOf: Int32Array;
  readonly edges: readonly (readonly number[])[];
}

export function isStandable(grid: TileGrid, x: number, y: number): boolean {
  const here = getTile(grid, x, y);
  const above = getTile(grid, x, y - 1);
  const below = getTile(grid, x, y + 1);
  if (isSolidTile(here) || isOneWayTile(here) || isHazardTile(here)) return false;
  if (isSolidTile(above) || isHazardTile(above)) return false;
  return isSolidTile(below) || isOneWayTile(below);
}

/** 한 조작을 시뮬레이션해서 착지한 노드 칸 번호를 반환. 실패(가시/시간 초과/제자리)면 -1 */
export function simulate(
  grid: TileGrid,
  p: ReachParams,
  startCenterX: number,
  startFeetY: number,
  st: Strategy,
): number {
  const s = p.tileSize;
  const bw = p.bodyWidth;
  const bh = p.bodyHeight;
  const eps = 1e-6;
  let left = startCenterX - bw / 2;
  let bottom = startFeetY;
  let vy = 0;
  let grounded = true;
  const dropUntil = st.drop ? p.dropThroughTime : -1;
  const motor = new PlayerMotor(p.motor, p.speedMultiplier);

  const solidAt = (tx: number, ty: number) => isSolidTile(getTile(grid, tx, ty));
  const steps = Math.ceil(p.maxTime / p.dt);
  for (let i = 0; i < steps; i++) {
    const t = i * p.dt;
    const moveX = t >= st.delay && t < st.stop ? st.dir : 0;
    const r = motor.step(
      p.dt,
      { moveX, jumpPressed: st.jump && i === 0, jumpHeld: st.jump && t < st.hold },
      grounded,
      vy,
    );
    vy = Math.min(r.vy + p.motor.gravity * p.dt, p.motor.maxFallSpeed);
    const vx = r.vx;

    // X 이동
    if (vx !== 0) {
      const top = bottom - bh;
      const y0 = Math.floor(top / s);
      const y1 = Math.floor((bottom - eps) / s);
      let newLeft = left + vx * p.dt;
      if (vx > 0) {
        const c0 = Math.floor((left + bw - eps) / s) + 1;
        const c1 = Math.floor((newLeft + bw - eps) / s);
        for (let c = c0; c <= c1; c++) {
          let hit = false;
          for (let y = y0; y <= y1; y++) if (solidAt(c, y)) hit = true;
          if (hit) {
            newLeft = c * s - bw;
            break;
          }
        }
      } else {
        const c0 = Math.floor(left / s) - 1;
        const c1 = Math.floor(newLeft / s);
        for (let c = c0; c >= c1; c--) {
          let hit = false;
          for (let y = y0; y <= y1; y++) if (solidAt(c, y)) hit = true;
          if (hit) {
            newLeft = (c + 1) * s;
            break;
          }
        }
      }
      left = newLeft;
    }

    // Y 이동
    const x0 = Math.floor(left / s);
    const x1 = Math.floor((left + bw - eps) / s);
    let landed = false;
    if (vy > 0) {
      const dropping = t < dropUntil;
      let newBottom = bottom + vy * p.dt;
      const r0 = Math.floor((bottom - eps) / s) + 1;
      const r1 = Math.floor((newBottom - eps) / s);
      outer: for (let row = r0; row <= r1; row++) {
        for (let c = x0; c <= x1; c++) {
          const tile = getTile(grid, c, row);
          const oneWayLand = isOneWayTile(tile) && !dropping && bottom <= row * s + p.oneWayTolerance;
          if (isSolidTile(tile) || oneWayLand) {
            newBottom = row * s;
            landed = true;
            break outer;
          }
        }
      }
      bottom = newBottom;
      if (landed) vy = 0;
    } else if (vy < 0) {
      let newTop = bottom - bh + vy * p.dt;
      const r0 = Math.floor((bottom - bh) / s) - 1;
      const r1 = Math.floor(newTop / s);
      outer: for (let row = r0; row >= r1; row--) {
        for (let c = x0; c <= x1; c++) {
          if (solidAt(c, row)) {
            newTop = (row + 1) * s;
            vy = 0;
            break outer;
          }
        }
      }
      bottom = newTop + bh;
    }
    grounded = landed;

    // 가시: 게임과 같은 판정 영역
    const top = bottom - bh;
    for (let y = Math.floor(top / s); y <= Math.floor((bottom - eps) / s); y++) {
      for (let c = x0; c <= x1; c++) {
        if (!isHazardTile(getTile(grid, c, y))) continue;
        const hx0 = c * s + p.spike.insetX;
        const hx1 = (c + 1) * s - p.spike.insetX;
        const hy0 = y * s + p.spike.top;
        if (left < hx1 && left + bw > hx0 && top < (y + 1) * s && bottom > hy0) return -1;
      }
    }

    if (landed && i > 0) {
      const footRow = Math.round(bottom / s) - 1;
      const center = left + bw / 2;
      const cc = Math.floor(center / s);
      // 몸 아래에서 바닥이 있는 열 중 중심에 가장 가까운 열
      let best = -1;
      let bestDist = INF;
      for (let c = x0; c <= x1; c++) {
        const below = getTile(grid, c, footRow + 1);
        if ((isSolidTile(below) || isOneWayTile(below)) && isStandable(grid, c, footRow)) {
          const d = Math.abs(c - cc);
          if (d < bestDist) {
            bestDist = d;
            best = c;
          }
        }
      }
      return best < 0 ? -1 : footRow * grid.width + best;
    }
  }
  return -1;
}

/** 격자 전체의 이동 그래프를 만든다. `region`을 주면 그 안의 칸만 출발점으로 쓴다. */
export function buildReachGraph(grid: TileGrid, p: ReachParams): ReachGraph {
  const s = p.tileSize;
  const nodeOf = new Int32Array(grid.width * grid.height).fill(-1);
  const cells: number[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (isStandable(grid, x, y)) {
        nodeOf[y * grid.width + x] = cells.length;
        cells.push(y * grid.width + x);
      }
    }
  }
  const edges: number[][] = cells.map(() => []);
  const add = (from: number, cell: number) => {
    const to = cell >= 0 ? (nodeOf[cell] as number) : -1;
    if (to >= 0 && to !== from && !edges[from]!.includes(to)) edges[from]!.push(to);
  };
  for (let n = 0; n < cells.length; n++) {
    const cell = cells[n] as number;
    const x = cell % grid.width;
    const y = Math.floor(cell / grid.width);
    // 같은 높이의 이웃 칸으로 걷기
    for (const dx of [-1, 1]) {
      if (isStandable(grid, x + dx, y)) add(n, y * grid.width + x + dx);
    }
    const feet = (y + 1) * s;
    for (const st of STRATEGIES) {
      if (st.drop && !isOneWayTile(getTile(grid, x, y + 1))) continue;
      let cx = x * s + s / 2;
      if (st.fromEdge && st.dir !== 0) {
        // 다음 칸에 바닥이 없으면 몸이 1px만 걸치도록 최대한 내밀고, 있으면 칸 끝에서 출발
        const nextBelow = getTile(grid, x + st.dir, y + 1);
        const overhang = !(isSolidTile(nextBelow) || isOneWayTile(nextBelow)) && !isSolidTile(getTile(grid, x + st.dir, y)) && !isSolidTile(getTile(grid, x + st.dir, y - 1));
        const edgeOffset = overhang ? s / 2 + p.bodyWidth / 2 - 1 : s / 2 - p.bodyWidth / 2;
        cx += st.dir * edgeOffset;
      }
      add(n, simulate(grid, p, cx, feet, st));
    }
  }
  return { grid, cells, nodeOf, edges };
}

/** 시작 칸들에서 도달 가능한 노드 집합 */
export function reachableFrom(g: ReachGraph, startCells: Iterable<number>): Set<number> {
  const seen = new Set<number>();
  const queue: number[] = [];
  for (const c of startCells) {
    const n = g.nodeOf[c] ?? -1;
    if (n >= 0 && !seen.has(n)) {
      seen.add(n);
      queue.push(n);
    }
  }
  while (queue.length) {
    const n = queue.shift() as number;
    for (const m of g.edges[n] ?? []) {
      if (!seen.has(m)) {
        seen.add(m);
        queue.push(m);
      }
    }
  }
  return seen;
}

/** 목표 칸들에 도달할 수 있는 노드 집합 (역방향 BFS) */
export function canReach(g: ReachGraph, targetCells: Iterable<number>): Set<number> {
  const rev: number[][] = g.cells.map(() => []);
  g.edges.forEach((es, from) => es.forEach((to) => rev[to]!.push(from)));
  const seen = new Set<number>();
  const queue: number[] = [];
  for (const c of targetCells) {
    const n = g.nodeOf[c] ?? -1;
    if (n >= 0 && !seen.has(n)) {
      seen.add(n);
      queue.push(n);
    }
  }
  while (queue.length) {
    const n = queue.shift() as number;
    for (const m of rev[n] ?? []) {
      if (!seen.has(m)) {
        seen.add(m);
        queue.push(m);
      }
    }
  }
  return seen;
}
