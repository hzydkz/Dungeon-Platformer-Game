# Dungeon-Platformer-Game

2D 사이드뷰 탐험형 플랫포머 + 로그라이크. 1층부터 9층까지 올라가며, 죽으면 처음부터. Phaser 3 + TypeScript + Vite.

**플레이 (미리보기 배포):** https://hzydkz.github.io/Dungeon-Platformer-Game/ — `?seed=12345`로 시드 고정

## 조작

| 동작 | 키보드 | 게임패드 (Xbox 배치) |
|---|---|---|
| 이동 | ←→ / A D | 왼쪽 스틱 / 십자키 |
| 점프 (길게 누르면 높이) | Space / Z | A |
| 공격 (↑/↓ 누르면 위/아래) | X / J | X |
| 역할군 스킬 | C / K | B / RB |
| 포탈 진입, 상자/제단 | ↑ | 스틱 위 / 십자키 위 |
| 발판 아래로 | ↓ + 점프 (공중에서 ↓ 유지) | 같음 |
| 지도 전체 보기 | Tab / M | View |
| 메뉴 결정 | Enter / Space / Z | A / Menu |

개발/미리보기 빌드 디버그 키: `1` 지도 전체 공개, `2` 무적, `3` 다음 층, `4` 히트박스 표시, `5` 보스 즉시 처치.

## 게임 흐름

타이틀 → 캐릭터 선택(후보 3명: 역할군 + 특성 + 성격) → 1층 입구 포탈에서 등장 → 탐사 / 보스(선택) / 빨간 포탈(선택) → 출구 파란 포탈 → … → 9층 최종 보스 처치 = 클리어. 사망하면 결과 화면(도달 층, 처치 보스 수, 시드, 플레이 시간).

## 실행

```bash
npm install
npm run dev            # 개발 서버 (http://localhost:5173)
npm test               # Vitest 단위 테스트 (맵 생성 1,000시드 포함)
npm run typecheck      # 타입 검사 (src / tests)
npm run build          # 정식 빌드 (디버그 기능 꺼짐)
npm run build:preview  # 디버그 기능을 켠 미리보기 빌드 (GitHub Pages 배포용)
```

## 미리보기 배포 (GitHub Pages)

`main` 또는 `claude/**` 브랜치에 푸시하면 `.github/workflows/deploy-pages.yml`이 테스트 → 미리보기 빌드 → `gh-pages` 브랜치 반영을 한다.
최초 1회 저장소 **Settings → Pages → Source**를 "Deploy from a branch", `gh-pages` / `(root)`로 설정해야 한다.

## 구조

```
src/
  config/   수치 설정 (화면, 이동 물리, 생성, 전투, 진행, 보상, 입력, 지도, 테마)
  core/     Phaser 비의존 순수 로직: rng, seed, generation(템플릿/도달성/층), combat, boss, loot, map
  data/     역할군, 특성, 성격, 몬스터, 보스, 강화 정의
  rooms/    방 템플릿 (ASCII). 형식은 src/core/generation/template.ts
  scenes/   Boot, Preload, Title, CharacterSelect, Floor(층/빨간 던전), Hud, Reward, GameOver/Victory
  entities/ Player, Monster, Boss, Portal, Projectile, Chest
  combat/   PlayerCombat (역할군 공격/스킬, 피격)
  fx/       연출 (파티클, 흔들림, 히트스톱, 사운드, 시차 배경)
  input/    키보드 + 게임패드
  assets/   manifest.json (에셋 키) — 파일은 public/assets/
tests/      Vitest
docs/       ASSETS.md (에셋 규격), QUESTIONS.md (기획 확인 필요 사항)
```

## 방 템플릿과 도달 가능성

- 방 1칸 = 30×17 타일. 템플릿은 출입구 조합 15가지 × 3개 이상(좌우 반전 포함), 보스 아레나 3개.
- 도달성 검증기(`src/core/generation/reach.ts`)는 게임과 같은 `PlayerMotor`와 타일 충돌 규칙으로 조작을 시뮬레이션한다. 모든 템플릿은 출입구 쌍 이동, 포탈 후보/상자 도달, 빠지면 못 나오는 구덩이 없음을 테스트로 통과해야 한다.
- 템플릿을 추가/수정하면 `npm test`가 규격 위반과 도달 불가 위치를 알려준다.

## 난수 규칙

- `Math.random()` 사용 금지 (`tests/no-math-random.test.ts`가 검사). 모든 게임 랜덤은 `src/core/rng.ts`의 `Rng`(sfc32).
- 층 시드 = `deriveSeed(runSeed, floor)`, 빨간 던전 = `deriveSeed(runSeed, floor, 'red')`.

## 진행 상황

- [x] M0 프로젝트 셋업
- [x] M1 플레이어 이동 — 가변 점프/코요테/버퍼, 게임패드, 에셋 manifest + 플레이스홀더
- [x] M2 절차적 맵 생성 + 지도 — 템플릿 44개+아레나 3개, 시뮬레이션 기반 도달성 검증, 시드 1,000개 0% 실패
- [x] M3 전투 + 몬스터 — 역할군 4개 공격/스킬, 몬스터 9종(테마당 3), 층 배율, 사망 결과 화면
- [x] M4 보스 — 상태 머신(예고→공격→후딜), 보스 3종+최종 보스, 2페이즈, 보스방 봉쇄/경고
- [x] M5 층 진행 + 빨간 포탈 — 9층 흐름, 테마 전환, 빨간 포탈 알림/빨간 던전/탈출 타이머, 클리어 화면
- [x] M6 캐릭터 선택 — 후보 3명(역할군 중복 없음), 특성 10개/성격 8개, 효과별 테스트
- [x] M7 보상 + 탐사 요소 — 강화 선택, 상자, 비밀 벽, 제단, 함정 방, 회복
- [x] M8 외형 연출 + 마감 — 시차 배경 3겹 + 전경, 환경/포탈 파티클, 비네트, 흔들림/히트스톱, 사운드 훅, 게임패드
