import Phaser from 'phaser';
import { AssetKey } from '../assets/keys';
import { DISPLAY } from '../config/display';
import { characterStats } from '../core/character';
import { generateCandidates } from '../core/characterGen';
import { Rng, deriveSeed } from '../core/rng';
import { createRun, type CharacterChoice } from '../core/run';
import { CATALOG } from '../data/catalog';
import { PERSONALITIES } from '../data/personalities';
import { roleById } from '../data/roles';
import { TRAITS } from '../data/traits';
import { Controls } from '../input/Controls';
import { textStyle } from '../ui/text';
import { RegistryKey, SceneKey } from './keys';

export interface CharacterSelectData {
  runSeed: number;
}

const CARD_W = 150;
const CARD_H = 206;
const CARD_Y = 30;

/**
 * 캐릭터 선택 (기획서 8.1): 랜덤 후보 3명 중 1명. 역할군, 특성, 성격 효과를 모두 표시한다.
 */
export class CharacterSelectScene extends Phaser.Scene {
  private controls!: Controls;
  private candidates: CharacterChoice[] = [];
  private cards: Phaser.GameObjects.Container[] = [];
  private frames: Phaser.GameObjects.Rectangle[] = [];
  private selected = 1;
  private runSeed = 0;

  constructor() {
    super(SceneKey.CharacterSelect);
  }

  init(data: CharacterSelectData): void {
    this.runSeed = data.runSeed;
    this.selected = 1;
    this.cards = [];
    this.frames = [];
  }

  create(): void {
    this.controls = new Controls(this);
    this.cameras.main.setBackgroundColor('#07060d');
    this.candidates = generateCandidates(new Rng(deriveSeed(this.runSeed, 'characters')));
    this.add.text(DISPLAY.width / 2, 8, '캐릭터 선택', textStyle('large', '#e8e0ff')).setOrigin(0.5, 0);
    const gap = (DISPLAY.width - CARD_W * 3) / 4;
    this.candidates.forEach((c, i) => this.buildCard(c, gap + i * (CARD_W + gap)));
    this.add.text(DISPLAY.width / 2, DISPLAY.height - 14, '←→ 선택    Enter / A 결정', textStyle('small', '#8880b0')).setOrigin(0.5, 0);
    this.refresh();
  }

  private buildCard(c: CharacterChoice, x: number): void {
    const role = roleById(c.role);
    const trait = TRAITS.find((t) => t.id === c.trait)!;
    const pers = PERSONALITIES.find((p) => p.id === c.personality)!;
    const stats = characterStats(c, [], CATALOG);
    const frame = this.add.rectangle(x, CARD_Y, CARD_W, CARD_H, 0x15121f, 1).setOrigin(0, 0).setStrokeStyle(1, 0x3a3450);
    this.frames.push(frame);
    const cont = this.add.container(x, CARD_Y);
    const wrap = { wordWrap: { width: CARD_W - 12, useAdvancedWrap: true }, lineSpacing: 1 };
    const sprite = this.add.sprite(CARD_W / 2, 30, AssetKey.player(role.id), 0).setScale(2);
    const anim = `${AssetKey.player(role.id)}_idle`;
    if (this.anims.exists(anim)) sprite.play(anim);
    let y = 58;
    const put = (text: string, style: Phaser.Types.GameObjects.Text.TextStyle) => {
      const t = this.add.text(6, y, text, style);
      cont.add(t);
      y += t.height + 3;
      return t;
    };
    cont.add(sprite);
    put(`${role.name}  ·  ${role.summary}`, textStyle('small', '#ffffff'));
    put(`체력 ${stats.maxHp}`, textStyle('tiny', '#e07080'));
    put(`공격: ${role.attackName}\n스킬: ${role.skillName}`, textStyle('tiny', '#c8c0e8', wrap));
    y += 2;
    put(`특성 · ${trait.name}`, textStyle('tiny', '#ffd080'));
    put(trait.description, textStyle('tiny', '#d8d0f0', wrap));
    y += 2;
    put(`성격 · ${pers.name}`, textStyle('tiny', '#80d0ff'));
    put(pers.description, textStyle('tiny', '#d8d0f0', wrap));
    this.cards.push(cont);
  }

  private refresh(): void {
    this.frames.forEach((f, i) => {
      const on = i === this.selected;
      f.setStrokeStyle(on ? 2 : 1, on ? 0xd8c0ff : 0x3a3450);
      f.setFillStyle(on ? 0x221c33 : 0x15121f, 1);
      this.cards[i]!.setAlpha(on ? 1 : 0.6);
      this.cards[i]!.y = CARD_Y + (on ? -3 : 0);
      f.y = CARD_Y + (on ? -3 : 0);
    });
  }

  override update(_t: number, dms: number): void {
    const input = this.controls.update(dms / 1000);
    if (input.menuX !== 0) {
      this.selected = (this.selected + input.menuX + this.candidates.length) % this.candidates.length;
      this.refresh();
    }
    if (input.confirmPressed) {
      const choice = this.candidates[this.selected]!;
      this.registry.set(RegistryKey.run, createRun(this.runSeed, performance.now(), choice));
      this.scene.start(SceneKey.Floor, { floor: 1 });
    }
  }
}
