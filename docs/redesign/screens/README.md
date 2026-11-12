# 화면 디자인 → 코드 옮기기 가이드

이 폴더의 `*.dc.html` 33개가 **GridBrawl 리디자인의 최종 화면 시안**이다(디자인 캔버스에서 내보낸 원본).
"docs/redesign/screens 보고 이대로 만들어줘"라는 요청을 받으면 **이 파일을 먼저 읽고**, 아래 표에서 해당 화면 파일과 대응 코드 파일을 찾아 작업한다.

## 파일 읽는 법

- 각 파일은 1280×720 무대(또는 시트용 큰 판) 한 장. `src/ui/useStageScale.ts`의 고정 무대와 같은 좌표계라 **px 값을 그대로 옮겨도 된다**.
- `<x-dc>` 안이 마크업, `<helmet><style>`이 CSS, 맨 아래 `<script type="text/x-dc">`의 `renderVals()`가 화면에 쓰인 **데이터**(카드 목록, 유물 좌표, 튜토리얼 단계 등).
- 템플릿 문법: `{{값}}` = 데이터 끼우기, `<sc-for list="{{배열}}" as="x">` = 반복(React `map`), `<sc-if value="{{조건}}">` = 조건부 렌더, `onClick="{{함수}}"` = 이벤트. React로 옮길 때 1:1로 바꾸면 된다.
- 이미지 경로는 전부 `/redesign/...` — `public/redesign/`에 실제 PNG가 있다(Vite가 그대로 서빙).
- 인라인 `style`이 많은 건 시안 도구 때문이다. 옮길 때는 `ui.css`/`battlefx.css`의 클래스로 정리해도 된다 — **값(색·크기·간격)만 맞추면 된다**.

## 화면 ↔ 코드 대응

