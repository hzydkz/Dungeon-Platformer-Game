# 인수인계: 던전 플랫포머 (새 Claude Code 세션용)

이 문서를 처음부터 끝까지 읽고 작업을 시작할 것. 아래 "시작 프롬프트"를 새 세션에 붙여 넣으면 된다.

---

## 시작 프롬프트 (새 세션에 붙여 넣기)

```
너는 hzydkz/Dungeon-Platformer-Game 저장소의 2D 플랫포머 로그라이크(Phaser 3 + TypeScript + Vite)를 이어서 개발한다.
먼저 docs/HANDOFF.md, README.md, docs/QUESTIONS.md를 읽고 현재 상태를 파악한 다음 내 요청을 기다려라.

권한 위임 (기획자 = 저장소 소유자 hzydkz의 명시적 지시):
- 작업 브랜치에 커밋하고 푸시해도 된다.
- 작업이 끝나 검증(아래 "검증 절차")을 통과하면 main에 머지(fast-forward 우선)하고 main에도 푸시해도 된다. 매번 다시 묻지 마라.
- main에 푸시하면 GitHub Actions가 GitHub Pages(https://hzydkz.github.io/Dungeon-Platformer-Game/)에 자동 배포한다. 배포가 성공했는지 Actions 실행 결과로 확인하고 알려라.
- 단, 강제 푸시(--force)나 히스토리 재작성, 브랜치 삭제는 하지 마라. PR은 내가 요청할 때만 만든다.
- 세션 환경이 지정한 작업 브랜치가 있으면 그 브랜치에서 작업하고, 끝나면 main으로 머지한다.

작업 방식:
- 한국어로 답한다. 아첨하지 말고 분석적으로, 모르면 모른다고 하고, 내가 틀렸다고 판단되면 반박한다.
- 요청이 모호하면 시작 전에 질문한다. 기획서와 충돌하는 결정은 docs/QUESTIONS.md에 기록한다.
- 나는 아이패드 + 블루투스 Xbox 패드로 배포 사이트에서 테스트한다. 키보드로만 확인하지 말고 scripts/e2e/pad.mjs(가상 패드)로도 확인한다.
```

---

## 1. 프로젝트 개요

- 2D 사이드뷰 탐험형 플랫포머 + 순수 로그라이크. 1층→9층, 사망 시 처음부터. 참고작: 할로우 나이트(패턴 읽는 보스전, 탐사, 외형).
- 원 기획서는 첫 대화에서 받은 문서(저장소에 원문 없음). 기획서의 규칙과 수치는 코드의 `src/config/`, `src/data/`, 그리고 `docs/QUESTIONS.md`(가정/결정 28건)에 반영되어 있다.
- 마일스톤 M0~M8 전부 구현 완료. 이후 기획자 피드백으로 수정한 것:
  1. 게임패드 입력 이월 버그 (캐릭터 선택이 안 보이던 문제, 빨간 포탈 진입 직후 튕겨 나오던 문제)
  2. 보스 이동 개선 (접근/후퇴/뛰어넘기/발판 도약/회피, 상황별 패턴)
  3. 카메라: 방 단위 고정 → 층 전체 부드럽게 따라가기 (보스전만 아레나 고정)
  4. 지도: 상시 미니맵 제거 → Tab/M/View로 펼치는 양피지 약도 (실제 지형 + 보스/포탈/상자/제단/현재 위치)
  5. 스펠렁키식 모서리 잡기 (`core/movement/ledge.ts`, `config/movement.ts`의 `LEDGE_GRAB`, `Player`의 hang 상태) + 단방향 발판을 벽보다 밝은 정사각형 블록으로 표시 (QUESTIONS 29, 30)

## 2. 실행, 테스트, 배포

```bash
npm ci                  # 컨테이너가 새로 뜨면 node_modules가 없을 수 있다
npm run dev             # http://localhost:5173 (디버그 기능 켜짐)
npm test                # Vitest 222개 (시드 1,000개 맵 생성 포함, 약 5초)
npm run typecheck       # src + tests 두 tsconfig 모두
npm run build:preview   # 배포와 같은 빌드 (typecheck 포함)
```

