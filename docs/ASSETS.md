# 에셋 가이드

그래픽과 사운드는 모두 `src/assets/manifest.json`의 **키**로만 참조한다. 코드에는 파일 경로가 없다.

## 교체 방법

1. 아래 표의 경로대로 `public/assets/` 아래에 파일을 넣는다. (예: `public/assets/sprites/player_warrior.png`)
2. 개발 서버는 자동으로 새로고침된다. 배포판은 푸시하면 다시 빌드된다.
3. 파일이 없는 키는 플레이스홀더로 자동 생성된다.
   - 스프라이트: 단색 사각형 (플레이어=흰색 계열, 몬스터=빨강 계열, 보스=보라 계열, 파란 포탈=파랑, 빨간 포탈=빨강). 오른쪽 위의 점이 바라보는 방향.
   - 배경(`bg_*`, `fg_*`): 테마 팔레트(`src/config/themes.ts`)로 절차 생성한 실루엣 (시드 고정, 매번 같은 모양).
   - 타일셋: 테마 색의 단색 타일. 비밀 벽(`breakable`)은 일반 벽과 거의 같게 그려야 한다 (가는 금 정도만).

프레임 크기나 애니메이션 프레임/FPS를 바꾸려면 `manifest.json`만 고치면 된다. 코드 수정은 필요 없다.

## 규칙

- 내부 해상도 480×270, 타일 16px, 정수배 확대. 픽셀아트 전용(안티앨리어싱 없음).
- 스프라이트시트는 프레임을 **가로 한 줄**로 배치한다. 프레임 번호는 왼쪽부터 0.
- 캐릭터는 **오른쪽을 바라보는 방향**으로 그린다. 왼쪽은 게임이 좌우 반전한다.
- 애니메이션 키 규칙: `{entity}_{action}` (예: `player_warrior_run`, `boss_cave_telegraph`).
- 플레이어 스프라이트는 16×24. 충돌 박스는 10×22로 발밑 중앙 정렬(스프라이트보다 약간 작음).
- 보스 스프라이트는 64px 안팎 자유. 히트박스는 외형보다 약간 작게 잡힌다.
- 배경 레이어(far/mid/near)는 가로로 반복(타일링)되며 시차 스크롤한다. near/fg는 투명 영역이 있는 PNG를 권장.
- 오디오는 mp3. 없는 사운드는 재생하지 않는다(무음). `bgm_*`는 반복 재생, 보스전에는 `bgm_boss`.
- 배경 레이어 시차 배율: far 0.08, mid 0.25, near 0.55, 전경(fg) 1.25 (`src/fx/Scenery.ts`). far는 불투명, 나머지는 투명 PNG.
- 보스 애니메이션 동작: `idle`(대기), `telegraph`(예고, 공격 전 반드시 재생), `attack`, `recover`(후딜레이, 반격 기회), `hurt`(2페이즈 전환).

## 에셋 목록

아래 표는 `node scripts/gen-assets-doc.mjs`로 manifest에서 생성한다.

<!-- ASSET-TABLE:START -->
### 스프라이트시트

