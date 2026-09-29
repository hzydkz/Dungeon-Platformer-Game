import { describe, expect, it } from 'vitest';
import { COMBAT } from '../src/config/combat';
import { applyHeal, incomingDamage, monsterScale, outgoingDamage } from '../src/core/combat/damage';
import { lineOfSight } from '../src/core/combat/los';
import { computeStats } from '../src/core/combat/stats';
import { Rng } from '../src/core/rng';
import { basicCharToTile, gridFromAscii } from '../src/core/tiles';
import { MONSTERS, MONSTER_WEIGHTS, monsterById } from '../src/data/monsters';
import { ROLES } from '../src/data/roles';

describe('스탯 계산', () => {
  it('기본값 + add 합 × mul 곱', () => {
    const s = computeStats({ maxHp: 100 }, [
      { stat: 'maxHp', op: 'add', value: 20 },
      { stat: 'maxHp', op: 'mul', value: 0.75 },
      { stat: 'attack', op: 'mul', value: 1.3 },
    ]);
    expect(s.maxHp).toBe(90);
    expect(s.attack).toBeCloseTo(1.3);
    expect(s.damageTaken).toBe(1);
  });
});

describe('피해 계산', () => {
  it('층 배율: 1 + 0.25 × (층 - 1), 9층 초과는 추가 배율', () => {
    expect(monsterScale(1)).toBe(1);
    expect(monsterScale(5)).toBe(2);
    expect(monsterScale(9)).toBe(3);
    expect(monsterScale(11)).toBeGreaterThan(3);
  });

  it('공격력 배율과 받는 피해 배율이 적용된다', () => {
    const s = computeStats({}, [
      { stat: 'attack', op: 'mul', value: 1.5 },
      { stat: 'damageTaken', op: 'mul', value: 0.8 },
    ]);
    expect(outgoingDamage(s, 10, 100, null).damage).toBe(15);
    expect(incomingDamage(s, 10)).toBe(8);
    expect(incomingDamage(s, 10, 0.3)).toBe(2);
    expect(incomingDamage(s, 10, 0)).toBe(0);
  });

  it('회복은 최대 체력을 넘지 않는다', () => {
    const s = computeStats({ maxHp: 50 }, []);
    expect(applyHeal(s, 45, 20)).toBe(50);
  });

  it('치명타는 시드 난수로 재현 가능', () => {
    const s = computeStats({}, [{ stat: 'critChance', op: 'add', value: 0.5 }]);
    const run = (seed: number) => {
      const rng = new Rng(seed);
      return Array.from({ length: 20 }, () => outgoingDamage(s, 10, 100, rng).crit);
    };
    expect(run(3)).toEqual(run(3));
    expect(run(3).some(Boolean)).toBe(true);
  });
});

describe('몬스터 데이터', () => {
  it('테마당 3종 (걷는 근접형, 비행형, 원거리형)', () => {
    for (const theme of ['cave', 'ruins', 'abyss'] as const) {
      const kinds = MONSTERS.filter((m) => m.theme === theme).map((m) => m.behavior).sort();
      expect(kinds).toEqual(['flyer', 'shooter', 'walker']);
    }
  });

  it('모든 몬스터 공격은 최소 예고 시간 이상의 예고 동작이 있다', () => {
    for (const m of MONSTERS) {
      if (m.attack) expect(m.attack.telegraph, m.id).toBeGreaterThanOrEqual(COMBAT.monster.minTelegraph);
    }
  });

  it('층별 출현 표의 몬스터가 모두 정의되어 있다', () => {
    for (const table of Object.values(MONSTER_WEIGHTS)) for (const id of Object.keys(table)) expect(() => monsterById(id)).not.toThrow();
  });

  it('역할군 4개, 기본 공격과 스킬이 모두 다르다', () => {
    expect(ROLES.map((r) => r.id)).toEqual(['warrior', 'rogue', 'archer', 'mage']);
    expect(new Set(ROLES.map((r) => r.skill.kind)).size).toBe(4);
  });
});

describe('시야', () => {
  it('벽이 있으면 보이지 않는다', () => {
    const g = gridFromAscii(['..........', '....#.....', '..........'], basicCharToTile);
    expect(lineOfSight(g, 16, 8, 24, 150, 24)).toBe(false);
    expect(lineOfSight(g, 16, 8, 8, 150, 8)).toBe(true);
  });
});
