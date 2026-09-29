/**
 * 역할군 (기획서 8.2) [가정 - 초안]. 전투 방식만 다르고 이동 능력은 같다.
 * 수치는 모두 여기서 조정한다.
 */
import type { RoleId } from '../assets/keys';
import type { Stats } from '../core/combat/stats';

export interface MeleeAttack {
  readonly kind: 'melee';
  readonly damage: number;
  /** 앞쪽 판정 크기 (px). 위/아래 공격은 가로세로를 바꿔 쓴다 */
  readonly width: number;
  readonly height: number;
  /** 판정 유지 시간 (초) */
  readonly active: number;
  readonly cooldown: number;
}

export interface ProjectileAttack {
  readonly kind: 'projectile';
  readonly damage: number;
  readonly speed: number;
  readonly lifetime: number;
  readonly cooldown: number;
  readonly texture: 'arrow' | 'orb';
  /** 명중 시 주변 피해 반경 (px, 0이면 없음) */
  readonly splashRadius: number;
}

export type BasicAttack = MeleeAttack | ProjectileAttack;

export type SkillDef =
  | {
      readonly kind: 'block';
      /** 정면 피해 배율 */
      readonly frontDamageFactor: number;
      /** 누른 직후 이 시간 안에 맞으면 완벽 막기 (피해 없음 + 반격) */
      readonly perfectWindow: number;
      readonly counterDamage: number;
      /** 막는 동안 이동속도 배율 */
      readonly moveFactor: number;
      readonly cooldown: number;
    }
  | {
      readonly kind: 'dash';
      readonly speed: number;
      readonly duration: number;
      /** 무적 시간 */
      readonly invuln: number;
      readonly cooldown: number;
    }
  | {
      readonly kind: 'chargeShot';
      readonly minDamage: number;
      readonly maxDamage: number;
      readonly chargeTime: number;
      readonly speed: number;
      readonly cooldown: number;
    }
  | {
      readonly kind: 'explosion';
      readonly damage: number;
      readonly radius: number;
      /** 플레이어 앞 거리 (px) */
      readonly offset: number;
      readonly manaCost: number;
      readonly cooldown: number;
    };

export interface RoleDef {
  readonly id: RoleId;
  readonly name: string;
  readonly summary: string;
  readonly base: Partial<Stats>;
  readonly attack: BasicAttack;
  readonly attackName: string;
  readonly skill: SkillDef;
  readonly skillName: string;
  /** 마나 (마법사) */
  readonly maxMana: number;
  readonly manaRegen: number;
}

export const ROLES: readonly RoleDef[] = [
  {
    id: 'warrior',
    name: '전사',
    summary: '근접 · 방어형',
    base: { maxHp: 120 },
    attack: { kind: 'melee', damage: 14, width: 30, height: 22, active: 0.1, cooldown: 0.42 },
    attackName: '넓은 베기',
    skill: { kind: 'block', frontDamageFactor: 0.3, perfectWindow: 0.2, counterDamage: 22, moveFactor: 0.45, cooldown: 0.3 },
    skillName: '방패 막기 (정면 피해 감소, 타이밍 맞추면 반격)',
    maxMana: 0,
    manaRegen: 0,
  },
  {
    id: 'rogue',
    name: '도적',
    summary: '근접 · 기동형',
    base: { maxHp: 95, attackSpeed: 1 },
    attack: { kind: 'melee', damage: 7, width: 22, height: 12, active: 0.06, cooldown: 0.17 },
    attackName: '빠른 연속 찌르기',
    skill: { kind: 'dash', speed: 330, duration: 0.18, invuln: 0.25, cooldown: 1.0 },
    skillName: '전투 대시 (무적)',
    maxMana: 0,
    manaRegen: 0,
  },
  {
    id: 'archer',
    name: '궁수',
    summary: '원거리 · 단일',
    base: { maxHp: 90 },
    attack: { kind: 'projectile', damage: 9, speed: 320, lifetime: 0.9, cooldown: 0.33, texture: 'arrow', splashRadius: 0 },
    attackName: '직선 화살',
    skill: { kind: 'chargeShot', minDamage: 12, maxDamage: 38, chargeTime: 0.9, speed: 420, cooldown: 1.2 },
    skillName: '관통 차지샷 (누르고 있다가 떼기)',
    maxMana: 0,
    manaRegen: 0,
  },
  {
    id: 'mage',
    name: '마법사',
    summary: '원거리 · 범위',
    base: { maxHp: 80 },
    attack: { kind: 'projectile', damage: 12, speed: 150, lifetime: 1.4, cooldown: 0.55, texture: 'orb', splashRadius: 14 },
    attackName: '느린 마법 탄',
    skill: { kind: 'explosion', damage: 30, radius: 42, offset: 36, manaCost: 40, cooldown: 0.6 },
    skillName: '범위 폭발 (마나 소모)',
    maxMana: 100,
    manaRegen: 14,
  },
];

export function roleById(id: RoleId): RoleDef {
  const r = ROLES.find((x) => x.id === id);
  if (!r) throw new Error(`알 수 없는 역할군: ${id}`);
  return r;
}