| 키 | 파일 | 프레임 크기 | 애니메이션 (프레임 / fps) |
|---|---|---|---|
| `player_warrior` | `sprites/player_warrior.png` | 16×24 (가로로 12칸 이상) | `player_warrior_idle` [0,1] 3fps 반복<br>`player_warrior_run` [2,3,4,5] 10fps 반복<br>`player_warrior_jump` [6] 1fps<br>`player_warrior_fall` [7] 1fps<br>`player_warrior_attack` [8,9] 16fps<br>`player_warrior_hurt` [10] 1fps<br>`player_warrior_skill` [11] 1fps |
| `player_rogue` | `sprites/player_rogue.png` | 16×24 (가로로 12칸 이상) | `player_rogue_idle` [0,1] 3fps 반복<br>`player_rogue_run` [2,3,4,5] 10fps 반복<br>`player_rogue_jump` [6] 1fps<br>`player_rogue_fall` [7] 1fps<br>`player_rogue_attack` [8,9] 16fps<br>`player_rogue_hurt` [10] 1fps<br>`player_rogue_skill` [11] 1fps |
| `player_archer` | `sprites/player_archer.png` | 16×24 (가로로 12칸 이상) | `player_archer_idle` [0,1] 3fps 반복<br>`player_archer_run` [2,3,4,5] 10fps 반복<br>`player_archer_jump` [6] 1fps<br>`player_archer_fall` [7] 1fps<br>`player_archer_attack` [8,9] 16fps<br>`player_archer_hurt` [10] 1fps<br>`player_archer_skill` [11] 1fps |
| `player_mage` | `sprites/player_mage.png` | 16×24 (가로로 12칸 이상) | `player_mage_idle` [0,1] 3fps 반복<br>`player_mage_run` [2,3,4,5] 10fps 반복<br>`player_mage_jump` [6] 1fps<br>`player_mage_fall` [7] 1fps<br>`player_mage_attack` [8,9] 16fps<br>`player_mage_hurt` [10] 1fps<br>`player_mage_skill` [11] 1fps |
| `monster_slime` | `sprites/monster_slime.png` | 16×12 (가로로 5칸 이상) | `monster_slime_move` [0,1] 6fps 반복<br>`monster_slime_attack` [2,3] 8fps<br>`monster_slime_hurt` [4] 1fps |
| `monster_bat` | `sprites/monster_bat.png` | 16×12 (가로로 5칸 이상) | `monster_bat_move` [0,1] 6fps 반복<br>`monster_bat_attack` [2,3] 8fps<br>`monster_bat_hurt` [4] 1fps |
| `monster_spitter` | `sprites/monster_spitter.png` | 16×16 (가로로 5칸 이상) | `monster_spitter_move` [0,1] 6fps 반복<br>`monster_spitter_attack` [2,3] 8fps<br>`monster_spitter_hurt` [4] 1fps |
| `monster_knight` | `sprites/monster_knight.png` | 16×24 (가로로 5칸 이상) | `monster_knight_move` [0,1] 6fps 반복<br>`monster_knight_attack` [2,3] 8fps<br>`monster_knight_hurt` [4] 1fps |
| `monster_wisp` | `sprites/monster_wisp.png` | 12×12 (가로로 5칸 이상) | `monster_wisp_move` [0,1] 6fps 반복<br>`monster_wisp_attack` [2,3] 8fps<br>`monster_wisp_hurt` [4] 1fps |
| `monster_turret` | `sprites/monster_turret.png` | 16×16 (가로로 5칸 이상) | `monster_turret_move` [0,1] 6fps 반복<br>`monster_turret_attack` [2,3] 8fps<br>`monster_turret_hurt` [4] 1fps |
| `monster_crawler` | `sprites/monster_crawler.png` | 20×12 (가로로 5칸 이상) | `monster_crawler_move` [0,1] 6fps 반복<br>`monster_crawler_attack` [2,3] 8fps<br>`monster_crawler_hurt` [4] 1fps |
| `monster_eye` | `sprites/monster_eye.png` | 16×16 (가로로 5칸 이상) | `monster_eye_move` [0,1] 6fps 반복<br>`monster_eye_attack` [2,3] 8fps<br>`monster_eye_hurt` [4] 1fps |
| `monster_caster` | `sprites/monster_caster.png` | 16×24 (가로로 5칸 이상) | `monster_caster_move` [0,1] 6fps 반복<br>`monster_caster_attack` [2,3] 8fps<br>`monster_caster_hurt` [4] 1fps |
| `boss_cave` | `sprites/boss_cave.png` | 64×48 (가로로 8칸 이상) | `boss_cave_idle` [0,1] 3fps 반복<br>`boss_cave_telegraph` [2,3] 8fps 반복<br>`boss_cave_attack` [4,5] 10fps 반복<br>`boss_cave_recover` [6] 1fps<br>`boss_cave_hurt` [7] 1fps |
| `boss_ruins` | `sprites/boss_ruins.png` | 40×56 (가로로 8칸 이상) | `boss_ruins_idle` [0,1] 3fps 반복<br>`boss_ruins_telegraph` [2,3] 8fps 반복<br>`boss_ruins_attack` [4,5] 10fps 반복<br>`boss_ruins_recover` [6] 1fps<br>`boss_ruins_hurt` [7] 1fps |
| `boss_abyss` | `sprites/boss_abyss.png` | 64×64 (가로로 8칸 이상) | `boss_abyss_idle` [0,1] 3fps 반복<br>`boss_abyss_telegraph` [2,3] 8fps 반복<br>`boss_abyss_attack` [4,5] 10fps 반복<br>`boss_abyss_recover` [6] 1fps<br>`boss_abyss_hurt` [7] 1fps |
| `boss_final` | `sprites/boss_final.png` | 72×80 (가로로 8칸 이상) | `boss_final_idle` [0,1] 3fps 반복<br>`boss_final_telegraph` [2,3] 8fps 반복<br>`boss_final_attack` [4,5] 10fps 반복<br>`boss_final_recover` [6] 1fps<br>`boss_final_hurt` [7] 1fps |
| `portal_blue` | `sprites/portal_blue.png` | 24×32 (가로로 4칸 이상) | `portal_blue_idle` [0,1,2,3] 8fps 반복 |
| `portal_red` | `sprites/portal_red.png` | 24×32 (가로로 4칸 이상) | `portal_red_idle` [0,1,2,3] 8fps 반복 |
| `chest` | `sprites/chest.png` | 16×16 (가로로 2칸 이상) | `chest_closed` [0] 1fps<br>`chest_open` [1] 1fps |
| `altar` | `sprites/altar.png` | 16×24 (가로로 2칸 이상) | `altar_idle` [0] 1fps<br>`altar_used` [1] 1fps |
| `fx_slash` | `sprites/fx_slash.png` | 32×24 (가로로 3칸 이상) | `fx_slash_play` [0,1,2] 24fps |
| `proj_arrow` | `sprites/proj_arrow.png` | 12×4 (가로로 1칸 이상) | - |
| `proj_orb` | `sprites/proj_orb.png` | 10×10 (가로로 2칸 이상) | `proj_orb_fly` [0,1] 10fps 반복 |
| `proj_enemy` | `sprites/proj_enemy.png` | 6×6 (가로로 1칸 이상) | - |
| `proj_boss` | `sprites/proj_boss.png` | 10×10 (가로로 1칸 이상) | - |
| `pickup_heal` | `sprites/pickup_heal.png` | 8×8 (가로로 1칸 이상) | - |

