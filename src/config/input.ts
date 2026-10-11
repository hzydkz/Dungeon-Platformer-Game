/**
 * 조작 키 설정 (기획서 4.3). [가정]
 * 키 이름은 Phaser KeyCodes 이름. 게임패드 번호는 W3C 표준 매핑(Xbox 배치) 기준.
 */
export const INPUT = {
  keys: {
    left: ['LEFT', 'A'],
    right: ['RIGHT', 'D'],
    up: ['UP', 'W'],
    down: ['DOWN', 'S'],
    jump: ['SPACE', 'Z'],
    attack: ['X', 'J'],
    skill: ['C', 'K'],
    map: ['TAB', 'M'],
    confirm: ['ENTER', 'SPACE', 'Z'],
    cancel: ['ESC', 'BACKSPACE'],
  },
  /** 개발/미리보기 빌드 전용 디버그 키 */
  debugKeys: {
    revealMap: 'ONE',
    invincible: 'TWO',
    nextFloor: 'THREE',
    hitboxes: 'FOUR',
    killBoss: 'FIVE',
  },
  gamepad: {
    /** A */
    jump: [0],
    /** X */
    attack: [2],
    /** B, RB */
    skill: [1, 5],
    /** View(Back), Y. iPad Safari에서 View 버튼이 전달되지 않을 경우를 대비해 Y로도 연다 */
    map: [8, 3],
    /** A, Menu(Start) */
    confirm: [0, 9],
    /** B */
    cancel: [1],
    /**
     * 디버그(개발/미리보기 빌드 전용): LB를 누른 채로 누르는 버튼. LB를 누르는 동안 이 버튼들은 게임 조작으로 쓰지 않는다.
     * 아이패드처럼 키보드가 없을 때 숫자키 1~5 대신 쓴다.
     */
    debugModifier: 4,
    debugButtons: { revealMap: 3, invincible: 2, nextFloor: 9, killBoss: 1, hitboxes: 13 },
    dpadUp: 12,
    dpadDown: 13,
    dpadLeft: 14,
    dpadRight: 15,
    /** 왼쪽 스틱 데드존 */
    stickDeadzone: 0.35,
    /** 스틱으로 메뉴를 움직일 때 반복 간격 (초) */
    menuRepeat: 0.25,
  },
} as const;

export type ActionName = keyof typeof INPUT.keys;
