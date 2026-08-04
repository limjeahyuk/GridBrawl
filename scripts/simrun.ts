// ---------------------------------------------------------------------------
// 로그라이크 **런** 밸런스 시뮬레이터. simulate.ts가 단판(1:1) 수치를 재는 도구라면
// 이쪽은 런 전체(사다리 12층 + 보상·이벤트·상점 + HP 이월)를 끝까지 돌려
// **난이도 곡선**을 잰다. 봇이 플레이어를 대신해 카드를 내고 보상을 고른다.
//
// 실행:
//   npm run sim:run                      기본 200런, 전 캐릭터, hard 봇
//   npm run sim:run 500 --char=volt      캐릭터 고정
//   npm run sim:run 300 --skill=normal   봇 숙련도(플레이어 실력 모델)
//   npm run sim:run 300 --policy=random  보상/이벤트/상점을 아무렇게나 고르는 하한선
//   npm run sim:run 300 --seed=7         같은 시드 = 같은 사다리·보상 → 튜닝 전후 비교
//
// **시드 RNG**: Math.random을 mulberry32로 갈아끼워 런 생성(사다리·보상·이벤트)과
// AI의 확률 분기까지 재현 가능하게 만든다. 수치를 만지고 같은 시드로 다시 돌리면
// 차이가 곧 밸런스 변화다. (엔진 자체는 원래 랜덤이 없다.)
// ---------------------------------------------------------------------------
import { CardBattle } from '../src/battle/engine'
import { decideAI } from '../src/battle/ai'
import { COMMON_CARDS } from '../src/battle/cards'
import type { CardDef, Difficulty } from '../src/battle/types'
import { ROSTER, getChar } from '../src/data/roster'
import { getRelic, type Rarity } from '../src/game/relics'
import { runFightProps } from '../src/game/runbattle'
import { RUN_CARDS } from '../src/game/runcards'
import {
  LADDER_FLOORS,
  advanceFloor,
  afterLoss,
  afterWin,
  buyShopItem,
  chooseBranch,
  currentNode,
  currentOptions,
  grantCard,
  grantRelic,
  resolveEventEffect,
  rollEvent,
  rollRewards,
  rollShop,
  skipRewardForHeal,
  startRun,
  type EventEffect,
  type Reward,
  type RunState,
  type ShopItem,
} from '../src/game/run'

// --- CLI --------------------------------------------------------------------
const args = process.argv.slice(2)
const flagStr = (name: string, dflt: string): string => {
  const a = args.find((s) => s.startsWith(`--${name}=`))
  return a ? a.slice(name.length + 3) : dflt
}
const flagNum = (name: string, dflt: number): number => {
  const v = Number(flagStr(name, String(dflt)))
  return Number.isFinite(v) ? v : dflt
}
const RUNS = parseInt(args.find((a) => /^\d+$/.test(a)) ?? '200', 10)
/** 캐릭터 × 시작 직업 카드 전 조합을 돌려 밸런스 매트릭스만 출력한다. */
const SWEEP = args.includes('--sweep')
const SEED = flagNum('seed', 12345)
const SKILL = flagStr('skill', 'hard') as Difficulty
const POLICY = flagStr('policy', 'greedy') as 'greedy' | 'random'
const CHAR = flagStr('char', 'all')
/**
 * 분기 지도의 경로 선택 정책(2026-08-04). 지도가 갈래를 갖게 되면서 "어느 길로
 * 갔는가"가 클리어율을 직접 흔들기 때문에, 무엇을 재는지 명시해야 한다.
 *   template 늘 0번 = 분기 이전과 **완전히 같은 런**. 옛 기준선과 비교할 때 쓴다
 *   random   무작위. "평균적인 플레이어"의 기댓값
 *   greedy   엘리트를 우선 = 유물을 최대한 먹는 하이리스크 경로
 *   safe     엘리트를 회피 = 안전 경로. 이게 최적이 되면 분기 설계가 실패한 것이다
 */
