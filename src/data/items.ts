/**
 * 아이템 (기획자 요청): 가지고 있는 동안 효과가 붙는다. 같은 종류도 등급(F~S)에 따라 수치가 다르다.
 * values는 등급 F, E, D, C, B, A, S 순서. 같은 아이템을 여러 개 가지면 효과가 겹친다. [가정] 수치 초안.
 */
import type { RoleId } from '../assets/keys';
import { GRADES, type Grade } from '../config/items';
import type { Modifier, StatKey } from '../core/combat/stats';

export interface ItemEffect {
  readonly stat: StatKey;
  readonly op: 'add' | 'mul';
  /** 등급별 값 (F→S). mul은 1에 더하는 비율(0.05 = +5%), 음수면 감소 */
  readonly values: readonly number[];
}

export interface ItemDef {
  readonly id: string;
  readonly name: string;
  /** 설명 틀. {v}에 등급 값이 들어간다 */
  readonly text: string;
  /** 값 표시: percent(0.05 → '5'), number(그대로) */
  readonly unit: 'percent' | 'number';
  readonly effect: ItemEffect;
  /** 특정 역할군만 (없으면 모두) */
  readonly roles?: readonly RoleId[];
}

export const ITEM_DEFS: readonly ItemDef[] = [
  { id: 'ring', name: '전사의 반지', text: '공격력 +{v}%', unit: 'percent', effect: { stat: 'attack', op: 'mul', values: [0.04, 0.06, 0.09, 0.13, 0.18, 0.24, 0.32] } },
  { id: 'amulet', name: '생명의 부적', text: '최대 체력 +{v}', unit: 'number', effect: { stat: 'maxHp', op: 'add', values: [8, 12, 18, 26, 36, 48, 64] } },
  { id: 'plate', name: '철갑 조각', text: '받는 피해 -{v}%', unit: 'percent', effect: { stat: 'damageTaken', op: 'mul', values: [-0.03, -0.05, -0.07, -0.1, -0.13, -0.17, -0.22] } },
  { id: 'feather', name: '바람 깃털', text: '공격 속도 +{v}%', unit: 'percent', effect: { stat: 'attackSpeed', op: 'mul', values: [0.04, 0.06, 0.09, 0.13, 0.18, 0.24, 0.3] } },
  { id: 'eye', name: '매의 눈', text: '치명타 확률 +{v}%p', unit: 'percent', effect: { stat: 'critChance', op: 'add', values: [0.03, 0.04, 0.06, 0.08, 0.11, 0.14, 0.18] } },
  { id: 'fang', name: '흡혈 송곳니', text: '적중 피해의 {v}% 회복', unit: 'percent', effect: { stat: 'lifestealOnHit', op: 'add', values: [0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.07] } },
  { id: 'hourglass', name: '모래시계', text: '스킬 쿨타임 -{v}%', unit: 'percent', effect: { stat: 'skillCooldown', op: 'mul', values: [-0.04, -0.06, -0.09, -0.12, -0.16, -0.2, -0.25] } },
  { id: 'boots', name: '질풍 장화', text: '이동속도 +{v}%', unit: 'percent', effect: { stat: 'moveSpeed', op: 'mul', values: [0.03, 0.04, 0.06, 0.08, 0.1, 0.12, 0.15] } },
  { id: 'moss', name: '재생의 이끼', text: '초당 최대 체력의 {v}% 회복', unit: 'percent', effect: { stat: 'regenPerSecond', op: 'add', values: [0.001, 0.0015, 0.002, 0.003, 0.004, 0.005, 0.007] } },
  { id: 'jar', name: '영혼 항아리', text: '적 처치 시 최대 체력의 {v}% 회복', unit: 'percent', effect: { stat: 'healOnKill', op: 'add', values: [0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.06] } },
  { id: 'cloak', name: '가시 망토', text: '접촉 피해의 {v}% 반사', unit: 'percent', effect: { stat: 'thorns', op: 'add', values: [0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7] } },
  { id: 'gem', name: '날카로운 보석', text: '치명타 피해 +{v}%p', unit: 'percent', effect: { stat: 'critMultiplier', op: 'add', values: [0.08, 0.12, 0.18, 0.25, 0.34, 0.45, 0.6] } },
];

/** 가지고 있는 아이템 하나 */
export interface ItemInstance {
  readonly id: string;
  readonly grade: Grade;
}

export function itemDef(id: string): ItemDef {
  const d = ITEM_DEFS.find((x) => x.id === id);
  if (!d) throw new Error(`알 수 없는 아이템: ${id}`);
  return d;
}

export function gradeIndex(grade: Grade): number {
  return GRADES.indexOf(grade);
}

function formatValue(def: ItemDef, v: number): string {
  const a = Math.abs(v);
  if (def.unit === 'number') return String(Math.round(a));
  const r = Math.round(a * 1000) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** 아이템 설명 (예: '공격력 +9%') */
export function itemText(item: ItemInstance): string {
  const def = itemDef(item.id);
  const v = def.effect.values[gradeIndex(item.grade)]!;
  return def.text.replace('{v}', formatValue(def, v));
}

/** 아이템의 스탯 수정치 */
export function itemModifiers(item: ItemInstance): Modifier[] {
  const def = itemDef(item.id);
  const v = def.effect.values[gradeIndex(item.grade)]!;
  return [{ stat: def.effect.stat, op: def.effect.op, value: def.effect.op === 'mul' ? 1 + v : v }];
}
