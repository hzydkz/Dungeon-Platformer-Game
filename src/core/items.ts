/**
 * 아이템 등급 뽑기, 아이템 칸, 상점 가격 (기획자 요청). Phaser 비의존.
 */
import type { RoleId } from '../assets/keys';
import { GRADES, ITEMS, SHOP, type Grade } from '../config/items';
import { ITEM_DEFS, gradeIndex, itemModifiers, type ItemInstance } from '../data/items';
import type { Modifier } from './combat/stats';
import type { Rng } from './rng';

export type ItemSource = keyof typeof ITEMS.luckBySource;

/** 등급 가중치: 기본 가중치 × (1 + 행운)^등급번호 (행운은 상한까지) */
export function gradeWeights(luck: number): number[] {
  const l = Math.min(ITEMS.maxLuck, Math.max(0, luck));
  return ITEMS.gradeWeights.map((w, i) => w * Math.pow(1 + l, i));
}

/** 출처, 층, 캐릭터 행운(특성 '행운아')을 합친 등급 행운 */
export function itemLuck(source: ItemSource, floor: number, statLuck: number): number {
  return ITEMS.luckBySource[source] + ITEMS.luckPerFloor * Math.max(0, floor - 1) + statLuck;
}

export function rollGrade(rng: Rng, luck: number): Grade {
  return GRADES[rng.weightedIndex(gradeWeights(luck))]!;
}

/** 아이템 하나: 종류는 균등, 등급은 행운 가중치 */
export function rollItem(rng: Rng, luck: number, role: RoleId): ItemInstance {
  const pool = ITEM_DEFS.filter((d) => !d.roles || d.roles.includes(role));
  return { id: rng.pick(pool).id, grade: rollGrade(rng, luck) };
}

/** 서로 다른 종류의 아이템 n개 (선택지, 상점 진열) */
export function rollItemChoices(rng: Rng, count: number, luck: number, role: RoleId): ItemInstance[] {
  const pool = rng.shuffle(ITEM_DEFS.filter((d) => !d.roles || d.roles.includes(role)));
  return pool.slice(0, count).map((d) => ({ id: d.id, grade: rollGrade(rng, luck) }));
}

/** 가진 아이템 전체의 스탯 수정치 */
export function inventoryModifiers(items: readonly ItemInstance[]): Modifier[] {
  return items.flatMap(itemModifiers);
}

/** 빈 칸이 있으면 넣고 true. 가득 찼으면 false (호출 측이 교체 선택을 띄운다) */
export function tryAddItem(items: ItemInstance[], item: ItemInstance, slots: number = ITEMS.slots): boolean {
  if (items.length >= slots) return false;
  items.push(item);
  return true;
}

/** slot 자리의 아이템을 빼고 새 아이템을 넣는다. 뺀 아이템을 반환 */
export function replaceItem(items: ItemInstance[], slot: number, item: ItemInstance): ItemInstance {
  if (slot < 0 || slot >= items.length) throw new Error(`잘못된 아이템 칸: ${slot}`);
  const old = items[slot]!;
  items[slot] = item;
  return old;
}

function floorPriceScale(floor: number): number {
  return 1 + SHOP.pricePerFloor * Math.max(0, floor - 1);
}

export function itemPrice(item: ItemInstance, floor: number): number {
  return Math.round(SHOP.prices[gradeIndex(item.grade)]! * floorPriceScale(floor));
}

export function potionPrice(floor: number): number {
  return Math.round(SHOP.potion.price * floorPriceScale(floor));
}