| 시안 파일 | 대응 코드 | 핵심 |
| --- | --- | --- |
| `Main.dc.html` | `screens/TitleScreen.tsx` | 메뉴는 모험 시작 · 대전 · 도감 (덱 관리 없음) |
| `Login.dc.html` | `screens/LoginScreen.tsx` | Google 버튼 자리는 **Google 공식 Sign-In 버튼 에셋**으로 교체 · 게스트 버튼 |
| `Select.dc.html` → `Difficulty.dc.html` | `screens/RunStartScreen.tsx` (+ `ModeSelectScreen.tsx`) | 영웅 선택: 위쪽 탭(얼굴)으로 고르면 그 영웅 일러스트가 **배경**으로 바뀐다(`public/redesign/heroes/bg-cairn|sable|dirge.png` — 원본 `docs/redesign/2dImg/cairn|sable|dirge.png`를 화면 높이에 맞춰 왼쪽에 두고, 오른쪽은 이어 그린 뒤 흐리게. 만드는 스크립트 `docs/redesign/tools/hero-bg/build.py`). 오른쪽 패널에 체력 · 패시브 · 시그니처 · 전투 스프라이트. → **별도 단계로** 난이도 선택. 상단 단계 표시(영웅 ✓ · 난이도 · 출발). 난이도 데이터는 `game/run.ts`의 `RUN_DIFFICULTIES`, 잠금은 `progress.ts` |
| `Tutorial.dc.html`, `TutorialFlow.dc.html` | `screens/TutorialScreen.tsx` | 9단계 스포트라이트 온보딩(4단계 이동 = **판의 노란 칸 누르기**). 단계 데이터는 `Tutorial.dc.html`의 `renderVals()` 배열 `S`, 순서·성공 조건은 `TutorialFlow` |
| `RunMap.dc.html` | `screens/RunMapScreen.tsx`, `RunBar.tsx` | 갈림길 지도: 갈 수 있는 칸만 깜빡이고 눌러서 이동. 범례 7종(미지 · 여관 · 보물 · 대장간 · 적 · 엘리트 · 보스). 아이콘 `public/redesign/ui/map-icons/` |
| `BattleField.dc.html`, `BattleDungeon.dc.html` | `screens/BattleScreen.tsx`, `battlefx.css` | 지역별 배경 레이어, 상태바, 판, 손패·순서 칸 |
| `MoveBundle.dc.html`, `MoveBundleSpec.dc.html` | `BattleScreen.tsx`(손패 `.cards__row`, `moveTargets`), `battlefx.css` | **판 위의 이동 가능 칸에는 글자를 넣지 않는다 — 테두리만 반짝인다.** **이동 카드는 손패에 펼치지 않고 묶음 1장**(112×120, 순서 칸 바로 오른쪽). 앞면 = 장화 아이콘 + `×N` + 3×3 방향 나침반(파랑 준비 · 주황 테 대시 · 숫자 쿨 · 금 담김) + 준비/쿨 개수. 누르면 위로 펼쳐져 이동 카드 전부(준비/쿨 N/막힘/N번 칸) — 눌러 담기, 꾹 눌러 상세. 판: 1칸 = 노랑, 대시·특수 = 주황 + `CD` 라벨, 함정 칸은 빨간 경고 칩, 못 가는 칸을 누르면 이유 토스트. 순서 칸의 이동은 사거리 대신 큰 화살표. 잔상 + 발자국 번호로 경로 표시. 속박이면 묶음에 붉은 빗금 |
| `OneCell.dc.html`, `Hazards.dc.html` | `BattleScreen.tsx`(지형 렌더), `battlefx.css`(`.rock` 등) | **1칸 함정은 `hazards-cell/`을 쓴다**: 184×96, 칸 왼쪽 위에 맞추고 `top = 칸 top − 36px`. 128px판(`hazards/`)은 예전 규격 |
| `RelicsHUD.dc.html` | `BattleScreen.tsx`(상태바 아래 유물 줄), `RunBar.tsx`(지도) | 상태 7종(상시·발동·누적·횟수·조건·첫 라운드·런) 표시 규칙과 발동 애니메이션 CSS(`pop`, `burst`, `rise`) |
| `BossHUD.dc.html` | `BattleScreen.tsx` | 보스·적 능력은 **? 칸으로 시작 → 처음 발동 때 뒤집혀 공개**(`flip`, 붉은 띠) |
| `Reward.dc.html` | `screens/RewardScreen.tsx` | 골드는 항상 지급. 일반 = 카드 5장 중 1, 엘리트 = 카드 4장 + 유물 1 중 1. 건너뛰기 = 아무것도 안 받음(2026-11-09 — 회복은 승리 HP +10이 대신) |
| `Shop.dc.html` | `screens/ShopScreen.tsx` | **여관 안 상점.** 배경은 여관과 같은 `public/redesign/cutscene/inn/inn-bg.png`(마렌 왼쪽 · 오른쪽 흐림), 마렌의 말은 진열 위 말풍선, 진열은 카드 3 · 유물 2(회복 · 강화 칸 없음). 위쪽 "← 여관으로" |
| `GoblinShop.dc.html`, `Merchants.dc.html` | `screens/EventScreen.tsx`(? → 상점 판정), 새 고블린 상점 화면, `monsters.ts` | **? 칸 상점 = 고블린 장사꾼**. **여관과 같은 배치** — 왼쪽에 단계별 일러스트(`public/redesign/cutscene/goblin/bg-poor|mid|rich.png`), 오른쪽에 대사창 · 선택지. **고블린 재산(쓴 돈 · 게이지)은 화면에 보여 주지 않는다** — 안에서만 센다. 시안 3가지는 `GoblinTiers.dc.html`. 만남(거래 · 덮친다 · 지나간다) → 거래 / 습격. 런 동안 쓴 돈 `goblinSpent`로 가난(0) → 중간(80) → 부자(200), 덮쳐서 이기면 0 → 이후 고블린 상점은 가난부터. 값은 단계 무관 물건마다 정가 ×0.8~1.5, 단계마다 다른 건 진열 품목·전투력 — 규칙과 데이터는 `docs/redesign/GOBLIN_MERCHANT.md` |
| `Inn.dc.html`, `Blacksmith.dc.html` | 새 여관 · 대장간 화면, `RunMapScreen.tsx`(지도 칸 `inn` · `smith`) | **지도의 상점 · 휴식 칸 → 여관 · 대장간.** 여관 = 휴식 50G(최대 체력 20%, **쉬면 방문 끝**) · 상점(다녀와도 계속) · 나가기(5%). 배경은 `public/redesign/cutscene/inn/inn-bg.png`(시안 C: 그림은 왼쪽에 그대로, 오른쪽은 이어 그리고 흐리게), 대사창과 선택지는 오른쪽. 대장간 = 카드 강화 50G(**한 번만**, 저장하면 바로 지도로) · 쉬어 간다(10%, 대사가 바뀌고 "지도로"). 대장간 배경은 망치를 멘 대장장이 그림 `public/redesign/cutscene/smith/smith-bg.png`(2026-11-12). 규칙은 `docs/redesign/INN_SMITH.md` |
| `Upgrade.dc.html` | 새 강화 화면(대장간에서 50G · 한 번 · 끝나면 지도로), `game/upgrades.ts` | **룰렛 카드 강화**: 카드(이동만 불가) → 수치(공격력·방어량·회복량) / 범위(공격만) → 60칸 룰렛(수치 판 0/+5/+10/+15/+20 · 범위 판 0~5) → 수치는 +값, 범위는 붙은 칸 N개를 직접 골라 저장. **카드당 최대 2번**, 같은 카드 중복 강화는 없앰(앞뒤 대칭 토글 · 되돌리기 · 판 미리보기). 규칙은 `docs/redesign/CARD_UPGRADE.md` |
| `EventScenes.dc.html`, `GoblinTiers.dc.html` | `EventScreen.tsx` · `GoblinScreen.tsx` | **일러스트 배경 시안**(2026-11-12) — 낡은 대장간 · 거래 · 온천은 그림을 통째로 깔고 이름 · 글 · 선택지를 오른쪽 패널 한 장에(`public/redesign/cutscene/events/*.png`), 고블린은 단계 셋 그림(`cutscene/goblin/bg-*.png`). ⚠ 시안의 이벤트 이름(「빈 대장간」·「대장장이」)은 쓰지 않는다 — 코드는 「낡은 대장간」(CLAUDE.md) |
| `EventsQ.dc.html`, `EventCatalog.dc.html` | `screens/EventScreen.tsx`, 이벤트 데이터 | **낡은 대장간 · 거래 · 온천은 일러스트를 화면 전체 배경으로**(`public/redesign/cutscene/events/*.png`, 글과 선택지는 오른쪽 패널), 대장간 칸도 대장장이 그림 배경(`cutscene/smith/smith-bg.png`). **? 이벤트 8종**(낡은 대장간 · 거래 · 온천 · 약방 · 항아리 · 갓챠 · 두더지 · 수술실). 선택지엔 **대가만** 보이고 결과는 고른 뒤 공개, 히든 선택지는 자물쇠로 잠금. 목록·규칙은 `docs/redesign/EVENTS.md`, 데이터는 `docs/redesign/events.json` — 새 이벤트도 여기에 추가 |
| `Event.dc.html` | `screens/EventScreen.tsx` | ? 칸 정체 공개 → 대화 → 결과 3단계. 선택지마다 대가·보상 칩을 먼저 보여준다 |
| `CardDetail.dc.html` | `CardDetail.tsx`, `CardFace.tsx` | 길게 누르기(≈0.4초 링) → 큰 카드 + 5×3 사거리 + 수치 + 용어 + "지금 쓰면" 미니 판 |
| `Result.dc.html` | `screens/ResultScreen.tsx`, `screens/RunEndScreen.tsx` | 전투 승리 / 런 클리어(새 난이도 해금) / 런 실패(쓰러뜨린 적 · 다음 팁) |
| `Codex.dc.html`, `Relics.dc.html` | `screens/CodexScreen.tsx` | 탭: 영웅 · 몬스터 · 유물. 미발견은 **검은 실루엣 + ???** (유물은 `atlas-silhouette-*.png`, 몬스터는 `filter: brightness(0)`) |
| `Heroes.dc.html`, `Monsters.dc.html`, `Bosses.dc.html` | `art/sprites.ts` | 스프라이트 시트 참고용. 값은 `docs/redesign/sprites-v2.ts`에 이미 있다 |
| `Maps.dc.html` | `battlefx.css`의 `.boardfloor--*`, `game/run.ts`의 `sceneFor` | 지역 2개: 초원(1–7층) · 던전(8–14층) |

