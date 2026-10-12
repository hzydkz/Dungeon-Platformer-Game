/**
 * 층 생성: 레이아웃 + 템플릿 선택 + 출입구 자리 배정 + 방 경계 트기 + 내부 랜덤 요소 + 특수 위치 (기획서 5장). Phaser 비의존.
 * 층 검증에 실패하면 시드를 변형해 재생성한다 (5.4).
 */
import { DOOR, FLOOR_GRID, LAYOUT, RED_LAYOUT, ROOM, ROOM_RANDOM, type DoorSlot, type SideSlot, type VerticalSlot } from '../../config/generation';
import { PROGRESSION } from '../../config/progression';
import { Rng, deriveSeed } from '../rng';
import { floorSeed, redDungeonSeed } from '../seed';
import { Tile, createGrid, getTile, isOneWayTile, isSolidTile, setTile, type TileGrid } from '../tiles';
import { generateLayout, roomDistances, roomEdges, type Layout, type LayoutParams, type Link } from './layout';
import { REACH_PARAMS } from './params';
import { buildReachGraph, canReach, reachableFrom } from './reach';
import { DIR_DELTA, isSideDir, resolveTemplate, templateHas, type DoorCap, type Marker, type RoomTemplate } from './template';
import { loadLibrary, shapeKey, type TemplateLibrary } from './templateLibrary';

export type FloorKind = 'floor' | 'red';

export interface FloorGenOptions {
  readonly runSeed: number;
  readonly floor: number;
  readonly kind: FloorKind;
  /** 성격 등으로 더해지는 빨간 포탈 확률 */
  readonly redPortalChanceBonus?: number;
  /** 함정 방 확률 가산 */
  readonly trapChanceBonus?: number;
  /** 상자 확률 배율 */
  readonly chestChanceMultiplier?: number;
  /**
   * 층 전체 도달성 검증 (기본 true). 방 경계를 튼 층은 이 검증을 통과해야 쓰고, 실패하면 경계를 트지 않은 층을 쓴다.
   * 대량 생성 테스트처럼 속도가 중요할 때만 끈다.
   */
  readonly reachCheck?: boolean;
}

export interface TilePos {
  readonly x: number;
  readonly y: number;
}

export type RoomRole = 'entrance' | 'exit' | 'red' | 'boss' | 'normal';

export interface PlacedRoom {
  readonly index: number;
  readonly role: RoomRole;
  readonly templateId: string;
  /** 월드 타일 좌표의 사각형 */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly deadEnd: boolean;
  readonly trap: boolean;
}

export interface SpawnPoint extends TilePos {
  readonly room: number;
}

export interface ChestSpawn extends SpawnPoint {
  readonly secret: boolean;
}

export interface GeneratedFloor {
  readonly kind: FloorKind;
  readonly floor: number;
  /** 요청 시드 (층 시드) */
  readonly seed: number;
  /** 실제로 쓴 시드 (재생성하면 달라진다) */
  readonly usedSeed: number;
  readonly attempts: number;
  readonly layout: Layout;
  readonly grid: TileGrid;
  readonly rooms: readonly PlacedRoom[];
  /** 연결마다 고른 출입구 자리 (layout.links와 같은 순서) */
  readonly linkSlots: readonly DoorSlot[];
  /** 방 경계를 넓게 텄는지 */
  readonly widened: boolean;
  readonly entrance: TilePos;
  readonly exitPortal: TilePos | null;
  readonly redPortal: TilePos | null;
  readonly boss: {
    readonly room: number;
    readonly spawn: TilePos;
    /** 봉쇄할 출입구 타일 */
    readonly doorTiles: readonly TilePos[];
  };
  readonly monsters: readonly SpawnPoint[];
  readonly chests: readonly ChestSpawn[];
  /** 부서지는 벽 타일 (비밀 벽) */
  readonly secretWalls: readonly SpawnPoint[];
  readonly altar: SpawnPoint | null;
  /** 상점 주인 위치 (일반 층마다 1곳, 빨간 던전에는 없음). 상점 방에는 몬스터가 없다 */
  readonly shop: SpawnPoint | null;
}

