// ---------------------------------------------------------------------------
// 로그라이크 **런** 밸런스 시뮬레이터. simulate.ts가 단판(1:1) 수치를 재는 도구라면
// 이쪽은 런 전체(사다리 12층 + 보상·이벤트·상점 + HP 이월)를 끝까지 돌려
// **난이도 곡선**을 잰다. 봇이 플레이어를 대신해 카드를 내고 보상을 고른다.
//
// 실행:
//   npm run sim:run                      기본 200런, 전 캐릭터, hard 봇
//   npm run sim:run 500 --char=warrior   캐릭터 고정(warrior/archer/mage)
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
import { EVENT_CARDS, RUN_CARDS } from '../src/game/runcards'
import { ROULETTE_VALUE, spinRoulette } from '../src/game/upgrades'
import { applySpecialWin, eventChoices, resolveEventChoice, startEvent, tradeList, type EventOutcome } from '../src/game/events'
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
  replaceCandidates,
  grantRelic,
  isLockedCard,
  upgradableDeckCards,
  upgradeCard,
  restAtFire,
  innRest,
  innLeave,
  innRestPrice,
  paySmith,
  smithPass,
  rollQuestionFate,
  ambushFight,
  goblinTier,
  goblinMonsterId,
  rollGoblinShop,
  buyGoblinItem,
  openTreasure,
  rollRewards,
  rollShop,
  skipReward,
  RUN_DIFFICULTIES,
  startRun,
  templateOptionIndex,
  type RunDifficulty,
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
/**
 * **런 난이도 4단계**(2026-08-11) — `--diff=novice|adept|expert|master`.
 * 봇이 나를 얼마나 읽는지만 달라진다(몬스터·판·층 스케일은 전부 같다). 기본은
 * `master`(= 지금 밸런스 기준선). ⚠ 단계를 바꾸면 **직업 밴드를 단계마다 따로
 * 재야 한다** — 하나로 맞춰 두면 나머지가 자동으로 맞는 게 아니다.
 */
const DIFF = flagStr('diff', 'master') as RunDifficulty
if (!RUN_DIFFICULTIES.some((d) => d.id === DIFF)) {
  console.error(`알 수 없는 --diff=${DIFF} (가능: ${RUN_DIFFICULTIES.map((d) => d.id).join('|')})`)
  process.exit(1)
}
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
  ...EVENT_CARDS, // 세계수의 가호 — 이게 없으면 강화 정책이 undefined를 집고 시뮬이 죽는다
]
const cardById = (id: string): CardDef | undefined => ALL_CARDS.find((c) => c.id === id)

/** 카드 한 장 자체의 대략적 가치(강화 여부와 무관한 소재값). */
function rawScore(c: CardDef): number {
  if (c.kind === 'attack')
    return (c.damage ?? 0) * (1 + 0.08 * (c.range?.length ?? 1)) - 0.4 * (c.energyCost ?? 0)
  if (c.kind === 'guard') return 0.5 * (c.block ?? 0) - 0.3 * (c.guardCost ?? 0)
  if (c.kind === 'heal') return 16
  if (c.kind === 'energy') return 10
  return 6 // move
}
/** 봇이 보상·상점에서 카드를 고를 때 쓰는 값. 가진 카드는 0(2026-11 — 중복 강화 폐지, 풀에서도 빠진다). */
function cardScore(id: string, deck: string[], _run?: RunState): number {
  const c = cardById(id)
  if (!c || deck.includes(id)) return 0
  return rawScore(c)
}
/**
 * 덱에서 가장 값이 낮은 카드(교체용). 이동 4방향은 남겨 둔다 — 여기 목록을 손으로
 * 적어 두고 있었는데 이제 **엔진이 실제로 잠그는** 카드다(`run.ts`의 덱 룰). 목록이
 * 한 곳에서 오므로 잠금 규칙을 바꾸면 시뮬 정책도 같이 따라간다.
 */
