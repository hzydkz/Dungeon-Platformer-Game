/**
 * 방 템플릿: ASCII 파서, 좌우 반전, 규격 검사, 타일 변환 (기획서 5.3). Phaser 비의존.
 *
 * 파일 형식: `@아이디 [arena]` 줄 다음에 템플릿 본문. `;`로 시작하는 줄은 주석.
 * 문자: # 벽, . 빈칸, = 단방향 발판, ^ 가시, M 몬스터 스폰, C 상자, P 포탈 후보, D 출입구,
 *       o 선택적 발판(방마다 한꺼번에 켜짐/꺼짐), t 함정 가시(함정 방에서만), S 비밀 벽(부서짐),
 *       c 비밀 상자(비밀 벽이 활성일 때만), b 보스 스폰(아레나 전용)
 */
import { DOOR, ROOM } from '../../config/generation';
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

export interface RoomTemplate {
  readonly id: string;
  readonly source: string;
  readonly width: number;
  readonly height: number;
  readonly rows: readonly string[];
  /** 출입구 비트마스크 (D 문자로 추론) */
  readonly doors: number;
  readonly arena: boolean;
  readonly flipped: boolean;
}

const KNOWN = new Set('#.=^MCPDotScb'.split(''));

export function parseTemplateFile(text: string, source: string): RoomTemplate[] {
  const out: RoomTemplate[] = [];
  let current: { id: string; arena: boolean; rows: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const rows = current.rows;
    const width = Math.max(...rows.map((r) => r.length));
    out.push({
      id: current.id,
      source,
      width,
      height: rows.length,
      rows,
      doors: detectDoors(rows, width),
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

function detectDoors(rows: readonly string[], width: number): number {
  const at = (x: number, y: number) => rows[y]?.[x] ?? '#';
  const h = rows.length;
  let mask = 0;
  const side = DOOR.sideRows;
  if (side.every((y) => at(0, y) === 'D')) mask |= DIR_BIT.left;
  if (side.every((y) => at(width - 1, y) === 'D')) mask |= DIR_BIT.right;
  if (DOOR.verticalCols.every((x) => at(x, 0) === 'D')) mask |= DIR_BIT.up;
  if (DOOR.verticalCols.every((x) => at(x, h - 1) === 'D')) mask |= DIR_BIT.down;
  return mask;
}

const MIRROR: Readonly<Record<string, string>> = {};

export function flipTemplate(t: RoomTemplate): RoomTemplate {
  const rows = t.rows.map((r) =>
    r
      .padEnd(t.width, '#')
      .split('')
      .reverse()
      .map((ch) => MIRROR[ch] ?? ch)
      .join(''),
  );
  let doors = t.doors & ~(DIR_BIT.left | DIR_BIT.right);
  if (t.doors & DIR_BIT.left) doors |= DIR_BIT.right;
  if (t.doors & DIR_BIT.right) doors |= DIR_BIT.left;
  return { ...t, id: `${t.id}~f`, rows, doors, flipped: !t.flipped };
}

const SOLID_CHARS = new Set(['#', 'S']);
const nonSolid = (ch: string) => !SOLID_CHARS.has(ch) && ch !== 'D' && ch !== 'o' && ch !== '=';

/** 템플릿 규격 위반 목록 */
export function lintTemplate(t: RoomTemplate): string[] {
  const errs: string[] = [];
  const W = t.arena ? ROOM.widthTiles * 2 : ROOM.widthTiles;
  const H = ROOM.heightTiles;
  const tag = `${t.source}@${t.id}`;
  if (t.height !== H) errs.push(`${tag}: 높이 ${t.height} (필요 ${H})`);
  t.rows.forEach((r, y) => {
    if (r.length !== W) errs.push(`${tag}: ${y}행 폭 ${r.length} (필요 ${W})`);
    for (const ch of r) if (!KNOWN.has(ch)) errs.push(`${tag}: ${y}행 알 수 없는 문자 '${ch}'`);
  });
  if (errs.length) return errs;
  const at = (x: number, y: number) => t.rows[y]?.[x] ?? '#';

  // 테두리: 벽 또는 규격 위치의 D만
  const doorCells = new Set<string>();
  if (t.doors & DIR_BIT.left) for (const y of DOOR.sideRows) doorCells.add(`0,${y}`);
  if (t.doors & DIR_BIT.right) for (const y of DOOR.sideRows) doorCells.add(`${W - 1},${y}`);
  if (t.doors & DIR_BIT.up) for (const x of DOOR.verticalCols) doorCells.add(`${x},0`);
  if (t.doors & DIR_BIT.down) for (const x of DOOR.verticalCols) doorCells.add(`${x},${H - 1}`);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      const ch = at(x, y);
      if (ch === 'D' && !doorCells.has(`${x},${y}`)) errs.push(`${tag}: 규격 밖 D (${x},${y})`);
      if (border && ch !== '#' && ch !== 'D') errs.push(`${tag}: 테두리에 '${ch}' (${x},${y})`);
    }
  }
  if (t.doors === 0) errs.push(`${tag}: 출입구 없음`);

  const sideCheck = (edgeX: number, innerX: number, name: string) => {
    if (at(edgeX, H - 1) !== '#' || at(innerX, H - 1) !== '#') errs.push(`${tag}: ${name} 출입구 바닥(16행)이 벽이 아님`);
    for (const y of DOOR.sideRows) if (!nonSolid(at(innerX, y))) errs.push(`${tag}: ${name} 출입구 안쪽 (${innerX},${y}) 막힘`);
  };
  if (t.doors & DIR_BIT.left) sideCheck(0, 1, '왼쪽');
  if (t.doors & DIR_BIT.right) sideCheck(W - 1, W - 2, '오른쪽');
  if (t.doors & DIR_BIT.up) {
    for (const x of DOOR.verticalCols) {
      if (!nonSolid(at(x, 1))) errs.push(`${tag}: 위 출입구 아래 (${x},1) 막힘`);
      // 발사대는 단방향 발판이어야 한다: 천장 바로 아래 1칸은 몸이 들어가지 않으므로, 벽이면 옆으로 못 내려간다
      if (at(x, DOOR.launchRow) !== '=') errs.push(`${tag}: 위 출입구 발사대 (${x},${DOOR.launchRow})가 = 가 아님`);
    }
    for (const x of [12, 17]) if (!nonSolid(at(x, 1))) errs.push(`${tag}: 위 출입구 옆 (${x},1) 막힘`);
  }
  if (t.doors & DIR_BIT.down) {
    for (const x of DOOR.ledgeCols) if (at(x, H - 1) !== '#') errs.push(`${tag}: 아래 출입구 착지 턱 (${x},${H - 1})이 벽이 아님`);
    for (const y of DOOR.ledgeClearRows) {
      for (let x = DOOR.ledgeCols[0]; x <= DOOR.ledgeCols[3]; x++) {
        if (!nonSolid(at(x, y))) errs.push(`${tag}: 아래 출입구 위 공간 (${x},${y}) 막힘`);
      }
    }
  }
  const count = (ch: string) => t.rows.join('').split(ch).length - 1;
  if (!t.arena && count('P') < 1) errs.push(`${tag}: 포탈 후보(P) 없음`);
  if (t.arena && count('b') < 1) errs.push(`${tag}: 보스 스폰(b) 없음`);
  if (count('c') > 0 && count('S') === 0) errs.push(`${tag}: 비밀 상자(c)가 있는데 비밀 벽(S)이 없음`);
  // P, C, c, M, b는 바닥 위(아래 칸이 벽/발판)에 있어야 한다
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
  /** 열려 있는 출입구 비트마스크 (나머지 D는 벽) */
  readonly openDoors: number;
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
  const doorOpenAt = (x: number, y: number): boolean => {
    if (x === 0) return (o.openDoors & DIR_BIT.left) !== 0;
    if (x === t.width - 1) return (o.openDoors & DIR_BIT.right) !== 0;
    if (y === 0) return (o.openDoors & DIR_BIT.up) !== 0;
    return (o.openDoors & DIR_BIT.down) !== 0;
  };
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
        case 'D':
          tile = doorOpenAt(x, y) ? Tile.Empty : Tile.Wall;
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
