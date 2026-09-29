/** 층 테마 (기획서 5.2). [가정] 1~3 동굴, 4~6 폐허, 7~9 심연 */
import type { ThemeId } from '../assets/keys';

export interface ThemeDef {
  readonly id: ThemeId;
  readonly name: string;
  readonly floors: readonly number[];
  readonly music: string;
  /** 화면 배경색 (배경 레이어 뒤) */
  readonly skyColor: string;
  /** 미니맵 방 색 */
  readonly mapColor: number;
  /** 배경 플레이스홀더 팔레트 (에셋이 없을 때 절차 생성) */
  readonly palette: {
    readonly skyTop: string;
    readonly skyBottom: string;
    readonly far: string;
    readonly mid: string;
    readonly near: string;
    readonly accent: string;
  };
  /** 환경 파티클 (먼지, 포자 등) */
  readonly ambient: { readonly color: number; readonly count: number; readonly speed: number };
}

export const THEMES: readonly ThemeDef[] = [
  {
    id: 'cave',
    name: '동굴',
    floors: [1, 2, 3],
    music: 'bgm_cave',
    skyColor: '#0d0b14',
    mapColor: 0x8a7bb0,
    palette: { skyTop: '#07060c', skyBottom: '#1c1730', far: '#241e3a', mid: '#18142a', near: '#0c0a16', accent: '#6fd6c8' },
    ambient: { color: 0x9a90c0, count: 18, speed: 6 },
  },
  {
    id: 'ruins',
    name: '폐허',
    floors: [4, 5, 6],
    music: 'bgm_ruins',
    skyColor: '#12100c',
    mapColor: 0xb0a07b,
    palette: { skyTop: '#0b0a08', skyBottom: '#2a2418', far: '#3a3122', mid: '#241e14', near: '#120f0a', accent: '#e0c070' },
    ambient: { color: 0xe0c890, count: 22, speed: 10 },
  },
  {
    id: 'abyss',
    name: '심연',
    floors: [7, 8, 9],
    music: 'bgm_abyss',
    skyColor: '#07061a',
    mapColor: 0x6b6bd0,
    palette: { skyTop: '#030210', skyBottom: '#140f3a', far: '#1e1850', mid: '#120e34', near: '#08061a', accent: '#a080ff' },
    ambient: { color: 0x8878ff, count: 26, speed: 8 },
  },
];

export function themeForFloor(floor: number): ThemeDef {
  const clamped = Math.max(1, Math.min(9, floor));
  return THEMES.find((t) => t.floors.includes(clamped)) ?? (THEMES[0] as ThemeDef);
}

export function themeById(id: ThemeId): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? (THEMES[0] as ThemeDef);
}
