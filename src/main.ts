import Phaser from 'phaser';
import { DEBUG } from './config/debug';
import { DISPLAY, VIEW } from './config/display';
import { MOVEMENT } from './config/movement';
import { computeView } from './core/display';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { ItemScene } from './scenes/ItemScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { FloorScene } from './scenes/FloorScene';
import { GameOverScene, VictoryScene } from './scenes/GameOverScene';
import { SceneKey } from './scenes/keys';
import { TitleScene } from './scenes/TitleScene';
import { HudScene } from './scenes/HudScene';
import { loadFonts } from './ui/text';

const currentView = () => computeView(window.innerWidth, window.innerHeight, DISPLAY.width, DISPLAY.height, VIEW.maxWidth, VIEW.maxHeight);
const initialView = currentView();

await loadFonts();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: initialView.width,
  height: initialView.height,
  backgroundColor: DISPLAY.backgroundColor,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: initialView.zoom,
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
  scene: [BootScene, PreloadScene, TitleScene, CharacterSelectScene, FloorScene, new FloorScene(SceneKey.RedDungeon), HudScene, ItemScene, GameOverScene, VictoryScene],
});

// 창 크기/방향이 바뀌면 보이는 범위와 배율을 다시 계산한다. 씬은 scale 'resize' 이벤트로 배치를 갱신한다.
const applyView = () => {
  const v = currentView();
  if (game.scale.width !== v.width || game.scale.height !== v.height) game.scale.resize(v.width, v.height);
  game.scale.setZoom(v.zoom);
};
window.addEventListener('resize', applyView);
window.addEventListener('orientationchange', () => setTimeout(applyView, 200));

// 디버그 빌드: 자동 검증 스크립트가 게임 상태를 읽을 수 있게 노출
if (DEBUG.enabled) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
