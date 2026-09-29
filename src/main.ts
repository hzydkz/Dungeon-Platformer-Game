import Phaser from 'phaser';
import { DISPLAY } from './config/display';
import { MOVEMENT } from './config/movement';
import { computeIntegerZoom } from './core/display';
import { BootScene } from './scenes/BootScene';
import { EmptyScene } from './scenes/EmptyScene';

const currentZoom = (): number =>
  computeIntegerZoom(window.innerWidth, window.innerHeight, DISPLAY.width, DISPLAY.height);

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
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: MOVEMENT.gravity },
      debug: false,
    },
  },
  scene: [BootScene, EmptyScene],
});

// 창 크기가 바뀌면 정수배 확대 배율을 다시 계산한다.
window.addEventListener('resize', () => {
  game.scale.setZoom(currentZoom());
});
