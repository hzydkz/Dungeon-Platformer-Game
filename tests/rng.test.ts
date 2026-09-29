import { describe, expect, it } from 'vitest';
import { Rng, deriveSeed } from '../src/core/rng';

const take = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => rng.nextUint32());

describe('Rng 재현성', () => {
  it('같은 시드는 같은 수열을 만든다', () => {
    for (const seed of [0, 1, 12345, 0xffffffff, 987654321]) {
      expect(take(new Rng(seed), 1000)).toEqual(take(new Rng(seed), 1000));
    }
  });

  it('다른 시드는 다른 수열을 만든다', () => {
    expect(take(new Rng(1), 16)).not.toEqual(take(new Rng(2), 16));
  });

  it('고정 시드의 출력이 바뀌지 않는다 (알고리즘 회귀 방지)', () => {
    // 이 스냅숏이 깨지면 기존 시드로 만든 맵이 모두 달라진다. 의도한 변경일 때만 갱신할 것.
    expect(take(new Rng(12345), 5)).toMatchInlineSnapshot(`
      [
        2345461488,
        1344865159,
        2974739204,
        3448212715,
        1746298622,
      ]
    `);
    expect(deriveSeed(12345, 1)).toMatchInlineSnapshot(`2506972841`);
    expect(deriveSeed(12345, 1, 'red')).toMatchInlineSnapshot(`2046446644`);
  });

  it('상위 수준 API(int, pick, shuffle, chance, weightedIndex)도 재현된다', () => {
    const run = (seed: number) => {
      const rng = new Rng(seed);
      const items = ['a', 'b', 'c', 'd', 'e', 'f'];
      return {
        ints: Array.from({ length: 50 }, () => rng.int(-5, 17)),
        picks: Array.from({ length: 20 }, () => rng.pick(items)),
        shuffled: rng.shuffle(items),
        chances: Array.from({ length: 20 }, () => rng.chance(0.3)),
        weighted: Array.from({ length: 20 }, () => rng.weightedIndex([1, 0, 3, 6])),
        floats: Array.from({ length: 10 }, () => rng.float(2, 3)),
      };
    };
    expect(run(777)).toEqual(run(777));
  });

  it('상태를 저장했다 복원하면 같은 지점부터 이어진다', () => {
    const rng = new Rng(42);
    take(rng, 37);
    const state = rng.getState();
    const expected = take(rng, 100);
    expect(take(Rng.fromState(state), 100)).toEqual(expected);
  });

  it('fork는 결정적이며 부모와 다른 수열을 만든다', () => {
    const a = new Rng(9).fork('rooms');
    const b = new Rng(9).fork('rooms');
    expect(take(a, 20)).toEqual(take(b, 20));
    expect(take(new Rng(9).fork('rooms'), 20)).not.toEqual(take(new Rng(9).fork('loot'), 20));
  });
});

describe('Rng 범위와 분포', () => {
  it('next()는 [0, 1) 범위', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 100_000; i++) {
      const x = rng.next();
      expect(x >= 0 && x < 1).toBe(true);
    }
  });

  it('int(min, max)는 양 끝을 포함하고 범위를 벗어나지 않는다', () => {
    const rng = new Rng(4);
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const x = rng.int(-2, 3);
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(-2);
      expect(x).toBeLessThanOrEqual(3);
      seen.add(x);
    }
    expect([...seen].sort((p, q) => p - q)).toEqual([-2, -1, 0, 1, 2, 3]);
    expect(rng.int(5, 5)).toBe(5);
  });

  it('int 분포가 대략 균등하다 (카이제곱)', () => {
    const rng = new Rng(5);
    const k = 10;
    const n = 100_000;
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) counts[rng.int(0, k - 1)]!++;
    const expected = n / k;
    const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    // 자유도 9, 유의수준 0.001의 임계값 ≈ 27.88
    expect(chi2).toBeLessThan(27.88);
  });

  it('chance(p)의 빈도가 p에 가깝다', () => {
    const rng = new Rng(6);
    const n = 100_000;
    let hits = 0;
    for (let i = 0; i < n; i++) if (rng.chance(0.25)) hits++;
    expect(Math.abs(hits / n - 0.25)).toBeLessThan(0.01);
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
  });

  it('weightedIndex는 가중치 0인 항목을 고르지 않고 비율을 따른다', () => {
    const rng = new Rng(7);
    const counts = [0, 0, 0];
    const n = 60_000;
    for (let i = 0; i < n; i++) counts[rng.weightedIndex([1, 0, 2])]!++;
    expect(counts[1]).toBe(0);
    expect(Math.abs(counts[2]! / counts[0]! - 2)).toBeLessThan(0.1);
  });

  it('shuffle은 원본을 바꾸지 않고 순열을 반환한다', () => {
    const rng = new Rng(8);
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = rng.shuffle(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((a, b) => a - b)).toEqual(src);
  });

  it('잘못된 인자는 오류를 던진다', () => {
    const rng = new Rng(1);
    expect(() => rng.int(3, 2)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
    expect(() => rng.weightedIndex([0, 0])).toThrow(RangeError);
    expect(() => rng.weightedIndex([1, -1])).toThrow(RangeError);
  });
});

describe('deriveSeed', () => {
  it('결정적이고 32비트 부호 없는 정수를 반환한다', () => {
    const s = deriveSeed(12345, 3, 'red');
    expect(s).toBe(deriveSeed(12345, 3, 'red'));
    expect(Number.isInteger(s) && s >= 0 && s <= 0xffffffff).toBe(true);
  });

  it('파트 순서/타입/경계가 다르면 다른 시드가 된다', () => {
    expect(deriveSeed(1, 2)).not.toBe(deriveSeed(2, 1));
    expect(deriveSeed(1, 23)).not.toBe(deriveSeed(12, 3));
    expect(deriveSeed(1)).not.toBe(deriveSeed('1'));
    expect(deriveSeed('ab', 'c')).not.toBe(deriveSeed('a', 'bc'));
    expect(deriveSeed(5, 1)).not.toBe(deriveSeed(5, 1, 'red'));
  });

  it('층 번호 1~9에 대해 런 시드 1,000개의 층 시드가 충돌 없이 퍼진다', () => {
    const seen = new Set<number>();
    for (let run = 0; run < 1000; run++) {
      for (let floor = 1; floor <= 9; floor++) {
        seen.add(deriveSeed(run, floor));
        seen.add(deriveSeed(run, floor, 'red'));
      }
    }
    // 18,000개를 2^32 공간에 뽑을 때 기대 충돌 수 ≈ 0.04. 1개 이하 허용.
    expect(seen.size).toBeGreaterThanOrEqual(18_000 - 1);
  });

  it('정수가 아닌 숫자 파트는 거부한다', () => {
    expect(() => deriveSeed(1.5)).toThrow(RangeError);
  });
});
