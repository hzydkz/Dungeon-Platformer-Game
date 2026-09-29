import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../src/config/movement';
import { PROGRESSION } from '../src/config/progression';
import { escapeTimeForLayout, escapeTimeSeconds, pathDistance, shortestRoomPath } from '../src/core/escape';
import { generateFloor } from '../src/core/generation/floor';

describe('탈출 제한 시간 (기획서 7.2)', () => {
  it('공식: 이동 시간 × 1.5 + 10초', () => {
    expect(escapeTimeSeconds(1100, 110)).toBeCloseTo(10 * PROGRESSION.escapeTimeMultiplier + PROGRESSION.escapeTimeBonusSeconds);
    expect(escapeTimeSeconds(0, 110)).toBe(PROGRESSION.escapeTimeBonusSeconds);
  });

  it('성격 배율(냉정 +20%)이 곱해진다', () => {
    expect(escapeTimeSeconds(1100, 110, 1.2)).toBeCloseTo(escapeTimeSeconds(1100, 110) * 1.2);
  });

  it('빨간 던전에서 보스방→입구 최단 경로로 계산한다', () => {
    for (let s = 0; s < 30; s++) {
      const f = generateFloor({ runSeed: s, floor: 3, kind: 'red' });
      const L = f.layout;
      const path = shortestRoomPath(L, L.boss, L.entrance);
      expect(path[0]).toBe(L.boss);
      expect(path[path.length - 1]).toBe(L.entrance);
      const centers = f.rooms.map((r) => ({ x: (r.x + r.w / 2) * 16, y: (r.y + r.h / 2) * 16 }));
      const t = escapeTimeForLayout(L, centers, MOVEMENT.runSpeed);
      expect(t).toBeCloseTo(escapeTimeSeconds(pathDistance(path, centers), MOVEMENT.runSpeed));
      // 적어도 방 하나 거리 이상
      expect(t).toBeGreaterThan(PROGRESSION.escapeTimeBonusSeconds + 480 / MOVEMENT.runSpeed);
    }
  });
});