export function layoutParamsFor(opts: FloorGenOptions, rng: Rng): LayoutParams {
  if (opts.kind === 'red') {
    return {
      gridW: RED_LAYOUT.grid[0],
      gridH: RED_LAYOUT.grid[1],
      roomCount: rng.int(RED_LAYOUT.roomCount[0], RED_LAYOUT.roomCount[1]),
      loopRatio: RED_LAYOUT.loopRatio,
      newestBias: RED_LAYOUT.newestBias,
      bossRange: RED_LAYOUT.bossDistanceRange,
      hasExit: false,
      exitTopFraction: 0,
      hasRedPortal: false,
    };
  }
  const [gridW, gridH] = FLOOR_GRID[Math.min(FLOOR_GRID.length, Math.max(1, opts.floor)) - 1] as readonly [number, number];
  const isFinal = opts.floor >= PROGRESSION.floors;
  const redChance = PROGRESSION.noRedPortalFloors.includes(opts.floor) || isFinal
    ? 0
    : PROGRESSION.redPortalChance + (opts.redPortalChanceBonus ?? 0);
  return {
    gridW,
    gridH,
    roomCount: Math.round(gridW * gridH * LAYOUT.fillRatio),
    loopRatio: LAYOUT.loopRatio,
    newestBias: LAYOUT.newestBias,
    bossRange: LAYOUT.bossDistanceRange,
    hasExit: !isFinal || PROGRESSION.finalFloorHasExit,
    exitTopFraction: LAYOUT.exitTopFraction,
    hasRedPortal: rng.chance(redChance),
  };
}

function monsterChance(floor: number): number {
  return Math.min(ROOM_RANDOM.monsterChanceMax, ROOM_RANDOM.monsterChanceBase + ROOM_RANDOM.monsterChancePerFloor * (floor - 1));
}

/** 연결 하나의 출입구 타일 (a 쪽, b 쪽, 월드 좌표) */
export function linkDoorTiles(_layout: Layout, l: Link, slot: DoorSlot): { a: TilePos[]; b: TilePos[] } {
  const RW = ROOM.widthTiles;
  const RH = ROOM.heightTiles;
  const [dx, dy] = DIR_DELTA[l.dir];
  const out = { a: [] as TilePos[], b: [] as TilePos[] };
  const cellA = { x: l.ax, y: l.ay };
  const cellB = { x: l.ax + dx, y: l.ay + dy };
  if (isSideDir(l.dir)) {
    const rows = DOOR.side[slot as SideSlot];
    const xa = l.dir === 'right' ? (cellA.x + 1) * RW - 1 : cellA.x * RW;
    const xb = l.dir === 'right' ? cellB.x * RW : (cellB.x + 1) * RW - 1;
    for (const r of rows) {
      out.a.push({ x: xa, y: cellA.y * RH + r });
      out.b.push({ x: xb, y: cellB.y * RH + r });
    }
  } else {
    const cols = DOOR.vertical[slot as VerticalSlot];
    const ya = l.dir === 'down' ? (cellA.y + 1) * RH - 1 : cellA.y * RH;
    const yb = l.dir === 'down' ? cellB.y * RH : (cellB.y + 1) * RH - 1;
    for (const c of cols) {
      out.a.push({ x: cellA.x * RW + c, y: ya });
      out.b.push({ x: cellB.x * RW + c, y: yb });
    }
  }
  return out;
}

interface Assignment {
  readonly templates: RoomTemplate[];
  readonly slots: DoorSlot[];
}

