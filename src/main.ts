import Phaser from 'phaser';
import { DEBUG } from './config/debug';
import { DISPLAY } from './config/display';
import { MOVEMENT } from './config/movement';
import { computeIntegerZoom } from './core/display';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { FloorScene } from './scenes/FloorScene';
import { GameOverScene, VictoryScene } from './scenes/GameOverScene';
import { SceneKey } from './scenes/keys';
import { TitleScene } from './scenes/TitleScene';
import { HudScene } from './scenes/HudScene';
import { loadFonts } from './ui/text';

const currentZoom = (): number =>
  computeIntegerZoom(window.innerWidth, window.innerHeight, DISPLAY.width, DISPLAY.height);

await loadFonts();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: DISPLAY.width,
  height: DISPLAY.height,
  backgroundColor: DISPLAY.backgroundColor,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: currentZoom(),
  },
  input: {
    gamepad: true,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: MOVEMENT.gravity },
      debug: false,
      tileBias: 16,
    },
  },
  scene: [BootScene, PreloadScene, TitleScene, CharacterSelectScene, FloorScene, new FloorScene(SceneKey.RedDungeon), HudScene, GameOverScene, VictoryScene],
});

// 창 크기가 바뀌면 정수배 확대 배율을 다시 계산한다.
window.addEventListener('resize', () => {
  game.scale.setZoom(currentZoom());
});

// 디버그 빌드: 자동 검증 스크립트가 게임 상태를 읽을 수 있게 노출
if (DEBUG.enabled) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
