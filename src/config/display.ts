/** 화면 및 그래픽 규격 (기획서 3장). */
export const DISPLAY = {
  /** 타일 크기(px). [확정] */
  tileSize: 16,
  /** 기준 내부 해상도. 창 비율에 맞춰 VIEW 범위 안에서 넓어지고, 창을 꽉 채우도록 (정수배가 아닐 수도 있는 배율로) 확대한다. */
  width: 480,
  height: 270,
  backgroundColor: '#0b0b12',
} as const;

/** 카메라: 보스전 외에는 층 전체를 부드럽게 따라간다. 보스전에는 아레나에 고정 */
export const CAMERA = {
  /** 따라가기 보간 (0~1, 작을수록 부드럽다) */
  followLerp: 0.12,
  /** 이 사각형(px) 안에서 움직일 때는 카메라가 움직이지 않는다 */
  deadzoneWidth: 40,
  deadzoneHeight: 56,
  /** 화면 밖 이 거리(px)까지 들어온 몬스터를 깨운다 */
  wakeMargin: 96,
  /** 보스전 시작 시 아레나로 이동하는 시간 (ms) */
  bossPanMs: 450,
} as const;

/**
 * 보이는 범위 (기획자 요청: 창을 꽉 채움). 기준 해상도보다 좁아지지 않고, 창 비율이 16:9와 다르면
 * 남는 방향으로 넓힌다. 너무 넓게 보이지 않도록 최대값이 있고, 그보다 비율이 극단적이면 남는 부분은 검게 둔다.
 */
export const VIEW = {
  maxWidth: 640,
  /** 4:3(아이패드 가로)에서 480×360 */
  maxHeight: 360,
} as const;