/** 방마다 템플릿을 고르고 연결마다 양쪽이 모두 지원하는 출입구 자리를 정한다. 불가능하면 null */
function assignTemplates(lib: TemplateLibrary, rng: Rng, layout: Layout): Assignment | null {
  const n = layout.rooms.length;
  const templates: (RoomTemplate | null)[] = new Array(n).fill(null);
  const edgesOf = layout.rooms.map((r) => roomEdges(layout, r.index));
  const slotsOn = (t: RoomTemplate, dir: string, seg: number) => t.caps.filter((c) => c.dir === dir && c.seg === seg).map((c) => c.slot);
  // 입구에서 가까운 방부터 (이웃과 자리를 맞추기 쉽도록)
  const order = [...layout.rooms.keys()].sort((a, b) => (layout.dist[a] ?? 0) - (layout.dist[b] ?? 0));
  for (const r of order) {
    const room = layout.rooms[r]!;
    const pool = room.arena ? lib.arenas : lib.byShape.get(shapeKey(room.w, room.h)) ?? [];
    const ok = pool.filter((t) =>
      edgesOf[r]!.every((e) => {
        const mine = slotsOn(t, e.dir, e.seg);
        if (mine.length === 0) return false;
        const l = layout.links[e.link]!;
        const other = l.a === r ? l.b : l.a;
        const ot = templates[other];
        if (!ot) return true;
        const oe = edgesOf[other]!.find((x) => x.link === e.link)!;
        const theirs = slotsOn(ot, oe.dir, oe.seg);
        return mine.some((s) => theirs.includes(s));
      }),
    );
    if (ok.length === 0) return null;
    templates[r] = rng.pick(ok);
  }
  const slots: DoorSlot[] = layout.links.map((l, i) => {
    const ea = edgesOf[l.a]!.find((e) => e.link === i)!;
    const eb = edgesOf[l.b]!.find((e) => e.link === i)!;
    const sa = slotsOn(templates[l.a]!, ea.dir, ea.seg);
    const sb = slotsOn(templates[l.b]!, eb.dir, eb.seg);
    return rng.pick(sa.filter((s) => sb.includes(s)));
  });
  return { templates: templates as RoomTemplate[], slots };
}

/**
 * 방 경계 트기 (기획자 요청: 방과 방 사이를 오가는 느낌 대신 이어진 굴).
 * 좌우로 이어진 두 방 사이의 두 줄 벽에서, 양쪽 안쪽이 모두 빈 높이의 벽을 허문다.
 * 위아래 경계는 착지 턱과 바닥이 걸려 있어 그대로 둔다.
 */
function widenSeams(grid: TileGrid, layout: Layout, rng: Rng): number {
  const RW = ROOM.widthTiles;
  const RH = ROOM.heightTiles;
  let opened = 0;
  for (const l of layout.links) {
    if (l.kind !== 'open' || !isSideDir(l.dir)) continue;
    if (layout.rooms[l.a]!.arena || layout.rooms[l.b]!.arena) continue;
    if (!rng.chance(ROOM_RANDOM.seamOpenChance)) continue;
    const xa = l.dir === 'right' ? (l.ax + 1) * RW - 1 : l.ax * RW;
    const xb = l.dir === 'right' ? xa + 1 : xa - 1;
    const step = l.dir === 'right' ? 1 : -1;
    const open = (x: number, y: number) => !isSolidTile(getTile(grid, x, y)) && !isOneWayTile(getTile(grid, x, y));
    for (let y = l.ay * RH + 1; y <= l.ay * RH + RH - 2; y++) {
      if (getTile(grid, xa, y) !== Tile.Wall || getTile(grid, xb, y) !== Tile.Wall) continue;
      if (!open(xa - step, y) || !open(xb + step, y)) continue;
      setTile(grid, xa, y, Tile.Empty);
      setTile(grid, xb, y, Tile.Empty);
      opened++;
    }
  }
  return opened;
}

type Assembled = Omit<GeneratedFloor, 'seed' | 'usedSeed' | 'attempts'>;

