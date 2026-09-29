/**
 * 강화 (기획서 8.7) [가정]: 이번 런에만 유지. 등급: minor(상자), normal(층 보스), rare(빨간 던전 보스).
 */
import type { RoleId } from '../assets/keys';
import type { Modifier } from '../core/combat/stats';

export type UpgradeTier = 'minor' | 'normal' | 'rare';

export interface UpgradeDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tier: UpgradeTier;
  readonly modifiers: readonly Modifier[];
  /** 특정 역할군만 (없으면 모두) */
  readonly roles?: readonly RoleId[];
}

export const UPGRADES: readonly UpgradeDef[] = [
  // 상자용 소형 강화
  { id: 'hp_minor', name: '작은 생명의 조각', description: '최대 체력 +8', tier: 'minor', modifiers: [{ stat: 'maxHp', op: 'add', value: 8 }] },
  { id: 'atk_minor', name: '숫돌', description: '공격력 +5%', tier: 'minor', modifiers: [{ stat: 'attack', op: 'mul', value: 1.05 }] },
  { id: 'crit_minor', name: '날카로운 눈', description: '치명타 확률 +4%p', tier: 'minor', modifiers: [{ stat: 'critChance', op: 'add', value: 0.04 }] },
  { id: 'armor_minor', name: '가죽 덧댐', description: '받는 피해 -5%', tier: 'minor', modifiers: [{ stat: 'damageTaken', op: 'mul', value: 0.95 }] },
  // 층 보스 강화
  { id: 'hp_up', name: '생명의 결정', description: '최대 체력 +20', tier: 'normal', modifiers: [{ stat: 'maxHp', op: 'add', value: 20 }] },
  { id: 'atk_up', name: '강철 날', description: '공격력 +15%', tier: 'normal', modifiers: [{ stat: 'attack', op: 'mul', value: 1.15 }] },
  { id: 'cd_down', name: '시간의 모래', description: '스킬 쿨타임 -20%', tier: 'normal', modifiers: [{ stat: 'skillCooldown', op: 'mul', value: 0.8 }] },
  { id: 'fast_hands', name: '재빠른 손', description: '공격 속도 +15%', tier: 'normal', modifiers: [{ stat: 'attackSpeed', op: 'mul', value: 1.15 }] },
  { id: 'crit_up', name: '급소 찌르기', description: '치명타 확률 +10%p', tier: 'normal', modifiers: [{ stat: 'critChance', op: 'add', value: 0.1 }] },
  { id: 'leech', name: '피의 갈증', description: '공격 적중 시 피해의 5% 회복', tier: 'normal', modifiers: [{ stat: 'lifestealOnHit', op: 'add', value: 0.05 }] },
  { id: 'armor_up', name: '단단한 갑주', description: '받는 피해 -10%', tier: 'normal', modifiers: [{ stat: 'damageTaken', op: 'mul', value: 0.9 }] },
  { id: 'long_guard', name: '인내', description: '피격 무적 시간 +25%', tier: 'normal', modifiers: [{ stat: 'invulnTime', op: 'mul', value: 1.25 }] },
  {
    id: 'multishot',
    name: '갈래 사격',
    description: '기본 공격 투사체 +1',
    tier: 'normal',
    roles: ['archer', 'mage'],
    modifiers: [{ stat: 'extraProjectiles', op: 'add', value: 1 }],
  },
  // 빨간 던전 보스 강화 (상위 등급)
  { id: 'hp_big', name: '거인의 심장', description: '최대 체력 +45', tier: 'rare', modifiers: [{ stat: 'maxHp', op: 'add', value: 45 }] },
  { id: 'atk_big', name: '마검', description: '공격력 +30%', tier: 'rare', modifiers: [{ stat: 'attack', op: 'mul', value: 1.3 }] },
  {
    id: 'executioner',
    name: '처형자',
    description: '치명타 확률 +15%p, 치명타 피해 +50%p',
    tier: 'rare',
    modifiers: [
      { stat: 'critChance', op: 'add', value: 0.15 },
      { stat: 'critMultiplier', op: 'add', value: 0.5 },
    ],
  },
  { id: 'soul_eater', name: '영혼 포식', description: '적 처치 시 최대 체력의 5% 회복', tier: 'rare', modifiers: [{ stat: 'healOnKill', op: 'add', value: 0.05 }] },
  { id: 'fortress', name: '요새', description: '받는 피해 -20%', tier: 'rare', modifiers: [{ stat: 'damageTaken', op: 'mul', value: 0.8 }] },
  {
    id: 'haste',
    name: '질풍',
    description: '공격 속도 +30%, 스킬 쿨타임 -20%',
    tier: 'rare',
    modifiers: [
      { stat: 'attackSpeed', op: 'mul', value: 1.3 },
      { stat: 'skillCooldown', op: 'mul', value: 0.8 },
    ],
  },
];

export function upgradeById(id: string): UpgradeDef {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) throw new Error(`알 수 없는 강화: ${id}`);
  return u;
}
