// ---------------------------------------------------------------------------
// AI vs AI 밸런스 시뮬레이터. 전 캐릭터 순서쌍(36 매치업) × N판을 돌려
// 평균 턴 수·승률·매치업 표를 출력한다. 엔진·AI를 그대로 사용하므로
// 수치(cards.ts / roster.ts)를 바꾸고 다시 돌리면 밸런스 변화를 측정할 수 있다.
//
// 실행:  npm run sim [판수/매치업]   (기본 300 → 총 10,800판)
// ---------------------------------------------------------------------------
import { CardBattle } from '../src/battle/engine'
import { decideAI } from '../src/battle/ai'
import { ROSTER } from '../src/data/roster'

const N = parseInt(process.argv[2] ?? '300', 10)
const MAX_TURNS = 40 // 안전 상한 — 이 안에 안 끝나면 무승부(timeout) 처리
const IDS = ROSTER.map((c) => c.id)

interface GameResult {
  winner: string | null // char id, null = 무승부/타임아웃
  turns: number
  timeout: boolean
  drawCause: 'fog' | 'trade' | null // 무승부일 때: 독안개 동반사 vs 동시 KO
}

function playGame(a: string, b: string): GameResult {
  const battle = new CardBattle(a, b)
  let lastSteps: ReturnType<CardBattle['resolveTurn']> = []
  while (!battle.state.over && battle.state.turn <= MAX_TURNS) {
    const p0 = decideAI(battle.state, 0, battle.chars[0], 'hard')
    const p1 = decideAI(battle.state, 1, battle.chars[1], 'hard')
    lastSteps = battle.resolveTurn(p0, p1)
  }
  const w = battle.state.winner
  const isDraw = battle.state.over && w === null
  return {
    winner: battle.state.over && w !== null ? (w === 0 ? a : b) : null,
    turns: battle.state.turn,
    timeout: !battle.state.over,
    drawCause: isDraw ? (lastSteps.some((s) => s.phase === 'fog') ? 'fog' : 'trade') : null,
  }
}

// --- run ---------------------------------------------------------------------
const wins: Record<string, number> = {}
const games: Record<string, number> = {}
const cell: Record<string, { w: number; d: number; n: number; turns: number }> = {} // a>b 매치업
let allTurns: number[] = []
let draws = 0
let fogDraws = 0
let timeouts = 0

for (const a of IDS)
  for (const b of IDS) {
    if (a === b) continue
    const key = `${a}>${b}`
    cell[key] = { w: 0, d: 0, n: 0, turns: 0 }
    for (let i = 0; i < N; i++) {
      const r = playGame(a, b)
      allTurns.push(r.turns)
      cell[key].n++
      cell[key].turns += r.turns
      games[a] = (games[a] ?? 0) + 1
      games[b] = (games[b] ?? 0) + 1
      if (r.timeout) timeouts++
      if (r.winner === null) {
        draws++
        cell[key].d++
        if (r.drawCause === 'fog') fogDraws++
      } else {
        wins[r.winner] = (wins[r.winner] ?? 0) + 1
        if (r.winner === a) cell[key].w++
      }
    }
  }

// --- report ------------------------------------------------------------------
allTurns.sort((x, y) => x - y)
const total = allTurns.length
const avg = allTurns.reduce((s, t) => s + t, 0) / total
const median = allTurns[Math.floor(total / 2)]
const pct = (n: number, d: number) => ((100 * n) / d).toFixed(1).padStart(5)

console.log(`\n=== GridBrawl 밸런스 시뮬 (hard AI, ${N}판/매치업, 총 ${total}판) ===\n`)
console.log(
  `평균 턴: ${avg.toFixed(2)}   중앙값: ${median}   무승부 ${pct(draws, total)}% (안개 ${pct(fogDraws, total)}% / 트레이드 ${pct(draws - fogDraws, total)}%)   타임아웃 ${pct(timeouts, total)}%`,
)

// 턴 분포
const hist: Record<number, number> = {}
for (const t of allTurns) hist[Math.min(t, 12)] = (hist[Math.min(t, 12)] ?? 0) + 1
const bar = (n: number) => '#'.repeat(Math.round((60 * n) / total))
console.log('\n턴 분포 (12+는 합산):')
for (let t = 1; t <= 12; t++)
  if (hist[t]) console.log(`  ${String(t).padStart(2)}턴 ${pct(hist[t], total)}%  ${bar(hist[t])}`)

// 캐릭터별 승률 (미러 제외 전 매치업 합산)
console.log('\n캐릭터 승률 (전 매치업 합산):')
const rows = IDS.map((id) => ({ id, wr: (100 * (wins[id] ?? 0)) / (games[id] ?? 1) })).sort(
  (x, y) => y.wr - x.wr,
)
for (const r of rows) console.log(`  ${r.id.toUpperCase().padEnd(7)} ${r.wr.toFixed(1).padStart(5)}%`)

// 매치업 표: 행 캐릭터가 열 캐릭터를 이길 확률(선공/후공 합산)
console.log('\n매치업 승률 (행이 열을 이길 %):')
console.log('        ' + IDS.map((id) => id.slice(0, 5).padStart(6)).join(''))
for (const a of IDS) {
  const line = IDS.map((b) => {
    if (a === b) return '     -'
    const fwd = cell[`${a}>${b}`]
    const rev = cell[`${b}>${a}`]
    const w = fwd.w + (rev.n - rev.w - rev.d) // a가 이긴 판 = a선공 승 + b선공 패
    return pct(w, fwd.n + rev.n)
  }).join('')
  console.log(`  ${a.slice(0, 5).padEnd(6)}${line}`)
}

// 매치업별 평균 턴 (가장 빨리/늦게 끝나는 조합 파악용)
const byTurns = Object.entries(cell)
  .map(([k, v]) => ({ k, t: v.turns / v.n }))
  .sort((x, y) => x.t - y.t)
console.log('\n가장 빨리 끝나는 매치업 5개 / 가장 오래가는 5개:')
for (const e of byTurns.slice(0, 5)) console.log(`  ${e.k.padEnd(14)} ${e.t.toFixed(2)}턴`)
console.log('  …')
for (const e of byTurns.slice(-5)) console.log(`  ${e.k.padEnd(14)} ${e.t.toFixed(2)}턴`)
console.log()
