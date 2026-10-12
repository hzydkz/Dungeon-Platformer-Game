/**
 * 방 템플릿: ASCII 파서, 좌우 반전, 규격 검사, 타일 변환 (기획서 5.3). Phaser 비의존.
 *
 * 파일 형식: `@아이디 [arena]` 줄 다음에 템플릿 본문. `;`로 시작하는 줄은 주석.
 * 크기는 방 칸(30×17)의 정수배 (1×1, 2×1, 3×1, 1×2, 2×2 등).
 * 문자: # 벽, . 빈칸, = 단방향 발판, ^ 가시, M 몬스터 스폰, C 상자, P 포탈 후보(특수 위치), D 출입구,
 *       o 선택적 발판(방마다 한꺼번에 켜짐/꺼짐), t 함정 가시(함정 방에서만), S 비밀 벽(부서짐),
 *       c 비밀 상자(비밀 벽이 활성일 때만), b 보스 스폰(아레나 전용), | 넝쿨(오르내릴 수 있는 칸)
 *
 * 출입구: 가장자리의 각 칸 구간(seg)마다 규격 자리(config/generation.ts의 DOOR)가 있고, 그 자리가 모두 D면
 * 그 방향·구간·자리로 이어질 수 있다(DoorCap). 층을 만들 때 실제로 쓰는 출입구만 열고 나머지 D는 벽이 된다.
 */
import { DOOR, ROOM, SIDE_SLOTS, VERTICAL_SLOTS, ledgeCols, type DoorSlot, type SideSlot, type VerticalSlot } from '../../config/generation';
import { Tile, createGrid, setTile, type TileGrid, type TileId } from '../tiles';

export type Dir = 'left' | 'right' | 'up' | 'down';
export const DIRS: readonly Dir[] = ['left', 'right', 'up', 'down'];
export const DIR_BIT: Readonly<Record<Dir, number>> = { left: 1, right: 2, up: 4, down: 8 };
export const OPPOSITE: Readonly<Record<Dir, Dir>> = { left: 'right', right: 'left', up: 'down', down: 'up' };
export const DIR_DELTA: Readonly<Record<Dir, readonly [number, number]>> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

export function maskOf(dirs: Iterable<Dir>): number {
  let m = 0;
  for (const d of dirs) m |= DIR_BIT[d];
  return m;
}

export function dirsOf(mask: number): Dir[] {
  return DIRS.filter((d) => (mask & DIR_BIT[d]) !== 0);
}

export function maskLabel(mask: number): string {
  return dirsOf(mask)
    .map((d) => ({ left: 'L', right: 'R', up: 'U', down: 'D' })[d])
    .join('');
}

export const isSideDir = (d: Dir): boolean => d === 'left' || d === 'right';

/** 출입구 하나: 방향, 그 변의 칸 구간 번호(왼쪽/위부터 0), 규격 자리 */
export interface DoorCap {
  readonly dir: Dir;
  readonly seg: number;
  readonly slot: DoorSlot;
}

export const capKey = (c: { dir: Dir; seg: number; slot: DoorSlot }): string => `${c.dir}${c.seg}:${c.slot}`;
/** 방향과 구간만 (자리 무관) */
export const edgeKey = (c: { dir: Dir; seg: number }): string => `${c.dir}${c.seg}`;

export interface RoomTemplate {
  readonly id: string;
  readonly source: string;
  /** 타일 크기 */
  readonly width: number;
  readonly height: number;
  /** 칸 크기 */
  readonly cw: number;
  readonly ch: number;
  readonly rows: readonly string[];
  /** 쓸 수 있는 출입구 */
  readonly caps: readonly DoorCap[];
  /** 출입구가 있는 방향 마스크 */
  readonly doors: number;
  readonly arena: boolean;
  readonly flipped: boolean;
}

const KNOWN = new Set('#.=^MCPDotScb|'.split(''));

