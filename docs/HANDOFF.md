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
  6. 화면 꽉 채우기(창 비율에 맞춰 보이는 범위 확장, `config/display.ts`의 `VIEW`, `ui/layout.ts`), 지도는 누르는 동안만(이동 50%),
     강화 시스템 삭제 → 아이템(3칸, F~S 등급, `data/items.ts`, `core/items.ts`, `scenes/ItemScene.ts`), 골드/상점(층마다 1곳), 레벨(`core/level.ts`). 수치는 `config/items.ts` (QUESTIONS 31~37)
  5. 스펠렁키식 모서리 잡기 (`core/movement/ledge.ts`, `config/movement.ts`의 `LEDGE_GRAB`, `Player`의 hang 상태) + 단방향 발판을 벽보다 밝은 정사각형 블록으로 표시 (QUESTIONS 29, 30)

## 2. 실행, 테스트, 배포

```bash
npm ci                  # 컨테이너가 새로 뜨면 node_modules가 없을 수 있다
npm run dev             # http://localhost:5173 (디버그 기능 켜짐)
npm test                # Vitest 545개 (약 15초) (시드 1,000개 맵 생성 포함, 약 5초)
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
   - 창 크기: 두 스크립트 모두 `VIEWPORT=1024x768` 환경 변수, play.mjs는 `{"viewport":"1400x600"}` 단계로 실행 중 변경.
   - pad.mjs `REALISTIC=1`: 버튼을 누르기 전에는 패드가 안 보이고 timestamp가 값이 바뀔 때만 갱신(실제 브라우저와 비슷). 기본 모드는 처음부터 연결.
   - pad.mjs는 `stick`(유지), `btnDown`/`btnUp`으로 동시 입력(스틱을 민 채 A)을, `shot`으로 스크린샷(세 번째 인자가 파일 접두사)을 할 수 있다.
   - 버튼을 오래 누르는 패드 테스트만 하면 키보드 짧은 탭 문제를 놓친다(가변 점프가 바로 끊김). 점프 관련은 키보드 탭으로도 확인할 것.

## 4. 구조 (요점)

```
src/config/   수치 전부 (display·CAMERA, movement, generation, combat, progression, rewards, input, map, themes)
src/core/     Phaser 비의존 순수 로직 + 테스트 대상
  rng.ts, seed.ts            sfc32 시드 PRNG, deriveSeed (Math.random 금지, 테스트로 검사)
  generation/                template(ASCII 파서/규격 검사, 출입구 자리), reach(도달성 시뮬레이터), validateTemplate,
                             layout(방 그리드, 여러 칸 방), floor(층 조립/탐사 요소/경계 트기/층 전체 검증/재생성),
                             templateLibrary(모양별 색인), roomgen(굴 모양 방 생성기, 오프라인 전용)
  combat/, boss/brain.ts     스탯/피해, 보스 상태 머신(classifySituation 포함)
  map/                       exploration(본 칸 비트맵), vision(섀도캐스팅 시야), markers(약도 표식)
  loot.ts, escape.ts, character*.ts, secret.ts, run.ts
