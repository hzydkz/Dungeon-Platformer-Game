/**
 * 물리값에서 이동 한계를 도출한다 (기획서 4.2). Phaser 비의존.
 */
import type { MotorParams } from './motor';

export interface MovementLimits {
  /** 최대 점프 높이 (px) */
  readonly jumpHeightPx: number;
  /** 같은 높이로 착지하는 점프의 최대 가로 이동 거리 (px) */
  readonly flatJumpDistancePx: number;
  /** 오를 수 있는 높이 (타일, 내림) */
  readonly jumpUpTiles: number;
  /** 건널 수 있는 빈 칸 수 (타일, 내림). 몸 너비만큼 발판 끝에 걸칠 수 있다. */
  readonly gapTiles: number;
}

export function deriveMovementLimits(
  params: MotorParams,
  tileSize: number,
  bodyWidth: number,
  /** 가장 느린 이동속도 배율 (특성 포함) */
  minSpeedMultiplier = 1,
): MovementLimits {
  const jumpHeightPx = (params.jumpVelocity * params.jumpVelocity) / (2 * params.gravity);
  const airTime = (2 * params.jumpVelocity) / params.gravity;
  const flatJumpDistancePx = airTime * params.runSpeed * minSpeedMultiplier;
  // 출발 시 몸이 발판에 1px만 걸쳐도 되고, 착지 시에도 1px만 걸치면 된다.
  const gapTiles = Math.floor((flatJumpDistancePx + bodyWidth - 2) / tileSize);
  return {
    jumpHeightPx,
    flatJumpDistancePx,
    jumpUpTiles: Math.floor(jumpHeightPx / tileSize),
    gapTiles,
  };
}
