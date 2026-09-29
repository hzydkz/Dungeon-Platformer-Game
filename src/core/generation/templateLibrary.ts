/**
 * src/rooms/*.txt 템플릿을 모두 불러와 출입구 조합별로 색인한다 (좌우 반전 변형 포함).
 */
import { parseTemplateFile, flipTemplate, type RoomTemplate } from './template';

const files = import.meta.glob('../../rooms/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

export interface TemplateLibrary {
  /** 원본 템플릿 (반전 전) */
  readonly originals: readonly RoomTemplate[];
  /** 출입구 마스크 → 사용 가능한 템플릿 (반전 포함) */
  readonly byDoors: ReadonlyMap<number, readonly RoomTemplate[]>;
  /** 보스 아레나: 출입구 마스크(왼쪽/오른쪽) → 템플릿 */
  readonly arenas: ReadonlyMap<number, readonly RoomTemplate[]>;
}

export function buildLibrary(originals: readonly RoomTemplate[]): TemplateLibrary {
  const byDoors = new Map<number, RoomTemplate[]>();
  const arenas = new Map<number, RoomTemplate[]>();
  for (const t of originals) {
    const variants = [t];
    const f = flipTemplate(t);
    // 좌우 대칭이 아닌 경우에만 반전 변형을 추가 (출입구가 바뀌거나 모양이 다를 때)
    if (f.rows.join('\n') !== t.rows.join('\n') || f.doors !== t.doors) variants.push(f);
    for (const v of variants) {
      const target = v.arena ? arenas : byDoors;
      const list = target.get(v.doors) ?? [];
      list.push(v);
      target.set(v.doors, list);
    }
  }
  return { originals, byDoors, arenas };
}

let cached: TemplateLibrary | null = null;

export function loadLibrary(): TemplateLibrary {
  if (!cached) {
    const originals = Object.entries(files)
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([path, text]) => parseTemplateFile(text, path.split('/').pop() ?? path));
    cached = buildLibrary(originals);
  }
  return cached;
}
