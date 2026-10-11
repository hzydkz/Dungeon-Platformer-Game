import Phaser from 'phaser';
import { DISPLAY } from '../config/display';
import { ITEMS, SHOP } from '../config/items';
import { replaceItem, tryAddItem } from '../core/items';
import type { RunState } from '../core/run';
import { itemDef, itemText, type ItemInstance } from '../data/items';
import { Controls, type InputFrame } from '../input/Controls';
import { centerBaseLayout, fullScreenRect } from '../ui/layout';
import { textStyle } from '../ui/text';
import { RegistryKey, SceneKey } from './keys';

/** 상점 진열 (층 씬이 가지고 있고, 이 씬이 팔린 표시와 남은 물약을 바꾼다) */
export interface ShopStock {
  readonly items: { readonly item: ItemInstance; readonly price: number; sold: boolean }[];
  readonly potionPrice: number;
  potionsLeft: number;
}

export type ItemSceneData =
  /** 보스 보상: 선택지 중 하나 */
  | { mode: 'pick'; title: string; choices: ItemInstance[]; resume: string }
  /** 아이템 하나 받기 (제단). 칸이 가득 차면 교체 선택 */
  | { mode: 'give'; title: string; item: ItemInstance; resume: string }
  | { mode: 'shop'; stock: ShopStock; resume: string };

/** 재개된 씬이 아이템/골드/회복 반영을 위해 구현한다 */
export interface ItemReceiver {
  refreshStats(): void;
  onItemMessage(text: string, color: string): void;
  /** 최대 체력 대비 회복 */
  healRatio(ratio: number): void;
  hpFull(): boolean;
}

type View = 'pick' | 'shop' | 'swap';

interface ShopRow {
  label: string;
  detail: string;
  price: number | null;
  item: ItemInstance | null;
  disabled: boolean;
}

/** 등급 표시 상자 (색 테두리 + 글자) */
function gradeBadge(scene: Phaser.Scene, x: number, y: number, item: ItemInstance, size = 14): Phaser.GameObjects.GameObject[] {
  const color = ITEMS.gradeColors[item.grade];
  const c = Phaser.Display.Color.HexStringToColor(color).color;
  const box = scene.add.rectangle(x, y, size, size, 0x0c0a14, 1).setStrokeStyle(1, c).setOrigin(0, 0);
  const t = scene.add.text(x + size / 2, y + size / 2, item.grade, textStyle(size >= 18 ? 'large' : 'small', color)).setOrigin(0.5);
  return [box, t];
}

/**
 * 아이템 화면: 보스 보상 선택, 제단, 상점, 그리고 칸이 가득 찼을 때 어느 아이템을 뺄지 고르는 교체 화면.
 * 이 씬이 떠 있는 동안 층 씬은 멈춘다(탈출 타이머 포함).
 */
export class ItemScene extends Phaser.Scene {
  private controls!: Controls;
  private data_!: ItemSceneData;
  private view: View = 'pick';
  private selected = 0;
  private readyAt = 0;
  private layer!: Phaser.GameObjects.Container;
  /** 교체 대기 중인 새 아이템과, 확정/취소 시 할 일 */
  private pending: { item: ItemInstance; onDone: (placed: boolean) => void; back: View | null } | null = null;
  private flash: Phaser.GameObjects.Text | null = null;

  constructor() {
    super(SceneKey.Item);
  }

  init(data: ItemSceneData): void {
    this.data_ = data;
    this.selected = 0;
    this.pending = null;
    this.view = data.mode === 'shop' ? 'shop' : 'pick';
  }

  private get run(): RunState {
    return this.registry.get(RegistryKey.run) as RunState;
  }

  private get receiver(): ItemReceiver {
    return this.scene.get(this.data_.resume) as unknown as ItemReceiver;
  }

  create(): void {
    this.controls = new Controls(this);
    // create 시점에는 씬 시계가 아직 갱신 전이라 첫 update에서 정한다
    this.readyAt = -1;
    fullScreenRect(this, 0x000000, 0.9);
    centerBaseLayout(this);
    this.layer = this.add.container(0, 0);
    this.flash = null;
    if (this.data_.mode === 'give') {
      // 제단: 빈 칸이 있으면 바로 넣고 끝
      const { item, title } = this.data_;
      if (tryAddItem(this.run.items, item)) {
        this.finishWith(`${title}: ${item.grade}급 ${itemDef(item.id).name}`, ITEMS.gradeColors[item.grade]);
        return;
      }
      this.startSwap(item, null, (placed) => {
        const msg = placed ? `${title}: ${item.grade}급 ${itemDef(item.id).name}` : `${itemDef(item.id).name}을(를) 버렸다`;
        this.finishWith(msg, placed ? ITEMS.gradeColors[item.grade] : '#a0a0b0');
      });
      return;
    }
    this.render();
  }