/** 출입구 자리의 타일 좌표 목록 (템플릿 기준) */
export function capTiles(t: { width: number; height: number }, c: DoorCap): [number, number][] {
  const RW = ROOM.widthTiles;
  const RH = ROOM.heightTiles;
  if (isSideDir(c.dir)) {
    const x = c.dir === 'left' ? 0 : t.width - 1;
    return DOOR.side[c.slot as SideSlot].map((r) => [x, c.seg * RH + r] as [number, number]);
  }
  const y = c.dir === 'up' ? 0 : t.height - 1;
  return DOOR.vertical[c.slot as VerticalSlot].map((col) => [c.seg * RW + col, y] as [number, number]);
}

function detectCaps(rows: readonly string[], width: number, height: number): DoorCap[] {
  const at = (x: number, y: number) => rows[y]?.[x] ?? '#';
  const cw = Math.round(width / ROOM.widthTiles);
  const ch = Math.round(height / ROOM.heightTiles);
  const caps: DoorCap[] = [];
  const size = { width, height };
  for (const dir of DIRS) {
    const segs = isSideDir(dir) ? ch : cw;
    const slots: readonly DoorSlot[] = isSideDir(dir) ? SIDE_SLOTS : VERTICAL_SLOTS;
    for (let seg = 0; seg < segs; seg++) {
      for (const slot of slots) {
        const c = { dir, seg, slot };
        if (capTiles(size, c).every(([x, y]) => at(x, y) === 'D')) caps.push(c);
      }
    }
  }
  return caps;
}

export function parseTemplateFile(text: string, source: string): RoomTemplate[] {
  const out: RoomTemplate[] = [];
  let current: { id: string; arena: boolean; rows: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const rows = current.rows;
    const width = Math.max(...rows.map((r) => r.length));
    const height = rows.length;
    const caps = detectCaps(rows, width, height);
    out.push({
      id: current.id,
      source,
      width,
      height,
      cw: Math.max(1, Math.round(width / ROOM.widthTiles)),
      ch: Math.max(1, Math.round(height / ROOM.heightTiles)),
      rows,
      caps,
      doors: maskOf(caps.map((c) => c.dir)),
      arena: current.arena,
      flipped: false,
    });
    current = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith(';')) continue;
    if (line.startsWith('@')) {
      flush();
      const [id, ...tags] = line.slice(1).trim().split(/\s+/);
      current = { id: id ?? '', arena: tags.includes('arena'), rows: [] };
      continue;
    }
    if (line === '') continue;
    if (!current) throw new Error(`${source}: @아이디 없이 본문이 시작됨`);
    current.rows.push(line);
  }
  flush();
  return out;
}

const FLIP_SLOT: Readonly<Record<DoorSlot, DoorSlot>> = { low: 'low', high: 'high', left: 'right', mid: 'mid', right: 'left' };

/** 출입구를 좌우 반전 */
export function flipCap(c: DoorCap, cw: number): DoorCap {
  if (isSideDir(c.dir)) return { dir: OPPOSITE[c.dir], seg: c.seg, slot: c.slot };
  return { dir: c.dir, seg: cw - 1 - c.seg, slot: FLIP_SLOT[c.slot] };
}

export function flipTemplate(t: RoomTemplate): RoomTemplate {
  const rows = t.rows.map((r) => r.padEnd(t.width, '#').split('').reverse().join(''));
  const caps = t.caps.map((c) => flipCap(c, t.cw));
  return { ...t, id: `${t.id}~f`, rows, caps, doors: maskOf(caps.map((c) => c.dir)), flipped: !t.flipped };
}

const SOLID_CHARS = new Set(['#', 'S']);
const nonSolid = (ch: string) => !SOLID_CHARS.has(ch) && ch !== 'D' && ch !== 'o' && ch !== '=';

