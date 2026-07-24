# GridBrawl — 프로젝트 가이드 (Claude용)

> 이 파일은 매 세션 자동 로드됩니다. **전투/카드/토너먼트 관련 작업 전에는 반드시 [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)를 먼저 읽으세요.**

## 무엇을 만드는가

*이누야샤 데몬 토너먼트*의 룰을 차용한 **1:1 토너먼트 카드 전투 게임**. 한 턴에 카드 3장을 골라 순서대로 실행해 상대 HP를 깎고, 이기면 다음 상대로 진행. 원작 캐릭터 대신 오리지널 사이버 아레나 캐릭터(VOLT/TITAN/NOVA/CIPHER/AEGIS/EMBER)를 사용. 전체 룰/설계는 [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md).

## 기술 스택 / 명령어

- React 19 + TypeScript + Vite. 외부 게임 엔진 없음 — 전투는 순수 TS(`CardBattle`)로 시뮬레이션 후 React 렌더.
- 개발 `npm run dev` · 빌드 `npm run build` · 타입검사 `npm run typecheck` · **밸런스 시뮬 `npm run sim [판수]`**(`scripts/simulate.ts`, AI vs AI 36매치업 — 수치 조정 후 평균 턴·승률 확인)
- 코드 변경(특히 전투 로직) 후에는 `npm run typecheck`로 확인.

## 코드 지도

| 영역               | 파일                                                     |
| ------------------ | -------------------------------------------------------- |
| 전투 타입·상수     | `src/battle/types.ts`                                    |
| 공용 카드          | `src/battle/cards.ts`                                    |
| 전투 엔진(턴 해소) | `src/battle/engine.ts`                                   |
| CPU AI             | `src/battle/ai.ts`                                       |
| 캐릭터·공격 카드   | `src/data/roster.ts`                                     |
| 토너먼트(건틀릿)   | `src/game/tournament.ts`                                 |
| 온라인 멀티(P2P)   | `src/net/*`, `src/ui/screens/MultiplayerLobby.tsx`       |
| 로그인(구글 인증)  | `src/net/auth.ts`, `src/ui/useAuth.ts`, `src/ui/screens/LoginScreen.tsx` |
| 화면 흐름 / UI     | `src/App.tsx`, `src/ui/screens/*`, `src/ui/`, `src/art/` |

## 전투 모델 (현재 구현 요약) — 2D 격자

- **로그인 게이트(앱 전체)**: 모든 화면 앞에 구글 로그인이 필수(`App.tsx`가 `useAuth`로 게이트). 미로그인 시 `LoginScreen`, 인증 복원 중엔 "접속 중…". 로그인 후에야 아래 흐름 진입. 예외적으로 **Firebase Auth는 SDK 의존**(시그널링용 `net/firebase.ts`는 여전히 REST-only) — `VITE_FIREBASE_API_KEY` 필요, 미설정 시 로그인 화면이 "설정 필요" 안내(`.env.example`). 콘솔에서 Google 공급업체 활성화 필수.
- **덱 빌딩(2026-07-22)**: 전투 전에 **고정 7장 + 고른 7장 = 14장** 덱을 짠다(`src/game/decks.ts`). 고정=이동4방향·스트라이크·브레이스·원기, 선택 풀=대시2·**대각선 이동4(↗↖↘↙)**·펄스샷·가드·**리페어(힐)**+캐릭터 고유4. 덱은 **캐릭터 종속**(이름/수정/삭제). **저장은 계정별(2026-07-23)** — 로그인 시 RTDB `decks/<uid>`가 원본이고 localStorage `gb-decks:<uid>`는 캐시, 게스트는 `gb-decks` 로컬 전용. UI는 `src/game/deckSync.ts`의 `listDecks/putDeck/removeDeck`(비동기)만 사용. 모든 덱 카드는 `deckFor(char)`의 부분집합이라 **멀티 플랜 복원(`net/session.ts`)은 그대로 동작**. `PRESET_DECKS`는 봇 상대 덱 + 기본 덱.
- **대각선 이동·힐(2026-07-23, 2단계)**: `MoveDir`에 `up-right/up-left/down-right/down-left` 추가(`MOVE_DELTA`, 멀티 미러링은 `MIRROR_DIR`+`faceCard`). 새 카드종류 `heal`(`c-repair`: 기력20→체력20, 쿨1) — 엔진 `resolvePrep`이 처리하고 `planAffordable`이 비용 반영(기력 부족 시 선택 불가). `CardFace`는 대각 화살표·힐 초록 표기.
- 화면 흐름: `title →(게임 시작)→ deck-select → mode-select →` **봇전** `fight → result`(1:1 단판, 상대는 랜덤 캐릭터+프리셋 덱) 또는 **온라인** `mp-lobby → mp-fight → mp-result`. 타이틀의 **덱 만들기** → `deck-manage`(목록/삭제) → `deck-build`(캐릭터+7장 선택·저장). **도감** → `codex`. 카드 렌더는 배틀·덱화면 공용 `src/ui/CardFace.tsx` — **전투에선 `compact` prop**으로 설명을 빼고 이름·수치(기력/데미지)·사거리만(덱 빌더·도감은 설명 유지). (건틀릿 `game/tournament.ts`는 단판 전환으로 현재 미사용.)
- 전장은 **2D 격자 6열 × 3행**(`GRID_COLS/ROWS`). 위치는 셀 `{col,row}`, 시작은 가운뎃줄 양 끝. p0는 오른쪽, p1은 왼쪽을 바라봄(`facing`).
- 카드 종류: `move / attack / guard / energy`. 모든 카드에 `cooldown`(사용 후 잠기는 턴 수). **공용(약함) + 캐릭터 고유(강함, 각 4장)** 이원화 — 2026-07-03.
  - 공용: 이동 `> < ^ v`(쿨0)·대시 `>> <<`(쿨1) + **약공 스트라이크(앞뒤1칸 10dmg)·펄스 샷(앞뒤 2칸째 10dmg)** + 가드(실드 50·쿨1)·**브레이스(실드 30·쿨0)** + 원기(기력 +35·쿨1). 턴 시작 패시브 기력 +20. (2026-07-15 "5턴 페이싱" 밸런스 패스 — GDD ④ 참고)
  - 공격: `range` 오프셋 `{df,du}`(df=앞, du=위)로 타격 셀 지정. 상대 셀이 들어오면 적중, 실드가 먼저 흡수.
  - **고유 카드 특수 능력**(`roster.ts`의 `CharacterDef.cards` — 공격 외 종류도 가능, 예: AEGIS 전용 가드): `drain`(기력 흡수)·`leech`(흡혈)·`pierce`(실드 관통)·`push`(넉백)·`selfShield`(사용 시 실드)·`recoil`(반동 자해). 발동 조건·적용 순서는 GDD ③/④, 카드 UI엔 능력 칩(`CardFace`의 `abilityTags`).
