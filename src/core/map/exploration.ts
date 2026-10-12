/**
 * 지도 공개 (기획서 6장 + 기획자 요청으로 변경). Phaser 비의존.
 * 방에 들어간다고 방 전체가 공개되지 않는다. 플레이어 시야(vision.ts)에 한 번 들어온 칸만 지도에 그린다.
 * 보스방 위치는 처음부터 표시한다 (테두리만).
 */
import { ROOM } from '../../config/generation';
import type { Layout } from '../generation/layout';

export class Exploration {
  readonly visited = new Set<number>();
  /** 한 칸이라도 본 방 (구역 색, 보스방 점선 테두리 판단용) */
  readonly revealed = new Set<number>();
  /** 발견한 포탈 (지도 표시 여부는 설정에 따름) */
  readonly discoveredPortals = new Set<'exit' | 'red'>();
  /** 본 칸 (y * width + x) */
  readonly seen: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** 본 칸이 늘 때마다 1씩 오른다 (지도 다시 그리기 판단) */
  version = 0;

  constructor(private readonly layout: Layout) {
    this.width = layout.gridW * ROOM.widthTiles;
    this.height = layout.gridH * ROOM.heightTiles;
    this.seen = new Uint8Array(this.width * this.height);
  }

  /** 방에 들어감. `revealAdjacent`면 연결된 인접 방 전체를 공개 (성격 '신중'). 처음 들어간 방이면 true */
  enter(room: number, revealAdjacent = false): boolean {
    if (room < 0) return false;
    const first = !this.visited.has(room);
    this.visited.add(room);
    if (revealAdjacent && first) for (const n of this.neighbors(room)) this.revealRoom(n);
    return first;
  }

  neighbors(room: number): number[] {
    const out: number[] = [];
    for (const l of this.layout.links) {
      if (l.a === room) out.push(l.b);
      else if (l.b === room) out.push(l.a);
    }
    return out;
  }

  /** 칸 하나를 본 것으로 표시. 새로 본 칸이면 true */
  markSeen(index: number): boolean {
    if (index < 0 || index >= this.seen.length || this.seen[index]) return false;
    this.seen[index] = 1;
    this.version++;
    const room = this.roomAt(index % this.width, Math.floor(index / this.width));
    if (room >= 0) this.revealed.add(room);
    return true;
  }

  isSeen(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.seen[y * this.width + x] === 1;
  }

  /** 방 전체를 본 것으로 표시 */
  revealRoom(room: number): void {
    const r = this.layout.rooms[room];
    if (!r) return;
    const x0 = r.x * ROOM.widthTiles;
    const y0 = r.y * ROOM.heightTiles;
    for (let y = y0; y < y0 + r.h * ROOM.heightTiles; y++) {
      for (let x = x0; x < x0 + r.w * ROOM.widthTiles; x++) this.markSeen(y * this.width + x);
    }
  }

  revealAll(): void {
    for (const r of this.layout.rooms) this.revealRoom(r.index);
  }

  private roomAt(x: number, y: number): number {
    const gx = Math.floor(x / ROOM.widthTiles);
    const gy = Math.floor(y / ROOM.heightTiles);
    if (gx < 0 || gy < 0 || gx >= this.layout.gridW || gy >= this.layout.gridH) return -1;
    return this.layout.cellRoom[gy * this.layout.gridW + gx] as number;
  }

  /** 방을 지도에 표시하는지 (한 칸이라도 봤거나, 보스방) */
  isShown(room: number, showBoss: boolean): boolean {
    return this.revealed.has(room) || (showBoss && room === this.layout.boss);
  }
}
