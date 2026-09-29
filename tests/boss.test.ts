import { describe, expect, it } from 'vitest';
import { BossBrain, type BossEvent } from '../src/core/boss/brain';
import { Rng } from '../src/core/rng';
import { BOSSES, BOSS_RULES, bossForFloor } from '../src/data/bosses';

function run(brain: BossBrain, seconds: number, hp: (t: number) => number): BossEvent[] {
  const out: BossEvent[] = [];
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) out.push(...brain.update(dt, hp(t)));
  return out;
}

describe('보스 패턴 데이터 (기획서 8.6)', () => {
  it('모든 패턴의 예고 시간이 최소값 이상 (2페이즈 배율 적용 후 포함)', () => {
    for (const def of BOSSES) {
      const brain = new BossBrain(def, 3, new Rng(1));
      for (const p of def.patterns) {
        expect(p.telegraph, p.id).toBeGreaterThanOrEqual(BOSS_RULES.minTelegraph);
        brain.phase = 2;
        expect(brain.telegraphTime(p), p.id).toBeGreaterThanOrEqual(BOSS_RULES.minTelegraph);
      }
    }
  });

  it('모든 보스에 2페이즈 전용 패턴이 있고 2페이즈가 더 빠르다', () => {
    for (const def of BOSSES) {
      expect(def.patterns.some((p) => p.phase === 2), def.id).toBe(true);
      expect(def.phase2Speed).toBeGreaterThan(1);
    }
  });

  it('테마 안 층 단계가 오르면 패턴이 추가된다', () => {
    for (const def of BOSSES.filter((b) => b.id !== 'final')) {
      const t1 = new BossBrain(def, 1, new Rng(1)).available().length;
      const t3 = new BossBrain(def, 3, new Rng(1)).available().length;
      expect(t3, def.id).toBeGreaterThan(t1);
    }
  });

  it('층별 보스: 1~3 동굴, 4~6 폐허, 7~8 심연, 9 최종 보스', () => {
    expect([1, 2, 3].map((f) => bossForFloor(f, 'floor').def.id)).toEqual(['cave', 'cave', 'cave']);
    expect([4, 5, 6].map((f) => bossForFloor(f, 'floor').def.id)).toEqual(['ruins', 'ruins', 'ruins']);
    expect([7, 8].map((f) => bossForFloor(f, 'floor').def.id)).toEqual(['abyss', 'abyss']);
    expect(bossForFloor(9, 'floor').def.id).toBe('final');
    expect(bossForFloor(8, 'red').def.id).toBe('abyss');
  });
});

describe('보스 상태 머신', () => {
  it('모든 공격은 예고 → 공격 → 후딜 순서이고, 예고 시간은 최소값 이상', () => {
    const def = BOSSES[0]!;
    const brain = new BossBrain(def, 3, new Rng(7));
    const dt = 1 / 60;
    let telegraphStart = -1;
    let last = '';
    for (let t = 0; t < 60; t += dt) {
      for (const e of brain.update(dt, 1)) {
        if (e.type === 'telegraph') {
          expect(last === '' || last === 'idle').toBe(true);
          telegraphStart = t;
        }
        if (e.type === 'attack') {
          expect(last).toBe('telegraph');
          expect(t - telegraphStart + dt).toBeGreaterThanOrEqual(BOSS_RULES.minTelegraph);
        }
        if (e.type === 'recover') expect(last).toBe('attack');
        last = e.type;
      }
    }
  });

  it('체력 50% 이하에서 2페이즈로 전환하고 2페이즈 패턴을 쓴다', () => {
    const def = BOSSES[0]!;
    const brain = new BossBrain(def, 1, new Rng(3));
    const events = run(brain, 80, (t) => (t < 10 ? 1 : 0.4));
    expect(events.filter((e) => e.type === 'phase2').length).toBe(1);
    expect(brain.phase).toBe(2);
    const phase2Only = new Set(def.patterns.filter((p) => p.phase === 2).map((p) => p.id));
    const used = events.filter((e): e is Extract<BossEvent, { type: 'attack' }> => e.type === 'attack').map((e) => e.pattern.id);
    expect(used.some((id) => phase2Only.has(id))).toBe(true);
  });

  it('1페이즈에서는 2페이즈 패턴을 쓰지 않고, 같은 패턴을 연속으로 쓰지 않는다', () => {
    const def = BOSSES[1]!;
    const brain = new BossBrain(def, 1, new Rng(5));
    const used = run(brain, 60, () => 1)
      .filter((e): e is Extract<BossEvent, { type: 'telegraph' }> => e.type === 'telegraph')
      .map((e) => e.pattern);
    expect(used.every((p) => p.phase === 1)).toBe(true);
    for (let i = 1; i < used.length; i++) expect(used[i]!.id).not.toBe(used[i - 1]!.id);
  });

  it('등장/전환 중에는 무적, 체력 0이면 dead', () => {
    const brain = new BossBrain(BOSSES[2]!, 1, new Rng(1));
    expect(brain.invulnerable).toBe(true);
    run(brain, 2, () => 1);
    expect(brain.invulnerable).toBe(false);
    expect(brain.update(1 / 60, 0)).toEqual([{ type: 'dead' }]);
  });

  it('같은 시드는 같은 패턴 순서', () => {
    const seq = (seed: number) =>
      run(new BossBrain(BOSSES[3]!, 3, new Rng(seed)), 40, () => 1)
        .filter((e) => e.type === 'telegraph')
        .map((e) => (e as { pattern: { id: string } }).pattern.id);
    expect(seq(11)).toEqual(seq(11));
  });
});
