/**
 * 방 템플릿 자동 생성기 (오프라인 도구, 기획자 요청: 방마다 다른 굴 모양과 출입구 자리).
 * 런타임에는 쓰지 않는다: scripts/gen-rooms.mjs가 이 함수로 만든 템플릿 중 검증을 통과한 것만
 * src/rooms/gen/*.txt로 저장하고, 게임은 그 파일을 읽는다 (시드 고정, 테스트로 다시 검증).
 *
 * 순서: 굴 지형(바닥/천장 높낮이, 바위 턱, 떠 있는 바위) → 출입구 자리 확보 →
 * 도달성 시뮬레이터로 막힌 곳을 찾아 발판 사다리를 놓고 바위를 판다(반복) → 표식(P, M, C, t, o) → 최종 검증.
 */
import { DOOR, ROOM, SIDE_SLOTS, VERTICAL_SLOTS, ledgeCols, type DoorSlot, type SideSlot, type VerticalSlot } from '../../config/generation';
import type { Rng } from '../rng';
import { buildReachGraph, canReach, reachableFrom, type ReachGraph, type ReachParams } from './reach';
import { capKey, isSideDir, lintTemplate, maskOf, resolveTemplate, type Dir, type DoorCap, type RoomTemplate } from './template';
import { buildComposite, validateTemplate } from './validateTemplate';

const RW = ROOM.widthTiles;
const RH = ROOM.heightTiles;

class Canvas {
  readonly c: string[];
  /** 출입구별 안쪽 대표 칸과 접근 열 (capKey → [x, y, 접근 x]) */
  readonly entries = new Map<string, [number, number, number]>();
  /** 지우거나 덮으면 안 되는 칸 (출입구 바닥, 발사대, 착지 턱) */
  readonly locked = new Set<number>();
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.c = new Array<string>(w * h).fill('#');
  }
  get(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return '#';
    return this.c[y * this.w + x]!;
  }
  set(x: number, y: number, ch: string): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.c[y * this.w + x] = ch;
  }
  inner(x: number, y: number): boolean {
    return x > 0 && y > 0 && x < this.w - 1 && y < this.h - 1;
  }
  isLocked(x: number, y: number): boolean {
    return this.locked.has(y * this.w + x);
  }
  lock(x: number, y: number, ch: string): void {
    this.set(x, y, ch);
    this.locked.add(y * this.w + x);
  }
  /** 바위를 판다 (테두리, 출입구, 잠긴 칸은 그대로) */
  carve(x: number, y: number): void {
    if (!this.inner(x, y) || this.isLocked(x, y)) return;
    if (this.get(x, y) === '#') this.set(x, y, '.');
  }
  rows(): string[] {
    const out: string[] = [];
    for (let y = 0; y < this.h; y++) out.push(this.c.slice(y * this.w, (y + 1) * this.w).join(''));
    return out;
  }
}

export interface RoomSpec {
  readonly id: string;
  readonly cw: number;
  readonly ch: number;
  readonly caps: readonly DoorCap[];
}

function toTemplate(spec: RoomSpec, cv: Canvas): RoomTemplate {
  return {
    id: spec.id,
    source: 'gen',
    width: cv.w,
    height: cv.h,
    cw: spec.cw,
    ch: spec.ch,
    rows: cv.rows(),
    caps: spec.caps,
    doors: maskOf(spec.caps.map((c) => c.dir)),
    arena: false,
    flipped: false,
  };
}

/** 출입구 안쪽의 대표 칸 (서 있는 칸, 템플릿 좌표) */
function entryCell(cv: Canvas, c: DoorCap): [number, number] {
  const e = cv.entries.get(capKey(c));
  if (e) return [e[0], e[1]];
  if (isSideDir(c.dir)) {
    const rows = DOOR.side[c.slot as SideSlot];
    const y = c.seg * RH + rows[3]!;
    return [c.dir === 'left' ? 1 : cv.w - 2, y];
  }
  const cols = DOOR.vertical[c.slot as VerticalSlot].map((x) => c.seg * RW + x);
  if (c.dir === 'up') return [cols[1]!, DOOR.launchRow - 1];
  return [cols[0]! - 2, cv.h - 2];
}

