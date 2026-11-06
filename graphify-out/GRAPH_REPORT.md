# Graph Report - GridBrawl  (2026-09-17)

## Corpus Check
- 248 files · ~172,159 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 30 file(s) not represented in the graph (top: .xml 7, (none) 6, .css 3)

## Summary
- 1108 nodes · 2823 edges · 61 communities (50 shown, 4 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 50 edges (avg confidence: 0.81)
- Token cost: 369,393 input · 0 output

## Community Hubs (Navigation)
- App Shell & Deck Building
- Battle Presentation & Sprites
- Online Multiplayer P2P
- Balance Admin Tool
- Run Simulator (simrun)
- Relics & Rewards
- Package & Capacitor Config
- Engine Constants & Card Types
- Card Display & Abilities
- Procedural SVG Art
- CPU AI (decideAI)
- Project Guide & Balance Policy
- CardBattle Engine Core
- App Icon Generator
- Run State & Deck Picker
- Status Effects & Classes
- Monster Scaling & Run Map
- iOS AppDelegate
- TypeScript Config
- Run Difficulty & Progress
- Card Upgrades & Shop Rules
- Invariant Checks (checkhooks)
- Turn Resolution Rules (GDD)
- Run Battle Setup
- Boss Scripts
- Boss Cards
- Status Effect Redefinition
- Sprite Packer
- 3-Class Roster & AI Tiers
- PvP Simulator
- Monster Definitions
- Run Cards
- Rock Terrain Assets
- Common Cards & Session
- Sprite & Background Specs
- Battle State View
- Android Test Stubs
- Native App & Login Gate
- Class Identity & Range Symmetry
- Passives & Relic Hooks
- Scenes & Boss Cinematics
- Facing, Knockback & Lockstep
- Monster Behavior Variation
- Run Core Loop & BattleOpts
- Upgrade Rules
- Class Basics & Deck Cap
- Range Conventions
- Run Helpers
- Gradle Wrapper
- Android MainActivity
- Rock Geometry
- Vite Env Types
- Card Compact & Preview
- Swift Package

## God Nodes (most connected - your core abstractions)
1. `getChar()` - 46 edges
2. `BattleScreen()` - 37 edges
3. `decideAI()` - 36 edges
4. `CardDef` - 36 edges
5. `CardBattle` - 31 edges
6. `ROSTER` - 25 edges
7. `runFightProps` - 22 edges
8. `App()` - 21 edges
9. `cardAccent()` - 21 edges
10. `react` - 20 edges

## Surprising Connections (you probably didn't know these)
- `몬스터 대각 접근(approachCards)` --references--> `decideAI()`  [INFERRED]
  CLAUDE.md → src/battle/ai.ts
- `clipOrFallback(attack1→idle)` --references--> `SHEETS`  [INFERRED]
  public/sprites/README.md → src/art/sprites.ts
- `THREAT_DAMAGE` --references--> `reactSlot (라운드에 한 번, 제일 아픈 한 장)`  [INFERRED]
  src/battle/ai.ts → docs/ROGUELIKE.md
- `BattleOpts (chars/passives/startHp/startCells/obstacles)` --references--> `START_CELLS`  [EXTRACTED]
  docs/GAME_DESIGN.md → src/battle/types.ts
- `bossPlan()` --references--> `화염군주 (길어질수록 무거워진다 · lava · 불씨 모으기)`  [EXTRACTED]
  src/game/bosses.ts → docs/ROGUELIKE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **상태이상 시스템(재정의·연장 유물·재부여 가드)** — claude_status_effects, claude_duration_relics, claude_reapply_guard, src_battle_engine_applystatus, src_battle_engine_resolveround [EXTRACTED 1.00]
- **RULES_VERSION 락스텝 게이트 흐름** — claude_rules_version, src_battle_types_rules_version, src_net_matchmaking, src_ui_screens_multiplayerlobby_finishhandshake, claude_online_mp [EXTRACTED 1.00]
- **런 밸런스 조정 루프(runEffect·sweep·다중 시드)** — claude_signature_runeffect, claude_sim_run_sweep, claude_multi_seed, claude_difficulty_tiers, claude_floor_scale [INFERRED 0.85]
- **라운드 한정 상태이상 모델** — docs_game_design_round_lock, docs_game_design_freeze, docs_game_design_stun, docs_game_design_bind, docs_game_design_duration_relics [EXTRACTED 1.00]
- **지형(바위) 시스템** — docs_game_design_terrain_rocks, docs_game_design_pierce_ignores_rock, docs_game_design_slam_stun, docs_game_design_terrain_placement, docs_game_design_terrain_cards, src_battle_types_rules_version [EXTRACTED 1.00]
- **런 난이도 4단계 (조준·대응 축)** — src_game_run_run_difficulties, docs_roguelike_readslots_reacts, docs_roguelike_ai_targeting, docs_roguelike_card_reaction, src_battle_ai_threat_damage, src_battle_ai_reactslot [EXTRACTED 1.00]

## Communities (61 total, 4 thin omitted)

### Community 0 - "App Shell & Deck Building"
Cohesion: 0.05
Nodes (87): 직업 기본기 3장(basics), 덱 빌딩(고정 7 + 선택 7), @capacitor/core, react, App(), BotMatch, Phase, wantsAdmin() (+79 more)

### Community 1 - "Battle Presentation & Sprites"
Cohesion: 0.06
Nodes (61): 전투 연출(손맛), 좌우 반전 두 겹(--flip / --artflip), faceToward(스프라이트가 상대를 본다), 칸을 눌러 이동(탭 제거), wait()이 visibilitychange에 반응, attackClipFor(), ClipDef, ClipName (+53 more)

### Community 2 - "Online Multiplayer P2P"
Cohesion: 0.07
Nodes (48): 결정론적 락스텝, 온라인 멀티 P2P + 짧은 코드, 룰셋 버전 게이트, 턴 제한 30초 (온라인), DB, dbDelete(), dbGet(), dbPut() (+40 more)

### Community 3 - "Balance Admin Tool"
Cohesion: 0.06
Nodes (51): Bag, base(), brief(), canon(), CARD_ENTRIES, CARD_ENTRY_BY_ID, CARD_GROUP_LABEL, cardBase (+43 more)

### Community 4 - "Run Simulator (simrun)"
Cohesion: 0.06
Nodes (52): 경로 정책 template/random/greedy/safe, --path=template (가운데 줄 = 옛 사다리), ALL_CARDS, applyReward(), args, arrive, bestUpgradeTarget(), bossReach (+44 more)

### Community 5 - "Relics & Rewards"
Cohesion: 0.08
Nodes (46): 보상 직업 카드 보장 버그, 유물 획득 경로, 승리 보상 6중 1택 + SKIP_HEAL, 지원 칸 대안은 전투가 아니다, monstersOfTier(), genericRelics, mergeRunMods(), pickWeightedRelic() (+38 more)

### Community 6 - "Package & Capacitor Config"
Cohesion: 0.04
Nodes (46): config, dependencies, @capacitor/app, @capacitor/core, firebase, react, react-dom, devDependencies (+38 more)

### Community 7 - "Engine Constants & Card Types"
Cohesion: 0.08
Nodes (33): BIND_CARD, COLLAPSE_CARD, FOG_CARD, FOG_LAY_CARD, FROZEN_CARD, POISON_CARD, REVIVE_CARD, ROCK_BREAK_CARD (+25 more)

### Community 8 - "Card Display & Abilities"
Cohesion: 0.14
Nodes (24): 압축 카드 + 꾹 눌러 보는 상세, 힘 empower, 화염군주 (길어질수록 무거워진다 · lava · 불씨 모으기), Rarity, RELICS, RUN_CARDS, AbilityInfo, abilityList() (+16 more)

### Community 9 - "Procedural SVG Art"
Cohesion: 0.10
Nodes (25): buildFighterSvg(), buildPortraitSvg(), circle(), defs(), helmet(), limb(), P(), Pal (+17 more)

### Community 10 - "CPU AI (decideAI)"
Cohesion: 0.15
Nodes (26): 기력 문턱 인공물 energyFloor, 같은 공격 카드 한 턴 한 번, AICfg, AIForesight, AIProfile, ArchMod, chebyshev(), clamp01() (+18 more)

### Community 11 - "Project Guide & Balance Policy"
Cohesion: 0.11
Nodes (26): 밸런스 어드민(개발 빌드 전용), AI 슬롯별 조준(2026-08-10), bonusVsAfflicted ÷2 누락 수정, 카드 룰: 덱이 곧 손패, 카드 강화(upgrades.ts), 어림 예측 시 실제 자리 추격, 런 난이도 4단계, GridBrawl 프로젝트 (+18 more)

### Community 12 - "CardBattle Engine Core"
Cohesion: 0.14
Nodes (14): battleWith(), playFight(), playGame(), CardBattle, clamp(), cloneCell(), sameCell(), BattleSnapshot (+6 more)

### Community 13 - "App Icon Generator"
Cohesion: 0.11
Nodes (24): background, BG_CORE, BG_EDGE, circleMask(), clamp(), DENSITY, drawBackdrop(), drawFigure() (+16 more)

### Community 14 - "Run State & Deck Picker"
Cohesion: 0.33
Nodes (20): getChar(), getRelic(), advanceFloor(), cardLevel(), runCard(), RunState, skipRewardForHeal(), resolveRunCard() (+12 more)

### Community 15 - "Status Effects & Classes"
Cohesion: 0.14
Nodes (24): archer SABLE · Ashen Fletcher, 속박 bind, bonusVsAfflicted ÷2 누락, 화상 burn, core vs dmg 분리 (computeAttack), 지속 연장 유물 전설 6종, 독안개 타일 (CardDef.fog), 빙결 frozen (+16 more)

### Community 16 - "Monster Scaling & Run Map"
Cohesion: 0.13
Nodes (21): 난이도 곡선 상수, 후반 몬스터 = 한 방의 크기, 2026-07-30 몬스터 밸런스 패스, 몬스터 아이덴티티 (덱+패시브+AI 성격+기믹), 다인 전투 Phase 2, getMonster(), atkScaleAt(), BOSS_HP_SCALE_FACTOR (0.4) (+13 more)

### Community 17 - "iOS AppDelegate"
Cohesion: 0.13
Nodes (13): Any, Bool, Capacitor, AppDelegate, NSUserActivity, UIApplication, UIApplicationDelegate, UIKit (+5 more)

### Community 18 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+11 more)

### Community 19 - "Run Difficulty & Progress"
Cohesion: 0.21
Nodes (16): 상한(cap) → 상대 이동(shiftedAiLevel), clearedDifficulties(), isDifficulty(), markCleared(), signatureRelicId(), DEFAULT_DIFFICULTY, difficultyDef(), isDifficultyUnlocked() (+8 more)

### Community 20 - "Card Upgrades & Shop Rules"
Cohesion: 0.15
Nodes (19): 카드 강화 (같은 카드를 또 얻으면 강해진다), 덱이 곧 손패 (hand = deck), 유료 카드 제거 상점 서비스 삭제, 강화 이벤트 3종 (늙은 대장장이·피의 담금질·떠도는 각인사), buyShopItem(), canUpgradeCard(), cardRewardPool(), DECK_CAP (+11 more)

### Community 21 - "Invariant Checks (checkhooks)"
Cohesion: 0.14
Nodes (16): 방향 A (2D 격자로 재작업), 위협 검사 결정론화, card(), HOLD, IDLE, reactSlot (라운드에 한 번, 제일 아픈 한 장), THREAT_DAMAGE, c-shot 돌팔매 (+8 more)

### Community 22 - "Turn Resolution Rules (GDD)"
Cohesion: 0.15
Nodes (16): 전장 붕괴(옛 독안개), 컨벤션, 동시 트레이드: 쓰러뜨리는 쪽부터, 용어: 턴 ≠ 라운드, docs/GAME_DESIGN.md (GDD), 전장 붕괴 (옛 독안개), 5턴 페이싱 밸런스 패스, Inuyasha: Demon Tournament (참고작) (+8 more)

### Community 23 - "Run Battle Setup"
Cohesion: 0.22
Nodes (14): 층 스케일(HP_SCALE_PER_FLOOR·atkScaleAt), 격자 6열×4행 + 랜덤 시작, HP 이월(startHp), 몬스터 이동 버그(COMMON_MOVES 주입), BattleOpts, GRID_ROWS, bossTelegraph(), isScriptedBoss() (+6 more)

### Community 24 - "Boss Scripts"
Cohesion: 0.15
Nodes (11): 오버로드 (도망칠 수 없다 · abyss), ALL_CARDS, bossAction, bossCinematic, BossCtx, bossPlan(), BossScript, cardById() (+3 more)

### Community 25 - "Boss Cards"
Cohesion: 0.17
Nodes (14): ABYSS, atk(), bar(), barBoth(), beamBoth(), BOSS_CARD_BY_ID, BOSS_CARDS, both() (+6 more)

### Community 26 - "Status Effect Redefinition"
Cohesion: 0.20
Nodes (14): 속박, 화상, 지속 연장 유물 6종(런 전용 전설), 힘(empower), 독안개 타일, 빙결, 처박기(넉백 차단 피해+기절), 중독 (+6 more)

### Community 27 - "Sprite Packer"
Cohesion: 0.22
Nodes (12): decodePng PLTE·tRNS 확장, padToCommonCanvas, cutFigure(), blit(), crop(), JOBS, loadFromFolders(), loadFromGrid() (+4 more)

### Community 28 - "3-Class Roster & AI Tiers"
Cohesion: 0.17
Nodes (13): 이스터에그 battery·r-railgun, 로스터 리스킨 사이버→다크 판타지, 3직업 개편 (warrior/archer/mage), warrior CAIRN · Oathbound Warden, AI 상대 예측 · 슬롯별 조준 (CLOSE_IN), 접근은 예측이 아니라 실제 자리를 쫓는다, 밴드는 최고급 기준, 카드 대응 (AIForesight · oppPlan) (+5 more)

### Community 29 - "PvP Simulator"
Cohesion: 0.15
Nodes (10): allTurns, byTurns, cell, GameResult, games, hist, IDS, N (+2 more)

### Community 30 - "Monster Definitions"
Cohesion: 0.22
Nodes (11): Archetype, Difficulty, Passive, ALL_CARDS, cardById(), MONSTER_BY_ID, monsterDeck(), MonsterDef (+3 more)

### Community 31 - "Run Cards"
Cohesion: 0.22
Nodes (12): Offset, atk(), bar(), barBoth(), beam(), beamBoth(), both(), CROSS (+4 more)

### Community 32 - "Rock Terrain Assets"
Cohesion: 0.24
Nodes (10): 지형 = 바위(Obstacle), 지형 에셋 — 바위(rocks.png), --v 번호 = 프레임 순서(PICKS), out, PICKS, src, chunk(), CRC (+2 more)

### Community 33 - "Common Cards & Session"
Cohesion: 0.23
Nodes (8): deckFor(), ENERGY_GAIN, ENERGY_REGEN, GUARD_BLOCK, GUARD_COST, CardDef, CharacterDef, PlanExchange

### Community 34 - "Sprite & Background Specs"
Cohesion: 0.24
Nodes (11): 픽셀 스프라이트 파이프라인, 화면 배경 그림 규격, 새 장면 추가 3곳(BattleScene 유니온·sceneFor·.boardfloor--id), 판 높이 302px 제약, 배경 정수 배율 + repeat-x + center bottom, 스프라이트 시트 배치 규격, clipOrFallback(attack1→idle), 필요한 클립 8종 (+3 more)

### Community 35 - "Battle State View"
Cohesion: 0.29
Nodes (7): BattleState, Cell, FogTile, isFullLock(), Obstacle, StatusEffect, View

### Community 36 - "Android Test Stubs"
Cohesion: 0.33
Nodes (5): ExampleInstrumentedTest, ExampleUnitTest, androidx.test.ext.junit.runners.AndroidJUnit4, org.junit.runner.RunWith, org.junit.Test

### Community 37 - "Native App & Login Gate"
Cohesion: 0.22
Nodes (8): 앱 아이콘(전사 얼굴 클로즈업), Capacitor 네이티브 앱, 사이버 잔재 정리, 이스터에그(battery·r-railgun), 로그인 게이트(useAuth), 팔레트 변수(--bg-*, --ink, --frame), index.html 진입점, CapApp-SPM(Capacitor SPM 호스트 패키지)

### Community 38 - "Class Identity & Range Symmetry"
Cohesion: 0.25
Nodes (8): 궁수 archer, 마법사 mage, 밀착 타격(pointBlank), 공격 사거리 앞뒤 대칭, 로스터 3직업, 지형 카드 2종(war-menhir·mag-menhir), 전사 warrior, 시트 매핑표(15개 시트)

### Community 39 - "Passives & Relic Hooks"
Cohesion: 0.25
Nodes (8): 캐릭터 패시브 (Passive), 부활 revive:N, 턴 ≠ 라운드 용어, 조합형 훅 (energyTriggers/lowHpBonusPct/alwaysPierce/stunOnHit/…RoundBonus/openingShield), 조합 유물 — 판을 부수는 조합은 막지 않는다, 유물 훅 목록 (turnEnergy/turnShield/DR/lifesteal/revive/thorns/regen/attackBonus/maxHpBonus…), 유물 시스템 (엔진 패시브 훅 조합), RunMods (전투 밖 훅 — 할인·골드·보상 칸·회복량·덱 상한)

### Community 40 - "Scenes & Boss Cinematics"
Cohesion: 0.38
Nodes (7): 층별 배경 4종(sceneFor), 보스 전용 카드·무대·컷인, 상태이상 HUD 줄(.bhud__status), 공격 모션·필살기 컷인, 보스 컷인 등장·격노 (BossCinematic), 전투 장면 6종(hall·cemetery·corridor·lava·abyss·sanctum), sceneFor()

### Community 41 - "Facing, Knockback & Lockstep"
Cohesion: 0.33
Nodes (7): 버프 카드 · 이동공격(dashForward), facingBetween(위치 기준 방향), 넉백 재판정(connectsNow), 온라인 멀티(P2P 락스텝), RULES_VERSION 락스텝 게이트, 격돌 연출(Step.slam), KNOCKBACK_BLOCK_DAMAGE

### Community 42 - "Monster Behavior Variation"
Cohesion: 0.29
Nodes (7): 몬스터 대각 접근(approachCards), 몬스터 전투 변주(성격·랜덤 시작·기분), 전투 변주 — 성격·랜덤 시작·기분, ARCH, AIProfile.moodAgg (전투별 기분 ±0.12), START_CELLS, BattleOpts.startCells (랜덤 시작)

### Community 43 - "Run Core Loop & BattleOpts"
Cohesion: 0.29
Nodes (7): 핵심 루프 (15층 사다리·보상·엘리트·보스), HP 이월 (BattleOpts.startHp), 분기 지도 → 사다리 그래프, 시작 직업 카드 선택 제거 (ⓑ안), turnEnergy로 런 밸런스 조정 금지, 왜 런에는 별도 수치(runEffect)가 필요한가, BattleOpts (chars/passives/startHp/startCells/obstacles)

### Community 44 - "Upgrade Rules"
Cohesion: 0.43
Nodes (6): applyOnce(), bump(), extendRange(), IDENTITY, isUpgradable(), key()

### Community 45 - "Class Basics & Deck Cap"
Cohesion: 0.40
Nodes (6): 직업 기본기 3장 (CharacterDef.basics), 덱 빌딩 (고정 7 + 선택 7 = 14장), deckFor(char), 수치 10의 배수 규약, 밀착 타격 pointBlank, 밀착 타격 후 재조정 (2026-07-25)

### Community 46 - "Range Conventions"
Cohesion: 0.40
Nodes (5): 앞뒤 대칭 사거리 규약, 겹침 허용 (상대 셀 통과·정지), 범위 헬퍼 fwd/beam/both/beamBoth/bar/barBoth/CROSS/FORK/RING, range 오프셋 {df,du}, facing / facingBetween

### Community 47 - "Run Helpers"
Cohesion: 0.40
Nodes (5): chooseBranch(), clamp(), computeMaxHp(), grantRelic(), statusForNode()

### Community 48 - "Gradle Wrapper"
Cohesion: 0.83
Nodes (3): gradlew script, die(), warn()

### Community 50 - "Rock Geometry"
Cohesion: 1.00
Nodes (3): rockAt(), shadowRock(), attackCells()

## Knowledge Gaps
- **260 isolated node(s):** `config`, `UIKit`, `Capacitor`, `PackageDescription`, `name` (+255 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 329 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App Shell & Deck Building` to `Battle Presentation & Sprites`, `Online Multiplayer P2P`, `Balance Admin Tool`, `Package & Capacitor Config`, `Card Display & Abilities`, `Run State & Deck Picker`, `Run Difficulty & Progress`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `RULES_VERSION` connect `Status Effects & Classes` to `Online Multiplayer P2P`, `Engine Constants & Card Types`, `Facing, Knockback & Lockstep`, `Project Guide & Balance Policy`, `Run State & Deck Picker`, `Boss Scripts`, `Boss Cards`, `Status Effect Redefinition`, `3-Class Roster & AI Tiers`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `decideAI()` connect `CPU AI (decideAI)` to `App Shell & Deck Building`, `Common Cards & Session`, `Run Simulator (simrun)`, `Engine Constants & Card Types`, `Monster Behavior Variation`, `Project Guide & Balance Policy`, `CardBattle Engine Core`, `Invariant Checks (checkhooks)`, `Turn Resolution Rules (GDD)`, `Run Battle Setup`, `3-Class Roster & AI Tiers`, `PvP Simulator`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `BattleScreen()` (e.g. with `칸을 눌러 이동(탭 제거)` and `.lockedThisRound()`) actually correct?**
  _`BattleScreen()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `config`, `UIKit`, `Capacitor` to the rest of the system?**
  _260 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Shell & Deck Building` be split into smaller, more focused modules?**
  _Cohesion score 0.0508280982295831 - nodes in this community are weakly interconnected._
- **Should `Battle Presentation & Sprites` be split into smaller, more focused modules?**
  _Cohesion score 0.05698778833107191 - nodes in this community are weakly interconnected._