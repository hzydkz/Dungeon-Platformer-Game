/**
 * 플레이어 이동 물리값 (기획서 4.1). [가정] 튜닝 대상.
 * 모든 역할군이 같은 값을 쓴다. 맵 생성기의 도달성 검증기도 이 값으로 시뮬레이션한다 (4.2).
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
  /** 단방향 발판 아래로 내려가기(↓+점프) 시 발판 충돌을 끄는 시간 (초) */
  dropThroughTime: 0.25,
} as const;

/** 플레이어 크기 (기획서 3장: 스프라이트 16×24, 타일에 묶이지 않음). 충돌 박스는 외형보다 약간 작다. */
export const PLAYER_SIZE = {
  spriteWidth: 16,
  spriteHeight: 24,
  bodyWidth: 10,
  bodyHeight: 22,
} as const;

/**
 * 맵 생성 제약 (기획서 4.2). 템플릿 작성 기준이며,
 * `tests/constraints.test.ts`가 위 물리값으로 이 제약을 실제로 만족하는지 검사한다.
 */
export const GENERATION_CONSTRAINTS = {
  /** 한 번 점프로 오를 수 있는 높이 (타일) */
  maxJumpUpTiles: 3,
  /** 점프로 건널 수 있는 가로 간격 (타일) */
  maxGapTiles: 4,
} as const;
