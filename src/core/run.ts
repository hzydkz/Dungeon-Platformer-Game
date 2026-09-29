/**
 * 런 상태 (한 번의 플레이). 사망하면 버려진다 (순수 로그라이크, 기획서 1장). Phaser 비의존.
 */
export interface RunState {
  readonly runSeed: number;
  floor: number;
  /** 런 시작 시각 (ms, performance.now 기준) */
  readonly startedAt: number;
  bossesKilled: number;
}

export function createRun(runSeed: number, now: number): RunState {
  return { runSeed, floor: 1, startedAt: now, bossesKilled: 0 };
}
