import { describe, expect, it } from 'vitest';
import { ECONOMY, GRADES, ITEMS, LEVEL, SHOP } from '../src/config/items';
import { characterStats } from '../src/core/character';
import { DEFAULT_STATS } from '../src/core/combat/stats';
import { generateFloor } from '../src/core/generation/floor';
import { gradeWeights, itemLuck, itemPrice, replaceItem, rollGrade, rollItemChoices, tryAddItem } from '../src/core/items';
import { addXp, killXp, levelModifiers, xpToNext, type LevelState } from '../src/core/level';
import { rollChest } from '../src/core/loot';
import { mapMarkers } from '../src/core/map/markers';
import { Exploration } from '../src/core/map/exploration';
import { Rng } from '../src/core/rng';
import { CATALOG } from '../src/data/catalog';
import { ITEM_DEFS, itemText, type ItemInstance } from '../src/data/items';

describe('아이템 등급', () => {
  it('F~S 7등급, 기본 가중치는 F가 가장 크고 S가 가장 작은 피라미드', () => {
    expect(GRADES).toEqual(['F', 'E', 'D', 'C', 'B', 'A', 'S']);
    const w = gradeWeights(0);
    for (let i = 1; i < w.length; i++) expect(w[i]!).toBeLessThan(w[i - 1]!);
  });

  it('행운이 커져도(9층 빨간 던전 + 행운아) 피라미드 모양을 유지한다', () => {
    const luck = itemLuck('redBoss', 9, 0.5);
    const w = gradeWeights(luck);
    for (let i = 1; i < w.length; i++) expect(w[i]!).toBeLessThan(w[i - 1]!);
  });

  it('실제 뽑기 빈도도 F > E > … > S', () => {
    const rng = new Rng(7);
    const count = new Map<string, number>();
    for (let i = 0; i < 20000; i++) {
      const g = rollGrade(rng, 0);
      count.set(g, (count.get(g) ?? 0) + 1);
    }
    for (let i = 1; i < GRADES.length; i++) expect(count.get(GRADES[i]!)!).toBeLessThan(count.get(GRADES[i - 1]!)!);
  });

  it('층이 높을수록, 보스 > 상점 순으로 높은 등급이 잘 나온다', () => {
    const high = (luck: number) => {
      const rng = new Rng(3);
      let n = 0;
      for (let i = 0; i < 5000; i++) if ('BAS'.includes(rollGrade(rng, luck))) n++;
      return n;
    };
    expect(high(itemLuck('shop', 8, 0))).toBeGreaterThan(high(itemLuck('shop', 1, 0)));
    expect(high(itemLuck('redBoss', 1, 0))).toBeGreaterThan(high(itemLuck('floorBoss', 1, 0)));
  });

  it('모든 아이템은 등급마다 값이 있고, 등급이 높을수록 효과가 크다', () => {
    for (const d of ITEM_DEFS) {
      expect(d.effect.values, d.id).toHaveLength(GRADES.length);
      const mag = d.effect.values.map(Math.abs);
      for (let i = 1; i < mag.length; i++) expect(mag[i]!, d.id).toBeGreaterThan(mag[i - 1]!);
      expect(DEFAULT_STATS[d.effect.stat], d.id).toBeDefined();
    }
  });

  it('설명에 등급 값이 들어간다', () => {
    expect(itemText({ id: 'ring', grade: 'D' })).toBe('공격력 +9%');
    expect(itemText({ id: 'plate', grade: 'F' })).toBe('받는 피해 -3%');
    expect(itemText({ id: 'amulet', grade: 'S' })).toBe('최대 체력 +64');
    expect(itemText({ id: 'fang', grade: 'E' })).toBe('적중 피해의 1.5% 회복');
  });
});

describe('아이템 칸', () => {
  const a: ItemInstance = { id: 'ring', grade: 'F' };
  const b: ItemInstance = { id: 'amulet', grade: 'E' };
  const c: ItemInstance = { id: 'eye', grade: 'D' };
  const d: ItemInstance = { id: 'boots', grade: 'S' };

  it(`최대 ${ITEMS.slots}개, 가득 차면 넣지 않는다`, () => {
    const items: ItemInstance[] = [];
    expect(tryAddItem(items, a)).toBe(true);
    expect(tryAddItem(items, b)).toBe(true);
    expect(tryAddItem(items, c)).toBe(true);
    expect(tryAddItem(items, d)).toBe(false);
    expect(items).toEqual([a, b, c]);
  });

  it('교체: 고른 칸의 아이템을 빼고 새 아이템을 넣는다', () => {
    const items = [a, b, c];
    expect(replaceItem(items, 1, d)).toBe(b);
    expect(items).toEqual([a, d, c]);
    expect(() => replaceItem(items, 3, d)).toThrow();
  });

  it('선택지/진열은 서로 다른 종류', () => {
    for (let i = 0; i < 30; i++) {
      const c3 = rollItemChoices(new Rng(i), 3, 0.1, 'mage');
      expect(new Set(c3.map((x) => x.id)).size).toBe(3);
    }
  });
});

