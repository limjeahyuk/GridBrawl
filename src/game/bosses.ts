// ---------------------------------------------------------------------------
// 보스 스크립트 패턴 — 보스는 일반 그리디 AI(decideAI) 대신 **턴 기반 정해진
// 리듬**으로 싸운다. 예고(telegraph)를 띄워 플레이어가 막거나 피할 수 있게 한다.
// 전투 엔진은 결정론이고 런은 싱글 전용이라 랜덤 없이 turn·hp만으로 계획한다.
//
// 계획은 카드 id 배열(3장). 엔진은 쿨타임을 강제하지 않으므로 보스는 시그니처를
// 자유롭게 반복할 수 있다. 이동(m-left 등)은 덱에 없어도 엔진이 그대로 받는다.
// ---------------------------------------------------------------------------
import { COMMON_CARDS } from '../battle/cards'
import { ROSTER } from '../data/roster'
import type { CardDef } from '../battle/types'

const ALL_CARDS: CardDef[] = [...COMMON_CARDS, ...ROSTER.flatMap((c) => c.cards)]
const cardById = (id: string): CardDef | undefined => ALL_CARDS.find((c) => c.id === id)

export interface BossCtx {
  turn: number
  hpFrac: number // 보스 현재 체력 비율(0~1) — 페이즈 전환 판정
}
export interface BossAction {
  plan: string[] // 카드 id 3장
  telegraph: string | null // 선택 화면에 띄울 예고(없으면 null)
}

type BossScript = (ctx: BossCtx) => BossAction

// 세 보스는 **리듬이 서로 달라야** 한다 — 예전엔 오버로드·화염군주가 둘 다
// "접근 → 모으기[예고] → 대폭발[예고] + 40% 격노"로 사실상 같은 싸움이었다.
// 이제 셋을 다른 축으로 가른다:
//   overlord  상시 압박형 — 쉬는 턴이 없고 40%에 **부활+2페이즈**(끝판 보스)
//   warden    방벽 반격형 — 방벽 턴엔 때려도 막히고, 35%에 **방벽을 버리는 최후의 돌진**
//   pyrelord  예고 폭발형 — 4턴을 느리게 충전(그동안이 반격 창), 인페르노만 크게

// 오버로드 — **끝판 보스**. 페이즈1은 쉴 틈 없는 압박 + 3턴마다 예고된 대격변.
// 체력 40%에서 **부활(passive revive)과 함께 2페이즈**로 넘어가 2턴 주기 연속 폭격.
// 안전한 충전 창이 없다는 점이 화염군주와 다르다 — 계속 두들겨 맞으며 뚫어야 한다.
const overlord: BossScript = ({ turn, hpFrac }) => {
  if (hpFrac <= 0.4) {
    // 페이즈2 — 쉬는 턴 없이 2턴 주기 전방위 폭격.
    const beat = (turn - 1) % 2
    if (beat === 0)
      return { plan: ['mag-doom', 'arc-pin', 'm-left'], telegraph: '☠ 2페이즈 — 멈추지 않는 전방위 폭격!' }
    return { plan: ['arc-pin', 'mag-doom', 'm-left'], telegraph: null }
  }
  // 페이즈1 — 압박 → 힘 모으기(예고) → 대격변(예고).
  const beat = (turn - 1) % 3
  if (beat === 0) return { plan: ['arc-pin', 'mag-doom', 'm-left'], telegraph: null } // 상시 압박
  if (beat === 1)
    return { plan: ['c-guard', 'arc-pin', 'm-left'], telegraph: '오버로드가 힘을 모은다… 다음 턴 대격변!' }
  return { plan: ['war-oath', 'mag-doom', 'arc-pin'], telegraph: '☠ 대격변! 이번 턴 전방위 폭격 — 막거나 멀리 피하라' }
}

