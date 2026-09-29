/**
 * 보스 정의 (기획서 8.6) [가정]. 패턴 읽는 보스전:
 * 모든 패턴은 예고(telegraph) → 공격(active) → 후딜레이(recovery). 후딜레이가 반격 기회.
 * 테마당 1종 + 9층 최종 보스. 같은 테마 안에서 층이 오르면 tier가 올라 패턴이 추가된다.
 */

export type BossAction = 'charge' | 'leapSlam' | 'rockfall' | 'volley' | 'groundSpikes' | 'dive' | 'slashWave' | 'homingOrbs' | 'summon';

export interface BossPattern {
  readonly id: string;
  readonly action: BossAction;
  /** 예고 시간 (초). 최소 0.4초 [가정] */
  readonly telegraph: number;
  /** 공격 유지 시간 (초) */
  readonly active: number;
  /** 후딜레이 (초) */
  readonly recovery: number;
  readonly weight: number;
  /** 이 페이즈부터 사용 */
  readonly phase: 1 | 2;
  /** 테마 안의 층 단계(1~3)가 이 값 이상일 때 사용 */
  readonly minTier: 1 | 2 | 3;
  readonly damage: number;
  /** 속도(px/s), 개수 등 행동별 값 */
  readonly speed?: number;
  readonly count?: number;
}

export interface BossDef {
  readonly id: 'cave' | 'ruins' | 'abyss' | 'final';
  readonly name: string;
  readonly hp: number;
  readonly contactDamage: number;
  /** 히트박스 (스프라이트보다 약간 작게) */
  readonly bodyWidth: number;
  readonly bodyHeight: number;
  readonly flying: boolean;
  /** 대기 중 이동 속도 */
  readonly moveSpeed: number;
  /** 패턴 사이 대기 (초) */
  readonly idleTime: number;
  /** 2페이즈 시간 배율 (예고/공격/후딜을 이 값으로 나눈다) */
  readonly phase2Speed: number;
  readonly patterns: readonly BossPattern[];
}

export const BOSS_RULES = {
  /** 모든 공격의 최소 예고 시간 (초) [가정] */
  minTelegraph: 0.4,
  /** 2페이즈 진입 체력 비율 */
  phase2At: 0.5,
  /** 등장/2페이즈 전환 연출 동안 무적 (초) */
  introTime: 1.2,
  phaseShiftTime: 0.9,
} as const;

