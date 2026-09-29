import { describe, expect, it } from 'vitest';
import { DISPLAY } from '../src/config/display';
import { MOVEMENT, PLAYER_SIZE, GENERATION_CONSTRAINTS } from '../src/config/movement';
import { characterStats } from '../src/core/character';
import { generateCandidates } from '../src/core/characterGen';
import {
  floorHeal,
  healOnKill,
  incomingDamage,
  invulnTime,
  outgoingDamage,
  regenAmount,
  thornsDamage,
  applyHeal,
} from '../src/core/combat/damage';
import type { Stats } from '../src/core/combat/stats';
import { escapeTimeSeconds } from '../src/core/escape';
import { generateFloor } from '../src/core/generation/floor';
import { MIN_SPEED_MULTIPLIER } from '../src/core/generation/params';
import { rewardChoices, rollChest } from '../src/core/loot';
import { Exploration } from '../src/core/map/exploration';
import { deriveMovementLimits } from '../src/core/movement/constraints';
import { Rng } from '../src/core/rng';
import { secretHintVisible } from '../src/core/secret';
import { CATALOG } from '../src/data/catalog';
import { PERSONALITIES } from '../src/data/personalities';
import { ROLES } from '../src/data/roles';
import { TRAITS } from '../src/data/traits';
import { UPGRADES } from '../src/data/upgrades';

const base = (role = 'warrior' as const) => characterStats({ role, trait: null, personality: null }, [], CATALOG);
const withTrait = (trait: string, role = 'warrior' as const) => characterStats({ role, trait, personality: null }, [], CATALOG);
const withPers = (personality: string, role = 'warrior' as const) => characterStats({ role, trait: null, personality }, [], CATALOG);

/** 생성 옵션에 성격 효과를 넘겨 여러 시드로 층을 만든다 */
function floorsWith(stats: Stats, n: number, floor = 4) {
  return Array.from({ length: n }, (_, s) =>
    generateFloor({
      runSeed: s,
      floor,
      kind: 'floor',
      redPortalChanceBonus: stats.redPortalChance,
      trapChanceBonus: stats.trapChance,
      chestChanceMultiplier: stats.chestChance,
    }),
  );
}

describe('후보 생성 (기획서 8.1)', () => {
  it('3명, 역할군 중복 없음, 각자 특성과 성격이 하나씩, 시드로 재현', () => {
    for (let s = 0; s < 50; s++) {
      const c = generateCandidates(new Rng(s));
      expect(c).toHaveLength(3);
      expect(new Set(c.map((x) => x.role)).size).toBe(3);
      for (const x of c) {
        expect(TRAITS.some((t) => t.id === x.trait)).toBe(true);
        expect(PERSONALITIES.some((p) => p.id === x.personality)).toBe(true);
      }
      expect(generateCandidates(new Rng(s))).toEqual(c);
    }
  });

  it('특성 10개, 성격 8개 (기획서 초기 목표)', () => {
    expect(TRAITS).toHaveLength(10);
    expect(PERSONALITIES).toHaveLength(8);
    for (const p of PERSONALITIES) expect(p.modifiers.length, p.id).toBeGreaterThan(0);
  });

  it('이동속도를 낮추는 효과는 도달성 검증 기준(가장 느린 배율) 이상이고, 그 속도로도 생성 제약을 만족한다', () => {
    for (const src of [...TRAITS, ...PERSONALITIES, ...UPGRADES]) {
      const mul = src.modifiers.filter((m) => m.stat === 'moveSpeed' && m.op === 'mul').reduce((a, m) => a * m.value, 1);
      expect(mul, src.id).toBeGreaterThanOrEqual(MIN_SPEED_MULTIPLIER);
    }
    const lim = deriveMovementLimits(MOVEMENT, DISPLAY.tileSize, PLAYER_SIZE.bodyWidth, MIN_SPEED_MULTIPLIER);
    expect(lim.gapTiles).toBeGreaterThanOrEqual(GENERATION_CONSTRAINTS.maxGapTiles);
  });
});