## 공통 디자인 값

- 배경 `#120f1a` · 패널 `#1a1626` · 테두리 `#3a3150` / 진한 `#0a0810` · 본문 `#efe9f5` · 보조 `#c9c2d6`/`#b9b1c9`
- 강조(금) `#f4d470`, 버튼 그림자 `0 5px 0 #7a5418`, 버튼 테두리 `#2a1c10`
- HP `#e0485a` · 기력 `#4a9aff` · 초원 `#6ab83a`/`#b6ea6a` · 던전 `#6a6488`/`#c9c4ee` · 보스 `#ff4a3a`
- 등급: 일반 `#8a849a` · 희귀 `#6ab8ff` · 영웅 `#c48aff` · 전설 `#ffd86a`
- 글꼴(Google Fonts): 영문·숫자 `Silkscreen`, 한글 제목 `Do Hyeon`, 본문 `Noto Sans KR`
- 이동 묶음 아이콘: `public/redesign/ui/move/boot.png`(14×14, ×2), `dash.png`(대시 표시)
- 픽셀아트는 항상 `image-rendering: pixelated` + **정수 배율**

## 스프라이트 애니메이션 (모든 시안 공통)

스트립 PNG를 `background-size: (프레임 수 × 프레임 폭 × 배율)px`로 깔고 아래 키프레임을 쓴다.

```css
.spr { image-rendering: pixelated; background-repeat: no-repeat; animation-iteration-count: infinite; }
.n6 { animation-name: f6; animation-timing-function: steps(6); }   /* 프레임 수마다 하나 */
@keyframes f6 { to { background-position: 120% 0; } }              /* n/(n-1) × 100% */
```

`animation-duration` = 프레임 수 × `meta.json`의 `frameMs`. 기존 코드처럼 `steps()` 방식이라 히트스톱(`animation-play-state: paused`)과도 그대로 맞는다.

## 유물 아틀라스 좌표

`public/redesign/ui/relics/index.json`의 `col`/`row` → 큰 아이콘(26px) ×2면 `background-position: -col*52px -row*52px`, 작은 아이콘(16px) ×2면 `-col*32px -row*32px`. 보스·적 능력은 `foes.json`의 `col`(가로 한 줄).

## 시안에서 임의로 정한 것 (실제 규칙에 맞게 바꿔도 됨)

보스 유물 이름 10개 · 새 함정 4종(불길 · 가시덫 · 가시덩굴 · 빙판)의 효과 · 상인 대사 · 결과 화면의 숫자 · 카드 강화 예시 · 도감 "몬스터" 탭(기존 코드엔 영웅·유물만) · 보상 건너뛰기 회복량.
