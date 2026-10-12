/**
 * src/rooms 아래(하위 폴더 포함)의 .txt 템플릿을 모두 불러와 방 모양(칸 수)별로 색인한다 (좌우 반전 변형 포함).
 * 손으로 쓴 템플릿(src/rooms/*.txt)과 자동 생성 템플릿(src/rooms/gen/*.txt, scripts/gen-rooms.mjs)을 함께 쓴다.
 */
import { parseTemplateFile, flipTemplate, type RoomTemplate } from './template';

const files = import.meta.glob('../../rooms/**/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

export const shapeKey = (cw: number, ch: number): string => `${cw}x${ch}`;

export interface TemplateLibrary {
  /** 원본 템플릿 (반전 전) */
  readonly originals: readonly RoomTemplate[];
  /** 방 모양 → 일반 템플릿 (반전 포함) */
  readonly byShape: ReadonlyMap<string, readonly RoomTemplate[]>;
  /** 보스 아레나 (반전 포함) */
  readonly arenas: readonly RoomTemplate[];
}

export function buildLibrary(originals: readonly RoomTemplate[]): TemplateLibrary {
  const byShape = new Map<string, RoomTemplate[]>();
  const arenas: RoomTemplate[] = [];
  for (const t of originals) {
    const variants = [t];
    const f = flipTemplate(t);
    // 좌우 대칭이 아닌 경우에만 반전 변형을 추가
    if (f.rows.join('\n') !== t.rows.join('\n')) variants.push(f);
    for (const v of variants) {
      if (v.arena) {
        arenas.push(v);
        continue;
      }
      const key = shapeKey(v.cw, v.ch);
      const list = byShape.get(key) ?? [];
      list.push(v);
      byShape.set(key, list);
    }
  }
  return { originals, byShape, arenas };
}

let cached: TemplateLibrary | null = null;

export function loadLibrary(): TemplateLibrary {
  if (!cached) {
    const originals = Object.entries(files)
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([path, text]) => parseTemplateFile(text, path.split('/rooms/').pop() ?? path));
    cached = buildLibrary(originals);
  }
  return cached;
}
