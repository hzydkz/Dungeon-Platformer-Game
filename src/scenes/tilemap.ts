import Phaser from 'phaser';
import { DISPLAY } from '../config/display';
import { Tile, isOneWayTile, type TileGrid } from '../core/tiles';

/** 충돌이 있는 타일 인덱스. 가시(Spike)는 충돌 없이 겹침으로 판정한다. */
const COLLIDING = [Tile.Wall, Tile.OneWay, Tile.Breakable, Tile.Seal];

export interface BuiltTilemap {
  map: Phaser.Tilemaps.Tilemap;
  layer: Phaser.Tilemaps.TilemapLayer;
}

/**
 * TileGrid로 Phaser 타일맵을 만든다. 타일셋 이미지는 [빈칸, 벽, 단방향, 가시, 부서지는 벽, 봉쇄] 순서.
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
  return { map, layer };
}

/** 타일 하나를 바꾸고 충돌 설정을 갱신한다 (봉쇄/부서짐). */
export function setMapTile(layer: Phaser.Tilemaps.TilemapLayer, x: number, y: number, t: number): void {
  if (t === Tile.Empty) {
    layer.removeTileAt(x, y);
  } else {
    const tile = layer.putTileAt(t, x, y);
    tile.setCollision(COLLIDING.includes(t as never));
  }
}
