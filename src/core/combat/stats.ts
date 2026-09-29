/**
 * 플레이어 스탯 = 역할군 기본값 + 수정치(특성, 성격, 강화). Phaser 비의존.
 * 계산 순서: (기본값 + 모든 add의 합) × 모든 mul의 곱
 */

export interface Stats {
  maxHp: number;
  /** 공격력 배율 */
  attack: number;
  /** 받는 피해 배율 */
  damageTaken: number;
  /** 이동속도 배율 (점프 높이는 모든 캐릭터 동일) */
  moveSpeed: number;
  /** 공격 속도 배율 (쿨타임을 나눈다) */
  attackSpeed: number;
  /** 스킬 쿨타임 배율 */
  skillCooldown: number;
  /** 피격 무적 시간 배율 */
  invulnTime: number;
  /** 적 처치 시 회복량 (최대 체력 대비 비율) */
  healOnKill: number;
  /** 체력 비율이 이 값 이하이면 lowHpAttackBonus 적용 */
  lowHpThreshold: number;
  lowHpAttackBonus: number;
  /** 접촉 피해를 준 적에게 받은 피해의 이 비율을 반사 */
  thorns: number;
  /** 초당 회복 (최대 체력 대비 비율) */
  regenPerSecond: number;
  /** 회복 아이템/층 이동 회복 배율 */
  healMultiplier: number;
  /** 층 이동 회복 비율 가산 */
  floorHealBonus: number;
  /** 치명타 확률, 치명타 배율 */
  critChance: number;
  critMultiplier: number;
  /** 공격 적중 시 회복 (피해의 비율) */
  lifestealOnHit: number;
  /** 추가 투사체 (궁수/마법사) */
  extraProjectiles: number;
  /** 상자 보상 등급 상승 확률 */
  chestTierBonus: number;
  /** 상자 보상 개수 가산 */
  chestAmount: number;
  /** 상자 등장 확률 배율 */
  chestChance: number;
  /** 빨간 던전 보상 가산 (선택지 수) */
  redRewardBonus: number;
  /** 탈출 제한 시간 배율 */
  escapeTime: number;
  /** 1이면 방에 들어갈 때 인접 방도 지도에 공개 */
  revealAdjacent: number;
  /** 1이면 비밀 벽 근처에서 힌트 */
  secretHint: number;
  /** 빨간 포탈 생성 확률 가산 */
  redPortalChance: number;
  /** 함정 방 확률 가산 */
  trapChance: number;
}

export type StatKey = keyof Stats;

export interface Modifier {
  readonly stat: StatKey;
  readonly op: 'add' | 'mul';
  readonly value: number;
}

export const DEFAULT_STATS: Readonly<Stats> = {
  maxHp: 100,
  attack: 1,
  damageTaken: 1,
  moveSpeed: 1,
  attackSpeed: 1,
  skillCooldown: 1,
  invulnTime: 1,
  healOnKill: 0,
  lowHpThreshold: 0.25,
  lowHpAttackBonus: 0,
  thorns: 0,
  regenPerSecond: 0,
  healMultiplier: 1,
  floorHealBonus: 0,
  critChance: 0,
  critMultiplier: 1.5,
  lifestealOnHit: 0,
  extraProjectiles: 0,
  chestTierBonus: 0,
  chestAmount: 0,
  chestChance: 1,
  redRewardBonus: 0,
  escapeTime: 1,
  revealAdjacent: 0,
  secretHint: 0,
  redPortalChance: 0,
  trapChance: 0,
};

export function computeStats(base: Partial<Stats>, mods: readonly Modifier[]): Stats {
  const out: Stats = { ...DEFAULT_STATS, ...base };
  const keys = Object.keys(out) as StatKey[];
  for (const k of keys) {
    let v = out[k];
    for (const m of mods) if (m.stat === k && m.op === 'add') v += m.value;
    for (const m of mods) if (m.stat === k && m.op === 'mul') v *= m.value;
    out[k] = v;
  }
  out.maxHp = Math.max(1, Math.round(out.maxHp));
  return out;
}