function worstCard(deck: string[]): string {
  const pool = deck.filter((id) => !isLockedCard(id))
  const target = pool.length ? pool : deck
  if (!target.length) return ''
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
  while (!battle.state.over && battle.state.round <= MAX_TURNS) {
    // 마법사는 **거리를 두고** 싸운다(2026-11-10 — 원거리 직업, 붙으면 진다). 봇도 그렇게 굴린다.
    const p0 = decideAI(battle.state, 0, pChar, SKILL, fp.deck, pChar.id === 'mage' ? { archetype: 'kiter', moodAgg: 0 } : undefined)
    const p1 = (await fp.getOpponentPlan(p0, battle)) ?? []
    battle.resolveRound(p0, p1)
  }
  // 무승부·타임아웃은 화면(BattleScreen)과 같게 플레이어 패배로 본다.
  return {
    won: battle.state.over && battle.state.winner === 0,
    hpLeft: battle.state.hp[0],
    turns: battle.state.round,
  }
}

// --- 보상 정책 --------------------------------------------------------------
function takeReward(run: RunState): RunState {
  const rewards: Reward[] = rollRewards(run)
  if (POLICY === 'random') {
    if (Math.random() < 0.2) return skipReward(run)
    const r = rewards[Math.floor(Math.random() * rewards.length)]
    return advanceFloor(applyReward(run, r))
  }
  const relic = rewards.find((r): r is Extract<Reward, { kind: 'relic' }> => r.kind === 'relic')
  if (relic) return advanceFloor(applyReward(run, relic))
  const best = rewards
    .filter((r): r is Extract<Reward, { kind: 'card' }> => r.kind === 'card')
    .sort((a, b) => cardScore(b.cardId, run.deck, run) - cardScore(a.cardId, run.deck, run))[0]
  return advanceFloor(best ? applyReward(run, best) : run)
}
function applyReward(run: RunState, r: Reward): RunState {
  if (r.kind === 'relic') {
    relicPick[r.relicId] = (relicPick[r.relicId] ?? 0) + 1
    return grantRelic(run, r.relicId)
  }
  const res = grantCard(run, r.cardId)
  if (!res.needsReplace) return res.run
  // 칸(공격 5 · 보조 5)이 꽉 찼다 → 같은 칸의 최약 카드보다 나을 때만 바꾼다(2026-11-10 칸별 상한).
  const worst = worstCard(replaceCandidates(run, r.cardId))
  if (!worst || rawScore(cardById(worst)!) >= rawScore(cardById(r.cardId)!)) return run
  return grantCard(run, r.cardId, worst).run
}

// --- 룰렛 강화 정책 --------------------------------------------------------
/** 강화할 카드 — 덱에서 가장 센 카드에 수치 룰렛을 돌린다(+피해는 센 카드에 붙일수록 값이 크다). */
function simUpgrade(run: RunState): RunState {
  const pool = upgradableDeckCards(run)
  if (!pool.length) return run
  const id = POLICY === 'random'
    ? pool[Math.floor(Math.random() * pool.length)]
    : pool.reduce((hi, x) => (rawScore(cardById(x)!) > rawScore(cardById(hi)!) ? x : hi), pool[0])
  return upgradeCard(run, id, { value: spinRoulette(ROULETTE_VALUE) })
}

