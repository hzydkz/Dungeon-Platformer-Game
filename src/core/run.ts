/**
 * 런 상태 (한 번의 플레이). 사망하면 버려진다 (순수 로그라이크, 기획서 1장). Phaser 비의존.
 */
import type { RoleId } from '../assets/keys';
import type { ItemInstance } from '../data/items';

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
  /** 아이템 칸 (최대 ITEMS.slots개) */
  items: ItemInstance[];
  gold: number;
  level: number;
  /** 현재 레벨에서 모은 경험치 */
  xp: number;
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
    items: [],
    gold: 0,
    level: 1,
    xp: 0,
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
