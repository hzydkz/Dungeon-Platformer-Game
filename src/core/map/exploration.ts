/**
 * 방 단위 지도 공개 (기획서 6장). Phaser 비의존.
 * 방에 들어가면 그 방 전체가 공개된다. 보스방은 처음부터 보인다.
 */
import type { Layout } from '../generation/layout';

export class Exploration {
  readonly visited = new Set<number>();
  readonly revealed = new Set<number>();
  /** 발견한 포탈 (지도 표시 여부는 설정에 따름) */
  readonly discoveredPortals = new Set<'exit' | 'red'>();

  constructor(private readonly layout: Layout) {}

  /** 방에 들어감. `revealAdjacent`면 연결된 인접 방도 공개 (성격 '신중'). 처음 들어간 방이면 true */
  enter(room: number, revealAdjacent = false): boolean {
    if (room < 0) return false;
    const first = !this.visited.has(room);
    this.visited.add(room);
    this.revealed.add(room);
    if (revealAdjacent) for (const n of this.neighbors(room)) this.revealed.add(n);
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

  revealAll(): void {
    for (const r of this.layout.rooms) this.revealed.add(r.index);
  }

  /** 지도에 그릴지 */
  isShown(room: number, showBoss: boolean): boolean {
    return this.revealed.has(room) || (showBoss && room === this.layout.boss);
  }

  /** 연결선을 그릴지: 한쪽이라도 방문(공개)한 방이면 표시 */
  isLinkShown(a: number, b: number): boolean {
    return this.revealed.has(a) || this.revealed.has(b);
  }
}
