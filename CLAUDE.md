# GridBrawl — 프로젝트 가이드 (Claude용)

> 이 파일은 매 세션 자동 로드된다. **작업 규칙 · 문서 지도 · 고치면 깨지는 곳**만 적는다(2026-11-13 문서 재편).
> **게임 규칙의 상세는 `docs/rules/*` 한 곳에만** 적는다 — 여기엔 한 줄 요약과 링크만 두고, 다르면 `docs/rules/*`가 이긴다(숫자는 코드가 진실).
> 옛 서술 · 밸런스 측정 경위 · 되돌린 시도는 [docs/HISTORY.md](docs/HISTORY.md)(옛 CLAUDE.md 두 판 · 옛 GAME_DESIGN.md · 옛 ROGUELIKE.md 원문) — 거기 수치를 지금 규칙으로 읽지 말 것.

## 0. 문서 지도 — 이 영역을 고치기 전에 이 문서를 읽는다

| 영역 | 기준 문서 | 비고 |
| --- | --- | --- |
| **진행표**(어디까지 했나 · 해야 할 일 · 기록) | [docs/PROGRESS.md](docs/PROGRESS.md) | 작업 끝날 때마다 고친다(아래) |
| 전투 — 판 · 라운드 · 넉백 · 카드 · 직업 · AI | [docs/rules/BATTLE.md](docs/rules/BATTLE.md) | |
| **상태이상** — 중독 · 화상 · 출혈 · 이동불가 · 힘 · 버프 | [docs/rules/STATUS.md](docs/rules/STATUS.md) | **0절 = 지금 코드**, 1절~ = 개편 기획(중독 · 화상 · 이동불가 구현 · 출혈 미구현) |
| **판 위의 것** — 바위 · 함정 · 전장 붕괴 · 독안개 칸 | [docs/rules/HAZARDS.md](docs/rules/HAZARDS.md) | **부록 A = 지금 코드**, 본문 = 함정 재설계(2026-11-13 · 미정 0 · **구현 대기** — 전장 붕괴 삭제 · 바위 999 · 가시덫 삭제 · 속박 중 안 밀림 · 시드 RNG) |
| 런 — 지도 · ? 칸 · 회복 · 보상 · 덱 · 유물 · 몬스터 · 보스 · 난이도 · 밸런스 | [docs/rules/RUN.md](docs/rules/RUN.md) | 칸별 문서가 따로 있으면 그쪽이 이긴다 ↓ |
| 여관 · 상점 · 대장간 | [docs/rules/INN_SMITH.md](docs/rules/INN_SMITH.md) | |
| ? 이벤트 · 이벤트 사슬 | [docs/rules/EVENTS.md](docs/rules/EVENTS.md) | |
| 고블린 장사꾼 | [docs/rules/GOBLIN_MERCHANT.md](docs/rules/GOBLIN_MERCHANT.md) | |
| 룰렛 강화 | [docs/rules/CARD_UPGRADE.md](docs/rules/CARD_UPGRADE.md) | |
| 유물 100종 | [docs/rules/RELICS_100.md](docs/rules/RELICS_100.md) | |
| 그림 · 시안 · 굽는 도구 | [docs/design/README.md](docs/design/README.md) — 시안 `docs/design/screens/*.dc.html`(대응표 `screens/README.md`) · 도구 `docs/design/tools/` · 원본 그림 `docs/design/2dImg/` | 화면은 시안이 기준 |
| 작업 경위 | [docs/HISTORY.md](docs/HISTORY.md) | 사실 아님 — "왜 이렇게 됐나"용 |

⚠ `docs/redesign/`는 없다(2026-11-13에 `docs/rules/` · `docs/design/` · `docs/PROGRESS.md`로 나눴다). `docs/GAME_DESIGN.md` → `docs/rules/BATTLE.md`, `docs/ROGUELIKE.md` → `docs/rules/RUN.md`.

