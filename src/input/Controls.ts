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
  private menuRepeatTimer = 0;
  private lastMenuDir = { x: 0, y: 0 };

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      for (const [action, names] of Object.entries(INPUT.keys) as [ActionName, readonly string[]][]) {
        this.keys.set(
          action,
          names.map((n) => kb.addKey(n, true)),
        );
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

  /** 현재 눌림 상태를 기록하고, 새로 눌렸으면 true */
  private edge(id: string, down: boolean): { pressed: boolean; released: boolean } {
    const was = this.prev.get(id) ?? false;
    this.prev.set(id, down);
    return { pressed: down && !was, released: !down && was };
  }

  update(dt: number): InputFrame {
    const pad = this.pad();
    const g = INPUT.gamepad;
    const ax = pad ? pad.axes[0]?.getValue() ?? 0 : 0;
    const ay = pad ? pad.axes[1]?.getValue() ?? 0 : 0;
    const stickX = Math.abs(ax) >= g.stickDeadzone ? Math.sign(ax) : 0;
    const stickY = Math.abs(ay) >= g.stickDeadzone ? Math.sign(ay) : 0;

    const left = this.keyDown('left') || this.padButton(pad, g.dpadLeft) || stickX < 0;
    const right = this.keyDown('right') || this.padButton(pad, g.dpadRight) || stickX > 0;
    const up = this.keyDown('up') || this.padButton(pad, g.dpadUp) || stickY < 0;
    const down = this.keyDown('down') || this.padButton(pad, g.dpadDown) || stickY > 0;
    const moveX = (right ? 1 : 0) - (left ? 1 : 0);
    const moveY = (down ? 1 : 0) - (up ? 1 : 0);

    const jump = this.keyDown('jump') || this.padAction(pad, 'jump');
    const attack = this.keyDown('attack') || this.padAction(pad, 'attack');
    const skill = this.keyDown('skill') || this.padAction(pad, 'skill');
    const map = this.keyDown('map') || this.padAction(pad, 'map');
    const confirm = this.keyDown('confirm') || this.padAction(pad, 'confirm');
    const cancel = this.keyDown('cancel') || this.padAction(pad, 'cancel');

    const jumpE = this.edge('jump', jump);
    const attackE = this.edge('attack', attack);
    const skillE = this.edge('skill', skill);
    const upE = this.edge('up', up);

    // 메뉴 이동: 처음 누를 때 한 번, 계속 누르면 반복 간격마다
    let menuX = 0;
    let menuY = 0;
    if (moveX !== this.lastMenuDir.x || moveY !== this.lastMenuDir.y) {
      menuX = moveX;
      menuY = moveY;
      this.menuRepeatTimer = g.menuRepeat * 1.6;
    } else if (moveX !== 0 || moveY !== 0) {
      this.menuRepeatTimer -= dt;
      if (this.menuRepeatTimer <= 0) {
        menuX = moveX;
        menuY = moveY;
        this.menuRepeatTimer = g.menuRepeat;
      }
    }
    this.lastMenuDir = { x: moveX, y: moveY };

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
      mapPressed: this.edge('map', map).pressed,
      confirmPressed: this.edge('confirm', confirm).pressed,
      cancelPressed: this.edge('cancel', cancel).pressed,
      menuX,
      menuY,
    };
  }

  /** 디버그 키가 이번 프레임에 눌렸는지 */
  debugPressed(keyName: string): boolean {
    const kb = this.scene.input.keyboard;
    if (!kb) return false;
    const key = kb.addKey(keyName, false);
    return this.edge(`debug_${keyName}`, key.isDown).pressed;
  }
}
