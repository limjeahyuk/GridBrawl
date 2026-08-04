// ---------------------------------------------------------------------------
// 보스 스크립트 패턴 — 보스는 일반 그리디 AI(decideAI) 대신 **턴 기반 정해진
// 리듬**으로 싸운다. 예고(telegraph)를 띄워 플레이어가 막거나 피할 수 있게 한다.
// 전투 엔진은 결정론이고 런은 싱글 전용이라 랜덤 없이 turn·hp만으로 계획한다.
//
// 계획은 카드 id 배열(3장). 엔진은 쿨타임을 강제하지 않으므로 보스는 시그니처를
// 자유롭게 반복할 수 있다. 이동(m-left 등)은 덱에 없어도 엔진이 그대로 받는다.
//
// **카드는 보스 전용이다**(2026-08-05, `bosscards.ts`). 그전엔 셋 다 플레이어
// 카드(`mag-doom`·`war-oath`·`arc-pin`)를 빌려 써서, 예고 문구만 보스 것이고
// 실제로 날아오는 건 플레이어가 이미 아는 카드였다.
//
// ⚠ **한 턴에 같은 공격 카드를 두 번 넣지 말 것.** 엔진은 막지 않지만 플레이어에겐
//   "같은 공격은 한 턴에 한 번"이 강제돼 있어(UI·AI) 보스만 예외가 되면 불공평하다.
//   `npm run check`가 이걸 검사한다.
// ---------------------------------------------------------------------------
import { COMMON_CARDS } from '../battle/cards'
import { ROSTER } from '../data/roster'
import { BOSS_CARDS } from './bosscards'
import type { CardDef } from '../battle/types'
import type { BattleScene } from './run'

const ALL_CARDS: CardDef[] = [...COMMON_CARDS, ...ROSTER.flatMap((c) => c.cards), ...BOSS_CARDS]
const cardById = (id: string): CardDef | undefined => ALL_CARDS.find((c) => c.id === id)

export interface BossCtx {
  turn: number
  hpFrac: number // 보스 현재 체력 비율(0~1) — 페이즈 전환 판정
}
export interface BossAction {
  plan: string[] // 카드 id 3장
  telegraph: string | null // 선택 화면에 띄울 예고(없으면 null)
  /** 지금 몇 페이즈인가(1 = 기본, 2 = 격노). HUD 표시·컷인 판정에 쓴다. */
  phase: 1 | 2
}

type BossScript = (ctx: BossCtx) => BossAction

// 세 보스는 **리듬이 서로 달라야** 한다 — 예전엔 오버로드·화염군주가 둘 다
// "접근 → 모으기[예고] → 대폭발[예고] + 40% 격노"로 사실상 같은 싸움이었다.
// 이제 셋을 다른 축으로 가른다. 전용 카드가 그 축을 실제 메커니즘으로 만든다:
//   overlord  **도망칠 수 없다** — 끌어당김 + 관통 광역, 쉬는 턴이 없다
//   warden    **때릴 타이밍이 정해져 있다** — 방벽 턴 / 보호막을 부수는 반격 턴
//   pyrelord  **길어질수록 무거워진다** — 충전(empower)이 실제로 쌓인다

// 오버로드 — **끝판 보스**. 페이즈1은 쉴 틈 없는 압박 + 3턴마다 예고된 아가리.
// 체력 40%에서 **부활(passive revive)과 함께 2페이즈**로 넘어가 2턴 주기 연속 폭격.
// 안전한 충전 창이 없다는 점이 화염군주와 정반대다 — 계속 두들겨 맞으며 뚫어야 한다.
// 「심연의 손아귀」가 물러나는 플레이어를 매번 도로 끌어와서, **거리를 버는 것으로는
// 이 보스를 상대할 수 없다**.
const overlord: BossScript = ({ turn, hpFrac }) => {
  if (hpFrac <= 0.4) {
    // 페이즈2 — 쉬는 턴 없이 2턴 주기 전방위 폭격.
    const beat = (turn - 1) % 2
    if (beat === 0)
      return { plan: ['b-abyss-maw', 'b-abyss-grasp', 'm-left'], phase: 2, telegraph: '☠ 2페이즈 — 심연이 입을 다물지 않는다!' }
    return { plan: ['b-abyss-tide', 'b-abyss-brand', 'm-left'], phase: 2, telegraph: null }
  }
  // 페이즈1 — 끌어당겨 압박 → 낙인(예고) → 아가리(예고).
  const beat = (turn - 1) % 3
  if (beat === 0)
    return { plan: ['b-abyss-grasp', 'b-abyss-tide', 'm-left'], phase: 1, telegraph: null } // 상시 압박
  if (beat === 1)
    return { plan: ['b-abyss-brand', 'b-abyss-grasp', 'm-left'], phase: 1, telegraph: '오버로드가 심연을 연다… 다음 턴 집어삼킨다!' }
  return { plan: ['b-abyss-maw', 'b-abyss-tide', 'm-left'], phase: 1, telegraph: '☠ 집어삼키는 아가리! 보호막이 통하지 않는다 — 멀리 피하라' }
}

