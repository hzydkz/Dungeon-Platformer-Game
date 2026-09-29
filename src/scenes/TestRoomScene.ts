import Phaser from 'phaser';
import testRoom from '../rooms/test/test_room.txt?raw';
import { AssetKey } from '../assets/keys';
import { DEBUG } from '../config/debug';
import { DISPLAY } from '../config/display';
import { ROOM } from '../config/generation';
import { basicCharToTile, getTile, gridFromAscii, type TileGrid } from '../core/tiles';
import { Player } from '../entities/Player';
import { Controls } from '../input/Controls';
import { buildTilemap } from './tilemap';
import { RegistryKey, SceneKey } from './keys';

/** M1 확인용 고정 테스트 방. 이동/점프/카메라 조작감 확인. */
export class TestRoomScene extends Phaser.Scene {
  private controls!: Controls;
  private player!: Player;
  private grid!: TileGrid;
  private info?: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKey.TestRoom);
  }

  create(): void {
    this.grid = gridFromAscii(testRoom.trimEnd().split('\n'), basicCharToTile);
    const { layer } = buildTilemap(this, this.grid, AssetKey.tiles('cave'));
    this.controls = new Controls(this);
    const s = DISPLAY.tileSize;
    this.player = new Player(this, 3 * s, 14 * s, AssetKey.player('warrior'), (x, y) => getTile(this.grid, x, y));
    this.physics.add.collider(this.player, layer, undefined, (_p, tile) => this.player.shouldCollideOneWay(tile as Phaser.Tilemaps.Tile));

    const cam = this.cameras.main;
    cam.startFollow(this.player, true, 0.2, 0.2);
    this.physics.world.setBounds(0, 0, this.grid.width * s, this.grid.height * s);

    if (DEBUG.enabled) {
      const seed = this.registry.get(RegistryKey.runSeed) as number;
      this.info = this.add
        .text(2, 2, '', { fontFamily: 'monospace', fontSize: '8px', color: '#b8b8d8' })
        .setScrollFactor(0)
        .setDepth(100);
      this.info.setData('seed', seed);
    }
    this.add
      .text(DISPLAY.width / 2, DISPLAY.height - 10, '←→ 이동  Space/Z/A 점프  ↓+점프 발판 내려가기', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#8888aa',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100);
  }

  /** 플레이어가 있는 방의 경계로 카메라를 제한한다 (방 단위 카메라). */
  private updateCameraRoom(): void {
    const s = DISPLAY.tileSize;
    const rw = ROOM.widthTiles * s;
    const rh = ROOM.heightTiles * s;
    const gx = Math.floor(this.player.x / rw);
    const gy = Math.floor(this.player.y / rh);
    this.cameras.main.setBounds(gx * rw, gy * rh, rw, rh);
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    const input = this.controls.update(dt);
    this.player.tick(dt, input);
    this.updateCameraRoom();
    if (this.info) {
      const b = this.player.arcadeBody;
      this.info.setText(
        `seed: ${this.info.getData('seed')}  fps ${Math.round(this.game.loop.actualFps)}\n` +
          `vx ${b.velocity.x.toFixed(0)} vy ${b.velocity.y.toFixed(0)} ground ${this.player.onGround ? 'Y' : 'N'}`,
      );
    }
  }
}
