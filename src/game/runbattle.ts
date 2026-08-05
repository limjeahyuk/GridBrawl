// ---------------------------------------------------------------------------
// 런 상태 → BattleScreen 전투 props 다리. run.ts를 순수하게 유지하기 위해
// 엔진·AI 의존은 여기로 모은다. 현재 층의 몬스터로 1:1 전투를 구성한다.
// ---------------------------------------------------------------------------
import { getChar } from '../data/roster'
import { COMMON_CARDS } from '../battle/cards'
import { decideAI, type AIProfile } from '../battle/ai'
import { GRID_COLS, GRID_ROWS, type Cell } from '../battle/types'

// 이동은 모든 파이터가 쓰는 보편 능력이다. 몬스터의 `deckCardIds`는 정체성(공격·가드)만
// 담으므로, AI가 접근·회피할 수 있도록 공용 이동 카드를 풀에 주입한다. 이게 없으면
// `decideAI`의 `moveCard`가 덱에서 이동을 못 찾아 **몬스터가 제자리서 공격만 반복**한다.
const COMMON_MOVES: CardDef[] = COMMON_CARDS.filter((c) => c.kind === 'move')
import type { BattleOpts, CardBattle } from '../battle/engine'
import type { CardDef } from '../battle/types'
import { mergeRelics } from './relics'
import { monsterChar } from './monsters'
import { RUN_CARDS } from './runcards'
import { bossCinematic, bossPlan, bossTelegraph, isScriptedBoss, type BossCinematic } from './bosses'
import { currentEnemy, terrainFor, type RunState } from './run'

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
  /** 보스 컷인(등장·격노). 스크립트 보스가 아니면 undefined. */
  boss?: BossCinematic
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
  // 랜덤 배치(2026-08-05) — 4행 격자에서 **양쪽 다** 자기 끝열의 네 칸 중 무작위로
  // 선다. 세로로 어긋난 채 개전해 "회피하며 접근"이 판마다 다른 그림이 된다. 보스는
  // 연출·스크립트가 자리를 전제하므로 둘 다 가운데 줄(row 1) 고정. ⚠ 랜덤은 런
  // 전용이다 — PvP는 `startCells`를 안 넘겨 고정 START_CELLS를 쓰므로 락스텝 안전.
  const scripted = isScriptedBoss(enemy.id)
  const rndRow = () => Math.floor(Math.random() * GRID_ROWS)
  const pCell: Cell = { col: 0, row: scripted ? 1 : rndRow() }
  const monCell: Cell = { col: GRID_COLS - 1, row: scripted ? 1 : rndRow() }
  const battleOpts: BattleOpts = {
    chars: [pChar, eChar],
    passives: [mergeRelics(run.relicIds), eChar.passive],
    // HP 이월 — 플레이어는 지난 층에서 남은 체력으로 싸운다(몬스터는 풀피).
    startHp: [run.hp, undefined],
    startCells: [pCell, monCell],
    // 지형 — 무대마다 다른 바위 배치(`terrainFor`). 런 전용이라 PvP·봇전은 빈 판.
    obstacles: terrainFor(run),
  }
  // 전투별 기분(2026-08-05) — 같은 몬스터라도 판마다 공격성이 살짝 다르게. 성격
  // (archetype)과 함께 매 턴 decideAI로 넘긴다. 전투 시작 때 한 번만 굴린다.
  const profile: AIProfile = {
    archetype: enemy.behavior ?? 'balanced',
    moodAgg: (Math.random() - 0.5) * 0.24, // ≈ -0.12..+0.12
  }
  // 몬스터가 실제로 낼 수 있는 카드 = 공용 이동 + 그 몬스터 고유 덱(공격·가드).
  const enemyCards: CardDef[] = [...COMMON_MOVES, ...eChar.cards]
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
      return Promise.resolve(decideAI(b.state, 1, eChar, enemy.aiLevel, enemyCards, profile))
    },
    enemyName: enemy.name,
    telegraph: scripted ? (turn, frac) => bossTelegraph(enemy.id, { turn, hpFrac: frac }) : undefined,
    boss: scripted ? (bossCinematic(enemy.id, enemy.name) ?? undefined) : undefined,
  }
}
