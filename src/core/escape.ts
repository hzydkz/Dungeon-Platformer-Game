/**
 * 빨간 던전 탈출 제한 시간 (기획서 7.2). Phaser 비의존.
 * 제한 시간 = 보스방→입구 최단 경로 이동 시간 × 배율 + 여유 시간, 여기에 성격(냉정 등) 배율.
 * 이동 시간은 경로상 방 중심 사이 거리 합 / 달리기 속도로 추정한다.
 */
import { PROGRESSION } from '../config/progression';
import type { Layout } from './generation/layout';

/** 방 그래프 최단 경로 (방 인덱스 목록, from과 to 포함). 연결이 없으면 빈 배열 */
export function shortestRoomPath(layout: Layout, from: number, to: number): number[] {
  const adj: number[][] = layout.rooms.map(() => []);
  for (const l of layout.links) {
    adj[l.a]!.push(l.b);
    adj[l.b]!.push(l.a);
  }
  const prev = new Array<number>(layout.rooms.length).fill(-2);
  prev[from] = -1;
  const queue = [from];
  while (queue.length) {
    const r = queue.shift() as number;
    if (r === to) break;
    for (const n of adj[r]!) {
      if (prev[n] === -2) {
        prev[n] = r;
        queue.push(n);
      }
    }
  }
  if (prev[to] === -2) return [];
  const path: number[] = [];
  for (let r = to; r !== -1; r = prev[r] as number) path.push(r);
  return path.reverse();
}

export interface RoomCenter {
  readonly x: number;
  readonly y: number;
}

/** 경로 이동 거리 (px) */
export function pathDistance(path: readonly number[], centers: readonly RoomCenter[]): number {
  let d = 0;
  for (let i = 1; i < path.length; i++) {
    const a = centers[path[i - 1]!]!;
    const b = centers[path[i]!]!;
    d += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return d;
}

/** 탈출 제한 시간 (초) */
export function escapeTimeSeconds(distancePx: number, runSpeed: number, escapeTimeMultiplier = 1): number {
  const travel = distancePx / runSpeed;
  return (travel * PROGRESSION.escapeTimeMultiplier + PROGRESSION.escapeTimeBonusSeconds) * escapeTimeMultiplier;
}

/** 층 데이터에서 바로 계산 */
export function escapeTimeForLayout(
  layout: Layout,
  centers: readonly RoomCenter[],
  runSpeed: number,
  escapeTimeMultiplier = 1,
): number {
  const path = shortestRoomPath(layout, layout.boss, layout.entrance);
  return escapeTimeSeconds(pathDistance(path, centers), runSpeed, escapeTimeMultiplier);
}
