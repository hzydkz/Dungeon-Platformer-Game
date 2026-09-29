/**
 * 몬스터 정의 (기획서 8.5) [가정]. 테마당 3종: 걷는 근접형, 비행형, 원거리형.
 * 테마가 바뀌면 같은 역할이라도 새로운 행동 패턴(돌진, 도약, 사인파 비행, 3갈래 탄, 유도탄)이 추가된다.
 * 모든 공격은 예고 동작(telegraph)을 가진다.
 */
import type { ThemeId } from '../assets/keys';

export type MonsterBehavior = 'walker' | 'flyer' | 'shooter';

export interface MonsterDef {
  readonly id: string;
  readonly name: string;
  readonly theme: ThemeId;
  readonly behavior: MonsterBehavior;
  readonly hp: number;
  /** 접촉 피해 (0이면 접촉 피해 없음) */
  readonly contactDamage: number;
  /** 이동 속도 (px/s) */
  readonly speed: number;
  readonly sight: number;
  /** 몸 크기 (px) */
  readonly bodyWidth: number;
  readonly bodyHeight: number;
  /** 특수 공격: 예고 → 실행 → 후딜 */
  readonly attack?: {
    readonly kind: 'charge' | 'hop' | 'shot' | 'spread' | 'homing';
    readonly telegraph: number;
    readonly duration: number;
    readonly recovery: number;
    readonly cooldown: number;
    readonly damage: number;
    /** 돌진/도약 속도 또는 탄속 (px/s) */
    readonly speed: number;
    /** 발동 거리 (px) */
    readonly range: number;
  };
  /** 비행형 이동 방식 */
  readonly flight?: 'direct' | 'wave' | 'keepDistance';
}

export const MONSTERS: readonly MonsterDef[] = [
  // 동굴
  { id: 'slime', name: '점액', theme: 'cave', behavior: 'walker', hp: 24, contactDamage: 10, speed: 32, sight: 120, bodyWidth: 14, bodyHeight: 10 },
  { id: 'bat', name: '박쥐', theme: 'cave', behavior: 'flyer', hp: 14, contactDamage: 8, speed: 60, sight: 150, bodyWidth: 12, bodyHeight: 8, flight: 'direct' },
  {
    id: 'spitter', name: '침뱉개', theme: 'cave', behavior: 'shooter', hp: 22, contactDamage: 6, speed: 0, sight: 200, bodyWidth: 14, bodyHeight: 14,
    attack: { kind: 'shot', telegraph: 0.55, duration: 0.1, recovery: 0.6, cooldown: 1.6, damage: 10, speed: 130, range: 200 },
  },
  // 폐허
  {
    id: 'knight', name: '망령 기사', theme: 'ruins', behavior: 'walker', hp: 40, contactDamage: 12, speed: 36, sight: 150, bodyWidth: 12, bodyHeight: 22,
    attack: { kind: 'charge', telegraph: 0.5, duration: 0.6, recovery: 0.7, cooldown: 2.0, damage: 16, speed: 210, range: 140 },
  },
  { id: 'wisp', name: '도깨비불', theme: 'ruins', behavior: 'flyer', hp: 18, contactDamage: 10, speed: 55, sight: 170, bodyWidth: 10, bodyHeight: 10, flight: 'wave' },
  {
    id: 'turret', name: '석상 포대', theme: 'ruins', behavior: 'shooter', hp: 36, contactDamage: 8, speed: 0, sight: 220, bodyWidth: 14, bodyHeight: 14,
    attack: { kind: 'spread', telegraph: 0.6, duration: 0.1, recovery: 0.7, cooldown: 2.0, damage: 11, speed: 120, range: 220 },
  },
  // 심연
  {
    id: 'crawler', name: '심연 벌레', theme: 'abyss', behavior: 'walker', hp: 42, contactDamage: 13, speed: 44, sight: 160, bodyWidth: 18, bodyHeight: 10,
    attack: { kind: 'hop', telegraph: 0.45, duration: 0.7, recovery: 0.5, cooldown: 1.6, damage: 14, speed: 130, range: 120 },
  },
  {
    id: 'eye', name: '떠도는 눈', theme: 'abyss', behavior: 'flyer', hp: 30, contactDamage: 10, speed: 50, sight: 190, bodyWidth: 14, bodyHeight: 14, flight: 'keepDistance',
    attack: { kind: 'shot', telegraph: 0.5, duration: 0.1, recovery: 0.6, cooldown: 1.8, damage: 12, speed: 140, range: 190 },
  },
  {
    id: 'caster', name: '심연 주술사', theme: 'abyss', behavior: 'shooter', hp: 38, contactDamage: 8, speed: 0, sight: 230, bodyWidth: 12, bodyHeight: 22,
    attack: { kind: 'homing', telegraph: 0.7, duration: 0.1, recovery: 0.8, cooldown: 2.4, damage: 14, speed: 75, range: 230 },
  },
];

/** 층별 출현 가중치 [가정]: 현재 테마의 3종이 중심이고, 이전 테마 몬스터도 조금 섞인다 */
export const MONSTER_WEIGHTS: Readonly<Record<number, Readonly<Record<string, number>>>> = {
  1: { slime: 5, bat: 3 },
  2: { slime: 4, bat: 3, spitter: 2 },
  3: { slime: 3, bat: 3, spitter: 3 },
  4: { knight: 4, wisp: 3, slime: 1, bat: 1 },
  5: { knight: 4, wisp: 3, turret: 2, spitter: 1 },
  6: { knight: 3, wisp: 3, turret: 3, bat: 1 },
  7: { crawler: 4, eye: 3, knight: 1, wisp: 1 },
  8: { crawler: 4, eye: 3, caster: 2, turret: 1 },
  9: { crawler: 3, eye: 3, caster: 3, knight: 1 },
};

export function monsterById(id: string): MonsterDef {
  const m = MONSTERS.find((x) => x.id === id);
  if (!m) throw new Error(`알 수 없는 몬스터: ${id}`);
  return m;
}

/** 층(난이도 레벨)의 출현 표. 9를 넘으면 9층 표 */
export function monsterTable(level: number): [string, number][] {
  const key = Math.max(1, Math.min(9, level));
  return Object.entries(MONSTER_WEIGHTS[key] ?? {});
}