  // ---------- 그리기 ----------

  private render(): void {
    this.layer.removeAll(true);
    if (this.view === 'pick') this.renderPick();
    else if (this.view === 'shop') this.renderShop();
    else this.renderSwap();
  }

  private add_<T extends Phaser.GameObjects.GameObject>(...objs: T[]): void {
    this.layer.add(objs);
  }

  private inventoryLine(y: number): void {
    const items = this.run.items;
    const label = this.add.text(12, y, `보유 ${items.length}/${ITEMS.slots}`, textStyle('tiny', '#9890c0'));
    this.add_(label);
    let x = 12 + label.width + 8;
    for (const it of items) {
      this.add_(...gradeBadge(this, x, y - 2, it, 12));
      const t = this.add.text(x + 15, y, itemDef(it.id).name, textStyle('tiny', '#d8d0f0'));
      this.add_(t);
      x += 15 + t.width + 10;
    }
  }

  private renderPick(): void {
    if (this.data_.mode !== 'pick') return;
    const choices = this.data_.choices;
    this.add_(this.add.text(DISPLAY.width / 2, 18, this.data_.title, textStyle('large', '#ffe8a0')).setOrigin(0.5, 0));
    const n = choices.length;
    const w = Math.min(130, Math.floor((DISPLAY.width - 16 - (n - 1) * 8) / n));
    const total = n * w + (n - 1) * 8;
    const x0 = (DISPLAY.width - total) / 2;
    choices.forEach((it, i) => {
      const x = x0 + i * (w + 8);
      const on = i === this.selected;
      const color = ITEMS.gradeColors[it.grade];
      const f = this.add.rectangle(x, 50, w, 130, on ? 0x2a2238 : 0x15121f, 1).setOrigin(0, 0);
      f.setStrokeStyle(on ? 2 : 1, on ? Phaser.Display.Color.HexStringToColor(color).color : 0x3a3450);
      this.add_(f, ...gradeBadge(this, x + w / 2 - 11, 60, it, 22));
      this.add_(this.add.text(x + w / 2, 90, `${it.grade}급`, textStyle('tiny', color)).setOrigin(0.5, 0));
      this.add_(this.add.text(x + w / 2, 104, itemDef(it.id).name, textStyle('small', '#ffffff', { align: 'center', wordWrap: { width: w - 10, useAdvancedWrap: true } })).setOrigin(0.5, 0));
      this.add_(this.add.text(x + w / 2, 134, itemText(it), textStyle('tiny', '#d0c8f0', { align: 'center', wordWrap: { width: w - 12, useAdvancedWrap: true } })).setOrigin(0.5, 0));
    });
    this.inventoryLine(196);
    this.add_(this.add.text(DISPLAY.width / 2, 236, '←→ 선택    Enter / A 결정', textStyle('small', '#9890c0')).setOrigin(0.5, 0));
  }

  private shopRows(): ShopRow[] {
    if (this.data_.mode !== 'shop') return [];
    const st = this.data_.stock;
    const rows: ShopRow[] = st.items.map((s) => ({
      label: s.sold ? `${itemDef(s.item.id).name} (팔림)` : itemDef(s.item.id).name,
      detail: itemText(s.item),
      price: s.sold ? null : s.price,
      item: s.item,
      disabled: s.sold,
    }));
    rows.push({
      label: `회복 물약 (남은 ${st.potionsLeft}개)`,
      detail: `최대 체력의 ${Math.round(SHOP.potion.healRatio * 100)}% 회복`,
      price: st.potionsLeft > 0 ? st.potionPrice : null,
      item: null,
      disabled: st.potionsLeft <= 0,
    });
    rows.push({ label: '나가기', detail: '', price: null, item: null, disabled: false });
    return rows;
  }