// 수호기사(엘리트) — **방벽 반격수**. 3턴: 방벽 올리기(예고 "지금 공격은 막힌다") →
// 견제 접근 → 커튼 열고 돌진 반격(예고). 방벽 턴에 큰 공격을 낭비하지 말라는 교육.
// 체력 35% 이하면 **방벽을 버리고** 2턴 주기로 끝까지 몰아친다(최후의 돌진).
const warden: BossScript = ({ turn, hpFrac }) => {
  if (hpFrac <= 0.35) {
    const beat = (turn - 1) % 2
    if (beat === 0)
      return { plan: ['war-bash', 'war-oath', 'm-left'], telegraph: '⚔ 방벽을 버렸다 — 최후의 돌진!' }
    return { plan: ['war-oath', 'm-left', 'war-bash'], telegraph: null }
  }
  const beat = (turn - 1) % 3
  if (beat === 0)
    return { plan: ['war-wall', 'm-left', 'm-left'], telegraph: '🛡 수호기사가 방벽을 올린다 — 이번 턴 공격은 대부분 막힌다' }
  if (beat === 1) return { plan: ['war-bash', 'm-left', 'm-left'], telegraph: null } // 견제·접근
  return { plan: ['war-oath', 'm-left', 'war-bash'], telegraph: '⚔ 커튼을 열고 돌진 반격!' }
}

// 화염군주(엘리트) — **예고 폭발형**. 4턴을 느리게 충전한다: 견제 → 불씨(예고) →
// 극대(예고) → 인페르노(대폭발·예고). 충전하는 두 턴이 곧 **안전하게 반격할 창**이라,
// 오버로드의 "상시 압박"과 정반대다. 체력 40% 이하면 충전을 생략하고 2턴마다 화염.
const pyrelord: BossScript = ({ turn, hpFrac }) => {
  if (hpFrac <= 0.4) {
    const beat = (turn - 1) % 2
    if (beat === 0)
      return { plan: ['mag-doom', 'mag-flame', 'm-left'], telegraph: '🔥 격노 — 쉴 틈 없는 화염!' }
    return { plan: ['arc-pin', 'mag-flame', 'm-left'], telegraph: null }
  }
  const beat = (turn - 1) % 4
  if (beat === 0) return { plan: ['arc-pin', 'm-left', 'mag-flame'], telegraph: null } // 견제
  if (beat === 1)
    return { plan: ['mag-flame', 'm-left', 'm-left'], telegraph: '🔥 불씨를 모은다… 지금이 반격할 때다' }
  if (beat === 2)
    return { plan: ['mag-flame', 'c-guard', 'm-left'], telegraph: '🔥🔥 불길이 극에 달한다 — 다음 턴 인페르노!' }
  return { plan: ['mag-doom', 'mag-flame', 'm-left'], telegraph: '☄ 인페르노! 전방위 폭발 — 막거나 멀리 피하라' } // 대폭발
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
 *    변화와 맞물린다(수호기사 0.35 · 나머지 0.4).
 */
export interface BossCinematic {
  name: string
  entrance: string // 등장 태그라인
  enrage: string // 격노/페이즈 태그라인
  enrageAt: number // 이 체력비 아래로 내려가면 격노 컷인
}
const CINE: Record<string, Omit<BossCinematic, 'name'>> = {
  overlord: { entrance: '심연의 군주가 강림한다', enrage: '다시 일어선다 — 2페이즈', enrageAt: 0.4 },
  warden: { entrance: '수호기사가 길을 막아선다', enrage: '방벽을 버렸다', enrageAt: 0.35 },
  pyrelord: { entrance: '화염군주가 불타오른다', enrage: '화염이 폭주한다', enrageAt: 0.4 },
}

/** 보스 컷인 데이터(이름은 몬스터 표시명). 스크립트 보스가 아니면 null. */
export function bossCinematic(monsterId: string, name: string): BossCinematic | null {
  const c = CINE[monsterId]
  return c ? { name, ...c } : null
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
