import Phaser from 'phaser';
import { DEBUG } from '../config/debug';
import { parseSeedFromQuery } from '../core/seed';
import { RegistryKey, SceneKey } from './keys';

/**
 * 부트 씬: URL 파라미터(개발/미리보기 빌드)를 읽고 에셋 로딩으로 넘어간다.
 * `?seed=12345`로 런 시드를 고정할 수 있다.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    const seed = DEBUG.enabled ? parseSeedFromQuery(window.location.search, DEBUG.seedQueryParam) : null;
    this.registry.set(RegistryKey.seedOverride, seed);
    this.scene.start(SceneKey.Preload);
  }
}