function assemble(opts: FloorGenOptions, lib: TemplateLibrary, rng: Rng, layout: Layout, widen: boolean): Assembled | null {
  const RW = ROOM.widthTiles;
  const RH = ROOM.heightTiles;
  const grid = createGrid(layout.gridW * RW, layout.gridH * RH, Tile.Wall);

  // 이웃과 출입구 자리가 맞지 않으면 다른 조합으로 몇 번 더 시도
  let assigned: Assignment | null = null;
  for (let i = 0; i < 6 && !assigned; i++) assigned = assignTemplates(lib, rng, layout);
  if (!assigned) return null;
  const { templates: chosen, slots } = assigned;

  // 비밀 벽: S가 있는 템플릿을 쓴 방 중 0~2개
  const secretCandidates = layout.rooms.filter((r) => !r.arena && templateHas(chosen[r.index]!, 'S')).map((r) => r.index);
  const secretCount = rng.int(ROOM_RANDOM.secretWallsPerFloor[0], ROOM_RANDOM.secretWallsPerFloor[1]);
  const secretRooms = new Set(rng.shuffle(secretCandidates).slice(0, secretCount));

  const roleOf = (i: number) =>
    i === layout.entrance ? 'entrance' : i === layout.exit ? 'exit' : i === layout.red ? 'red' : i === layout.boss ? 'boss' : 'normal';
  const trapChance = ROOM_RANDOM.trapRoomChance + (opts.trapChanceBonus ?? 0);
  const chestMult = opts.chestChanceMultiplier ?? 1;
  const mChance = monsterChance(opts.floor);
  const linkCount = layout.rooms.map((r) => roomEdges(layout, r.index).length);

  const rooms: PlacedRoom[] = [];
  const markersByRoom: Marker[][] = [];
  const monsters: SpawnPoint[] = [];
  const chests: ChestSpawn[] = [];
  const secretWalls: SpawnPoint[] = [];
  let bossSpawn: TilePos | null = null;

  for (const r of layout.rooms) {
    const t = chosen[r.index]!;
    const ox = r.x * RW;
    const oy = r.y * RH;
    const role = roleOf(r.index);
    const trap = role === 'normal' && templateHas(t, 't') && rng.chance(trapChance);
    const open: DoorCap[] = roomEdges(layout, r.index).map((e) => ({ dir: e.dir, seg: e.seg, slot: slots[e.link]! }));
    const { grid: tg, markers } = resolveTemplate(t, {
      open,
      optionalOn: rng.chance(ROOM_RANDOM.optionalPlatformChance),
      trapOn: trap,
      secretActive: secretRooms.has(r.index),
    });
    for (let y = 0; y < tg.height; y++) {
      for (let x = 0; x < tg.width; x++) {
        const tile = getTile(tg, x, y);
        setTile(grid, ox + x, oy + y, tile as never);
        if (tile === Tile.Breakable) secretWalls.push({ x: ox + x, y: oy + y, room: r.index });
      }
    }
    const world = markers.map((m) => ({ ...m, x: ox + m.x, y: oy + m.y }));
    markersByRoom.push(world);
    const deadEnd = !r.arena && linkCount[r.index] === 1;
    rooms.push({ index: r.index, role, templateId: t.id, x: ox, y: oy, w: t.width, h: t.height, deadEnd, trap });

    for (const m of world) {
      if (m.kind === 'monster' && role !== 'entrance' && !r.arena && rng.chance(mChance)) monsters.push({ x: m.x, y: m.y, room: r.index });
      if (m.kind === 'chest') {
        const p = ROOM_RANDOM.chestChance * (deadEnd ? ROOM_RANDOM.deadEndChestMultiplier : 1) * chestMult;
        if (rng.chance(p)) chests.push({ x: m.x, y: m.y, room: r.index, secret: false });
      }
      if (m.kind === 'secretChest' && secretRooms.has(r.index)) chests.push({ x: m.x, y: m.y, room: r.index, secret: true });
      if (m.kind === 'boss') bossSpawn = { x: m.x, y: m.y };
    }
  }

  // 보스방 출입구 타일 (아레나 쪽)
  const bossLinkIndex = layout.links.findIndex((l) => l.b === layout.boss || l.a === layout.boss);
  const bossLink = layout.links[bossLinkIndex]!;
  const bossTiles = linkDoorTiles(layout, bossLink, slots[bossLinkIndex]!);
  const bossDoorTiles = bossLink.b === layout.boss ? bossTiles.b : bossTiles.a;

  const portalsOf = (room: number) => (markersByRoom[room] ?? []).filter((m) => m.kind === 'portal');
  const roomCenter = (room: number) => {
    const pr = rooms[room]!;
    return { x: pr.x + pr.w / 2, y: pr.y + pr.h / 2 };
  };
  // 입구: 입구 방 중앙에 가장 가까운 포탈 후보
  const c = roomCenter(layout.entrance);
  const entranceCandidates = portalsOf(layout.entrance);
  const entrance = [...entranceCandidates].sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
  if (!entrance) throw new Error('입구 방에 포탈 후보 없음');
  const exitPortal = layout.exit >= 0 ? rng.pick(portalsOf(layout.exit)) : null;
  const redPortal = layout.red >= 0 ? rng.pick(portalsOf(layout.red)) : null;

  // 제단: 입구/출구/빨간/보스가 아닌 방의 포탈 후보 위치
  let altar: SpawnPoint | null = null;
  if (opts.kind === 'floor' && rng.chance(ROOM_RANDOM.altarChance)) {
    const pool = rooms.filter((r) => r.role === 'normal');
    if (pool.length) {
      const room = rng.pick(pool);
      const spot = rng.pick(portalsOf(room.index));
      altar = { x: spot.x, y: spot.y, room: room.index };
    }
  }
  // 상점: 제단/함정이 없는 일반 방 하나의 포탈 후보 위치 (기획자 요청)
  let shop: SpawnPoint | null = null;
  if (opts.kind === 'floor') {
    const pool = rooms.filter((r) => r.role === 'normal' && !r.trap && r.index !== altar?.room && portalsOf(r.index).length > 0);
    if (pool.length) {
      const room = rng.pick(pool);
      const spot = rng.pick(portalsOf(room.index));
      shop = { x: spot.x, y: spot.y, room: room.index };
    }
  }
  // 상자와 제단/상점이 같은 칸에 겹치지 않게, 상점 방에는 몬스터를 두지 않는다
  const taken = [altar, shop].filter((p): p is SpawnPoint => p !== null);
  const filteredChests = chests.filter((ch) => !taken.some((p) => p.x === ch.x && p.y === ch.y));
  const filteredMonsters = shop ? monsters.filter((m) => m.room !== shop!.room) : monsters;

  const opened = widen ? widenSeams(grid, layout, rng) : 0;

  if (!bossSpawn) throw new Error('아레나에 보스 스폰 없음');
  return {
    kind: opts.kind,
    floor: opts.floor,
    layout,
    grid,
    rooms,
    linkSlots: slots,
    widened: opened > 0,
    entrance: { x: entrance.x, y: entrance.y },
    exitPortal: exitPortal ? { x: exitPortal.x, y: exitPortal.y } : null,
    redPortal: redPortal ? { x: redPortal.x, y: redPortal.y } : null,
    boss: { room: layout.boss, spawn: bossSpawn, doorTiles: bossDoorTiles },
    monsters: filteredMonsters,
    chests: filteredChests,
    secretWalls,
    altar,
    shop,
  };
}