### 작업 규칙 (사용자 지정 — 모든 세션)
- **같은 규칙은 한 파일에만** 적는다. 룰 · 시스템을 바꾸면 **같은 커밋에서** 그 영역의 `docs/rules/*` 문서를 고치고, 이 파일의 한 줄 요약 · ⚠가 틀어지면 같이 고친다. 다른 문서엔 새로 베끼지 말고 링크한다. 옛 서술은 지우지 말고 `HISTORY.md`로.
- **작업을 끝낼 때마다 `docs/PROGRESS.md`를 최신화한다**(2026-11-12 — 룰이 안 바뀐 작업도). 3절 "기록"에 날짜 · 무엇을 했나 · 바뀐 수치(밸런스를 쟀으면 3시드 값)를 한 줄 넣고, 그날 정리(2-quater) · 화면별 표(1절) · 해야 할 일(2-bis) · 추후 할 일 중 걸리는 곳도 같이 고친다. 같은 커밋에 넣는다.
- **작업을 끝내면 묻지 말고 항상 커밋하고 푸시까지 한다**(2026-11-12). `npm run typecheck` · `npm run check` 통과 뒤 main에 커밋하고 `git push origin main`. 같은 체크아웃에서 다른 세션이 일할 수 있으니 **자기가 바꾼 파일만** 커밋한다. 원격이 앞서 있으면 pull(병합) 뒤 다시 푸시하고, 강제 푸시는 하지 않는다.
- **작업이 끝나면 반드시 "필요한 것 · 임의로 정한 것 · 이상한 것"을 정리해서 다시 말한다**(2026-11-09).
  개발하다 생긴 필요한 이미지 · 장면(시안) · 사용자가 정해 줘야 하는 정보(수치 · 이름 · 규칙)를 그냥 임의로 채우고 넘어가지 말고, 보고에서 **한데 모아** 알린다 — 사용자가 보고 "괜찮으면 넘기고, 다시 해야 하는 것은 만들어서 다시 전달"한다.
  작업 중에 발견한 **이상한 부분**(앞뒤가 안 맞는 규칙 · 문서와 코드의 차이 · 깨질 것 같은 곳)도 꼭 같이 말한다.
  보고는 최소 셋으로 나눈다: ① 필요한 그림 · 시안 ② 임의로 정한 값 · 이름 · 규칙(무엇을 왜) ③ 이상한 점 · 부족한 점. 오래 남을 항목은 `docs/PROGRESS.md` 2-bis에도 적는다.

## 1. 방침

### 🚫 PvP · 로그인 · 네이티브 앱은 main에 없다 (2026-11-10 사용자 결정)
- PvP(봇전 · 온라인 멀티) · 덱 만들기 · 로그인(Firebase Auth) · 1:1 시뮬(`npm run sim`)은 **브랜치 `archive/pvp`**, 네이티브 앱(Capacitor)은 **브랜치 `archive/native-app`**에 보존했다(옛 규칙은 그 브랜치의 CLAUDE.md §8 · §9). main은 로그라이크 웹만 — 로그인 없이 바로 타이틀. 되살릴 땐 그 브랜치에서 꺼낸다(main에 조금씩 다시 넣지 말 것).
- **엔진은 그대로 뒀다** — `RULES_VERSION` · PvP 시작 위치 · `ROSTER`의 PvP 기준 HP/패시브 · `localSide` 좌우 반전 · `npm run check`의 "PvP 불변" 검사가 남아 있다. 온라인이 없으니 **`RULES_VERSION`은 지금 안 올린다**(PvP를 되살릴 때 한 번).
- **밸런스 기준은 `npm run sim:run -- --sweep`(런 클리어율 · 직업 밴드) 하나뿐이다.**

### 📏 용어 — 턴 ≠ 라운드
| 말 | 뜻 | 코드 |
| --- | --- | --- |
| **턴** | 양쪽이 카드를 **한 장씩** 내는 것 | `slot` 0 · 1 · 2 |
| **라운드** | 카드 3장을 고르고 다 쓰는 것 = 3턴 | `BattleState.round` · `resolveRound` |

쿨타임 · 보호막 · 버프 · 중독 · 화상은 **라운드**, 이동불가(속박 · 기절 · 빙결)는 **턴** 단위다. ⚠ 유물 훅 `turnEnergy`/`turnShield`는 이름만 "turn"이고 실제로는 라운드마다다 — 새 글에서 이걸 근거로 "턴"을 쓰지 말 것.

## 2. 무엇을 만드는가 — 한 줄 요약

**1:1 카드 전투 로그라이크.** 직업을 고르고 **지도 두 장(1막 초원 20층 → 2막 던전 20층)**을 오르며 전투 · ? · 여관 · 대장간 · 보물을 지나 보스를 잡는다. 한 라운드에 카드 3장을 골라 슬롯 1→2→3 순서로 실행한다. 세계관 · 그림은 **2026-11 리디자인**(에셋 `public/redesign/` · 스타일 맨 뒤 층 `src/ui/redesign.css`).

