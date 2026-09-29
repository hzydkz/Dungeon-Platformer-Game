/** 층 진행, 포탈, 회복 (기획서 5.1, 7, 8.8, 9장). [가정] */
export const PROGRESSION = {
  floors: 9,
  /** 빨간 포탈 생성 확률 (층당) [가정] */
  redPortalChance: 0.25,
  /** 빨간 포탈이 생기지 않는 층 [가정] */
  noRedPortalFloors: [1] as readonly number[],
  /** 빨간 던전 난이도 가산 (현재 층 + n) [가정] */
  redDifficultyBonus: 2,
  /** 9층을 넘는 난이도 레벨당 추가 배율 [가정] */
  beyondMaxLevelMultiplier: 0.25,
  /** 빨간 포탈 알림 표시 시간 (초) */
  redPortalNoticeSeconds: 3,
  /** 탈출 제한 시간 = 최단 경로 이동 시간 × 배율 + 여유 (초) [가정] */
  escapeTimeMultiplier: 1.5,
  escapeTimeBonusSeconds: 10,
  /** 남은 시간 경고 시작 (초) */
  escapeWarningSeconds: 10,
  /** 층 이동 시 최대 체력 대비 회복 비율 [가정] */
  floorHealRatio: 0.3,
  /** 9층: 출구 포탈 없음, 최종 보스 처치가 클리어 조건 [가정] */
  finalFloorHasExit: false,
} as const;
