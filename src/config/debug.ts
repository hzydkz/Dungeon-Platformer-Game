/**
 * 개발용 디버그 설정 (기획서 11장). 개발 빌드에서만 활성화.
 * 미리보기 배포(GitHub Pages)는 `--mode preview`로 빌드해 `VITE_DEBUG=true`로 켠다.
 */
export const DEBUG = {
  enabled: import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true',
  /** 시드를 지정하는 URL 파라미터 이름 (`?seed=12345`). */
  seedQueryParam: 'seed',
  /** 화면 구석에 시드 표시 */
  showSeed: true,
} as const;