- **3직업** — 전사 `warrior`(CAIRN · 내구 · 넉백 · 기절) · 궁수 `archer`(SABLE · 기동 · 한방 · 중독) · 마법사 `mage`(DIRGE · Azure Witch · 원거리 주문 · 속박 · 보호막, **붙으면 진다**). 상세 [BATTLE.md](docs/rules/BATTLE.md) ⑤.
- **런 시작 체력 전사 200 · 궁수 100 · 마법사 100 — 사용자 고정값**(2026-11-10). 그래서 **직업 밴드를 `maxHpBonus`로 맞추지 않는다**(마법사 손잡이는 `turnShield`).
- ⚠ **직업 패시브는 유물이 아니다**(2026-11-09 사용자 확정) — `RELICS` · `run.relicIds` · 유물 줄 · 도감 · 거래 어디에도 없고 `mergeRelics(ids, charId)`가 직업에서 얹는다. 유물로 되돌리지 말 것. 런은 유물 0개로 시작한다.
- ⚠ 직업 기본기 3장(`CharacterDef.basics`)은 `deckFor`에 꼭 들어 있어야 한다(AI 풀 · 플랜 복원).
- ⚠ **마법사 큰 주문은 밀착을 못 맞힌다**(`pointBlank: false`) — 시뮬도 마법사를 `kiter`로 굴린다(`simrun.ts`).
- 옛 6종 id(`volt/titan/...`)는 코드에 없다(저장 덱은 기본 덱으로 떨어진다).

## 3. 런 — 깨지기 쉬운 곳 (상세 [RUN.md](docs/rules/RUN.md) · 칸별 문서)

- **몬스터 세기 · 골드 · 유물 등급 가중은 "깊이"**(`runDepth` — 40층을 옛 15층 곡선 1~15에 편 값)로 잰다. 막 안의 층 번호로 스케일하지 말 것.
- **? 칸 = 전투 · 여관 · 대장간 · 고블린 · 나올 수 있는 이벤트 하나하나가 전부 같은 확률**(`questionFates`). 이벤트는 한 런 안에서 안 겹친다(`seenEvents`). **모닥불은 없다** — 되살리지 말 것(2026-11-12 사용자).
- ⚠ **대장간 ≠ 낡은 대장간** — 대장간은 지도 칸(`smith` · 맡기기 80골드 / 직접 무료 / 나가기), 「낡은 대장간」은 ? 칸 이벤트(`forge`). 이름을 섞지 말 것.
- **덱 = 손패**(셔플 · 드로우 없음 · 많을수록 유리). 덱 상한은 **칸별 — 공격 5 · 보조 5 · 이동 끝없음**. 유료 "카드 제거"는 없다 — 되살리지 말 것. **직교 이동 4장은 잠긴다**(`LOCKED_CARD_IDS` — `kind`가 아니라 목록으로).
- **가진 카드는 보상 · 상점에 안 나온다**(중복 획득 강화 폐지). 런 카드 54장은 직업이 있다 — 보상 · 상점 · 고블린 · 거래는 전부 `cardRewardPool` → `runCardsFor(charId)`를 거친다.
- **대체 보상(체력 등)은 없다**(2026-11-13) — 줄 것이 바닥나도 늘 그 종류로 준다. 보상 건너뛰기는 회복 없음.
- 이벤트 전용 카드 · 유물(「세계수의 가호」 · 「세계수의 가지」 등)과 **보스 전용 카드 13장**은 보상 · 상점 · 고블린 어디에도 새면 안 된다(`npm run check`가 지킨다).
- 런 전용 훅(`burnImmune` · `maxEnergyBonus` · `openingShield` · 연장 훅 다섯)은 유물에만 — `ROSTER.passive` · 몬스터에 넣지 말 것(`RULES_VERSION` 불변의 근거).
- 런 난이도 4단계(초급 → 최고급)는 **축이 하나 — 봇이 내 3장을 얼마나 보는가**. 층 스케일 · 지도 · 보상 · 시작 덱은 단계마다 같다(넷을 갈라 놓으면 스윕을 네 번 돌려야 한다).

## 4. 전투 — 깨지기 쉬운 곳 (상세 [BATTLE.md](docs/rules/BATTLE.md) · [STATUS.md](docs/rules/STATUS.md) · [HAZARDS.md](docs/rules/HAZARDS.md))

