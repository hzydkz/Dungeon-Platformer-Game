import Phaser from 'phaser';
import { DEBUG } from '../config/debug';
import { DISPLAY } from '../config/display';
import { PROGRESSION } from '../config/progression';
import { Controls } from '../input/Controls';
import { addVignette } from '../fx/Scenery';
import { SketchMap } from '../ui/SketchMap';
import { onResize } from '../ui/layout';
import { ITEMS } from '../config/items';
import { textStyle } from '../ui/text';
import type { HudSource } from './FloorScene';
import { RegistryKey, SceneKey } from './keys';

/**
 * HUD: 체력/스킬, 레벨/경험치, 골드, 아이템 칸, 알림, 보스 체력, 탈출 타이머, 약도(Tab/M/View를 누르는 동안) (기획서 6장).
 * 층 씬과 별도로 돌아서 카메라 흔들림 등의 영향을 받지 않는다.
 */
export class HudScene extends Phaser.Scene {
  private controls!: Controls;
  private floorLabel!: Phaser.GameObjects.Text;
  private sketch!: SketchMap;
  private bars!: Phaser.GameObjects.Graphics;
  private notice!: Phaser.GameObjects.Text;
  private noticeUntil = 0;
  private bossName!: Phaser.GameObjects.Text;
  private timer!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private skillText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private slotGrades: Phaser.GameObjects.Text[] = [];

  constructor() {
    super(SceneKey.Hud);
  }

  create(): void {
    this.controls = new Controls(this);
    addVignette(this).setDepth(0);
    // 평소에는 화면을 가리지 않도록 층 이름만 작게
    this.floorLabel = this.add
      .text(DISPLAY.width - 4, 4, '', textStyle('tiny', '#c8c0e8', { align: 'right', stroke: '#000000', strokeThickness: 2 }))
      .setOrigin(1, 0)
      .setDepth(10);
    this.sketch = new SketchMap(this);
    this.createBars();
    this.notice = this.add
      .text(DISPLAY.width / 2, 40, '', textStyle('small', '#ffffff', { align: 'center', stroke: '#000000', strokeThickness: 3 }))
      .setOrigin(0.5, 0)
      .setDepth(30)
      .setVisible(false);
    this.timer = this.add
      .text(DISPLAY.width / 2, 6, '', textStyle('large', '#ffffff', { stroke: '#000000', strokeThickness: 3 }))
      .setOrigin(0.5, 0)
      .setScale(2)
      .setDepth(25)
      .setVisible(false);
    this.bossName = this.add.text(DISPLAY.width / 2, DISPLAY.height - 26, '', textStyle('small', '#e0c8ff')).setOrigin(0.5, 0).setDepth(10);
    // 화면이 넓어지면 오른쪽/가운데/아래에 붙는 요소를 다시 배치한다
    onResize(this, () => {
      const w = this.scale.width;
      const h = this.scale.height;
      this.floorLabel.setX(w - 4);
      this.notice.setX(w / 2);
      this.timer.setX(w / 2);
      this.bossName.setPosition(w / 2, h - 26);
    });
  }

  /** 화면 상단 중앙 알림 (기획서 7.2: 빨간 포탈 알림 3초 등) */
  notify(text: string, seconds: number, color = '#ffffff'): void {
    this.notice.setText(text).setColor(color).setVisible(true).setAlpha(1);
    this.noticeUntil = this.time.now + seconds * 1000;
  }

  /** 빨간 던전 탈출 타이머: 화면 중앙 상단에 크게, 남은 10초부터 경고 */
  private drawTimer(src: HudSource): void {
    const t = src.escapeTimeLeft;
    this.timer.setVisible(t !== null);
    if (t === null) return;
    const warn = t <= PROGRESSION.escapeWarningSeconds;
    this.timer.setText(t.toFixed(1));
    this.timer.setColor(warn ? '#ff4040' : '#ffffff');
    this.timer.setScale(warn ? 2 + 0.25 * Math.abs(Math.sin(this.time.now / 120)) : 2);
  }

  private drawBossBar(src: HudSource): void {
    const b = src.bossBar;
    this.bossName.setVisible(!!b);
    if (!b) return;
    const g = this.bars;
    const w = 220;
    const x = (this.scale.width - w) / 2;
    const y = this.scale.height - 12;
    g.fillStyle(0x000000, 0.7).fillRect(x - 2, y - 2, w + 4, 8);
    g.fillStyle(0x301040, 1).fillRect(x, y, w, 4);
    g.fillStyle(0xa050e0, 1).fillRect(x, y, Math.round(w * Math.max(0, b.hp / b.maxHp)), 4);
    this.bossName.setText(b.name);
  }