### 타일셋

| 키 | 파일 | 규격 |
|---|---|---|
| `tiles_cave` | `tiles/cave.png` | 16px 타일 6칸 가로: [빈칸, 벽, 단방향 발판, 가시, 부서지는 벽, 봉쇄] |
| `tiles_ruins` | `tiles/ruins.png` | 16px 타일 6칸 가로: [빈칸, 벽, 단방향 발판, 가시, 부서지는 벽, 봉쇄] |
| `tiles_abyss` | `tiles/abyss.png` | 16px 타일 6칸 가로: [빈칸, 벽, 단방향 발판, 가시, 부서지는 벽, 봉쇄] |

### 이미지

| 키 | 파일 | 크기 |
|---|---|---|
| `bg_cave_far` | `backgrounds/cave_far.png` | 480×270 |
| `bg_cave_mid` | `backgrounds/cave_mid.png` | 480×270 |
| `bg_cave_near` | `backgrounds/cave_near.png` | 480×270 |
| `fg_cave` | `backgrounds/cave_fg.png` | 480×270 |
| `bg_ruins_far` | `backgrounds/ruins_far.png` | 480×270 |
| `bg_ruins_mid` | `backgrounds/ruins_mid.png` | 480×270 |
| `bg_ruins_near` | `backgrounds/ruins_near.png` | 480×270 |
| `fg_ruins` | `backgrounds/ruins_fg.png` | 480×270 |
| `bg_abyss_far` | `backgrounds/abyss_far.png` | 480×270 |
| `bg_abyss_mid` | `backgrounds/abyss_mid.png` | 480×270 |
| `bg_abyss_near` | `backgrounds/abyss_near.png` | 480×270 |
| `fg_abyss` | `backgrounds/abyss_fg.png` | 480×270 |
| `fx_particle` | `sprites/fx_particle.png` | 4×4 |

### 오디오

| 키 | 파일 |
|---|---|
| `sfx_jump` | `audio/sfx_jump.mp3` |
| `sfx_attack` | `audio/sfx_attack.mp3` |
| `sfx_hit` | `audio/sfx_hit.mp3` |
| `sfx_hurt` | `audio/sfx_hurt.mp3` |
| `sfx_portal` | `audio/sfx_portal.mp3` |
| `sfx_chest` | `audio/sfx_chest.mp3` |
| `sfx_boss_roar` | `audio/sfx_boss_roar.mp3` |
| `sfx_break` | `audio/sfx_break.mp3` |
| `sfx_select` | `audio/sfx_select.mp3` |
| `bgm_cave` | `audio/bgm_cave.mp3` |
| `bgm_ruins` | `audio/bgm_ruins.mp3` |
| `bgm_abyss` | `audio/bgm_abyss.mp3` |
| `bgm_boss` | `audio/bgm_boss.mp3` |
<!-- ASSET-TABLE:END -->