/** 동굴: 칸마다 큰 공간(가장자리가 울퉁불퉁한 타원), 작은 공간 몇 개, 공간끼리와 출입구에서 공간까지 굴로 잇고 다듬는다 */
function carveCaves(rng: Rng, spec: RoomSpec, cv: Canvas): void {
  const W = cv.w;
  const H = cv.h;
  const blob = (cx: number, cy: number, rx: number, ry: number) => {
    const sectors = Array.from({ length: 12 }, () => 0.75 + rng.next() * 0.35);
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const ang = Math.atan2(dy, dx);
        const k = sectors[Math.floor(((ang + Math.PI) / (2 * Math.PI)) * 12) % 12]!;
        if (dx * dx + dy * dy <= k * k) cv.carve(x, y);
      }
    }
  };
  const tunnel = (a: [number, number], b: [number, number], h: number) => {
    const [ax, ay] = a;
    const [bx, by] = b;
    const box = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) cv.carve(x, y);
    };
    if (rng.chance(0.5)) {
      box(ax, ay - h + 1, bx, ay);
      box(bx - 2, ay, bx + 2, by);
    } else {
      box(ax - 2, ay, ax + 2, by);
      box(ax, by - h + 1, bx, by);
    }
  };
  const centers: [number, number][] = [];
  for (let gy = 0; gy < spec.ch; gy++) {
    for (let gx = 0; gx < spec.cw; gx++) {
      const c: [number, number] = [gx * RW + 15 + rng.int(-4, 4), gy * RH + 9 + rng.int(-2, 2)];
      blob(c[0], c[1], rng.int(9, 13), rng.int(5, 7));
      centers.push(c);
    }
  }
  const cells = spec.cw * spec.ch;
  for (let i = 0; i < cells + 1; i++) {
    const c: [number, number] = [rng.int(5, W - 6), rng.int(4, H - 5)];
    blob(c[0], c[1], rng.int(4, 8), rng.int(3, 5));
  }
  for (let i = 1; i < centers.length; i++) tunnel(centers[i - 1]!, centers[i]!, rng.int(4, 6));
  const nearest = (p: [number, number]) => centers.reduce((b, c) => (Math.hypot(c[0] - p[0], c[1] - p[1]) < Math.hypot(b[0] - p[0], b[1] - p[1]) ? c : b));
  for (const c of spec.caps) {
    let e: [number, number];
    if (isSideDir(c.dir)) {
      const rows = DOOR.side[c.slot as SideSlot];
      e = [c.dir === 'left' ? 2 : W - 3, c.seg * RH + rows[3]!];
    } else {
      const cols = DOOR.vertical[c.slot as VerticalSlot].map((x) => c.seg * RW + x);
      e = [cols[1]! + 1, c.dir === 'up' ? 3 : H - 3];
    }
    tunnel(e, nearest(e), rng.int(4, 5));
  }
  // 가장자리 다듬기 (주변 9칸 중 바위가 5칸 이상이면 바위)
  for (let pass = 0; pass < 2; pass++) {
    const next = cv.c.slice();
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        let rock = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cv.get(x + dx, y + dy) === '#') rock++;
        next[y * W + x] = rock >= 5 ? '#' : '.';
      }
    }
    cv.c.splice(0, cv.c.length, ...next);
  }
}