const PATH = flagStr('path', 'random') as 'template' | 'random' | 'greedy' | 'safe'
/**
 * 특정 유물을 들고 시작한다(`--relics=coil,circuit,deathwish`). "이 조합이 얼마나
 * 말이 안 되나"를 재는 용도 — 실제 런에서 이걸 다 모으기가 어려운 것과는 별개로,
 * 조합 자체의 상한을 확인한다.
 */
const GIVEN_RELICS = flagStr('relics', '').split(',').filter(Boolean)
const MAX_TURNS = 40 // 전투 안전 상한(독안개가 있어 실제로는 거의 안 닿는다)

// --- 시드 RNG(재현용) -------------------------------------------------------
let rngState = SEED >>> 0
Math.random = function mulberry32(): number {
  rngState = (rngState + 0x6d2b79f5) >>> 0
  let t = rngState
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// --- 카드 조회·평가 ---------------------------------------------------------
// 런 전용 카드까지 포함해야 한다 — 빠뜨리면 봇이 그 카드들을 0점으로 보고 절대 안 줍는다.
const ALL_CARDS: CardDef[] = [
  ...COMMON_CARDS,
  ...ROSTER.flatMap((c) => c.basics),
  ...ROSTER.flatMap((c) => c.cards),
  ...RUN_CARDS,
]
const cardById = (id: string): CardDef | undefined => ALL_CARDS.find((c) => c.id === id)

/** 봇이 카드를 고를 때 쓰는 대략적 가치. 중복은 (한 턴에 한 번만 쓰므로) 깎는다. */
function cardScore(id: string, deck: string[]): number {
  const c = cardById(id)
  if (!c) return 0
  let s = 0
  if (c.kind === 'attack')
    s = (c.damage ?? 0) * (1 + 0.08 * (c.range?.length ?? 1)) - 0.4 * (c.energyCost ?? 0)
  else if (c.kind === 'guard') s = 0.5 * (c.block ?? 0) - 0.3 * (c.guardCost ?? 0)
  else if (c.kind === 'heal') s = 16
  else if (c.kind === 'energy') s = 10
  else s = 6 // move
  if (deck.includes(id)) s *= 0.35
  return s
}
/** 덱에서 가장 값이 낮은 카드(교체·제거용). 이동 4방향은 남겨 둔다. */
function worstCard(deck: string[]): string {
  const keep = new Set(['m-up', 'm-down', 'm-left', 'm-right'])
  const pool = deck.filter((id) => !keep.has(id))
  const target = pool.length ? pool : deck
  return target.reduce((lo, id) => (cardScore(id, []) < cardScore(lo, []) ? id : lo), target[0])
}

// --- 통계 누적 --------------------------------------------------------------
interface MonStat { n: number; wins: number; turns: number; dmgTaken: number; kills: number }
const mon: Record<string, MonStat> = {}
const monStat = (id: string): MonStat =>
  (mon[id] ??= { n: 0, wins: 0, turns: 0, dmgTaken: 0, kills: 0 })

const zeros = () => new Array<number>(LADDER_FLOORS + 2).fill(0)
const arrive = zeros() // 그 층에 도달한 런 수
const cleared = zeros() // 그 층을 통과한 런 수
const deaths = zeros() // 그 층에서 죽은 런 수
const hpSum = zeros() // 층 도달 시 체력비 합(전투 층만)
const hpN = zeros()
const perChar: Record<string, { runs: number; clears: number; floors: number }> = {}
const relicPick: Record<string, number> = {}
let clears = 0
let floorSum = 0
let turnsSum = 0
let fightsSum = 0
let goldEarned = 0
const bossReach = { n: 0, relics: 0, deck: 0, gold: 0, hp: 0 }
// 조합 도달 난이도 — 희귀도 분포 + "전설을 몇 개나 모으는가"
const rarityGot: Record<string, number> = {}
const legendPerRun: number[] = []
const legendPerClear: number[] = [] // 클리어한 런만 — "빌드가 완성됐나"의 실질 지표
const epicPlusPerClear: number[] = []

// --- 전투 1판 ---------------------------------------------------------------
interface FightResult { won: boolean; hpLeft: number; turns: number }
async function playFight(run: RunState): Promise<FightResult> {
  const fp = runFightProps(run)
  const battle = new CardBattle(fp.p0CharId, fp.p1CharId, fp.battleOpts)
  const pChar = fp.battleOpts.chars![0]
  while (!battle.state.over && battle.state.turn <= MAX_TURNS) {
    const p0 = decideAI(battle.state, 0, pChar, SKILL, fp.deck)
    const p1 = (await fp.getOpponentPlan(p0, battle)) ?? []
    battle.resolveTurn(p0, p1)
  }
  // 무승부·타임아웃은 화면(BattleScreen)과 같게 플레이어 패배로 본다.
  return {
    won: battle.state.over && battle.state.winner === 0,
    hpLeft: battle.state.hp[0],
    turns: battle.state.turn,
  }
}

// --- 보상 정책 --------------------------------------------------------------
function takeReward(run: RunState): RunState {
  const rewards: Reward[] = rollRewards(run)
  if (POLICY === 'random') {
    if (Math.random() < 0.2) return skipRewardForHeal(run)
    const r = rewards[Math.floor(Math.random() * rewards.length)]
    return advanceFloor(applyReward(run, r))
  }
  const relic = rewards.find((r): r is Extract<Reward, { kind: 'relic' }> => r.kind === 'relic')
  if (relic) return advanceFloor(applyReward(run, relic))
  // 유물이 없고 체력이 위험하면 보상을 포기하고 회복한다.
  if (run.hp / run.maxHp < 0.35) return skipRewardForHeal(run)
  const best = rewards
    .filter((r): r is Extract<Reward, { kind: 'card' }> => r.kind === 'card')
    .sort((a, b) => cardScore(b.cardId, run.deck) - cardScore(a.cardId, run.deck))[0]
  return advanceFloor(best ? applyReward(run, best) : run)
}
function applyReward(run: RunState, r: Reward): RunState {
  if (r.kind === 'relic') {
    relicPick[r.relicId] = (relicPick[r.relicId] ?? 0) + 1
    return grantRelic(run, r.relicId)
  }
  const res = grantCard(run, r.cardId)
  if (!res.needsReplace) return res.run
  return grantCard(run, r.cardId, worstCard(run.deck)).run // 덱 상한 → 최약 카드와 교체
}

// --- 이벤트 정책 ------------------------------------------------------------
/** 그 선택지를 고를 만한가(greedy). 위험-보상 거래를 체력·골드로 판단. */
function wantEffect(run: RunState, e: EventEffect): boolean {
  const hpPct = run.hp / run.maxHp
  switch (e.type) {
    case 'heal': return hpPct < 0.95
    case 'gainGold': return true
    case 'loseHpGainRelic': return run.hp - e.hp > run.maxHp * 0.4 // 유물은 세지만 죽으면 끝
    case 'removeCardGainRelic': return true
    case 'loseHpGainGold': return hpPct > 0.6
    case 'payGoldHeal': return run.gold >= e.gold && hpPct < 0.7
    case 'loseHp': return false
    default: return false
  }
}
function doEvent(run: RunState): RunState {
  const ev = rollEvent()
  const opt =
    POLICY === 'random'
      ? ev.options[Math.floor(Math.random() * ev.options.length)]
      : (ev.options.find((o) => wantEffect(run, o.effect)) ?? ev.options[ev.options.length - 1])
  let res = resolveEventEffect(run, opt.effect)
  if (res.needsCardPick) res = resolveEventEffect(run, opt.effect, worstCard(run.deck))
  if (res.gainedRelicId) relicPick[res.gainedRelicId] = (relicPick[res.gainedRelicId] ?? 0) + 1
  return advanceFloor(res.run)
}

// --- 상점 정책 --------------------------------------------------------------
function doShop(run: RunState): RunState {
  let cur = run
  const items = rollShop(cur)
  const buy = (item: ShopItem) => {
    let res = buyShopItem(cur, item)
    if (res.needsCardPick) res = buyShopItem(cur, item, worstCard(cur.deck))
    if (res.ok) {
      cur = res.run
      if (item.kind === 'relic') relicPick[item.relicId] = (relicPick[item.relicId] ?? 0) + 1
    }
  }
  if (POLICY === 'random') {
    for (const item of items) if (Math.random() < 0.4) buy(item)
    return advanceFloor(cur)
  }
  // greedy: 유물 → (체력이 만피가 아니면) 회복 → 남는 골드로 좋은 카드.
  // 회복 기준을 60%→80%로 둔 건 골드를 남겨 죽는 게 손해라서다(실제 플레이어도 쓴다).
  for (const item of items.filter((i) => i.kind === 'relic')) buy(item)
  for (const item of items.filter((i) => i.kind === 'heal'))
    if (cur.hp / cur.maxHp < 0.8) buy(item)
  for (const item of items.filter((i) => i.kind === 'card')) {
    if (item.kind !== 'card') continue
    if (cardScore(item.cardId, cur.deck) > 12) buy(item)
  }
  return advanceFloor(cur)
}

/** `--path` 정책대로 이번 층의 갈래를 고른다(위 PATH 주석 참고). */
function pickBranch(run: RunState): number {
  const opts = currentOptions(run)
  if (opts.length <= 1) return 0
  if (PATH === 'template') return 0
  if (PATH === 'random') return Math.floor(Math.random() * opts.length)
  const eliteAt = opts.findIndex((o) => o.type === 'elite')
  if (eliteAt < 0) return Math.floor(Math.random() * opts.length)
  if (PATH === 'greedy') return eliteAt
  // safe — 엘리트가 아닌 첫 칸
  const other = opts.findIndex((o) => o.type !== 'elite')
  return other < 0 ? 0 : other
}

// --- 런 1회 ----------------------------------------------------------------
async function playRun(charId: string): Promise<void> {
  let run = startRun(charId)
  for (const id of GIVEN_RELICS) run = grantRelic(run, id)
  const stat = (perChar[charId] ??= { runs: 0, clears: 0, floors: 0 })
  stat.runs++
  let guard = 0
  while (run.status !== 'won' && run.status !== 'lost' && guard++ < 400) {
    const floor = run.floor
    if (run.status === 'fighting') {
      const enemyId = currentNode(run).monsterId ?? '?'
      const before = run.hp
      arrive[floor]++
      hpSum[floor] += run.hp / run.maxHp
      hpN[floor]++
      // 보스 앞에 무엇을 들고 도착하는가(승패와 무관한 "준비 상태" 스냅샷)
      if (currentNode(run).type === 'boss') {
        bossReach.n++
        bossReach.relics += run.relicIds.length
        bossReach.deck += run.deck.length
        bossReach.gold += run.gold
        bossReach.hp += run.hp / run.maxHp
      }
      const res = await playFight(run)
      const ms = monStat(enemyId)
      ms.n++
      ms.turns += res.turns
      fightsSum++
      turnsSum += res.turns
      if (res.won) {
        ms.wins++
        ms.dmgTaken += before - res.hpLeft
        cleared[floor]++
        const before2 = run.gold
        run = afterWin(run, res.hpLeft)
        goldEarned += run.gold - before2
      } else {
        ms.dmgTaken += before
        ms.kills++
        deaths[floor]++
        run = afterLoss(run)
      }
      continue
    }
    if (run.status === 'choosing') {
      run = chooseBranch(run, pickBranch(run))
    } else if (run.status === 'reward') {
      run = takeReward(run)
    } else if (run.status === 'event') {
      arrive[floor]++
      cleared[floor]++
      run = doEvent(run)
    } else if (run.status === 'shop') {
      arrive[floor]++
      cleared[floor]++
      run = doShop(run)
    }
  }
  const legends = run.relicIds.filter((id) => getRelic(id)?.rarity === 'legend').length
  const epicPlus = run.relicIds.filter((id) => {
    const r = getRelic(id)?.rarity
    return r === 'epic' || r === 'legend'
  }).length
  legendPerRun.push(legends)
  if (run.status === 'won') {
    legendPerClear.push(legends)
    epicPlusPerClear.push(epicPlus)
  }
  for (const id of run.relicIds) {
    const r = getRelic(id)
    if (r && !r.signatureOf) rarityGot[r.rarity] = (rarityGot[r.rarity] ?? 0) + 1
  }
  const reached = run.status === 'won' ? LADDER_FLOORS : run.floor
  floorSum += reached
  stat.floors += reached
  if (run.status === 'won') {
    clears++
    stat.clears++
  }
}

// --- 캐릭터 밸런스 스윕(--sweep) --------------------------------------------
/**
 * 캐릭터 밸런스 전용 모드 — 캐릭터별로 같은 수의 런을 돌려 클리어율 밴드를 잰다.
 * 시작 덱이 전 캐릭터 동일(공용 기본 9장)해졌으므로, 차이는 **시그니처 유물 + 고유
 * 카드를 보상으로 얼마나 잘 살리는가**에서만 나온다. 밴드 폭이 곧 밸런스 지표다.
 */
async function runSweep() {
  console.log(
    `\n=== 캐릭터 밸런스 스윕 (캐릭터당 ${RUNS}런 · 봇 ${SKILL} · 정책 ${POLICY} · seed ${SEED}) ===\n`,
  )
  const rows: { ch: string; clear: number; floor: number }[] = []
  for (const ch of ROSTER) {
    const c0 = clears
    const f0 = floorSum
    for (let i = 0; i < RUNS; i++) await playRun(ch.id)
    rows.push({
      ch: ch.id,
      clear: (100 * (clears - c0)) / RUNS,
      floor: (floorSum - f0) / RUNS,
    })
  }
  for (const r of [...rows].sort((x, y) => y.clear - x.clear))
    console.log(
      `  ${r.ch.toUpperCase().padEnd(7)} ${r.clear.toFixed(1).padStart(5)}%   평균 ${r.floor.toFixed(2)}층`,
    )
  const cl = rows.map((r) => r.clear)
  const lo = Math.min(...cl)
  const hi = Math.max(...cl)
  console.log(`\n밴드 폭 ${(hi - lo).toFixed(1)}%p   (${lo.toFixed(1)} ~ ${hi.toFixed(1)})\n`)
}

// --- 실행 ------------------------------------------------------------------
async function main() {
  if (SWEEP) return runSweep()
  const ids = CHAR === 'all' ? ROSTER.map((c) => c.id) : [CHAR]
  for (let i = 0; i < RUNS; i++) await playRun(ids[i % ids.length])

  const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(1).padStart(5) : '    -')
  const bar = (n: number, d: number) => '#'.repeat(d ? Math.round((40 * n) / d) : 0)

  console.log(
    `\n=== GridBrawl 런 시뮬 (${RUNS}런 · ${CHAR === 'all' ? '전 캐릭터' : CHAR.toUpperCase()} · 봇 ${SKILL} · 정책 ${POLICY} · seed ${SEED}) ===\n`,
  )
  console.log(
    `클리어율 ${pct(clears, RUNS)}%   평균 도달 층 ${(floorSum / RUNS).toFixed(2)} / ${LADDER_FLOORS}   전투당 평균 ${(turnsSum / Math.max(1, fightsSum)).toFixed(2)}턴   런당 획득 골드 ${(goldEarned / RUNS).toFixed(0)}`,
  )

  console.log('\n층별 관문 (도달 / 통과율 / 그 층에서 사망한 런 · 전투 진입 시 평균 체력비):')
  for (let f = 1; f <= LADDER_FLOORS; f++) {
    if (!arrive[f]) continue
    const hp = hpN[f] ? `${pct(hpSum[f], hpN[f])}%` : '    -'
    console.log(
      `  ${String(f).padStart(2)}층  도달 ${String(arrive[f]).padStart(4)}  통과 ${pct(cleared[f], arrive[f])}%  사망 ${String(deaths[f]).padStart(4)}  진입HP ${hp}  ${bar(deaths[f], RUNS)}`,
    )
  }

  console.log('\n몬스터별 (조우 · 플레이어 승률 · 평균 턴 · 평균 잃은 체력 · 처치한 런):')
  const rows = Object.entries(mon)
    .map(([id, s]) => ({ id, ...s, wr: (100 * s.wins) / s.n }))
    .sort((a, b) => a.wr - b.wr)
  for (const r of rows)
    console.log(
      `  ${r.id.padEnd(10)} ${String(r.n).padStart(4)}회  승률 ${r.wr.toFixed(1).padStart(5)}%  ${(r.turns / r.n).toFixed(1).padStart(4)}턴  -${(r.dmgTaken / r.n).toFixed(0).padStart(3)}HP  킬 ${String(r.kills).padStart(4)}`,
    )

  if (CHAR === 'all') {
    console.log('\n캐릭터별 (클리어율 · 평균 도달 층):')
    for (const [id, s] of Object.entries(perChar).sort(
      (a, b) => b[1].clears / b[1].runs - a[1].clears / a[1].runs,
    ))
      console.log(
        `  ${id.toUpperCase().padEnd(7)} ${pct(s.clears, s.runs)}%   ${(s.floors / s.runs).toFixed(2)}층`,
      )
  }

  if (bossReach.n)
    console.log(
      `\n보스 도달 시점 평균(${bossReach.n}런): 유물 ${(bossReach.relics / bossReach.n).toFixed(1)}개 · 덱 ${(bossReach.deck / bossReach.n).toFixed(1)}장 · 잔여 골드 ${(bossReach.gold / bossReach.n).toFixed(0)} · 체력 ${pct(bossReach.hp, bossReach.n)}%`,
    )

  // 조합 도달 난이도 리포트 — "판을 부수는 빌드"가 얼마나 드문가
  const rar: Rarity[] = ['common', 'rare', 'epic', 'legend']
  const label: Record<Rarity, string> = { common: '일반', rare: '희귀', epic: '영웅', legend: '전설' }
  const totalGot = rar.reduce((s2, k) => s2 + (rarityGot[k] ?? 0), 0)
  console.log(
    `\n획득 유물 희귀도: ${rar.map((k) => `${label[k]} ${pct(rarityGot[k] ?? 0, totalGot)}%`).join(' · ')}   (런당 ${(totalGot / RUNS).toFixed(1)}개)`,
  )
  const legend2 = legendPerRun.filter((n) => n >= 2).length
  const legend3 = legendPerRun.filter((n) => n >= 3).length
  console.log(
    `전설 유물 보유: 1개 이상 ${pct(legendPerRun.filter((n) => n >= 1).length, RUNS)}% · 2개 이상 ${pct(legend2, RUNS)}% · 3개 이상 ${pct(legend3, RUNS)}%   ← 조합 도달 난이도`,
  )

  if (legendPerClear.length) {
    const n = legendPerClear.length
    console.log(
      `클리어한 런 기준: 전설 1개 이상 ${pct(legendPerClear.filter((x) => x >= 1).length, n)}% · 2개 이상 ${pct(legendPerClear.filter((x) => x >= 2).length, n)}%   |   영웅+전설 3개 이상 ${pct(epicPlusPerClear.filter((x) => x >= 3).length, n)}% (조합 빌드가 완성된 런)`,
    )
  }

  const picks = Object.entries(relicPick).sort((a, b) => b[1] - a[1])
  if (picks.length) {
    const top = picks.slice(0, 8).map(([id, n]) => `${getRelic(id)?.name ?? id}×${n}`)
    console.log(`\n많이 집힌 유물: ${top.join(' · ')}   (총 ${picks.reduce((s, [, n]) => s + n, 0)}개 획득 / ${picks.length}종)`)
  }
  console.log()
}

void main()
