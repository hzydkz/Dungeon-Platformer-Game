import Phaser from 'phaser';
import { DISPLAY } from '../config/display';
import { MAP } from '../config/map';
import type { GeneratedFloor } from '../core/generation/floor';
import type { Exploration } from '../core/map/exploration';
import { mapMarkers, type MapMarker, type MarkerInput } from '../core/map/markers';
import { Tile, getTile, isSolidTile } from '../core/tiles';
import { baseOffset, onResize } from './layout';
import { textStyle } from './text';
import { ITEMS } from '../config/items';
import { itemDef, itemText, type ItemInstance } from '../data/items';

export interface SketchSource {
  readonly floorData: GeneratedFloor;
  readonly exploration: Exploration;
  readonly label: string;
  /** 가진 아이템, 레벨, 골드 (지도 아래쪽/제목 줄에 표시) */
  readonly status: { readonly items: readonly ItemInstance[]; readonly level: number; readonly gold: number };
  mapInput(): MarkerInput;
}

const TEX_KEY = 'map_terrain';

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * 약도 (기획서 6장 + 기획자 요청): 평소에는 숨겨 두고 Tab/M/View로 펼친다.
 * 공개된 방의 실제 지형을 양피지에 잉크로 그린 듯 표시하고, 보스/포탈/상자/제단/현재 위치를 표식과 이름으로 보여 준다.
 */
export class SketchMap {
  private readonly root: Phaser.GameObjects.Container;
  private readonly terrain: Phaser.GameObjects.Image;
  private readonly icons: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly labelLayer: Phaser.GameObjects.Container;
  private refreshAt = 0;
  /** 지형 이미지 배치 (화면 px) */
  private ox = 0;
  private oy = 0;
  private scale = 1;
  /** 지도에 담는 타일 범위 (방이 있는 영역) */
  private cropX = 0;
  private cropY = 0;
  private lastFloor: GeneratedFloor | null = null;
  private readonly status: Phaser.GameObjects.Text;
  private readonly itemSlots: { box: Phaser.GameObjects.Rectangle; grade: Phaser.GameObjects.Text; name: Phaser.GameObjects.Text; desc: Phaser.GameObjects.Text }[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    const p = MAP.panel;
    const c = MAP.colors;
    // 화면이 기준보다 넓어도 덮이도록 크게 (컨테이너는 기준 배치를 화면 가운데에 둔다)
    const dim = scene.add.rectangle(-DISPLAY.width, -DISPLAY.height, DISPLAY.width * 3, DISPLAY.height * 3, 0x000000, 0.55).setOrigin(0, 0);
    const paper = scene.add.graphics();
    paper.fillStyle(Phaser.Display.Color.HexStringToColor(c.paper).color, 1).fillRect(p.x, p.y, p.width, p.height);
    paper.fillStyle(Phaser.Display.Color.HexStringToColor(c.paperDark).color, 1);
    // 가장자리를 조금 바랜 종이처럼
    paper.fillRect(p.x, p.y, p.width, 3).fillRect(p.x, p.y + p.height - 3, p.width, 3).fillRect(p.x, p.y, 3, p.height).fillRect(p.x + p.width - 3, p.y, 3, p.height);
    paper.lineStyle(2, c.frame, 1).strokeRect(p.x - 1, p.y - 1, p.width + 2, p.height + 2);
    paper.lineStyle(1, c.frame, 0.6).strokeRect(p.x + 5, p.y + 5, p.width - 10, p.height - 10);
    this.title = scene.add.text(DISPLAY.width / 2, p.y + 7, '', textStyle('small', c.ink)).setOrigin(0.5, 0);
    this.terrain = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0);
    this.icons = scene.add.graphics();
    this.labelLayer = scene.add.container(0, 0);
    const legend = scene.add
      .text(p.x + 10, p.y + p.height - 14, '● 현재 위치   ◆ 보스   ▣ 상점   ● 포탈(발견하면)   ■ 상자   ▲ 제단', textStyle('tiny', c.ink))
      .setOrigin(0, 0);
    const close = scene.add.text(p.x + p.width - 10, p.y + p.height - 14, 'Tab · M / View · Y 떼면 닫힘 · 이동 느려짐', textStyle('tiny', c.unvisited)).setOrigin(1, 0);
    this.status = scene.add.text(p.x + p.width - 10, p.y + 7, '', textStyle('small', c.ink)).setOrigin(1, 0);
    // 아이템 칸: 3열 (등급 상자, 이름, 효과)
    const colW = Math.floor((p.width - 20) / ITEMS.slots);
    const iy = p.y + MAP.itemsTop;
    const slotObjs: Phaser.GameObjects.GameObject[] = [];
    for (let i = 0; i < ITEMS.slots; i++) {
      const x = p.x + 10 + i * colW;
      const box = scene.add.rectangle(x, iy + 2, 14, 14, 0x2a2018, 1).setOrigin(0, 0);
      const grade = scene.add.text(x + 7, iy + 9, '', textStyle('small', '#ffffff')).setOrigin(0.5);
      const name = scene.add.text(x + 18, iy, '', textStyle('tiny', c.ink));
      const desc = scene.add.text(x + 18, iy + 10, '', textStyle('tiny', c.unvisited));
      this.itemSlots.push({ box, grade, name, desc });
      slotObjs.push(box, grade, name, desc);
    }
    this.root = scene.add.container(0, 0, [dim, paper, this.title, this.status, this.terrain, this.icons, this.labelLayer, ...slotObjs, legend, close]).setDepth(40).setVisible(false);
    onResize(scene, () => {
      const o = baseOffset(scene);
      this.root.setPosition(o.x, o.y);
    });
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /** 누르고 있는 동안 표시 (기획자 요청: Tab을 떼면 닫힘) */
  setShown(shown: boolean, src: SketchSource): void {
    if (shown === this.root.visible) return;
    this.root.setVisible(shown);
    if (shown) this.refresh(src, true);
  }

