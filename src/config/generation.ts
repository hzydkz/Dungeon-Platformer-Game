/** 절차적 생성 파라미터 (기획서 5장). [가정] 값은 모두 여기서 조정한다. */
export const ROOM = {
  /** 방 1칸 = 30×17 타일 (480×272px, 한 화면) */
  widthTiles: 30,
  heightTiles: 17,
} as const;

/**
 * 출입구 규격 (기획서 5.3 "출입구 위치는 규격화한다" → 기획자 요청으로 위치를 여러 개로 늘림, QUESTIONS 39).
 * 방 한 칸(30×17)의 가장자리마다 정해진 "출입구 자리(slot)"가 있고, 템플릿은 쓸 수 있는 자리에 D를 둔다.
 * 이웃한 두 방은 같은 자리로 이어진다. 좌표는 그 칸 기준(타일).
 * - 좌우: low = 12~15행(바닥 16행), high = 4~7행(바닥 8행)
 * - 상하: left = 5~8열, mid = 13~16열, right = 21~24열
 * - 위 출입구가 있는 칸: 2행의 그 열들에 발사대 발판(=). 아래 방에서 올라올 때의 도약점
 * - 아래 출입구가 있는 칸: 16행의 그 열 양옆 두 칸씩 착지 턱(#), 그 위 13~15행은 비운다
 */
export type SideSlot = 'low' | 'high';
export type VerticalSlot = 'left' | 'mid' | 'right';
export type DoorSlot = SideSlot | VerticalSlot;

export const DOOR = {
  side: { low: [12, 13, 14, 15], high: [4, 5, 6, 7] } as Readonly<Record<SideSlot, readonly number[]>>,
  vertical: { left: [5, 6, 7, 8], mid: [13, 14, 15, 16], right: [21, 22, 23, 24] } as Readonly<Record<VerticalSlot, readonly number[]>>,
  launchRow: 2,
  ledgeClearRows: [13, 14, 15],
  /** 기본 자리 (기존 규격) */
  sideRows: [12, 13, 14, 15],
  verticalCols: [13, 14, 15, 16],
} as const;

export const SIDE_SLOTS: readonly SideSlot[] = ['low', 'high'];
export const VERTICAL_SLOTS: readonly VerticalSlot[] = ['left', 'mid', 'right'];

/** 아래 출입구 착지 턱 열 (그 칸 기준) */
export function ledgeCols(slot: VerticalSlot): number[] {
  const c = DOOR.vertical[slot];
  return [c[0]! - 2, c[0]! - 1, c[3]! + 1, c[3]! + 2];
}

/**
 * 방 모양 (칸 수 가로×세로)과 레이아웃에서 고를 가중치 (기획자 요청: 긴 복도, 세로 굴, 큰 홀).
 * 입구 방과 보스 아레나(2×1)는 따로 정한다.
 */
export const ROOM_SHAPES: readonly { readonly w: number; readonly h: number; readonly weight: number }[] = [
  { w: 1, h: 1, weight: 58 },
  { w: 2, h: 1, weight: 12 },
  { w: 3, h: 1, weight: 6 },
  { w: 1, h: 2, weight: 14 },
  { w: 2, h: 2, weight: 10 },
];

/** 층별 방 그리드 크기 (기획서 5.3: 1층 7×5, 5층 9×7, 9층 11×7) [가정] */
export const FLOOR_GRID: readonly (readonly [number, number])[] = [
  [7, 5],
  [7, 5],
  [8, 5],
  [8, 6],
  [9, 7],
  [9, 7],
  [10, 7],
  [10, 7],
  [11, 7],
];

