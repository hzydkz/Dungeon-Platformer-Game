/** 지도 (기획서 6장) */
export const MAP = {
  /** 포탈을 발견한 뒤에도 지도에 표시하지 않음 (기본값) [가정] */
  showPortalsAfterDiscovery: false,
  /** 보스방 위치는 처음부터 표시 [확정] */
  showBossFromStart: true,
  minimap: {
    /** 화면 우상단 여백 (px) */
    margin: 4,
    maxWidth: 104,
    maxHeight: 60,
  },
  full: {
    maxWidth: 440,
    maxHeight: 230,
  },
  colors: {
    background: 0x05050a,
    border: 0x8888aa,
    visited: 0x6b5f8a,
    revealed: 0x2e2a40,
    current: 0xe8e0ff,
    boss: 0xa050e0,
    link: 0xb0a8d0,
    player: 0xffffff,
    portalBlue: 0x3a7bff,
    portalRed: 0xff3030,
  },
} as const;
