import { describe, expect, it } from 'vitest';
import { MAP } from '../src/config/map';
import { generateFloor } from '../src/core/generation/floor';
import { Exploration } from '../src/core/map/exploration';
import { mapMarkers, type MarkerInput, type MarkerOptions } from '../src/core/map/markers';

function setup(seed = 3) {
  const floor = generateFloor({ runSeed: seed, floor: 2, kind: 'floor', reachCheck: false });
  const exploration = new Exploration(floor.layout);
  exploration.enter(floor.layout.entrance);
  const input: MarkerInput = {
    floor,
    exploration,
    player: floor.entrance,
    chests: floor.chests.map((c) => ({ ...c, alive: true })),
    altar: floor.altar ? { ...floor.altar, used: false } : null,
    redPortalClosed: false,
    bossDefeated: false,
  };
  return { floor, exploration, input };
}

const kinds = (input: MarkerInput, opt: MarkerOptions = MAP) => mapMarkers(input, opt).map((m) => m.kind);

describe('약도 표식', () => {
  it('처음에는 보스, 입구, 현재 위치만 보인다 (출구/빨간 포탈은 발견 전 숨김)', () => {
    const { input } = setup();
    const k = kinds(input);
    expect(k).toContain('boss');
    expect(k).toContain('entrance');
    expect(k).toContain('player');
    expect(k).not.toContain('exit');
    expect(k).not.toContain('red');
  });

  it('포탈을 발견하면 지도에 표시된다', () => {
    const { input, exploration, floor } = setup();
    exploration.discoveredPortals.add('exit');
    expect(kinds(input)).toContain('exit');
    if (floor.redPortal) {
      exploration.discoveredPortals.add('red');
      expect(kinds(input)).toContain('red');
      expect(kinds({ ...input, redPortalClosed: true })).not.toContain('red');
    }
  });

  it('설정으로 발견 전 포탈도 표시할 수 있다', () => {
    const { input } = setup();
    expect(kinds(input, { ...MAP, showUndiscoveredPortals: true })).toContain('exit');
  });

  it('본 적 없는 칸의 상자는 숨기고, 비밀 상자는 열기 전까지 숨긴다', () => {
    let seed = 4;
    while (!setup(seed).floor.chests.some((c) => !c.secret)) seed++;
    const { input, floor, exploration } = setup(seed);
    const chest = floor.chests.find((c) => !c.secret)!;
    const shown = () => mapMarkers(input).some((m) => m.kind === 'chest' && m.x === chest.x && m.y === chest.y);
    expect(shown()).toBe(false);
    exploration.markSeen(chest.y * exploration.width + chest.x);
    expect(shown()).toBe(true);
    exploration.revealAll();
    const secret = floor.chests.find((c) => c.secret);
    if (secret) {
      const at = (alive: boolean) =>
        mapMarkers({ ...input, chests: input.chests.map((c) => (c.x === secret.x && c.y === secret.y ? { ...c, alive } : c)) }).some(
          (m) => m.kind === 'chest' && m.x === secret.x && m.y === secret.y,
        );
      expect(at(true)).toBe(false);
      expect(at(false)).toBe(true);
    }
  });

  it('열쇠와 잠긴 문도 그 칸을 본 뒤에 표시된다', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { input, floor, exploration } = setup(seed);
      if (!floor.key) continue;
      const k = floor.key;
      const withKey = { ...input, key: { ...k, taken: false } };
      expect(kinds(withKey)).not.toContain('key');
      exploration.markSeen(k.y * exploration.width + k.x);
      expect(kinds(withKey)).toContain('key');
      expect(kinds({ ...withKey, key: { ...k, taken: true } })).not.toContain('key');
      return;
    }
    throw new Error('열쇠가 있는 층을 찾지 못했다');
  });
});

describe('숨은 방 입구 임시 표시 (기획자 요청)', () => {
  it('설정이 켜져 있으면 숨은 방 입구를 처음부터 표시하고, 꺼져 있으면 숨긴다', () => {
    const { input } = setup();
    const withHidden = { ...input, hidden: { x: 10, y: 20, found: false } };
    expect(kinds(withHidden, { ...MAP, showHiddenRoom: true })).toContain('hidden');
    expect(kinds(withHidden, { ...MAP, showHiddenRoom: false })).not.toContain('hidden');
  });
});
