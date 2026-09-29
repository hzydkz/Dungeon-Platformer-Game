import Phaser from 'phaser';
import { AssetKey } from '../assets/keys';
import { PlayerCombat, type CombatHost } from '../combat/PlayerCombat';
import type { Hittable } from '../combat/types';
import { COMBAT } from '../config/combat';
import { DEBUG } from '../config/debug';
import { DISPLAY } from '../config/display';
import { ROOM } from '../config/generation';
import { INPUT } from '../config/input';
import { MOVEMENT, SPIKE_HITBOX } from '../config/movement';
import { PROGRESSION } from '../config/progression';
import { themeForFloor, type ThemeDef } from '../config/themes';
import { characterStats } from '../core/character';
import { applyHeal, floorHeal, healOnKill, lifesteal, monsterScale, outgoingDamage } from '../core/combat/damage';
import { lineOfSight } from '../core/combat/los';
import type { Stats } from '../core/combat/stats';
import { generateFloor, type FloorKind, type GeneratedFloor, type TilePos } from '../core/generation/floor';
import { escapeTimeForLayout } from '../core/escape';
import { rewardChoices, rollChest, type RewardSource } from '../core/loot';
import { secretHintVisible } from '../core/secret';
import { Exploration } from '../core/map/exploration';
import { Rng, deriveSeed } from '../core/rng';
import type { RunState } from '../core/run';
import { Tile, getTile, isHazardTile, isOneWayTile, isSolidTile, setTile } from '../core/tiles';
import { CATALOG } from '../data/catalog';
import { REWARDS } from '../config/rewards';
import { upgradeById, type UpgradeDef } from '../data/upgrades';
import { monsterById, monsterTable } from '../data/monsters';
import { roleById } from '../data/roles';
import { bossForFloor } from '../data/bosses';
import { Boss, type BossWorld } from '../entities/Boss';
import { Chest } from '../entities/Chest';
import { Monster, type MonsterWorld } from '../entities/Monster';
import { Player } from '../entities/Player';
import { Portal } from '../entities/Portal';
import { Projectile, type ProjectileOptions } from '../entities/Projectile';
import { Effects } from '../fx/Effects';
import { Controls, type InputFrame } from '../input/Controls';
import { textStyle } from '../ui/text';
import { buildTilemap, setMapTile } from './tilemap';
import type { HudScene } from './HudScene';
import type { RewardReceiver, RewardSceneData } from './RewardScene';
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
  readonly combat: PlayerCombat;
  readonly bossBar: { readonly name: string; readonly hp: number; readonly maxHp: number } | null;
  /** 빨간 던전 탈출 남은 시간 (초). 타이머가 없으면 null */
  readonly escapeTimeLeft: number | null;
}

export type BossFightState = 'waiting' | 'fighting' | 'defeated';

/**
 * 층 씬: 절차 생성된 층을 탐사하고 전투한다.
 * 같은 클래스를 빨간 던전(다른 씬 키)에도 쓴다.
 */
export class FloorScene extends Phaser.Scene implements HudSource, CombatHost, MonsterWorld, BossWorld, RewardReceiver {
  floorData!: GeneratedFloor;
  exploration!: Exploration;
  currentRoom = -1;
  playerTile: TilePos = { x: 0, y: 0 };
  label = '';
  combat!: PlayerCombat;
  fx!: Effects;

  protected run!: RunState;
  protected theme!: ThemeDef;
  protected stats!: Stats;
  protected controls!: Controls;
  protected player!: Player;
  protected layer!: Phaser.Tilemaps.TilemapLayer;
  protected portals: Portal[] = [];
  protected monsters: Monster[] = [];
  protected monsterGroup!: Phaser.Physics.Arcade.Group;
  protected playerShots!: Phaser.Physics.Arcade.Group;
  protected enemyShots!: Phaser.Physics.Arcade.Group;
  protected pickups!: Phaser.Physics.Arcade.Group;
  protected lootRng!: Rng;
  protected floorNumber = 1;
  protected kind: FloorKind = 'floor';
  protected ending = false;
  protected boss: Boss | null = null;
  protected bossState: BossFightState = 'waiting';
  private bossWarned = false;
  escapeTimeLeft: number | null = null;
  protected chests: Chest[] = [];
  protected chestGroup!: Phaser.Physics.Arcade.StaticGroup;
  protected altar: Phaser.GameObjects.Sprite | null = null;
  private hintTimer = 0;
  private hintedRooms = new Set<number>();
  private trapNoticeRooms = new Set<number>();
  readonly arena = new Phaser.Geom.Rectangle();
  floorY = 0;
  private debugText?: Phaser.GameObjects.Text;
  private readonly tmpRect = new Phaser.Geom.Rectangle();

  constructor(key: string = SceneKey.Floor) {
    super(key);
  }

  get grid() {
    return this.floorData.grid;
  }

  get target(): { x: number; y: number } {
    return this.player;
  }

  /** 난이도 레벨 (빨간 던전은 층 + 가산) */
  get difficultyLevel(): number {
    return this.kind === 'red' ? this.floorNumber + PROGRESSION.redDifficultyBonus : this.floorNumber;
  }

