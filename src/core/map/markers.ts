/**
 * 약도에 그릴 표식 목록 (기획서 6장 + 기획자 요청). Phaser 비의존.
 * - 보스: 처음부터 표시
 * - 입구 포탈: 항상 표시 (출발점)
 * - 출구/빨간 포탈: 화면에 한 번 보인 뒤부터 (설정)
 * - 상자/제단: 그 칸을 본 적이 있을 때 (시야, vision.ts), 연 상자/쓴 제단은 흐리게
 * - 상점: 처음부터 표시 (기획자 요청)
 * - 지름길 문/잠긴 문/열쇠: 그 칸을 본 적이 있을 때 (열쇠는 주운 뒤에는 숨김)
 * - 현재 위치
 */
import { MAP } from '../../config/map';
import type { GeneratedFloor } from '../generation/floor';
import type { Exploration } from './exploration';

export type MarkerKind = 'player' | 'boss' | 'entrance' | 'exit' | 'red' | 'chest' | 'altar' | 'shop' | 'gate' | 'lock' | 'key';

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
  readonly exploration: Pick<Exploration, 'isSeen' | 'revealed' | 'discoveredPortals'>;
  readonly player: { readonly x: number; readonly y: number };
  readonly chests: readonly { readonly x: number; readonly y: number; readonly room: number; readonly alive: boolean; readonly secret: boolean }[];
  readonly altar: { readonly x: number; readonly y: number; readonly room: number; readonly used: boolean } | null;
  /** 상점 위치 (없으면 null) */
  readonly shop?: { readonly x: number; readonly y: number } | null;
  /** 지름길 문/잠긴 문 (숨은 방 입구는 표시하지 않는다) */
  readonly doors?: readonly { readonly x: number; readonly y: number; readonly kind: 'gate' | 'lock'; readonly opened: boolean; readonly rooms: readonly number[] }[];
  readonly key?: { readonly x: number; readonly y: number; readonly room: number; readonly taken: boolean } | null;
  /** 빨간 포탈이 이미 닫혔는지 */
  readonly redPortalClosed: boolean;
  readonly bossDefeated: boolean;
}

/** 지도 표시 옵션 (기본값은 config/map.ts) */
export interface MarkerOptions {
  readonly showPortalsAfterDiscovery: boolean;
  readonly showUndiscoveredPortals: boolean;
  readonly showBossFromStart: boolean;
}

export function mapMarkers(input: MarkerInput, options: MarkerOptions = MAP): MapMarker[] {
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
    if (!ex.isSeen(c.x, c.y) || (c.secret && c.alive)) continue;
    out.push({ kind: 'chest', x: c.x, y: c.y, label: '상자', spent: !c.alive });
  }
  if (input.altar && ex.isSeen(input.altar.x, input.altar.y)) {
    out.push({ kind: 'altar', x: input.altar.x, y: input.altar.y, label: '제단', spent: input.altar.used });
  }
  if (input.shop) out.push({ kind: 'shop', x: input.shop.x, y: input.shop.y, label: '상점', spent: false });
  for (const d of input.doors ?? []) {
    if (!ex.isSeen(d.x, d.y)) continue;
    out.push({ kind: d.kind, x: d.x, y: d.y, label: d.kind === 'gate' ? (d.opened ? '지름길' : '지름길(닫힘)') : d.opened ? '열린 문' : '잠긴 문', spent: d.opened });
  }
  if (input.key && !input.key.taken && ex.isSeen(input.key.x, input.key.y)) out.push({ kind: 'key', x: input.key.x, y: input.key.y, label: '열쇠', spent: false });
  out.push({ kind: 'player', x: input.player.x, y: input.player.y, label: '현재 위치', spent: false });
  return out;
}