- 배포: `.github/workflows/deploy-pages.yml`. `main`과 `claude/**` 푸시 시 test → build:preview → `gh-pages` 브랜치 → Pages. concurrency 그룹이 하나라 여러 푸시가 겹치면 앞의 실행이 취소된다(정상). 실행이 몇 분째 `in_progress`로 멈추면 `gh api -X POST repos/hzydkz/Dungeon-Platformer-Game/actions/runs/<id>/cancel`로 취소한 적이 있다.
- 이 클라우드 컨테이너에서는 github.io 접속이 막혀 있다(프록시 403). 배포 확인은 Actions 실행 결과(`pages build and deployment` 성공)로 한다.
- 디버그 키(개발/미리보기 빌드): `1` 지도 전체 공개, `2` 무적, `3` 다음 층, `4` 히트박스, `5` 보스 즉시 처치. URL `?seed=12345`로 시드 고정.

## 3. 검증 절차 (푸시 전 필수)

1. `npm run typecheck` (오류 0) — **테스트 파일 타입 오류도 배포를 깨뜨린다.** 한 번 이걸로 배포가 실패할 뻔했다.
2. `npm test` 전부 통과
3. 바꾼 기능을 브라우저에서 실제로 확인: 개발 서버를 띄우고 `scripts/e2e/play.mjs`(키보드)와 `scripts/e2e/pad.mjs`(가상 Xbox 패드)로 조작/스크린샷/상태 확인.
   - 디버그 빌드는 `window.__game`(Phaser.Game)을 노출한다. 예: `window.__game.scene.getScene('Floor').player`.
   - 개발 서버 종료 시 `pkill -f "vite --port 5173"`처럼 쓰면 같은 명령줄의 셸까지 죽는다. 별도 스크립트 파일에서 `pgrep -f "node.*vite.*--port 5173"`로 찾아 끄는 방식을 썼다.
   - play.mjs 단계 순서: 키 조작 → eval → 스크린샷 → wait. (예전에 wait를 eval 앞에 둬서 잘못된 결론을 낸 적이 있다.)
   - pad.mjs는 `stick`(유지), `btnDown`/`btnUp`으로 동시 입력(스틱을 민 채 A)을, `shot`으로 스크린샷(세 번째 인자가 파일 접두사)을 할 수 있다.
   - 버튼을 오래 누르는 패드 테스트만 하면 키보드 짧은 탭 문제를 놓친다(가변 점프가 바로 끊김). 점프 관련은 키보드 탭으로도 확인할 것.

## 4. 구조 (요점)

```
src/config/   수치 전부 (display·CAMERA, movement, generation, combat, progression, rewards, input, map, themes)
src/core/     Phaser 비의존 순수 로직 + 테스트 대상
  rng.ts, seed.ts            sfc32 시드 PRNG, deriveSeed (Math.random 금지, 테스트로 검사)
  generation/                template(ASCII 파서/규격 검사), reach(도달성 시뮬레이터), validateTemplate,
                             layout(방 그리드), floor(층 조립/검증/재생성), templateLibrary
  combat/, boss/brain.ts     스탯/피해, 보스 상태 머신(classifySituation 포함)
  map/                       exploration(방 공개), markers(약도 표식)
  loot.ts, escape.ts, character*.ts, secret.ts, run.ts
src/data/     역할군 4, 특성 10, 성격 8, 몬스터 9, 보스 4, 강화
src/rooms/    방 템플릿 ASCII (출입구 조합별 파일 11개 × 4개 + arena.txt)
src/scenes/   Boot, Preload, Title, CharacterSelect, Floor(층과 빨간 던전 공용), Hud, Reward, GameOver/Victory
src/entities/ Player, Monster, Boss, Portal, Projectile, Chest
src/combat/PlayerCombat.ts, src/fx/(Effects, Scenery), src/input/Controls.ts, src/ui/(SketchMap, text)
src/assets/manifest.json  에셋 키 → public/assets/ 파일. 없으면 플레이스홀더 자동 생성 (docs/ASSETS.md)
```

## 5. 꼭 알아야 할 설계 규칙과 함정

