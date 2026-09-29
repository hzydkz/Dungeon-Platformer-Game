import Phaser from 'phaser';
import { DISPLAY } from '../config/display';
import { formatPlayTime, type RunState } from '../core/run';
import { roleById } from '../data/roles';
import { Controls } from '../input/Controls';
import { textStyle } from '../ui/text';
import { RegistryKey, SceneKey } from './keys';

/** 사망 결과 화면 (기획서 9장): 도달 층, 처치 보스 수, 시드, 플레이 시간 */
export class GameOverScene extends Phaser.Scene {
  private controls!: Controls;
  private readyAt = 0;

  constructor(key: string = SceneKey.GameOver) {
    super(key);
  }

  protected title(): { text: string; color: string } {
    return { text: '사망', color: '#ff6060' };
  }

  create(): void {
    this.controls = new Controls(this);
    this.readyAt = this.time.now + 800;
    const run = this.registry.get(RegistryKey.run) as RunState;
    const cx = DISPLAY.width / 2;
    this.cameras.main.setBackgroundColor('#07060d');
    const t = this.title();
    this.add.text(cx, 56, t.text, textStyle('large', t.color)).setOrigin(0.5).setScale(2);
    const time = formatPlayTime(performance.now() - run.startedAt);
    const lines = [
      `도달 층: ${run.floor}층`,
      `처치한 보스: ${run.bossesKilled}`,
      `처치한 몬스터: ${run.kills}`,
      `역할군: ${roleById(run.character.role).name}`,
      `플레이 시간: ${time}`,
      `시드: ${run.runSeed}`,
    ];
    if (run.outcome === 'dead' && run.deathCause) lines.unshift(`원인: ${run.deathCause}`);
    this.add.text(cx, 100, lines.join('\n'), textStyle('small', '#d8d0f0', { align: 'center', lineSpacing: 4 })).setOrigin(0.5, 0);
    this.add.text(cx, 240, 'Enter / A 버튼: 타이틀로', textStyle('small', '#8880b0')).setOrigin(0.5);
  }

  override update(_t: number, dms: number): void {
    const input = this.controls.update(dms / 1000);
    if (this.time.now > this.readyAt && input.confirmPressed) this.scene.start(SceneKey.Title);
  }
}

/** 클리어 화면 (9층 최종 보스 처치) */
export class VictoryScene extends GameOverScene {
  constructor() {
    super(SceneKey.Victory);
  }

  protected override title(): { text: string; color: string } {
    return { text: '클리어!', color: '#ffe080' };
  }
}
