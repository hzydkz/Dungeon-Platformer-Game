/**
 * 모서리 잡기 (스펠렁키식 레지 그랩) 판정. Phaser 비의존.
 *
 * 잡히는 조건:
 *  - 공중에서 떨어지는 중이고, 벽 쪽으로 방향 입력을 하고 있다 (호출 측이 확인)
 *  - 몸 바로 옆(reach px 이내)이 막힌 타일이고, 그 타일 위 칸이 비어 있다 (= 모서리)
 *  - 이번 프레임에 "손" 높이가 그 모서리 윗면을 위에서 아래로 지나갔다
 *  - 매달린 자세로 옮겼을 때 몸이 다른 막힌 타일과 겹치지 않는다
 * 단방향 발판은 모서리가 아니다 (잡을 수 없고, 벽 위에 놓여 있으면 그 벽 모서리도 막힌다).
 */
import { isOneWayTile, isSolidTile } from '../tiles';

export type TileQuery = (tileX: number, tileY: number) => number;

export interface LedgeParams {
  /** 몸과 벽 사이 허용 간격 (px) */
  readonly reach: number;
  /** 손 위치 = 몸 윗변 + handY (px, 음수면 머리 위) */
  readonly handY: number;
}

export interface LedgeBody {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  /** 이전 프레임의 몸 윗변 */
  readonly prevTop: number;
  readonly height: number;
}

export interface LedgeGrab {
  /** 잡은 벽 타일 */
  readonly tileX: number;
  readonly tileY: number;
  readonly dir: 1 | -1;
  /** 매달렸을 때 몸 왼쪽/윗변 (px) */
  readonly bodyLeft: number;
  readonly bodyTop: number;
}

/** 잡을 수 있는 모서리 타일인가: 막힌 타일이고 위 칸이 비어 있다 */
export function isLedgeCorner(tileAt: TileQuery, tx: number, ty: number): boolean {
  if (!isSolidTile(tileAt(tx, ty))) return false;
  const above = tileAt(tx, ty - 1);
  return !isSolidTile(above) && !isOneWayTile(above);
}

function bodyFree(tileAt: TileQuery, left: number, top: number, width: number, height: number, s: number): boolean {
  const x0 = Math.floor(left / s);
  const x1 = Math.floor((left + width - 0.01) / s);
  const y0 = Math.floor(top / s);
  const y1 = Math.floor((top + height - 0.01) / s);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) if (isSolidTile(tileAt(tx, ty))) return false;
  }
  return true;
}

/** dir 쪽 벽에서 이번 프레임에 잡을 모서리를 찾는다. 없으면 null */
export function findLedgeGrab(tileAt: TileQuery, body: LedgeBody, dir: 1 | -1, tileSize: number, p: LedgeParams): LedgeGrab | null {
  const s = tileSize;
  const width = body.right - body.left;
  const tx = dir > 0 ? Math.floor((body.right + p.reach) / s) : Math.floor((body.left - p.reach) / s);
  const gap = dir > 0 ? tx * s - body.right : body.left - (tx + 1) * s;
  if (gap < -0.5 || gap > p.reach) return null;

  const handPrev = body.prevTop + p.handY;
  const hand = body.top + p.handY;
  if (hand < handPrev) return null;
  // 손이 지나간 타일 윗면들 (위에서부터)
  for (let ty = Math.ceil(handPrev / s); ty * s <= hand; ty++) {
    if (!isLedgeCorner(tileAt, tx, ty)) continue;
    const bodyTop = ty * s - p.handY;
    const bodyLeft = dir > 0 ? tx * s - width : (tx + 1) * s;
    if (!bodyFree(tileAt, bodyLeft, bodyTop, width, body.height, s)) continue;
    return { tileX: tx, tileY: ty, dir, bodyLeft, bodyTop };
  }
  return null;
}
