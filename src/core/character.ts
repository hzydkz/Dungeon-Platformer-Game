/**
 * 캐릭터 스탯 조합: 역할군 + 특성 + 성격 + 강화 (기획서 8장). Phaser 비의존.
 * 특성/성격/강화 데이터는 data/ 아래에 있고, 여기서는 id로 찾아 수정치를 모은다.
 */
import { roleById } from '../data/roles';
import { computeStats, type Modifier, type Stats } from './combat/stats';
import type { CharacterChoice } from './run';

export interface ModifierSource {
  readonly id: string;
  readonly modifiers: readonly Modifier[];
}

export interface ModifierCatalog {
  readonly traits: readonly ModifierSource[];
  readonly personalities: readonly ModifierSource[];
  readonly upgrades: readonly ModifierSource[];
}

export function characterModifiers(c: CharacterChoice, upgrades: readonly string[], catalog: ModifierCatalog): Modifier[] {
  const mods: Modifier[] = [];
  const find = (list: readonly ModifierSource[], id: string | null) => (id ? list.find((x) => x.id === id) : undefined);
  mods.push(...(find(catalog.traits, c.trait)?.modifiers ?? []));
  mods.push(...(find(catalog.personalities, c.personality)?.modifiers ?? []));
  for (const u of upgrades) mods.push(...(find(catalog.upgrades, u)?.modifiers ?? []));
  return mods;
}

export function characterStats(c: CharacterChoice, upgrades: readonly string[], catalog: ModifierCatalog): Stats {
  return computeStats(roleById(c.role).base, characterModifiers(c, upgrades, catalog));
}
