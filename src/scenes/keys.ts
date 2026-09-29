/** 씬 키와 레지스트리 키. 문자열 오타 방지용. */
export const SceneKey = {
  Boot: 'Boot',
  Preload: 'Preload',
  Title: 'Title',
  CharacterSelect: 'CharacterSelect',
  Floor: 'Floor',
  RedDungeon: 'RedDungeon',
  Hud: 'Hud',
  Reward: 'Reward',
  GameOver: 'GameOver',
  Victory: 'Victory',
} as const;

export const RegistryKey = {
  /** URL로 지정한 시드 (없으면 null) */
  seedOverride: 'seedOverride',
  run: 'run',
  /** HUD가 읽는 현재 층 씬 */
  hudSource: 'hudSource',
} as const;
