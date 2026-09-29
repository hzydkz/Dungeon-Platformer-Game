import { describe, expect, it } from 'vitest';
import { REACH_PARAMS } from '../src/core/generation/params';
import { DIR_BIT, lintTemplate, maskLabel } from '../src/core/generation/template';
import { loadLibrary } from '../src/core/generation/templateLibrary';
import { validateTemplate } from '../src/core/generation/validateTemplate';

const lib = loadLibrary();

describe('방 템플릿 라이브러리', () => {
  it('일반 템플릿 40개 이상 (기획서 M2)', () => {
    expect(lib.originals.filter((t) => !t.arena).length).toBeGreaterThanOrEqual(40);
  });

  it('출입구 조합 15가지 모두 최소 3개 (반전 포함)', () => {
    for (let mask = 1; mask < 16; mask++) {
      expect(lib.byDoors.get(mask)?.length ?? 0, `조합 ${maskLabel(mask)}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('보스 아레나가 왼쪽/오른쪽 출입구 모두 있다', () => {
    expect(lib.arenas.get(DIR_BIT.left)?.length ?? 0).toBeGreaterThan(0);
    expect(lib.arenas.get(DIR_BIT.right)?.length ?? 0).toBeGreaterThan(0);
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
    it(`${t.source}@${t.id} [${maskLabel(t.doors)}]`, () => {
      expect(validateTemplate(t, REACH_PARAMS)).toEqual([]);
    });
  }
});
