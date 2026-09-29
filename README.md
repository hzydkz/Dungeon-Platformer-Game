# Dungeon-Platformer-Game

2D 사이드뷰 탐험형 플랫포머 + 로그라이크. Phaser 3 + TypeScript + Vite.

## 실행

```bash
npm install
npm run dev        # 개발 서버 (http://localhost:5173)
npm test           # Vitest 단위 테스트
npm run typecheck  # 타입 검사 (src / tests)
npm run build      # 타입 검사 후 프로덕션 빌드 (dist/)
npm run build:preview  # 디버그 기능을 켠 미리보기 빌드 (GitHub Pages 배포용)
```

## 미리보기 배포 (GitHub Pages)

`main` 또는 `claude/**` 브랜치에 푸시하면 `.github/workflows/deploy-pages.yml`이 테스트 → 미리보기 빌드 → `gh-pages` 브랜치 반영을 한다.
최초 1회 저장소 **Settings → Pages → Source**를 "Deploy from a branch", `gh-pages` / `(root)`로 설정해야 한다.

주소: https://hzydkz.github.io/Dungeon-Platformer-Game/ (`?seed=12345`로 시드 지정 가능)

개발 빌드에서는 `?seed=12345` (또는 `?seed=0x3039`)로 런 시드를 지정할 수 있고, 화면 좌상단에 시드가 표시된다.

## 구조

```
src/
  config/   수치 설정 (화면, 이동 물리, 디버그). 코드에 수치를 하드코딩하지 않는다.
  core/     Phaser 비의존 순수 로직 (rng, seed, ...). Vitest로 테스트.
  scenes/   Phaser 씬
tests/      Vitest 테스트
docs/       QUESTIONS.md (기획 확인 필요 사항)
```

## 난수 규칙

- `Math.random()` 사용 금지 (`tests/no-math-random.test.ts`가 검사).
- 모든 랜덤은 `src/core/rng.ts`의 `Rng`(sfc32)를 거친다.
- 층 시드 = `deriveSeed(runSeed, floor)`, 빨간 던전 시드 = `deriveSeed(runSeed, floor, 'red')` (`src/core/seed.ts`).

## 진행 상황

- [x] M0 프로젝트 셋업 — 빈 씬 실행, PRNG 재현성 테스트
- [ ] M1 플레이어 이동
