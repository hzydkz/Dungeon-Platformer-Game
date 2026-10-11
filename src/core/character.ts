/**
 * 캐릭터 스탯 조합: 역할군 + 특성 + 성격 + 아이템 + 레벨 (기획서 8장 + 기획자 요청). Phaser 비의존.
 * 특성/성격 데이터는 data/ 아래에 있고, 여기서는 id로 찾아 수정치를 모은다.
 */
import { roleById } from '../data/roles';
import type { ItemInstance } from '../data/items';
import { computeStats, type Modifier, type Stats } from './combat/stats';
import { inventoryModifiers } from './items';
import { levelModifiers } from './level';
import type { CharacterChoice } from './run';

export interface ModifierSource {
  readonly id: string;
  readonly modifiers: readonly Modifier[];
}

export interface ModifierCatalog {
  readonly traits: readonly ModifierSource[];
  readonly personalities: readonly ModifierSource[];
}

/** 성장 요소 (아이템, 레벨). 캐릭터 선택 화면처럼 없으면 생략 */
export interface Progress {
  readonly items?: readonly ItemInstance[];
  readonly level?: number;
}

export function characterModifiers(c: CharacterChoice, progress: Progress, catalog: ModifierCatalog): Modifier[] {
  const mods: Modifier[] = [];
  const find = (list: readonly ModifierSource[], id: string | null) => (id ? list.find((x) => x.id === id) : undefined);
  mods.push(...(find(catalog.traits, c.trait)?.modifiers ?? []));
  mods.push(...(find(catalog.personalities, c.personality)?.modifiers ?? []));
  mods.push(...inventoryModifiers(progress.items ?? []));
  mods.push(...levelModifiers(progress.level ?? 1));
  return mods;
}

export function characterStats(c: CharacterChoice, progress: Progress, catalog: ModifierCatalog): Stats {
  return computeStats(roleById(c.role).base, characterModifiers(c, progress, catalog));
}
