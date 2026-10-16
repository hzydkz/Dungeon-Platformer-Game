/**
 * 층 생성: 레이아웃 + 템플릿 선택 + 출입구 자리 배정 + 방 경계 트기 + 내부 랜덤 요소 + 특수 위치 (기획서 5장). Phaser 비의존.
 * 층 검증에 실패하면 시드를 변형해 재생성한다 (5.4).
 */
import { DOOR, EXPLORE, FLOOR_GRID, LAYOUT, MONSTER_SPAWN, RED_LAYOUT, ROOM, ROOM_RANDOM, type DoorSlot, type SideSlot, type VerticalSlot, type ZoneKind } from '../../config/generation';
import { PROGRESSION } from '../../config/progression';
import { Rng, deriveSeed } from '../rng';
import { floorSeed, redDungeonSeed } from '../seed';
import { Tile, createGrid, getTile, isHazardTile, isOneWayTile, isSolidTile, setTile, type TileGrid } from '../tiles';
import { generateLayout, roomDistances, roomEdges, type Layout, type LayoutParams, type Link } from './layout';
import { REACH_PARAMS } from './params';
import { buildReachGraph, canReach, findVineRuns, reachableFrom, vineRunEdges, type VineRun } from './reach';
import { DIR_DELTA, OPPOSITE, isSideDir, resolveTemplate, templateHas, type DoorCap, type Marker, type RoomTemplate } from './template';
import { loadLibrary, shapeKey, type TemplateLibrary } from './templateLibrary';
import { trimUnusedUpDoor } from './trim';

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
  /** false면 층을 다 만든 뒤의 넝쿨 정리(pruneFloorVines)를 하지 않는다 (기본 true, reachCheck가 켜져 있을 때만) */
  readonly pruneVines?: boolean;
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
  /** 비밀 상자/숨은 방 상자: 열기 전에는 지도에 표시하지 않는다 */
  readonly secret: boolean;
  /** 잠긴 방 안: 열쇠로 문을 열어야 갈 수 있다 */
  readonly locked?: boolean;
}

/** 특별한 출입구: 지름길 문(gate), 잠긴 문(lock), 부서지는 벽으로 숨긴 입구(secret) */
export interface SpecialDoor {
  readonly link: number;
  readonly kind: 'gate' | 'lock' | 'secret';
  /** 양쪽 출입구 타일 */
  readonly tiles: readonly TilePos[];
  /** 지름길 문을 열 수 있는 쪽 방과 그 쪽 레버 위치 */
  readonly openRoom?: number;
  readonly lever?: TilePos;
}

export interface Zone {
  readonly kind: ZoneKind;
  readonly rooms: readonly number[];
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
  readonly specialDoors: readonly SpecialDoor[];
  /** 잠긴 방 열쇠 */
  readonly key: SpawnPoint | null;
  /** 잠긴 보물 방과 보물 상자 위치 */
  readonly vault: { readonly room: number; readonly chest: TilePos } | null;
  /** 숨은 방 (-1: 없음) */
  readonly hiddenRoom: number;
  readonly zones: readonly Zone[];
}

/** 탐사 요소 계획 (레이아웃에 지름길 연결을 더하고 연결 종류를 바꾼다) */
interface ExplorePlan {
  readonly vault: number;
  readonly hidden: number;
  /** 지름길 연결 → 열 수 있는 쪽 방 */
  readonly gates: ReadonlyMap<number, number>;
  readonly zones: readonly Zone[];
}

const NO_PLAN: ExplorePlan = { vault: -1, hidden: -1, gates: new Map(), zones: [] };

