import Phaser from 'phaser';
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
  confirmPressed: boolean;
  cancelPressed: boolean;
  /** 메뉴 이동 펄스 (-1, 0, 1). 스틱은 반복 간격마다 한 번씩 */
  menuX: number;
  menuY: number;
}

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

  private pad(): Phaser.Input.Gamepad.Gamepad | null {
    const gp = this.scene.input.gamepad;
    if (!gp || gp.total === 0) return null;
    return gp.getAll().find((p) => p.connected) ?? null;
  }

  private padButton(pad: Phaser.Input.Gamepad.Gamepad | null, index: number): boolean {
    return !!pad && !!pad.buttons[index]?.pressed;
  }

  private padAction(pad: Phaser.Input.Gamepad.Gamepad | null, action: ButtonAction): boolean {
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
    if (this.padReady) {
      if (!padDown) this.padArmed.add(id);
      p = this.edge(`p:${id}`, padDown);
      // 이 씬에서 한 번도 떼어진 적 없는 버튼은 이전 씬에서 누르던 것이다
      if (!this.padArmed.has(id)) p = { pressed: false, released: false };
    } else this.prev.set(`p:${id}`, padDown);
    return { pressed: k.pressed || p.pressed, released: (k.released || p.released) && !kbDown && !padDown };
  }

  /** 패드가 이 씬에서 한 프레임 이상 보였는지 */
  private padReady = false;
  /** 이 씬에서 떼어진 상태를 한 번 이상 본 패드 입력 (새 패드 객체는 첫 프레임 버튼 값이 비어 있다) */
  private readonly padArmed = new Set<string>();

  update(dt: number): InputFrame {
    const pad = this.pad();
    const g = INPUT.gamepad;
    const ax = pad ? pad.axes[0]?.getValue() ?? 0 : 0;
    const ay = pad ? pad.axes[1]?.getValue() ?? 0 : 0;
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
    } else if ((moveX !== 0 || moveY !== 0) && moveX === this.lastMenuDir.x && moveY === this.lastMenuDir.y) {
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
    this.padReady = pad !== null;

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
      confirmPressed: confirmE.pressed,
      cancelPressed: cancelE.pressed,
      menuX,
      menuY,
    };
  }

  private readonly debugKeys = new Map<string, Phaser.Input.Keyboard.Key>();

  /** 디버그 키가 이번 프레임에 눌렸는지 */
  debugPressed(keyName: string): boolean {
    const kb = this.scene.input.keyboard;
    if (!kb) return false;
    let key = this.debugKeys.get(keyName);
    if (!key) {
      key = kb.addKey(keyName, false);
      key.on('down', () => this.latched.add(`debug_${keyName}`));
      this.debugKeys.set(keyName, key);
    }
    return this.edge(`debug_${keyName}`, key.isDown).pressed;
  }
}
