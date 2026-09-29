/** 보상 (기획서 8.7) [가정] */
export const REWARDS = {
  /** 보스 처치 강화 선택지 수 */
  bossChoices: 3,
  /** 빨간 던전 보스 추가 보상: 최대 체력 대비 회복 */
  redBossHealRatio: 0.5,
  chest: {
    /** 상자 1칸당 회복 아이템일 확률 (나머지는 소형 강화) */
    healChance: 0.4,
    /** 회복량 (최대 체력 대비) */
    healRatio: 0.25,
    /** 소형 강화가 일반 강화로 오를 기본 확률 (행운아 등으로 증가) */
    tierUpChance: 0.1,
  },
  /** 제단: 현재 체력의 이 비율을 바치고 일반 강화 하나 */
  altarHpCost: 0.3,
  /** 비밀 벽 힌트 거리 (타일, 성격 '호기심') */
  secretHintRange: 7,
} as const;
