/**
 * 화면 배치 도우미. 내부 해상도는 창 비율에 따라 480×270보다 넓어질 수 있다 (config/display.ts의 VIEW).
 * 메뉴처럼 기준 해상도(480×270)로 짠 화면은 카메라를 옮겨 가운데에 두고,
 * HUD처럼 가장자리에 붙는 요소는 현재 크기(scene.scale.width/height)로 다시 배치한다.
 */
import Phaser from 'phaser';
import { DISPLAY } from '../config/display';

/** 기준 해상도 배치를 화면 가운데에 둘 때의 원점 (px) */
export function baseOffset(scene: Phaser.Scene): { x: number; y: number } {
  return { x: Math.floor((scene.scale.width - DISPLAY.width) / 2), y: Math.floor((scene.scale.height - DISPLAY.height) / 2) };
}

/** 화면 크기가 바뀔 때마다 fn을 부른다 (씬이 끝나면 해제). 처음에도 한 번 부른다 */
export function onResize(scene: Phaser.Scene, fn: () => void): void {
  fn();
  const handler = () => fn();
  scene.scale.on(Phaser.Scale.Events.RESIZE, handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, handler));
}

/** 기준 해상도로 배치한 씬을 화면 가운데에 둔다 (카메라 스크롤) */
export function centerBaseLayout(scene: Phaser.Scene): void {
  onResize(scene, () => {
    const o = baseOffset(scene);
    scene.cameras.main.setScroll(-o.x, -o.y);
  });
}

/** 화면 전체를 덮는 사각형 (카메라에 고정, 크기 변경을 따라간다) */
export function fullScreenRect(scene: Phaser.Scene, color: number, alpha: number): Phaser.GameObjects.Rectangle {
  const r = scene.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, color, alpha).setOrigin(0, 0).setScrollFactor(0);
  onResize(scene, () => r.setSize(scene.scale.width, scene.scale.height));
  return r;
}