function planExploration(rng: Rng, layout: Layout, floor: number): ExplorePlan {
  const L = layout;
  const special = new Set([L.entrance, L.exit, L.red, L.boss, L.bossGate]);
  const linkCount = (r: number) => L.links.filter((l) => l.a === r || l.b === r).length;
  const normal = L.rooms.filter((r) => !r.arena && !special.has(r.index));
  // 막다른 방: 잠긴 방, 숨은 방 후보 (입구에서 2칸 이상)
  const deadEnds = normal.filter((r) => linkCount(r.index) === 1 && (L.dist[r.index] ?? 0) >= 2).map((r) => r.index);
  let vault = -1;
  let hidden = -1;
  if (deadEnds.length && rng.chance(EXPLORE.vaultChance)) {
    vault = rng.pick(deadEnds);
    L.links.find((l) => l.a === vault || l.b === vault)!.kind = 'lock';
  }
  const hiddenPool = deadEnds.filter((r) => r !== vault);
  if (hiddenPool.length && rng.chance(EXPLORE.hiddenRoomChance)) {
    hidden = rng.pick(hiddenPool);
    L.links.find((l) => l.a === hidden || l.b === hidden)!.kind = 'secret';
  }
  // 지름길: 좌우로 맞닿았지만 이어지지 않은 두 방 (입구 거리 차이가 큰 쌍), 깊은 쪽에서 연다
  const gates = new Map<number, number>();
  const excluded = new Set([vault, hidden, L.boss]);
  const linked = (a: number, b: number) => L.links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  const cands: { a: number; b: number; ax: number; ay: number; dir: 'right'; gap: number }[] = [];
  const seen = new Set<string>();
  for (const room of L.rooms) {
    if (room.arena || excluded.has(room.index)) continue;
    for (const [cx, cy] of room.cells) {
      if (cx + 1 >= L.gridW) continue;
      const other = L.cellRoom[cy * L.gridW + cx + 1] as number;
      if (other < 0 || other === room.index || excluded.has(other) || L.rooms[other]!.arena || linked(room.index, other)) continue;
      const gap = Math.abs((L.dist[room.index] ?? 0) - (L.dist[other] ?? 0));
      const key = `${room.index}-${other}`;
      if (gap < EXPLORE.shortcutMinGap || seen.has(key)) continue;
      seen.add(key);
      cands.push({ a: room.index, b: other, ax: cx, ay: cy, dir: 'right', gap });
    }
  }
  const want = EXPLORE.shortcuts[Math.min(EXPLORE.shortcuts.length, floor) - 1] ?? 0;
  // 거리 차이가 큰(많이 돌아가야 하는) 쌍부터
  for (const c of rng.shuffle(cands).sort((p, q) => q.gap - p.gap)) {
    if (gates.size >= want) break;
    if (linked(c.a, c.b)) continue;
    const idx = L.links.length;
    L.links.push({ a: c.a, b: c.b, dir: c.dir, ax: c.ax, ay: c.ay, kind: 'gate' });
    gates.set(idx, (L.dist[c.a] ?? 0) > (L.dist[c.b] ?? 0) ? c.a : c.b);
  }
  // 구역: 이어진 일반 방 몇 개
  const zones: Zone[] = [];
  const used = new Set([vault, hidden]);
  const kinds = rng.shuffle<ZoneKind>(['nest', 'trap']);
  const zoneCount = EXPLORE.zones[Math.min(EXPLORE.zones.length, floor) - 1] ?? 0;
  const eligible = (r: number) => !special.has(r) && !L.rooms[r]!.arena && !used.has(r);
  for (let z = 0; z < zoneCount; z++) {
    const seeds = normal.map((r) => r.index).filter((r) => eligible(r) && (L.dist[r] ?? 0) >= 2);
    if (!seeds.length) break;
    const size = rng.int(EXPLORE.zoneSize[0], EXPLORE.zoneSize[1]);
    const rooms = [rng.pick(seeds)];
    used.add(rooms[0]!);
    for (let i = 0; i < rooms.length && rooms.length < size; i++) {
      for (const l of rng.shuffle(L.links.filter((l) => l.kind === 'open' && (l.a === rooms[i] || l.b === rooms[i])))) {
        const n = l.a === rooms[i] ? l.b : l.a;
        if (rooms.length >= size || !eligible(n)) continue;
        rooms.push(n);
        used.add(n);
      }
    }
    zones.push({ kind: kinds[z % kinds.length]!, rooms });
  }
  return { vault, hidden, gates, zones };
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

/**
 * 방 하나의 몬스터 자리: 막힌 블록(벽) 바로 위 빈칸 중, 위로 한 칸 더 비어 있고, 가시가 없고,
 * 같은 조건의 바닥이 minRun칸 이상 이어진 곳. 서로 떨어지게, 포탈/상자 등과도 떨어지게 고른다.
 */
function placeMonsters(grid: TileGrid, room: PlacedRoom, count: number, avoid: readonly TilePos[], rng: Rng): TilePos[] {
  const S = MONSTER_SPAWN;
  const ok = (x: number, y: number) =>
    getTile(grid, x, y) === Tile.Empty &&
    getTile(grid, x, y - 1) === Tile.Empty &&
    getTile(grid, x, y + 1) === Tile.Wall &&
    !isHazardTile(getTile(grid, x - 1, y)) &&
    !isHazardTile(getTile(grid, x + 1, y));
  const cand: TilePos[] = [];
  const m = S.edgeMargin;
  for (let y = room.y + m; y < room.y + room.h - 1; y++) {
    let runStart = -1;
    for (let x = room.x + m; x <= room.x + room.w - m; x++) {
      const good = x < room.x + room.w - m && ok(x, y);
      if (good && runStart < 0) runStart = x;
      if (!good && runStart >= 0) {
        if (x - runStart >= S.minRun) for (let xx = runStart; xx < x; xx++) cand.push({ x: xx, y });
        runStart = -1;
      }
    }
  }
  const far = (a: TilePos, b: TilePos, d: number) => Math.abs(a.x - b.x) >= d || Math.abs(a.y - b.y) >= d;
  const out: TilePos[] = [];
  for (const c of rng.shuffle(cand)) {
    if (out.length >= count) break;
    if (!avoid.every((a) => far(a, c, S.clearance))) continue;
    if (!out.every((o) => (o.y === c.y ? Math.abs(o.x - c.x) >= S.spacingX : Math.abs(o.y - c.y) >= S.spacingY || Math.abs(o.x - c.x) >= S.spacingX))) continue;
    out.push(c);
  }
  return out;
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

function assemble(opts: FloorGenOptions, lib: TemplateLibrary, rng: Rng, layout: Layout, widen: boolean, plan: ExplorePlan, trimPads = widen): Assembled | null {
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
  const zoneOf = (r: number) => plan.zones.find((z) => z.rooms.includes(r))?.kind ?? null;
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
    const zone = zoneOf(r.index);
    const trap = role === 'normal' && templateHas(t, 't') && rng.chance(zone === 'trap' ? EXPLORE.trap.trapChance : trapChance);
    const hiddenRoom = r.index === plan.hidden;
    const vaultRoom = r.index === plan.vault;
    const open: DoorCap[] = roomEdges(layout, r.index).map((e) => ({ dir: e.dir, seg: e.seg, slot: slots[e.link]! }));
    const { grid: tg, markers } = resolveTemplate(t, {
      open,
      optionalOn: rng.chance(ROOM_RANDOM.optionalPlatformChance),
      trapOn: trap,
      secretActive: secretRooms.has(r.index),
    });
    // 쓰지 않는 위 출입구의 발사대 발판은 지운다 (방이 지저분해 보이지 않게, 층 전체 검증으로 확인).
    // 잠긴 방/숨은 방 안은 문이 닫힌 상태의 층 검증에 들어가지 않으므로 그대로 둔다
    if (trimPads && !hiddenRoom && !vaultRoom) {
      for (const c of t.caps) {
        if (c.dir !== 'up' || open.some((o) => o.dir === 'up' && o.seg === c.seg && o.slot === c.slot)) continue;
        trimUnusedUpDoor({ clear: (x, y) => setTile(tg, x, y, Tile.Empty) }, c);
      }
    }
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

    const zoneChest = zone === 'nest' ? EXPLORE.nest.chestMultiplier : zone === 'trap' ? EXPLORE.trap.chestMultiplier : 1;
    for (const m of world) {
      if (m.kind === 'chest') {
        const p = hiddenRoom ? EXPLORE.hiddenChestChance : ROOM_RANDOM.chestChance * (deadEnd ? ROOM_RANDOM.deadEndChestMultiplier : 1) * chestMult * zoneChest;
        if (rng.chance(p)) chests.push({ x: m.x, y: m.y, room: r.index, secret: hiddenRoom, ...(vaultRoom ? { locked: true } : {}) });
      }
      if (m.kind === 'secretChest' && secretRooms.has(r.index)) chests.push({ x: m.x, y: m.y, room: r.index, secret: true, ...(vaultRoom ? { locked: true } : {}) });
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
    const pool = rooms.filter((r) => r.role === 'normal' && r.index !== plan.vault && r.index !== plan.hidden);
    if (pool.length) {
      const room = rng.pick(pool);
      const spot = rng.pick(portalsOf(room.index));
      altar = { x: spot.x, y: spot.y, room: room.index };
    }
  }
  // 상점: 제단/함정이 없는 일반 방 하나의 포탈 후보 위치 (기획자 요청)
  let shop: SpawnPoint | null = null;
  if (opts.kind === 'floor') {
    const pool = rooms.filter(
      (r) => r.role === 'normal' && !r.trap && r.index !== altar?.room && r.index !== plan.vault && r.index !== plan.hidden && portalsOf(r.index).length > 0,
    );
    if (pool.length) {
      const room = rng.pick(pool);
      const spot = rng.pick(portalsOf(room.index));
      shop = { x: spot.x, y: spot.y, room: room.index };
    }
  }
  // 잠긴 방: 보물 상자는 그 방의 포탈 후보 중 하나, 열쇠는 입구에서 먼 다른 방 (먼 방일수록 잘 뽑힌다)
  let vault: GeneratedFloor['vault'] = null;
  let key: SpawnPoint | null = null;
  if (plan.vault >= 0) {
    const spot = rng.pick(portalsOf(plan.vault));
    vault = { room: plan.vault, chest: { x: spot.x, y: spot.y } };
    const keyRooms = rooms.filter(
      (r) => r.role === 'normal' && r.index !== plan.vault && r.index !== plan.hidden && r.index !== altar?.room && r.index !== shop?.room && (layout.dist[r.index] ?? 0) >= 2,
    );
    const fallback = rooms.filter((r) => r.role === 'normal' && r.index !== plan.vault && r.index !== plan.hidden);
    const pool = keyRooms.length ? keyRooms : fallback;
    if (pool.length) {
      const room = pool[rng.weightedIndex(pool.map((r) => 1 + (layout.dist[r.index] ?? 0)))]!;
      const ks = rng.pick(portalsOf(room.index));
      key = { x: ks.x, y: ks.y, room: room.index };
    }
  }

  // 상자와 제단/상점/열쇠/보물 상자가 같은 칸에 겹치지 않게, 상점 방에는 몬스터를 두지 않는다
  const taken = [altar, shop, key, vault ? { ...vault.chest, room: vault.room } : null].filter((p): p is SpawnPoint => p !== null);
  const filteredChests = chests.filter((ch) => !taken.some((p) => p.x === ch.x && p.y === ch.y));

  const opened = widen ? widenSeams(grid, layout, rng) : 0;

  // 특별한 출입구: 열어 둔 출입구 타일을 지름길 문/잠긴 문/부서지는 벽으로 바꾼다
  const specialDoors: SpecialDoor[] = [];
  layout.links.forEach((l, i) => {
    if (l.kind === 'open') return;
    const t = linkDoorTiles(layout, l, slots[i]!);
    const tiles = [...t.a, ...t.b];
    const tile = l.kind === 'gate' ? Tile.Gate : l.kind === 'lock' ? Tile.Lock : Tile.Breakable;
    for (const p of tiles) setTile(grid, p.x, p.y, tile);
    if (l.kind === 'secret') {
      const room = l.a === plan.hidden ? l.b : l.a;
      for (const p of tiles) secretWalls.push({ x: p.x, y: p.y, room });
    }
    if (l.kind === 'gate') {
      const openRoom = plan.gates.get(i)!;
      // 레버: 여는 쪽 방의 출입구 바로 안쪽 칸 (템플릿 규격상 바닥이 있다)
      const side = openRoom === l.a ? t.a : t.b;
      const dirFromOpen = openRoom === l.a ? l.dir : OPPOSITE[l.dir];
      const inward = dirFromOpen === 'right' ? -1 : 1;
      const bottom = side[side.length - 1]!;
      specialDoors.push({ link: i, kind: 'gate', tiles, openRoom, lever: { x: bottom.x + inward, y: bottom.y } });
    } else specialDoors.push({ link: i, kind: l.kind, tiles });
  });

  // 위아래로 이어진 방 사이 틈(아래 방의 맨 윗줄)에 단방향 발판: 아래 방 발사대에서 한 번에 위 방까지 뛰기 어렵다는 피드백.
  // 발사대 → 이 발판(2칸) → 위 방 바닥(1칸 + 옆으로)으로 두 번에 나눠 오른다. 위에서 내려올 때는 ↓+점프로 통과
  layout.links.forEach((l, i) => {
    if (l.kind !== 'open' || isSideDir(l.dir)) return;
    const lower = rooms[l.a]!.y > rooms[l.b]!.y ? rooms[l.a]! : rooms[l.b]!;
    const t = linkDoorTiles(layout, l, slots[i]!);
    for (const x of new Set([...t.a, ...t.b].map((p) => p.x))) {
      if (getTile(grid, x, lower.y) === Tile.Empty) setTile(grid, x, lower.y, Tile.OneWay);
    }
  });

  // 몬스터: 지형이 다 정해진 뒤 방마다 막힌 블록 위에 (입구/상점/잠긴 방/숨은 방/아레나 제외)
  const avoid: TilePos[] = [entrance, exitPortal, redPortal, ...taken, ...filteredChests, ...specialDoors.flatMap((d) => (d.lever ? [d.lever] : []))].filter(
    (p): p is TilePos => p !== null,
  );
  const [lo, hi] = MONSTER_SPAWN.perRoom[Math.min(MONSTER_SPAWN.perRoom.length, opts.floor) - 1]!;
  for (const r of rooms) {
    const lr = layout.rooms[r.index]!;
    if (r.role === 'entrance' || r.role === 'boss' || lr.arena || r.index === plan.vault || r.index === plan.hidden || r.index === shop?.room) continue;
    const cells = Math.min(MONSTER_SPAWN.maxCellMultiplier, lr.w * lr.h);
    const nest = zoneOf(r.index) === 'nest' ? EXPLORE.nest.monsterMultiplier : 1;
    const count = Math.round(rng.int(lo, hi) * cells * nest);
    for (const p of placeMonsters(grid, r, count, avoid, rng)) monsters.push({ x: p.x, y: p.y, room: r.index });
  }

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
    monsters,
    chests: filteredChests,
    secretWalls,
    altar,
    shop,
    specialDoors,
    key,
    vault,
    hiddenRoom: plan.hidden,
    zones: plan.zones,
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

  // 위아래 연결 틈의 단방향 발판(통과 가능)은 열린 것으로 친다
  const open = (x: number, y: number) => getTile(f.grid, x, y) === Tile.Empty || getTile(f.grid, x, y) === Tile.OneWay;
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
  const r = floorReach(f);
  return r.check(r.runs);
}

/**
 * 층 전체 이동 그래프. 넝쿨 간선은 줄기별로 따로 두어, 물리 시뮬레이션은 한 번만 하고
 * 넝쿨 줄기를 빼거나 줄인 상태의 도달성을 BFS만으로 다시 볼 수 있다 (pruneFloorVines).
 */
function floorReach(f: Assembled): {
  runs: VineRun[];
  check: (active: readonly VineRun[]) => string[];
  doors: (active: readonly VineRun[]) => boolean[];
  /** 입구에서 갈 수 있는 칸 번호 */
  reached: (active: readonly VineRun[]) => Set<number>;
} {
  const g = buildReachGraph(f.grid, REACH_PARAMS, { vines: false });
  const W = f.grid.width;
  const N = g.cells.length;
  const cell = (p: TilePos) => p.y * W + p.x;
  const baseRev: number[][] = Array.from({ length: N }, () => []);
  g.edges.forEach((es, from) => es.forEach((to) => baseRev[to]!.push(from)));
  const targets: { p: TilePos; name: string }[] = [];
  const need = (p: TilePos | null, name: string) => p && targets.push({ p, name });
  need(f.exitPortal, '출구');
  need(f.redPortal, '빨간 포탈');
  need(f.shop, '상점');
  need(f.altar, '제단');
  need(f.boss.spawn, '보스');
  for (const c of f.chests) if (!c.secret && !c.locked) need(c, '상자');
  need(f.key, '열쇠');
  for (const d of f.specialDoors) if (d.lever) need(d.lever, '지름길 레버');
  // 특별한 문 앞: 문 타일 둘레(2칸)의 서 있을 수 있는 칸. 지름길 문은 양쪽 따로, 잠긴 문/비밀 벽은 바깥쪽 아무 데나
  const doorSides: number[][] = [];
  for (const d of f.specialDoors) {
    const xs = d.tiles.map((t) => t.x);
    const ys = d.tiles.map((t) => t.y);
    const vertical = Math.min(...xs) === Math.max(...xs);
    const sides: number[][] = [[], []];
    const inDoor = new Set(d.tiles.map((t) => cell(t)));
    for (const t of d.tiles) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const c = cell({ x: t.x + dx, y: t.y + dy });
          const n = g.nodeOf[c] ?? -1;
          if (n < 0 || inDoor.has(c)) continue;
          const side = vertical ? (t.x + dx < Math.min(...xs) ? 0 : 1) : t.y + dy < Math.min(...ys) ? 0 : 1;
          sides[side]!.push(n);
        }
      }
    }
    if (d.kind === 'gate') doorSides.push(sides[0]!, sides[1]!);
    else doorSides.push([...sides[0]!, ...sides[1]!]);
  }
  const start = g.nodeOf[cell(f.entrance)] ?? -1;
  const edgeCache = new Map<string, [number, number][]>();
  const runEdges = (r: VineRun) => {
    const k = `${r.x},${r.y0},${r.y1}`;
    let e = edgeCache.get(k);
    if (!e) edgeCache.set(k, (e = vineRunEdges(f.grid, g.nodeOf, r)));
    return e;
  };
  const bfs = (base: readonly (readonly number[])[], extra: Map<number, number[]>): Uint8Array => {
    const seen = new Uint8Array(N);
    if (start < 0) return seen;
    const queue = [start];
    seen[start] = 1;
    for (let i = 0; i < queue.length; i++) {
      const n = queue[i]!;
      for (const m of base[n]!) if (!seen[m]) (seen[m] = 1), queue.push(m);
      for (const m of extra.get(n) ?? []) if (!seen[m]) (seen[m] = 1), queue.push(m);
    }
    return seen;
  };
  const evaluate = (active: readonly VineRun[]): { reach: Uint8Array; back: Uint8Array } => {
    const fwd = new Map<number, number[]>();
    const rev = new Map<number, number[]>();
    const push = (m: Map<number, number[]>, a: number, b: number) => {
      const l = m.get(a);
      if (l) l.push(b);
      else m.set(a, [b]);
    };
    for (const r of active) for (const [a, b] of runEdges(r)) (push(fwd, a, b), push(rev, b, a));
    return { reach: bfs(g.edges, fwd), back: bfs(baseRev, rev) };
  };
  const doors = (active: readonly VineRun[]): boolean[] => {
    const { reach } = evaluate(active);
    return doorSides.map((ns) => ns.some((n) => reach[n]));
  };
  const check = (active: readonly VineRun[]): string[] => {
    const { reach, back } = evaluate(active);
    const errors: string[] = [];
    for (const t of targets) {
      const n = g.nodeOf[cell(t.p)] ?? -1;
      if (n < 0 || !reach[n]) errors.push(`${t.name} (${t.p.x},${t.p.y}) 도달 불가`);
    }
    for (let n = 0; n < N; n++) {
      if (!reach[n] || back[n]) continue;
      const c = g.cells[n] as number;
      errors.push(`(${c % W},${Math.floor(c / W)})에서 입구로 돌아올 수 없음`);
      break;
    }
    return errors;
  };
  const reached = (active: readonly VineRun[]): Set<number> => {
    const { reach } = evaluate(active);
    const out = new Set<number>();
    for (let n = 0; n < N; n++) if (reach[n]) out.add(g.cells[n] as number);
    return out;
  };
  return { runs: findVineRuns(f.grid), check, doors, reached };
}

