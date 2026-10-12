/** 전투 공통 (기획서 8.5). [가정] */
export const COMBAT = {
  player: {
    /** 피격 후 무적 시간 (초) */
    invulnTime: 1.0,
    /** 무적 중 깜빡임 주기 (초) */
    blinkInterval: 0.08,
    /** 피격 넉백 속도 (px/s) */
    knockbackX: 150,
    knockbackY: 170,
    /** 피격 후 조작 불가 시간 (초) */
    hurtLock: 0.2,
    /** 가시 피해 */
    spikeDamage: 12,
    /** 아래 공격이 적에 맞으면 튀어 오르는 속도 (px/s) */
    pogoVelocity: 260,
    /**
     * 공격 판정 보정 (기획자 피드백: 판정이 너무 박하다).
     * 근접 옆 공격은 머리 위부터 발밑까지 덮고 몸 뒤쪽 조금부터 시작, 판정 유지 시간 하한,
     * 적의 피격 영역은 사방으로 hitMargin만큼 넓게 본다(투사체 포함).
     */
    meleeTop: 15,
    meleeBottom: 14,
    meleeBehind: 4,
    minActive: 0.12,
    hitMargin: 4,
  },
  monster: {
    /** 피격 경직 (초) */
    hitstun: 0.22,
    /** 피격 넉백 속도 (px/s) */
    knockback: 130,
    /** 피격 시 흰색 번쩍임 (초) */
    flashTime: 0.08,
    /** 모든 몬스터 공격의 최소 예고 시간 (초) */
    minTelegraph: 0.4,
    /** 몬스터가 플레이어를 인식하는 기본 거리 (px) */
    defaultSight: 150,
  },
  /** 층별 몬스터 배율: 1 + perLevel × (레벨 - 1) [가정] */
  scalingPerLevel: 0.25,
  drops: {
    /** 몬스터 처치 시 회복 아이템 확률 [가정] */
    healChance: 0.08,
    /** 회복 아이템 회복량 (최대 체력 대비) */
    healRatio: 0.15,
  },
} as const;
