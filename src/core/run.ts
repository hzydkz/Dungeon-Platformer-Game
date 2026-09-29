/**
 * 런 상태 (한 번의 플레이). 사망하면 버려진다 (순수 로그라이크, 기획서 1장). Phaser 비의존.
 */
import type { RoleId } from '../assets/keys';

export interface CharacterChoice {
  readonly role: RoleId;
  readonly trait: string | null;
  readonly personality: string | null;
}

export interface RunState {
  readonly runSeed: number;
  floor: number;
  /** 런 시작 시각 (ms, performance.now 기준) */
  readonly startedAt: number;
  bossesKilled: number;
  kills: number;
  character: CharacterChoice;
  /** 획득한 강화 id (같은 강화를 여러 번 얻을 수 있다) */
  upgrades: string[];
  hp: number;
  /** 결과 */
  outcome: 'playing' | 'dead' | 'victory';
  deathCause: string;
}

export function createRun(runSeed: number, now: number, character: CharacterChoice): RunState {
  return {
    runSeed,
    floor: 1,
    startedAt: now,
    bossesKilled: 0,
    kills: 0,
    character,
    upgrades: [],
    hp: -1,
    outcome: 'playing',
    deathCause: '',
  };
}

export function formatPlayTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
