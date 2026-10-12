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

/** 가시 타일의 피해 판정 영역 (타일 내부 px). 게임과 도달성 검증기가 같은 값을 쓴다. */
export const SPIKE_HITBOX = {
  /** 좌우 여백 */
  insetX: 2,
  /** 타일 위쪽에서 판정 시작까지 */
  top: 8,
} as const;

/** 넝쿨 오르기 (기획자 요청: 발판 사다리 대신 동굴 정글의 넝쿨). 도달성 검증기도 같은 규칙(reach.ts의 addVineEdges)을 쓴다 */
export const VINE = {
  /** 오르내리는 속도 (px/s) */
  climbSpeed: 80,
  /** 몸 중심이 넝쿨 칸 중심에서 이만큼(px) 안이면 붙잡을 수 있다 */
  grabReach: 7,
  /** 넝쿨에서 점프할 때 초속 배율 */
  jumpMultiplier: 0.85,
} as const;

/**
 * 모서리 잡기 (스펠렁키식). 떨어지는 중에 벽 쪽으로 방향을 넣고 있으면 막힌 블록의 위 모서리를 붙잡는다.
 * 단방향 발판은 잡을 수 없다. 매달린 상태: 점프 = 뛰어오르기(가변 점프 없이 최대 높이), ↓ = 놓기 (↓+점프도 놓기).
 * 매달린 동안 공격/스킬은 쓸 수 없다.
 * 도달성 검증기는 모서리 잡기를 쓰지 않는다 (맵은 잡기 없이도 모두 도달 가능해야 한다).
 */
export const LEDGE_GRAB = {
  /** 몸과 벽 사이 허용 간격 (px) */
  reach: 2,
  /** 손 높이 = 몸 윗변 + handY (px). 매달리면 몸 윗변이 모서리 윗면보다 이만큼 아래에 온다 */
  handY: -2,
  /** 놓거나 맞아서 떨어진 뒤 다시 잡을 수 없는 시간 (초) */
  regrabCooldown: 0.25,
} as const;