describe('특성 효과 (각각)', () => {
  const b = base();

  it('유리대포: 공격력 +30%, 최대 체력 -25%', () => {
    const s = withTrait('glass_cannon');
    expect(outgoingDamage(s, 100, s.maxHp, null).damage).toBe(130);
    expect(s.maxHp).toBe(Math.round(b.maxHp * 0.75));
  });

  it('강철 피부: 받는 피해 -20%, 이동속도 -10%', () => {
    const s = withTrait('iron_skin');
    expect(incomingDamage(s, 100)).toBe(80);
    expect(s.moveSpeed).toBeCloseTo(0.9);
  });

  it('흡혈: 적 처치 시 회복', () => {
    expect(healOnKill(b)).toBe(0);
    expect(healOnKill(withTrait('vampire'))).toBeGreaterThan(0);
  });

  it('행운아: 상자 보상 등급 상승(일반 강화)이 더 자주 나온다', () => {
    const count = (s: Stats) => {
      const rng = new Rng(9);
      let normal = 0;
      for (let i = 0; i < 2000; i++) {
        for (const it of rollChest(rng, s, 'warrior')) if (it.kind === 'upgrade' && UPGRADES.find((u) => u.id === it.id)!.tier === 'normal') normal++;
      }
      return normal;
    };
    expect(count(withTrait('lucky'))).toBeGreaterThan(count(b) * 2);
  });

  it('끈기: 체력 25% 이하에서만 공격력 +25%', () => {
    const s = withTrait('tenacity');
    expect(outgoingDamage(s, 100, s.maxHp, null).damage).toBe(100);
    expect(outgoingDamage(s, 100, s.maxHp * 0.2, null).damage).toBe(125);
  });

  it('광전사: 공격력 +15%, 무적 시간 -30%', () => {
    const s = withTrait('berserker');
    expect(outgoingDamage(s, 100, s.maxHp, null).damage).toBe(115);
    expect(invulnTime(s)).toBeCloseTo(invulnTime(b) * 0.7);
  });

  it('튼튼함: 최대 체력 +30%, 공격력 -10%', () => {
    const s = withTrait('sturdy');
    expect(s.maxHp).toBe(Math.round(b.maxHp * 1.3));
    expect(outgoingDamage(s, 100, s.maxHp, null).damage).toBe(90);
  });

  it('집중: 스킬 쿨타임 -30%, 마나 소모 -25%', () => {
    const s = withTrait('focused', 'mage' as never);
    expect(s.skillCooldown).toBeCloseTo(0.7);
    expect(s.skillCost).toBeCloseTo(0.75);
  });

  it('재생: 시간이 지나면 회복, 회복 아이템/층 이동 회복은 절반', () => {
    const s = withTrait('regen');
    expect(regenAmount(b, 10)).toBe(0);
    expect(regenAmount(s, 10)).toBeGreaterThan(0);
    expect(applyHeal(s, 0, 40)).toBe(20);
    expect(floorHeal(s, 0)).toBe(Math.round(floorHeal(b, 0) / 2));
  });

  it('가시 갑옷: 받은 피해의 50% 반사, 최대 체력 -10%', () => {
    const s = withTrait('thorns');
    expect(thornsDamage(b, 20)).toBe(0);
    expect(thornsDamage(s, 20)).toBe(10);
    expect(s.maxHp).toBe(Math.round(b.maxHp * 0.9));
  });
});

