/** 개발용 디버그 설정 (기획서 11장). 개발 빌드에서만 활성화. */
export const DEBUG = {
  enabled: import.meta.env.DEV,
  /** 시드를 지정하는 URL 파라미터 이름 (`?seed=12345`). */
  seedQueryParam: 'seed',
  /** 화면 구석에 시드 표시 */
  showSeed: true,
} as const;
