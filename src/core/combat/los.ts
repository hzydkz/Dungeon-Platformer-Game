/** 타일 시야 판정 (몬스터가 플레이어를 볼 수 있는지). Phaser 비의존. */
import { getTile, isSolidTile, type TileGrid } from '../tiles';

/** 두 점 사이에 벽이 없는지 (px 좌표, 반 타일 간격으로 샘플) */
export function lineOfSight(grid: TileGrid, tileSize: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / (tileSize / 2)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.floor((x0 + (x1 - x0) * t) / tileSize);
    const y = Math.floor((y0 + (y1 - y0) * t) / tileSize);
    if (isSolidTile(getTile(grid, x, y))) return false;
  }
  return true;
}
