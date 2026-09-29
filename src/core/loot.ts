/**
 * 상자 보상, 강화 선택지 (기획서 8.7, 5.6). Phaser 비의존.
 */
import type { RoleId } from '../assets/keys';
import { REWARDS } from '../config/rewards';
import { UPGRADES, type UpgradeDef, type UpgradeTier } from '../data/upgrades';
import type { Stats } from './combat/stats';
import type { Rng } from './rng';

export type ChestItem = { readonly kind: 'heal'; readonly ratio: number } | { readonly kind: 'upgrade'; readonly id: string };

function eligible(tier: UpgradeTier, role: RoleId): UpgradeDef[] {
  return UPGRADES.filter((u) => u.tier === tier && (!u.roles || u.roles.includes(role)));
}

/** 상자 열기: 기본 1개 + 성격(탐욕) 가산. 소형 강화는 행운아 확률로 일반 강화가 된다 */
export function rollChest(rng: Rng, stats: Stats, role: RoleId): ChestItem[] {
  const count = 1 + Math.max(0, Math.round(stats.chestAmount));
  const items: ChestItem[] = [];
  for (let i = 0; i < count; i++) {
    if (rng.chance(REWARDS.chest.healChance)) {
      items.push({ kind: 'heal', ratio: REWARDS.chest.healRatio });
      continue;
    }
    const tierUp = rng.chance(REWARDS.chest.tierUpChance + stats.chestTierBonus);
    const pool = eligible(tierUp ? 'normal' : 'minor', role);
    items.push({ kind: 'upgrade', id: rng.pick(pool).id });
  }
  return items;
}

export type RewardSource = 'floorBoss' | 'redBoss' | 'altar';

/** 보스 처치 강화 선택지 (서로 다른 강화). 빨간 던전은 상위 등급 + 성격(무모) 가산 */
export function rewardChoices(rng: Rng, stats: Stats, role: RoleId, source: RewardSource): UpgradeDef[] {
  const tier: UpgradeTier = source === 'redBoss' ? 'rare' : 'normal';
  const count = source === 'altar' ? 1 : REWARDS.bossChoices + (source === 'redBoss' ? Math.round(stats.redRewardBonus) : 0);
  const pool = eligible(tier, role);
  // 상위 등급이 부족하면 일반 등급으로 채운다
  const filler = tier === 'rare' ? eligible('normal', role) : [];
  const picked = rng.shuffle(pool).slice(0, count);
  for (const u of rng.shuffle(filler)) {
    if (picked.length >= count) break;
    if (!picked.includes(u)) picked.push(u);
  }
  return picked;
}