/** 굴 지형과 출입구 자리 */
function sculpt(rng: Rng, spec: RoomSpec): Canvas {
  const W = spec.cw * RW;
  const H = spec.ch * RH;
  const cv = new Canvas(W, H);
  carveCaves(rng, spec, cv);

  // 출입구 자리
  for (const c of spec.caps) {
    if (isSideDir(c.dir)) {
      const rows = DOOR.side[c.slot as SideSlot].map((r) => c.seg * RH + r);
      const edgeX = c.dir === 'left' ? 0 : W - 1;
      const step = c.dir === 'left' ? 1 : -1;
      const floorY = rows[3]! + 1;
      const shelf = rng.int(3, 6);
      for (let i = 1; i <= shelf + 1; i++) {
        const x = edgeX + step * i;
        for (let y = rows[0]! - 1; y <= rows[3]!; y++) cv.set(x, y, '.');
      }
      for (const y of rows) {
        cv.lock(edgeX, y, 'D');
        cv.lock(edgeX + step, y, '.');
      }
      cv.lock(edgeX, floorY, '#');
      for (let i = 1; i <= shelf; i++) cv.lock(edgeX + step * i, floorY, '#');
      // 턱 끝에 서는 칸, 아래에서 올라올 때는 턱 바깥쪽 열로 접근
      const tipX = edgeX + step * shelf;
      cv.entries.set(capKey(c), [tipX, rows[3]!, tipX + step * 2]);
      for (let y = rows[0]!; y <= rows[3]!; y++) cv.lock(tipX + step, y, '.');
      // 높은 턱 아래는 바위로 채우거나(절벽) 비워 둔다(선반)
      if (floorY < H - 1 && rng.chance(0.5)) {
        const depth = rng.int(1, 3);
        for (let y = floorY + 1; y <= Math.min(H - 2, floorY + depth); y++) for (let i = 1; i <= shelf - 1; i++) cv.set(edgeX + step * i, y, '#');
      }
    } else if (c.dir === 'up') {
      const cols = DOOR.vertical[c.slot as VerticalSlot].map((x) => c.seg * RW + x);
      for (let x = cols[0]! - 1; x <= cols[3]! + 1; x++) for (let y = 1; y <= DOOR.launchRow + 3; y++) cv.set(x, y, '.');
      for (const x of cols) {
        cv.lock(x, 0, 'D');
        cv.lock(x, DOOR.launchRow, '=');
      }
      cv.lock(cols[0]! - 1, 1, '.');
      cv.lock(cols[3]! + 1, 1, '.');
    } else {
      const cols = DOOR.vertical[c.slot as VerticalSlot].map((x) => c.seg * RW + x);
      for (const x of cols) cv.lock(x, H - 1, 'D');
      const ledges = ledgeCols(c.slot as VerticalSlot).map((x) => c.seg * RW + x);
      for (const x of ledges) cv.lock(x, H - 1, '#');
      for (const r of DOOR.ledgeClearRows) for (let x = ledges[0]!; x <= ledges[3]!; x++) cv.lock(x, H - RH + r, '.');
    }
  }
  return cv;
}

interface Analysis {
  readonly g: ReachGraph;
  readonly comp: ReturnType<typeof buildComposite>;
  /** 템플릿 좌표 ↔ 합성 격자 칸 */
  readonly toCell: (x: number, y: number) => number;
  readonly toXY: (cell: number) => [number, number];
}

function analyze(spec: RoomSpec, cv: Canvas, p: ReachParams, variant = { optionalOn: false, trapOn: false }): Analysis {
  const t = toTemplate(spec, cv);
  const { grid } = resolveTemplate(t, { open: t.caps, optionalOn: variant.optionalOn, trapOn: variant.trapOn, secretActive: true });
  const comp = buildComposite(t, grid);
  const g = buildReachGraph(comp.grid, p);
  const W = comp.grid.width;
  return {
    g,
    comp,
    toCell: (x, y) => (y + comp.oy) * W + x + comp.ox,
    toXY: (cell) => [(cell % W) - comp.ox, Math.floor(cell / W) - comp.oy],
  };
}

type Problem = { from: Set<number>; to: [number, number]; approachX?: number | undefined; fromBelow?: boolean };

/** 다음에 고칠 문제 하나 (없으면 null) */
function findProblem(spec: RoomSpec, cv: Canvas, a: Analysis): Problem | null {
  const { g, comp } = a;
  const stubs = comp.stubs;
  if (stubs.length === 0) return null;
  const r0 = reachableFrom(g, stubs[0]!.starts);
  const hits = (reach: Set<number>, area: number[]) => area.some((c) => reach.has(g.nodeOf[c] as number));
  for (let j = 1; j < stubs.length; j++) {
    const target = (c: DoorCap): Problem => ({
      from: new Set(),
      to: entryCell(cv, c),
      approachX: cv.entries.get(capKey(c))?.[2],
      // 발사대(천장 바로 아래)는 같은 높이에서 걸어갈 수 없으니 아래에서 올라간다
      fromBelow: c.dir === 'up',
    });
    if (!hits(r0, stubs[j]!.area)) return { ...target(spec.caps[j]!), from: r0 };
    const rj = reachableFrom(g, stubs[j]!.starts);
    if (!hits(rj, stubs[0]!.area)) return { ...target(spec.caps[0]!), from: rj };
  }
  const returnable = canReach(
    g,
    stubs.flatMap((s) => s.area),
  );
  for (const n of r0) {
    if (returnable.has(n)) continue;
    // 구덩이: 그 칸에서 돌아갈 수 있는 가장 가까운 칸으로 사다리
    const [px, py] = a.toXY(g.cells[n] as number);
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const m of returnable) {
      const [x, y] = a.toXY(g.cells[m] as number);
      if (!cv.inner(x, y)) continue;
      const d = Math.abs(x - px) + Math.abs(y - py) * 1.5;
      if (d < bestD) {
        bestD = d;
        best = [x, y];
      }
    }
    if (best) return { from: new Set([n]), to: best };
  }
  return null;
}

