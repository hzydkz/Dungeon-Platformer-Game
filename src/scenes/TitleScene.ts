import Phaser from 'phaser';
import { DISPLAY } from '../config/display';
import { themeById } from '../config/themes';
import { Scenery, addVignette } from '../fx/Scenery';
import { generateRunSeed } from '../core/seed';
import { Controls } from '../input/Controls';
import { textStyle } from '../ui/text';
import type { CharacterSelectData } from './CharacterSelectScene';
import { RegistryKey, SceneKey } from './keys';

/** 타이틀: 시작 입력을 받으면 새 런 시드를 만들고 다음 단계로 */
export class TitleScene extends Phaser.Scene {
  private controls!: Controls;
  private prompt!: Phaser.GameObjects.Text;
  private t = 0;
  private scenery!: Scenery;

  constructor() {
    super(SceneKey.Title);
  }

  create(): void {
    this.controls = new Controls(this);
    this.cameras.main.setBackgroundColor('#07060d');
    this.scenery = new Scenery(this, themeById('cave'));
    addVignette(this).setDepth(50);
    const cx = DISPLAY.width / 2;
    this.add.text(cx, 84, '던전 플랫포머', textStyle('large', '#e8e0ff', { stroke: '#000000', strokeThickness: 2 })).setOrigin(0.5).setScale(2).setDepth(60);
    this.add.text(cx, 116, '1층부터 9층까지 올라가라', textStyle('small', '#b0a8d8')).setOrigin(0.5).setDepth(60);
    this.prompt = this.add.text(cx, 180, 'Enter / Space / A 버튼으로 시작', textStyle('small', '#ffffff')).setOrigin(0.5).setDepth(60);
    this.add
      .text(cx, 236, '이동 ←→  점프 Space/Z  공격 X/J  스킬 C/K  지도 Tab/M  포탈·상자 ↑\n게임패드: 스틱/십자  A 점프  X 공격  B/RB 스킬  View 지도', textStyle('tiny', '#9890c0', { align: 'center' }))
      .setOrigin(0.5)
      .setDepth(60);
  }

  override update(_t: number, dms: number): void {
    const dt = dms / 1000;
    this.t += dt;
    this.prompt.setAlpha(0.55 + 0.45 * Math.sin(this.t * 4));
    this.cameras.main.scrollX += dt * 12;
    this.scenery.update();
    const input = this.controls.update(dt);
    if (input.confirmPressed) this.startRun();
  }

  private startRun(): void {
    const override = this.registry.get(RegistryKey.seedOverride) as number | null;
    const runSeed = override ?? generateRunSeed();
    this.scene.start(SceneKey.CharacterSelect, { runSeed } satisfies CharacterSelectData);
  }
}