  private createBars(): void {
    this.bars = this.add.graphics().setDepth(10);
    this.hpText = this.add.text(6, 13, '', textStyle('tiny', '#ffffff')).setDepth(11);
    this.skillText = this.add.text(6, 30, '', textStyle('tiny', '#c8c0e8')).setDepth(11);
    this.levelText = this.add.text(6, 41, '', textStyle('tiny', '#fff080')).setDepth(11);
    this.goldText = this.add.text(60, 41, '', textStyle('tiny', '#ffd860')).setDepth(11);
    this.slotGrades = [];
    for (let i = 0; i < ITEMS.slots; i++) {
      this.slotGrades.push(this.add.text(4 + i * 17 + 7, 66 + 7, '', textStyle('small', '#ffffff')).setOrigin(0.5).setDepth(11));
    }
  }

  /** 레벨/경험치 바, 골드, 아이템 칸 (이름과 효과는 지도 화면에서) */
  private drawStatus(src: HudSource): void {
    const st = src.status;
    const g = this.bars;
    this.levelText.setText(`Lv ${st.level}`);
    this.goldText.setText(`${st.gold} G`);
    g.fillStyle(0x000000, 0.6).fillRect(4, 52, 52, 5);
    g.fillStyle(0xfff080, 1).fillRect(5, 53, Math.round(50 * Math.min(1, st.xp / Math.max(1, st.xpNext))), 3);
    for (let i = 0; i < ITEMS.slots; i++) {
      const x = 4 + i * 17;
      const y = 66;
      const it = st.items[i];
      g.fillStyle(0x000000, 0.6).fillRect(x, y, 14, 14);
      if (it) {
        const color = Phaser.Display.Color.HexStringToColor(ITEMS.gradeColors[it.grade]).color;
        g.lineStyle(1, color, 1).strokeRect(x + 0.5, y + 0.5, 13, 13);
        this.slotGrades[i]!.setText(it.grade).setColor(ITEMS.gradeColors[it.grade]);
      } else {
        g.lineStyle(1, 0x50486a, 1).strokeRect(x + 0.5, y + 0.5, 13, 13);
        this.slotGrades[i]!.setText('');
      }
    }
  }

  /** 체력 바, 마나/쿨타임/차지 바 */
  private drawBars(src: HudSource): void {
    const c = src.combat;
    const g = this.bars;
    g.clear();
    const w = 90;
    const ratio = Math.max(0, c.hp / c.stats.maxHp);
    g.fillStyle(0x000000, 0.6).fillRect(4, 4, w + 4, 8);
    g.fillStyle(0x3a1020, 1).fillRect(6, 6, w, 4);
    g.fillStyle(ratio > 0.25 ? 0xe04858 : 0xff2030, 1).fillRect(6, 6, Math.round(w * ratio), 4);
    this.hpText.setText(`${Math.ceil(c.hp)} / ${c.stats.maxHp}`);
    const sk = c.role.skill;
    let bar = 0;
    let color = 0x7fa8ff;
    let label = '';
    if (sk.kind === 'explosion') {
      bar = c.mana / c.role.maxMana;
      label = `마나 ${Math.floor(c.mana)}`;
    } else if (sk.kind === 'chargeShot') {
      bar = c.charge > 0 ? c.charge : c.skillCooldown <= 0 ? 1 : 0;
      color = c.charge > 0 ? 0xffd060 : 0x80d080;
      label = c.charge > 0 ? '차지' : c.skillCooldown <= 0 ? '차지샷 준비' : '';
    } else if (sk.kind === 'dash') {
      bar = c.skillCooldown <= 0 ? 1 : 1 - c.skillCooldown / (sk.cooldown * c.stats.skillCooldown);
      color = bar >= 1 ? 0x80d080 : 0x507050;
      label = bar >= 1 ? '대시 준비' : '대시';
    } else {
      bar = c.blocking ? 1 : 0;
      color = 0xd0d0e0;
      label = c.blocking ? '막는 중' : '방패 (C/K)';
    }
    g.fillStyle(0x000000, 0.6).fillRect(4, 24, 50, 6);
    g.fillStyle(color, 1).fillRect(5, 25, Math.round(48 * Math.max(0, Math.min(1, bar))), 4);
    this.skillText.setText(label);
  }

  private source(): HudSource | null {
    return (this.registry.get(RegistryKey.hudSource) as HudSource | undefined) ?? null;
  }

  override update(_t: number, deltaMs: number): void {
    const input = this.controls.update(deltaMs / 1000);
    const src = this.source();
    if (this.notice.visible) {
      const left = this.noticeUntil - this.time.now;
      if (left <= 0) this.notice.setVisible(false);
      else if (left < 400) this.notice.setAlpha(left / 400);
    }
    if (!src) return;
    this.drawBars(src);
    this.drawStatus(src);
    this.drawBossBar(src);
    this.drawTimer(src);
    this.sketch.setShown(input.mapHeld, src);
    this.sketch.update(src);
    this.floorLabel.setText(`${src.label}\n지도: Tab/M 누르기` + (DEBUG.enabled ? `\nseed ${src.floorData.seed}` : ''));
  }
}
