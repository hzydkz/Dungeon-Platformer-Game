/**
 * 상자 보상, 보스/제단 아이템 (기획서 8.7, 5.6 + 기획자 요청). Phaser 비의존.
 * 상자는 회복이나 골드만 준다. 아이템은 보스, 빨간 던전 보스, 제단, 상점에서 얻는다.
 */
import type { RoleId } from '../assets/keys';
import { ECONOMY, ITEMS } from '../config/items';
import type { ItemInstance } from '../data/items';
import type { Stats } from './combat/stats';
import { itemLuck, rollItem, rollItemChoices } from './items';
import type { Rng } from './rng';

export type ChestItem = { readonly kind: 'heal'; readonly ratio: number } | { readonly kind: 'gold'; readonly amount: number };

/** 난이도 레벨의 골드 배율 */
export function goldScale(level: number): number {
  return 1 + ECONOMY.goldPerLevel * Math.max(0, level - 1);
}

/** 상자 열기: 기본 1개 + 성격(탐욕) 가산. 각각 회복 또는 골드 */
export function rollChest(rng: Rng, stats: Stats, level: number): ChestItem[] {
  const count = 1 + Math.max(0, Math.round(stats.chestAmount));
  const items: ChestItem[] = [];
  const c = ECONOMY.chest;
  for (let i = 0; i < count; i++) {
    if (rng.chance(c.healChance)) items.push({ kind: 'heal', ratio: c.healRatio });
    else items.push({ kind: 'gold', amount: Math.round(rng.int(c.gold[0], c.gold[1]) * goldScale(level)) });
  }
  return items;
}

export function monsterGold(rng: Rng, level: number): number {
  return Math.round(rng.int(ECONOMY.monsterGold[0], ECONOMY.monsterGold[1]) * goldScale(level));
}

export function bossGold(level: number, red: boolean): number {
  return Math.round(ECONOMY.bossGold * level * (red ? ECONOMY.redBossGoldMultiplier : 1));
}

export type RewardSource = 'floorBoss' | 'redBoss';

/** 보스 처치 아이템 선택지 (서로 다른 종류). 빨간 던전은 행운이 높고 성격(무모)이면 선택지 +1 */
export function bossItemChoices(rng: Rng, stats: Stats, role: RoleId, source: RewardSource, floor: number): ItemInstance[] {
  const count = ITEMS.bossChoices + (source === 'redBoss' ? Math.round(stats.redRewardBonus) : 0);
  return rollItemChoices(rng, count, itemLuck(source, floor, stats.itemLuck), role);
}

/** 제단: 아이템 하나 */
export function altarItem(rng: Rng, stats: Stats, role: RoleId, floor: number): ItemInstance {
  return rollItem(rng, itemLuck('altar', floor, stats.itemLuck), role);
}
