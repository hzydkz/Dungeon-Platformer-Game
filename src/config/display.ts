/** 화면 및 그래픽 규격 (기획서 3장). */
export const DISPLAY = {
  /** 타일 크기(px). [확정] */
  tileSize: 16,
  /** 내부 해상도. 정수배로만 확대한다. */
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