  init(data: FloorSceneData): void {
    this.floorNumber = data.floor ?? 1;
    this.kind = data.kind ?? 'floor';
    this.portals = [];
    this.monsters = [];
    this.currentRoom = -1;
    this.ending = false;
    this.boss = null;
    this.bossState = 'waiting';
    this.bossWarned = false;
    this.escapeTimeLeft = null;
    this.chests = [];
    this.altar = null;
    this.hintTimer = 0;
    this.hintedRooms = new Set();
    this.trapNoticeRooms = new Set();
  }

  create(): void {
    this.run = this.registry.get(RegistryKey.run) as RunState;
    this.theme = themeForFloor(this.kind === 'red' ? Math.min(9, this.floorNumber + PROGRESSION.redDifficultyBonus) : this.floorNumber);
    this.stats = characterStats(this.run.character, this.run.upgrades, CATALOG);
    this.floorData = generateFloor({
      runSeed: this.run.runSeed,
      floor: this.floorNumber,
      kind: this.kind,
      redPortalChanceBonus: this.stats.redPortalChance,
      trapChanceBonus: this.stats.trapChance,
      chestChanceMultiplier: this.stats.chestChance,
    });
    this.exploration = new Exploration(this.floorData.layout);
    this.lootRng = new Rng(deriveSeed(this.floorData.seed, 'loot'));
    this.label = this.kind === 'red' ? `빨간 던전 (${this.floorNumber}층)` : `${this.floorNumber}층 · ${this.theme.name}`;
    this.cameras.main.setBackgroundColor(this.theme.skyColor);
    this.fx = new Effects(this);

    const { layer } = buildTilemap(this, this.floorData.grid, AssetKey.tiles(this.theme.id));
    this.layer = layer;
    this.controls = new Controls(this);

    const s = DISPLAY.tileSize;
    const start = this.floorData.entrance;
    const role = roleById(this.run.character.role);
    this.player = new Player(this, start.x * s + s / 2, (start.y + 1) * s - 12, AssetKey.player(role.id), (x, y) => getTile(this.grid, x, y));
    this.player.setDepth(10);
    this.player.lastSafe.set(this.player.x, this.player.y);
    this.combat = new PlayerCombat(this, this.player, role, this.stats, this.run.hp, this);
    this.physics.add.collider(this.player, layer, undefined, (_p, tile) => this.player.shouldCollideOneWay(tile as Phaser.Tilemaps.Tile));
    this.physics.world.setBounds(0, 0, this.grid.width * s, this.grid.height * s);

    this.setupPortals();
    this.setupCombat();
    this.spawnMonsters();
    this.setupBoss();
    this.setupExploration();

    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
    this.updateRoom();
    this.cameras.main.centerOn(this.player.x, this.player.y);

    this.registry.set(RegistryKey.hudSource, this);
    if (!this.scene.isActive(SceneKey.Hud)) this.scene.launch(SceneKey.Hud);
    else this.scene.bringToTop(SceneKey.Hud);

    if (DEBUG.enabled) {
      this.debugText = this.add.text(2, DISPLAY.height - 10, '', textStyle('tiny', '#9090b0')).setScrollFactor(0).setDepth(1000);
    }

    // HUD가 뜬 다음 프레임에 층 알림
    this.time.delayedCall(80, () => this.announceFloor());
    const onWake = () => this.onReturnFromRed();
    this.events.on(Phaser.Scenes.Events.WAKE, onWake);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.WAKE, onWake));
  }

  protected announceFloor(): void {
    const hud = this.hud();
    if (!hud) return;
    if (this.kind === 'red') {
      hud.notify('빨간 던전: 보스를 처치하면 보상. 처치 후 제한 시간 안에 입구 포탈로 돌아오세요', 4, '#ff8080');
    } else if (this.floorData.redPortal) {
      // 기획서 7.2: 화면 상단 중앙, 3초
      hud.notify('빨간 포탈이 생성되었습니다', PROGRESSION.redPortalNoticeSeconds, '#ff5050');
    } else if (this.floorNumber >= PROGRESSION.floors) {
      hud.notify(`${this.floorNumber}층: 최종 보스를 처치하세요`, 3, '#d8a0ff');
    } else {
      hud.notify(this.label, 2, '#e8e0ff');
    }
  }

  protected setupPortals(): void {
    const start = this.floorData.entrance;
    this.portals.push(new Portal(this, start.x, start.y, 'entrance', this.kind === 'red' ? AssetKey.portalRed : AssetKey.portalBlue));
    if (this.floorData.exitPortal) {
      this.portals.push(new Portal(this, this.floorData.exitPortal.x, this.floorData.exitPortal.y, 'exit', AssetKey.portalBlue));
    }
    if (this.floorData.redPortal) {
      this.portals.push(new Portal(this, this.floorData.redPortal.x, this.floorData.redPortal.y, 'red', AssetKey.portalRed));
    }
    for (const p of this.portals) p.setDepth(5);
  }

  protected setupCombat(): void {
    this.monsterGroup = this.physics.add.group();
    this.playerShots = this.physics.add.group({ allowGravity: false });
    this.enemyShots = this.physics.add.group({ allowGravity: false });
    this.pickups = this.physics.add.group();

    const oneWayFromAbove = (obj: Phaser.Types.Physics.Arcade.GameObjectWithBody, tile: Phaser.Tilemaps.Tile) => {
      if (!isOneWayTile(tile.index)) return true;
      const b = obj.body as Phaser.Physics.Arcade.Body;
      return b.velocity.y >= 0 && b.prev.y + b.height <= tile.pixelY + 2;
    };
    this.physics.add.collider(this.monsterGroup, this.layer, undefined, (m, t) =>
      oneWayFromAbove(m as Phaser.Types.Physics.Arcade.GameObjectWithBody, t as Phaser.Tilemaps.Tile),
    );
    this.physics.add.collider(this.pickups, this.layer, undefined, (m, t) =>
      oneWayFromAbove(m as Phaser.Types.Physics.Arcade.GameObjectWithBody, t as Phaser.Tilemaps.Tile),
    );
    const shotVsTile = (shot: unknown, tile: unknown) => {
      const p = shot as Projectile;
      const t = tile as Phaser.Tilemaps.Tile;
      if (p.owner === 'player' && t.index === Tile.Breakable) this.breakWall(t.x, t.y);
      return !p.ghost && isSolidTile(t.index);
    };
    this.physics.add.collider(this.playerShots, this.layer, (shot) => this.expireShot(shot as Projectile), shotVsTile);
    this.physics.add.collider(this.enemyShots, this.layer, (shot) => (shot as Projectile).destroy(), shotVsTile);

    this.physics.add.overlap(this.playerShots, this.monsterGroup, (shot, mon) => this.shotHits(shot as Projectile, mon as Monster));
    this.physics.add.overlap(this.player, this.enemyShots, (_p, shot) => {
      const p = shot as Projectile;
      if (this.combat.hurt(p.damage, p.x, '적의 탄환') > 0 || !this.combat.invulnerable) p.destroy();
    });
    this.physics.add.overlap(this.player, this.monsterGroup, (_p, mon) => {
      const m = mon as Monster;
      if (!m.alive) return;
      const dmg = m.bodyAttack ? m.attackDamage : m.contactDamage;
      if (dmg > 0) this.combat.hurt(dmg, m.x, m.def.name, m);
    });
    this.physics.add.overlap(this.player, this.pickups, (_p, item) => {
      const it = item as Phaser.Physics.Arcade.Image;
      this.combat.hp = applyHeal(this.stats, this.combat.hp, this.stats.maxHp * COMBAT.drops.healRatio);
      this.fx.burst(it.x, it.y, 0x50e070, 8, 60);
      it.destroy();
    });
  }

  protected spawnMonsters(): void {
    const rng = new Rng(deriveSeed(this.floorData.seed, 'monsters'));
    const table = monsterTable(this.difficultyLevel);
    const scale = monsterScale(this.difficultyLevel);
    for (const sp of this.floorData.monsters) {
      const id = table[rng.weightedIndex(table.map(([, w]) => w))]![0];
      const m = new Monster(this, sp.x, sp.y, monsterById(id), scale, sp.room, rng);
      this.monsterGroup.add(m);
      // 그룹에 넣으면 물리 설정이 초기화되므로 비행형 중력을 다시 끈다
      if (m.def.behavior === 'flyer') m.arcadeBody.setAllowGravity(false);
      m.setActiveInRoom(false);
      this.monsters.push(m);
    }
  }

  // ---------- 탐사: 상자, 비밀 벽, 제단 (기획서 5.6) ----------

  protected setupExploration(): void {
    this.chestGroup = this.physics.add.staticGroup();
    for (const c of this.floorData.chests) {
      const chest = new Chest(this, c.x, c.y, c.room, c.secret);
      this.chests.push(chest);
      const zone = this.add.zone(chest.x, chest.y - 8, 16, 16);
      this.chestGroup.add(zone);
      zone.setData('chest', chest);
    }
    this.physics.add.overlap(this.playerShots, this.chestGroup, (shot, zone) => {
      const chest = (zone as Phaser.GameObjects.Zone).getData('chest') as Chest;
      if (chest.alive) {
        this.openChest(chest);
        this.expireShot(shot as Projectile);
      }
    });
    const a = this.floorData.altar;
    if (a) {
      const s = DISPLAY.tileSize;
      this.altar = this.add.sprite(a.x * s + s / 2, (a.y + 1) * s, AssetKey.altar, 0).setOrigin(0.5, 1).setDepth(5);
      this.altar.setData('used', false);
    }
  }

  protected openChest(chest: Chest): void {
    if (!chest.hurt()) return;
    this.fx.sound('sfx_chest', 0.6);
    this.fx.burst(chest.x, chest.y - 8, 0xffd060, 12, 90);
    const items = rollChest(this.lootRng, this.stats, this.run.character.role);
    const lines: string[] = [];
    for (const it of items) {
      if (it.kind === 'heal') {
        this.combat.hp = applyHeal(this.stats, this.combat.hp, this.stats.maxHp * it.ratio);
        lines.push('회복');
      } else {
        this.run.upgrades.push(it.id);
        lines.push(upgradeById(it.id).name);
      }
    }
    this.refreshStats();
    this.hud()?.notify(`상자: ${lines.join(', ')}`, 2.5, '#ffe080');
  }

  /** 비밀 벽: 근접 공격 판정에 닿으면 부서진다 */
  hitTiles(rect: Phaser.Geom.Rectangle): void {
    const s = DISPLAY.tileSize;
    for (let ty = Math.floor(rect.top / s); ty <= Math.floor((rect.bottom - 0.01) / s); ty++) {
      for (let tx = Math.floor(rect.left / s); tx <= Math.floor((rect.right - 0.01) / s); tx++) {
        if (getTile(this.grid, tx, ty) === Tile.Breakable) this.breakWall(tx, ty);
      }
    }
    for (const c of this.chests) if (c.alive && c.room === this.currentRoom && Phaser.Geom.Intersects.RectangleToRectangle(rect, c.hitRect(this.tmpRect))) this.openChest(c);
  }

  /** 비밀 벽 한 칸을 치면 이어진 비밀 벽이 모두 부서진다 (원거리 역할군도 통로를 열 수 있게) */
  protected breakWall(tx: number, ty: number): void {
    const s = DISPLAY.tileSize;
    const stack: [number, number][] = [[tx, ty]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (getTile(this.grid, x, y) !== Tile.Breakable) continue;
      setTile(this.grid, x, y, Tile.Empty);
      setMapTile(this.layer, x, y, Tile.Empty);
      this.fx.burst(x * s + s / 2, y * s + s / 2, 0xa08a6a, 10, 80);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    this.fx.sound('sfx_break', 0.6);
    this.fx.shake(0.003, 80);
  }

  /** 제단 (환경 이벤트): 현재 체력 일부를 바치고 강화 하나 */
  protected useAltar(): void {
    if (!this.altar || this.altar.getData('used')) return;
    const cost = Math.max(1, Math.round(this.combat.hp * REWARDS.altarHpCost));
    if (this.combat.hp - cost < 1) {
      this.hud()?.notify('체력이 부족하다', 1.5, '#ff8080');
      return;
    }
    this.altar.setData('used', true);
    const anim = `${AssetKey.altar}_used`;
    if (this.anims.exists(anim)) this.altar.play(anim);
    this.combat.hp -= cost;
    this.fx.burst(this.altar.x, this.altar.y - 12, 0x6fd6c8, 16, 90);
    const [u] = rewardChoices(this.lootRng, this.stats, this.run.character.role, 'altar');
    if (u) {
      this.run.upgrades.push(u.id);
      this.refreshStats();
      this.hud()?.notify(`제단에 피를 바쳤다: ${u.name}`, 3, '#80f0e0');
    }
  }

  /** 성격 '호기심': 비밀 벽 근처에서 반짝임 힌트 */
  protected updateSecretHint(dt: number): void {
    this.hintTimer -= dt;
    if (this.hintTimer > 0 || this.stats.secretHint <= 0) return;
    this.hintTimer = 0.6;
    const walls = this.floorData.secretWalls.filter((w) => w.room === this.currentRoom && getTile(this.grid, w.x, w.y) === Tile.Breakable);
    if (!secretHintVisible(this.stats, this.playerTile, walls)) return;
    const s = DISPLAY.tileSize;
    for (const w of walls) this.fx.burst(w.x * s + s / 2, w.y * s + s / 2, 0xfff0a0, 3, 20);
    if (!this.hintedRooms.has(this.currentRoom)) {
      this.hintedRooms.add(this.currentRoom);
      this.hud()?.notify('무언가 숨겨져 있는 것 같다…', 2, '#fff0a0');
    }
  }

  // ---------- 보상 (기획서 8.7) ----------

  protected openReward(source: RewardSource): void {
    const choices = rewardChoices(this.lootRng, this.stats, this.run.character.role, source);
    if (choices.length === 0) return;
    this.scene.pause();
    this.scene.launch(SceneKey.Reward, {
      choices: choices.map((u) => u.id),
      title: source === 'redBoss' ? '상위 강화 선택' : '강화 선택',
      resume: this.scene.key,
    } satisfies RewardSceneData);
    this.scene.bringToTop(SceneKey.Reward);
  }

  onRewardChosen(u: UpgradeDef): void {
    this.hud()?.notify(`강화: ${u.name}`, 2, '#ffe8a0');
  }

  // ---------- 보스 ----------

  protected setupBoss(): void {
    const s = DISPLAY.tileSize;
    const b = this.floorData.boss;
    const room = this.floorData.rooms[b.room]!;
    this.arena.setTo(room.x * s, room.y * s, room.w * s, room.h * s);
    this.floorY = (b.spawn.y + 1) * s;
    const { def, tier } = bossForFloor(this.floorNumber, this.kind);
    const rng = new Rng(deriveSeed(this.floorData.seed, 'boss'));
    this.boss = new Boss(this, b.spawn.x * s + s / 2, this.floorY, def, tier, monsterScale(this.difficultyLevel), rng);
    this.physics.add.collider(this.boss, this.layer, undefined, (_b, t) => {
      const tile = t as Phaser.Tilemaps.Tile;
      return !isOneWayTile(tile.index) || (this.boss !== null && this.boss.arcadeBody.velocity.y >= 0 && this.boss.arcadeBody.prev.y + this.boss.arcadeBody.height <= tile.pixelY + 2);
    });
    this.physics.add.overlap(this.player, this.boss, () => {
      if (this.boss && this.boss.alive && this.boss.fighting) this.combat.hurt(this.boss.contactDamage, this.boss.x, this.boss.def.name, this.boss);
    });
  }

  get bossBar(): HudSource['bossBar'] {
    if (!this.boss || this.bossState !== 'fighting') return null;
    return { name: this.boss.def.name, hp: this.boss.hp, maxHp: this.boss.maxHp };
  }

  hud(): HudScene | null {
    const h = this.scene.get(SceneKey.Hud) as HudScene | null;
    return h && h.scene.isActive() ? h : null;
  }

  protected setDoorTiles(tile: typeof Tile.Seal | typeof Tile.Empty): void {
    for (const d of this.floorData.boss.doorTiles) {
      setTile(this.floorData.grid, d.x, d.y, tile);
      setMapTile(this.layer, d.x, d.y, tile);
    }
  }

  /** 보스방 입장 경고, 입장 시 봉쇄와 전투 시작 */
  protected checkBoss(): void {
    if (!this.boss || this.bossState !== 'waiting') return;
    const L = this.floorData.layout;
    const s = DISPLAY.tileSize;
    const doorX = this.floorData.boss.doorTiles[0]!.x * s;
    if (this.currentRoom === L.bossGate) {
      if (!this.bossWarned && Math.abs(this.player.x - doorX) < 8 * s) {
        this.bossWarned = true;
        this.hud()?.notify('보스방: 들어가면 보스를 처치할 때까지 나올 수 없습니다', 3, '#ffb060');
      }
    } else if (this.currentRoom !== L.boss) {
      this.bossWarned = false;
    }
    if (this.currentRoom === L.boss && Math.abs(this.player.x - doorX) > 3 * s) this.startBossFight();
  }

  protected startBossFight(): void {
    if (!this.boss) return;
    this.bossState = 'fighting';
    this.setDoorTiles(Tile.Seal);
    this.boss.startFight();
    this.fx.shake(0.006, 400);
    this.fx.sound('sfx_boss_roar', 0.8);
    this.fx.burst(this.boss.x, this.boss.y - 30, 0xa050e0, 24, 150);
    this.hud()?.notify(this.boss.def.name, 2.5, '#d8a0ff');
  }

  protected endBossFight(): void {
    if (!this.boss) return;
    this.bossState = 'defeated';
    this.setDoorTiles(Tile.Empty);
    this.run.bossesKilled++;
    for (const shot of [...(this.enemyShots.getChildren() as Projectile[])]) shot.destroy();
    this.fx.shake(0.012, 600);
    this.fx.burst(this.boss.x, this.boss.y - 30, 0xd0a0ff, 40, 200);
    this.tweens.add({ targets: this.boss, alpha: 0, duration: 800 });
    this.hud()?.notify(`${this.boss.def.name} 처치!`, 3, '#ffe080');
    this.onBossDefeated();
  }

  /** 보스 처치 후: 9층 최종 보스는 클리어, 빨간 던전은 탈출 타이머 시작 (보상은 M7) */
  protected onBossDefeated(): void {
    if (this.kind === 'floor' && this.floorNumber >= PROGRESSION.floors) {
      this.ending = true;
      this.run.outcome = 'victory';
      this.run.hp = this.combat.hp;
      this.time.delayedCall(2200, () => {
        this.scene.stop(SceneKey.Hud);
        this.scene.start(SceneKey.Victory);
      });
      return;
    }
    if (this.kind === 'red') {
      // 빨간 던전 추가 보상: 체력 회복 + 상위 등급 선택지
      this.combat.hp = applyHeal(this.stats, this.combat.hp, this.stats.maxHp * REWARDS.redBossHealRatio);
      this.startEscapeTimer();
    }
    this.time.delayedCall(1300, () => {
      if (!this.ending) this.openReward(this.kind === 'red' ? 'redBoss' : 'floorBoss');
    });
  }

  protected startEscapeTimer(): void {
    const s = DISPLAY.tileSize;
    const centers = this.floorData.rooms.map((r) => ({ x: (r.x + r.w / 2) * s, y: (r.y + r.h / 2) * s }));
    this.escapeTimeLeft = escapeTimeForLayout(this.floorData.layout, centers, MOVEMENT.runSpeed * this.stats.moveSpeed, this.stats.escapeTime);
    this.time.delayedCall(3000, () => this.hud()?.notify('던전이 무너집니다! 입구 포탈로 돌아가세요', 3, '#ff5050'));
  }

  protected updateEscapeTimer(dt: number): void {
    if (this.escapeTimeLeft === null) return;
    const before = this.escapeTimeLeft;
    this.escapeTimeLeft = Math.max(0, this.escapeTimeLeft - dt);
    if (this.escapeTimeLeft <= PROGRESSION.escapeWarningSeconds && Math.floor(before) !== Math.floor(this.escapeTimeLeft)) {
      this.fx.shake(0.003, 150);
    }
    if (this.escapeTimeLeft <= 0) this.onPlayerDeath('빨간 던전 탈출 실패');
  }

  fireBossShot(x: number, y: number, vx: number, vy: number, damage: number, opts: { homing?: boolean; scaleY?: number; lifetime?: number } = {}): void {
    const p = new Projectile(this, {
      owner: 'enemy',
      texture: AssetKey.bossShot,
      x,
      y,
      vx,
      vy,
      damage,
      lifetime: opts.lifetime ?? 3,
      ...(opts.homing ? { homing: { target: this.player, turnRate: 1.4 } } : {}),
    });
    if (opts.scaleY) p.setScale(1, opts.scaleY);
    this.enemyShots.add(p);
    const body = p.body as Phaser.Physics.Arcade.Body;
    if (opts.scaleY) body.setSize(p.width, p.height * opts.scaleY);
    body.setVelocity(vx, vy);
  }

  hurtPlayerInRect(rect: Phaser.Geom.Rectangle, damage: number, sourceX: number, cause: string): void {
    const b = this.player.arcadeBody;
    if (Phaser.Geom.Intersects.RectangleToRectangle(rect, this.tmpRect.setTo(b.x, b.y, b.width, b.height))) {
      this.combat.hurt(damage, sourceX, cause);
    }
  }

  spawnMinion(x: number, feetY: number): void {
    const s = DISPLAY.tileSize;
    const table = monsterTable(this.difficultyLevel).filter(([id]) => monsterById(id).behavior === 'walker');
    const id = table.length ? table[0]![0] : 'slime';
    const m = new Monster(this, Math.floor(x / s), Math.floor(feetY / s) - 1, monsterById(id), monsterScale(this.difficultyLevel), this.floorData.boss.room, this.lootRng);
    this.monsterGroup.add(m);
    m.setActiveInRoom(true);
    this.monsters.push(m);
    this.fx.burst(m.x, m.y - 6, 0xa050e0, 10, 80);
  }

  // ---------- CombatHost ----------

  *targets(): Iterable<Hittable> {
    for (const m of this.monsters) if (m.alive && m.room === this.currentRoom) yield m;
    if (this.boss && this.boss.alive && this.bossState === 'fighting') yield this.boss;
    for (const c of this.chests) if (c.alive && c.room === this.currentRoom) yield c;
  }

  damageTarget(target: Hittable, base: number, fromX: number): void {
    if (!target.alive) return;
    if (target instanceof Chest) {
      this.openChest(target);
      return;
    }
    const hit = outgoingDamage(this.stats, base, this.combat.hp, this.lootRng);
    const killed = target.hurt(hit.damage, fromX);
    this.fx.hitSpark(target.x, target.y - 6);
    this.fx.sound('sfx_hit', 0.4);
    if (hit.crit) this.floatText(target.x, target.y - 18, `${hit.damage}!`, '#ffd060');
    const steal = lifesteal(this.stats, hit.damage);
    if (steal > 0) this.combat.heal(steal);
    if (killed) this.onKill(target);
    else this.fx.hitstop(25);
  }

  protected onKill(target: Hittable): void {
    this.run.kills++;
    this.fx.hitstop(50);
    const heal = healOnKill(this.stats);
    if (heal > 0) this.combat.heal(heal);
    if (target instanceof Boss) {
      this.endBossFight();
      return;
    }
    if (target instanceof Monster) {
      this.fx.burst(target.x, target.y - 6, 0xe04848, 12, 100);
      if (this.lootRng.chance(COMBAT.drops.healChance)) this.dropHeal(target.x, target.y - 8);
      this.tweens.add({ targets: target, alpha: 0, duration: 200, onComplete: () => target.setVisible(false) });
    }
  }

  protected dropHeal(x: number, y: number): void {
    const item = this.physics.add.image(x, y, AssetKey.heal).setDepth(9);
    this.pickups.add(item);
    (item.body as Phaser.Physics.Arcade.Body).setVelocityY(-120);
  }

  spawnPlayerProjectile(o: Omit<ProjectileOptions, 'owner'>): void {
    this.playerShots.add(new Projectile(this, { ...o, owner: 'player' }));
    // 그룹 추가 시 초기화되는 속도 복원
    const last = this.playerShots.getLast(true) as Projectile;
    (last.body as Phaser.Physics.Arcade.Body).setVelocity(o.vx, o.vy);
  }

  fireEnemyShot(from: Monster, angle: number, speed: number, damage: number, homing: boolean): void {
    const p = new Projectile(this, {
      owner: 'enemy',
      texture: AssetKey.enemyShot,
      x: from.x,
      y: from.y - from.arcadeBody.height / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage,
      lifetime: homing ? 3.5 : 2.5,
      ...(homing ? { homing: { target: this.player, turnRate: 1.6 } } : {}),
    });
    this.enemyShots.add(p);
    (p.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  canSee(fromX: number, fromY: number, toX: number, toY: number): boolean {
    return lineOfSight(this.grid, DISPLAY.tileSize, fromX, fromY, toX, toY);
  }

  onPlayerDeath(cause: string): void {
    if (this.ending) return;
    this.ending = true;
    this.run.outcome = 'dead';
    this.run.deathCause = cause;
    this.run.hp = 0;
    this.fx.shake(0.01, 300);
    this.player.setTint(0xff4040);
    this.physics.pause();
    this.time.delayedCall(700, () => {
      this.scene.stop(SceneKey.Hud);
      if (this.kind === 'red') this.scene.stop(SceneKey.Floor);
      else this.scene.stop(SceneKey.RedDungeon);
      this.scene.start(SceneKey.GameOver);
    });
  }

  private shotHits(shot: Projectile, m: Monster): void {
    if (!shot.active || !m.alive || m.room !== this.currentRoom) return;
    if (shot.hitSet.has(m)) return;
    shot.hitSet.add(m);
    this.damageTarget(m, shot.damage, shot.x);
    if (!shot.pierce) this.expireShot(shot);
  }

  protected expireShot(shot: Projectile): void {
    if (!shot.active) return;
    if (shot.splashRadius > 0) {
      this.fx.ring(shot.x, shot.y, shot.splashRadius, 0x7fa8ff);
      for (const t of this.targets()) {
        if (shot.hitSet.has(t)) continue;
        const r = t.hitRect(this.tmpRect);
        if (Math.hypot(r.centerX - shot.x, r.centerY - shot.y) <= shot.splashRadius + r.width / 2) {
          this.damageTarget(t, Math.round(shot.damage * 0.6), shot.x);
        }
      }
    }
    shot.destroy();
  }

  protected floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add.text(x, y, text, textStyle('tiny', color)).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 600, onComplete: () => t.destroy() });
  }

  // ---------- 방 / 포탈 ----------

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
    const prev = this.currentRoom;
    this.currentRoom = room;
    for (const m of this.monsters) {
      if (m.room === prev || m.room === room) m.setActiveInRoom(m.room === room);
    }
    this.onEnterRoom(room);
    const pr = this.floorData.rooms[room]!;
    this.cameras.main.setBounds(pr.x * s, pr.y * s, pr.w * s, pr.h * s);
  }

  protected onEnterRoom(room: number): void {
    this.exploration.enter(room, this.stats.revealAdjacent > 0);
    if (this.floorData.rooms[room]?.trap && !this.trapNoticeRooms.has(room)) {
      this.trapNoticeRooms.add(room);
      this.hud()?.notify('함정 방: 가시에 주의', 1.8, '#ff9060');
    }
  }

  protected handlePortals(input: InputFrame): void {
    if (!input.upPressed) return;
    for (const c of this.chests) if (c.alive && c.room === this.currentRoom && c.contains(this.player.x, this.player.y)) this.openChest(c);
    if (this.altar && Math.abs(this.altar.x - this.player.x) < 12 && Math.abs(this.altar.y - 12 - this.player.y) < 20) this.useAltar();
    for (const p of this.portals) {
      if (!p.active || !p.contains(this.player.x, this.player.y)) continue;
      if (p.kind === 'exit') this.goToNextFloor();
      else if (p.kind === 'red') this.enterRedDungeon();
      else if (p.kind === 'entrance' && this.kind === 'red') this.exitRedDungeon();
    }
  }

  /** 출구 파란 포탈: 다음 층으로. 층 이동 시 최대 체력의 30% 회복 (기획서 8.8) */
  protected goToNextFloor(): void {
    if (this.ending) return;
    if (this.kind === 'red') {
      this.exitRedDungeon();
      return;
    }
    if (this.floorNumber >= PROGRESSION.floors) return;
    this.ending = true;
    this.fx.sound('sfx_portal', 0.6);
    this.run.floor = this.floorNumber + 1;
    this.run.hp = floorHeal(this.stats, this.combat.hp);
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart({ floor: this.floorNumber + 1, kind: 'floor' } satisfies FloorSceneData);
    });
  }

  /** 빨간 포탈: 이 층은 재워 두고 빨간 던전을 띄운다 */
  protected enterRedDungeon(): void {
    this.run.hp = this.combat.hp;
    this.fx.sound('sfx_portal', 0.6);
    this.scene.launch(SceneKey.RedDungeon, { floor: this.floorNumber, kind: 'red' } satisfies FloorSceneData);
    this.scene.sleep();
  }

  /** 빨간 던전 입구 포탈: 원래 층으로 돌아간다 (보스를 안 잡아도 허용, 빨간 포탈은 사라진다) */
  protected exitRedDungeon(): void {
    if (this.ending) return;
    this.ending = true;
    this.run.hp = this.combat.hp;
    this.fx.sound('sfx_portal', 0.6);
    this.scene.wake(SceneKey.Floor);
    this.scene.stop();
  }

  /** 빨간 던전에서 돌아옴: 빨간 포탈 자리에 서고, 포탈은 사라진다 */
  protected onReturnFromRed(): void {
    const s = DISPLAY.tileSize;
    const red = this.portals.find((p) => p.kind === 'red');
    if (red && this.floorData.redPortal) {
      this.player.arcadeBody.reset(this.floorData.redPortal.x * s + s / 2, (this.floorData.redPortal.y + 1) * s - 12);
      this.fx.burst(red.x, red.y - 16, 0xff3030, 16, 90);
      red.destroy();
      this.portals = this.portals.filter((p) => p !== red);
    }
    this.registry.set(RegistryKey.hudSource, this);
    this.refreshStats();
    this.combat.hp = Math.min(this.run.hp, this.stats.maxHp);
    this.controls = new Controls(this);
    this.scene.bringToTop(SceneKey.Hud);
    this.hud()?.notify('빨간 포탈이 닫혔습니다', 2, '#ff8080');
  }

  /** 강화 등으로 스탯이 바뀌면 다시 계산 */
  refreshStats(): void {
    const prevMax = this.stats.maxHp;
    this.stats = characterStats(this.run.character, this.run.upgrades, CATALOG);
    this.combat.stats = this.stats;
    if (this.stats.maxHp > prevMax) this.combat.heal(this.stats.maxHp - prevMax);
    this.combat.hp = Math.min(this.combat.hp, this.stats.maxHp);
  }

  /** 가시: 게임과 도달성 검증기가 같은 판정 영역을 쓴다 */
  protected touchingSpike(): boolean {
    const b = this.player.arcadeBody;
    const s = DISPLAY.tileSize;
    for (let ty = Math.floor(b.top / s); ty <= Math.floor((b.bottom - 0.01) / s); ty++) {
      for (let tx = Math.floor(b.left / s); tx <= Math.floor((b.right - 0.01) / s); tx++) {
        if (!isHazardTile(getTile(this.grid, tx, ty))) continue;
        const hx0 = tx * s + SPIKE_HITBOX.insetX;
        const hx1 = (tx + 1) * s - SPIKE_HITBOX.insetX;
        const hy0 = ty * s + SPIKE_HITBOX.top;
        if (b.left < hx1 && b.right > hx0 && b.top < (ty + 1) * s && b.bottom > hy0) return true;
      }
    }
    return false;
  }

  protected handleSpikes(): void {
    if (this.touchingSpike()) {
      this.combat.hurt(COMBAT.player.spikeDamage, this.player.x, '가시');
      if (this.combat.hp > 0) {
        this.player.setPosition(this.player.lastSafe.x, this.player.lastSafe.y);
        this.player.arcadeBody.setVelocity(0, 0);
        this.player.controlLockUntil = this.time.now / 1000 + 0.25;
      }
    } else if (this.player.onGround) {
      this.player.lastSafe.set(this.player.x, this.player.y);
    }
  }

  /** 몬스터가 다른 방으로 넘어가면 방 정보를 갱신하고, 현재 방이 아니면 멈춘다 */
  protected trackMonsterRoom(m: Monster): void {
    const room = this.roomAt(m.x, m.y - 2);
    if (room < 0 || room === m.room) return;
    m.room = room;
    if (room !== this.currentRoom) m.setActiveInRoom(false);
  }

  /** 월드 좌표(px)의 방 인덱스 (-1: 방 밖) */
  roomAt(px: number, py: number): number {
    const s = DISPLAY.tileSize;
    const L = this.floorData.layout;
    const gx = Math.floor(px / s / ROOM.widthTiles);
    const gy = Math.floor(py / s / ROOM.heightTiles);
    if (gx < 0 || gy < 0 || gx >= L.gridW || gy >= L.gridH) return -1;
    return L.cellRoom[gy * L.gridW + gx] as number;
  }

  protected handleDebug(): void {
    if (!DEBUG.enabled) return;
    const k = INPUT.debugKeys;
    if (this.controls.debugPressed(k.revealMap)) this.exploration.revealAll();
    if (this.controls.debugPressed(k.invincible)) {
      this.combat.godMode = !this.combat.godMode;
      this.floatText(this.player.x, this.player.y - 20, this.combat.godMode ? '무적 ON' : '무적 OFF', '#ffffff');
    }
    if (this.controls.debugPressed(k.nextFloor)) this.goToNextFloor();
    if (this.controls.debugPressed(k.killBoss) && this.boss && this.bossState === 'fighting') this.damageTarget(this.boss, 99999, this.player.x);
    if (this.controls.debugPressed(k.hitboxes)) {
      const world = this.physics.world;
      world.drawDebug = !world.drawDebug;
      if (!world.debugGraphic) world.createDebugGraphic();
      world.debugGraphic.clear();
    }
  }

  override update(_time: number, deltaMs: number): void {
    if (this.ending) return;
    if (this.fx.frozen) {
      if (!this.physics.world.isPaused) this.physics.pause();
      return;
    }
    if (this.physics.world.isPaused) this.physics.resume();
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    const input = this.controls.update(dt);
    this.combat.update(dt, input);
    this.player.tick(dt, input);
    if (this.combat.dashing) this.player.arcadeBody.setVelocityY(0);
    this.handleSpikes();
    for (const m of this.monsters) {
      if (m.room !== this.currentRoom || !m.alive) continue;
      m.tick(dt, this);
      this.trackMonsterRoom(m);
    }
    for (const p of this.playerShots.getChildren() as Projectile[]) p.tick(dt);
    for (const p of this.enemyShots.getChildren() as Projectile[]) p.tick(dt);
    if (this.boss && this.bossState === 'fighting') this.boss.tick(dt, this);
    this.updateEscapeTimer(dt);
    this.updateSecretHint(dt);
    this.updateRoom();
    this.checkBoss();
    this.handlePortals(input);
    this.handleDebug();
    if (this.debugText) {
      this.debugText.setText(
        `seed ${this.run.runSeed} floor ${this.floorData.seed}${this.floorData.attempts > 1 ? `(+${this.floorData.attempts - 1})` : ''} room ${this.currentRoom}${this.combat.godMode ? ' GOD' : ''}`,
      );
    }
  }
}
