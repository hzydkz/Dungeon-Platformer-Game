import Phaser from 'phaser';
import { DEBUG } from '../config/debug';
import { INPUT, type ActionName } from '../config/input';

/** 한 프레임의 입력 상태. 키보드와 게임패드를 합친 결과. */
export interface InputFrame {
  moveX: number;
  moveY: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  attackPressed: boolean;
  attackHeld: boolean;
  skillPressed: boolean;
  skillHeld: boolean;
  skillReleased: boolean;
  upPressed: boolean;
  downHeld: boolean;
  mapPressed: boolean;
  /** 지도 키를 누르고 있는가 (누르는 동안 약도 표시) */
  mapHeld: boolean;
  confirmPressed: boolean;
  cancelPressed: boolean;
  /** 메뉴 이동 펄스 (-1, 0, 1). 스틱은 반복 간격마다 한 번씩 */
  menuX: number;
  menuY: number;
  /** 마지막으로 쓴 입력이 게임패드인가 (화면 안내 문구를 패드 버튼으로) */
  padActive: boolean;
}

export type DebugAction = keyof typeof INPUT.debugKeys;

/** 브라우저 Gamepad 객체에서 읽는 최소 형태 */
type RawPad = { readonly connected: boolean; readonly mapping: string; readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[]; readonly axes: readonly number[] };

/** 마지막으로 패드를 쓴 뒤 키보드를 누르기 전까지 패드 안내를 보인다 (씬이 바뀌어도 유지) */
let lastDevicePad = false;
/**
 * 이 페이지에서 패드를 본 적이 있는가. Safari/Chrome은 버튼을 한 번 누르기 전에는 패드를 알려 주지 않으므로,
 * 패드가 처음 보이는 순간 눌려 있는 버튼은 그 자체가 새 입력이다 (이전 씬에서 넘어온 입력일 수 없다).
 */
let padFirstSeenFrame = -1;

type ButtonAction = 'jump' | 'attack' | 'skill' | 'map' | 'confirm' | 'cancel';

/**
 * 키보드 + 게임패드(W3C 표준 매핑, Xbox 배치) 입력을 InputFrame으로 모은다.
 * 씬마다 하나씩 만들고 매 프레임 `update`를 호출한다.
 */
