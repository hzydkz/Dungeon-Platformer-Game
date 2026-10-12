/** 지도 (기획서 6장). 평소에는 화면을 가리지 않고, Tab/M/View를 누르고 있는 동안 약도를 펼친다. */
export const MAP = {
  /** 지도를 보는 동안 이동속도 배율 (기획자 요청) */
  holdMoveFactor: 0.5,
  /** 포탈은 화면에 한 번 보인 뒤부터 지도에 표시 (기획자 요청으로 변경, 기획서 원안은 표시 안 함) */
  showPortalsAfterDiscovery: true,
  /** true면 발견하지 않은 포탈도 표시 */
  showUndiscoveredPortals: false,
  /** 보스방 위치는 처음부터 표시 [확정] */
  showBossFromStart: true,
  /** 지도 영역 (px, 480×270 화면 기준) */
  panel: { x: 12, y: 22, width: 456, height: 216 },
  /** 지형을 그릴 최대 영역 (범례, 제목, 아이템 줄 제외) */
  terrain: { maxWidth: 440, maxHeight: 150 },
  /** 아이템 줄의 위쪽 (패널 위쪽 기준 px) */
  itemsTop: 176,
  colors: {
    paper: '#e6d7b4',
    paperDark: '#d4c29a',
    /** 본 적 있는 빈칸 (안 본 곳은 종이색 그대로) */
    paperSeen: '#f4ebd2',
    ink: '#3e2f20',
    rock: '#bfa97e',
    platform: '#7a6040',
    spike: '#a8402c',
    vine: '#5f8a3c',
    unvisited: '#9c8a66',
    frame: 0x5a4630,
    boss: 0x8a2a8a,
    portalBlue: 0x2a5ad0,
    portalRed: 0xc02020,
    chest: 0xc89010,
    altar: 0x208a7a,
    shop: 0xc06a00,
    gate: 0x2a8a5a,
    lock: 0xb08010,
    zone: { nest: 0xb03030, dark: 0x302850, trap: 0xb06020 },
    player: 0xd02020,
  },
} as const;

/** 탐사 요소 연출 (어둠 구역 시야) */
export const EXPLORE_FX = {
  /** 이 반지름(px) 안은 밝다 */
  darkInnerRadius: 56,
  /** 이 반지름부터 가장 어둡다 */
  darkOuterRadius: 140,
  darkAlpha: 0.94,
} as const;

/** 시야와 안개 (기획자 요청: 벽 너머는 안 보이게, 시야를 좁게, 본 곳만 지도에) */
export const VISION = {
  /** 시야 반지름 (타일). 화면은 가로 30칸 정도 */
  radius: 9,
  /** 보스전 (아레나 전체가 보이게) */
  bossRadius: 40,
  /** 어둠 구역 안에서의 시야 반지름 */
  darkRadius: 5,
  /** 시야 끝에서 이 칸 수만큼 서서히 어두워진다 */
  fadeTiles: 3,
  /** 본 적 있지만 지금 안 보이는 곳의 어둡기 (0~1) */
  memoryAlpha: 0.62,
  /** 아직 못 본 곳의 어둡기 */
  unseenAlpha: 1,
  /** 몬스터(8~9), 투사체(12)보다 위, 피해 숫자(40)보다 아래 */
  depth: 35,
  /** 플레이어가 가만히 있어도 이 간격(초)으로 다시 계산 (문이 열리거나 벽이 부서진 경우) */
  refreshInterval: 0.25,
} as const;
