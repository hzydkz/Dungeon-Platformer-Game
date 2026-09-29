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
