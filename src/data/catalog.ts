/** 특성/성격/강화 수정치 목록 */
import type { ModifierCatalog } from '../core/character';
import { PERSONALITIES } from './personalities';
import { TRAITS } from './traits';
import { UPGRADES } from './upgrades';

export const CATALOG: ModifierCatalog = {
  traits: TRAITS,
  personalities: PERSONALITIES,
  upgrades: UPGRADES,
};
