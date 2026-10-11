/**
 * 정수배 확대 배율 계산. Phaser 비의존.
 * 창 크기 안에 내부 해상도를 정수배로 최대한 크게 넣는다 (최소 1배).
 */
export function computeIntegerZoom(
  viewportWidth: number,
  viewportHeight: number,
  gameWidth: number,
  gameHeight: number,
): number {
  const zoom = Math.floor(Math.min(viewportWidth / gameWidth, viewportHeight / gameHeight));
  return Math.max(1, Number.isFinite(zoom) ? zoom : 1);
}

export interface ViewSize {
  /** 내부 해상도 (게임 좌표 px) */
  readonly width: number;
  readonly height: number;
  /** 화면 확대 배율 (정수가 아닐 수 있다) */
  readonly zoom: number;
}

/**
 * 창 크기에 맞는 내부 해상도와 배율. 기준 해상도(base)를 줄이지 않고 창 비율에 맞춰 한 방향만 넓힌 뒤
 * (최대 max), 창에 꽉 차는 배율로 키운다.
 */
export function computeView(
  viewportWidth: number,
  viewportHeight: number,
  baseWidth: number,
  baseHeight: number,
  maxWidth: number,
  maxHeight: number,
): ViewSize {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return { width: baseWidth, height: baseHeight, zoom: 1 };
  const aspect = viewportWidth / viewportHeight;
  let width = baseWidth;
  let height = baseHeight;
  if (aspect >= baseWidth / baseHeight) width = Math.min(maxWidth, Math.round((baseHeight * aspect) / 2) * 2);
  else height = Math.min(maxHeight, Math.round(baseWidth / aspect / 2) * 2);
  const zoom = Math.min(viewportWidth / width, viewportHeight / height);
  return { width, height, zoom };
}
