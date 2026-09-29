import Phaser from 'phaser';
import { DEBUG } from '../config/debug';
import { DISPLAY } from '../config/display';
import { RegistryKey, SceneKey } from './keys';

/** M0 확인용 빈 씬. M1에서 테스트 방 씬으로 대체된다. */
export class EmptyScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Empty);
  }

  create(): void {
    this.add
      .text(DISPLAY.width / 2, DISPLAY.height / 2, 'Dungeon Platformer\nM0', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5);

    if (DEBUG.enabled && DEBUG.showSeed) {
      const seed = this.registry.get(RegistryKey.runSeed) as number;
      this.add.text(2, 2, `seed: ${seed}`, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#8888aa',
      });
    }
  }
}
