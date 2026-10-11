/** 지도 (기획서 6장). 평소에는 화면을 가리지 않고, Tab/M/View로 약도를 펼친다. */
export const MAP = {
  /** 포탈은 화면에 한 번 보인 뒤부터 지도에 표시 (기획자 요청으로 변경, 기획서 원안은 표시 안 함) */
  showPortalsAfterDiscovery: true,
  /** true면 발견하지 않은 포탈도 표시 */
  showUndiscoveredPortals: false,
  /** 보스방 위치는 처음부터 표시 [확정] */
  showBossFromStart: true,
  /** 지도 영역 (px, 480×270 화면 기준) */
  panel: { x: 12, y: 22, width: 456, height: 216 },
  /** 지형을 그릴 최대 영역 (범례, 제목 제외) */
  terrain: { maxWidth: 440, maxHeight: 176 },
  colors: {
    paper: '#e6d7b4',
    paperDark: '#d4c29a',
    ink: '#3e2f20',
    rock: '#bfa97e',
    platform: '#7a6040',
    spike: '#a8402c',
    unvisited: '#9c8a66',
    frame: 0x5a4630,
    boss: 0x8a2a8a,
    portalBlue: 0x2a5ad0,
    portalRed: 0xc02020,
    chest: 0xc89010,
    altar: 0x208a7a,
    player: 0xd02020,
  },
} as const;