export class Controls {
  private readonly keys = new Map<ActionName, Phaser.Input.Keyboard.Key[]>();
  private prev = new Map<string, boolean>();
  /**
   * 첫 프레임에는 이미 눌려 있는 버튼을 '새로 눌림'으로 보지 않는다.
   * 이전 씬에서 누른 버튼(타이틀의 A, 포탈 진입의 ↑)이 새 씬에서 곧바로 다시 실행되는 것을 막는다.
   */
  private primed = false;
  /** 프레임 사이에 눌렸다 떼어진 짧은 입력도 놓치지 않도록 key down 이벤트를 기록 */
  private latched = new Set<string>();
  private menuRepeatTimer = 0;
  private lastMenuDir = { x: 0, y: 0 };
  /** 이 씬에서 메뉴 방향을 새로 누른 뒤 계속 누르고 있는 중 (이전 씬에서 누르던 방향은 반복하지 않는다) */
  private menuHeldFromPress = false;

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      for (const [action, names] of Object.entries(INPUT.keys) as [ActionName, readonly string[]][]) {
        const keys = names.map((n) => kb.addKey(n, true));
        for (const k of keys) {
          k.on('down', () => {
            this.latched.add(`k:${action}`);
            if (action === 'up') this.latched.add('k:menuUp');
          });
        }
        this.keys.set(action, keys);
      }
    }
  }

  private keyDown(action: ActionName): boolean {
    return (this.keys.get(action) ?? []).some((k) => k.isDown);
  }

  /**
   * 연결된 게임패드 (표준 매핑 우선). Phaser의 Gamepad 래퍼 대신 브라우저 값을 직접 읽는다:
   * 래퍼는 버튼 값이 정확히 1일 때만 눌림으로 보고, 씬이 바뀐 뒤 패드 값이 새로 바뀌기 전까지는 값을 무시해서
   * 브라우저(특히 iPad Safari)마다 동작이 달라질 수 있다.
   */
  private pad(): RawPad | null {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav || typeof nav.getGamepads !== 'function') return null;
    let list: readonly (RawPad | null)[];
    try {
      list = nav.getGamepads() as unknown as readonly (RawPad | null)[];
    } catch {
      return null;
    }
    let fallback: RawPad | null = null;
    for (const p of list) {
      if (!p || !p.connected) continue;
      if (p.mapping === 'standard') return p;
      fallback ??= p;
    }
    return fallback;
  }

  private padButton(pad: RawPad | null, index: number): boolean {
    const b = pad?.buttons[index];
    return !!b && (b.pressed || b.value > 0.5);
  }

  private padAction(pad: RawPad | null, action: ButtonAction): boolean {
    return INPUT.gamepad[action].some((i) => this.padButton(pad, i));
  }

  /** 현재 눌림 상태를 기록하고, 새로 눌렸으면 true (프레임 사이의 짧은 탭 포함) */
  private edge(id: string, down: boolean): { pressed: boolean; released: boolean } {
    if (!this.primed) {
      this.latched.delete(id);
      this.prev.set(id, down);
      return { pressed: false, released: false };
    }
    const was = this.prev.get(id) ?? false;
    const tapped = this.latched.delete(id);
    this.prev.set(id, down);
    return { pressed: (down && !was) || (tapped && !was), released: (!down && was) || (tapped && !down) };
  }

  /**
   * 키보드 + 게임패드 상태를 합쳐 눌림을 판정한다. 게임패드 버튼은 이 씬에서 떼어진 상태를
   * 한 번 본 뒤부터 눌림으로 친다 (새 씬의 패드 객체는 첫 프레임에 버튼 값이 비어 있어서,
   * 이전 씬에서 누르던 A 버튼이 새로 눌린 것으로 잡히는 것을 막는다).
   */
  private both(id: string, kbDown: boolean, padDown: boolean): { pressed: boolean; released: boolean } {
    const k = this.edge(`k:${id}`, kbDown);
    let p = { pressed: false, released: false };
    if (this.padFirstSeen) {
      // 패드를 처음 연결한 누름: 이 버튼을 바로 눌림으로 친다
      this.prev.set(`p:${id}`, padDown);
      this.padArmed.add(id);
      p = { pressed: padDown, released: false };
    } else if (this.padReady) {
      if (!padDown) this.padArmed.add(id);
      p = this.edge(`p:${id}`, padDown);
      // 이 씬에서 한 번도 떼어진 적 없는 버튼은 이전 씬에서 누르던 것이다
      if (!this.padArmed.has(id)) p = { pressed: false, released: false };
    } else this.prev.set(`p:${id}`, padDown);
    return { pressed: k.pressed || p.pressed, released: (k.released || p.released) && !kbDown && !padDown };
  }

  /** 패드가 이 씬에서 한 프레임 이상 보였는지 */
  private padReady = false;
  /** 이번 프레임에 이 페이지에서 처음으로 패드가 보였는지 */
  private padFirstSeen = false;
  /** 이 씬에서 떼어진 상태를 한 번 이상 본 패드 입력 (새 패드 객체는 첫 프레임 버튼 값이 비어 있다) */
  private readonly padArmed = new Set<string>();

  update(dt: number): InputFrame {
    const rawPad = this.pad();
    const g = INPUT.gamepad;
    // 같은 프레임의 다른 씬(HUD 등)도 이 누름을 같이 보도록 프레임 번호로 기록
    const frame = this.scene.game.loop.frame;
    if (rawPad && padFirstSeenFrame < 0) padFirstSeenFrame = frame;
    this.padFirstSeen = rawPad !== null && padFirstSeenFrame === frame;
    // 디버그 조합(LB + 버튼): 누르는 동안 패드 버튼은 게임 조작으로 쓰지 않는다
    this.debugChord = DEBUG.enabled && this.padButton(rawPad, g.debugModifier);
    this.updateDebugPad(rawPad);
    const pad = this.debugChord ? null : rawPad;
    const ax = pad ? pad.axes[0] ?? 0 : 0;
    const ay = pad ? pad.axes[1] ?? 0 : 0;
    const stickX = Math.abs(ax) >= g.stickDeadzone ? Math.sign(ax) : 0;
    const stickY = Math.abs(ay) >= g.stickDeadzone ? Math.sign(ay) : 0;

    const kLeft = this.keyDown('left');
    const kRight = this.keyDown('right');
    const kUp = this.keyDown('up');
    const kDown = this.keyDown('down');
    const pLeft = this.padButton(pad, g.dpadLeft) || stickX < 0;
    const pRight = this.padButton(pad, g.dpadRight) || stickX > 0;
    const pUp = this.padButton(pad, g.dpadUp) || stickY < 0;
    const pDown = this.padButton(pad, g.dpadDown) || stickY > 0;
    const left = kLeft || pLeft;
    const right = kRight || pRight;
    const up = kUp || pUp;
    const down = kDown || pDown;
    const moveX = (right ? 1 : 0) - (left ? 1 : 0);
    const moveY = (down ? 1 : 0) - (up ? 1 : 0);

    const btn = (a: ButtonAction) => [this.keyDown(a), this.padAction(pad, a)] as const;
    const [kJump, pJump] = btn('jump');
    const [kAttack, pAttack] = btn('attack');
    const [kSkill, pSkill] = btn('skill');
    const [kMap, pMap] = btn('map');
    const [kConfirm, pConfirm] = btn('confirm');
    const [kCancel, pCancel] = btn('cancel');
    const jump = kJump || pJump;
    const attack = kAttack || pAttack;
    const skill = kSkill || pSkill;

    const jumpE = this.both('jump', kJump, pJump);
    const attackE = this.both('attack', kAttack, pAttack);
    const skillE = this.both('skill', kSkill, pSkill);
    const upE = this.both('up', kUp, pUp);
    const mapE = this.both('map', kMap, pMap);
    const confirmE = this.both('confirm', kConfirm, pConfirm);
    const cancelE = this.both('cancel', kCancel, pCancel);

    // 메뉴 이동: 새로 누를 때(짧은 탭 포함) 한 번, 계속 누르면 반복 간격마다
    const leftE = this.both('left', kLeft, pLeft);
    const rightE = this.both('right', kRight, pRight);
    const upMenuE = this.both('menuUp', kUp, pUp);
    const downE = this.both('down', kDown, pDown);
    let menuX = (rightE.pressed ? 1 : 0) - (leftE.pressed ? 1 : 0);
    let menuY = (downE.pressed ? 1 : 0) - (upMenuE.pressed ? 1 : 0);
    if (menuX !== 0 || menuY !== 0) {
      this.menuRepeatTimer = g.menuRepeat * 1.6;
      this.menuHeldFromPress = true;
    } else if (moveX === 0 && moveY === 0) {
      this.menuHeldFromPress = false;
    } else if (this.menuHeldFromPress && moveX === this.lastMenuDir.x && moveY === this.lastMenuDir.y) {
      this.menuRepeatTimer -= dt;
      if (this.menuRepeatTimer <= 0) {
        menuX = moveX;
        menuY = moveY;
        this.menuRepeatTimer = g.menuRepeat;
      }
    }
    this.lastMenuDir = { x: moveX, y: moveY };
    if (!this.primed) {
      this.primed = true;
      this.latched.clear();
    }
    this.padReady = rawPad !== null;
    const kbAny = left || right || up || down || kJump || kAttack || kSkill || kMap || kConfirm || kCancel;
    const padAny = pLeft || pRight || pUp || pDown || pJump || pAttack || pSkill || pMap || pConfirm || pCancel;
    if (kbAny && !padAny) lastDevicePad = false;
    else if (padAny) lastDevicePad = true;
    // 키 입력 없이 패드만 연결된 경우도 패드 안내
    const padActive = rawPad !== null && (lastDevicePad || !kbAny);

    return {
      moveX,
      moveY,
      jumpPressed: jumpE.pressed,
      jumpHeld: jump,
      attackPressed: attackE.pressed,
      attackHeld: attack,
      skillPressed: skillE.pressed,
      skillHeld: skill,
      skillReleased: skillE.released,
      upPressed: upE.pressed,
      downHeld: down,
      mapPressed: mapE.pressed,
      mapHeld: kMap || (pMap && this.padArmed.has('map')),
      confirmPressed: confirmE.pressed,
      cancelPressed: cancelE.pressed,
      menuX,
      menuY,
      padActive,
    };
  }

  private readonly debugKeys = new Map<string, Phaser.Input.Keyboard.Key>();
  /** LB를 누르고 있는 중 (디버그 빌드) */
  private debugChord = false;
  /** 이번 프레임에 LB + 버튼으로 새로 누른 디버그 동작 */
  private readonly debugPadPressed = new Set<DebugAction>();

  private updateDebugPad(pad: RawPad | null): void {
    this.debugPadPressed.clear();
    if (!DEBUG.enabled) return;
    for (const [action, index] of Object.entries(INPUT.gamepad.debugButtons) as [DebugAction, number][]) {
      const down = this.debugChord && this.padButton(pad, index);
      const id = `pdebug_${action}`;
      const was = this.prev.get(id) ?? true;
      this.prev.set(id, down);
      if (down && !was) this.debugPadPressed.add(action);
    }
  }

  /** 디버그 동작이 이번 프레임에 눌렸는지 (숫자키 또는 패드 LB + 버튼). update() 다음에 부른다 */
  debugPressed(action: DebugAction): boolean {
    const padHit = this.debugPadPressed.has(action);
    const kb = this.scene.input.keyboard;
    if (!kb) return padHit;
    const keyName = INPUT.debugKeys[action];
    let key = this.debugKeys.get(keyName);
    if (!key) {
      key = kb.addKey(keyName, false);
      key.on('down', () => this.latched.add(`debug_${keyName}`));
      this.debugKeys.set(keyName, key);
    }
    return this.edge(`debug_${keyName}`, key.isDown).pressed || padHit;
  }
}
