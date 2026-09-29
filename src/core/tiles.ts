/**
 * 타일 종류와 ASCII 문자 매핑 (기획서 5.3). Phaser 비의존.
 */
export const Tile = {
  Empty: 0,
  Wall: 1,
  OneWay: 2,
  Spike: 3,
  Breakable: 4,
  /** 보스방 봉쇄 등으로 런타임에 생기는 벽 */
  Seal: 5,
} as const;
export type TileId = (typeof Tile)[keyof typeof Tile];

/** 완전히 막힌 타일 (모든 면 충돌) */
export function isSolidTile(t: number): boolean {
  return t === Tile.Wall || t === Tile.Breakable || t === Tile.Seal;
}

/** 위에서만 밟을 수 있는 타일 */
export function isOneWayTile(t: number): boolean {
  return t === Tile.OneWay;
}

export function isHazardTile(t: number): boolean {
  return t === Tile.Spike;
}

/** 2차원 타일 격자. `tiles[y * width + x]` */
export interface TileGrid {
  readonly width: number;
  readonly height: number;
  readonly tiles: Uint8Array;
}

export function createGrid(width: number, height: number, fill: TileId = Tile.Empty): TileGrid {
  return { width, height, tiles: new Uint8Array(width * height).fill(fill) };
}

/** 범위 밖은 벽으로 취급한다. */
export function getTile(grid: TileGrid, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return Tile.Wall;
  return grid.tiles[y * grid.width + x] as number;
}

export function setTile(grid: TileGrid, x: number, y: number, t: TileId): void {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return;
  grid.tiles[y * grid.width + x] = t;
}

/** ASCII 줄 배열을 타일 격자로 변환. 알 수 없는 문자는 빈 칸. */
export function gridFromAscii(lines: readonly string[], charToTile: (ch: string) => TileId): TileGrid {
  const height = lines.length;
  const width = Math.max(0, ...lines.map((l) => l.length));
  const grid = createGrid(width, height);
  for (let y = 0; y < height; y++) {
    const line = lines[y] as string;
    for (let x = 0; x < width; x++) setTile(grid, x, y, charToTile(line[x] ?? '.'));
  }
  return grid;
}

/** 기본 문자 매핑. 템플릿 전용 문자(M, C, P, D 등)는 생성기가 먼저 해석한다. */
export function basicCharToTile(ch: string): TileId {
  switch (ch) {
    case '#':
      return Tile.Wall;
    case '=':
      return Tile.OneWay;
    case '^':
      return Tile.Spike;
    case 'S':
      return Tile.Breakable;
    default:
      return Tile.Empty;
  }
}
