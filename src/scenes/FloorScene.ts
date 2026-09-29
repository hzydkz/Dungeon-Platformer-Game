import Phaser from 'phaser';
import { AssetKey } from '../assets/keys';
import { DEBUG } from '../config/debug';
import { DISPLAY } from '../config/display';
import { ROOM } from '../config/generation';
import { INPUT } from '../config/input';
import { themeForFloor, type ThemeDef } from '../config/themes';
import { generateFloor, type FloorKind, type GeneratedFloor, type TilePos } from '../core/generation/floor';
import { Exploration } from '../core/map/exploration';
import type { RunState } from '../core/run';
import { getTile } from '../core/tiles';
import { Player } from '../entities/Player';
import { Portal } from '../entities/Portal';
import { Controls, type InputFrame } from '../input/Controls';
import { textStyle } from '../ui/text';
import { buildTilemap } from './tilemap';
import { RegistryKey, SceneKey } from './keys';

export interface FloorSceneData {
  floor: number;
  kind?: FloorKind;
}

/** HUD가 읽는 층 상태 */
export interface HudSource {
  readonly floorData: GeneratedFloor;
  readonly exploration: Exploration;
  readonly currentRoom: number;
  readonly playerTile: TilePos;
  readonly label: string;
}

/**
 * 층 씬: 절차 생성된 층을 불러와 탐사한다.
 * 같은 클래스를 빨간 던전(다른 씬 키)에도 쓴다.
 */
export class FloorScene extends Phaser.Scene implements HudSource {
  floorData!: GeneratedFloor;
  exploration!: Exploration;
  currentRoom = -1;
  playerTile: TilePos = { x: 0, y: 0 };
  label = '';

  protected run!: RunState;
  protected theme!: ThemeDef;
  protected controls!: Controls;
  protected player!: Player;
  protected layer!: Phaser.Tilemaps.TilemapLayer;
  protected portals: Portal[] = [];
  protected floorNumber = 1;
  protected kind: FloorKind = 'floor';
  private debugText?: Phaser.GameObjects.Text;

  constructor(key: string = SceneKey.Floor) {
    super(key);
  }

  init(data: FloorSceneData): void {
    this.floorNumber = data.floor ?? 1;
    this.kind = data.kind ?? 'floor';
    this.portals = [];
    this.currentRoom = -1;
  }

  create(): void {
    this.run = this.registry.get(RegistryKey.run) as RunState;
    this.theme = themeForFloor(this.floorNumber);
    this.floorData = generateFloor({ runSeed: this.run.runSeed, floor: this.floorNumber, kind: this.kind });
    this.exploration = new Exploration(this.floorData.layout);
    this.label = this.kind === 'red' ? `빨간 던전 (${this.floorNumber}층)` : `${this.floorNumber}층 · ${this.theme.name}`;
    this.cameras.main.setBackgroundColor(this.theme.skyColor);

    const { layer } = buildTilemap(this, this.floorData.grid, AssetKey.tiles(this.theme.id));
    this.layer = layer;
    this.controls = new Controls(this);

    const s = DISPLAY.tileSize;
    const start = this.floorData.entrance;
    this.player = new Player(this, start.x * s + s / 2, (start.y + 1) * s - 12, AssetKey.player('warrior'), (x, y) =>
      getTile(this.floorData.grid, x, y),
    );
    this.player.setDepth(10);
    this.physics.add.collider(this.player, layer, undefined, (_p, tile) =>
      this.player.shouldCollideOneWay(tile as Phaser.Tilemaps.Tile),
    );
    this.physics.world.setBounds(0, 0, this.floorData.grid.width * s, this.floorData.grid.height * s);

    this.portals.push(new Portal(this, start.x, start.y, 'entrance', AssetKey.portalBlue));
    if (this.floorData.exitPortal) {
      this.portals.push(new Portal(this, this.floorData.exitPortal.x, this.floorData.exitPortal.y, 'exit', AssetKey.portalBlue));
    }
    if (this.floorData.redPortal) {
      this.portals.push(new Portal(this, this.floorData.redPortal.x, this.floorData.redPortal.y, 'red', AssetKey.portalRed));
    }
    for (const p of this.portals) p.setDepth(5);

    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
    this.updateRoom();
    this.cameras.main.centerOn(this.player.x, this.player.y);

    this.registry.set(RegistryKey.hudSource, this);
    if (!this.scene.isActive(SceneKey.Hud)) this.scene.launch(SceneKey.Hud);
    else this.scene.bringToTop(SceneKey.Hud);

    if (DEBUG.enabled) {
      this.debugText = this.add
        .text(2, DISPLAY.height - 10, '', textStyle('tiny', '#9090b0'))
        .setScrollFactor(0)
        .setDepth(1000);
    }
  }

  /** 플레이어가 있는 방을 갱신하고 카메라를 방 경계로 제한한다 (방 단위 카메라) */
  protected updateRoom(): void {
    const s = DISPLAY.tileSize;
    const tx = Math.floor(this.player.x / s);
    const ty = Math.floor((this.player.y + 11) / s);
    this.playerTile = { x: tx, y: ty };
    const L = this.floorData.layout;
    const gx = Math.floor(tx / ROOM.widthTiles);
    const gy = Math.floor(ty / ROOM.heightTiles);
    if (gx < 0 || gy < 0 || gx >= L.gridW || gy >= L.gridH) return;
    const room = L.cellRoom[gy * L.gridW + gx] as number;
    if (room < 0 || room === this.currentRoom) return;
    this.currentRoom = room;
    this.onEnterRoom(room);
    const pr = this.floorData.rooms[room]!;
    this.cameras.main.setBounds(pr.x * s, pr.y * s, pr.w * s, pr.h * s);
  }

  protected onEnterRoom(room: number): void {
    this.exploration.enter(room);
  }

  protected handlePortals(input: InputFrame): void {
    if (!input.upPressed) return;
    for (const p of this.portals) {
      if (!p.contains(this.player.x, this.player.y)) continue;
      if (p.kind === 'exit') this.goToNextFloor();
    }
  }

  protected goToNextFloor(): void {
    this.run.floor = this.floorNumber + 1;
    this.scene.restart({ floor: this.floorNumber + 1, kind: 'floor' } satisfies FloorSceneData);
  }

  protected handleDebug(): void {
    if (!DEBUG.enabled) return;
    if (this.controls.debugPressed(INPUT.debugKeys.revealMap)) this.exploration.revealAll();
    if (this.controls.debugPressed(INPUT.debugKeys.nextFloor)) this.goToNextFloor();
    if (this.controls.debugPressed(INPUT.debugKeys.hitboxes)) {
      const world = this.physics.world;
      world.drawDebug = !world.drawDebug;
      if (!world.debugGraphic) world.createDebugGraphic();
      world.debugGraphic.clear();
    }
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    const input = this.controls.update(dt);
    this.player.tick(dt, input);
    this.updateRoom();
    this.handlePortals(input);
    this.handleDebug();
    if (this.debugText) {
      this.debugText.setText(
        `seed ${this.run.runSeed} floor ${this.floorData.seed}${this.floorData.attempts > 1 ? `(+${this.floorData.attempts - 1})` : ''} room ${this.currentRoom}`,
      );
    }
  }
}
