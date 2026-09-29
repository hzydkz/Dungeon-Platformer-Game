/** 씬 키와 레지스트리 키. 문자열 오타 방지용. */
export const SceneKey = {
  Boot: 'Boot',
  Preload: 'Preload',
  TestRoom: 'TestRoom',
  Floor: 'Floor',
  RedDungeon: 'RedDungeon',
  Hud: 'Hud',
} as const;

export const RegistryKey = {
  runSeed: 'runSeed',
  run: 'run',
  /** HUD가 읽는 현재 층 씬 */
  hudSource: 'hudSource',
} as const;