엔진 `battle/engine.ts`는 순수 TS · **같은 입력 → 같은 결과**(락스텝 · 시뮬 재현). 격자 6열 × 4행 · 슬롯 안은 **이동 < 수비 < 공격** · 같은 공격 카드는 라운드에 한 번.
- **넉백 3원칙**(사용자 확정): 상대가 내 오른쪽 → 오른쪽 / 왼쪽 → 왼쪽 / **같은 칸 → 오른쪽**. ③을 임시 폴백으로 읽고 고치지 말 것.
- **방향은 위치 기준**(`facingBetween` 한 곳). ⚠ UI 재생은 `battle.facing()`이 아니라 그 스텝의 스냅샷으로 잰다.
- ⚠ `freeCast`는 엔진 `costOf` · UI `planAffordable` · AI 예산 세 곳이 같아야 한다(`baseCostOf`).
- ⚠ **무한 봉인을 막는 건 `applyStatus`의 겹치기 규칙**(속박 < 기절 < 빙결 · 처음 봉인의 남은 길이까지). 풀면 연장 유물이 "영원히 못 움직임"이 된다.
- ⚠ 흡혈 · 반사 · 기절 · 부여는 `core`(보호막 · 경감을 실제로 뚫은 몫)를 본다 — 빙결 파쇄(관통) 몫으로 켜면 가드가 무의미해진다.
- ⚠ 회복량 %(`healPowerPct`)는 회복 카드에만 — 매 라운드 체력 회복(`regen`)엔 안 붙는다. 위력 %(`statusPowerPct`)는 중독 전용.
- `tickStatuses`는 피해를 안 준다 — 라운드 끝에 갉는 건 독안개 · 붕괴 · 불길뿐.
- **판 위의 것은 지금 바뀌기 직전이다** — 지금 코드는 [HAZARDS.md](docs/rules/HAZARDS.md) 부록 A(바위 25/34/62 · 함정 4종 · 전장 붕괴 6라운드~ · 무너진 칸에도 들어갈 수 있음), 재설계는 본문. 붕괴 판정은 늘 `collapseRound(state)`로(엔진 · AI · 화면 공용).
- 보스 무대(`abyss` · `sanctum` · `lava`)는 칸 종류가 아니라 **몬스터 id**로 고른다. 격노 판정은 그 스텝의 스냅샷 HP.

## 5. 밸런스

```bash
npm run typecheck && npm run check && npm run sim:run 900 -- --sweep --seed=12345
```
- **현재(2026-11-13, 최고급) 3시드(12345 · 777 · 2026) 평균 ≈ 17.8% · 밴드 ≈ 12.9%p**(마법사 25.5 · 궁수 15.2 · 전사 12.6). 경위와 사용자 결정(마법사 · 전사 그대로 둠 · 상태이상 개편을 다 구현한 뒤 맞춤)은 [RUN.md](docs/rules/RUN.md) ⑩.
- ⚠ **단일 시드로 판정하지 말 것** — 같은 수치에서도 밴드가 몇 %p씩 널뛴다. 체력은 사용자 고정값이라 건드리지 않는다. `turnEnergy`로 조정하지 말 것(AI 기력 문턱 인공물).

## 6. 화면 · 연출 — 지켜야 할 함정

- **판 크기를 바꾸지 말 것** — 칸 184×58 · 간격 7(`.gridboard` 1139×253). 함정 · 바위 · 안개 타일이 이 크기에 맞춰 그려져 있다. 판 좌표는 px(`cellX` · `cellY`).
- **픽셀 그림은 정수 배율**(스프라이트 ×3/×2, 상태 아이콘 ×2, 지도 아이콘 14의 정수배). `.bhud` 높이 96px 고정.
- **무대 폭은 화면 비율을 따라 늘어난다**(1280~1800, `useStageScale` · 2026-11-10). **내용은 늘 가운데 1280px**(`.screen`의 left/right = `--bleed`)이고 배경 층(`.scene` · `.grid-bg` · `.screenveil` · `.artbg--fill` · 컷인 · 손패 띠)만 양옆으로 번진다(`index.css` 맨 아래 목록). 무대는 노치 밑까지 깔리고 내용만 안전 영역을 피한다.
  ⚠ 화면 루트(`.screen.X`)에 `overflow: hidden` · `position: relative` · `width: 100%`를 주지 말 것 — 배경이 못 번지거나 내용이 오른쪽으로 밀린다. 새 전면 배경 · 막을 만들면 그 목록에 넣는다.