/** from 집합 중 목표에 가장 가까운 칸에서 목표까지 발판 사다리를 놓고 길을 판다 */
function bridge(rng: Rng, cv: Canvas, a: Analysis, pr: Problem, depth = 0): void {
  const [tx, ty] = pr.to;
  let sx = -1;
  let sy = -1;
  let bestD = Infinity;
  const below = pr.fromBelow && [...pr.from].some((n) => a.toXY(a.g.cells[n] as number)[1] >= ty + 3);
  for (const n of pr.from) {
    const [x, y] = a.toXY(a.g.cells[n] as number);
    if (!cv.inner(x, y)) continue;
    if (below && y < ty + 3) continue;
    const d = Math.abs(x - tx) + Math.abs(y - ty) * 1.2;
    if (d < bestD) {
      bestD = d;
      sx = x;
      sy = y;
    }
  }
  if (sx < 0) return;
  const carveBox = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) cv.carve(x, y);
  };
  const platform = (cx: number, row: number) => {
    for (let x = cx - 2; x <= cx + 2; x++) {
      if (!cv.inner(x, row) || cv.isLocked(x, row)) continue;
      if (cv.get(x, row) === '.') cv.set(x, row, '=');
    }
  };
  if (ty >= sy) {
    // 목표가 같은 높이거나 아래: 사이를 파서 걸어가거나 떨어질 수 있게
    carveBox(sx, Math.min(sy, ty) - 2, tx, Math.max(sy, ty));
    genStats.flat++;
    // 바닥이 없는 넓은 틈만 바위 턱으로 메운다 (발밑 3칸 안에 바닥이 있으면 그대로)
    const dir = Math.sign(tx - sx) || 1;
    let run = 0;
    for (let x = sx + dir; tx !== sx && x !== tx; x += dir) {
      let floor = false;
      for (let dy = 1; dy <= 3; dy++) {
        const ch = cv.get(x, sy + dy);
        if (ch === '#' || ch === '=' || ch === 'D') floor = true;
      }
      run = floor ? 0 : run + 1;
      // 4칸 넘게 바닥이 없으면 가운데에 2칸짜리 바위 턱
      if (run >= 4 && cv.get(x, sy + 1) === '.' && !cv.isLocked(x, sy + 1)) {
        cv.set(x, sy + 1, '#');
        if (cv.get(x - dir, sy + 1) === '.' && !cv.isLocked(x - dir, sy + 1)) cv.set(x - dir, sy + 1, '#');
        run = 0;
      }
    }
    return;
  }
  // 목표가 위: 목표 칸 옆 열에 넝쿨을 늘어뜨린다 (위는 바위에 매달리고 아래는 바닥까지)
  if (depth < 3 && hangVine(rng, cv, a, pr, sx, sy, tx, ty, depth)) return;
  genStats.ladder++;
  // 넝쿨을 놓을 자리가 없으면 발판 사다리: 한 단계에 위로 2칸, 옆으로 3칸까지, 마지막 발판은 접근 열에
  const ax = pr.approachX ?? tx;
  const steps = Math.max(Math.ceil((sy - ty) / 2), Math.ceil(Math.abs(ax - sx) / 3) + 1, 1);
  let px = sx;
  let py = sy;
  for (let k = 1; k <= steps; k++) {
    const last = k === steps;
    // 목표 바로 밑 두 줄은 몸이 들어갈 자리라 발판을 두지 않는다
    const y = last ? ty : Math.max(ty + 2, Math.round(sy - ((sy - ty) * k) / steps));
    const x = last ? tx : k === steps - 1 ? ax : Math.round(sx + ((ax - sx) * k) / (steps - 1)) + rng.int(-1, 1);
    carveBox(px, py, x, y - 2);
    carveBox(x - 2, y - 2, x + 2, y);
    if (!last) platform(x, y + 1);
    px = x;
    py = y;
  }
}

