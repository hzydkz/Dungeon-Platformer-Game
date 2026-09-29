import { describe, expect, it } from 'vitest';
import { AssetKey, MANIFEST, type RoleId, type ThemeId } from '../src/assets/keys';
import { allKeys, validateManifest } from '../src/core/assets/manifest';

describe('에셋 manifest', () => {
  it('규칙 위반이 없다 (키 형식, 중복, 애니메이션 프레임 범위)', () => {
    expect(validateManifest(MANIFEST)).toEqual([]);
  });

  it('코드가 참조하는 키가 모두 manifest에 있다', () => {
    const keys = new Set(allKeys(MANIFEST));
    const roles: RoleId[] = ['warrior', 'rogue', 'archer', 'mage'];
    const themes: ThemeId[] = ['cave', 'ruins', 'abyss'];
    const referenced = [
      ...roles.map(AssetKey.player),
      ...themes.flatMap((t) => [AssetKey.tiles(t), AssetKey.fg(t), AssetKey.bg(t, 'far'), AssetKey.bg(t, 'mid'), AssetKey.bg(t, 'near')]),
      ...(Object.values(AssetKey) as unknown[]).filter((v): v is string => typeof v === "string"),
    ];
    expect(referenced.filter((k) => !keys.has(k))).toEqual([]);
  });

  it('플레이어 애니메이션은 {entity}_{action} 규칙을 따른다', () => {
    const warrior = MANIFEST.spritesheets.find((s) => s.key === 'player_warrior');
    expect(warrior).toBeDefined();
    expect(Object.keys(warrior!.animations)).toEqual(expect.arrayContaining(['idle', 'run', 'jump', 'fall', 'attack']));
  });

  it('파일 경로는 manifest 안에만 있다 (코드에 에셋 경로 하드코딩 금지는 코드 리뷰로 확인)', () => {
    for (const e of [...MANIFEST.images, ...MANIFEST.spritesheets, ...MANIFEST.tilesets, ...MANIFEST.audio]) {
      expect(e.file).not.toMatch(/^\//);
    }
  });
});

describe('docs/ASSETS.md', () => {
  it('manifest의 모든 키가 문서에 있다 (scripts/gen-assets-doc.mjs로 갱신)', async () => {
    const { readFileSync } = await import('node:fs');
    const doc = readFileSync(new URL('../docs/ASSETS.md', import.meta.url), 'utf8');
    expect(allKeys(MANIFEST).filter((k) => !doc.includes(`\`${k}\``))).toEqual([]);
  });
});
