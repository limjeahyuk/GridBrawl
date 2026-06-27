# GridBrawl — 프로젝트 가이드 (Claude용)

> 이 파일은 매 세션 자동 로드됩니다. **전투/카드/토너먼트 관련 작업 전에는 반드시 [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)를 먼저 읽으세요.**

## 무엇을 만드는가

*이누야샤 데몬 토너먼트*의 룰을 차용한 **1:1 토너먼트 카드 전투 게임**. 한 턴에 카드 3장을 골라 순서대로 실행해 상대 HP를 깎고, 이기면 다음 상대로 진행. 원작 캐릭터 대신 오리지널 사이버 아레나 캐릭터(VOLT/TITAN/NOVA/CIPHER/AEGIS/EMBER)를 사용. 전체 룰/설계는 [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md).

## 기술 스택 / 명령어

- React 19 + TypeScript + Vite. 외부 게임 엔진 없음 — 전투는 순수 TS(`CardBattle`)로 시뮬레이션 후 React 렌더.
- 개발 `npm run dev` · 빌드 `npm run build` · 타입검사 `npm run typecheck`
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
- 화면 흐름(싱글): `title → select → bracket → fight → result` (`src/App.tsx` 상태 머신). 온라인: `title →(온라인 대전)→ mp-select → mp-lobby → mp-fight → mp-result`.
- 전장은 **2D 격자 6열 × 3행**(`GRID_COLS/ROWS`). 위치는 셀 `{col,row}`, 시작은 가운뎃줄 양 끝. p0는 오른쪽, p1은 왼쪽을 바라봄(`facing`).
- 카드 종류: `move / attack / guard / energy`. 모든 카드에 `cooldown`(사용 후 잠기는 턴 수).
  - 이동: `> < ^ v`(쿨0), 좌우 대시 `>> <<`(쿨1). 가드: 기력 10·실드 +50·쿨1. 원기: 기력 +50·쿨0. 턴 시작 패시브 기력 +30.
  - 공격: `range` 오프셋 `{df,du}`(df=앞, du=위)로 타격 셀 지정. 상대 셀이 들어오면 적중, 실드가 먼저 흡수.
- 캐릭터 패시브: 각 캐릭터에 `Passive` 1개(`roster.ts`). 엔진이 턴 시작/공격 판정 시 자동 적용(매 턴 기력·보호막, 피해감소, 흡혈, 보호막 파괴 등). 표·적용 순서는 [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) "캐릭터 패시브".
- 한 턴 = 카드 3장 → **고른 슬롯 순서대로(1→2→3)** 해소. 한 슬롯 안에서만 나·상대 카드를 **우선순위 이동<수비<공격**으로 정렬해 처리(낮은 쪽 먼저 → 다음 카드는 갱신된 보드를 봄). 같은 슬롯 양측 공격은 동시 트레이드. (`CardBattle.resolveTurn`)

## 온라인 멀티 (P2P + 짧은 코드) — 2026-06-18

- **게임 데이터는 항상 P2P(WebRTC).** 연결 성사(시그널링)에만 중개가 필요. **기본은 6자리 룸 코드** — Firebase RTDB를 *시그널링으로만* 사용(`src/net/firebase.ts`, REST+폴링, SDK 의존성 0). 복붙 초대 코드(`webrtc.ts`의 `createHost/joinAsGuest`)는 무설정 폴백으로 코드만 보존(현재 UI 미노출). STUN만 사용 → 대칭 NAT는 TURN 필요(미구현).
- **설정 필수**: `.env`의 `VITE_FIREBASE_DB_URL`(미설정 시 로비가 "설정 필요" 안내, 온라인 비활성). 절차는 `.env.example`. ⚠️ 테스트용 `.env.local`을 만들면 실제 `.env`를 덮어쓰니 주의(쓰면 반드시 삭제).
- **전송 분리**: 게임은 `NetTransport`(`src/net/protocol.ts`)에만 의존. 시그널링/전송을 바꿔도(서버·WebSocket·매치메이킹) 전투·UI 불변.
- **결정론 락스텝**: `engine.resolveTurn`은 랜덤 없음 → 두 피어가 동일 엔진(**호스트=side0, 게스트=side1 고정**)을 돌리고 매 턴 카드 ID만 교환(`session.ts`). `BattleScreen`은 `localSide` + `getOpponentPlan` 콜백으로 싱글(AI)·멀티(네트워크) 공용. **렌더는 로컬 시점**: 엔진은 정규 좌표(호스트=side0)지만 `BattleScreen`이 side1을 잡으면 화면을 좌우 반전해 **내 캐릭터를 항상 왼쪽(오른쪽 바라봄)·상대를 오른쪽**에 표시(`flip`/`dcol`). 절대좌표 이동 카드는 반전 시 좌↔우 라벨을 바꿔(`faceCard`) 화살표가 실제 화면 이동과 일치. 카드 사정거리·예측 범위는 항상 "앞=오른쪽". 내 쪽엔 "나" 배지.
- 자세한 흐름·설정·검증·미구현(재대결 등)은 [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) §⑤-bis.

## 명세 ↔ 코드: 정합 완료 (방향 A)

설계 명세(2D 격자)와 코드는 이제 **일치**합니다(2026-06-15, 방향 A 채택·구현·검증). 상세 차이표·결정 근거는 [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) §⑤.

- 전투 룰·격자·카드 수치를 바꾸면 **GDD를 같은 변경에서 함께 갱신**. 격자 크기 변경 시 `types.ts`의 `GRID_COLS/ROWS`와 `ui.css`의 `.gridboard`를 같이 수정.
- 미구현(다음 후보): 승리 후 미스터리 카드 5중 1 선택(원작 보상).

## 컨벤션

- 게임 내 텍스트(카드 이름·설명·캐릭터 소개)와 주석은 **한국어**. 코드 식별자·파일·명령어는 영어.
- 새 캐릭터/카드는 기존 패턴(`roster.ts`의 `atk()` 헬퍼, `cards.ts`의 `CardDef`)을 따른다.
- 룰·시스템을 바꾸면 **[docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)를 같은 커밋에서 함께 갱신**한다.