- 캐릭터 패시브: 각 캐릭터에 `Passive` 1개(`roster.ts`). 엔진이 턴 시작/공격 판정/KO 판정 시 자동 적용(매 턴 기력·보호막, 피해감소, 흡혈, 1회 부활 등). 표·적용 순서는 [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) "캐릭터 패시브".
- 한 턴 = 카드 3장 → **고른 슬롯 순서대로(1→2→3)** 해소. **같은 공격 카드는 한 턴에 한 번만**(쿨0이어도 — UI·AI가 강제, 2026-07-15). 한 슬롯 안에서만 나·상대 카드를 **우선순위 이동<수비<공격**으로 정렬해 처리(낮은 쪽 먼저 → 다음 카드는 갱신된 보드를 봄). 같은 슬롯 양측 공격은 동시 트레이드 — **동시 KO는 턴 시작 HP 비율이 높던 쪽이 승리**(타이브레이크, 랜덤 없음). (`CardBattle.resolveTurn`)
- **독안개(무한전 억제)** — 2026-07-16 열 축소 개편: **6턴부터 양 끝 열(col 0·5)**에 독안개, **3턴마다 안쪽으로** 한 단계씩(9턴 col 0·1·4·5 → 12턴 전부) 조여들어 결국 판 전체를 덮음. **턴 종료 시** 안개 열에 있으면 **턴당 10 고정 피해**(실드 무시, KO 가능). 상수·판정은 `types.ts`(`FOG_START_TURN/FOG_STEP_TURNS/FOG_DAMAGE/fogStageAt/isFogCell(cell,turn)/fogEscalatesNext`), 적용은 `resolveTurn` 끝(랜덤 없음 → 멀티 락스텝 안전). AI는 지금/다음 턴 안개면 중앙 열로 이탈. 상세는 GDD ④ "독안개".

## 온라인 멀티 (P2P + 짧은 코드) — 2026-06-18

