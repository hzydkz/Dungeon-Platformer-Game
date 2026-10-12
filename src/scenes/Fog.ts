import Phaser from 'phaser';
import { VISION } from '../config/map';
import { DISPLAY } from '../config/display';
import type { Exploration } from '../core/map/exploration';
import { computeVisible } from '../core/map/vision';
import type { TileGrid } from '../core/tiles';

const TEX_KEY = 'fx_fog';

/**
 * 시야 안개 (기획자 요청). 타일 하나를 한 픽셀로 하는 캔버스를 타일 크기만큼 늘려(선형 보간) 층 전체를 덮는다.
 * 지금 보이는 칸은 투명, 본 적 있는 칸은 반쯤 어둡게, 못 본 칸은 검게. 보이는 칸은 exploration에 본 것으로 기록한다.
 */
export class Fog {
  private readonly image: Phaser.GameObjects.Image;
  private readonly tex: Phaser.Textures.CanvasTexture;
  private readonly data: ImageData;
  /** 지금 보이는 칸 (1) */
  private readonly visible: Uint8Array;
  private readonly visibleList: number[] = [];
  private readonly width: number;
  private readonly height: number;
  private lastEye = -1;
  private lastRadius = -1;
  private timer = 0;
  private repaintAll = false;

  constructor(
    scene: Phaser.Scene,
    private readonly grid: TileGrid,
    private readonly exploration: Exploration,
  ) {
    this.width = grid.width;
    this.height = grid.height;
    this.visible = new Uint8Array(this.width * this.height);
    if (scene.textures.exists(TEX_KEY)) scene.textures.remove(TEX_KEY);
    const tex = scene.textures.createCanvas(TEX_KEY, this.width, this.height);
    if (!tex) throw new Error('안개 텍스처 생성 실패');
    this.tex = tex;
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.data = tex.getContext().createImageData(this.width, this.height);
    const unseen = Math.round(VISION.unseenAlpha * 255);
    const memory = Math.round(VISION.memoryAlpha * 255);
    for (let i = 0; i < this.width * this.height; i++) this.data.data[i * 4 + 3] = exploration.seen[i] ? memory : unseen;
    const s = DISPLAY.tileSize;
    this.image = scene.add.image(0, 0, TEX_KEY).setOrigin(0, 0).setScale(s).setDepth(VISION.depth);
  }

  /** 칸이 지금 보이는지 */
  isVisible(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return false;
    return this.visible[ty * this.width + tx] === 1;
  }

  /** 지도 전체 공개(디버그) 같은 일이 있으면 다음 갱신 때 전부 다시 칠한다 */
  invalidate(): void {
    this.repaintAll = true;
    this.lastEye = -1;
  }

  update(dt: number, eyeX: number, eyeY: number, radius: number): void {
    this.timer -= dt;
    const eye = eyeY * this.width + eyeX;
    if (eye === this.lastEye && radius === this.lastRadius && this.timer > 0) return;
    this.timer = VISION.refreshInterval;
    this.lastEye = eye;
    this.lastRadius = radius;

    const px = this.data.data;
    const memory = Math.round(VISION.memoryAlpha * 255);
    const unseen = Math.round(VISION.unseenAlpha * 255);
    if (this.repaintAll) {
      this.repaintAll = false;
      for (let i = 0; i < this.width * this.height; i++) px[i * 4 + 3] = this.exploration.seen[i] ? memory : unseen;
    }
    // 지난번에 보이던 칸은 기억 상태로
    for (const i of this.visibleList) {
      this.visible[i] = 0;
      px[i * 4 + 3] = memory;
    }
    this.visibleList.length = 0;
    const fadeFrom = Math.max(0, radius - VISION.fadeTiles);
    computeVisible(this.grid, eyeX, eyeY, radius, (i, dist) => {
      const a = dist <= fadeFrom ? 0 : Math.round((memory * (dist - fadeFrom)) / Math.max(1, radius - fadeFrom));
      if (!this.visible[i]) {
        this.visible[i] = 1;
        this.visibleList.push(i);
        this.exploration.markSeen(i);
        px[i * 4 + 3] = a;
      } else px[i * 4 + 3] = Math.min(px[i * 4 + 3]!, a);
    });
    this.tex.getContext().putImageData(this.data, 0, 0);
    this.tex.refresh();
  }

  destroy(): void {
    this.image.destroy();
  }
}