export const BOSSES: readonly BossDef[] = [
  {
    id: 'cave',
    name: '석굴 파수꾼',
    hp: 260,
    contactDamage: 14,
    bodyWidth: 44,
    bodyHeight: 36,
    flying: false,
    moveSpeed: 40,
    idleTime: 0.7,
    phase2Speed: 1.25,
    patterns: [
      { id: 'cave_charge', action: 'charge', telegraph: 0.7, active: 1.4, recovery: 0.9, weight: 3, phase: 1, minTier: 1, damage: 18, speed: 250 },
      { id: 'cave_slam', action: 'leapSlam', telegraph: 0.6, active: 1.4, recovery: 1.0, weight: 3, phase: 1, minTier: 1, damage: 16, speed: 170 },
      { id: 'cave_rocks', action: 'rockfall', telegraph: 0.9, active: 1.2, recovery: 0.7, weight: 2, phase: 2, minTier: 1, damage: 14, count: 5 },
      { id: 'cave_rocks_t2', action: 'rockfall', telegraph: 0.9, active: 1.2, recovery: 0.7, weight: 1, phase: 1, minTier: 2, damage: 14, count: 4 },
      { id: 'cave_volley_t3', action: 'volley', telegraph: 0.6, active: 0.3, recovery: 0.8, weight: 2, phase: 1, minTier: 3, damage: 12, speed: 150, count: 5 },
    ],
  },
  {
    id: 'ruins',
    name: '몰락한 기사',
    hp: 300,
    contactDamage: 15,
    bodyWidth: 26,
    bodyHeight: 44,
    flying: false,
    moveSpeed: 55,
    idleTime: 0.6,
    phase2Speed: 1.3,
    patterns: [
      { id: 'ruins_dash', action: 'charge', telegraph: 0.5, active: 1.0, recovery: 0.8, weight: 3, phase: 1, minTier: 1, damage: 18, speed: 300 },
      { id: 'ruins_wave', action: 'slashWave', telegraph: 0.55, active: 0.3, recovery: 0.8, weight: 3, phase: 1, minTier: 1, damage: 15, speed: 220 },
      { id: 'ruins_slam', action: 'leapSlam', telegraph: 0.6, active: 1.4, recovery: 0.9, weight: 2, phase: 1, minTier: 1, damage: 17, speed: 190 },
      { id: 'ruins_spears', action: 'volley', telegraph: 0.65, active: 0.3, recovery: 0.9, weight: 2, phase: 2, minTier: 1, damage: 13, speed: 170, count: 5 },
      { id: 'ruins_spikes_t2', action: 'groundSpikes', telegraph: 0.8, active: 0.6, recovery: 0.7, weight: 2, phase: 1, minTier: 2, damage: 16, count: 2 },
    ],
  },
  {
    id: 'abyss',
    name: '심연의 눈',
    hp: 320,
    contactDamage: 14,
    bodyWidth: 44,
    bodyHeight: 44,
    flying: true,
    moveSpeed: 50,
    idleTime: 0.6,
    phase2Speed: 1.3,
    patterns: [
      { id: 'abyss_volley', action: 'volley', telegraph: 0.6, active: 0.3, recovery: 0.8, weight: 3, phase: 1, minTier: 1, damage: 13, speed: 150, count: 7 },
      { id: 'abyss_spikes', action: 'groundSpikes', telegraph: 0.8, active: 0.6, recovery: 0.8, weight: 3, phase: 1, minTier: 1, damage: 16, count: 3 },
      { id: 'abyss_dive', action: 'dive', telegraph: 0.7, active: 1.2, recovery: 1.0, weight: 2, phase: 1, minTier: 1, damage: 18, speed: 260 },
      { id: 'abyss_orbs', action: 'homingOrbs', telegraph: 0.7, active: 0.3, recovery: 0.9, weight: 2, phase: 2, minTier: 1, damage: 14, speed: 80, count: 3 },
      { id: 'abyss_rocks_t2', action: 'rockfall', telegraph: 0.9, active: 1.2, recovery: 0.7, weight: 1, phase: 1, minTier: 2, damage: 15, count: 6 },
    ],
  },
  {
    id: 'final',
    name: '심연의 왕',
    hp: 520,
    contactDamage: 18,
    bodyWidth: 48,
    bodyHeight: 60,
    flying: false,
    moveSpeed: 50,
    idleTime: 0.55,
    phase2Speed: 1.35,
    patterns: [
      { id: 'final_charge', action: 'charge', telegraph: 0.6, active: 1.2, recovery: 0.8, weight: 3, phase: 1, minTier: 1, damage: 20, speed: 290 },
      { id: 'final_slam', action: 'leapSlam', telegraph: 0.6, active: 1.4, recovery: 0.9, weight: 3, phase: 1, minTier: 1, damage: 20, speed: 200 },
      { id: 'final_volley', action: 'volley', telegraph: 0.6, active: 0.3, recovery: 0.8, weight: 2, phase: 1, minTier: 1, damage: 15, speed: 160, count: 7 },
      { id: 'final_spikes', action: 'groundSpikes', telegraph: 0.8, active: 0.6, recovery: 0.8, weight: 2, phase: 1, minTier: 1, damage: 18, count: 3 },
      { id: 'final_rocks', action: 'rockfall', telegraph: 0.9, active: 1.2, recovery: 0.7, weight: 2, phase: 2, minTier: 1, damage: 16, count: 7 },
      { id: 'final_summon', action: 'summon', telegraph: 0.8, active: 0.3, recovery: 1.0, weight: 1, phase: 2, minTier: 1, damage: 0, count: 2 },
    ],
  },
];

export function bossById(id: BossDef['id']): BossDef {
  const b = BOSSES.find((x) => x.id === id);
  if (!b) throw new Error(`알 수 없는 보스: ${id}`);
  return b;
}

/** 층(난이도 레벨)의 보스와 테마 안 단계. 9층은 최종 보스 [가정] */
export function bossForFloor(floor: number, kind: 'floor' | 'red'): { def: BossDef; tier: 1 | 2 | 3 } {
  if (kind === 'floor' && floor >= 9) return { def: bossById('final'), tier: 3 };
  const level = Math.min(8, kind === 'red' ? floor + 2 : floor);
  const id = level <= 3 ? 'cave' : level <= 6 ? 'ruins' : 'abyss';
  const tier = (((level - 1) % 3) + 1) as 1 | 2 | 3;
  return { def: bossById(id), tier };
}