/**
 * 층 단위 구조 검증 (기획서 5.4): 입구 → 출구 포탈, 보스방, 빨간 포탈이 방 그래프로 연결되어 있고,
 * 모든 연결의 출입구 타일이 양쪽에서 열려 있으며, 특수 위치가 템플릿의 포탈 후보(검증된 도달 가능 칸)인지 확인.
 * 방 내부 도달성은 템플릿 검증(validateTemplate), 방 경계를 튼 경우는 floorReachErrors가 확인한다.
 */
export function validateFloor(f: Assembled): string[] {
  const errors: string[] = [];
  const L = f.layout;
  const dist = roomDistances(L.rooms.length, L.links, L.entrance);
  const need: [string, number][] = [
    ['보스방', L.boss],
    ...(L.exit >= 0 ? ([['출구', L.exit]] as [string, number][]) : []),
    ...(L.red >= 0 ? ([['빨간 포탈', L.red]] as [string, number][]) : []),
  ];
  for (const [name, room] of need) if ((dist[room] ?? -1) < 0) errors.push(`${name} 방에 도달 불가`);
  if (L.exit === L.boss) errors.push('출구와 보스방이 같음');
  if (L.red >= 0 && [L.entrance, L.exit, L.boss].includes(L.red)) errors.push('빨간 포탈 방이 입구/출구/보스방과 겹침');

  const open = (x: number, y: number) => getTile(f.grid, x, y) === Tile.Empty;
  L.links.forEach((l, i) => {
    if (l.kind !== 'open') return;
    const t = linkDoorTiles(L, l, f.linkSlots[i]!);
    if (![...t.a, ...t.b].every((p) => open(p.x, p.y))) errors.push(`연결 ${l.a}-${l.b}(${l.dir}) 출입구가 막힘`);
  });
  // 사용하지 않는 칸은 벽
  const RW = ROOM.widthTiles;
  const RH = ROOM.heightTiles;
  for (let gy = 0; gy < L.gridH; gy++) {
    for (let gx = 0; gx < L.gridW; gx++) {
      if ((L.cellRoom[gy * L.gridW + gx] as number) >= 0) continue;
      if (!open(gx * RW + 5, gy * RH + 5)) continue;
      errors.push(`빈 칸 (${gx},${gy})이 벽이 아님`);
    }
  }
  const standOk = (p: TilePos | null, name: string) => {
    if (!p) return;
    const below = getTile(f.grid, p.x, p.y + 1);
    if (!open(p.x, p.y) || !open(p.x, p.y - 1) || !(below === Tile.Wall || below === Tile.OneWay)) errors.push(`${name} 위치가 서 있을 수 없는 칸`);
  };
  standOk(f.entrance, '입구');
  standOk(f.exitPortal, '출구 포탈');
  standOk(f.redPortal, '빨간 포탈');
  standOk(f.shop, '상점');
  if (L.exit >= 0 && !f.exitPortal) errors.push('출구 포탈 없음');
  return errors;
}