  hide(): void {
    this.root.setVisible(false);
  }

  /** 지형은 0.3초마다, 표식은 매 프레임 갱신 */
  update(src: SketchSource): void {
    if (!this.root.visible) return;
    const now = this.scene.time.now;
    if (now >= this.refreshAt || src.floorData !== this.lastFloor) this.refresh(src, true);
    else this.drawMarkers(src);
  }

  private refresh(src: SketchSource, terrain: boolean): void {
    this.refreshAt = this.scene.time.now + 300;
    this.title.setText(`${src.label} — 지도`);
    this.drawStatus(src);
    if (terrain) this.drawTerrain(src);
    this.drawMarkers(src);
  }

  private drawStatus(src: SketchSource): void {
    const st = src.status;
    this.status.setText(`Lv ${st.level}   ${st.gold} G`);
    this.itemSlots.forEach((slot, i) => {
      const it = st.items[i];
      if (!it) {
        slot.box.setStrokeStyle(1, MAP.colors.frame, 0.5).setFillStyle(0x000000, 0);
        slot.grade.setText('');
        slot.name.setText('빈 칸');
        slot.desc.setText('');
        return;
      }
      const color = ITEMS.gradeColors[it.grade];
      slot.box.setStrokeStyle(1, Phaser.Display.Color.HexStringToColor(color).color, 1).setFillStyle(0x2a2018, 1);
      slot.grade.setText(it.grade).setColor(color);
      slot.name.setText(itemDef(it.id).name);
      slot.desc.setText(itemText(it));
    });
  }

