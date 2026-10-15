/**
 * 방 템플릿 정리 (기획자 요청: 불필요한 넝쿨/단방향 발판 제거). 오프라인 전용 (scripts/prune-rooms.mjs).
 * 넝쿨 줄기와 단방향 발판 줄을 하나씩 지워 보고, 지워도 템플릿 검증(모든 출입구 쌍 이동, 표식 도달, 빠지면 못 나오는 곳 없음)을
 * 통과하면 지운다. 다 못 지우면 끝에서부터 한 칸씩 줄여 본다.
 * 몬스터는 이제 층 생성 때 막힌 블록 위에 놓으므로, 몬스터 표식(M)은 먼저 지운다 (몬스터만 서 있던 발판도 지울 수 있게).
 * 층에서는 쓰는 출입구만 열리고(나머지는 벽), 쓰지 않는 위 출입구의 발사대는 지워진다(trim.ts).
 * 그래서 출입구를 하나씩 닫은 상태, 하나만 연 상태(막다른 방), 위 출입구를 모두 닫은 상태도 검증을 통과해야 지운다
 * (원래 템플릿이 그 상태에서 통과할 때만 요구). 모든 출입구를 연 상태만 보면 열린 출입구 자리를 발판 삼는 길만 남아 층 검증이 자주 실패했다.
 */
import type { ReachParams } from './reach';
import { capTiles, lintTemplate, maskOf, type DoorCap, type RoomTemplate } from './template';
import { trimUnusedUpDoor } from './trim';
import { validateTemplate } from './validateTemplate';

export interface PruneResult {
  readonly template: RoomTemplate;
  readonly removedVine: number;
  readonly removedOneWay: number;
  /** 정리 전에 이미 검증을 통과하지 못해 손대지 않았으면 false */
  readonly ok: boolean;
}

type Cell = readonly [number, number];

export function pruneTemplate(t: RoomTemplate, p: ReachParams): PruneResult {
  const rows = t.rows.map((r) => [...r].map((c) => (c === 'M' ? '.' : c)));
  const build = (): RoomTemplate => ({ ...t, rows: rows.map((r) => r.join('')) });
  /** 출입구 일부만 연 상태: 닫은 출입구는 벽으로, 닫은 위 출입구는 층 조립처럼 발사대도 지운다 */
  const withOpen = (open: readonly DoorCap[]): RoomTemplate => {
    const g = rows.map((r) => [...r]);
    for (const c of t.caps) {
      if (open.includes(c)) continue;
      for (const [x, y] of capTiles(t, c)) g[y]![x] = '#';
      if (c.dir === 'up') trimUnusedUpDoor({ clear: (x, y) => g[y] && (g[y]![x] = '.') }, c);
    }
    return { ...t, rows: g.map((r) => r.join('')), caps: open, doors: maskOf(open.map((c) => c.dir)) };
  };
  // 층에서는 쓰는 출입구만 열린다. 출입구 하나씩 닫은 상태, 하나만 연 상태(막다른 방), 위 출입구를 모두 닫은 상태
  const subsets: DoorCap[][] = [];
  if (t.caps.length > 1) {
    for (const c of t.caps) subsets.push(t.caps.filter((x) => x !== c), [c]);
    const noUp = t.caps.filter((c) => c.dir !== 'up');
    if (noUp.length > 0 && noUp.length < t.caps.length - 1) subsets.push(noUp);
  }
  let required: DoorCap[][] = [];
  const valid = (): boolean => {
    const tt = build();
    if (lintTemplate(tt).length > 0 || validateTemplate(tt, p).length > 0) return false;
    return required.every((open) => validateTemplate(withOpen(open), p).length === 0);
  };
  if (!valid()) return { template: t, removedVine: 0, removedOneWay: 0, ok: false };
  // 원래 템플릿이 통과하는 상태만 요구한다
  required = subsets.filter((open) => validateTemplate(withOpen(open), p).length === 0);

  const at = (x: number, y: number) => rows[y]?.[x];
  const vines: Cell[][] = [];
  const ones: Cell[][] = [];
  for (let x = 0; x < t.width; x++) {
    for (let y = 0; y < t.height; y++) {
      if (at(x, y) !== '|' || at(x, y - 1) === '|') continue;
      const run: Cell[] = [];
      for (let yy = y; at(x, yy) === '|'; yy++) run.push([x, yy]);
      vines.push(run);
    }
  }
  for (let y = 0; y < t.height; y++) {
    for (let x = 0; x < t.width; x++) {
      if (at(x, y) !== '=' || at(x - 1, y) === '=') continue;
      const run: Cell[] = [];
      for (let xx = x; at(xx, y) === '='; xx++) run.push([xx, y]);
      ones.push(run);
    }
  }
  let removedVine = 0;
  let removedOneWay = 0;
  const clear = (cells: readonly Cell[]) => {
    const old = cells.map(([x, y]) => rows[y]![x]!);
    for (const [x, y] of cells) rows[y]![x] = '.';
    return () => cells.forEach(([x, y], i) => (rows[y]![x] = old[i]!));
  };
  /** 통째로 지워 보고, 안 되면 ends 순서대로 끝 칸을 하나씩 지워 본다. 지운 칸 수 */
  const tryRemove = (run: Cell[], ends: ('head' | 'tail')[]): number => {
    const undo = clear(run);
    if (valid()) return run.length;
    undo();
    let n = 0;
    const left = [...run];
    for (const end of ends) {
      while (left.length > 1) {
        const cell = end === 'head' ? left[0]! : left[left.length - 1]!;
        const u = clear([cell]);
        if (!valid()) {
          u();
          break;
        }
        if (end === 'head') left.shift();
        else left.pop();
        n++;
      }
    }
    return n;
  };
  // 넝쿨은 위쪽만 줄인다 (아래 끝은 바닥에 닿아 있어야 붙잡을 수 있다). 긴 것부터
  for (const run of vines.sort((a, b) => b.length - a.length)) removedVine += tryRemove(run, ['head']);
  for (const run of ones.sort((a, b) => a.length - b.length)) removedOneWay += tryRemove(run, ['head', 'tail']);
  return { template: build(), removedVine, removedOneWay, ok: true };
}
