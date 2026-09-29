import Phaser from 'phaser';
import { DEBUG } from '../config/debug';
import { DISPLAY } from '../config/display';
import { MAP } from '../config/map';
import { ROOM } from '../config/generation';
import { Controls } from '../input/Controls';
import { textStyle } from '../ui/text';
import type { HudSource } from './FloorScene';
import { RegistryKey, SceneKey } from './keys';

/**
 * HUD: 우상단 미니맵, 지도 전체 보기 오버레이, 층 표시 (기획서 6장).
 * 층 씬과 별도로 돌아서 카메라 흔들림 등의 영향을 받지 않는다.
 */
export class HudScene extends Phaser.Scene {
  private controls!: Controls;
  private mini!: Phaser.GameObjects.Graphics;
  private full!: Phaser.GameObjects.Graphics;
  private fullTitle!: Phaser.GameObjects.Text;
  private floorLabel!: Phaser.GameObjects.Text;
  private showFull = false;
  private bars!: Phaser.GameObjects.Graphics;
  private notice!: Phaser.GameObjects.Text;
  private noticeUntil = 0;
  private bossName!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private skillText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKey.Hud);
  }

  create(): void {
    this.controls = new Controls(this);
    this.mini = this.add.graphics().setDepth(10);
    this.full = this.add.graphics().setDepth(20).setVisible(false);
    this.fullTitle = this.add
      .text(DISPLAY.width / 2, 8, '', textStyle('large', '#e0e0ff'))
      .setOrigin(0.5, 0)
      .setDepth(21)
      .setVisible(false);
    this.floorLabel = this.add
      .text(DISPLAY.width - MAP.minimap.margin, MAP.minimap.margin + MAP.minimap.maxHeight + 3, '', textStyle('tiny', '#c8c0e8', { align: 'right' }))
      .setOrigin(1, 0)
      .setDepth(10);
    this.createBars();
    this.notice = this.add
      .text(DISPLAY.width / 2, 40, '', textStyle('small', '#ffffff', { align: 'center', stroke: '#000000', strokeThickness: 3 }))
      .setOrigin(0.5, 0)
      .setDepth(30)
      .setVisible(false);
    this.bossName = this.add.text(DISPLAY.width / 2, DISPLAY.height - 26, '', textStyle('small', '#e0c8ff')).setOrigin(0.5, 0).setDepth(10);
  }

  /** 화면 상단 중앙 알림 (기획서 7.2: 빨간 포탈 알림 3초 등) */
  notify(text: string, seconds: number, color = '#ffffff'): void {
    this.notice.setText(text).setColor(color).setVisible(true).setAlpha(1);
    this.noticeUntil = this.time.now + seconds * 1000;
  }

  private drawBossBar(src: HudSource): void {
    const b = src.bossBar;
    this.bossName.setVisible(!!b);
    if (!b) return;
    const g = this.bars;
    const w = 220;
    const x = (DISPLAY.width - w) / 2;
    const y = DISPLAY.height - 12;
    g.fillStyle(0x000000, 0.7).fillRect(x - 2, y - 2, w + 4, 8);
    g.fillStyle(0x301040, 1).fillRect(x, y, w, 4);
    g.fillStyle(0xa050e0, 1).fillRect(x, y, Math.round(w * Math.max(0, b.hp / b.maxHp)), 4);
    this.bossName.setText(b.name);
  }

  private createBars(): void {
    this.bars = this.add.graphics().setDepth(10);
    this.hpText = this.add.text(6, 13, '', textStyle('tiny', '#ffffff')).setDepth(11);
    this.skillText = this.add.text(6, 30, '', textStyle('tiny', '#c8c0e8')).setDepth(11);
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

  /** 지도를 사각형 영역 안에 맞춰 그린다 */
  private drawMap(g: Phaser.GameObjects.Graphics, src: HudSource, x: number, y: number, maxW: number, maxH: number): void {
    const L = src.floorData.layout;
    const aspect = ROOM.heightTiles / ROOM.widthTiles;
    let cw = Math.floor(maxW / L.gridW);
    let ch = Math.max(2, Math.round(cw * aspect));
    if (ch * L.gridH > maxH) {
      ch = Math.floor(maxH / L.gridH);
      cw = Math.max(2, Math.round(ch / aspect));
    }
    const w = cw * L.gridW;
    const h = ch * L.gridH;
    const ox = x + Math.floor((maxW - w) / 2);
    const oy = y + Math.floor((maxH - h) / 2);
    const c = MAP.colors;
    g.fillStyle(c.background, 0.75).fillRect(x - 2, y - 2, maxW + 4, maxH + 4);
    g.lineStyle(1, c.border, 0.8).strokeRect(x - 2, y - 2, maxW + 4, maxH + 4);
    const ex = src.exploration;
    const gap = cw >= 6 ? 1 : 0;

    for (const room of L.rooms) {
      if (!ex.isShown(room.index, MAP.showBossFromStart)) continue;
      const xs = room.cells.map(([cx]) => cx);
      const ys = room.cells.map(([, cy]) => cy);
      const rx = ox + Math.min(...xs) * cw;
      const ry = oy + Math.min(...ys) * ch;
      const rw = (Math.max(...xs) - Math.min(...xs) + 1) * cw;
      const rh = (Math.max(...ys) - Math.min(...ys) + 1) * ch;
      let color: number = ex.visited.has(room.index) ? c.visited : c.revealed;
      if (room.index === src.currentRoom) color = c.current;
      g.fillStyle(color, 1).fillRect(rx + gap, ry + gap, rw - gap * 2, rh - gap * 2);
      if (room.index === L.boss) g.lineStyle(1, c.boss, 1).strokeRect(rx + gap, ry + gap, rw - gap * 2, rh - gap * 2);
    }
    // 연결 (방문한 방 기준)
    g.fillStyle(c.link, 1);
    for (const l of L.links) {
      if (!ex.isLinkShown(l.a, l.b)) continue;
      const ra = L.rooms[l.a]!;
      const rb = L.rooms[l.b]!;
      const cellA = ra.cells.find(([ax, ay]) => rb.cells.some(([bx, by]) => Math.abs(bx - ax) + Math.abs(by - ay) === 1)) ?? ra.cells[0]!;
      const [ax, ay] = cellA;
      const mx = ox + ax * cw + cw / 2;
      const my = oy + ay * ch + ch / 2;
      if (l.dir === 'right') g.fillRect(ox + (ax + 1) * cw - 1, my - 1, 2, 2);
      if (l.dir === 'left') g.fillRect(ox + ax * cw - 1, my - 1, 2, 2);
      if (l.dir === 'down') g.fillRect(mx - 1, oy + (ay + 1) * ch - 1, 2, 2);
      if (l.dir === 'up') g.fillRect(mx - 1, oy + ay * ch - 1, 2, 2);
    }
    // 포탈 (설정에 따라 발견 후 표시)
    if (MAP.showPortalsAfterDiscovery) {
      const f = src.floorData;
      const dot = (p: { x: number; y: number } | null, color: number) => {
        if (!p) return;
        g.fillStyle(color, 1).fillRect(ox + (p.x / ROOM.widthTiles) * cw - 1, oy + (p.y / ROOM.heightTiles) * ch - 1, 3, 3);
      };
      if (ex.discoveredPortals.has('exit')) dot(f.exitPortal, c.portalBlue);
      if (ex.discoveredPortals.has('red')) dot(f.redPortal, c.portalRed);
    }
    // 현재 위치
    const px = ox + (src.playerTile.x / ROOM.widthTiles) * cw;
    const py = oy + (src.playerTile.y / ROOM.heightTiles) * ch;
    g.fillStyle(c.player, 1).fillRect(Math.round(px) - 1, Math.round(py) - 1, 2, 2);
  }

  override update(_t: number, deltaMs: number): void {
    const input = this.controls.update(deltaMs / 1000);
    const src = this.source();
    this.mini.clear();
    this.full.clear();
    if (this.notice.visible) {
      const left = this.noticeUntil - this.time.now;
      if (left <= 0) this.notice.setVisible(false);
      else if (left < 400) this.notice.setAlpha(left / 400);
    }
    if (!src) return;
    this.drawBars(src);
    this.drawBossBar(src);
    if (input.mapPressed) this.showFull = !this.showFull;

    const m = MAP.minimap;
    this.drawMap(this.mini, src, DISPLAY.width - m.margin - m.maxWidth, m.margin, m.maxWidth, m.maxHeight);
    this.floorLabel.setText(src.label + (DEBUG.enabled ? `\nseed ${src.floorData.seed}` : ''));

    this.full.setVisible(this.showFull);
    this.fullTitle.setVisible(this.showFull);
    if (this.showFull) {
      const f = MAP.full;
      this.full.fillStyle(0x000000, 0.6).fillRect(0, 0, DISPLAY.width, DISPLAY.height);
      this.drawMap(this.full, src, (DISPLAY.width - f.maxWidth) / 2, 26, f.maxWidth, f.maxHeight);
      this.fullTitle.setText(`${src.label} — 지도 (Tab/M)`);
    }
  }
}
