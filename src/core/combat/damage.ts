/** 피해 계산 (기획서 8.5). Phaser 비의존. */
import { COMBAT } from '../../config/combat';
import { PROGRESSION } from '../../config/progression';
import type { Rng } from '../rng';
import type { Stats } from './stats';

/** 층 난이도 레벨의 몬스터 배율. 9층을 넘는 레벨(빨간 던전)은 추가 배율 */
export function monsterScale(level: number): number {
  const capped = Math.min(level, PROGRESSION.floors);
  let scale = 1 + COMBAT.scalingPerLevel * (capped - 1);
  if (level > PROGRESSION.floors) scale *= 1 + PROGRESSION.beyondMaxLevelMultiplier * (level - PROGRESSION.floors);
  return scale;
}

export interface OutgoingHit {
  readonly damage: number;
  readonly crit: boolean;
}

/** 플레이어가 주는 피해 */
export function outgoingDamage(stats: Stats, base: number, hp: number, rng: Rng | null): OutgoingHit {
  let mult = stats.attack;
  if (stats.lowHpAttackBonus > 0 && hp / stats.maxHp <= stats.lowHpThreshold) mult *= 1 + stats.lowHpAttackBonus;
  const crit = rng !== null && stats.critChance > 0 && rng.chance(stats.critChance);
  if (crit) mult *= stats.critMultiplier;
  return { damage: Math.max(1, Math.round(base * mult)), crit };
}

/** 플레이어가 받는 피해. `blockFactor`는 방패 막기 등 (1 = 막지 않음) */
export function incomingDamage(stats: Stats, raw: number, blockFactor = 1): number {
  if (blockFactor <= 0) return 0;
  return Math.max(1, Math.round(raw * stats.damageTaken * blockFactor));
}

/** 적 처치 시 회복량 */
export function healOnKill(stats: Stats): number {
  return Math.round(stats.maxHp * stats.healOnKill);
}

/** 적중 시 흡혈 회복량 */
export function lifesteal(stats: Stats, dealt: number): number {
  return stats.lifestealOnHit > 0 ? Math.max(1, Math.round(dealt * stats.lifestealOnHit)) : 0;
}

/** 가시 갑옷: 접촉 피해를 준 적에게 되돌리는 피해 */
export function thornsDamage(stats: Stats, taken: number): number {
  return stats.thorns > 0 ? Math.max(1, Math.round(taken * stats.thorns)) : 0;
}

/** 회복 적용 (최대 체력 초과 금지, 회복 배율 반영) */
export function applyHeal(stats: Stats, hp: number, amount: number): number {
  return Math.min(stats.maxHp, hp + Math.round(amount * stats.healMultiplier));
}

/** 무적 시간 */
export function invulnTime(stats: Stats): number {
  return COMBAT.player.invulnTime * stats.invulnTime;
}

/** 초당 재생으로 dt 동안 회복하는 양 */
export function regenAmount(stats: Stats, dt: number): number {
  return stats.maxHp * stats.regenPerSecond * dt;
}

/** 층 이동 회복 후 체력 (기획서 8.8: 최대 체력의 30% + 성격 보너스, 회복 배율 적용) */
export function floorHeal(stats: Stats, hp: number): number {
  return applyHeal(stats, hp, stats.maxHp * (PROGRESSION.floorHealRatio + stats.floorHealBonus));
}
