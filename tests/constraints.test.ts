import { describe, expect, it } from 'vitest';
import { DISPLAY } from '../src/config/display';
import { GENERATION_CONSTRAINTS, MOVEMENT, PLAYER_SIZE } from '../src/config/movement';
import { MIN_SPEED_MULTIPLIER } from '../src/core/generation/params';
import { deriveMovementLimits } from '../src/core/movement/constraints';

describe('이동 한계 (기획서 4.2)', () => {
  it('기획서 수치: 최대 높이 약 57px', () => {
    const l = deriveMovementLimits(MOVEMENT, DISPLAY.tileSize, PLAYER_SIZE.bodyWidth);
    expect(l.jumpHeightPx).toBeCloseTo(56.9, 1);
  });

  it('물리값이 맵 생성 제약(오르기 3타일, 간격 4타일)을 만족한다 (가장 느린 특성 포함)', () => {
    const l = deriveMovementLimits(MOVEMENT, DISPLAY.tileSize, PLAYER_SIZE.bodyWidth, MIN_SPEED_MULTIPLIER);
    expect(l.jumpUpTiles).toBeGreaterThanOrEqual(GENERATION_CONSTRAINTS.maxJumpUpTiles);
    expect(l.gapTiles).toBeGreaterThanOrEqual(GENERATION_CONSTRAINTS.maxGapTiles);
  });
});