  /** 방이 있는 영역만 잘라 정수배로 최대한 크게 */
  private layoutFor(f: GeneratedFloor): { x: number; y: number; w: number; h: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of f.rooms) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  private drawTerrain(src: SketchSource): void {
    const f = src.floorData;
    const ex = src.exploration;
    const box = this.layoutFor(f);
    this.cropX = box.x;
    this.cropY = box.y;
    const t = MAP.terrain;
    this.scale = Math.max(1, Math.floor(Math.min(t.maxWidth / box.w, t.maxHeight / box.h)));
    this.ox = Math.round((DISPLAY.width - box.w * this.scale) / 2);
    this.oy = Math.round(MAP.panel.y + 22 + (t.maxHeight - box.h * this.scale) / 2);

    const texMgr = this.scene.textures;
    if (texMgr.exists(TEX_KEY)) {
      const old = texMgr.get(TEX_KEY);
      if (old.source[0]!.width !== box.w || old.source[0]!.height !== box.h) texMgr.remove(TEX_KEY);
    }
    const tex = (texMgr.exists(TEX_KEY) ? texMgr.get(TEX_KEY) : texMgr.createCanvas(TEX_KEY, box.w, box.h)) as Phaser.Textures.CanvasTexture;
    const ctx = tex.getContext();
    const img = ctx.createImageData(box.w, box.h);
    const c = MAP.colors;
    const ink = hexToRgb(c.ink);
    const faint = hexToRgb(c.unvisited);
    const rock = hexToRgb(c.rock);
    const plat = hexToRgb(c.platform);
    const spike = hexToRgb(c.spike);
    const g = f.grid;
    const solid = (x: number, y: number) => isSolidTile(getTile(g, x, y));
    for (const room of f.rooms) {
      if (!ex.revealed.has(room.index)) continue;
      const visited = ex.visited.has(room.index);
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          const tile = getTile(g, x, y);
          let col: [number, number, number] | null = null;
          if (isSolidTile(tile)) {
            // 빈칸과 맞닿은 벽만 잉크 선, 안쪽 바위는 연하게 (비밀 벽은 일반 벽과 같게)
            const edge = !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
            col = edge ? (visited ? ink : faint) : rock;
          } else if (tile === Tile.OneWay) col = plat;
          else if (tile === Tile.Spike) col = spike;
          if (!col) continue;
          const i = ((y - box.y) * box.w + (x - box.x)) * 4;
          img.data[i] = col[0];
          img.data[i + 1] = col[1];
          img.data[i + 2] = col[2];
          img.data[i + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
    this.terrain.setTexture(TEX_KEY).setPosition(this.ox, this.oy).setScale(this.scale);
    this.lastFloor = f;
  }

  private toScreen(tx: number, ty: number): [number, number] {
    return [this.ox + (tx - this.cropX + 0.5) * this.scale, this.oy + (ty - this.cropY + 0.5) * this.scale];
  }

  private drawMarkers(src: SketchSource): void {
    const g = this.icons;
    g.clear();
    const f = src.floorData;
    const c = MAP.colors;
    // 아직 들어가 보지 않은 보스방: 점선 테두리
    const br = f.rooms[f.boss.room]!;
    if (!src.exploration.revealed.has(br.index)) {
      const [x0, y0] = this.toScreen(br.x, br.y);
      const w = br.w * this.scale;
      const h = br.h * this.scale;
      g.fillStyle(c.boss, 0.8);
      for (let x = 0; x < w; x += 6) {
        g.fillRect(x0 + x, y0, 3, 1).fillRect(x0 + x, y0 + h - 1, 3, 1);
      }
      for (let y = 0; y < h; y += 6) {
        g.fillRect(x0, y0 + y, 1, 3).fillRect(x0 + w - 1, y0 + y, 1, 3);
      }
    }

    const markers = mapMarkers(src.mapInput());
    const blink = Math.floor(this.scene.time.now / 300) % 2 === 0;
    let li = 0;
    const label = (m: MapMarker, x: number, y: number, color: string, below = false, above = false) => {
      let t = this.labels[li];
      if (!t) {
        t = this.scene.add.text(0, 0, '', textStyle('tiny', color, { stroke: MAP.colors.paper, strokeThickness: 3 }));
        this.labels.push(t);
        this.labelLayer.add(t);
      }
      // 현재 위치 이름은 아래쪽에 두어 같은 자리의 다른 표식(포탈 등) 이름을 가리지 않는다
      // 상점 이름은 위쪽: 시작 지점 근처에 있을 때 현재 위치 이름과 겹치지 않게
      if (above) t.setText(m.label).setColor(color).setPosition(Math.round(x - t.width / 2), Math.round(y - 17)).setVisible(true);
      else if (below) t.setText(m.label).setColor(color).setPosition(Math.round(x - t.width / 2), Math.round(y + 7)).setVisible(true);
      else t.setText(m.label).setColor(color).setPosition(Math.round(x + 6), Math.round(y - 5)).setVisible(true);
      li++;
    };
    const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
    for (const m of markers) {
      const [x, y] = this.toScreen(m.x, m.y);
      const a = m.spent ? 0.45 : 1;
      switch (m.kind) {
        case 'boss':
          g.fillStyle(c.boss, a).fillTriangle(x, y - 6, x + 6, y, x, y + 6).fillTriangle(x, y - 6, x - 6, y, x, y + 6);
          g.lineStyle(1, 0xffffff, a).lineBetween(x - 2, y - 2, x + 2, y + 2).lineBetween(x - 2, y + 2, x + 2, y - 2);
          label(m, x + 2, y, hex(c.boss));
          break;
        case 'entrance':
          g.lineStyle(2, c.portalBlue, 1).strokeCircle(x, y, 4);
          label(m, x, y, hex(c.portalBlue));
          break;
        case 'exit':
          g.fillStyle(c.portalBlue, 1).fillCircle(x, y, 4);
          g.lineStyle(1, 0xffffff, 1).strokeCircle(x, y, 4);
          label(m, x, y, hex(c.portalBlue));
          break;
        case 'red':
          g.fillStyle(c.portalRed, 1).fillCircle(x, y, 4);
          g.lineStyle(1, 0xffffff, 1).strokeCircle(x, y, 4);
          label(m, x, y, hex(c.portalRed));
          break;
        case 'chest':
          if (m.spent) g.lineStyle(1, c.chest, 0.7).strokeRect(x - 2, y - 2, 4, 4);
          else g.fillStyle(c.chest, 1).fillRect(x - 2, y - 2, 4, 4);
          break;
        case 'altar':
          g.fillStyle(c.altar, a).fillTriangle(x, y - 4, x + 4, y + 3, x - 4, y + 3);
          label(m, x, y, hex(c.altar));
          break;
        case 'shop':
          g.fillStyle(c.shop, 1).fillRect(x - 4, y - 4, 8, 8);
          g.lineStyle(1, 0xffffff, 1).strokeRect(x - 4, y - 4, 8, 8);
          label(m, x, y, hex(c.shop), false, true);
          break;
        case 'player':
          // 고리 모양: 같은 자리의 포탈 표식이 가려지지 않게
          g.lineStyle(2, c.player, blink ? 1 : 0.5).strokeCircle(x, y, 7);
          label(m, x, y, hex(c.player), true);
          break;
      }
    }
    for (let i = li; i < this.labels.length; i++) this.labels[i]!.setVisible(false);
  }
}
