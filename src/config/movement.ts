/**
 * 플레이어 이동 물리값 (기획서 4.1). [가정] 튜닝 대상.
 * M2의 도달성 검증기도 이 파일의 값을 기준으로 삼는다 (4.2).
 */
export const MOVEMENT = {
  /** 중력 (px/s²) */
  gravity: 900,
  /** 점프 초속 (px/s) */
  jumpVelocity: 320,
  /** 달리기 속도 (px/s) */
  runSpeed: 110,
  /** 최대 낙하 속도 (px/s) */
  maxFallSpeed: 400,
  /** 점프 키를 떼면 상승 속도에 곱하는 비율 (가변 점프) */
  jumpCutMultiplier: 0.5,
  /** 코요테 타임 (초) */
  coyoteTime: 0.1,
  /** 점프 버퍼 (초) */
  jumpBufferTime: 0.1,
} as const;
