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

// 오버로드 — 3턴 주기(견제 → 힘 모으기[예고] → 대격변). 체력 40% 이하면 격노
// (2턴 주기 연속 폭격). 대격변은 예고되므로 그 턴에 가드하거나 멀리 피하면 된다.
const overlord: BossScript = ({ turn, hpFrac }) => {
  const enraged = hpFrac <= 0.4
  if (enraged) {
    const beat = (turn - 1) % 2
    if (beat === 0)
      return { plan: ['mag-doom', 'arc-pin', 'm-left'], telegraph: '☠ 격노 — 연속 폭격! 가드로 버텨라' }
    return { plan: ['arc-pin', 'm-left', 'm-left'], telegraph: '격노한 오버로드가 짓쳐든다…' }
  }
  const beat = (turn - 1) % 3
  if (beat === 0) return { plan: ['arc-pin', 'm-left', 'c-guard'], telegraph: null } // 견제·접근
  if (beat === 1)
    return { plan: ['c-guard', 'm-left', 'm-left'], telegraph: '오버로드가 힘을 모은다… 다음 턴 대격변!' } // 힘 모으기
  return { plan: ['war-oath', 'mag-doom', 'm-left'], telegraph: '☠ 대격변! 이번 턴 전방위 폭격 — 막거나 멀리 피하라' } // 대격변
}

// 수호기사(엘리트) — 방패 반격수. 3턴: 방벽 올리기(예고 "지금 공격은 막힌다") →
// 견제 접근 → 커튼 열고 돌진 반격(예고). 방벽 턴에 큰 공격을 낭비하지 말라는 교육.
const warden: BossScript = ({ turn }) => {
  const beat = (turn - 1) % 3
  if (beat === 0)
    return { plan: ['war-wall', 'm-left', 'm-left'], telegraph: '🛡 수호기사가 방벽을 올린다 — 이번 턴 공격은 대부분 막힌다' }
  if (beat === 1) return { plan: ['war-bash', 'm-left', 'm-left'], telegraph: null } // 견제·접근
  return { plan: ['war-oath', 'm-left', 'm-left'], telegraph: '⚔ 커튼을 열고 돌진 반격!' }
}

// 화염군주(엘리트) — 폭딜. 3턴: 접근·견제 → 불길 모으기(예고) → 인페르노(예고).
// 체력 40% 이하면 격노(2턴 주기 연속 화염).
const pyrelord: BossScript = ({ turn, hpFrac }) => {
  if (hpFrac <= 0.4) {
    const beat = (turn - 1) % 2
    if (beat === 0)
      return { plan: ['mag-doom', 'arc-pin', 'm-left'], telegraph: '🔥 격노 — 연속 화염! 막거나 피하라' }
    return { plan: ['arc-pin', 'mag-flame', 'm-left'], telegraph: '격노한 화염군주가 불타오른다…' }
  }
  const beat = (turn - 1) % 3
  if (beat === 0) return { plan: ['arc-pin', 'm-left', 'mag-flame'], telegraph: null } // 접근·견제
  if (beat === 1)
    return { plan: ['mag-flame', 'm-left', 'm-left'], telegraph: '불길이 치솟는다… 다음 턴 인페르노!' } // 모으기
  return { plan: ['mag-doom', 'm-left', 'm-left'], telegraph: '🔥 인페르노 러시 — 화염 폭발! 막거나 피하라' } // 폭발
}

const SCRIPTS: Record<string, BossScript> = {
  overlord,
  warden,
  pyrelord,
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