- 1280×720 그림 배경(영웅 선택 · 여관)은 무대가 넓으면 `.artbg--fill`이 양옆을 메운다. ⚠ 이 층을 `::before`로 만들면 페이드인이 쌓임 맥락을 만들어 선명한 그림 위로 덮인다.
- **재생은 `await wait()` 사슬 하나** — `wait`이 `visibilitychange`에 반응한다. 연출 안에서 생 `setTimeout`으로 화면을 되돌리지 말 것. `submitPlan`은 try/catch로 복구한다.
- 전투 재생은 **한 가지 속도뿐**(2026-11-10 사용자 — "차근차근" 모드는 "최악의 경험"이라 지웠다). 같은 슬롯의 양쪽 이동은 **함께** 움직인다. "뭐였지?"는 나중에 디자인의 **히스토리 버튼**이 맡는다 — 카드 공개 · 전투 기록을 되살리지 말 것.
- `Step.bits`(피해 내역) · `Step.slot` · `Step.slam`은 연출 전용 — 지워도 결과가 같다(`RULES_VERSION` 근거 아님). 단 내역 합 = 실제로 깎인 체력.
- 유물 발동 · 적 능력 공개는 엔진이 안 알려 준다 — `ui/relicFx.ts`가 스텝 결과에서 추정한다.
- **카드 UI**: 전투 · 보상 · 상점은 압축 카드(`CardFace compact`), 설명은 꾹 눌러 여는 `CardDetail`(380ms, 10px 움직이면 취소, 연 뒤 click 삼킴, contextmenu 차단). ⚠ 못 쓰는 카드에 `disabled`를 걸지 말 것(꾹 눌러 읽을 수도 없어진다) — `aria-disabled`. 능력의 뜻은 `cardAbility.ts` 한 곳.
- **손패는 두 쪽**(2026-11-10) — 기본 **공격**, 맨 오른쪽 ⇅(`.cards__swap`)로 **이동 · 보조**. **가로 스크롤 없음** — 되살리지 말 것.
- 이동은 판의 칸을 눌러서 한다(호박색 칸, 이동 묶음 `MoveBundle`). 칸에는 **아무 글자도 찍지 않는다**(2026-11-10 카드 이름 · 11-12 화살표까지 뺐다) — 색(노랑 1칸 · 주황 대시)과 깜빡임만, 이름은 title · aria-label에만. 이동 칸과 공격 사거리(붉은색)의 색을 섞지 말 것. 판 위 연출 레이어는 `pointer-events: none`.
- 넘어온 기절 · 빙결 턴은 카드를 고를 때 슬롯이 잠긴다(`freshSlots` 자리표 — 제출할 때 비워 보낸다). 속박 턴 슬롯엔 이동 카드만 못 넣는다(`moveBound`).
- 스프라이트 좌우 반전은 두 겹(`--flip` = 방향, `--artflip` = 시트 원본 방향) — 합치지 말 것. `fighter--{face}`(방향) · `--seat-{side}` · `--stacked-{side}`(자리)를 구분.
- 튜토리얼 9단계(실제 전투 위 스포트라이트, `onSlotsChange`) · 첫 만남 팁 9종(`ui/FirstTip.tsx`, `gb-tips-seen`, 팁 id `shop`은 여관에서 뜬다).
- 개발 빌드 콘솔 `__gb.setRun(__gb.startRun('warrior')); __gb.setPhase('run-inn')`로 화면에 바로 뛴다.

## 7. 에셋 규칙

- 게임이 쓰는 그림은 `public/`만. **원본 · 안 쓰는 그림을 `public/`에 두지 않는다**(배포된다).
- 사용자가 준 원본 일러스트는 **`docs/design/2dImg/`** — **git에 넣는다**(사용자가 사진을 넣고 그걸로 디자인을 만든다) · 배포 안 됨. ⚠ **Claude는 이 폴더를 건드리지 않는다**(2026-11-13 사용자 지정) — 읽어서 굽는 건 되지만 파일을 고치거나 · 옮기거나 · 지우거나 · 새로 넣지 않는다. **마법사는 `magision.png`가 지금 그림**이고 `dirge.png`는 옛 그림이다(굽힌 결과 이름은 그대로 `bg-dirge.png`). 배경 · 아이콘은 `docs/design/tools/`로 굽는다 — 목록은 [docs/design/README.md](docs/design/README.md).
- 서드파티 스프라이트 팩 원본은 `assets-raw/`(**gitignore** — EULA상 커밋 금지), `npm run sprites`로 `public/sprites/`에 굽는다. 리디자인 시트는 `public/redesign/sprites/`.
- `public/sprites/`에 남은 옛 시트는 리디자인 도트가 없는 몬스터용과 `rat`(미사용 · 원본 없어 보존) · `hero-knight`(⚠ 2026-11-12부터 쓰는 곳 없음 — 지울지는 사용자 결정)뿐이다.
- 시트 `facesRight`는 **몸이 향한 쪽**(공격 프레임의 타격 방향)으로 판정. 모든 시트에 명시.

