import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** 기획서 2장: `Math.random()` 사용 금지. 모든 랜덤은 시드 PRNG를 거친다. */
function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : [];
  });
}

/** 주석은 규칙 설명에 `Math.random`을 언급할 수 있으므로 제거한 뒤 검사한다. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('코딩 규칙', () => {
  it('src/ 어디에서도 Math.random을 쓰지 않는다', () => {
    const root = join(import.meta.dirname, '..', 'src');
    const offenders = listSourceFiles(root)
      .filter((file) => /Math\s*\.\s*random/.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(root, file));
    expect(offenders).toEqual([]);
  });
});