/**
 * 층을 다 만든 뒤 필요 없는 넝쿨을 지운다 (기획자 요청: 쓰지 않는 출입구처럼 막힌 곳으로 가는 넝쿨 정리).
 * 줄기마다 통째로 빼 보고, 층 전체 검증(목표 도달, 입구로 돌아오기)이 그대로면 지운다. 안 되면 위쪽 끝부터 한 칸씩 줄여 본다.
 * 층 검증은 문이 닫힌 상태라 특별한 문 앞(잠긴 문/비밀 벽 바깥, 지름길 문 양쪽)은 목표가 아니다. 그래서 정리 전에 갈 수 있던 문 앞은
 * 정리 뒤에도 갈 수 있어야 한다. 잠긴 방/숨은 방/비밀 벽이 있는 방/지름길 문 양쪽 방(과 그 둘레)은 문이나 벽을 연 뒤의 상태가
 * 검증에 들어가지 않으므로 손대지 않는다.
 * 지운 넝쿨 칸 수를 돌려준다.
 */
export function pruneFloorVines(f: Assembled, r = floorReach(f)): number {
  // 지름길 문 양쪽 방: 문을 연 뒤에만 갈 수 있는 곳에서 빠져나오는 넝쿨일 수 있다 (닫힌 상태 검증으로는 못 본다)
  const gateRooms = f.specialDoors.filter((d) => d.kind === 'gate').flatMap((d) => [f.layout.links[d.link]!.a, f.layout.links[d.link]!.b]);
  const keep = new Set<number>([f.vault?.room ?? -1, f.hiddenRoom, ...f.secretWalls.map((w) => w.room), ...gateRooms]);
  const m = 3;
  const protectedAt = (x: number, y: number) =>
    [...keep].some((ri) => {
      const pr = f.rooms[ri];
      return pr !== undefined && x >= pr.x - m && x < pr.x + pr.w + m && y >= pr.y - m && y < pr.y + pr.h + m;
    });
  let active = [...r.runs];
  let removed = 0;
  const doorsBefore = r.doors(active);
  const ok = (runs: readonly VineRun[]) => r.check(runs).length === 0 && r.doors(runs).every((v, i) => v || !doorsBefore[i]);
  const order = [...r.runs].sort((a, b) => b.y1 - b.y0 - (a.y1 - a.y0));
  for (const run of order) {
    let prot = false;
    for (let y = run.y0; y <= run.y1 && !prot; y++) prot = protectedAt(run.x, y);
    if (prot) continue;
    const others = active.filter((x) => x !== run);
    let cur: VineRun | null = run;
    if (ok(others)) cur = null;
    else {
      while (cur.y0 < cur.y1) {
        const cand: VineRun = { x: cur.x, y0: cur.y0 + 1, y1: cur.y1 };
        if (!ok([...others, cand])) break;
        cur = cand;
      }
    }
    const top = cur ? cur.y0 : run.y1 + 1;
    for (let y = run.y0; y < top; y++) setTile(f.grid, run.x, y, Tile.Empty);
    removed += top - run.y0;
    active = cur ? [...others, cur] : others;
  }
  return removed;
}

