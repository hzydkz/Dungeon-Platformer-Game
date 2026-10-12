/**
 * 시야 (기획자 요청: 벽 너머는 보이지 않게, 본 곳만 지도에). Phaser 비의존.
 * 재귀 섀도캐스팅으로 (ox, oy) 칸에서 반지름 radius 안의, 막힌 칸에 가리지 않는 칸을 구한다.
 * 막힌 칸(벽) 자체는 보인다 (벽의 표면). 단방향 발판, 넝쿨, 가시는 시야를 가리지 않는다.
 */
import { getTile, isSolidTile, type TileGrid } from '../tiles';

const OCTANTS: readonly (readonly [number, number, number, number])[] = [
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [0, -1, 1, 0],
  [-1, 0, 0, 1],
  [-1, 0, 0, -1],
  [0, -1, -1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, -1],
];

/** 보이는 칸 번호(y * width + x)를 visit로 넘긴다. 같은 칸이 여러 번 올 수 있다 */
export function computeVisible(grid: TileGrid, ox: number, oy: number, radius: number, visit: (index: number, dist: number) => void): void {
  const W = grid.width;
  const H = grid.height;
  const opaque = (x: number, y: number) => isSolidTile(getTile(grid, x, y));
  if (ox < 0 || oy < 0 || ox >= W || oy >= H) return;
  visit(oy * W + ox, 0);
  const r2 = radius * radius;
  const cast = (row: number, start: number, end: number, xx: number, xy: number, yx: number, yy: number) => {
    if (start < end) return;
    let newStart = 0;
    for (let j = row; j <= radius; j++) {
      let dx = -j - 1;
      const dy = -j;
      let blocked = false;
      while (dx <= 0) {
        dx++;
        const x = ox + dx * xx + dy * xy;
        const y = oy + dx * yx + dy * yy;
        const lSlope = (dx - 0.5) / (dy + 0.5);
        const rSlope = (dx + 0.5) / (dy - 0.5);
        if (start < rSlope) continue;
        if (end > lSlope) break;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2 && x >= 0 && y >= 0 && x < W && y < H) visit(y * W + x, Math.sqrt(d2));
        const op = opaque(x, y);
        if (blocked) {
          if (op) {
            newStart = rSlope;
            continue;
          }
          blocked = false;
          start = newStart;
        } else if (op && j < radius) {
          blocked = true;
          cast(j + 1, start, lSlope, xx, xy, yx, yy);
          newStart = rSlope;
        }
      }
      if (blocked) break;
    }
  };
  for (const [xx, xy, yx, yy] of OCTANTS) cast(1, 1, 0, xx, xy, yx, yy);
}
