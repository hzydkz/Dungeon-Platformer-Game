/** 비밀 벽 힌트 (기획서 8.4 성격 '호기심'). Phaser 비의존. */
import { REWARDS } from '../config/rewards';
import type { Stats } from './combat/stats';

/** 가장 가까운 비밀 벽까지의 타일 거리가 힌트 범위 안이면 true */
export function secretHintVisible(stats: Stats, player: { x: number; y: number }, walls: readonly { x: number; y: number }[]): boolean {
  if (stats.secretHint <= 0) return false;
  return walls.some((w) => Math.hypot(w.x - player.x, w.y - player.y) <= REWARDS.secretHintRange);
}
