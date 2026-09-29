/**
 * 층 생성: 레이아웃 + 템플릿 선택 + 내부 랜덤 요소 + 특수 위치 (기획서 5장). Phaser 비의존.
 * 층 검증에 실패하면 시드를 변형해 재생성한다 (5.4).
 */
import { FLOOR_GRID, LAYOUT, RED_LAYOUT, ROOM, ROOM_RANDOM, DOOR } from '../../config/generation';
import { PROGRESSION } from '../../config/progression';
import { Rng, deriveSeed } from '../rng';
import { floorSeed, redDungeonSeed } from '../seed';
import { Tile, createGrid, getTile, setTile, type TileGrid } from '../tiles';
import { generateLayout, roomDistances, type Layout, type LayoutParams } from './layout';
import { DIR_BIT, dirsOf, resolveTemplate, templateHas, type Marker, type RoomTemplate } from './template';
import { loadLibrary, type TemplateLibrary } from './templateLibrary';

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
  readonly doors: number;
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

function assemble(opts: FloorGenOptions, lib: TemplateLibrary, rng: Rng, layout: Layout): Omit<GeneratedFloor, 'seed' | 'usedSeed' | 'attempts'> {
  const RW = ROOM.widthTiles;
  const RH = ROOM.heightTiles;
  const grid = createGrid(layout.gridW * RW, layout.gridH * RH, Tile.Wall);

  // 템플릿 선택
  const chosen: RoomTemplate[] = layout.rooms.map((r) => {
    const pool = r.arena ? lib.arenas.get(r.doors) : lib.byDoors.get(r.doors);
    if (!pool || pool.length === 0) throw new Error(`출입구 조합에 맞는 템플릿 없음: ${r.doors}`);
    return rng.pick(pool);
  });

  // 비밀 벽: S가 있는 템플릿을 쓴 방 중 0~2개
  const secretCandidates = layout.rooms.filter((r) => !r.arena && templateHas(chosen[r.index]!, 'S')).map((r) => r.index);
  const secretCount = rng.int(ROOM_RANDOM.secretWallsPerFloor[0], ROOM_RANDOM.secretWallsPerFloor[1]);
  const secretRooms = new Set(rng.shuffle(secretCandidates).slice(0, secretCount));

  const roleOf = (i: number): RoomRole =>
    i === layout.entrance ? 'entrance' : i === layout.exit ? 'exit' : i === layout.red ? 'red' : i === layout.boss ? 'boss' : 'normal';
  const trapChance = ROOM_RANDOM.trapRoomChance + (opts.trapChanceBonus ?? 0);
  const chestMult = opts.chestChanceMultiplier ?? 1;
  const mChance = monsterChance(opts.floor);

  const rooms: PlacedRoom[] = [];
  const markersByRoom: Marker[][] = [];
  const monsters: SpawnPoint[] = [];
  const chests: ChestSpawn[] = [];
  const secretWalls: SpawnPoint[] = [];
  let bossSpawn: TilePos | null = null;
  const bossDoorTiles: TilePos[] = [];

  for (const r of layout.rooms) {
    const t = chosen[r.index]!;
    const [cx, cy] = r.cells[0]!;
    const ox = cx * RW;
    const oy = cy * RH;
    const role = roleOf(r.index);
    const trap = role === 'normal' && templateHas(t, 't') && rng.chance(trapChance);
    const { grid: tg, markers } = resolveTemplate(t, {
      openDoors: r.doors,
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
    const deadEnd = !r.arena && dirsOf(r.doors).length === 1;
    rooms.push({ index: r.index, role, templateId: t.id, x: ox, y: oy, w: t.width, h: t.height, doors: r.doors, deadEnd, trap });

    for (const m of world) {
      if (m.kind === 'monster' && role !== 'entrance' && !r.arena && rng.chance(mChance)) monsters.push({ x: m.x, y: m.y, room: r.index });
      if (m.kind === 'chest') {
        const p = ROOM_RANDOM.chestChance * (deadEnd ? ROOM_RANDOM.deadEndChestMultiplier : 1) * chestMult;
        if (rng.chance(p)) chests.push({ x: m.x, y: m.y, room: r.index, secret: false });
      }
      if (m.kind === 'secretChest' && secretRooms.has(r.index)) chests.push({ x: m.x, y: m.y, room: r.index, secret: true });
      if (m.kind === 'boss') bossSpawn = { x: m.x, y: m.y };
    }
    if (r.arena) {
      const doorX = r.doors & DIR_BIT.left ? ox : ox + t.width - 1;
      for (const y of DOOR.sideRows) bossDoorTiles.push({ x: doorX, y: oy + y });
    }
  }

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
  // 상자와 제단이 같은 칸에 겹치지 않게
  const filteredChests = altar ? chests.filter((ch) => !(ch.x === altar!.x && ch.y === altar!.y)) : chests;

  if (!bossSpawn) throw new Error('아레나에 보스 스폰 없음');
  return {
    kind: opts.kind,
    floor: opts.floor,
    layout,
    grid,
    rooms,
    entrance: { x: entrance.x, y: entrance.y },
    exitPortal: exitPortal ? { x: exitPortal.x, y: exitPortal.y } : null,
    redPortal: redPortal ? { x: redPortal.x, y: redPortal.y } : null,
    boss: { room: layout.boss, spawn: bossSpawn, doorTiles: bossDoorTiles },
    monsters,
    chests: filteredChests,
    secretWalls,
    altar,
  };
}

/**
 * 층 단위 검증 (기획서 5.4): 입구 → 출구 포탈, 보스방, 빨간 포탈이 방 그래프로 연결되어 있고,
 * 모든 연결의 출입구 타일이 양쪽에서 열려 있으며, 특수 위치가 템플릿의 포탈 후보(검증된 도달 가능 칸)인지 확인.
 * 방 내부 도달성은 템플릿 검증(validateTemplate)이 보장한다.
 */
export function validateFloor(f: Omit<GeneratedFloor, 'seed' | 'usedSeed' | 'attempts'>): string[] {
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

  const RW = ROOM.widthTiles;
  const RH = ROOM.heightTiles;
  const open = (x: number, y: number) => getTile(f.grid, x, y) === Tile.Empty;
  for (const l of L.links) {
    const ra = L.rooms[l.a]!;
    const rb = L.rooms[l.b]!;
    // a 쪽 출입구가 있는 칸 (아레나는 여러 칸일 수 있으므로 b와 맞닿은 칸)
    const cellA = ra.cells.find(([x, y]) => rb.cells.some(([bx, by]) => Math.abs(bx - x) + Math.abs(by - y) === 1)) ?? ra.cells[0]!;
    const [ax, ay] = cellA;
    const ox = ax * RW;
    const oy = ay * RH;
    const cells: [number, number][] = [];
    if (l.dir === 'left') for (const y of DOOR.sideRows) cells.push([ox, oy + y], [ox - 1, oy + y]);
    if (l.dir === 'right') for (const y of DOOR.sideRows) cells.push([ox + RW - 1, oy + y], [ox + RW, oy + y]);
    if (l.dir === 'up') for (const x of DOOR.verticalCols) cells.push([ox + x, oy], [ox + x, oy - 1]);
    if (l.dir === 'down') for (const x of DOOR.verticalCols) cells.push([ox + x, oy + RH - 1], [ox + x, oy + RH]);
    if (!cells.every(([x, y]) => open(x, y))) errors.push(`연결 ${l.a}-${l.b}(${l.dir}) 출입구가 막힘`);
  }
  // 사용하지 않는 칸은 벽
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
  if (L.exit >= 0 && !f.exitPortal) errors.push('출구 포탈 없음');
  return errors;
}

/** 층을 생성한다. 같은 옵션은 항상 같은 결과를 만든다. */
export function generateFloor(opts: FloorGenOptions, lib: TemplateLibrary = loadLibrary()): GeneratedFloor {
  const seed = opts.kind === 'red' ? redDungeonSeed(opts.runSeed, opts.floor) : floorSeed(opts.runSeed, opts.floor);
  let lastErrors: string[] = [];
  for (let attempt = 0; attempt < LAYOUT.maxAttempts; attempt++) {
    const usedSeed = attempt === 0 ? seed : deriveSeed(seed, 'retry', attempt);
    const rng = new Rng(usedSeed);
    // 마지막 몇 번의 시도에서는 보스방 거리 구간을 완화해 반드시 생성되게 한다
    const strictBossRange = attempt < LAYOUT.maxAttempts - LAYOUT.relaxedAttempts;
    const layout = generateLayout(rng, { ...layoutParamsFor(opts, rng), strictBossRange });
    if (!layout) {
      lastErrors = ['레이아웃 실패'];
      continue;
    }
    const floor = assemble(opts, lib, rng, layout);
    const errors = validateFloor(floor);
    if (errors.length === 0) return { ...floor, seed, usedSeed, attempts: attempt + 1 };
    lastErrors = errors;
  }
  throw new Error(`층 생성 실패 (${opts.kind} ${opts.floor}층, 시드 ${seed}): ${lastErrors.join(', ')}`);
}
