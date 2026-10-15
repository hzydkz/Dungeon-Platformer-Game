import Phaser from 'phaser';
import { DISPLAY } from '../config/display';
import { Tile, isOneWayTile, type TileGrid } from '../core/tiles';

/** 충돌이 있는 타일 인덱스. 가시(Spike)는 충돌 없이 겹침으로 판정한다. */
const COLLIDING = [Tile.Wall, Tile.OneWay, Tile.Breakable, Tile.Seal, Tile.Gate, Tile.Lock];

export interface BuiltTilemap {
  map: Phaser.Tilemaps.Tilemap;
  layer: Phaser.Tilemaps.TilemapLayer;
}

/**
 * TileGrid로 Phaser 타일맵을 만든다. 타일셋 이미지는 [빈칸, 벽, 단방향, 가시, 부서지는 벽, 봉쇄, 지름길 문, 잠긴 문, 넝쿨] 순서. 넝쿨은 충돌이 없다.
 */
export function buildTilemap(scene: Phaser.Scene, grid: TileGrid, tilesetKey: string): BuiltTilemap {
  const data: number[][] = [];
  for (let y = 0; y < grid.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < grid.width; x++) {
      const t = grid.tiles[y * grid.width + x] as number;
      row.push(t === Tile.Empty ? -1 : t);
    }
    data.push(row);
  }
  const s = DISPLAY.tileSize;
  const map = scene.make.tilemap({ data, tileWidth: s, tileHeight: s });
  const tileset = map.addTilesetImage(tilesetKey, tilesetKey, s, s, 0, 0, 0);
  if (!tileset) throw new Error(`타일셋 생성 실패: ${tilesetKey}`);
  const layer = map.createLayer(0, tileset, 0, 0);
  if (!layer) throw new Error('타일 레이어 생성 실패');
  layer.setCollision(COLLIDING);
  layer.forEachTile((tile) => {
    if (isOneWayTile(tile.index)) tile.setCollision(false, false, true, false, false);
  });
  fixOneWayFaces(layer, 0, 0, grid.width - 1, grid.height - 1);
  return { map, layer };
}

/** 타일 하나를 바꾸고 충돌 설정을 갱신한다 (봉쇄/부서짐). */
export function setMapTile(layer: Phaser.Tilemaps.TilemapLayer, x: number, y: number, t: number): void {
  if (t === Tile.Empty) {
    layer.removeTileAt(x, y);
  } else {
    const tile = layer.putTileAt(t, x, y);
    tile.setCollision(COLLIDING.includes(t as never));
    if (isOneWayTile(t)) tile.setCollision(false, false, true, false, false);
  }
  fixOneWayFaces(layer, x - 1, y - 1, x + 1, y + 1);
}

/**
 * Phaser는 이웃 타일이 충돌 타일이면 그쪽 면을 충돌 검사에서 뺀다. 단방향 블록도 충돌 타일로 쳐서,
 * 단방향 블록과 맞닿은 벽의 면(특히 단방향 블록 바로 아래 바닥의 윗면)이 빠져
 * 단방향 블록을 통과하면(↓+점프) 그 아래 벽을 전부 뚫고 떨어지는 버그가 있었다. 그 면을 다시 켠다.
 */
function fixOneWayFaces(layer: Phaser.Tilemaps.TilemapLayer, x0: number, y0: number, x1: number, y1: number): void {
  const solid = (x: number, y: number) => {
    const t = layer.getTileAt(x, y);
    return t && t.collides && !isOneWayTile(t.index) ? t : null;
  };
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = layer.getTileAt(x, y);
      if (!t || !isOneWayTile(t.index)) continue;
      const below = solid(x, y + 1);
      if (below) below.faceTop = true;
      const above = solid(x, y - 1);
      if (above) above.faceBottom = true;
      const left = solid(x - 1, y);
      if (left) left.faceRight = true;
      const right = solid(x + 1, y);
      if (right) right.faceLeft = true;
    }
  }
}
