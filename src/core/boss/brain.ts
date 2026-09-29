/**
 * 보스 상태 머신 (기획서 8.6). Phaser 비의존.
 * intro → idle → telegraph → active → recovery → idle ...
 * 체력 50% 이하에서 2페이즈: 전환 연출 후 2페이즈 패턴 추가 + 시간 배율(빨라짐).
 * 예고 시간은 배율을 적용해도 최소값 아래로 내려가지 않는다.
 */
import { BOSS_RULES, type BossDef, type BossPattern, type BossSituation } from '../../data/bosses';
import type { Rng } from '../rng';

export type BossState = 'intro' | 'idle' | 'telegraph' | 'active' | 'recovery' | 'phaseShift' | 'dead';

export type BossEvent =
  | { readonly type: 'telegraph'; readonly pattern: BossPattern }
  | { readonly type: 'attack'; readonly pattern: BossPattern }
  | { readonly type: 'recover'; readonly pattern: BossPattern }
  | { readonly type: 'idle' }
  | { readonly type: 'phase2' }
  | { readonly type: 'dead' };

/**
 * 플레이어 위치로 상황을 분류한다. dx, dy는 보스 발 기준 플레이어 발 위치 (px, 아래가 +).
 */
export function classifySituation(dx: number, dy: number): BossSituation[] {
  const out: BossSituation[] = [];
  if (dy < -BOSS_RULES.aboveThreshold) out.push('above');
  const dist = Math.hypot(dx, dy);
  if (dist < BOSS_RULES.nearDistance) out.push('near');
  if (dist > BOSS_RULES.farDistance) out.push('far');
  return out;
}

export class BossBrain {
  state: BossState = 'intro';
  phase: 1 | 2 = 1;
  time = 0;
  current: BossPattern | null = null;
  private lastId = '';
  /** 공격 상태를 일찍 끝내라는 요청 (돌진이 벽에 닿음, 도약 착지 등) */
  private endActiveRequested = false;

  constructor(
    readonly def: BossDef,
    readonly tier: 1 | 2 | 3,
    private readonly rng: Rng,
  ) {}

  /** 현재 페이즈/단계에서 쓸 수 있는 패턴 */
  available(): BossPattern[] {
    return this.def.patterns.filter((p) => p.phase <= this.phase && p.minTier <= this.tier);
  }

  private speed(): number {
    return this.phase === 2 ? this.def.phase2Speed : 1;
  }

  /** 페이즈 배율을 적용한 실제 시간 */
  telegraphTime(p: BossPattern): number {
    return Math.max(BOSS_RULES.minTelegraph, p.telegraph / this.speed());
  }

  activeTime(p: BossPattern): number {
    return p.active / this.speed();
  }

  recoveryTime(p: BossPattern): number {
    return p.recovery / this.speed();
  }

  idleTime(): number {
    return this.def.idleTime / this.speed();
  }

  /** 공격 상태를 즉시 끝내고 후딜레이로 */
  endActive(): void {
    if (this.state === 'active') this.endActiveRequested = true;
  }

  /** 무적 구간 (등장, 페이즈 전환) */
  get invulnerable(): boolean {
    return this.state === 'intro' || this.state === 'phaseShift' || this.state === 'dead';
  }

  /** 상황에 맞는 패턴(prefer)의 가중치를 올려서 고른다 */
  private pick(situation: readonly BossSituation[]): BossPattern {
    const list = this.available();
    const pool = list.length > 1 ? list.filter((p) => p.id !== this.lastId) : list;
    const weight = (x: BossPattern) =>
      x.weight * (x.prefer?.some((s) => situation.includes(s)) ? BOSS_RULES.preferMultiplier : 1);
    const p = this.rng.weightedPick(pool, weight);
    this.lastId = p.id;
    return p;
  }

  /** 한 프레임 진행. 체력 비율로 페이즈 전환을 판단한다 */
  update(dt: number, hpRatio: number, situation: readonly BossSituation[] = []): BossEvent[] {
    const events: BossEvent[] = [];
    if (this.state === 'dead') return events;
    if (hpRatio <= 0) {
      this.state = 'dead';
      events.push({ type: 'dead' });
      return events;
    }
    this.time += dt;
    // 2페이즈 전환: 공격 도중이 아니라 다음 대기/후딜 시점에 전환한다 (공격은 끝까지 읽을 수 있게)
    if (this.phase === 1 && hpRatio <= BOSS_RULES.phase2At && (this.state === 'idle' || this.state === 'recovery')) {
      this.phase = 2;
      this.state = 'phaseShift';
      this.time = 0;
      this.current = null;
      events.push({ type: 'phase2' });
      return events;
    }
    switch (this.state) {
      case 'intro':
        if (this.time >= BOSS_RULES.introTime) this.toIdle(events);
        break;
      case 'phaseShift':
        if (this.time >= BOSS_RULES.phaseShiftTime) this.toIdle(events);
        break;
      case 'idle':
        if (this.time >= this.idleTime()) {
          this.current = this.pick(situation);
          this.state = 'telegraph';
          this.time = 0;
          events.push({ type: 'telegraph', pattern: this.current });
        }
        break;
      case 'telegraph':
        if (this.current && this.time >= this.telegraphTime(this.current)) {
          this.state = 'active';
          this.time = 0;
          this.endActiveRequested = false;
          events.push({ type: 'attack', pattern: this.current });
        }
        break;
      case 'active':
        if (this.current && (this.endActiveRequested || this.time >= this.activeTime(this.current))) {
          this.state = 'recovery';
          this.time = 0;
          events.push({ type: 'recover', pattern: this.current });
        }
        break;
      case 'recovery':
        if (this.current && this.time >= this.recoveryTime(this.current)) this.toIdle(events);
        break;
    }
    return events;
  }

  private toIdle(events: BossEvent[]): void {
    this.state = 'idle';
    this.time = 0;
    this.current = null;
    events.push({ type: 'idle' });
  }
}