/**
 * 목표(tx, ty)에 서는 높이까지 닿는 넝쿨을 목표 옆 열에 놓는다. 이미 놓은 넝쿨이면 넝쿨 아래까지 가는 길을 잇는다.
 * 넝쿨 규칙은 reach.ts의 addVineEdges와 같다: 옆 칸(x±1, r-1)으로 내리려면 넝쿨이 r-1행 또는 r행을 덮어야 한다.
 */
function hangVine(rng: Rng, cv: Canvas, a: Analysis, pr: Problem, sx: number, _sy: number, tx: number, ty: number, depth: number): boolean {
  const pref = pr.approachX !== undefined ? Math.sign(pr.approachX - tx) || 1 : Math.sign(sx - tx) || 1;
  const vineOk = (x: number, y: number) => cv.inner(x, y) && (cv.get(x, y) === '.' || cv.get(x, y) === '|');
  let vx = -1;
  for (const d of [1, 2, 3]) {
    for (const sgn of [pref, -pref]) {
      const x = tx + sgn * d;
      if (vx < 0 && vineOk(x, ty) && vineOk(x, ty + 1) && !cv.isLocked(x, ty + 1)) vx = x;
    }
    if (vx >= 0) break;
  }
  if (vx < 0) {
    // 양옆이 바위: 목표 옆 한 열을 파서 넝쿨 자리를 만든다
    const x = tx + pref;
    if (depth >= 2 || !cv.inner(x, ty) || cv.isLocked(x, ty) || cv.isLocked(x, ty + 1)) return failVine('no column');
    for (let y = ty - 1; y <= ty + 1; y++) cv.carve(x, y);
    if (!vineOk(x, ty) || !vineOk(x, ty + 1)) return failVine('no column');
    vx = x;
  }
  // 아래로 바닥(바위/발판)까지
  let yb = ty + 1;
  while (yb + 1 < cv.h - 1 && vineOk(vx, yb + 1) && yb - ty < 20) yb++;
  const below = cv.get(vx, yb + 1);
  if (below !== '#' && below !== '=') return failVine(`below ${below}`);
  if (yb - ty < 2) {
    // 높이 차가 작다: 넝쿨 대신 머리 위 공간을 파서 뛰어오를 수 있게
    let carved = false;
    for (let y = ty - 2; y <= ty; y++) {
      for (let x = Math.min(vx, tx) - 1; x <= Math.max(vx, tx) + 1; x++) {
        if (cv.get(x, y) === '#' && cv.inner(x, y) && !cv.isLocked(x, y)) carved = true;
        cv.carve(x, y);
      }
    }
    if (carved) return true;
    // 목표 옆 바닥까지 가는 길이 문제: 거기까지 잇는다
    if (depth < 2 && (vx !== sx || yb !== _sy)) {
      bridge(rng, cv, a, { from: pr.from, to: [vx, yb] }, depth + 1);
      return true;
    }
    return failVine('short');
  }
  if (cv.get(vx, ty) === '|') {
    // 이미 놓은 넝쿨: 넝쿨 아래 바닥까지 가는 길이 문제다
    bridge(rng, cv, a, { from: pr.from, to: [vx, yb] }, depth + 1);
    return true;
  }
  // 위로는 바위에 닿을 때까지(최대 5칸) 늘인다
  let yt = ty;
  while (yt - 1 > 0 && cv.get(vx, yt - 1) === '.' && !cv.isLocked(vx, yt - 1) && ty - yt < 5) yt--;
  for (let y = yt; y <= yb; y++) cv.set(vx, y, '|');
  genStats.vine++;
  return true;
}

