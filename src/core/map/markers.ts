/**
 * 약도에 그릴 표식 목록 (기획서 6장 + 기획자 요청). Phaser 비의존.
 * - 보스: 처음부터 표시
 * - 입구 포탈: 항상 표시 (출발점)
 * - 출구/빨간 포탈: 화면에 한 번 보인 뒤부터 (설정)
 * - 상자/제단: 공개된 방에 있을 때, 연 상자/쓴 제단은 흐리게
 * - 현재 위치
 */
import { MAP } from '../../config/map';
import type { GeneratedFloor } from '../generation/floor';
import type { Exploration } from './exploration';

export type MarkerKind = 'player' | 'boss' | 'entrance' | 'exit' | 'red' | 'chest' | 'altar';

export interface MapMarker {
  readonly kind: MarkerKind;
  /** 타일 좌표 */
  readonly x: number;
  readonly y: number;
  readonly label: string;
  /** 이미 쓴 것 (연 상자, 쓴 제단) */
  readonly spent: boolean;
}

export interface MarkerInput {
  readonly floor: Pick<GeneratedFloor, 'entrance' | 'exitPortal' | 'redPortal' | 'boss' | 'rooms' | 'kind'>;
  readonly exploration: Pick<Exploration, 'revealed' | 'discoveredPortals'>;
  readonly player: { readonly x: number; readonly y: number };
  readonly chests: readonly { readonly x: number; readonly y: number; readonly room: number; readonly alive: boolean; readonly secret: boolean }[];
  readonly altar: { readonly x: number; readonly y: number; readonly room: number; readonly used: boolean } | null;
  /** 빨간 포탈이 이미 닫혔는지 */
  readonly redPortalClosed: boolean;
  readonly bossDefeated: boolean;
}

export function mapMarkers(input: MarkerInput, options = MAP): MapMarker[] {
  const out: MapMarker[] = [];
  const f = input.floor;
  const ex = input.exploration;
  const portalVisible = (kind: 'exit' | 'red') =>
    options.showUndiscoveredPortals || (options.showPortalsAfterDiscovery && ex.discoveredPortals.has(kind));

  if (options.showBossFromStart || ex.revealed.has(f.boss.room)) {
    const r = f.rooms[f.boss.room]!;
    out.push({ kind: 'boss', x: r.x + r.w / 2, y: r.y + r.h / 2, label: input.bossDefeated ? '보스 (처치)' : '보스', spent: input.bossDefeated });
  }
  out.push({ kind: 'entrance', x: f.entrance.x, y: f.entrance.y, label: f.kind === 'red' ? '탈출 포탈' : '입구', spent: false });
  if (f.exitPortal && portalVisible('exit')) out.push({ kind: 'exit', x: f.exitPortal.x, y: f.exitPortal.y, label: '출구', spent: false });
  if (f.redPortal && !input.redPortalClosed && portalVisible('red')) {
    out.push({ kind: 'red', x: f.redPortal.x, y: f.redPortal.y, label: '빨간 포탈', spent: false });
  }
  for (const c of input.chests) {
    // 비밀 상자는 열기 전에는 표시하지 않는다
    if (!ex.revealed.has(c.room) || (c.secret && c.alive)) continue;
    out.push({ kind: 'chest', x: c.x, y: c.y, label: '상자', spent: !c.alive });
  }
  if (input.altar && ex.revealed.has(input.altar.room)) {
    out.push({ kind: 'altar', x: input.altar.x, y: input.altar.y, label: '제단', spent: input.altar.used });
  }
  out.push({ kind: 'player', x: input.player.x, y: input.player.y, label: '현재 위치', spent: false });
  return out;
}
