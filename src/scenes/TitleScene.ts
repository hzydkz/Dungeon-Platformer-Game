import Phaser from 'phaser';
import type { RoleId } from '../assets/keys';
import { DEBUG } from '../config/debug';
import { DISPLAY } from '../config/display';
import { Rng, deriveSeed } from '../core/rng';
import { createRun } from '../core/run';
import { generateRunSeed } from '../core/seed';
import { ROLES } from '../data/roles';
import { Controls } from '../input/Controls';
import { textStyle } from '../ui/text';
import { RegistryKey, SceneKey } from './keys';

/** 타이틀: 시작 입력을 받으면 새 런 시드를 만들고 다음 단계로 */
export class TitleScene extends Phaser.Scene {
  private controls!: Controls;
  private prompt!: Phaser.GameObjects.Text;
  private t = 0;

  constructor() {
    super(SceneKey.Title);
  }

  create(): void {
    this.controls = new Controls(this);
    this.cameras.main.setBackgroundColor('#07060d');
    const cx = DISPLAY.width / 2;
    this.add.text(cx, 84, '던전 플랫포머', textStyle('large', '#e8e0ff')).setOrigin(0.5).setScale(2);
    this.add.text(cx, 116, '1층부터 9층까지 올라가라', textStyle('small', '#9a90c0')).setOrigin(0.5);
    this.prompt = this.add.text(cx, 180, 'Enter / Space / A 버튼으로 시작', textStyle('small', '#ffffff')).setOrigin(0.5);
    this.add
      .text(cx, 236, '이동 ←→  점프 Space/Z  공격 X/J  스킬 C/K  지도 Tab/M  포탈 ↑\n게임패드: 스틱/십자  A 점프  X 공격  B/RB 스킬  View 지도', textStyle('tiny', '#7870a0', { align: 'center' }))
      .setOrigin(0.5);
  }

  override update(_t: number, dms: number): void {
    const dt = dms / 1000;
    this.t += dt;
    this.prompt.setAlpha(0.55 + 0.45 * Math.sin(this.t * 4));
    const input = this.controls.update(dt);
    if (input.confirmPressed) this.startRun();
  }

  private startRun(): void {
    const override = this.registry.get(RegistryKey.seedOverride) as number | null;
    const runSeed = override ?? generateRunSeed();
    // 캐릭터 선택(M6) 전까지는 ?role= 또는 시드로 역할군을 정한다
    const param = DEBUG.enabled ? new URLSearchParams(window.location.search).get('role') : null;
    const role: RoleId = ROLES.some((r) => r.id === param)
      ? (param as RoleId)
      : new Rng(deriveSeed(runSeed, 'characters')).pick(ROLES).id;
    this.registry.set(RegistryKey.run, createRun(runSeed, performance.now(), { role, trait: null, personality: null }));
    this.scene.start(SceneKey.Floor, { floor: 1 });
  }
}
