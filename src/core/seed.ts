/**
 * 런 시드 생성과 파싱. Phaser 비의존.
 */
import { deriveSeed } from './rng';

const MAX_UINT32 = 0xffff_ffff;

/**
 * 문자열을 32비트 시드로 파싱한다. 10진수(`12345`) 또는 16진수(`0x3039`)만 허용.
 * 범위(0 ~ 2^32-1)를 벗어나거나 형식이 틀리면 null.
 */
export function parseSeed(value: string | null | undefined): number | null {
  if (value == null) return null;
  const s = value.trim();
  let n: number;
  if (/^0x[0-9a-f]+$/i.test(s)) {
    n = Number.parseInt(s.slice(2), 16);
  } else if (/^\d+$/.test(s)) {
    n = Number(s);
  } else {
    return null;
  }
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_UINT32) return null;
  return n;
}

/** URL 쿼리 문자열(`?seed=123`)에서 시드를 읽는다. */
export function parseSeedFromQuery(search: string, paramName: string): number | null {
  return parseSeed(new URLSearchParams(search).get(paramName));
}

/** 난수 원천을 주입받아 새 런 시드를 만든다. 기본값은 Web Crypto (`Math.random()` 사용 금지). */
export function generateRunSeed(
  fillRandom: (buf: Uint32Array<ArrayBuffer>) => void = (buf) => {
    globalThis.crypto.getRandomValues(buf);
  },
): number {
  const buf = new Uint32Array(1);
  fillRandom(buf);
  return (buf[0] ?? 0) >>> 0;
}

/** 층 시드 = hash(런 시드, 층 번호). */
export function floorSeed(runSeed: number, floor: number): number {
  return deriveSeed(runSeed, floor);
}

/** 빨간 던전 시드 = hash(런 시드, 층 번호, "red"). */
export function redDungeonSeed(runSeed: number, floor: number): number {
  return deriveSeed(runSeed, floor, 'red');
}
