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
    if (!src) return;
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
