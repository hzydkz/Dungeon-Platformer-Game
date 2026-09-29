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
}

export const THEMES: readonly ThemeDef[] = [
  { id: 'cave', name: '동굴', floors: [1, 2, 3], music: 'bgm_cave', skyColor: '#0d0b14', mapColor: 0x8a7bb0 },
  { id: 'ruins', name: '폐허', floors: [4, 5, 6], music: 'bgm_ruins', skyColor: '#12100c', mapColor: 0xb0a07b },
  { id: 'abyss', name: '심연', floors: [7, 8, 9], music: 'bgm_abyss', skyColor: '#07061a', mapColor: 0x6b6bd0 },
];

export function themeForFloor(floor: number): ThemeDef {
  const clamped = Math.max(1, Math.min(9, floor));
  return THEMES.find((t) => t.floors.includes(clamped)) ?? (THEMES[0] as ThemeDef);
}