export const LAYOUT = {
  /** 전체 칸 중 일반 방이 차지하는 칸의 비율 [가정] */
  fillRatio: 0.6,
  /** 스패닝 트리 간선 대비 추가 연결 비율 (루프) [가정] */
  loopRatio: 0.15,
  /** 트리 성장 시 가장 최근 방에서 뻗어 나갈 확률. 높을수록 길쭉하다 */
  newestBias: 0.35,
  /** 출구 포탈: BFS 거리 상위 비율 [가정] */
  exitTopFraction: 0.2,
  /** 보스방: 최대 BFS 거리 대비 구간 [가정] */
  bossDistanceRange: [0.4, 0.8] as const,
  /** 보스방 크기 (방 칸 수, 가로×세로) */
  bossRoomCells: [2, 1] as const,
  /** 레이아웃 생성 실패 시 시드를 바꿔 재시도하는 최대 횟수 */
  maxAttempts: 50,
  /** 마지막 n번의 시도는 보스방 거리 구간 조건을 완화한다 */
  relaxedAttempts: 5,
} as const;

/** 빨간 던전 구조 (기획서 7.2) [가정] */
export const RED_LAYOUT = {
  grid: [7, 7] as const,
  /** 일반 방이 차지하는 칸 수 */
  roomCount: [6, 10] as const,
  newestBias: 0.85,
  loopRatio: 0,
  bossDistanceRange: [0.8, 1.0] as const,
} as const;

/** 방 템플릿 내부 랜덤 요소 확률 [가정] */
export const ROOM_RANDOM = {
  /** 선택적 발판(o) 세트가 켜질 확률 (방마다 한 번 결정) */
  optionalPlatformChance: 0.5,
  /** 몬스터 스폰(M) 위치마다 몬스터가 생길 확률 (층에 따라 증가) */
  monsterChanceBase: 0.45,
  monsterChancePerFloor: 0.04,
  monsterChanceMax: 0.85,
  /** 상자(C) 위치마다 상자가 생길 확률 */
  chestChance: 0.25,
  /** 막다른 방의 상자 확률 배율 (5.6 보물 방) */
  deadEndChestMultiplier: 2.5,
  /** 층당 비밀 벽 개수 범위 [가정] */
  secretWallsPerFloor: [0, 2] as const,
  /** 방이 함정 방(t가 가시로 바뀜)이 될 확률 */
  trapRoomChance: 0.12,
  /** 층에 제단 이벤트 방이 생길 확률 */
  altarChance: 0.4,
  /** 좌우로 이어진 두 방 사이 벽을 틀 확률 (양쪽이 모두 빈 높이만, 기획자 요청) */
  seamOpenChance: 0.75,
} as const;

/**
 * 탐사 요소 (기획자 요청: 다시 돌아갈 이유와 발견하는 재미). 일반 층에만 (빨간 던전 제외). [가정]
 */
export type ZoneKind = 'nest' | 'trap';
export const EXPLORE = {
  /** 지름길 문 개수: 층 번호별 (1층부터) */
  shortcuts: [1, 1, 1, 2, 2, 2, 2, 2, 2] as readonly number[],
  /** 지름길로 이을 두 방의 입구 거리(방 그래프) 차이 최소값 (차이가 큰 쌍을 먼저 고른다) */
  shortcutMinGap: 2,
  /** 잠긴 보물 방(열쇠는 다른 곳)이 생길 확률 */
  vaultChance: 0.85,
  /** 숨은 방(입구가 부서지는 벽)이 생길 확률 */
  hiddenRoomChance: 0.6,
  /** 구역 개수: 층 번호별 */
  zones: [0, 1, 1, 1, 2, 2, 2, 2, 2] as readonly number[],
  /** 구역 하나의 방 수 */
  zoneSize: [3, 5] as const,
  /** 둥지: 몬스터 확률 배율, 상자 확률 배율 */
  nest: { monsterMultiplier: 1.7, chestMultiplier: 1.5 },
  /** 함정 구역: 함정 방이 될 확률, 상자 확률 배율 */
  trap: { trapChance: 0.9, chestMultiplier: 2 },
  /** 숨은 방의 상자 위치는 모두 상자 */
  hiddenChestChance: 1,
} as const;
