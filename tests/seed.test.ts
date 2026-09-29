import { describe, expect, it } from 'vitest';
import { floorSeed, generateRunSeed, parseSeed, parseSeedFromQuery, redDungeonSeed } from '../src/core/seed';

describe('parseSeed', () => {
  it('10진수/16진수를 파싱한다', () => {
    expect(parseSeed('12345')).toBe(12345);
    expect(parseSeed(' 0 ')).toBe(0);
    expect(parseSeed('4294967295')).toBe(0xffffffff);
    expect(parseSeed('0x3039')).toBe(12345);
    expect(parseSeed('0XFFFFFFFF')).toBe(0xffffffff);
  });

  it('잘못된 값은 null', () => {
    for (const v of [null, undefined, '', 'abc', '-1', '1.5', '1e3', '4294967296', '0x100000000', '12 34']) {
      expect(parseSeed(v)).toBeNull();
    }
  });

  it('URL 쿼리에서 시드를 읽는다', () => {
    expect(parseSeedFromQuery('?seed=12345', 'seed')).toBe(12345);
    expect(parseSeedFromQuery('?foo=1&seed=0x10', 'seed')).toBe(16);
    expect(parseSeedFromQuery('?foo=1', 'seed')).toBeNull();
    expect(parseSeedFromQuery('', 'seed')).toBeNull();
  });
});

describe('시드 파생', () => {
  it('층 시드와 빨간 던전 시드는 결정적이고 서로 다르다', () => {
    expect(floorSeed(123, 4)).toBe(floorSeed(123, 4));
    expect(redDungeonSeed(123, 4)).toBe(redDungeonSeed(123, 4));
    expect(floorSeed(123, 4)).not.toBe(redDungeonSeed(123, 4));
    expect(floorSeed(123, 4)).not.toBe(floorSeed(123, 5));
    expect(floorSeed(123, 4)).not.toBe(floorSeed(124, 4));
  });

  it('generateRunSeed는 주입된 난수 원천을 32비트 부호 없는 값으로 쓴다', () => {
    expect(generateRunSeed((buf) => buf.set([0xdeadbeef]))).toBe(0xdeadbeef);
    const s = generateRunSeed();
    expect(Number.isInteger(s) && s >= 0 && s <= 0xffffffff).toBe(true);
  });
});
