/**
 * 특성 (기획서 8.3) [가정 - 초안]: 스탯/메커니즘 수정치. 장단점이 섞인 것을 우선한다.
 */
import type { Modifier } from '../core/combat/stats';

export interface TraitDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly modifiers: readonly Modifier[];
}

export const TRAITS: readonly TraitDef[] = [
  {
    id: 'glass_cannon',
    name: '유리대포',
    description: '공격력 +30%, 최대 체력 -25%',
    modifiers: [
      { stat: 'attack', op: 'mul', value: 1.3 },
      { stat: 'maxHp', op: 'mul', value: 0.75 },
    ],
  },
  {
    id: 'iron_skin',
    name: '강철 피부',
    description: '받는 피해 -20%, 이동속도 -10%',
    modifiers: [
      { stat: 'damageTaken', op: 'mul', value: 0.8 },
      { stat: 'moveSpeed', op: 'mul', value: 0.9 },
    ],
  },
  { id: 'vampire', name: '흡혈', description: '적 처치 시 최대 체력의 4% 회복', modifiers: [{ stat: 'healOnKill', op: 'add', value: 0.04 }] },
  { id: 'lucky', name: '행운아', description: '상자 보상 등급 상승 확률 +35%p', modifiers: [{ stat: 'chestTierBonus', op: 'add', value: 0.35 }] },
  { id: 'tenacity', name: '끈기', description: '체력 25% 이하일 때 공격력 +25%', modifiers: [{ stat: 'lowHpAttackBonus', op: 'add', value: 0.25 }] },
  {
    id: 'berserker',
    name: '광전사',
    description: '공격력 +15%, 피격 무적 시간 -30%',
    modifiers: [
      { stat: 'attack', op: 'mul', value: 1.15 },
      { stat: 'invulnTime', op: 'mul', value: 0.7 },
    ],
  },
  {
    id: 'sturdy',
    name: '튼튼함',
    description: '최대 체력 +30%, 공격력 -10%',
    modifiers: [
      { stat: 'maxHp', op: 'mul', value: 1.3 },
      { stat: 'attack', op: 'mul', value: 0.9 },
    ],
  },
  {
    id: 'focused',
    name: '집중',
    description: '스킬 쿨타임 -30%, 마나 소모 -25%, 공격력 -10%',
    modifiers: [
      { stat: 'skillCooldown', op: 'mul', value: 0.7 },
      { stat: 'skillCost', op: 'mul', value: 0.75 },
      { stat: 'attack', op: 'mul', value: 0.9 },
    ],
  },
  {
    id: 'regen',
    name: '재생',
    description: '초당 최대 체력의 0.5% 회복, 회복 아이템/층 이동 회복 -50%',
    modifiers: [
      { stat: 'regenPerSecond', op: 'add', value: 0.005 },
      { stat: 'healMultiplier', op: 'mul', value: 0.5 },
    ],
  },
  {
    id: 'thorns',
    name: '가시 갑옷',
    description: '접촉 피해를 준 적에게 받은 피해의 50% 반사, 최대 체력 -10%',
    modifiers: [
      { stat: 'thorns', op: 'add', value: 0.5 },
      { stat: 'maxHp', op: 'mul', value: 0.9 },
    ],
  },
];