  private renderShop(): void {
    this.add_(this.add.text(DISPLAY.width / 2, 12, '상점', textStyle('large', '#ffe8a0')).setOrigin(0.5, 0));
    this.add_(this.add.text(DISPLAY.width - 16, 16, `${this.run.gold} G`, textStyle('small', '#ffd860')).setOrigin(1, 0));
    const rows = this.shopRows();
    rows.forEach((r, i) => {
      const y = 40 + i * 26;
      const on = i === this.selected;
      const f = this.add.rectangle(16, y, DISPLAY.width - 32, 23, on ? 0x2a2238 : 0x15121f, 1).setOrigin(0, 0);
      f.setStrokeStyle(on ? 2 : 1, on ? 0xffe8a0 : 0x3a3450);
      this.add_(f);
      const textColor = r.disabled ? '#6a6488' : '#ffffff';
      let x = 22;
      if (r.item) {
        this.add_(...gradeBadge(this, x, y + 4, r.item, 14));
        x += 20;
      }
      this.add_(this.add.text(x, y + 2, r.label, textStyle('small', textColor)));
      if (r.detail) this.add_(this.add.text(x, y + 13, r.detail, textStyle('tiny', r.disabled ? '#5a5478' : '#c8c0e8')));
      if (r.price !== null) {
        const afford = this.run.gold >= r.price;
        this.add_(this.add.text(DISPLAY.width - 24, y + 6, `${r.price} G`, textStyle('small', afford ? '#ffd860' : '#a05050')).setOrigin(1, 0));
      }
    });
    this.inventoryLine(40 + rows.length * 26 + 6);
    this.add_(this.add.text(DISPLAY.width / 2, 252, '↑↓ 선택    Enter / A 구매    Esc / B 나가기', textStyle('tiny', '#9890c0')).setOrigin(0.5, 0));
    if (this.flash) this.layer.add(this.flash);
  }

  private renderSwap(): void {
    const p = this.pending;
    if (!p) return;
    this.add_(this.add.text(DISPLAY.width / 2, 16, '아이템 칸이 가득 찼습니다', textStyle('large', '#ffb070')).setOrigin(0.5, 0));
    this.add_(this.add.text(DISPLAY.width / 2, 40, '어떤 아이템을 빼고 새 아이템을 넣을까요?', textStyle('small', '#d8d0f0')).setOrigin(0.5, 0));
    // 새 아이템
    const ny = 60;
    this.add_(this.add.rectangle(60, ny, DISPLAY.width - 120, 30, 0x1c2a1c, 1).setOrigin(0, 0).setStrokeStyle(1, 0x60a060));
    this.add_(this.add.text(68, ny + 9, '새 아이템', textStyle('tiny', '#90d090')));
    this.add_(...gradeBadge(this, 120, ny + 7, p.item, 16));
    this.add_(this.add.text(142, ny + 3, `${itemDef(p.item.id).name}`, textStyle('small', '#ffffff')));
    this.add_(this.add.text(142, ny + 16, itemText(p.item), textStyle('tiny', '#c8f0c8')));

    const items = this.run.items;
    const rows = items.length + 1;
    for (let i = 0; i < rows; i++) {
      const y = 104 + i * 28;
      const on = i === this.selected;
      const f = this.add.rectangle(60, y, DISPLAY.width - 120, 24, on ? 0x2a2238 : 0x15121f, 1).setOrigin(0, 0);
      f.setStrokeStyle(on ? 2 : 1, on ? 0xffe8a0 : 0x3a3450);
      this.add_(f);
      const it = items[i];
      if (it) {
        this.add_(this.add.text(68, y + 7, '빼기', textStyle('tiny', '#ff9090')));
        this.add_(...gradeBadge(this, 100, y + 5, it, 14));
        this.add_(this.add.text(120, y + 2, itemDef(it.id).name, textStyle('small', '#ffffff')));
        this.add_(this.add.text(120, y + 13, itemText(it), textStyle('tiny', '#c8c0e8')));
      } else {
        const label = this.data_.mode === 'shop' ? '사지 않기' : this.data_.mode === 'pick' ? '다른 보상 고르기' : '새 아이템 버리기';
        this.add_(this.add.text(DISPLAY.width / 2, y + 6, label, textStyle('small', '#c0b8e0')).setOrigin(0.5, 0));
      }
    }
    const cancelHint = p.back ? '    Esc / B 돌아가기' : '';
    this.add_(this.add.text(DISPLAY.width / 2, 240, `↑↓ 선택    Enter / A 결정${cancelHint}`, textStyle('small', '#9890c0')).setOrigin(0.5, 0));
  }

