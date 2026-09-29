import type Phaser from 'phaser';
import galmuri7 from 'galmuri/dist/Galmuri7.woff2?url';
import galmuri9 from 'galmuri/dist/Galmuri9.woff2?url';
import galmuri11 from 'galmuri/dist/Galmuri11.woff2?url';

/**
 * 한글 픽셀 폰트 (Galmuri, OFL-1.1). 각 폰트는 지정 픽셀 크기에서 선명하게 보인다.
 * 게임 시작 전에 `loadFonts()`로 불러온다.
 */
const FONTS = [
  { family: 'Galmuri7', url: galmuri7, px: 8 },
  { family: 'Galmuri9', url: galmuri9, px: 10 },
  { family: 'Galmuri11', url: galmuri11, px: 12 },
] as const;

export type TextSize = 'tiny' | 'small' | 'large';
const BY_SIZE: Record<TextSize, (typeof FONTS)[number]> = {
  tiny: FONTS[0],
  small: FONTS[1],
  large: FONTS[2],
};

export async function loadFonts(): Promise<void> {
  await Promise.all(
    FONTS.map(async (f) => {
      try {
        const face = new FontFace(f.family, `url(${f.url})`);
        await face.load();
        document.fonts.add(face);
      } catch {
        // 폰트를 못 불러와도 게임은 기본 글꼴로 진행
      }
    }),
  );
}

export function textStyle(
  size: TextSize = 'small',
  color = '#e8e4ff',
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  const f = BY_SIZE[size];
  return { fontFamily: `${f.family}, monospace`, fontSize: `${f.px}px`, color, ...extra };
}
