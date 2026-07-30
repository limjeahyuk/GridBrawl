// ---------------------------------------------------------------------------
// 런 상태 → BattleScreen 전투 props 다리. run.ts를 순수하게 유지하기 위해
// 엔진·AI 의존은 여기로 모은다. 현재 층의 몬스터로 1:1 전투를 구성한다.
// ---------------------------------------------------------------------------
import { getChar } from '../data/roster'
import { COMMON_CARDS } from '../battle/cards'
import { decideAI } from '../battle/ai'
import type { BattleOpts, CardBattle } from '../battle/engine'
import type { CardDef } from '../battle/types'
import { mergeRelics } from './relics'
import { monsterChar } from './monsters'
import { bossPlan, bossTelegraph, isScriptedBoss } from './bosses'
import { currentEnemy, type RunState } from './run'

export interface RunFightProps {
  p0CharId: string
  p1CharId: string
  deck: CardDef[]
  battleOpts: BattleOpts
  getOpponentPlan: (localPlan: CardDef[], b: CardBattle) => Promise<CardDef[] | null>
  enemyName: string
  /** 보스 예고(선택 화면 배너). turn·상대 체력비율을 받아 문구 or null. 스크립트
   *  보스가 아니면 undefined. */
  telegraph?: (turn: number, oppHpFrac: number) => string | null
}

export function runFightProps(run: RunState): RunFightProps {
  const enemy = currentEnemy(run)
  const pChar = getChar(run.charId)
  const eChar = monsterChar(enemy)
  const all: CardDef[] = [...COMMON_CARDS, ...pChar.cards]
  const deck = run.deck
    .map((id) => all.find((c) => c.id === id))
    .filter((c): c is CardDef => !!c)
  const battleOpts: BattleOpts = {
    chars: [pChar, eChar],
    passives: [mergeRelics(run.relicIds), eChar.passive],
  }
  const scripted = isScriptedBoss(enemy.id)
  return {
    p0CharId: run.charId,
    p1CharId: enemy.baseArtId, // 아트 재활용
    deck,
    battleOpts,
    getOpponentPlan: (_local, b) => {
      // 보스는 스크립트 패턴으로, 그 외엔 일반 AI로.
      if (scripted) {
        const ctx = { turn: b.state.turn, hpFrac: b.state.hp[1] / b.maxHp[1] }
        const plan = bossPlan(enemy.id, ctx)
        if (plan) return Promise.resolve(plan)
      }
      return Promise.resolve(decideAI(b.state, 1, eChar, enemy.aiLevel, eChar.cards))
    },
    enemyName: enemy.name,
    telegraph: scripted ? (turn, frac) => bossTelegraph(enemy.id, { turn, hpFrac: frac }) : undefined,
  }
}
