import Phaser from 'phaser';
import { DISPLAY } from '../config/display';
import type { RunState } from '../core/run';
import { upgradeById, type UpgradeDef } from '../data/upgrades';
import { Controls } from '../input/Controls';
import { textStyle } from '../ui/text';
import { RegistryKey, SceneKey } from './keys';

export interface RewardSceneData {
  /** 선택지 강화 id */
  choices: string[];
  title: string;
  /** 선택 후 재개할 씬 */
  resume: string;
}

/** 재개된 씬이 강화 반영을 위해 구현한다 */
export interface RewardReceiver {
  refreshStats(): void;
  onRewardChosen(u: UpgradeDef): void;
}

const TIER_COLOR: Record<string, number> = { minor: 0x8a8aa0, normal: 0x80c0ff, rare: 0xffc060 };

/**
 * 강화 선택 (기획서 8.7): 선택지 중 하나를 고른다. 선택하는 동안 층 씬은 멈춘다(탈출 타이머 포함).
 */
export class RewardScene extends Phaser.Scene {
  private controls!: Controls;
  private choices: UpgradeDef[] = [];
  private frames: Phaser.GameObjects.Rectangle[] = [];
  private selected = 0;
  private resumeKey = '';
  private readyAt = 0;

  constructor() {
    super(SceneKey.Reward);
  }

  init(data: RewardSceneData): void {
    this.choices = data.choices.map(upgradeById);
    this.resumeKey = data.resume;
    this.selected = 0;
    this.frames = [];
    this.registry.set('rewardTitle', data.title);
  }

  create(): void {
    this.controls = new Controls(this);
    this.readyAt = this.time.now + 500;
    this.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x000000, 0.72).setOrigin(0, 0);
    this.add.text(DISPLAY.width / 2, 28, this.registry.get('rewardTitle') as string, textStyle('large', '#ffe8a0')).setOrigin(0.5, 0);
    const n = this.choices.length;
    const w = Math.min(130, Math.floor((DISPLAY.width - 16 - (n - 1) * 8) / n));
    const total = n * w + (n - 1) * 8;
    const x0 = (DISPLAY.width - total) / 2;
    this.choices.forEach((u, i) => {
      const x = x0 + i * (w + 8);
      const f = this.add.rectangle(x, 60, w, 140, 0x15121f, 1).setOrigin(0, 0);
      this.frames.push(f);
      const color = TIER_COLOR[u.tier] ?? 0xffffff;
      this.add.rectangle(x + w / 2, 80, 18, 18, color, 1).setAngle(45);
      this.add.text(x + w / 2, 100, u.name, textStyle('small', '#ffffff', { align: 'center', wordWrap: { width: w - 10, useAdvancedWrap: true } })).setOrigin(0.5, 0);
      this.add.text(x + w / 2, 130, u.description, textStyle('tiny', '#d0c8f0', { align: 'center', wordWrap: { width: w - 12, useAdvancedWrap: true } })).setOrigin(0.5, 0);
      this.add.text(x + w / 2, 186, u.tier === 'rare' ? '상위 등급' : u.tier === 'normal' ? '일반' : '소형', textStyle('tiny', `#${color.toString(16).padStart(6, '0')}`)).setOrigin(0.5, 0);
    });
    this.add.text(DISPLAY.width / 2, 222, '←→ 선택    Enter / A 결정', textStyle('small', '#9890c0')).setOrigin(0.5, 0);
    this.refresh();
  }

  private refresh(): void {
    this.frames.forEach((f, i) => {
      const on = i === this.selected;
      f.setStrokeStyle(on ? 2 : 1, on ? 0xffe8a0 : 0x3a3450);
      f.setFillStyle(on ? 0x2a2238 : 0x15121f, 1);
    });
  }

  override update(_t: number, dms: number): void {
    const input = this.controls.update(dms / 1000);
    if (input.menuX !== 0) {
      this.selected = (this.selected + input.menuX + this.choices.length) % this.choices.length;
      this.refresh();
    }
    if (input.confirmPressed && this.time.now > this.readyAt) {
      const u = this.choices[this.selected]!;
      const run = this.registry.get(RegistryKey.run) as RunState;
      run.upgrades.push(u.id);
      const target = this.scene.get(this.resumeKey) as unknown as RewardReceiver;
      this.scene.resume(this.resumeKey);
      target.refreshStats();
      target.onRewardChosen(u);
      this.scene.stop();
    }
  }
}