describe('성격 효과 (각각)', () => {
  const b = base();

  it('탐욕: 상자 보상 +1개, 함정 방이 더 자주 나온다', () => {
    const s = withPers('greedy');
    expect(rollChest(new Rng(1), s, 'warrior')).toHaveLength(2);
    expect(rollChest(new Rng(1), b, 'warrior')).toHaveLength(1);
    const traps = (st: Stats) => floorsWith(st, 60).reduce((n, f) => n + f.rooms.filter((r) => r.trap).length, 0);
    expect(traps(s)).toBeGreaterThan(traps(b));
  });

  it('신중: 방에 들어가면 인접 방도 공개', () => {
    const f = generateFloor({ runSeed: 5, floor: 2, kind: 'floor' });
    const s = withPers('cautious');
    const ex = new Exploration(f.layout);
    ex.enter(f.layout.entrance, s.revealAdjacent > 0);
    for (const n of ex.neighbors(f.layout.entrance)) expect(ex.revealed.has(n)).toBe(true);
    const ex2 = new Exploration(f.layout);
    ex2.enter(f.layout.entrance, b.revealAdjacent > 0);
    expect(ex2.revealed.size).toBe(1);
  });

  it('무모: 빨간 던전 보상 선택지 +1, 받는 피해 +10%', () => {
    const s = withPers('reckless');
    expect(rewardChoices(new Rng(1), s, 'warrior', 'redBoss')).toHaveLength(4);
    expect(rewardChoices(new Rng(1), b, 'warrior', 'redBoss')).toHaveLength(3);
    expect(incomingDamage(s, 100)).toBe(110);
  });

  it('호기심: 비밀 벽 근처에서 힌트', () => {
    const s = withPers('curious');
    const walls = [{ x: 10, y: 10 }];
    expect(secretHintVisible(s, { x: 13, y: 10 }, walls)).toBe(true);
    expect(secretHintVisible(s, { x: 40, y: 10 }, walls)).toBe(false);
    expect(secretHintVisible(b, { x: 13, y: 10 }, walls)).toBe(false);
  });

  it('냉정: 탈출 제한 시간 +20%', () => {
    const s = withPers('calm');
    expect(escapeTimeSeconds(2000, 110, s.escapeTime)).toBeCloseTo(escapeTimeSeconds(2000, 110, b.escapeTime) * 1.2);
  });

  it('모험가: 빨간 포탈이 더 자주 생긴다', () => {
    const count = (st: Stats) => floorsWith(st, 150).filter((f) => f.redPortal).length;
    expect(count(withPers('adventurous'))).toBeGreaterThan(count(b) + 15);
  });

  it('느긋함: 층 이동 회복 +20%p, 탈출 시간 -10%', () => {
    const s = withPers('easygoing');
    expect(floorHeal(s, 0)).toBe(Math.round(s.maxHp * 0.5));
    expect(floorHeal(b, 0)).toBe(Math.round(b.maxHp * 0.3));
    expect(s.escapeTime).toBeCloseTo(0.9);
  });

  it('수집가: 상자가 더 많이 등장한다', () => {
    const count = (st: Stats) => floorsWith(st, 60).reduce((n, f) => n + f.chests.filter((c) => !c.secret).length, 0);
    expect(count(withPers('collector'))).toBeGreaterThan(count(b) * 1.2);
  });
});

describe('강화 선택지 (기획서 8.7)', () => {
  it('층 보스 3개, 빨간 던전 보스는 상위 등급, 서로 다름, 역할 전용 강화는 해당 역할에만', () => {
    const s = base();
    for (let i = 0; i < 50; i++) {
      const c = rewardChoices(new Rng(i), s, 'warrior', 'floorBoss');
      expect(c).toHaveLength(3);
      expect(new Set(c.map((u) => u.id)).size).toBe(3);
      expect(c.every((u) => u.tier === 'normal' && (!u.roles || u.roles.includes('warrior')))).toBe(true);
      expect(rewardChoices(new Rng(i), s, 'mage', 'redBoss').every((u) => u.tier === 'rare')).toBe(true);
    }
  });

  it('강화를 얻으면 스탯에 반영된다', () => {
    const s = characterStats({ role: 'warrior', trait: null, personality: null }, ['hp_up', 'hp_up', 'atk_up'], CATALOG);
    expect(s.maxHp).toBe(ROLES[0]!.base.maxHp! + 40);
    expect(s.attack).toBeCloseTo(1.15);
  });
});