/** 표식: 포탈 후보, 몬스터, 상자, 함정, 선택적 발판 */
function placeMarkers(rng: Rng, spec: RoomSpec, cv: Canvas, a: Analysis): boolean {
  const { g, comp } = a;
  const r0 = reachableFrom(g, comp.stubs[0]!.starts);
  const returnable = canReach(
    g,
    comp.stubs.flatMap((s) => s.area),
  );
  const entries = spec.caps.map((c) => entryCell(cv, c));
  const nearDoor = (x: number, y: number, r: number) => entries.some(([ex, ey]) => Math.abs(ex - x) + Math.abs(ey - y) < r);
  const spots: [number, number][] = [];
  for (const n of r0) {
    if (!returnable.has(n)) continue;
    const [x, y] = a.toXY(g.cells[n] as number);
    if (!cv.inner(x, y) || cv.get(x, y) !== '.' || cv.isLocked(x, y)) continue;
    // 머리 위 두 칸이 비어 있어야 한다 (포탈/상자/몬스터가 들어갈 자리, 발판 바로 밑 제외)
    if (cv.get(x, y - 1) !== '.' || cv.get(x, y - 2) === '#' || cv.get(x, y - 2) === 'D') continue;
    spots.push([x, y]);
  }
  if (spots.length < 6) return false;
  const solidBelow = (x: number, y: number) => cv.get(x, y + 1) === '#';
  const flat = (x: number, y: number) => solidBelow(x, y) && spots.some(([sx, sy]) => sy === y && sx === x - 1) && spots.some(([sx, sy]) => sy === y && sx === x + 1);
  const used: [number, number][] = [];
  const far = (x: number, y: number, d: number) => used.every(([ux, uy]) => Math.abs(ux - x) + Math.abs(uy - y) >= d);
  const pick = (pool: [number, number][], ch: string, count: number, minGap: number): number => {
    let placed = 0;
    for (const [x, y] of rng.shuffle(pool)) {
      if (placed >= count) break;
      if (!far(x, y, minGap) || cv.get(x, y) !== '.') continue;
      cv.set(x, y, ch);
      used.push([x, y]);
      placed++;
    }
    return placed;
  };
  const cells = spec.cw * spec.ch;
  // 포탈 후보: 평평한 바닥, 출입구에서 떨어진 곳
  const pPool = spots.filter(([x, y]) => flat(x, y) && !nearDoor(x, y, 6) && cv.get(x, y - 2) !== '#');
  let portals = pick(pPool, 'P', 1 + cells, 6);
  // 평평한 곳이 없으면 출입구에서 조금만 떨어진 바닥이라도
  if (portals < 1) portals = pick(spots.filter(([x, y]) => solidBelow(x, y) && !nearDoor(x, y, 3) && cv.get(x, y - 2) !== '#'), 'P', 1, 4);
  if (portals < 1) return false;
  // 몬스터: 출입구에서 떨어진 곳
  pick(
    spots.filter(([x, y]) => !nearDoor(x, y, 7)),
    'M',
    rng.int(2, 3) * cells,
    5,
  );
  // 상자: 높은 곳 우선 (찾아가는 재미)
  if (rng.chance(0.65)) {
    const cPool = spots.filter(([x, y]) => solidBelow(x, y) && !nearDoor(x, y, 6)).sort((p1, p2) => p1[1] - p2[1]);
    pick(cPool.slice(0, Math.max(3, Math.floor(cPool.length / 3))), 'C', cells > 2 ? 2 : 1, 6);
  }
  // 함정 가시 후보: 평평한 바닥 2~3칸
  if (rng.chance(0.35)) {
    const tPool = spots.filter(([x, y]) => flat(x, y) && !nearDoor(x, y, 6) && far(x, y, 3));
    const start = tPool.length ? rng.pick(tPool) : null;
    if (start) {
      const [x, y] = start;
      for (let dx = 0; dx < rng.int(2, 3); dx++) if (cv.get(x + dx, y) === '.' && solidBelow(x + dx, y)) cv.set(x + dx, y, 't');
    }
  }
  // 선택적 발판: 공중의 빈 곳
  if (rng.chance(0.45)) {
    for (let tries = 0; tries < 20; tries++) {
      const x = rng.int(3, cv.w - 8);
      const y = rng.int(4, cv.h - 5);
      let ok = true;
      for (let dx = 0; dx < 4; dx++) for (let dy = -3; dy <= 1; dy++) if (cv.get(x + dx, y + dy) !== '.') ok = false;
      if (!ok) continue;
      for (let dx = 0; dx < 4; dx++) cv.set(x + dx, y, 'o');
      break;
    }
  }
  return true;
}

