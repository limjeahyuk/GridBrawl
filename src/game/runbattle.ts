// ---------------------------------------------------------------------------
// 런 상태 → BattleScreen 전투 props 다리. run.ts를 순수하게 유지하기 위해
// 엔진·AI 의존은 여기로 모은다. 현재 층의 몬스터로 1:1 전투를 구성한다.
// ---------------------------------------------------------------------------
import { getChar } from '../data/roster'
import { COMMON_CARDS } from '../battle/cards'
import { decideAI } from '../battle/ai'

// 이동은 모든 파이터가 쓰는 보편 능력이다. 몬스터의 `deckCardIds`는 정체성(공격·가드)만
// 담으므로, AI가 접근·회피할 수 있도록 공용 이동 카드를 풀에 주입한다. 이게 없으면
// `decideAI`의 `moveCard`가 덱에서 이동을 못 찾아 **몬스터가 제자리서 공격만 반복**한다.
const COMMON_MOVES: CardDef[] = COMMON_CARDS.filter((c) => c.kind === 'move')
import type { BattleOpts, CardBattle } from '../battle/engine'
import type { CardDef } from '../battle/types'
import { mergeRelics } from './relics'
import { monsterChar } from './monsters'
import { RUN_CARDS } from './runcards'
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
  // 런 덱은 공용 + 직업 기본기 + 그 캐릭터 고유 + **런 전용 카드**에서 해석한다(PvP 덱빌더는 불변).
  const all: CardDef[] = [...COMMON_CARDS, ...pChar.basics, ...pChar.cards, ...RUN_CARDS]
  const deck = run.deck
    .map((id) => all.find((c) => c.id === id))
    .filter((c): c is CardDef => !!c)
  const battleOpts: BattleOpts = {
    chars: [pChar, eChar],
    passives: [mergeRelics(run.relicIds), eChar.passive],
    // HP 이월 — 플레이어는 지난 층에서 남은 체력으로 싸운다(몬스터는 풀피).
    startHp: [run.hp, undefined],
  }
  // 몬스터가 실제로 낼 수 있는 카드 = 공용 이동 + 그 몬스터 고유 덱(공격·가드).
  const enemyCards: CardDef[] = [...COMMON_MOVES, ...eChar.cards]
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
      return Promise.resolve(decideAI(b.state, 1, eChar, enemy.aiLevel, enemyCards))
    },
    enemyName: enemy.name,
    telegraph: scripted ? (turn, frac) => bossTelegraph(enemy.id, { turn, hpFrac: frac }) : undefined,
  }
}