/**
 * 잠긴 방/숨은 방 안 도달성: 층 전체 검증은 문이 닫힌 상태라 이 방들의 안쪽을 보지 않는다.
 * 그 방(+여유 2칸)만 잘라 특별한 문을 연 상태로, 문 근처에서 방 안의 목표에 가고 돌아올 수 있는지 본다.
 * (템플릿 검증은 모든 출입구를 연 상태라, 출입구 하나만 열린 방에서는 출입구 자리 디딤돌이 없어 못 가는 곳이 생길 수 있다)
 */
export function sealedRoomErrors(f: Assembled): string[] {
  const errors: string[] = [];
  const check = (room: number, doorKind: SpecialDoor['kind'], targets: readonly TilePos[], name: string) => {
    const door = f.specialDoors.find((d) => d.kind === doorKind);
    if (!door) return;
    // 출발: 문 타일과 그 둘레의 서 있을 수 있는 칸
    const starts: TilePos[] = [];
    for (const t of door.tiles) for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) starts.push({ x: t.x + dx, y: t.y + dy });
    errors.push(...roomPocketErrors(f, room, door.tiles, starts, targets, name, '문'));
  };
  if (f.vault) check(f.vault.room, 'lock', [f.vault.chest, ...f.chests.filter((c) => c.room === f.vault!.room)], '잠긴 방');
  if (f.hiddenRoom >= 0) check(f.hiddenRoom, 'secret', f.chests.filter((c) => c.room === f.hiddenRoom), '숨은 방');
  return errors;
}

