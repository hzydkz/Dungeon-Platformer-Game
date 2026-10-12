import { describe, expect, it } from 'vitest';
import { REACH_PARAMS } from '../src/core/generation/params';
import { DIRS, capKey, isSideDir, lintTemplate } from '../src/core/generation/template';
import { loadLibrary, shapeKey } from '../src/core/generation/templateLibrary';
import { validateTemplate } from '../src/core/generation/validateTemplate';

const lib = loadLibrary();

describe('방 템플릿 라이브러리', () => {
  it('일반 템플릿 40개 이상 (기획서 M2)', () => {
    expect(lib.originals.filter((t) => !t.arena).length).toBeGreaterThanOrEqual(40);
  });

  it('방 모양마다 템플릿이 충분하고, 모든 변 구간에 출입구를 둔 템플릿이 여럿 있다 (반전 포함)', () => {
    for (const [cw, ch, min] of [[1, 1, 60], [2, 1, 20], [3, 1, 12], [1, 2, 20], [2, 2, 14]] as const) {
      const pool = lib.byShape.get(shapeKey(cw, ch)) ?? [];
      expect(pool.length, `${cw}x${ch}`).toBeGreaterThanOrEqual(min);
      for (const dir of DIRS) {
        for (let seg = 0; seg < (isSideDir(dir) ? ch : cw); seg++) {
          const n = pool.filter((t) => t.caps.some((c) => c.dir === dir && c.seg === seg)).length;
          expect(n, `${cw}x${ch} ${dir}${seg}`).toBeGreaterThanOrEqual(5);
        }
      }
    }
  });

  it('출입구 자리 5종이 모두 쓰인다', () => {
    const slots = new Set(lib.originals.flatMap((t) => t.caps.map((c) => c.slot)));
    expect([...slots].sort()).toEqual(['high', 'left', 'low', 'mid', 'right']);
  });

  it('보스 아레나가 왼쪽/오른쪽 출입구 모두 있다', () => {
    expect(lib.arenas.some((t) => t.caps.some((c) => c.dir === 'left'))).toBe(true);
    expect(lib.arenas.some((t) => t.caps.some((c) => c.dir === 'right'))).toBe(true);
  });

  it('아이디가 겹치지 않는다', () => {
    const ids = lib.originals.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('템플릿 규격 검사', () => {
  for (const t of lib.originals) {
    it(`${t.source}@${t.id}`, () => {
      expect(lintTemplate(t)).toEqual([]);
    });
  }
});

describe('템플릿 도달성 검증 (기획서 5.4)', () => {
  // 좌우 반전은 물리가 좌우 대칭이므로 원본 검증으로 충분하다
  for (const t of lib.originals) {
    it(`${t.source}@${t.id} [${t.caps.map(capKey).join(' ')}]`, () => {
      expect(validateTemplate(t, REACH_PARAMS)).toEqual([]);
    });
  }
});
