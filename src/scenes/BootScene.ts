import Phaser from 'phaser';
import { DEBUG } from '../config/debug';
import { generateRunSeed, parseSeedFromQuery } from '../core/seed';
import { RegistryKey, SceneKey } from './keys';

/**
 * 부트 씬: 런 시드를 결정해 레지스트리에 저장하고 다음 씬으로 넘어간다.
 * 개발 빌드에서는 `?seed=` 파라미터로 시드를 지정할 수 있다.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    const fromQuery = DEBUG.enabled
      ? parseSeedFromQuery(window.location.search, DEBUG.seedQueryParam)
      : null;
    const runSeed = fromQuery ?? generateRunSeed();
    this.registry.set(RegistryKey.runSeed, runSeed);
    this.scene.start(SceneKey.Empty);
  }
}
