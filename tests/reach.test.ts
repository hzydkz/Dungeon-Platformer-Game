import { describe, expect, it } from 'vitest';
import { REACH_PARAMS } from '../src/core/generation/params';
import { buildReachGraph, reachableFrom } from '../src/core/generation/reach';
import { basicCharToTile, gridFromAscii } from '../src/core/tiles';

/** A에서 B로 갈 수 있는지 */
function reachable(lines: string[]): boolean {
  const grid = gridFromAscii(lines.map((l) => l.replace(/[AB]/g, '.')), basicCharToTile);
  const find = (ch: string) => {
    const y = lines.findIndex((l) => l.includes(ch));
    return y * grid.width + (lines[y] as string).indexOf(ch);
  };
  const g = buildReachGraph(grid, REACH_PARAMS);
  const r = reachableFrom(g, [find('A')]);
  return r.has(g.nodeOf[find('B')] as number);
}

describe('도달성 시뮬레이터', () => {
  // 바닥 윗면(9행 위쪽)과 발판 윗면의 높이 차이로 센다.
  it('3타일 높이는 오를 수 있다', () => {
    expect(
      reachable([
        '##########',
        '#........#',
        '#........#',
        '#........#',
        '#........#',
        '#.....B..#',
        '#....#####',
        '#........#',
        '#.A......#',
        '##########',
      ]),
    ).toBe(true);
  });

  it('4타일 높이는 오를 수 없다', () => {
    expect(
      reachable([
        '##########',
        '#........#',
        '#........#',
        '#........#',
        '#.....B..#',
        '#....#####',
        '#........#',
        '#........#',
        '#.A......#',
        '##########',
      ]),
    ).toBe(false);
  });

  it('4타일 간격은 건널 수 있다', () => {
    expect(reachable(['############', '#..........#', '#..........#', '#..........#', '#A....B....#', '##....######', '############'])).toBe(true);
  });

  it('6타일 간격은 건널 수 없다', () => {
    expect(reachable(['##############', '#............#', '#............#', '#............#', '#A......B....#', '##......######', '##^^^^^^######', '##############'])).toBe(false);
  });

  it('단방향 발판은 아래에서 뚫고 올라가 밟을 수 있다', () => {
    expect(reachable(['#######', '#.....#', '#..B..#', '#.===.#', '#.....#', '#..A..#', '#######'])).toBe(true);
  });

  it('단방향 발판에서 아래로 내려갈 수 있다', () => {
    expect(reachable(['#######', '#.....#', '#..A..#', '#=====#', '#.....#', '#..B..#', '#######'])).toBe(true);
  });

  it('가시를 밟아야만 갈 수 있는 곳은 도달 불가', () => {
    expect(reachable(['###########', '#.........#', '#A^^^^^^B.#', '###########'])).toBe(false);
  });
});