// 수호기사(엘리트) — **방벽 반격수**. 3턴: 방벽 올리기(예고 "지금 공격은 막힌다") →
// 견제 돌진 → 커튼 열고 심판(예고). 방벽 턴에 큰 공격을 낭비하지 말라는 교육이고,
// 「최후의 심판」이 **보호막을 남김없이 부수므로** 플레이어도 가드 타이밍을 골라야 한다.
// 체력 35% 이하면 **방벽을 버리고** 2턴 주기로 끝까지 몰아친다.
const warden: BossScript = ({ turn, hpFrac }) => {
  if (hpFrac <= 0.35) {
    const beat = (turn - 1) % 2
    if (beat === 0)
      return { plan: ['b-ward-verdict', 'b-ward-lance', 'm-left'], phase: 2, telegraph: '⚔ 방벽을 버렸다 — 최후의 심판!' }
    return { plan: ['b-ward-riposte', 'b-ward-lance', 'm-left'], phase: 2, telegraph: null }
  }
  const beat = (turn - 1) % 3
  if (beat === 0)
    return { plan: ['b-ward-bulwark', 'm-left', 'm-left'], phase: 1, telegraph: '🛡 수호기사가 방벽을 올린다 — 이번 턴 공격은 대부분 막힌다' }
  if (beat === 1)
    return { plan: ['b-ward-lance', 'm-left', 'm-left'], phase: 1, telegraph: null } // 견제·접근
  return { plan: ['b-ward-riposte', 'b-ward-verdict', 'm-left'], phase: 1, telegraph: '⚔ 커튼을 열고 심판! 보호막이 부서진다' }
}

// 화염군주(엘리트) — **예고 폭발형**. 4턴을 느리게 충전한다: 견제 → 불씨(예고) →
// 극대(예고) → 인페르노(대폭발·예고). 충전하는 두 턴이 곧 **안전하게 반격할 창**이라,
// 오버로드의 "상시 압박"과 정반대다.
// ⚠ 「불씨 모으기」의 `empower`는 **이 전투 내내 남는다** — 예전엔 "모은다"가 문구뿐
//   이었고 실제로 쌓이는 게 없었다. 이제 오래 끌면 진짜로 더 아프다.
// 체력 40% 이하면 충전을 생략하고 2턴마다 화염.
const pyrelord: BossScript = ({ turn, hpFrac }) => {
  if (hpFrac <= 0.4) {
    const beat = (turn - 1) % 2
    if (beat === 0)
      return { plan: ['b-pyre-inferno', 'b-pyre-lash', 'm-left'], phase: 2, telegraph: '🔥 격노 — 쉴 틈 없는 화염!' }
    return { plan: ['b-pyre-pillar', 'b-pyre-lash', 'm-left'], phase: 2, telegraph: null }
  }
  // ⚠ **충전하는 두 턴(beat 1·2)은 실제로 약해야 한다.** 처음엔 이 턴에도 화염
  //   채찍·기둥을 같이 넣었는데, 그러면 "반격 창"이 문구뿐이고 매 턴 두 대씩
  //   맞는다 — 시뮬에서 화염군주 조우 승률이 44%까지 떨어졌다(수호기사 71%·
  //   가디언 68%와 비교하면 혼자 벽이었다). 지금은 충전 턴엔 불씨 한 장뿐이다.
  const beat = (turn - 1) % 4
  if (beat === 0) return { plan: ['b-pyre-lash', 'm-left', 'm-left'], phase: 1, telegraph: null } // 견제
  if (beat === 1)
    return { plan: ['b-pyre-ember', 'm-left', 'm-left'], phase: 1, telegraph: '🔥 불씨를 모은다… 공격력이 쌓인다. 지금이 반격할 때다' }
  if (beat === 2)
    return { plan: ['b-pyre-ember', 'b-pyre-lash', 'm-left'], phase: 1, telegraph: '🔥🔥 불길이 극에 달한다 — 다음 턴 인페르노!' }
  return { plan: ['b-pyre-inferno', 'b-pyre-pillar', 'm-left'], phase: 1, telegraph: '☄ 인페르노! 전방위 불바다 — 막거나 멀리 피하라' } // 대폭발
}

