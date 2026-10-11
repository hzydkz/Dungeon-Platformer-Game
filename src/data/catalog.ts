/** 특성/성격 수정치 목록 */
import type { ModifierCatalog } from '../core/character';
import { PERSONALITIES } from './personalities';
import { TRAITS } from './traits';

export const CATALOG: ModifierCatalog = {
  traits: TRAITS,
  personalities: PERSONALITIES,
};