/** 템플릿 규격 위반 목록 */
export function lintTemplate(t: RoomTemplate): string[] {
  const errs: string[] = [];
  const RW = ROOM.widthTiles;
  const RH = ROOM.heightTiles;
  const W = t.width;
  const H = t.height;
  const tag = `${t.source}@${t.id}`;
  if (W % RW !== 0 || W === 0) errs.push(`${tag}: 폭 ${W}이 ${RW}의 배수가 아님`);
  if (H % RH !== 0 || H === 0) errs.push(`${tag}: 높이 ${H}이 ${RH}의 배수가 아님`);
  if (t.arena && (t.cw !== 2 || t.ch !== 1)) errs.push(`${tag}: 아레나는 2×1`);
  t.rows.forEach((r, y) => {
    if (r.length !== W) errs.push(`${tag}: ${y}행 폭 ${r.length} (필요 ${W})`);
    for (const ch of r) if (!KNOWN.has(ch)) errs.push(`${tag}: ${y}행 알 수 없는 문자 '${ch}'`);
  });
  if (errs.length) return errs;
  const at = (x: number, y: number) => t.rows[y]?.[x] ?? '#';

  // 테두리: 벽 또는 규격 자리의 D만
  const doorCells = new Set<string>();
  for (const c of t.caps) for (const [x, y] of capTiles(t, c)) doorCells.add(`${x},${y}`);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      const ch = at(x, y);
      if (ch === 'D' && !doorCells.has(`${x},${y}`)) errs.push(`${tag}: 규격 밖 D (${x},${y})`);
      if (border && ch !== '#' && ch !== 'D') errs.push(`${tag}: 테두리에 '${ch}' (${x},${y})`);
    }
  }
  if (t.caps.length === 0) errs.push(`${tag}: 출입구 없음`);

  for (const c of t.caps) {
    const name = capKey(c);
    if (isSideDir(c.dir)) {
      const edgeX = c.dir === 'left' ? 0 : W - 1;
      const innerX = c.dir === 'left' ? 1 : W - 2;
      const rows = DOOR.side[c.slot as SideSlot];
      const floorY = c.seg * RH + rows[3]! + 1;
      if (at(edgeX, floorY) !== '#' || at(innerX, floorY) !== '#') errs.push(`${tag}: ${name} 출입구 바닥(${floorY}행)이 벽이 아님`);
      for (const r of rows) if (!nonSolid(at(innerX, c.seg * RH + r))) errs.push(`${tag}: ${name} 출입구 안쪽 (${innerX},${c.seg * RH + r}) 막힘`);
    } else if (c.dir === 'up') {
      const cols = DOOR.vertical[c.slot as VerticalSlot].map((col) => c.seg * RW + col);
      for (const x of cols) {
        if (!nonSolid(at(x, 1))) errs.push(`${tag}: ${name} 위 출입구 아래 (${x},1) 막힘`);
        // 발사대는 단방향 발판이어야 한다: 천장 바로 아래 1칸은 몸이 들어가지 않으므로, 벽이면 옆으로 못 내려간다
        if (at(x, DOOR.launchRow) !== '=') errs.push(`${tag}: ${name} 위 출입구 발사대 (${x},${DOOR.launchRow})가 = 가 아님`);
      }
      for (const x of [cols[0]! - 1, cols[3]! + 1]) if (!nonSolid(at(x, 1))) errs.push(`${tag}: ${name} 위 출입구 옆 (${x},1) 막힘`);
    } else {
      const ox = c.seg * RW;
      const ledges = ledgeCols(c.slot as VerticalSlot).map((x) => ox + x);
      for (const x of ledges) if (at(x, H - 1) !== '#') errs.push(`${tag}: ${name} 아래 출입구 착지 턱 (${x},${H - 1})이 벽이 아님`);
      for (const r of DOOR.ledgeClearRows) {
        const y = H - RH + r;
        for (let x = ledges[0]!; x <= ledges[3]!; x++) if (!nonSolid(at(x, y))) errs.push(`${tag}: ${name} 아래 출입구 위 공간 (${x},${y}) 막힘`);
      }
    }
  }
  const count = (ch: string) => t.rows.join('').split(ch).length - 1;
  if (!t.arena && count('P') < 1) errs.push(`${tag}: 포탈 후보(P) 없음`);
  if (t.arena && count('b') < 1) errs.push(`${tag}: 보스 스폰(b) 없음`);
  if (count('c') > 0 && count('S') === 0) errs.push(`${tag}: 비밀 상자(c)가 있는데 비밀 벽(S)이 없음`);
  // P, C, c, b는 바닥 위(아래 칸이 벽/발판)에 있어야 한다
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = at(x, y);
      if ('PCcb'.includes(ch)) {
        const below = at(x, y + 1);
        if (below !== '#' && below !== '=') errs.push(`${tag}: '${ch}' (${x},${y}) 아래에 바닥 없음`);
        const above = at(x, y - 1);
        if (SOLID_CHARS.has(above) || above === 'D' || above === '^') errs.push(`${tag}: '${ch}' (${x},${y}) 위가 막힘`);
      }
    }
  }
  return errs;
}