describe('골드와 상점', () => {
  it('상자는 회복이나 골드만 준다', () => {
    const rng = new Rng(2);
    const s = characterStats({ role: 'warrior', trait: null, personality: null }, {}, CATALOG);
    const kinds = new Set<string>();
    for (let i = 0; i < 200; i++) for (const it of rollChest(rng, s, 3)) kinds.add(it.kind);
    expect([...kinds].sort()).toEqual(['gold', 'heal']);
  });

  it('상자 골드는 층이 높을수록 많다', () => {
    const s = characterStats({ role: 'warrior', trait: null, personality: null }, {}, CATALOG);
    const total = (level: number) => {
      const rng = new Rng(5);
      let g = 0;
      for (let i = 0; i < 300; i++) for (const it of rollChest(rng, s, level)) if (it.kind === 'gold') g += it.amount;
      return g;
    };
    expect(total(8)).toBeGreaterThan(total(1) * 1.5);
    expect(ECONOMY.chest.gold[0]).toBeGreaterThan(0);
  });

  it('가격은 등급과 층에 따라 오른다', () => {
    expect(itemPrice({ id: 'ring', grade: 'S' }, 1)).toBeGreaterThan(itemPrice({ id: 'ring', grade: 'F' }, 1));
    expect(itemPrice({ id: 'ring', grade: 'C' }, 9)).toBeGreaterThan(itemPrice({ id: 'ring', grade: 'C' }, 1));
    expect(SHOP.prices).toHaveLength(GRADES.length);
  });

  it('일반 층에는 상점이 있고, 서 있을 수 있는 칸이며, 상점 방에는 몬스터가 없다. 빨간 던전에는 없다', () => {
    let withShop = 0;
    for (let seed = 0; seed < 200; seed++) {
      const floor = 1 + (seed % 9);
      const f = generateFloor({ runSeed: seed, floor, kind: 'floor', reachCheck: false });
      if (!f.shop) continue;
      withShop++;
      const room = f.rooms[f.shop.room]!;
      expect(room.role).toBe('normal');
      expect(f.monsters.some((m) => m.room === f.shop!.room)).toBe(false);
      expect(f.altar && f.altar.x === f.shop.x && f.altar.y === f.shop.y).toBeFalsy();
    }
    expect(withShop).toBe(200);
    expect(generateFloor({ runSeed: 1, floor: 3, kind: 'red', reachCheck: false }).shop).toBeNull();
  });

  it('상점은 방을 가 보지 않아도 지도에 표시된다', () => {
    const f = generateFloor({ runSeed: 11, floor: 2, kind: 'floor', reachCheck: false });
    const ex = new Exploration(f.layout);
    expect(ex.revealed.has(f.shop!.room)).toBe(false);
    const m = mapMarkers({ floor: f, exploration: ex, player: f.entrance, chests: [], altar: null, shop: f.shop, redPortalClosed: false, bossDefeated: false });
    expect(m.some((x) => x.kind === 'shop' && x.x === f.shop!.x && x.y === f.shop!.y)).toBe(true);
  });
});

describe('레벨', () => {
  it('필요 경험치는 레벨이 오를수록 늘어난다', () => {
    for (let l = 1; l < 30; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
  });

  it('경험치가 넘치면 여러 레벨이 한 번에 오른다', () => {
    const s: LevelState = { level: 1, xp: 0 };
    expect(addXp(s, xpToNext(1) - 1)).toBe(0);
    expect(addXp(s, 1 + xpToNext(2) + 3)).toBe(2);
    expect(s).toEqual({ level: 3, xp: 3 });
  });

  it('레벨이 오르면 최대 체력과 공격력이 오른다', () => {
    expect(levelModifiers(1)).toEqual([]);
    const c = { role: 'warrior' as const, trait: null, personality: null };
    const l1 = characterStats(c, { level: 1 }, CATALOG);
    const l5 = characterStats(c, { level: 5 }, CATALOG);
    expect(l5.maxHp).toBe(Math.round(l1.maxHp * (1 + LEVEL.hpPerLevel * 4)));
    expect(l5.attack).toBeCloseTo(1 + LEVEL.attackPerLevel * 4);
  });

  it('높은 층 몬스터와 보스는 경험치를 더 준다', () => {
    expect(killXp('monster', 3)).toBeGreaterThan(killXp('monster', 1));
    expect(killXp('boss', 1)).toBeGreaterThan(killXp('monster', 1));
    expect(killXp('redBoss', 1)).toBeGreaterThan(killXp('boss', 1));
  });
});
