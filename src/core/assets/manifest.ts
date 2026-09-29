/**
 * 에셋 manifest 타입과 검증 (기획서 3.1). Phaser 비의존.
 * 코드는 파일 경로가 아니라 manifest의 키로만 그래픽을 참조한다.
 */

export interface AnimationDef {
  readonly frames: readonly number[];
  readonly fps: number;
  /** -1이면 무한 반복 */
  readonly repeat: number;
}

export interface ImageEntry {
  readonly key: string;
  readonly file: string;
  /** 플레이스홀더 크기/색 */
  readonly width: number;
  readonly height: number;
  readonly color: string;
}

export interface SpritesheetEntry {
  readonly key: string;
  readonly file: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** 플레이스홀더를 만들 때 쓰는 프레임 수 */
  readonly frameCount: number;
  readonly color: string;
  /** 동작 이름 → 애니메이션. 애니메이션 키는 `{key}_{action}` */
  readonly animations: Readonly<Record<string, AnimationDef>>;
}

export interface TilesetEntry {
  readonly key: string;
  readonly file: string;
  readonly tileSize: number;
  /** 타일 종류별 플레이스홀더 색 */
  readonly tiles: Readonly<Record<TilesetSlot, string>>;
}

export type TilesetSlot = 'wall' | 'oneway' | 'spike' | 'breakable' | 'seal';
/** 타일셋 이미지의 가로 순서. 인덱스 0은 빈 칸이므로 이미지에서는 1번 칸부터 쓴다. */
export const TILESET_SLOTS: readonly TilesetSlot[] = ['wall', 'oneway', 'spike', 'breakable', 'seal'];

export interface AudioEntry {
  readonly key: string;
  readonly file: string;
}

export interface AssetManifest {
  readonly version: number;
  readonly basePath: string;
  readonly images: readonly ImageEntry[];
  readonly spritesheets: readonly SpritesheetEntry[];
  readonly tilesets: readonly TilesetEntry[];
  readonly audio: readonly AudioEntry[];
}

export function animationKey(entityKey: string, action: string): string {
  return `${entityKey}_${action}`;
}

/** 모든 그래픽/오디오 키 */
export function allKeys(m: AssetManifest): string[] {
  return [
    ...m.images.map((e) => e.key),
    ...m.spritesheets.map((e) => e.key),
    ...m.tilesets.map((e) => e.key),
    ...m.audio.map((e) => e.key),
  ];
}

const KEY_RE = /^[a-z][a-z0-9_]*$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** manifest 규칙 위반 목록을 반환한다. 비어 있으면 정상. */
export function validateManifest(m: AssetManifest): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const key of allKeys(m)) {
    if (!KEY_RE.test(key)) errors.push(`키 형식 오류: ${key}`);
    if (seen.has(key)) errors.push(`중복 키: ${key}`);
    seen.add(key);
  }
  for (const e of m.images) {
    if (!(e.width > 0 && e.height > 0)) errors.push(`${e.key}: 크기 오류`);
    if (!COLOR_RE.test(e.color)) errors.push(`${e.key}: 색 형식 오류`);
  }
  for (const e of m.spritesheets) {
    if (!(e.frameWidth > 0 && e.frameHeight > 0 && e.frameCount > 0)) errors.push(`${e.key}: 프레임 규격 오류`);
    if (!COLOR_RE.test(e.color)) errors.push(`${e.key}: 색 형식 오류`);
    for (const [action, anim] of Object.entries(e.animations)) {
      const animKey = animationKey(e.key, action);
      if (!KEY_RE.test(animKey)) errors.push(`애니메이션 키 형식 오류: ${animKey}`);
      if (seen.has(animKey)) errors.push(`애니메이션 키가 다른 키와 겹침: ${animKey}`);
      if (anim.frames.length === 0) errors.push(`${animKey}: 프레임 없음`);
      for (const f of anim.frames) {
        if (!Number.isInteger(f) || f < 0 || f >= e.frameCount) errors.push(`${animKey}: 프레임 ${f} 범위 밖`);
      }
      if (!(anim.fps > 0)) errors.push(`${animKey}: fps 오류`);
    }
  }
  for (const e of m.tilesets) {
    for (const slot of TILESET_SLOTS) {
      if (!COLOR_RE.test(e.tiles[slot] ?? '')) errors.push(`${e.key}: ${slot} 색 오류`);
    }
  }
  return errors;
}
