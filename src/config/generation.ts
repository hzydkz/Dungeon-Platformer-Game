/** 절차적 생성 파라미터 (기획서 5장). [가정] 값은 모두 여기서 조정한다. */
export const ROOM = {
  /** 방 1칸 = 30×17 타일 (480×272px, 한 화면) */
  widthTiles: 30,
  heightTiles: 17,
} as const;

/**
 * 출입구 규격 (기획서 5.3 "출입구 위치는 규격화한다"). 방 내부 좌표(타일).
 * - 좌우 출입구: 바닥(16행) 위 12~15행, 4타일 높이 세로 구멍
 * - 상하 출입구: 가로 중앙 13~16열, 4타일 폭
 * - 위쪽 출입구가 있는 방: 2행 13~16열에 발사대 발판(아래 방에서 올라올 때 도약점)
 * - 아래쪽 출입구가 있는 방: 16행 11,12,17,18열에 착지 턱, 그 위 13~15행은 비워 둔다
 */
export const DOOR = {
  sideRows: [12, 13, 14, 15],
  verticalCols: [13, 14, 15, 16],
  launchRow: 2,
  ledgeCols: [11, 12, 17, 18],
  ledgeClearRows: [13, 14, 15],
} as const;

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
  /** 전체 칸 중 일반 방으로 쓰는 비율 [가정] */
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
} as const;