  private showFlash(text: string): void {
    this.flash?.destroy();
    this.flash = this.add.text(DISPLAY.width / 2, 228, text, textStyle('small', '#ff8080', { stroke: '#000000', strokeThickness: 2 })).setOrigin(0.5, 0);
    this.layer.add(this.flash);
    const f = this.flash;
    this.time.delayedCall(1200, () => {
      if (this.flash === f) {
        f.destroy();
        this.flash = null;
      }
    });
  }

  // ---------- 흐름 ----------

  /** 칸이 가득 찼을 때 교체 화면. onDone(true) = 넣음, false = 넣지 않음 */
  private startSwap(item: ItemInstance, back: View | null, onDone: (placed: boolean) => void): void {
    this.pending = { item, onDone, back };
    this.view = 'swap';
    this.selected = 0;
    this.render();
  }

  private finishWith(message: string, color: string): void {
    const target = this.receiver;
    this.scene.resume(this.data_.resume);
    target.refreshStats();
    if (message) target.onItemMessage(message, color);
    this.scene.stop();
  }

  private rowCount(): number {
    if (this.view === 'pick' && this.data_.mode === 'pick') return this.data_.choices.length;
    if (this.view === 'shop') return this.shopRows().length;
    if (this.view === 'swap') return this.run.items.length + 1;
    return 1;
  }

  override update(_t: number, dms: number): void {
    const input = this.controls.update(dms / 1000);
    if (this.readyAt < 0) this.readyAt = this.time.now + 400;
    if (this.time.now < this.readyAt) return;
    const n = this.rowCount();
    const dir = this.view === 'pick' ? input.menuX : input.menuY;
    if (dir !== 0 && n > 0) {
      this.selected = (this.selected + dir + n) % n;
      this.render();
    }
    if (input.cancelPressed) this.onCancel();
    else if (input.confirmPressed) this.onConfirm(input);
  }

  private onCancel(): void {
    if (this.view === 'shop') {
      this.finishWith('', '#ffffff');
    } else if (this.view === 'swap' && this.pending?.back) {
      const back = this.pending.back;
      this.pending = null;
      this.view = back;
      this.selected = 0;
      this.render();
    }
  }

  private onConfirm(_input: InputFrame): void {
    if (this.view === 'pick' && this.data_.mode === 'pick') {
      const item = this.data_.choices[this.selected]!;
      const title = this.data_.title;
      if (tryAddItem(this.run.items, item)) {
        this.finishWith(`${title}: ${item.grade}급 ${itemDef(item.id).name}`, ITEMS.gradeColors[item.grade]);
        return;
      }
      this.startSwap(item, 'pick', (placed) => {
        if (placed) this.finishWith(`${title}: ${item.grade}급 ${itemDef(item.id).name}`, ITEMS.gradeColors[item.grade]);
        else {
          this.pending = null;
          this.view = 'pick';
          this.render();
        }
      });
      return;
    }
    if (this.view === 'swap' && this.pending) {
      const p = this.pending;
      const slot = this.selected;
      if (slot < this.run.items.length) {
        replaceItem(this.run.items, slot, p.item);
        p.onDone(true);
      } else p.onDone(false);
      return;
    }
    if (this.view === 'shop' && this.data_.mode === 'shop') this.buy(this.data_.stock);
  }

  private buy(stock: ShopStock): void {
    const rows = this.shopRows();
    const r = rows[this.selected]!;
    if (this.selected === rows.length - 1) {
      this.finishWith('', '#ffffff');
      return;
    }
    if (r.disabled || r.price === null) return;
    if (this.run.gold < r.price) {
      this.showFlash('골드가 부족합니다');
      return;
    }
    const price = r.price;
    if (!r.item) {
      if (this.receiver.hpFull()) {
        this.showFlash('체력이 가득 차 있습니다');
        return;
      }
      this.run.gold -= price;
      stock.potionsLeft--;
      this.receiver.healRatio(SHOP.potion.healRatio);
      this.render();
      return;
    }
    const entry = stock.items[this.selected]!;
    const pay = () => {
      this.run.gold -= price;
      entry.sold = true;
      this.receiver.refreshStats();
    };
    if (tryAddItem(this.run.items, entry.item)) {
      pay();
      this.render();
      return;
    }
    const keepSelected = this.selected;
    this.startSwap(entry.item, 'shop', (placed) => {
      if (placed) pay();
      this.pending = null;
      this.view = 'shop';
      this.selected = keepSelected;
      this.render();
    });
  }
}