const SCRIPTS: Record<string, BossScript> = {
  overlord,
  warden,
  pyrelord,
}

/**
 * 보스 컷인 연출 메타데이터(2026-08-05). BattleScreen이 **등장**(전투 시작)과
 * **격노/페이즈 전환**(체력이 `enrageAt` 아래로) 순간에 컷인을 띄운다.
 * ⚠ `enrageAt`은 위 스크립트의 페이즈 전환 문턱과 **같아야** 컷인이 실제 행동
 *    변화와 맞물린다(수호기사 0.35 · 나머지 0.4). `npm run check`가 검사한다.
 */
export interface BossCinematic {
  name: string
  title: string // 컷인에 뜨는 칭호(이름 위 한 줄)
  entrance: string // 등장 태그라인
  enrage: string // 격노/페이즈 태그라인
  enrageAt: number // 이 체력비 아래로 내려가면 격노 컷인
  /** 이 보스의 전용 무대. `sceneFor()`가 층 규칙보다 우선해서 쓴다. */
  scene: BattleScene
  /** 컷인·무대 조명의 기조색. 보스마다 화면 전체의 색이 달라야 "다른 상대"로 읽힌다. */
  accent: string
}
const CINE: Record<string, Omit<BossCinematic, 'name'>> = {
  overlord: {
    title: '심연의 군주',
    entrance: '바닥이 열리고, 심연이 올려다본다',
    enrage: '다시 일어선다 — 심연이 입을 다물지 않는다',
    enrageAt: 0.4,
    scene: 'abyss',
    accent: '#a05fd8',
  },
  warden: {
    title: '봉인의 파수꾼',
    entrance: '수호기사가 길을 막아선다',
    enrage: '방벽을 버렸다 — 심판만 남았다',
    enrageAt: 0.35,
    scene: 'sanctum',
    accent: '#d8b45a',
  },
  pyrelord: {
    title: '잿불의 폭군',
    entrance: '화염군주가 불타오른다',
    enrage: '모아 둔 불씨가 한꺼번에 터진다',
    enrageAt: 0.4,
    scene: 'lava',
    accent: '#f0803a',
  },
}

/** 보스 컷인 데이터(이름은 몬스터 표시명). 스크립트 보스가 아니면 null. */
export function bossCinematic(monsterId: string, name: string): BossCinematic | null {
  const c = CINE[monsterId]
  return c ? { name, ...c } : null
}

/** 이 몬스터의 전용 무대. 스크립트 보스가 아니면 null(층 규칙을 따른다). */
export function bossScene(monsterId: string): BattleScene | null {
  return CINE[monsterId]?.scene ?? null
}

export function isScriptedBoss(monsterId: string): boolean {
  return monsterId in SCRIPTS
}

export function bossAction(monsterId: string, ctx: BossCtx): BossAction | null {
  return SCRIPTS[monsterId]?.(ctx) ?? null
}

/** 보스 계획을 CardDef 배열로. 스크립트가 없으면 null(→ 일반 AI로 폴백). */
export function bossPlan(monsterId: string, ctx: BossCtx): CardDef[] | null {
  const a = bossAction(monsterId, ctx)
  if (!a) return null
  return a.plan.map(cardById).filter((c): c is CardDef => !!c)
}

/** 선택 화면 예고 문구. 스크립트가 없거나 예고가 없으면 null. */
export function bossTelegraph(monsterId: string, ctx: BossCtx): string | null {
  return bossAction(monsterId, ctx)?.telegraph ?? null
}

/** 검사·문서용 — 스크립트 보스 id 목록과 그 스크립트. */
export const BOSS_IDS: string[] = Object.keys(SCRIPTS)
export { CINE as BOSS_CINEMATICS }