export interface ResolveOptions {
  /** 여는 출입구 (나머지 D는 벽) */
  readonly open: readonly DoorCap[];
  /** 선택적 발판(o) 켜짐 */
  readonly optionalOn: boolean;
  /** 함정 방: t가 가시 */
  readonly trapOn: boolean;
  /** 비밀 벽 활성: S가 부서지는 벽, 아니면 일반 벽 */
  readonly secretActive: boolean;
  /** 검증용: S를 빈칸으로 (비밀 벽이 부서진 상태) */
  readonly secretBroken?: boolean;
}

export type MarkerKind = 'monster' | 'chest' | 'portal' | 'secretChest' | 'boss';
export interface Marker {
  readonly kind: MarkerKind;
  readonly x: number;
  readonly y: number;
}

const MARKER_OF: Readonly<Record<string, MarkerKind>> = {
  M: 'monster',
  C: 'chest',
  P: 'portal',
  c: 'secretChest',
  b: 'boss',
};

/** 템플릿 문자 → 타일 격자 + 마커 */
export function resolveTemplate(t: RoomTemplate, o: ResolveOptions): { grid: TileGrid; markers: Marker[] } {
  const grid = createGrid(t.width, t.height);
  const markers: Marker[] = [];
  const openTiles = new Set<number>();
  for (const c of o.open) for (const [x, y] of capTiles(t, c)) openTiles.add(y * t.width + x);
  for (let y = 0; y < t.height; y++) {
    for (let x = 0; x < t.width; x++) {
      const ch = t.rows[y]?.[x] ?? '#';
      let tile: TileId = Tile.Empty;
      switch (ch) {
        case '#':
          tile = Tile.Wall;
          break;
        case '=':
          tile = Tile.OneWay;
          break;
        case '^':
          tile = Tile.Spike;
          break;
        case '|':
          tile = Tile.Vine;
          break;
        case 'D':
          tile = openTiles.has(y * t.width + x) ? Tile.Empty : Tile.Wall;
          break;
        case 'o':
          tile = o.optionalOn ? Tile.OneWay : Tile.Empty;
          break;
        case 't':
          tile = o.trapOn ? Tile.Spike : Tile.Empty;
          break;
        case 'S':
          tile = o.secretBroken ? Tile.Empty : o.secretActive ? Tile.Breakable : Tile.Wall;
          break;
        default: {
          const kind = MARKER_OF[ch];
          if (kind) markers.push({ kind, x, y });
        }
      }
      setTile(grid, x, y, tile);
    }
  }
  return { grid, markers };
}

export function templateHas(t: RoomTemplate, ch: string): boolean {
  return t.rows.some((r) => r.includes(ch));
}