// --- 이벤트 정책(2026-11 이벤트 8종) ---------------------------------------
/** greedy 봇의 선택 — 없으면 나간다. */
function eventPick(run: RunState, st: ReturnType<typeof startEvent>): string | null {
  const ok = eventChoices(run, st).filter((c) => !c.off)
  const has = (k: string) => ok.some((c) => c.key === k)
  if (POLICY === 'random') {
    const c = ok[Math.floor(Math.random() * ok.length)]
    return c && !c.leave ? c.key : null
  }
  const hp = run.hp / run.maxHp
  switch (st.id) {
    case 'forge': return has('swap') ? 'swap' : has('hammer') ? 'hammer' : has('iron') ? 'iron' : null
    case 'trade': return has('card-relic') ? 'card-relic' : null
    case 'spring': return 'rest'
    case 'apothecary': return null // 기대값 +3HP/50G — 사지 않는다
    case 'jar': return hp > 0.5 ? 'open' : null
    case 'gacha': return has('coin') && st.tries < 6 ? 'coin' : null
    case 'mole': return run.hp - (10 + 3 * st.tries) > run.maxHp * 0.5 ? 'dig' : null
    case 'surgery': return run.hp - 15 > run.maxHp * 0.4 ? 'hand' : 'heart'
    // 사슬 이벤트 — 체력이 넉넉할 때만 대가를 치른다.
    case 'spirit': return hp > 0.6 ? 'help' : null
    case 'egg': return st.step === 0 || run.hp - [0, 10, 15, 20][st.step] > run.maxHp * 0.4 ? 'egg-go' : null
    case 'worldtree': return st.step === 1 ? 'wt-take' : has('wt-water') ? 'wt-water' : 'wt-plant'
    case 'phoenix':
      if (st.step === 0) return run.relicIds.includes('fireegg') || run.hp - 20 > run.maxHp * 0.4 ? 'ph-enter' : null
      return has('ph-give') ? 'ph-give' : null
  }
}
function doEvent(run: RunState): RunState {
  let st = startEvent(undefined, Math.random, run)
  let cur = run
  for (let i = 0; i < 12; i++) {
    const key = eventPick(cur, st)
    if (!key) break
    const want = eventChoices(cur, st).find((c) => c.key === key)?.pick
    const pick = want === 'card' ? worstCard(tradeList(cur, 'card')) : want === 'relic' ? tradeList(cur, 'relic')[0] : undefined
    const o: EventOutcome | null = resolveEventChoice(cur, st, key, pick)
    if (!o) break
    cur = o.run
    st = o.st
    if (o.relicId) relicPick[o.relicId] = (relicPick[o.relicId] ?? 0) + 1
    if (o.upgrade) cur = simUpgrade(cur)
    if (o.fight) return { ...cur, special: o.fight, status: 'fighting' }
    if (o.done) break
  }
  return advanceFloor(cur)
}

/** 모닥불 — 체력이 60% 아래면 쉰다(random은 반반). */
function doRest(run: RunState): RunState {
  const rest = POLICY === 'random' ? Math.random() < 0.5 : run.hp / run.maxHp < 0.6
  return rest || !upgradableDeckCards(run).length ? restAtFire(run) : advanceFloor(simUpgrade(run))
}
/** 고블린 상점 — greedy는 유물·회복만 사고 덮치지 않는다(random은 30%로 덮친다). */
function doGoblin(run: RunState): RunState {
  const tier = goblinTier(run.goblinSpent ?? 0)
  const stock = rollGoblinShop(run, tier)
  if (POLICY === 'random' && Math.random() < 0.3)
    return { ...run, special: { kind: 'goblin', monsterId: goblinMonsterId(tier), goblinTier: tier, goblinStock: stock }, status: 'fighting' }
  let cur = run
  for (const it of stock) {
    const want = it.kind === 'relic' || (it.kind === 'heal' && cur.hp / cur.maxHp < 0.6)
    if (!want) continue
    const res = buyGoblinItem(cur, it)
    if (res.ok) cur = res.run
  }
  return advanceFloor(cur)
}
/** ? 칸 — 정체를 굴리고 그 칸처럼 처리한다. */
function doQuestion(run: RunState): RunState {
  const fate = rollQuestionFate()
  if (fate === 'combat') return { ...run, special: ambushFight(run), status: 'fighting' }
  if (fate === 'rest') return doRest(run)
  if (fate === 'goblin') return doGoblin(run)
  return doEvent(run)
}

// --- 여관 · 대장장이 정책(2026-11-09) -------------------------------------
/**
 * 여관 — 상점을 먼저 돌고(유물 → 좋은 카드), 그다음 쉴지 정한다. 상점을 보고 와도
 * 방문이 안 끝나므로 순서는 이게 맞다. greedy는 체력 80% 아래면 쉰다(쉴 돈은 남긴다).
 */
