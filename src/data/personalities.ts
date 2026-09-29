/**
 * 성격 (기획서 8.4) [가정 - 초안]: 전투가 아니라 탐험과 선택에 영향을 준다.
 * 효과 없는 설명용 성격은 넣지 않는다.
 */
import type { Modifier } from '../core/combat/stats';

export interface PersonalityDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly modifiers: readonly Modifier[];
}

export const PERSONALITIES: readonly PersonalityDef[] = [
  {
    id: 'greedy',
    name: '탐욕',
    description: '상자 보상 +1개, 함정 방 등장 확률 +15%p',
    modifiers: [
      { stat: 'chestAmount', op: 'add', value: 1 },
      { stat: 'trapChance', op: 'add', value: 0.15 },
    ],
  },
  { id: 'cautious', name: '신중', description: '방에 들어가면 연결된 인접 방도 지도에 공개', modifiers: [{ stat: 'revealAdjacent', op: 'add', value: 1 }] },
  {
    id: 'reckless',
    name: '무모',
    description: '빨간 던전 보상 선택지 +1, 받는 피해 +10%',
    modifiers: [
      { stat: 'redRewardBonus', op: 'add', value: 1 },
      { stat: 'damageTaken', op: 'mul', value: 1.1 },
    ],
  },
  { id: 'curious', name: '호기심', description: '비밀 벽 근처에서 화면 효과로 힌트', modifiers: [{ stat: 'secretHint', op: 'add', value: 1 }] },
  { id: 'calm', name: '냉정', description: '빨간 던전 탈출 제한 시간 +20%', modifiers: [{ stat: 'escapeTime', op: 'mul', value: 1.2 }] },
  { id: 'adventurous', name: '모험가', description: '빨간 포탈 생성 확률 +20%p', modifiers: [{ stat: 'redPortalChance', op: 'add', value: 0.2 }] },
  {
    id: 'easygoing',
    name: '느긋함',
    description: '층 이동 회복 +20%p, 탈출 제한 시간 -10%',
    modifiers: [
      { stat: 'floorHealBonus', op: 'add', value: 0.2 },
      { stat: 'escapeTime', op: 'mul', value: 0.9 },
    ],
  },
  { id: 'collector', name: '수집가', description: '상자 등장 확률 +50%', modifiers: [{ stat: 'chestChance', op: 'mul', value: 1.5 }] },
];
