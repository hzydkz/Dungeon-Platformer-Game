/**
 * 쓰지 않는 위 출입구 정리 (층 조립과 템플릿 정리가 같이 쓴다). Phaser 비의존.
 * 그 출입구 아래 발사대 발판을 지운다. (그리로 가는 넝쿨까지 지우는 것도 해 봤지만, 그 넝쿨이 다른 길도 겸하는 경우가 많아
 * 층 검증 실패가 크게 늘어 그만뒀다.)
 */
import { DOOR, ROOM, type VerticalSlot } from '../../config/generation';
import type { DoorCap } from './template';

export interface TrimAccess {
  clear(x: number, y: number): void;
}

/** 방(템플릿 좌표) 안에서 위 출입구 하나를 정리한다 */
export function trimUnusedUpDoor(a: TrimAccess, c: DoorCap): void {
  const base = c.seg * ROOM.widthTiles;
  for (const col of DOOR.vertical[c.slot as VerticalSlot]) a.clear(base + col, DOOR.launchRow);
}