/** 방 하나를 만든다. 검증을 통과하지 못하면 null */
/** 생성 통계 (스크립트/디버그용) */
export const genStats = { vine: 0, vineFail: {} as Record<string, number>, ladder: 0, flat: 0 };
const failVine = (why: string): boolean => {
  genStats.vineFail[why] = (genStats.vineFail[why] ?? 0) + 1;
  return false;
};

/** 마지막 실패 이유 (생성 스크립트 통계용) */
export let lastFailure = '';

export function generateRoom(rng: Rng, spec: RoomSpec, p: ReachParams): RoomTemplate | null {
  const cv = sculpt(rng, spec);
  let a = analyze(spec, cv, p);
  for (let iter = 0; iter < 24; iter++) {
    const pr = findProblem(spec, cv, a);
    if (!pr) break;
    bridge(rng, cv, a, pr);
    a = analyze(spec, cv, p);
  }
  const left = findProblem(spec, cv, a);
  if (left) {
    lastFailure = `fix: ${left.from.size} -> ${left.to}\n${cv.rows().join('\n')}`;
    return null;
  }
  if (!placeMarkers(rng, spec, cv, a)) {
    lastFailure = 'markers';
    return null;
  }
  let t = toTemplate(spec, cv);
  // 함정/선택적 발판 때문에 실패하면 그것만 지우고 다시 검사
  for (const strip of [[], ['t'], ['t', 'o']] as string[][]) {
    if (strip.length) {
      for (let i = 0; i < cv.c.length; i++) if (strip.includes(cv.c[i]!)) cv.c[i] = '.';
      t = toTemplate(spec, cv);
    }
    const errs = [...lintTemplate(t), ...validateTemplate(t, p).flatMap((c) => c.errors.map((e) => `${c.variant} ${e}`))];
    if (errs.length === 0) return t;
    lastFailure = `final: ${errs.slice(0, 3).join(' | ')}`;
  }
  return null;
}

/** 칸 크기에 맞는 출입구 목록을 무작위로 정한다 (변마다 확률, 1~2자리) */
export function randomCaps(rng: Rng, cw: number, ch: number, edgeChance: number): DoorCap[] {
  const caps: DoorCap[] = [];
  const dirs: Dir[] = ['left', 'right', 'up', 'down'];
  for (const dir of dirs) {
    const segs = isSideDir(dir) ? ch : cw;
    for (let seg = 0; seg < segs; seg++) {
      if (!rng.chance(edgeChance)) continue;
      const slots: readonly DoorSlot[] = isSideDir(dir) ? SIDE_SLOTS : VERTICAL_SLOTS;
      const n = rng.chance(0.45) ? 2 : 1;
      for (const slot of rng.shuffle(slots).slice(0, n)) caps.push({ dir, seg, slot });
    }
  }
  return caps;
}

/** 템플릿을 파일 형식 텍스트로 */
export function formatTemplate(t: RoomTemplate): string {
  return `@${t.id}\n; ${t.cw}x${t.ch} ${t.caps.map(capKey).join(' ')}\n${t.rows.join('\n')}\n`;
}

/** 디버그: 실패한 방을 다시 만들어, 첫 출입구에서 도달 가능한 칸을 '*'로 표시한 지도 */
export function debugRoom(rng: Rng, spec: RoomSpec, p: ReachParams): string {
  const cv = sculpt(rng, spec);
  let a = analyze(spec, cv, p);
  for (let iter = 0; iter < 24; iter++) {
    const pr = findProblem(spec, cv, a);
    if (!pr) break;
    bridge(rng, cv, a, pr);
    a = analyze(spec, cv, p);
  }
  const pr = findProblem(spec, cv, a);
  const r0 = reachableFrom(a.g, a.comp.stubs[0]!.starts);
  const rows = cv.rows().map((r) => r.split(''));
  for (const n of r0) {
    const [x, y] = a.toXY(a.g.cells[n] as number);
    if (rows[y]?.[x] === '.') rows[y]![x] = '*';
  }
  return `caps ${spec.caps.map(capKey).join(' ')} problem ${pr ? `${pr.to} from ${pr.from.size}` : 'none'}\n${rows.map((r) => r.join('')).join('\n')}`;
}
