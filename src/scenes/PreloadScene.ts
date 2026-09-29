import Phaser from 'phaser';
import existingFiles from 'virtual:asset-files';
import { MANIFEST } from '../assets/keys';
import { TILESET_SLOTS, animationKey } from '../core/assets/manifest';
import { DISPLAY } from '../config/display';
import { createMissingPlaceholders } from './placeholders';
import { SceneKey } from './keys';

/**
 * manifest의 에셋을 불러오고, 없는 파일은 플레이스홀더로 채운 뒤 애니메이션을 등록한다.
 */
export class PreloadScene extends Phaser.Scene {
  private readonly failed = new Set<string>();

  constructor() {
    super(SceneKey.Preload);
  }

  preload(): void {
    const bar = this.add.rectangle(DISPLAY.width / 2 - 100, DISPLAY.height / 2, 0, 4, 0xffffff).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => bar.setSize(200 * p, 4));
    this.load.on('loaderror', (file: Phaser.Loader.File) => this.failed.add(file.key));

    // 실제로 있는 파일만 요청한다. 없는 키는 create()에서 플레이스홀더로 채운다.
    const has = new Set(existingFiles);
    this.load.setPath(MANIFEST.basePath);
    for (const e of MANIFEST.images) if (has.has(e.file)) this.load.image(e.key, e.file);
    for (const e of MANIFEST.spritesheets) {
      if (has.has(e.file)) this.load.spritesheet(e.key, e.file, { frameWidth: e.frameWidth, frameHeight: e.frameHeight });
    }
    for (const e of MANIFEST.tilesets) {
      if (has.has(e.file)) {
        this.load.spritesheet(e.key, e.file, { frameWidth: e.tileSize, frameHeight: e.tileSize, endFrame: TILESET_SLOTS.length });
      }
    }
    for (const e of MANIFEST.audio) if (has.has(e.file)) this.load.audio(e.key, e.file);
  }

  create(): void {
    // 로드에 실패한 텍스처가 남아 있으면 지우고 플레이스홀더로 대체
    for (const key of this.failed) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }
    createMissingPlaceholders(this, MANIFEST);

    for (const sheet of MANIFEST.spritesheets) {
      for (const [action, anim] of Object.entries(sheet.animations)) {
        const key = animationKey(sheet.key, action);
        if (this.anims.exists(key)) continue;
        this.anims.create({
          key,
          frames: anim.frames.map((frame) => ({ key: sheet.key, frame })),
          frameRate: anim.fps,
          repeat: anim.repeat,
        });
      }
    }
    this.scene.start(SceneKey.Title);
  }
}