## 8. 배포

- 웹: Firebase Hosting `npm run build && npx firebase deploy --only hosting`. 빌드에 필요한 환경 변수는 없다(`.env` 불필요).
- 웹 아이콘(PWA) `npm run icon` — **? 칸 거래상 얼굴**(2026-11-12 사용자 선택). 마스터 `docs/design/tools/icon/master-1024.png`를 줄여 `public/icon-*.png` · `apple-touch-icon.png`를 만든다. 구도 · 빛을 바꾸려면 `docs/design/tools/icon/build.py`(pillow · rembg)로 마스터를 다시 굽는다.
  ⚠ 아이콘 파일 이름은 그대로라 기기가 옛 그림을 붙든다 — 그림을 바꾸면 `index.html` · `manifest.webmanifest`의 `?v=N`을 같이 올리고 **배포해야** 바뀐다(홈 화면 아이콘은 지우고 다시 추가).

## 9. 기술 스택 · 명령어 · 코드 지도

React 19 + TypeScript + Vite, 게임 엔진 없음. `npm run dev` · `build` · `typecheck` · `check`(불변식 검사 `scripts/checkhooks.ts`) · `sim:run`(런 시뮬 `scripts/simrun.ts` — 플래그는 [RUN.md](docs/rules/RUN.md) ⑩, npm 플래그는 `--` 뒤에) · `sprites` · `icon`. 개발 빌드 타이틀의 ⚙ 어드민(밸런스 초안 — 소스가 진실, 내보낸 TS 조각을 붙여야 반영, 동적 import라 배포 번들에 안 들어감).

| 영역 | 파일 |
| --- | --- |
| 전투 타입 · 상수 / 엔진 / AI | `src/battle/types.ts` · `engine.ts` · `ai.ts` |
| 카드 | `src/battle/cards.ts`(공용) · `src/data/roster.ts`(직업) · `src/game/runcards.ts`(런 54장 + 이벤트 카드) · `src/game/bosscards.ts`(보스 13장) |
| 런 | `src/game/run.ts`(지도 · 보상 · 여관 · 대장간 · 고블린) · `events.ts` · `upgrades.ts` · `relics.ts`(유물 100종 · 직업 패시브) · `monsters.ts` · `bosses.ts` · `runbattle.ts` · `progress.ts`(기기 로컬 기록) |
| 화면 | `src/App.tsx`(페이즈) · `src/ui/screens/*` — 여관 · 대장간 `InnScreen.tsx` · 상점 `ShopScreen.tsx` · 보물 `TreasureScreen.tsx` · ? 칸 `QuestionScreen.tsx` · 강화 `UpgradeScreen.tsx` · 고블린 `GoblinScreen.tsx` |
| UI 부품 | `CardFace.tsx` · `CardDetail.tsx` · `cardAbility.ts` · `SceneLayers.tsx` · `FirstTip.tsx` · `relicFx.ts` · `sfx.ts`(효과음 합성, 파일 0) |
| 그림 | `src/art/sprites.ts`(`SHEETS`) · `art/relicAtlas.ts` · `scripts/packsprites.mjs` · `scripts/makeicon.mjs` |

## 10. 해야 할 일

[docs/PROGRESS.md](docs/PROGRESS.md) 2-bis가 기준이다 — 사슬 이벤트 그림 · 늑대 도트 · 불사조 보스 · 도감 도움말 · 전사 방패 도트 · 마법사 패시브 아이콘 · 카드 디자인(T18) · 기획 없는 이벤트 셋(T17) · 새 함정 그림(T19) · **전투를 끝낼 장치**(T20 — 전장 붕괴를 없애면 판이 안 좁아진다).

## 컨벤션

- 게임 내 텍스트 · 주석은 **한국어**, 식별자 · 파일 · 명령어는 영어.
- 새 카드/캐릭터는 기존 패턴(`roster.ts`의 `atk()`, `CardDef`)을 따른다. magnitude를 상수로 빼면 리스케일 스크립트가 놓친다 — `= N` 형태도 같이 볼 것.
- 표면 · 테두리 색을 리터럴로 박지 말 것(팔레트 변수). 캐릭터 강조색만 예외.
