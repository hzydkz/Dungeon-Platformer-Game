/** 보상 (기획서 8.7) [가정]. 아이템/골드 수치는 config/items.ts */
export const REWARDS = {
  /** 빨간 던전 보스 추가 보상: 최대 체력 대비 회복 */
  redBossHealRatio: 0.5,
  /** 제단: 현재 체력의 이 비율을 바치고 아이템 하나 */
  altarHpCost: 0.3,
  /** 비밀 벽 힌트 거리 (타일, 성격 '호기심') */
  secretHintRange: 7,
} as const;
