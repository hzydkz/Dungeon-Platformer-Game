/**
 * 캐릭터 후보 생성 (기획서 8.1): 런 시작 시 랜덤 후보 3명, 각자 역할군/특성/성격 1개씩.
 * 같은 후보군 안에서 역할군은 중복되지 않는다 [가정]. 특성/성격도 겹치지 않게 뽑는다.
 */
import { PERSONALITIES } from '../data/personalities';
import { ROLES } from '../data/roles';
import { TRAITS } from '../data/traits';
import type { Rng } from './rng';
import type { CharacterChoice } from './run';

export const CANDIDATE_COUNT = 3;

export function generateCandidates(rng: Rng, count = CANDIDATE_COUNT): CharacterChoice[] {
  const roles = rng.shuffle(ROLES).slice(0, count);
  const traits = rng.shuffle(TRAITS).slice(0, count);
  const personalities = rng.shuffle(PERSONALITIES).slice(0, count);
  return roles.map((r, i) => ({ role: r.id, trait: traits[i]!.id, personality: personalities[i]!.id }));
}
