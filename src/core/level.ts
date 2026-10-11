/**
 * 레벨과 경험치 (기획자 요청: 층이 오를수록 강해지는 적에 맞춰 플레이어도 성장). Phaser 비의존.
 * 레벨은 런마다 1부터 시작한다 (죽으면 처음부터).
 */
import { LEVEL } from '../config/items';
import type { Modifier } from './combat/stats';

/** 레벨 n에서 n+1로 오르는 데 필요한 경험치 */
export function xpToNext(level: number): number {
  return Math.round(LEVEL.xpBase * Math.pow(Math.max(1, level), LEVEL.xpExponent));
}

export interface LevelState {
  level: number;
  /** 현재 레벨에서 모은 경험치 */
  xp: number;
}

/** 경험치를 더하고, 오른 레벨 수를 반환한다 (한 번에 여러 레벨 가능) */
export function addXp(state: LevelState, amount: number): number {
  state.xp += Math.max(0, amount);
  let gained = 0;
  while (state.xp >= xpToNext(state.level)) {
    state.xp -= xpToNext(state.level);
    state.level++;
    gained++;
  }
  return gained;
}

/** 레벨 보너스: Lv1 대비 최대 체력, 공격력 증가 (곱연산으로 아이템/특성 위에 적용) */
export function levelModifiers(level: number): Modifier[] {
  const n = Math.max(0, level - 1);
  if (n === 0) return [];
  return [
    { stat: 'maxHp', op: 'mul', value: 1 + LEVEL.hpPerLevel * n },
    { stat: 'attack', op: 'mul', value: 1 + LEVEL.attackPerLevel * n },
  ];
}

/** 몬스터/보스 처치 경험치. scale은 난이도 레벨의 몬스터 배율 */
export function killXp(kind: 'monster' | 'boss' | 'redBoss', scale: number): number {
  const base = kind === 'monster' ? LEVEL.monsterXp : LEVEL.bossXp * (kind === 'redBoss' ? LEVEL.redBossXpMultiplier : 1);
  return Math.round(base * scale);
}