src/data/     역할군 4, 특성 10, 성격 8, 몬스터 9, 보스 4, 아이템 12
src/rooms/    방 템플릿 ASCII: 손으로 쓴 것(*.txt, 1×1 44개 + 아레나 3) + 자동 생성(gen/*.txt, 138개: scripts/gen-rooms.mjs)
src/scenes/   Boot, Preload, Title, CharacterSelect, Floor(층과 빨간 던전 공용), Hud, Item(보스 보상/제단/상점/아이템 교체), GameOver/Victory,
              ExploreFeatures(지름길 레버, 열쇠/잠긴 문, 숨은 방 알림, 구역 알림), Fog(시야 안개)
src/entities/ Player, Monster, Boss, Portal, Projectile, Chest
src/combat/PlayerCombat.ts, src/fx/(Effects, Scenery), src/input/Controls.ts, src/ui/(SketchMap, text)
src/assets/manifest.json  에셋 키 → public/assets/ 파일. 없으면 플레이스홀더 자동 생성 (docs/ASSETS.md)
```

## 5. 꼭 알아야 할 설계 규칙과 함정

- **모든 수치는 config/ 또는 data/에**. 하드코딩 금지. `Math.random()` 금지(src 전체 검사 테스트 있음). Phaser 파티클 내부 난수는 연출 전용이라 허용.
- **방 템플릿 규격** (`config/generation.ts`의 `DOOR`): 크기는 30×17 칸의 배수(1×1, 2×1, 3×1, 1×2, 2×2). 가장자리의 칸 구간마다 출입구 자리: 좌우 low 12~15행/high 4~7행(바로 아래 행이 바닥), 상하 left 5~8/mid 13~16/right 21~24열. 그 자리가 모두 `D`면 그 출입구를 쓸 수 있고, 층에서는 쓰는 출입구만 열린다(나머지 D는 벽). 위 출입구 자리 아래 2행은 **반드시 `=`(발사대)** — 천장 바로 아래 1칸은 몸(22px)이 안 들어가서 벽이면 갇힌다. 아래 출입구 자리 양옆 두 칸은 바닥 행이 벽(착지 턱), 그 위 3행은 비움. 이웃한 두 방은 양쪽 템플릿이 모두 가진 자리로 이어진다(`floor.ts`의 assignTemplates).
- **템플릿 검증**은 모든 출입구를 열고 출입구마다 따로 떨어진 스텁을 붙여 "모든 출입구 쌍 이동 + 표식 도달 + 구덩이 없음"을 본다. 그래서 일부만 열어도 이어진다.
- **템플릿 정리** (`core/generation/prune.ts`, `node scripts/prune-rooms.mjs`): 지워도 검증을 통과하는 넝쿨/단방향 발판을 지우고 몬스터 표식(M)을 지운다. 모든 출입구를 연 상태만 보면 안 된다(열린 출입구 자리를 발판 삼는 길만 남아 층 검증이 자주 실패했다): 하나씩 닫은 상태/하나만 연 상태/위 출입구를 모두 닫은 상태도 본다. 템플릿을 고치거나 다시 생성하면 다시 돌릴 것(4코어면 파일을 나눠 병렬로).
- **몬스터** : 템플릿 M이 아니라 `floor.ts`의 `placeMonsters`가 막힌 블록 위에 놓는다(`MONSTER_SPAWN`). 처치하면 `FloorScene.respawns`에 넣어 20초 뒤 같은 자리에 다시 만든다.
- **자동 생성 방** (`core/generation/roomgen.ts`, `node scripts/gen-rooms.mjs`): 굴을 파고 도달성 시뮬레이터로 막힌 곳에 넝쿨(`|`)을 늘어뜨린다(실패하면 단방향 발판 사다리). 수평 틈은 바위 턱. 물리값/몸 크기/가시 판정/출입구 규격을 바꾸면 **생성기를 다시 돌리고** `npm test`로 확인할 것. 생성 결과 파일은 직접 고치지 않는다.
- **방 경계 트기 + 층 전체 검증**: 좌우로 이어진 방 사이 벽을 양쪽이 빈 높이에서 허문다(`widenSeams`). 이건 방 단위 보장 밖이라 `generateFloor`가 층 전체를 시뮬레이션(`floorReachErrors`, 이 컨테이너에서 층당 약 0.3초)하고, 실패하면 트지 않은 층을 쓴다. 대량 생성 테스트는 `reachCheck: false`로 끈다(안 끄면 테스트가 2분 넘게 걸린다).
- **탐사 요소** (`planExploration`): 지름길(gate)은 레이아웃에 연결을 더하므로 템플릿 배정 전에 정한다. 잠긴 문/지름길 문은 `Tile.Lock`/`Tile.Gate`(막힌 타일), 숨은 방 입구는 `Tile.Breakable`. 층 전체 검증은 문이 닫힌 상태에서 열쇠·레버·출구 등에 갈 수 있는지 본다. 잠긴 방 안 상자는 `locked`, 숨은 방 상자는 `secret`.
- **넝쿨** (`Tile.Vine`, 충돌 없음): `Player.tryVine/tickVine`, 몸 위치를 직접 옮기지 말고 속도로(직접 옮기면 충돌을 건너뛰어 벽에 끼었다). 뛰어내린 넝쿨은 잠시 다시 붙잡지 않는다(`vineLeft`). 도달성 검증기는 `addVineEdges`(넝쿨 아무 칸에서 붙잡아 위아래 아무 칸으로 내림). 생성기 무한 루프를 한 번 냈다(같은 열 sx == tx). 생성기를 고치면 시간 제한을 두고 돌릴 것.
- **시야와 지도** (`core/map/vision.ts`, `scenes/Fog.ts`): 막힌 타일(`isSolidTile`)이 시야를 가린다. 안개는 타일 1개 = 1픽셀 캔버스를 16배로 늘린(선형 보간) 이미지(depth 35). 보이는 칸은 `Exploration.markSeen`으로 기록하고, 지도(SketchMap)와 표식(markers)은 `isSeen`만 본다. 몬스터 표시/포탈 발견도 시야 기준. 지도 전체 공개 디버그는 `fog.invalidate()`도 부른다.
- **타일 충돌 면** (`scenes/tilemap.ts`의 `fixOneWayFaces`): Phaser는 이웃이 충돌 타일이면 그쪽 면을 끈다. 단방향 블록도 충돌 타일이라 그 아래 바닥 윗면이 꺼져, ↓+점프로 단방향 블록을 통과하면 아래 벽을 전부 뚫고 떨어졌다(기획자 영상 제보). 타일을 바꾸는 코드는 반드시 `setMapTile`을 쓸 것.
- **블록 주석 안에 `**/` 금지**: 글롭 경로를 주석에 쓰다가 주석이 닫혀 빌드가 깨진 적이 있다.
- **발판 높이 계산 실수 주의**: "3타일 오르기" = 서 있는 바닥 윗면끼리 3칸 차이. 템플릿 작성 중 여러 번 4칸으로 잘못 셌다. 템플릿을 고치면 `npm test`가 도달 불가 위치를 알려 준다.
- **도달성 검증기**(`core/generation/reach.ts`)는 게임과 같은 `PlayerMotor`와 타일 충돌로 조작을 시뮬레이션한다. 물리값/가시 판정/몸 크기를 바꾸면 검증기도 같은 값을 쓰므로 템플릿이 실패할 수 있다. 가장 느린 이동속도(강철 피부 0.9배) 기준(`MIN_SPEED_MULTIPLIER`).
- **입력** (`input/Controls.ts`): 패드는 Phaser의 Gamepad 래퍼가 아니라 `navigator.getGamepads()`를 직접 읽는다(래퍼는 값이 정확히 1일 때만 눌림, 씬 전환 뒤 값이 바뀔 때까지 무시해서 브라우저마다 달라질 수 있음). 패드 버튼은 그 씬에서 한 번 떼어진 걸 본 뒤부터 눌림으로 친다(`padArmed`, 이전 씬 입력 이월 방지). 단, 페이지에서 패드가 처음 보이는 프레임의 누름은 바로 인정한다(Safari/Chrome은 버튼을 눌러야 패드를 알려 줌). 디버그는 LB + 버튼(`INPUT.gamepad.debugButtons`). 기획자는 아이패드라 키보드가 없다: **새 기능은 패드만으로 되는지 반드시 확인**. 키보드는 짧은 탭을 놓치지 않게 key down 이벤트를 래치한다. 씬 전환 관련 입력을 고칠 때 이 둘을 깨지 않게.
- **화면 크기는 고정이 아니다**: 내부 해상도가 480×270~640×360 사이로 바뀌고 실행 중에도 바뀐다(창 크기/회전). `DISPLAY.width/height`는 기준값일 뿐. 메뉴는 `centerBaseLayout`(카메라를 옮겨 480×270 배치를 가운데로), HUD처럼 가장자리에 붙는 것은 `onResize`로 `scene.scale.width/height`에 맞춰 다시 배치한다.
- **새 씬의 create()에서 `this.time.now`는 아직 갱신 전**이라 "N초 동안 입력 무시"를 create에서 계산하면 안 된다(첫 update에서 정할 것). 메뉴 반복 이동은 그 씬에서 새로 누른 방향에만 적용된다(`Controls.menuHeldFromPress`) — 상점을 연 스틱 ↑가 메뉴를 움직이던 버그가 있었다.
- **카메라/활성화**: 보스전 외에는 층 전체 따라가기. 몬스터는 방이 아니라 화면 근처(`CAMERA.wakeMargin`)에서 깨어난다. 공격 대상/투사체 판정도 같은 기준.
- **빨간 던전**: `FloorScene`을 다른 씬 키(`RedDungeon`)로 띄우고 원래 층은 sleep. 돌아올 때 WAKE 이벤트. 씬 이벤트 리스너는 재시작해도 남으므로 SHUTDOWN에서 해제한다.
- **모서리 잡기**: Arcade 물리 단계 직후(scene.update) 스프라이트 좌표는 아직 몸 좌표와 맞지 않는다. 몸 위치를 옮길 때는 몸 기준으로 계산한다(`Player.tryGrab`). 매달린 동안 중력을 끄므로, 플레이어를 순간이동시키는 코드는 `player.releaseHang()`을 먼저 부를 것.
- **보스 공격은 모두 예고(0.4초 이상)** — 테스트로 강제. 후딜레이 중에는 회피하지 않는다(반격 기회).
- 한글 글꼴은 Galmuri(픽셀, OFL)를 번들에 포함. 텍스트는 `ui/text.ts`의 `textStyle()`로.

## 6. 기획자에게 확인 중인 것

- 약도에서 포탈을 처음부터 보일지(현재: 화면에 한 번 보인 뒤 표시, `config/map.ts`의 `showUndiscoveredPortals`) — QUESTIONS 28번.
- 자동 생성 방의 오르기 수단은 넝쿨로 바꿨다(QUESTIONS 46). 2×2 방에는 아직 단방향 발판이 좀 남아 있다(넝쿨 실패 시 사다리, 발사대). 시야는 화면 안 전부(벽에 가린 곳만 검게), QUESTIONS 47, `VISION`. 넝쿨 버그 수정은 QUESTIONS 48(실기기 재현 여부 확인 필요).
- 밸런스(역할군/몬스터/보스/아이템/레벨/골드 수치)는 실제 플레이로 조정한 적이 없다. 레벨 곡선만 몬스터 수 시뮬레이션으로 맞췄다(9층 진입 Lv 12 전후).
- 방 사이 벽(2타일)과 출입구(4타일)를 더 크게 터서 진짜 한 덩어리 지형으로 만드는 안은 제안만 했다. 하려면 층 전체 단위 도달성 검증을 다시 설계해야 한다.
- 에셋은 전부 플레이스홀더. 기획자가 픽셀아트로 교체 예정(규격은 docs/ASSETS.md).

## 7. 기획자 성향

- 한국어. 아첨 금지, 분석적, 모르면 모른다고, 틀리면 인정, 모호하면 먼저 질문.
- 결과를 아이패드 + Xbox 패드로 배포 사이트에서 직접 해 본다. "됐다"고 보고하기 전에 실제로 확인한 것과 못 한 것을 구분해서 말할 것.