- **게임 데이터는 항상 P2P(WebRTC).** 연결 성사(시그널링)에만 중개가 필요. **빠른 대전(랜덤 매칭)** — RTDB 대기열 `gridbrawl-mm`을 스캔해 가장 오래된 대기자를 ETag CAS(`lock`)로 원자 선점, 없으면 내 대기표(offer+심장박동)를 걸고 폴링(`src/net/matchmaking.ts`, 2026-07-15). 동시 큐 교착은 "나보다 먼저 온 대기표만 선점" 규칙으로 해소. **6자리 룸 코드** — Firebase RTDB를 *시그널링으로만* 사용(`src/net/firebase.ts`, REST+폴링, SDK 의존성 0). 복붙 초대 코드(`webrtc.ts`의 `createHost/joinAsGuest`)는 무설정 폴백으로 코드만 보존(현재 UI 미노출). STUN만 사용 → 대칭 NAT는 TURN 필요(미구현).
- **설정 필수**: `.env`의 `VITE_FIREBASE_DB_URL`(미설정 시 로비가 "설정 필요" 안내, 온라인 비활성). 절차는 `.env.example`. ⚠️ 테스트용 `.env.local`을 만들면 실제 `.env`를 덮어쓰니 주의(쓰면 반드시 삭제).
- **전송 분리**: 게임은 `NetTransport`(`src/net/protocol.ts`)에만 의존. 시그널링/전송을 바꿔도(서버·WebSocket·매치메이킹) 전투·UI 불변.
- **결정론 락스텝**: `engine.resolveTurn`은 랜덤 없음 → 두 피어가 동일 엔진(**호스트=side0, 게스트=side1 고정**)을 돌리고 매 턴 카드 ID만 교환(`session.ts`). `BattleScreen`은 `localSide` + `getOpponentPlan` 콜백으로 싱글(AI)·멀티(네트워크) 공용. **렌더는 로컬 시점**: 엔진은 정규 좌표(호스트=side0)지만 `BattleScreen`이 side1을 잡으면 화면을 좌우 반전해 **내 캐릭터를 항상 왼쪽(오른쪽 바라봄)·상대를 오른쪽**에 표시(`flip`/`dcol`). 절대좌표 이동 카드는 반전 시 좌↔우 라벨을 바꿔(`faceCard`) 화살표가 실제 화면 이동과 일치. 카드 사정거리·예측 범위는 항상 "앞=오른쪽". 내 쪽엔 "나" 배지.
- **턴 제한 30초(온라인만)** — `App.tsx`의 `MP_TURN_SECONDS`, `BattleScreen`의 `turnSeconds` prop. 0이 되면 자동 제출(현재 플랜이 유효하면 그대로, 아니면 빈 슬롯을 원기 회복으로 메움 → 최후엔 원기 회복 3장). 각 피어가 자기 플랜만 만들어 전송하므로 락스텝 안전. 싱글·튜토리얼은 prop 미지정 = 타이머 없음.
- 자세한 흐름·설정·검증·미구현(재대결 등)은 [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) §⑤-bis.

## 명세 ↔ 코드: 정합 완료 (방향 A)

설계 명세(2D 격자)와 코드는 이제 **일치**합니다(2026-06-15, 방향 A 채택·구현·검증). 상세 차이표·결정 근거는 [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) §⑤.

- 전투 룰·격자·카드 수치를 바꾸면 **GDD를 같은 변경에서 함께 갱신**. 격자 크기 변경 시 `types.ts`의 `GRID_COLS/ROWS`와 `ui.css`의 `.gridboard`를 같이 수정.
- 미구현(다음 후보): 승리 후 미스터리 카드 5중 1 선택(원작 보상).

## 배포 / 네이티브 앱 — 2026-07-13

- **웹 배포**: Firebase Hosting(`https://gridbrawl-9073d.web.app`). `npm run build && npx firebase deploy --only hosting,database`. env는 빌드 시점에 박히므로 배포 빌드 전에 `.env` 확인.
- **RTDB 규칙**: `database.rules.json`(레포 관리) — `gridbrawl/<코드>` 경로만 열림, 코드 형식·offer/answer 필드 검증. 규칙 바꾸면 `--only database`로 배포.
- **TURN**: `.env`의 `VITE_TURN_URL/USERNAME/CREDENTIAL`(선택, `webrtc.ts`가 ICE에 자동 추가). 비면 STUN 단독 — 셀룰러/대칭 NAT에서 연결 실패 가능. 관리형 TURN 발급 후 채우고 재빌드·재배포.
- **네이티브 앱(Capacitor)**: `capacitor.config.ts`(appId `kr.co.insplanet.gridbrawl`, webDir `dist`), `android/`·`ios/` 커밋됨. 워크플로: `npm run build && npx cap sync` → `npx cap open android|ios`. **가로 고정**: Android `AndroidManifest.xml`의 `sensorLandscape`, iOS `Info.plist` 가로 2종만. **네이티브에선 구글 로그인 숨김**(구글이 WebView OAuth 차단) — `LoginScreen`이 `Capacitor.isNativePlatform()`으로 게스트를 기본 버튼화. 구글은 추후 네이티브 플러그인으로.

## 컨벤션

- 게임 내 텍스트(카드 이름·설명·캐릭터 소개)와 주석은 **한국어**. 코드 식별자·파일·명령어는 영어.
- 새 캐릭터/카드는 기존 패턴(`roster.ts`의 `atk()` 헬퍼, `cards.ts`의 `CardDef`)을 따른다.
- 룰·시스템을 바꾸면 **[docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)를 같은 커밋에서 함께 갱신**한다.
