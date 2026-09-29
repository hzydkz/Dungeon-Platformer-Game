/**
 * 시드 기반 의사난수 생성기 (sfc32).
 *
 * - Phaser 비의존 순수 모듈. 게임 내 모든 랜덤은 이 모듈을 거친다 (`Math.random()` 사용 금지).
 * - 같은 시드는 항상 같은 수열을 만든다.
 * - 32비트 시드 하나를 splitmix32로 128비트 상태로 확장한다.
 */

const UINT32_RANGE = 0x1_0000_0000; // 2^32

/** 부호 없는 32비트 정수로 정규화. */
export function toUint32(n: number): number {
  return n >>> 0;
}

/** splitmix32: 32비트 시드를 고르게 퍼진 32비트 값들로 확장한다. */
function splitmix32(seed: number): () => number {
  let state = toUint32(seed);
  return () => {
    state = toUint32(state + 0x9e3779b9);
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return toUint32(z ^ (z >>> 16));
  };
}

/** murmur3 finalizer. 32비트 값을 섞는다. */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return toUint32(h);
}

function mixInto(h: number, k: number): number {
  k = Math.imul(toUint32(k), 0xcc9e2d51);
  k = (k << 15) | (k >>> 17);
  k = Math.imul(k, 0x1b873593);
  h ^= k;
  h = (h << 13) | (h >>> 19);
  return toUint32(Math.imul(h, 5) + 0xe6546b64);
}

export type SeedPart = number | string;

/**
 * 여러 값을 조합해 파생 시드를 만든다.
 * 예: 층 시드 = deriveSeed(runSeed, floor), 빨간 던전 시드 = deriveSeed(runSeed, floor, 'red').
 *
 * 숫자는 32비트 정수로 취급한다(정수가 아니면 오류). 문자열은 UTF-16 코드 단위로 해시한다.
 * 각 파트 앞에 타입 태그와 길이를 섞어 `(1, 23)`과 `(12, 3)`, `'1'`과 `1`이 서로 다른 결과를 내도록 한다.
 */
export function deriveSeed(...parts: readonly SeedPart[]): number {
  let h = 0x2545f491;
  for (const part of parts) {
    if (typeof part === 'number') {
      if (!Number.isInteger(part)) {
        throw new RangeError(`deriveSeed: 정수가 아닌 숫자 파트 ${part}`);
      }
      h = mixInto(h, 0x6e756d); // 'num' 태그
      h = mixInto(h, part);
    } else {
      h = mixInto(h, 0x737472); // 'str' 태그
      h = mixInto(h, part.length);
      for (let i = 0; i < part.length; i++) {
        h = mixInto(h, part.charCodeAt(i));
      }
    }
  }
  return fmix32(h ^ parts.length);
}

/** sfc32 내부 상태 (저장/복원/디버그용). */
export type RngState = readonly [number, number, number, number];

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    const sm = splitmix32(seed);
    this.a = sm();
    this.b = sm();
    this.c = sm();
    this.d = sm();
    // 초기 상태의 상관관계를 없애기 위해 앞부분을 버린다.
    for (let i = 0; i < 12; i++) this.nextUint32();
  }

  static fromState(state: RngState): Rng {
    const rng = new Rng(0);
    rng.setState(state);
    return rng;
  }

  getState(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  setState(state: RngState): void {
    this.a = toUint32(state[0]);
    this.b = toUint32(state[1]);
    this.c = toUint32(state[2]);
    this.d = toUint32(state[3]);
  }

  /** [0, 2^32) 범위의 정수. */
  nextUint32(): number {
    const t = toUint32(toUint32(this.a + this.b) + this.d);
    this.d = toUint32(this.d + 1);
    this.a = this.b ^ (this.b >>> 9);
    this.b = toUint32(this.c + (this.c << 3));
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = toUint32(this.c + t);
    return t;
  }

  /** [0, 1) 범위의 실수. */
  next(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  /** [min, max) 범위의 실수. */
  float(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** [min, max] 범위의 정수 (양 끝 포함, 편향 없음). */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new RangeError(`Rng.int: 정수 범위가 필요함 (${min}, ${max})`);
    }
    if (max < min) throw new RangeError(`Rng.int: max(${max}) < min(${min})`);
    const span = max - min + 1;
    if (span > UINT32_RANGE) throw new RangeError('Rng.int: 범위가 2^32를 넘음');
    // 거부 샘플링으로 모듈로 편향 제거.
    const limit = UINT32_RANGE - (UINT32_RANGE % span);
    let x: number;
    do {
      x = this.nextUint32();
    } while (x >= limit);
    return min + (x % span);
  }

  /** 확률 p(0~1)로 true. */
  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  /** 배열에서 균등하게 하나 선택. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick: 빈 배열');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** 가중치에 비례해 인덱스 선택. 가중치는 0 이상, 합은 양수여야 한다. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) {
      if (!(w >= 0) || !Number.isFinite(w)) throw new RangeError(`Rng.weightedIndex: 잘못된 가중치 ${w}`);
      total += w;
    }
    if (total <= 0) throw new RangeError('Rng.weightedIndex: 가중치 합이 0');
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] as number;
      if (r < w) return i;
      r -= w;
    }
    // 부동소수점 오차 대비: 마지막 양수 가중치.
    for (let i = weights.length - 1; i >= 0; i--) {
      if ((weights[i] as number) > 0) return i;
    }
    return weights.length - 1;
  }

  /** 가중치에 비례해 항목 선택. */
  weightedPick<T>(items: readonly T[], weight: (item: T) => number): T {
    return items[this.weightedIndex(items.map(weight))] as T;
  }

  /** Fisher–Yates 셔플. 원본은 건드리지 않고 새 배열을 반환한다. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  /** 현재 상태에서 독립된 하위 생성기를 만든다. 호출 순서에 따라 결과가 달라진다. */
  fork(...parts: readonly SeedPart[]): Rng {
    return new Rng(deriveSeed(this.nextUint32(), ...parts));
  }
}
