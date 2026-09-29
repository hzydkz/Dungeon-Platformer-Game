/** 도달성 시뮬레이터 파라미터: 게임 물리 설정에서 만든다. */
import { DISPLAY } from '../../config/display';
import { MOVEMENT, PLAYER_SIZE, SPIKE_HITBOX } from '../../config/movement';
import type { ReachParams } from './reach';

/** 가장 느린 이동속도 배율 (특성 '강철 피부' 등). data/traits.ts와 일치해야 한다 (테스트로 확인). */
export const MIN_SPEED_MULTIPLIER = 0.9;

export const REACH_PARAMS: ReachParams = {
  motor: MOVEMENT,
  tileSize: DISPLAY.tileSize,
  bodyWidth: PLAYER_SIZE.bodyWidth,
  bodyHeight: PLAYER_SIZE.bodyHeight,
  speedMultiplier: MIN_SPEED_MULTIPLIER,
  dropThroughTime: MOVEMENT.dropThroughTime,
  dt: 1 / 60,
  maxTime: 3,
  oneWayTolerance: 2,
  spike: SPIKE_HITBOX,
};