- **모든 수치는 config/ 또는 data/에**. 하드코딩 금지. `Math.random()` 금지(src 전체 검사 테스트 있음). Phaser 파티클 내부 난수는 연출 전용이라 허용.
- **방 템플릿 규격** (`config/generation.ts`의 `DOOR`): 30×17, 좌우 출입구 12~15행, 상하 출입구 13~16열. 위 출입구가 있는 방은 2행 13~16열이 **반드시 `=`(단방향)** — 천장 바로 아래 1칸은 몸(22px)이 안 들어가서 벽이면 갇힌다. 아래 출입구가 있는 방은 16행 11·12·17·18열 벽 + 그 위 13~15행 비움.
- **발판 높이 계산 실수 주의**: "3타일 오르기" = 서 있는 바닥 윗면끼리 3칸 차이. 템플릿 작성 중 여러 번 4칸으로 잘못 셌다. 템플릿을 고치면 `npm test`가 도달 불가 위치를 알려 준다.
- **도달성 검증기**(`core/generation/reach.ts`)는 게임과 같은 `PlayerMotor`와 타일 충돌로 조작을 시뮬레이션한다. 물리값/가시 판정/몸 크기를 바꾸면 검증기도 같은 값을 쓰므로 템플릿이 실패할 수 있다. 가장 느린 이동속도(강철 피부 0.9배) 기준(`MIN_SPEED_MULTIPLIER`).
- **입력** (`input/Controls.ts`): 새 씬의 게임패드 객체는 첫 프레임 버튼 값이 비어 있다. 패드 버튼은 그 씬에서 한 번 떼어진 걸 본 뒤부터 눌림으로 친다(`padArmed`). 키보드는 짧은 탭을 놓치지 않게 key down 이벤트를 래치한다. 씬 전환 관련 입력을 고칠 때 이 둘을 깨지 않게.
- **카메라/활성화**: 보스전 외에는 층 전체 따라가기. 몬스터는 방이 아니라 화면 근처(`CAMERA.wakeMargin`)에서 깨어난다. 공격 대상/투사체 판정도 같은 기준.
- **빨간 던전**: `FloorScene`을 다른 씬 키(`RedDungeon`)로 띄우고 원래 층은 sleep. 돌아올 때 WAKE 이벤트. 씬 이벤트 리스너는 재시작해도 남으므로 SHUTDOWN에서 해제한다.
- **모서리 잡기**: Arcade 물리 단계 직후(scene.update) 스프라이트 좌표는 아직 몸 좌표와 맞지 않는다. 몸 위치를 옮길 때는 몸 기준으로 계산한다(`Player.tryGrab`). 매달린 동안 중력을 끄므로, 플레이어를 순간이동시키는 코드는 `player.releaseHang()`을 먼저 부를 것.
- **보스 공격은 모두 예고(0.4초 이상)** — 테스트로 강제. 후딜레이 중에는 회피하지 않는다(반격 기회).
- 한글 글꼴은 Galmuri(픽셀, OFL)를 번들에 포함. 텍스트는 `ui/text.ts`의 `textStyle()`로.

## 6. 기획자에게 확인 중인 것

- 약도에서 포탈을 처음부터 보일지(현재: 화면에 한 번 보인 뒤 표시, `config/map.ts`의 `showUndiscoveredPortals`) — QUESTIONS 28번.
- 밸런스(역할군/몬스터/보스 수치)는 실제 플레이로 조정한 적이 없다.
- 방 사이 벽(2타일)과 출입구(4타일)를 더 크게 터서 진짜 한 덩어리 지형으로 만드는 안은 제안만 했다. 하려면 층 전체 단위 도달성 검증을 다시 설계해야 한다.
- 에셋은 전부 플레이스홀더. 기획자가 픽셀아트로 교체 예정(규격은 docs/ASSETS.md).

## 7. 기획자 성향

- 한국어. 아첨 금지, 분석적, 모르면 모른다고, 틀리면 인정, 모호하면 먼저 질문.
- 결과를 아이패드 + Xbox 패드로 배포 사이트에서 직접 해 본다. "됐다"고 보고하기 전에 실제로 확인한 것과 못 한 것을 구분해서 말할 것.