/**
 * 비밀 벽 뒤 비밀 상자: 층 전체 검증은 비밀 벽이 막힌 상태라 보지 않고, 템플릿 검증은 방 하나만 보므로
 * 층에서 비밀 벽까지 갈 디딤돌이 없으면 놓친다 (기획자 제보 후 발견). 그 방(+여유)만 잘라 비밀 벽을 부순 상태로,
 * 층에서 실제로 갈 수 있는 칸에서 출발해 비밀 상자에 가고 돌아올 수 있는지 본다.
 */
export function secretChestErrors(f: Assembled, reached: ReadonlySet<number>): string[] {
  const errors: string[] = [];
  const W = f.grid.width;
  const rooms = new Set(f.chests.filter((c) => c.secret && c.room !== f.hiddenRoom).map((c) => c.room));
  for (const room of rooms) {
    const walls = f.secretWalls.filter((w) => w.room === room);
    const targets = f.chests.filter((c) => c.secret && c.room === room);
    const starts = [...reached].map((c) => ({ x: c % W, y: Math.floor(c / W) }));
    errors.push(...roomPocketErrors(f, room, walls, starts, targets, '비밀 상자', '갈 수 있는 곳'));
  }
  return errors;
}

/** 방(+여유 3칸)만 잘라 open 타일을 비운 상태로, starts(층 좌표, 잘린 범위 밖은 무시)에서 targets에 가고 돌아올 수 있는지 */
function roomPocketErrors(
  f: Assembled,
  room: number,
  open: readonly TilePos[],
  starts: readonly TilePos[],
  targets: readonly TilePos[],
  name: string,
  startName: string,
): string[] {
  const r = f.rooms[room];
  if (!r || targets.length === 0) return [];
  const m = 3;
  const x0 = Math.max(0, r.x - m);
  const y0 = Math.max(0, r.y - m);
  const x1 = Math.min(f.grid.width - 1, r.x + r.w - 1 + m);
  const y1 = Math.min(f.grid.height - 1, r.y + r.h - 1 + m);
  const sub = createGrid(x1 - x0 + 1, y1 - y0 + 1, Tile.Wall);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setTile(sub, x - x0, y - y0, getTile(f.grid, x, y) as never);
  for (const t of open) setTile(sub, t.x - x0, t.y - y0, Tile.Empty);
  const g = buildReachGraph(sub, REACH_PARAMS);
  const inside = (p: TilePos) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  const cell = (p: TilePos) => (p.y - y0) * sub.width + (p.x - x0);
  const startCells = starts.filter(inside).map(cell);
  const reach = reachableFrom(g, startCells);
  const back = canReach(g, startCells);
  const errors: string[] = [];
  for (const t of targets) {
    const n = g.nodeOf[cell(t)] ?? -1;
    if (n < 0 || !reach.has(n)) errors.push(`${name} (${t.x},${t.y}) 도달 불가`);
  }
  for (const n of reach) {
    if (back.has(n)) continue;
    errors.push(`${name} 근처에서 ${startName}으로 돌아올 수 없음`);
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
    // 탐사 요소 (일반 층만): 지름길 연결을 더하고 잠긴 방/숨은 방/구역을 정한다
    const plan = opts.kind === 'floor' ? planExploration(rng, layout, opts.floor) : NO_PLAN;
    // 같은 레이아웃으로 경계를 튼 층 → 실패하면 트지 않은 층 (템플릿 검증만으로 이동이 보장된다)
    const assembleSeed = rng.int(0, 0x7fffffff);
    // 경계 트기 + 발사대 정리 → 발사대 정리만 → 둘 다 안 함 (마지막은 템플릿 검증만으로 이동이 보장된다)
    for (const [widen, trim] of [
      [true, true],
      [false, true],
      [false, false],
    ] as const) {
      const floor = assemble(opts, lib, new Rng(assembleSeed), layout, widen, plan, trim);
      if (!floor) {
        lastErrors = ['템플릿 배정 실패'];
        generationLog.push(`${attempt}: 템플릿 배정 실패`);
        break;
      }
      const errors = validateFloor(floor);
      const reach = errors.length === 0 && reachCheck ? floorReach(floor) : null;
      if (reach) errors.push(...reach.check(reach.runs), ...sealedRoomErrors(floor));
      if (reach && errors.length === 0) errors.push(...secretChestErrors(floor, reach.reached(reach.runs)));
      if (errors.length === 0) {
        // 다 만든 층에서 막힌 곳으로 가는 넝쿨을 지운다 (층 전체 이동 그래프를 그대로 써서 시뮬레이션은 다시 안 한다)
        if (reach && opts.pruneVines !== false) pruneFloorVines(floor, reach);
        return { ...floor, seed, usedSeed, attempts: attempt + 1 };
      }
      lastErrors = errors;
      generationLog.push(`${attempt}${widen ? 'w' : ''}${trim ? 't' : ''}: ${errors[0]}`);
      if (!trim) break;
    }
  }
  throw new Error(`층 생성 실패 (${opts.kind} ${opts.floor}층, 시드 ${seed}): ${lastErrors.join(', ')}`);
}