/**
 * 층 전체 타일 도달성 (게임과 같은 이동 시뮬레이션): 입구에서 출구/빨간 포탈/상점/제단/보스방/상자에 갈 수 있고,
 * 입구에서 갈 수 있는 모든 칸에서 입구로 돌아올 수 있다 (빠지면 못 나오는 곳 없음).
 */
export function floorReachErrors(f: Assembled): string[] {
  const g = buildReachGraph(f.grid, REACH_PARAMS);
  const W = f.grid.width;
  const cell = (p: TilePos) => p.y * W + p.x;
  const start = [cell(f.entrance)];
  const reach = reachableFrom(g, start);
  const back = canReach(g, start);
  const errors: string[] = [];
  const need = (p: TilePos | null, name: string) => {
    if (!p) return;
    const n = g.nodeOf[cell(p)] ?? -1;
    if (n < 0 || !reach.has(n)) errors.push(`${name} (${p.x},${p.y}) 도달 불가`);
  };
  need(f.exitPortal, '출구');
  need(f.redPortal, '빨간 포탈');
  need(f.shop, '상점');
  need(f.altar, '제단');
  need(f.boss.spawn, '보스');
  for (const c of f.chests) if (!c.secret) need(c, '상자');
  for (const n of reach) {
    if (back.has(n)) continue;
    const c = g.cells[n] as number;
    errors.push(`(${c % W},${Math.floor(c / W)})에서 입구로 돌아올 수 없음`);
    break;
  }
  return errors;
}

/** 디버그/테스트용: 마지막 생성에서 시도마다 실패한 이유 */
export const generationLog: string[] = [];

/** 층을 생성한다. 같은 옵션은 항상 같은 결과를 만든다. */
export function generateFloor(opts: FloorGenOptions, lib: TemplateLibrary = loadLibrary()): GeneratedFloor {
  const seed = opts.kind === 'red' ? redDungeonSeed(opts.runSeed, opts.floor) : floorSeed(opts.runSeed, opts.floor);
  const reachCheck = opts.reachCheck ?? true;
  let lastErrors: string[] = [];
  generationLog.length = 0;
  for (let attempt = 0; attempt < LAYOUT.maxAttempts; attempt++) {
    const usedSeed = attempt === 0 ? seed : deriveSeed(seed, 'retry', attempt);
    const rng = new Rng(usedSeed);
    // 마지막 몇 번의 시도에서는 보스방 거리 구간을 완화해 반드시 생성되게 한다
    const strictBossRange = attempt < LAYOUT.maxAttempts - LAYOUT.relaxedAttempts;
    const layout = generateLayout(rng, { ...layoutParamsFor(opts, rng), strictBossRange });
    if (!layout) {
      lastErrors = ['레이아웃 실패'];
      generationLog.push(`${attempt}: 레이아웃 실패`);
      continue;
    }
    // 같은 레이아웃으로 경계를 튼 층 → 실패하면 트지 않은 층 (템플릿 검증만으로 이동이 보장된다)
    const assembleSeed = rng.int(0, 0x7fffffff);
    for (const widen of [true, false]) {
      const floor = assemble(opts, lib, new Rng(assembleSeed), layout, widen);
      if (!floor) {
        lastErrors = ['템플릿 배정 실패'];
        generationLog.push(`${attempt}: 템플릿 배정 실패`);
        break;
      }
      const errors = validateFloor(floor);
      if (errors.length === 0 && reachCheck) errors.push(...floorReachErrors(floor));
      if (errors.length === 0) return { ...floor, seed, usedSeed, attempts: attempt + 1 };
      lastErrors = errors;
      generationLog.push(`${attempt}${widen ? 'w' : ''}: ${errors[0]}`);
      if (!floor.widened) break;
    }
  }
  throw new Error(`층 생성 실패 (${opts.kind} ${opts.floor}층, 시드 ${seed}): ${lastErrors.join(', ')}`);
}

