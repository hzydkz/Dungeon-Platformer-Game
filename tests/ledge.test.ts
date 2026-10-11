import { describe, expect, it } from 'vitest';
import { DISPLAY } from '../src/config/display';
import { LEDGE_GRAB, MOVEMENT, PLAYER_SIZE } from '../src/config/movement';
import { findLedgeGrab, isLedgeCorner, type LedgeBody } from '../src/core/movement/ledge';
import { basicCharToTile, getTile, gridFromAscii } from '../src/core/tiles';

const S = DISPLAY.tileSize;
const W = PLAYER_SIZE.bodyWidth;
const H = PLAYER_SIZE.bodyHeight;

function query(rows: string[]) {
  const g = gridFromAscii(rows, basicCharToTile);
  return (x: number, y: number) => getTile(g, x, y);
}

// 5열 4행부터 벽. 모서리 윗면 y = 64
const WALL = [
  '..........', // 0
  '..........', // 1
  '..........', // 2
  '..........', // 3
  '.....#####', // 4
  '.....#####', // 5
  '.....#####', // 6
  '.....#####', // 7
];
const LEDGE_TOP = 4 * S;

/** 벽 왼쪽에 붙은 몸. top은 이번 프레임, prevTop은 이전 프레임 */
function bodyLeftOfWall(prevTop: number, top: number, gap = 0): LedgeBody {
  const right = 5 * S - gap;
  return { left: right - W, right, top, prevTop, height: H };
}

describe('모서리 잡기', () => {
  it('떨어지면서 손이 모서리 윗면을 지나가면 잡고, 몸을 매달린 위치로 맞춘다', () => {
    const hand = LEDGE_TOP - LEDGE_GRAB.handY; // 손이 모서리에 닿는 몸 윗변
    const g = findLedgeGrab(query(WALL), bodyLeftOfWall(hand - 5, hand + 1), 1, S, LEDGE_GRAB);
    expect(g).not.toBeNull();
    expect(g).toMatchObject({ tileX: 5, tileY: 4, dir: 1, bodyTop: hand, bodyLeft: 5 * S - W });
  });

  it('손이 모서리를 지나가지 않았으면 잡지 않는다', () => {
    const hand = LEDGE_TOP - LEDGE_GRAB.handY;
    expect(findLedgeGrab(query(WALL), bodyLeftOfWall(hand - 10, hand - 4), 1, S, LEDGE_GRAB)).toBeNull();
    expect(findLedgeGrab(query(WALL), bodyLeftOfWall(hand + 2, hand + 8), 1, S, LEDGE_GRAB)).toBeNull();
  });

  it('올라가는 중에는 잡지 않는다', () => {
    const hand = LEDGE_TOP - LEDGE_GRAB.handY;
    expect(findLedgeGrab(query(WALL), bodyLeftOfWall(hand + 3, hand - 3), 1, S, LEDGE_GRAB)).toBeNull();
  });

  it('벽에서 reach보다 멀거나 반대쪽으로 입력하면 잡지 않는다', () => {
    const hand = LEDGE_TOP - LEDGE_GRAB.handY;
    expect(findLedgeGrab(query(WALL), bodyLeftOfWall(hand - 5, hand + 1, LEDGE_GRAB.reach + 1), 1, S, LEDGE_GRAB)).toBeNull();
    expect(findLedgeGrab(query(WALL), bodyLeftOfWall(hand - 5, hand + 1), -1, S, LEDGE_GRAB)).toBeNull();
  });

  it('단방향 블록은 모서리로 잡을 수 없다', () => {
    const rows = WALL.map((r, y) => (y === 4 ? '.....=====' : r));
    const hand = LEDGE_TOP - LEDGE_GRAB.handY;
    expect(findLedgeGrab(query(rows), bodyLeftOfWall(hand - 5, hand + 1), 1, S, LEDGE_GRAB)).toBeNull();
  });

  it('벽 위에 단방향 블록이 놓여 있으면 그 벽 모서리도 잡을 수 없다', () => {
    const rows = WALL.map((r, y) => (y === 3 ? '.....=....' : r));
    expect(isLedgeCorner(query(rows), 5, 4)).toBe(false);
    expect(isLedgeCorner(query(WALL), 5, 4)).toBe(true);
    expect(isLedgeCorner(query(WALL), 5, 5)).toBe(false);
  });

  it('매달릴 자리에 막힌 블록이 있으면 잡지 않는다', () => {
    const rows = WALL.map((r, y) => (y === 5 ? '....######' : r));
    const hand = LEDGE_TOP - LEDGE_GRAB.handY;
    expect(findLedgeGrab(query(rows), bodyLeftOfWall(hand - 5, hand + 1), 1, S, LEDGE_GRAB)).toBeNull();
  });

  it('왼쪽 벽도 같은 규칙으로 잡는다', () => {
    const rows = WALL.map((r) => [...r].reverse().join(''));
    const hand = LEDGE_TOP - LEDGE_GRAB.handY;
    const left = 5 * S; // 반전된 벽의 오른쪽 끝 = 5*S
    const g = findLedgeGrab(query(rows), { left, right: left + W, top: hand + 1, prevTop: hand - 5, height: H }, -1, S, LEDGE_GRAB);
    expect(g).toMatchObject({ tileX: 4, tileY: 4, dir: -1, bodyLeft: 5 * S, bodyTop: hand });
  });

  it('최대 낙하 속도로 떨어져도 한 프레임에 지나간 모서리를 놓치지 않는다', () => {
    const hand = LEDGE_TOP - LEDGE_GRAB.handY;
    const step = MOVEMENT.maxFallSpeed / 30; // 30fps 한 프레임
    expect(findLedgeGrab(query(WALL), bodyLeftOfWall(hand - step + 1, hand + 1), 1, S, LEDGE_GRAB)).not.toBeNull();
  });

  it('매달린 자세에서 점프하면 발이 모서리 위로 올라간다', () => {
    const feetBelowLedge = -LEDGE_GRAB.handY + H;
    const jumpHeight = MOVEMENT.jumpVelocity ** 2 / (2 * MOVEMENT.gravity);
    expect(jumpHeight).toBeGreaterThan(feetBelowLedge + 4);
  });
});