function doInn(run: RunState): RunState {
  let cur = run
  const items = rollShop(cur)
  const restPrice = innRestPrice(cur)
  const wantRest = () => POLICY === 'random' ? Math.random() < 0.5 : cur.hp / cur.maxHp < 0.8
  const buy = (item: ShopItem) => {
    let res = buyShopItem(cur, item)
    if (res.needsCardPick && item.kind === 'card') {
      const worst = worstCard(replaceCandidates(cur, item.cardId))
      if (!worst || rawScore(cardById(worst)!) >= rawScore(cardById(item.cardId)!)) return
      res = buyShopItem(cur, item, worst)
    }
    if (res.ok) {
      cur = res.run
      if (item.kind === 'relic') relicPick[item.relicId] = (relicPick[item.relicId] ?? 0) + 1
    }
  }
  if (POLICY === 'random') {
    for (const item of items) if (Math.random() < 0.4) buy(item)
  } else {
    const resting = wantRest()
    const keep = resting ? restPrice : 0 // 쉴 거면 그 값은 남기고 산다
    for (const item of items.filter((i) => i.kind === 'relic')) if (cur.gold - item.price >= keep) buy(item)
    for (const item of items.filter((i) => i.kind === 'card')) {
      if (item.kind !== 'card') continue
      if (cardScore(item.cardId, cur.deck, cur) > 12 && cur.gold - item.price >= keep) buy(item)
    }
    if (resting) return advanceFloor(innRest(cur) ?? innLeave(cur))
    return advanceFloor(innLeave(cur))
  }
  return advanceFloor((wantRest() && innRest(cur)) || innLeave(cur))
}
/** 대장간 — 돈이 있으면 강화, 아니면 쉬어 간다(10%). random은 반반. */
function doSmith(run: RunState): RunState {
  const paid = POLICY === 'random' && Math.random() < 0.5 ? null : paySmith(run)
  return advanceFloor(paid ? simUpgrade(paid) : smithPass(run))
}

/** `--path` 정책대로 이번 층의 갈래를 고른다(위 PATH 주석 참고). */
function pickBranch(run: RunState): number {
  const opts = currentOptions(run)
  if (opts.length <= 1) return 0
  // ⚠ 그래프 지도(2026-08-05)에선 "늘 0번"이 더 이상 옛 사다리가 아니다 — 선택지
  //   목록이 직전 칸에 따라 달라지기 때문이다. 옛 기준선은 **가운데 줄**이 잇는다.
  if (PATH === 'template') return templateOptionIndex(run)
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
  let run = startRun(charId, DIFF)
  for (const id of GIVEN_RELICS) run = grantRelic(run, id)
  const stat = (perChar[charId] ??= { runs: 0, clears: 0, floors: 0 })
  stat.runs++
  let guard = 0
  while (run.status !== 'won' && run.status !== 'lost' && guard++ < 400) {
    const floor = run.floor
    if (run.status === 'fighting') {
      const enemyId = run.special?.monsterId ?? currentNode(run).monsterId ?? '?'
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
        run = applySpecialWin(afterWin(run, res.hpLeft))
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
      run = doQuestion(run)
    } else if (run.status === 'inn') {
      arrive[floor]++
      cleared[floor]++
      run = doInn(run)
    } else if (run.status === 'smith') {
      arrive[floor]++
      cleared[floor]++
      run = doSmith(run)
    } else if (run.status === 'treasure') {
      arrive[floor]++
      cleared[floor]++
      const t = openTreasure(run)
      if (t.relicId) relicPick[t.relicId] = (relicPick[t.relicId] ?? 0) + 1
      run = advanceFloor(t.run)
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
    if (r) rarityGot[r.rarity] = (rarityGot[r.rarity] ?? 0) + 1
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
    `\n=== 캐릭터 밸런스 스윕 (캐릭터당 ${RUNS}런 · 난이도 ${DIFF} · 봇 ${SKILL} · 정책 ${POLICY} · seed ${SEED}) ===\n`,
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
