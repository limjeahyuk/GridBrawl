// ---------------------------------------------------------------------------
// 유물·카드 훅 검증 — 엔진의 새 능력(누적 기력 트리거·기절·저체력 배율·관통·각성·
// 선제 보호막)이 정말 의도대로 발동하는지 단정한다. 엔진은 랜덤이 없으므로 기대값을
// 정확히 쓸 수 있다(전투 시뮬과 달리 통계가 아니라 **참/거짓** 검증).
//
// 실행: npm run check
// ---------------------------------------------------------------------------
import { CardBattle, planAffordable } from '../src/battle/engine'
import { decideAI } from '../src/battle/ai'
import { COMMON_CARDS, ENERGY_REGEN, deckFor } from '../src/battle/cards'
import { SHEETS, placeSprite } from '../src/art/sprites'
import { faceToward } from '../src/ui/screens/BattleScreen'
import { getChar, ROSTER, type CharacterDef, type Passive } from '../src/data/roster'
import { mergeRelics, mergeRunMods, RELICS, REWARD_RELICS } from '../src/game/relics'
import {
  LADDER_FLOORS,
  LOCKED_CARD_IDS,
  advanceFloor,
  chooseBranch,
  currentNode,
  currentOptionIndices,
  currentOptions,
  deckCap,
  grantCard,
  grantRelic,
  healHp,
  isLockedCard,
  removeCard,
  resolveEventEffect,
  rollRewards,
  rollShop,
  startRun,
  terrainFor,
  type NodeType,
  type RunState,
} from '../src/game/run'
import { RUN_CARDS, RUN_CARD_BY_ID } from '../src/game/runcards'
import { TERRAIN } from '../src/game/run'
import { BOSS_IDS, bossAction, bossCinematic, bossPlan, bossScene } from '../src/game/bosses'
import { BOSS_CARDS } from '../src/game/bosscards'
import { getMonster, MONSTERS } from '../src/game/monsters'
import {
  BURN_HIT_DAMAGE,
  FOG_DAMAGE,
  FREEZE_SHATTER_BONUS,
  GRID_COLS,
  GRID_ROWS,
  KNOCKBACK_BLOCK_DAMAGE,
  POISON_TICK_DAMAGE,
  ROCK_HP,
  STATUS_STACK_CAP,
  type CardDef,
} from '../src/battle/types'

let failed = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}
const card = (id: string): CardDef => {
  const c = COMMON_CARDS.find((x) => x.id === id) ?? RUN_CARD_BY_ID[id]
  if (!c) throw new Error(`no card ${id}`)
  return c
}
/** 서로 붙어 서서(같은 칸) 시작하는 테스트용 전투 — 사거리 변수를 없앤다. */
function battleWith(p0: Partial<Passive>, p1: Partial<Passive> = {}, chars?: [CharacterDef, CharacterDef]) {
  const b = new CardBattle('warrior', 'warrior', {
    chars: chars ?? [getChar('warrior'), getChar('warrior')],
    passives: [{ desc: '', ...p0 }, { desc: '', ...p1 }],
  })
  b.state.pos = [{ col: 2, row: 1 }, { col: 3, row: 1 }] // 서로 앞 한 칸
  return b
}
const IDLE: CardDef[] = [card('m-up'), card('m-down'), card('m-up')]
/** 제자리 대기 — 이동이 섞이면 공격보다 먼저 해소돼 사거리가 어긋난다(슬롯 내
 *  우선순위 이동<수비<공격). 명중을 전제하는 검증에는 이 플랜을 쓴다. */
const HOLD: CardDef[] = [card('c-energy'), card('c-energy'), card('c-energy')]

console.log('\n=== 유물·카드 훅 검증 ===\n')

// --- 누적 기력 트리거 -------------------------------------------------------
console.log('누적 기력 트리거(energyTriggers)')
{
  // 내려치기(기력 5) 3장 = 턴당 15 소모. per:30이면 2턴째에 한 번 발동해야 한다.
  const b = battleWith({ energyTriggers: [{ per: 30, heal: 999 }] })
  b.state.hp[0] = 100
  const atk3 = [card('c-strike'), card('c-strike'), card('c-strike')]
  b.resolveRound(atk3, IDLE) // 누적 10 (같은 공격은 한 턴에 한 번 → 나머지는 중복이라 그대로 소모)
  const after1 = b.state.energySpent[0]
  b.resolveRound(atk3, IDLE)
  check('per 30 · 누적 기력이 30을 넘기면 발동', b.state.energySpent[0] >= 30 && b.state.hp[0] > 100, true)
  check('1턴 만에는 발동 안 함(누적 < 30)', after1 < 30, true)
}
{
  // per:10 · 한 턴에 15를 쓰면 같은 슬롯 정산에서 **여러 번** 터져야 한다.
  const b = battleWith({ energyTriggers: [{ per: 10, shield: 5 }] })
  b.resolveRound([card('c-strike'), card('c-strike'), card('c-strike')], IDLE)
  check('per 10 · 한 턴 15 소모 → 1회 이상 발동(보호막)', b.state.energySpent[0] === 15, true)
}
{
  // 주기가 다른 두 트리거는 **각자** 터진다(합치지 않는다).
  const merged = mergeRelics(['capacitor', 'circuit'])
  check('유물 2개의 트리거는 배열로 누적', merged.energyTriggers?.length, 2)
  check('주기가 섞이지 않는다', merged.energyTriggers?.map((t) => t.per), [100, 50])
}

// --- 기절 (2026-08-07 새 규칙: **그 라운드 한정**) ---------------------------
// 사용자 확정: "1턴 공격에서 기절을 맞으면 이후 두 카드가 발동하지 못하고, 3번째
// 턴에서 기절에 걸리면 라운드가 끝나고 다음 3장은 정상 발동" → 기절은 **라운드를
// 넘어가지 않는다**. 그래서 마지막 슬롯에 기절기를 넣을 이유가 없다.
console.log('\n기절(stun) — 이 라운드 남은 슬롯만 지운다')
{
  // 1번 슬롯에서 기절시키면 상대의 2·3번 카드가 통째로 사라진다.
  const b = battleWith({})
  const hp0 = b.state.hp[0]
  const steps = b.resolveRound(
    [card('r-stunrod'), card('c-energy'), card('c-energy')],
    [card('c-energy'), card('c-strike'), card('c-strike')],
  )
  check('1번 슬롯 기절 → 상대의 2·3번 카드가 안 나간다', b.state.hp[0], hp0)
  check('기절 스텝이 로그에 남는다', steps.filter((s) => s.result === 'stun' && s.actor === 1).length, 2)
  check('기절은 라운드를 넘기지 않는다', b.statusOf(1, 'stunned'), undefined)
}
{
  // 다음 라운드는 멀쩡히 나간다 — 기절이 넘어오지 않는다는 뜻.
  const b = battleWith({})
  b.resolveRound([card('r-stunrod'), card('c-energy'), card('c-energy')], HOLD)
  const hp0 = b.state.hp[0]
  b.resolveRound(HOLD, [card('c-strike'), card('c-energy'), card('c-energy')])
  check('다음 라운드엔 상대 카드가 정상 발동', b.state.hp[0] < hp0, true)
}
{
  // 마지막 슬롯의 기절은 아무것도 막지 못한다(그래서 넣을 이유가 없다).
  const b = battleWith({})
  b.resolveRound([card('c-energy'), card('c-energy'), card('r-stunrod')], HOLD)
  check('3번 슬롯 기절 — 라운드가 끝나 아무 효과가 없다', b.statusOf(1, 'stunned'), undefined)
}
{
  const b = battleWith({ energyTriggers: [{ per: 5, stun: 1 }] })
  const steps = b.resolveRound(
    [card('c-strike'), card('c-energy'), card('c-energy')],
    [card('c-energy'), card('c-strike'), card('c-strike')],
  )
  check('유물 트리거 기절도 남은 슬롯을 지운다', steps.some((s) => s.result === 'stun' && s.actor === 1), true)
}
{
  // 가드로 완전히 막힌 타격은 기절시키지 못한다.
  const b = battleWith({})
  b.resolveRound(
    [card('r-stunrod'), card('c-energy'), card('c-energy')],
    [card('c-guard'), card('c-energy'), card('c-energy')],
  )
  check('가드에 막힌 타격은 기절 없음(피해 0)', [b.statusOf(1, 'stunned'), b.state.hp[1]], [undefined, b.maxHp[1]])
}
{
  // 유물 stunOnHit — stunCap 만큼만.
  const b = battleWith(mergeRelics(['concussor']))
  for (let t = 0; t < 4; t++) b.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('강타의 인장은 전투당 stunCap(2)회까지만', b.state.stunsUsed[0], 2)
}

// --- 저체력 배율 ------------------------------------------------------------
console.log('\n저체력 폭주(lowHpBonusPct)')
{
  const base = battleWith({})
  base.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  const normal = base.maxHp[1] - base.state.hp[1]

  const b = battleWith({ lowHpBonusPct: 100 })
  b.state.hp[0] = 10 // 절반 이하
  b.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  const boosted = b.maxHp[1] - b.state.hp[1]
  check('체력 절반 이하 + 100% → 피해 2배', boosted, normal * 2)

  const c = battleWith({ lowHpBonusPct: 100 })
  c.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('체력이 충분하면 배율 없음', c.maxHp[1] - c.state.hp[1], normal)

  check('두 유물의 배율은 합산(50+100=150)', mergeRelics(['lastditch', 'deathwish']).lowHpBonusPct, 150)
}

// --- 관통·각성·선제 보호막 ---------------------------------------------------
console.log('\n관통(alwaysPierce) · 각성(empower) · 선제 보호막(openingShield)')
{
  const b = battleWith(mergeRelics(['voidedge']))
  b.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], [card('c-guard'), card('c-energy'), card('c-energy')])
  check('공허의 날 — 가드를 무시하고 피해가 들어간다', b.state.hp[1] < b.maxHp[1], true)
}
{
  const b = battleWith({})
  b.resolveRound([card('r-protocol'), card('c-energy'), card('c-energy')], HOLD)
  check('피의 각인 1회 → 각성 +3', b.state.empowered[0], 3)
  b.resolveRound([card('r-protocol'), card('c-energy'), card('c-energy')], HOLD)
  check('각성은 중첩된다 → +6', b.state.empowered[0], 6)
}
{
  const b = battleWith({ openingShield: 40 })
  check('선제 방벽 — 1턴에만', b.state.round, 1)
  b.resolveRound(IDLE, IDLE)
  const b2 = battleWith({ openingShield: 40 })
  b2.resolveRound(IDLE, IDLE) // 2턴 시작 시 보호막에 40이 안 붙어야 한다
  b2.resolveRound(IDLE, IDLE)
  check('2턴부터는 선제 보호막 없음', b2.state.shield[0], 0)
}

// --- 전투 밖 효과(RunMods) ---------------------------------------------------
console.log('\n전투 밖 효과(RunMods)')
{
  check('상점 할인 합산', mergeRunMods(['coupon', 'blackcard']).shopDiscountPct, 60)
  check('할인 상한 80%', mergeRunMods(['coupon', 'coupon', 'blackcard', 'blackcard']).shopDiscountPct, 80)
  check('골드 보너스 합산', mergeRunMods(['purse', 'blackcard']).goldBonusPct, 55)
  check('보상 칸 합산', mergeRunMods(['compass', 'divining']).rewardOptions, 3)
}

// --- 런 진행 규칙(보상·상점·덱 상한) ----------------------------------------
console.log('\n런 진행 규칙')
{
  const run = startRun('archer')
  check('시작 덱은 기본 9장', run.deck.length, 9)
  // 시작 덱엔 **직업 기본기 3장은 들어가고, 강한 직업 고유 카드는 안 들어간다**
  // (2026-08-04). 기본기도 `arc-` 접두사를 쓰므로 id 접두사로 판정하면 안 된다 —
  // 반드시 `char.cards`/`char.basics` 목록으로 가른다.
  const uniqueIds = getChar('archer').cards.map((c) => c.id)
  const basicIds = getChar('archer').basics.map((c) => c.id)
  check('시작 덱에 직업 고유 카드 없음', run.deck.some((id) => uniqueIds.includes(id)), false)
  check('시작 덱에 직업 기본기 3장', basicIds.filter((id) => run.deck.includes(id)).length, 3)
  check('시그니처 유물만 들고 시작', run.relicIds, ['sig-archer'])

  // 직업 카드를 하나도 못 얻은 상태에선 보상 한 칸이 직업 카드로 보장된다.
  const classIds = getChar('archer').cards.map((c) => c.id)
  // ⚠ 이 검사는 난수를 고정하지 않는다(rollRewards가 Math.random을 쓴다). 표본이
  // 작으면 **드물게 깨지는 버그를 놓친다** — 실제로 50회로는 0.2%짜리 구멍을
  // 못 잡아 검사가 가끔 실패하는 것처럼만 보였다. 3000회면 놓칠 확률이 사실상 0.
  const TRIES = 3000
  let guaranteed = 0
  for (let i = 0; i < TRIES; i++) {
    const rewards = rollRewards(run)
    if (rewards.some((r) => r.kind === 'card' && classIds.includes(r.cardId))) guaranteed++
  }
  check('직업 카드 미보유 시 보상에 항상 직업 카드가 있다', guaranteed, TRIES)

  // 상점 할인 유물이 모든 가격에 반영된다.
  const plain = rollShop(run).find((i) => i.kind === 'card')!
  const discounted = rollShop(grantRelic(run, 'coupon')).find((i) => i.kind === 'card')!
  check('상인의 인증패(20%) → 카드 가격 35 → 28', [plain.price, discounted.price], [35, 28])

  check('확장 가방 → 덱 상한 +4', deckCap(grantRelic(run, 'satchel')), deckCap(run) + 4)
  const hurt = { ...run, hp: 10 }
  check(
    '치유 향유(+50%) → 회복량도 1.5배',
    healHp(grantRelic(hurt, 'balm'), 20).hp - 10,
    30,
  )

  // --- 덱 룰(2026-08-05) ---------------------------------------------------
  // ⚠ 이동 4방향이 빠지면 **그 방향으로 갈 칸이 영영 안 밝혀진다**(이동은 칸을 눌러서
  // 한다). 빼는 경로가 셋이라 한 곳만 새도 런이 조용히 망가지므로 전부 단정한다.
  check('잠긴 카드 = 이동 4방향', [...LOCKED_CARD_IDS].sort(), ['m-down', 'm-left', 'm-right', 'm-up'])
  check('이동 카드는 제거되지 않는다', removeCard(run, 'm-up').deck.length, run.deck.length)
  check('잠기지 않은 카드는 제거된다', removeCard(run, 'c-brace').deck.includes('c-brace'), false)
  // 나중에 주운 대시·대각 이동은 잠기지 않는다 — 꽉 찬 덱에서 바꿀 길을 막으면 안 된다.
  check('대시·대각 이동은 잠기지 않는다', ['m-right2', 'm-ur'].some(isLockedCard), false)
  // 꽉 찬 덱 + 잠긴 카드를 버리려 하면 "안 고른 것"과 같다(상한을 넘겨 담으면 안 된다).
  const full = { ...run, deck: [...run.deck, ...Array(deckCap(run) - run.deck.length).fill('c-strike')] }
  check('덱이 꽉 찼다', full.deck.length, deckCap(run))
  check('꽉 찬 덱 + 잠긴 카드 지정 → 교체 요구', grantCard(full, 'war-cleave', 'm-up').needsReplace, true)
  check('꽉 찬 덱 + 잠긴 카드 지정 → 상한을 넘기지 않는다', grantCard(full, 'war-cleave', 'm-up').run.deck.length, deckCap(run))
  check('꽉 찬 덱 + 일반 카드 지정 → 교체된다', grantCard(full, 'war-cleave', 'c-strike').run.deck.length, deckCap(run))
  // 유료 "카드 1장 제거"는 뺐다 — 덱=손패라 얇게 만들 이득이 0인 함정 칸이었다.
  check('상점에 카드 제거 서비스가 없다', rollShop(run).some((i) => i.kind !== 'card' && i.kind !== 'relic' && i.kind !== 'heal'), false)
  // 이벤트 "녹이기"로도 이동 카드는 못 뺀다(빼면 유물만 공짜로 얻는 셈이 된다).
  const melt = resolveEventEffect(run, { type: 'removeCardGainRelic' }, 'm-left')
  check('이벤트 녹이기 — 잠긴 카드를 고르면 다시 고르게 한다', [melt.needsCardPick, melt.gainedRelicId], [true, undefined])
}

// --- 상태이상 (2026-08-07 전면 재정의) ---------------------------------------
// 중독=움직이면 아프다 / 화상=맞으면 더 아프다 / 빙결=이 라운드 정지(맞으면 깨짐)
// / 속박=이 라운드 이동 불가. 셋(빙결·기절·속박)은 라운드를 넘지 않는다.
console.log('\n상태이상 — 중독(이동) · 화상(피격) · 빙결 · 속박 · 독안개')
{
  // 중독 — **움직인 칸마다** 3. 제자리에서 싸우면 아프지 않다.
  const poisonJab: CardDef = { ...card('c-strike'), id: 'test-poison', poison: 2 }
  const b = battleWith({}, {})
  b.resolveRound([poisonJab, card('c-energy'), card('c-energy')], HOLD)
  check('중독이 2라운드짜리 한 겹으로 걸린다', [b.stacksOf(1, 'poison'), b.statusOf(1, 'poison')?.rounds], [1, 1])
  check('중독 한 겹의 위력 = 이동 1칸당 3', b.statusPower(1, 'poison'), POISON_TICK_DAMAGE)
  const hp1 = b.state.hp[1]
  b.resolveRound(HOLD, HOLD) // 안 움직이면 아무 일도 없어야 한다
  check('중독 — 안 움직이면 갉지 않는다', b.state.hp[1], hp1)
}
{
  // 한 칸 이동 = 3, 대시(2칸) = 6, 대각선 한 장 = 3.
  const poisonJab: CardDef = { ...card('c-strike'), id: 'test-pmove', poison: 3 }
  const b = battleWith({}, {})
  b.resolveRound([poisonJab, card('c-energy'), card('c-energy')], HOLD)
  const hp0 = b.state.hp[1]
  b.resolveRound(HOLD, [card('m-left'), card('c-energy'), card('c-energy')])
  check('중독 — 한 칸 이동에 3', hp0 - b.state.hp[1], POISON_TICK_DAMAGE)
  const hp1 = b.state.hp[1]
  b.resolveRound(HOLD, [card('m-left2'), card('c-energy'), card('c-energy')])
  check('중독 — 두 칸 대시는 두 번 움직인 것(6)', hp1 - b.state.hp[1], POISON_TICK_DAMAGE * 2)
}
{
  // 대각선 한 장은 **한 번 움직인 것**(사용자 확정) — 두 축을 한 번에 좁혀도 3.
  const poisonJab: CardDef = { ...card('c-strike'), id: 'test-pdiag', poison: 3 }
  const b = battleWith({}, {})
  b.resolveRound([poisonJab, card('c-energy'), card('c-energy')], HOLD)
  const hp0 = b.state.hp[1]
  b.resolveRound(HOLD, [card('m-ur'), card('c-energy'), card('c-energy')])
  check('중독 — 대각선은 한 번 움직인 것(3)', hp0 - b.state.hp[1], POISON_TICK_DAMAGE)
}
{
  // 중첩 — 겹마다 따로 산다. 한 라운드에 세 대 맞으면 세 겹, 이동 1칸에 9.
  const jab = (n: number): CardDef => ({ ...card('c-strike'), id: `test-ps${n}`, poison: 3 })
  const b = battleWith({}, {})
  b.resolveRound([jab(1), jab(2), jab(3)], HOLD)
  check('중독 — 한 대에 한 겹씩 쌓인다', b.stacksOf(1, 'poison'), 3)
  const hp0 = b.state.hp[1]
  b.resolveRound(HOLD, [card('m-left'), card('c-energy'), card('c-energy')])
  check('중독 3겹 — 한 칸 이동에 9', hp0 - b.state.hp[1], POISON_TICK_DAMAGE * 3)
}
{
  // 중첩 상한 — 네 대를 맞아도 세 겹까지만.
  const jab = (n: number): CardDef => ({ ...card('c-strike'), id: `test-pc${n}`, poison: 3 })
  const b = battleWith({}, {})
  b.resolveRound([jab(1), jab(2), jab(3)], HOLD)
  b.resolveRound([jab(4), card('c-energy'), card('c-energy')], HOLD)
  check('중독 중첩 상한 3겹', b.stacksOf(1, 'poison'), STATUS_STACK_CAP)
}
{
  // 중독은 **보호막을 관통한다**(사용자 확정 예시2). 보호막은 라운드 시작에 다시
  // 서므로 상시 보호막 패시브로 세워 둔다(직접 대입하면 라운드 시작에 지워진다).
  const poisonJab: CardDef = { ...card('c-strike'), id: 'test-ppierce', poison: 3, pierce: true }
  const b = battleWith({}, { turnShield: 50 })
  b.resolveRound([poisonJab, card('c-energy'), card('c-energy')], HOLD)
  const hp0 = b.state.hp[1]
  b.resolveRound(HOLD, [card('m-left'), card('c-energy'), card('c-energy')])
  check('중독 — 보호막을 관통한다', hp0 - b.state.hp[1], POISON_TICK_DAMAGE)
  check('중독 — 보호막은 안 깎인다', b.state.shield[1], 50)
}
{
  // 화상 — **맞을 때마다** 5. 지속피해가 아니라 증폭기다.
  const burnJab: CardDef = { ...card('c-strike'), id: 'test-burn', burn: 3 }
  const plain = battleWith({}, {})
  const hpP = plain.state.hp[1]
  plain.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  const base = hpP - plain.state.hp[1]

  const b = battleWith({}, {})
  b.resolveRound([burnJab, card('c-energy'), card('c-energy')], HOLD)
  check('화상이 3라운드로 걸린다(1라운드 소모 후 2 남음)', b.statusOf(1, 'burn')?.rounds, 2)
  const hp0 = b.state.hp[1]
  b.resolveRound(HOLD, HOLD)
  check('화상 — 안 맞으면 아프지 않다', b.state.hp[1], hp0)
  b.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('화상 — 맞으면 피해 +5', hp0 - b.state.hp[1], base + BURN_HIT_DAMAGE)
}
{
  // 화상은 보호막을 관통한다 — 가드로 완전히 막아도 5는 들어온다.
  const burnJab: CardDef = { ...card('c-strike'), id: 'test-burn2', burn: 3 }
  const b = battleWith({}, {})
  b.resolveRound([burnJab, card('c-energy'), card('c-energy')], HOLD)
  const hp0 = b.state.hp[1]
  b.resolveRound(
    [card('c-strike'), card('c-energy'), card('c-energy')],
    [card('c-guard'), card('c-energy'), card('c-energy')],
  )
  check('화상 — 가드로 막아도 5는 들어온다', hp0 - b.state.hp[1], BURN_HIT_DAMAGE)
}
{
  // 가드에 완전히 막히면 상태이상은 안 묻는다(기절과 같은 규칙).
  const poisonJab: CardDef = { ...card('c-strike'), id: 'test-pblock', poison: 3 }
  const b = battleWith({}, {})
  b.resolveRound([poisonJab, card('c-energy'), card('c-energy')], [card('c-guard'), card('c-energy'), card('c-energy')])
  check('가드로 완전히 막히면 중독이 안 묻는다', b.statusOf(1, 'poison'), undefined)
}
{
  // 빙결 — 이 라운드 남은 카드를 통째로 막는다(기절과 같은 봉인).
  const freezeJab: CardDef = { ...card('c-strike'), id: 'test-freeze', freeze: 1 }
  const b = battleWith({}, {})
  const hp0 = b.state.hp[0]
  const steps = b.resolveRound(
    [freezeJab, card('c-energy'), card('c-energy')],
    [card('c-energy'), card('c-strike'), card('c-strike')],
  )
  check('빙결 — 남은 슬롯이 통째로 막힌다', b.state.hp[0], hp0)
  check('빙결 — 결과가 frozen으로 표시된다', steps.some((s) => s.result === 'frozen'), true)
  check('빙결 — 라운드를 넘기지 않는다', b.statusOf(1, 'frozen'), undefined)
}
{
  // 빙결은 **맞으면 깨진다** — 그 타격에 +5(보호막 관통).
  const freezeJab: CardDef = { ...card('c-strike'), id: 'test-freeze2', freeze: 1 }
  const plain = battleWith({}, {})
  const hpP = plain.state.hp[1]
  plain.resolveRound([card('c-strike'), card('c-strike'), card('c-energy')], HOLD)
  const twoHits = hpP - plain.state.hp[1]

  const b = battleWith({}, {})
  const hp0 = b.state.hp[1]
  b.resolveRound([freezeJab, card('c-strike'), card('c-energy')], HOLD)
  check('빙결 — 깨뜨린 타격은 5 더 아프다', hp0 - b.state.hp[1], twoHits + FREEZE_SHATTER_BONUS)
}
{
  // 속박 — 이동만 막고 공격·수비는 그대로 나간다.
  const bindJab: CardDef = { ...card('c-strike'), id: 'test-bind', bind: 1 }
  const b = battleWith({}, {})
  const before = { ...b.state.pos[1] }
  const hp0 = b.state.hp[0]
  const steps = b.resolveRound(
    [bindJab, card('c-energy'), card('c-energy')],
    [card('c-energy'), card('m-left'), card('c-strike')],
  )
  check('속박 — 이동이 무효(위치 그대로)', b.state.pos[1], before)
  check('속박 — 결과가 bind로 표시된다', steps.some((s) => s.result === 'bind'), true)
  check('속박 — 공격은 그대로 나간다', b.state.hp[0] < hp0, true)
  check('속박 — 라운드를 넘기지 않는다', b.statusOf(1, 'bind'), undefined)
}
{
  // 독안개 — 라운드 종료에 그 칸에 선 쪽을 10 갉는다(보호막 무시).
  const fogJab: CardDef = { ...card('c-strike'), id: 'test-fog', fog: 2 }
  const b = battleWith({}, {})
  const hp0 = b.state.hp[1]
  b.resolveRound([fogJab, card('c-energy'), card('c-energy')], HOLD)
  check('독안개가 상대 칸에 깔린다', !!b.fogAt(b.state.pos[1]), true)
  const dealt = hp0 - b.state.hp[1]
  check('독안개 — 깔린 라운드에 바로 밟는다', dealt > FOG_DAMAGE, true)
  b.state.shield[1] = 50
  const hp1 = b.state.hp[1]
  b.resolveRound(HOLD, HOLD)
  check('독안개 — 보호막을 무시한다', hp1 - b.state.hp[1], FOG_DAMAGE)
  const hp2 = b.state.hp[1]
  b.resolveRound(HOLD, HOLD)
  check('독안개 — 지속이 끝나면 걷힌다', hp2 - b.state.hp[1], 0)
}
{
  // 유물 훅: poisonOnHit는 이제 **지속 라운드**다(위력이 아니다).
  const b = battleWith({ poisonOnHit: 2 }, {})
  b.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('poisonOnHit — 평범한 카드에도 중독 한 겹이 묻는다', b.stacksOf(1, 'poison'), 1)
  check('poisonOnHit 2 → 2라운드(1라운드 소모 후 1 남음)', b.statusOf(1, 'poison')?.rounds, 1)
}
{
  // statusPowerPct는 이제 **한 겹의 위력**을 키운다(이동 1칸당 피해).
  const b = battleWith({ poisonOnHit: 2, statusPowerPct: 100 }, {})
  b.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('statusPowerPct 100% — 이동 1칸당 3 → 6', b.statusPower(1, 'poison'), POISON_TICK_DAMAGE * 2)
}
{
  // 카드와 유물이 둘 다 걸면 **지속이 긴 쪽** 한 겹(두 겹이 되면 안 된다).
  const poisonJab: CardDef = { ...card('c-strike'), id: 'test-pboth', poison: 1 }
  const b = battleWith({ poisonOnHit: 3 }, {})
  b.resolveRound([poisonJab, card('c-energy'), card('c-energy')], HOLD)
  check('카드+유물 — 한 대에 한 겹만', b.stacksOf(1, 'poison'), 1)
  check('카드+유물 — 지속은 긴 쪽', b.statusOf(1, 'poison')?.rounds, 2)
}
{
  // 이미 걸려 있는 상대에게만 보너스. 첫 타격은 아직 안 걸렸으므로 보너스 없음.
  const plain = battleWith({}, {})
  const hpPlain = plain.state.hp[1]
  plain.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  const baseDmg = hpPlain - plain.state.hp[1]

  const b = battleWith({ poisonOnHit: 2, bonusVsAfflicted: 7 }, {})
  const hp0 = b.state.hp[1]
  b.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('bonusVsAfflicted — 첫 타격엔 안 붙는다', hp0 - b.state.hp[1], baseDmg)
  const hp1 = b.state.hp[1]
  b.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('bonusVsAfflicted — 걸린 뒤엔 +7', hp1 - b.state.hp[1], baseDmg + 7)
}
{
  // 자기 버프(atkUp)는 `afflicted`가 아니다 — 시너지 유물이 켜지면 안 된다.
  const defBuff: CardDef = {
    id: 'test-afflict-buff', name: '테스트 방버프', kind: 'buff', desc: '',
    buff: 'defUp', buffPower: 5, buffRounds: 2, buffCost: 0,
  }
  const b = battleWith({}, {})
  b.resolveRound([defBuff, card('c-energy'), card('c-energy')], HOLD)
  check('버프가 걸려 있다', !!b.statusOf(0, 'defUp'), true)
  check('버프는 상태이상 시너지 대상이 아니다', b.afflicted(0), false)
}
{
  // 독안개로도 KO가 나야 한다(전장 붕괴와 같은 자리).
  const fogJab: CardDef = { ...card('c-strike'), id: 'test-fogko', fog: 2 }
  const b = battleWith({}, {})
  b.state.hp[1] = 12 // 타격 5을 견디고 7 남은 뒤 안개 10에 쓰러진다
  b.resolveRound([fogJab, card('c-energy'), card('c-energy')], HOLD)
  check('독안개로 KO — 전투가 끝난다', [b.state.over, b.state.winner], [true, 0])
}

// --- 넉백 × 중독 (2026-08-07 3차 · 사용자 예시 그대로) -------------------------
// "중독에 걸린 유저를 넉백 3으로 밀었는데 벽이 2칸 뒤 → 2칸 밀리고 1칸 막힘 →
//  5(넉백) + 6(중독 2칸) = 11 피해 + 기절"
console.log('\n넉백 × 중독 — 밀려난 칸도 독이 문다')
{
  const shove: CardDef = {
    id: 'test-poisonshove', name: '테스트 넉백3', kind: 'attack', desc: '',
    range: [{ df: 1, du: 0 }], damage: 0, energyCost: 0, push: 3, cooldown: 0,
  }
  const poisonJab: CardDef = { ...card('c-strike'), id: 'test-psh', poison: 3 }
  const b = battleWith({}, {})
  // 먼저 중독 한 겹을 묻힌다(붙어 선 상태에서).
  b.resolveRound([poisonJab, card('c-energy'), card('c-energy')], HOLD)
  check('중독 한 겹이 걸렸다', b.statusPower(1, 'poison'), POISON_TICK_DAMAGE)
  // p1을 벽에서 두 칸 떨어진 자리(col 3)에 세우고 p0가 바로 왼쪽(col 2)에서 민다.
  // 오른쪽 벽은 col 5 → 3 → 4 → 5까지 두 칸 가고 세 번째가 막힌다.
  b.state.pos = [{ col: 2, row: 1 }, { col: 3, row: 1 }]
  const hp = b.state.hp[1]
  const steps = b.resolveRound(
    [shove, card('c-energy'), card('c-energy')],
    [card('c-energy'), card('c-strike'), card('c-strike')],
  )
  check('두 칸 밀리고 벽에 부딪힌다', b.state.pos[1].col, GRID_COLS - 1)
  check(
    '넉백 5 + 중독 6 = 11',
    hp - b.state.hp[1],
    KNOCKBACK_BLOCK_DAMAGE + POISON_TICK_DAMAGE * 2,
  )
  check('그리고 기절한다', steps.filter((x) => x.result === 'stun' && x.actor === 1).length, 2)
}
{
  // 막히지 않고 끝까지 밀리면 넉백 피해는 없고 **중독만** 문다.
  const shove: CardDef = {
    id: 'test-poisonshove2', name: '테스트 넉백2', kind: 'attack', desc: '',
    range: [{ df: 1, du: 0 }], damage: 0, energyCost: 0, push: 2, cooldown: 0,
  }
  const poisonJab: CardDef = { ...card('c-strike'), id: 'test-psh2', poison: 3 }
  const b = battleWith({}, {})
  b.resolveRound([poisonJab, card('c-energy'), card('c-energy')], HOLD)
  b.state.pos = [{ col: 1, row: 1 }, { col: 2, row: 1 }]
  const hp = b.state.hp[1]
  b.resolveRound([shove, card('c-energy'), card('c-energy')], HOLD)
  check('끝까지 밀리면 중독만(3×2)', hp - b.state.hp[1], POISON_TICK_DAMAGE * 2)
}
{
  // 중독이 없으면 밀려나도 아무 일 없다(회귀).
  const shove: CardDef = {
    id: 'test-poisonshove3', name: '테스트 넉백2', kind: 'attack', desc: '',
    range: [{ df: 1, du: 0 }], damage: 0, energyCost: 0, push: 2, cooldown: 0,
  }
  const b = battleWith({}, {})
  b.state.pos = [{ col: 1, row: 1 }, { col: 2, row: 1 }]
  const hp = b.state.hp[1]
  b.resolveRound([shove, card('c-energy'), card('c-energy')], HOLD)
  check('중독이 없으면 넉백만으로는 안 아프다', hp - b.state.hp[1], 0)
}

// --- 지속 연장 유물 (2026-08-07 2차) — 런 전용 전설 ---------------------------
// 시간을 사는 훅이라 다른 모든 훅과 곱해진다. 검사의 핵심은 **무한 봉인이 안 된다**는
// 것과 **PvP에는 이 규칙이 존재조차 하지 않는다**는 것 둘이다.
console.log('\n지속 연장 유물 — 중독·화상·기절·빙결·속박')
{
  // 중독 연장 — 기본 3라운드 상한을 유물이 밀어 올린다.
  const jab: CardDef = { ...card('c-strike'), id: 'test-plong', poison: 3 }
  const plain = battleWith({}, {})
  plain.resolveRound([jab, card('c-energy'), card('c-energy')], HOLD)
  const b = battleWith({ poisonRoundBonus: 1 }, {})
  b.resolveRound([jab, card('c-energy'), card('c-energy')], HOLD)
  check('중독 연장 — 상한(3)을 넘겨 1라운드 더', [plain.statusOf(1, 'poison')?.rounds, b.statusOf(1, 'poison')?.rounds], [2, 3])
}
{
  // 화상 연장.
  const jab: CardDef = { ...card('c-strike'), id: 'test-blong', burn: 2 }
  const b = battleWith({ burnRoundBonus: 1 }, {})
  b.resolveRound([jab, card('c-energy'), card('c-energy')], HOLD)
  check('화상 연장 — 2 → 3라운드(1 소모 후 2)', b.statusOf(1, 'burn')?.rounds, 2)
}
{
  // 기절 연장 — 사용자가 못박은 시나리오를 그대로 재현한다.
  //   1라운드 기절 → 2라운드도 기절(그 라운드에 또 맞아도 갱신 안 됨) → 3라운드 기상.
  const b = battleWith({ stunRoundBonus: 1 })
  const hp0 = b.state.hp[0]
  b.resolveRound(
    [card('r-stunrod'), card('c-energy'), card('c-energy')],
    [card('c-energy'), card('c-strike'), card('c-strike')],
  )
  check('R1 — 기절해서 남은 슬롯이 죽는다', b.state.hp[0], hp0)
  check('R1 종료 — 기절이 다음 라운드까지 남는다', b.statusOf(1, 'stunned')?.rounds, 1)

  // R2: 통째로 봉인. 그 안에서 또 기절을 걸어도 **갱신되지 않는다**(재부여 가드).
  const st2 = b.resolveRound(
    [card('c-strike'), card('c-strike'), card('c-strike')],
    [card('c-strike'), card('c-strike'), card('c-strike')],
  )
  check('R2 — 세 슬롯이 통째로 봉인된다', st2.filter((x) => x.result === 'stun' && x.actor === 1).length, 3)
  check('R2 종료 — 기절이 갱신되지 않고 풀린다', b.statusOf(1, 'stunned'), undefined)

  // R3: 반드시 일어난다.
  const hp1 = b.state.hp[0]
  b.resolveRound(HOLD, [card('c-strike'), card('c-energy'), card('c-energy')])
  check('R3 — 깨어나서 정상 발동(유물 하나로 영구 봉인 불가)', b.state.hp[0] < hp1, true)
}
{
  // 처박기 기절은 연장을 타지 않는다 — 넉백 한 장이 판을 잠그면 안 된다.
  const shove: CardDef = {
    id: 'test-slamlong', name: '테스트 처박기', kind: 'attack', desc: '',
    range: [{ df: 1, du: 0 }], damage: 1, energyCost: 0, push: 2, cooldown: 0,
  }
  const b = battleWith({ stunRoundBonus: 1 })
  b.state.pos = [{ col: 4, row: 1 }, { col: 5, row: 1 }]
  b.resolveRound([shove, card('c-energy'), card('c-energy')], HOLD)
  check('처박기 기절은 연장을 안 탄다', b.statusOf(1, 'stunned'), undefined)
}
{
  // 빙결 연장 — 다음 라운드까지 가지만 **맞으면 여전히 깨진다**.
  const freezeJab: CardDef = { ...card('c-strike'), id: 'test-flong', freeze: 1 }
  const b = battleWith({ freezeRoundBonus: 1 }, {})
  b.resolveRound([freezeJab, card('c-energy'), card('c-energy')], HOLD)
  check('빙결 연장 — 다음 라운드까지 남는다', b.statusOf(1, 'frozen')?.rounds, 1)
  b.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('빙결 연장 — 그래도 맞으면 깨진다', b.statusOf(1, 'frozen'), undefined)
}
{
  // 속박 연장 — 다음 라운드에도 이동이 막힌다.
  const bindJab: CardDef = { ...card('c-strike'), id: 'test-bindlong', bind: 1 }
  const b = battleWith({ bindRoundBonus: 1 }, {})
  b.resolveRound([bindJab, card('c-energy'), card('c-energy')], HOLD)
  const before = { ...b.state.pos[1] }
  const st = b.resolveRound(HOLD, [card('m-left'), card('c-energy'), card('c-energy')])
  check('속박 연장 — 다음 라운드에도 이동 불가', b.state.pos[1], before)
  check('속박 연장 — 공격은 여전히 나간다', st.some((x) => x.result === 'bind'), true)
  check('속박 연장 — 두 라운드로 끝난다', b.statusOf(1, 'bind'), undefined)
}
{
  // ⚠ **런 전용 보장** — 이 훅들이 유물 밖으로 새면 PvP 락스텝이 깨진다.
  const BONUS_HOOKS = [
    'poisonRoundBonus', 'burnRoundBonus', 'stunRoundBonus', 'freezeRoundBonus', 'bindRoundBonus',
  ] as const
  const inRoster = ROSTER.some((c) => BONUS_HOOKS.some((h) => (c.passive as Record<string, unknown>)[h] != null))
  check('연장 훅은 ROSTER.passive에 없다(PvP 불변)', inRoster, false)
  const inMonsters = MONSTERS.some((m) =>
    BONUS_HOOKS.some((h) => (m.passive as Record<string, unknown> | undefined)?.[h] != null),
  )
  check('연장 훅은 몬스터에도 없다', inMonsters, false)
  // 전부 legend여야 한다 — "시간을 사는" 훅이라 흔하면 판이 무너진다.
  const carriers = RELICS.filter((r) =>
    BONUS_HOOKS.some((h) => (r.effect as Record<string, unknown>)[h] != null),
  )
  check('연장 유물이 존재한다', carriers.length >= 6, true)
  check('연장 유물은 전부 전설', carriers.every((r) => r.rarity === 'legend'), true)
  // 시그니처가 아니라 **보상 풀**에 들어 있어야 실제로 얻을 수 있다.
  check('연장 유물은 보상 풀에 있다', carriers.every((r) => REWARD_RELICS.includes(r)), true)
}

// --- 버프 카드 + 이동공격 (2026-08-01) ---------------------------------------
console.log('\n버프 카드(atkUp / defUp / freeCast) · 이동공격(dashForward)')
{
  // 버프는 수비 티어라 **같은 턴 뒤 슬롯의 공격**에 이미 얹힌다.
  const atkBuff: CardDef = {
    id: 'test-atkup', name: '테스트 공버프', kind: 'buff', desc: '',
    buff: 'atkUp', buffPower: 15, buffRounds: 2, buffCost: 0, cooldown: 0,
  }
  const plain = battleWith({}, {})
  const hp0 = plain.state.hp[1]
  plain.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  const base = hp0 - plain.state.hp[1]

  const b = battleWith({}, {})
  const h0 = b.state.hp[1]
  b.resolveRound([atkBuff, card('c-strike'), card('c-energy')], HOLD)
  check('atkUp — 같은 턴 뒤 슬롯 공격에 바로 얹힌다', h0 - b.state.hp[1], base + 15)
  const h1 = b.state.hp[1]
  b.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('atkUp — 다음 턴에도 남아 있다', h1 - b.state.hp[1], base + 15)
  const h2 = b.state.hp[1]
  b.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('atkUp — 2턴이 지나면 사라진다', h2 - b.state.hp[1], base)
}
{
  const defBuff: CardDef = {
    id: 'test-defup', name: '테스트 방버프', kind: 'buff', desc: '',
    buff: 'defUp', buffPower: 6, buffRounds: 3, buffCost: 0, cooldown: 0,
  }
  const plain = battleWith({}, {})
  const hp0 = plain.state.hp[0]
  plain.resolveRound(HOLD, [card('c-strike'), card('c-energy'), card('c-energy')])
  const base = hp0 - plain.state.hp[0]

  const b = battleWith({}, {})
  const h0 = b.state.hp[0]
  b.resolveRound([defBuff, card('c-energy'), card('c-energy')], [card('c-strike'), card('c-energy'), card('c-energy')])
  check('defUp — 받는 피해가 줄어든다', h0 - b.state.hp[0], Math.max(0, base - 6))
}
{
  // freeCast: 켜진 동안 기력을 한 톨도 안 쓴다.
  const free: CardDef = {
    id: 'test-free', name: '테스트 무아지경', kind: 'buff', desc: '',
    buff: 'freeCast', buffRounds: 2, buffCost: 0, cooldown: 0,
  }
  const b = battleWith({}, {})
  b.state.energy[0] = 30 // 내려치기(10) 3장도 빠듯한 양
  b.resolveRound([free, card('c-strike'), card('c-guard')], HOLD)
  check('freeCast — 켠 턴의 뒤 카드가 기력을 안 쓴다', b.state.energy[0], 30 + ENERGY_REGEN)
  // 엔진과 UI 판정이 같아야 한다(안 그러면 "낼 수 있다는데 불발")
  check(
    'freeCast — planAffordable도 공짜로 본다',
    planAffordable([card('c-guard'), card('c-guard'), card('c-guard')], 0, 100, 0, true),
    true,
  )
  check(
    'freeCast 없으면 같은 플랜은 불가',
    planAffordable([card('c-guard'), card('c-guard'), card('c-guard')], 0, 100, 0, false),
    false,
  )
}
{
  // dashForward: 사거리를 재기 **전에** 움직인다. 뒤로 물러나며 쏘는 궁수 카드.
  const kite: CardDef = {
    id: 'test-kite', name: '테스트 카이팅', kind: 'attack', desc: '',
    range: [{ df: 2, du: 0 }], damage: 10, energyCost: 0, dashForward: -1, cooldown: 0,
  }
  const b = battleWith({}, {})
  b.state.pos = [{ col: 2, row: 1 }, { col: 3, row: 1 }] // 바로 앞 — 사거리 2칸은 원래 빗나간다
  const hp0 = b.state.hp[1]
  b.resolveRound([kite, card('c-energy'), card('c-energy')], HOLD)
  check('dashForward — 물러난 뒤 쏘므로 2칸 사거리가 맞는다', hp0 - b.state.hp[1], 10)
  check('dashForward — 실제로 한 칸 물러나 있다', b.state.pos[0].col, 1)
}
{
  // 벽에 막히면 갈 수 있는 만큼만 — 좌표가 판 밖으로 나가면 안 된다.
  const back: CardDef = {
    id: 'test-back', name: '테스트 후퇴', kind: 'attack', desc: '',
    range: [{ df: 1, du: 0 }], damage: 10, energyCost: 0, dashForward: -3, cooldown: 0,
  }
  const b = battleWith({}, {})
  b.state.pos = [{ col: 1, row: 1 }, { col: 4, row: 1 }]
  b.resolveRound([back, card('c-energy'), card('c-energy')], HOLD)
  check('dashForward — 벽에서 멈춘다(판 밖으로 안 나감)', b.state.pos[0].col, 0)
}

// --- 파이터 방향 (2026-08-03) ------------------------------------------------
console.log('\n파이터 방향 — 자리가 아니라 상대 위치를 따라간다')
{
  // `faceToward`는 "내가 상대의 어느 쪽에 있나"를 낸다. 왼쪽에 있으면 'left'이고,
  // CSS가 그걸 --flip: 1(=오른쪽을 봄)로 옮긴다 — 이름과 보이는 방향이 반대라
  // 헷갈리기 쉬우니 여기서 못 박는다.
  check('내가 왼쪽이면 left(→ 오른쪽을 봄)', faceToward(0, 5, 'right'), 'left')
  check('상대를 지나치면 right로 뒤집힌다', faceToward(5, 3, 'left'), 'right')
  check('같은 칸이면 직전 방향을 유지(겹칠 때 홱홱 도는 것 방지)', faceToward(2, 2, 'right'), 'right')
  check('같은 칸 · 반대 fallback도 그대로', faceToward(2, 2, 'left'), 'left')
}
{
  // 뒤집히는 쪽은 기준점도 프레임 반대편으로 가야 한다. 안 하면 그쪽만 셀에서
  // 옆으로 밀려 선다(hero-knight 기준 96px).
  //
  // ⚠ **특정 시트의 방향을 여기 박지 말 것.** 전에 "전사는 왼쪽 시트"라고 박아
  //   뒀다가, 그 메타데이터 자체가 틀렸을 때 검사가 오히려 오답을 지켰다.
  //   규칙만 검사한다 — 시트 방향은 `SHEETS`가 정하고 여기선 양쪽을 다 본다.
  const faceR = { ...SHEETS.warrior, facesRight: true }
  const faceL = { ...SHEETS.warrior, facesRight: false }
  const W = SHEETS.warrior.frameW * SHEETS.warrior.scale
  const A = SHEETS.warrior.anchorX * SHEETS.warrior.scale

  // 오른쪽을 보고 그려진 시트: 왼쪽 자리는 그대로, 오른쪽 자리에서 뒤집힌다.
  check('오른쪽 시트 · 왼쪽 자리 → 안 뒤집힘', placeSprite(faceR, 'left').anchorPx, A)
  check('오른쪽 시트 · 오른쪽 자리 → 뒤집힘', placeSprite(faceR, 'right').anchorPx, W - A)
  // 왼쪽을 보고 그려진 시트는 정확히 반대다.
  check('왼쪽 시트 · 왼쪽 자리 → 뒤집힘', placeSprite(faceL, 'left').anchorPx, W - A)
  check('왼쪽 시트 · 오른쪽 자리 → 안 뒤집힘', placeSprite(faceL, 'right').anchorPx, A)

  // 지금 팩은 전부 오른쪽을 본다 — 하나라도 빠지면 그 캐릭터만 뒤집혀 선다.
  const wrong = Object.entries(SHEETS).filter(([, sh]) => sh.facesRight !== true)
  check('모든 시트에 facesRight가 명시돼 있다', wrong.map(([k]) => k), [])
}

// --- 엔진 방향도 위치 기준 (2026-08-05) --------------------------------------
// 스프라이트만 상대를 보고 돌아서고 **판정은 좌석에 못 박혀 있던** 것을 맞췄다.
// 그 어긋남이 "넉백을 하다보면 이상하게 흘러간다"의 정체였다.
console.log('\n엔진 방향 — 넉백·사거리가 상대를 지나쳐도 맞는 쪽을 본다')
{
  const b = new CardBattle('warrior', 'warrior')
  b.state.pos = [{ col: 1, row: 1 }, { col: 4, row: 1 }]
  check('상대가 오른쪽이면 +1', b.facing(0), 1)
  check('상대가 왼쪽이면 −1', b.facing(1), -1)
  // 지나친 뒤 — 좌석은 그대로인데 둘 다 뒤집혀야 한다.
  b.state.pos = [{ col: 4, row: 1 }, { col: 1, row: 1 }]
  check('지나치면 p0도 뒤집힌다', b.facing(0), -1)
  check('지나치면 p1도 뒤집힌다', b.facing(1), 1)
  // 같은 칸이면 겨룰 기준이 없다 — 좌석으로 떨어진다(랜덤 없음).
  b.state.pos = [{ col: 2, row: 1 }, { col: 2, row: 1 }]
  check('같은 칸이면 좌석 기준', [b.facing(0), b.facing(1)], [1, -1])
}
{
  // 넉백은 **언제나 나에게서 멀어지는 쪽**이다. 좌석 기준이던 시절엔 상대를
  // 지나친 순간 밀어내기가 상대를 자기 쪽으로 끌어당겼다.
  const shove: CardDef = {
    id: 'test-shove', name: '테스트 밀치기', kind: 'attack', desc: '',
    range: [{ df: 1, du: 0 }], damage: 1, energyCost: 0, push: 2, cooldown: 0,
  }
  const away = (p0col: number, p1col: number) => {
    const b = battleWith({}, {})
    b.state.pos = [{ col: p0col, row: 1 }, { col: p1col, row: 1 }]
    b.resolveRound([shove, card('c-energy'), card('c-energy')], HOLD)
    return b.state.pos[1].col
  }
  check('오른쪽 상대를 밀면 더 오른쪽으로', away(1, 2), 4)
  check('지나쳐서 왼쪽에 있는 상대는 더 왼쪽으로', away(4, 3), 1)
}
{
  // --- 넉백 3원칙 (2026-08-05 사용자 확정) ---------------------------------
  // 두 번 신고된 자리라 **사용자가 말한 그대로** 세 줄로 못 박아 둔다. 세 번째가
  // 특히 중요하다 — 겹친 칸엔 "멀어지는 쪽"이 없어서 규칙이 없으면 아무 값이나
  // 나오는데, 실제 런에서 **넉백의 82%가 이 경우다**(1500런 × 넉백 185회 실측).
  //   ① 내가 왼쪽 · 몬스터가 오른쪽 → 몬스터는 오른쪽으로
  //   ② 내가 오른쪽 · 몬스터가 왼쪽 → 몬스터는 왼쪽으로
  //   ③ 같은 타일        → 몬스터는 **오른쪽으로**
  // ⚠ ③은 `facingBetween`의 좌석 폴백(p0=+1)이 내는 값이다. "정의되지 않은 경우의
  //   임시 처리"처럼 보이지만 **의도된 규칙이니 지우지 말 것**.
  const bash: CardDef = {
    id: 'test-bash1', name: '테스트 넉백1', kind: 'attack', desc: '',
    range: [{ df: 1, du: 0 }], damage: 1, energyCost: 0, push: 1, cooldown: 0,
    pointBlank: true,
  }
  const shoved = (meCol: number, foeCol: number) => {
    const b = battleWith({}, {})
    b.state.pos = [{ col: meCol, row: 1 }, { col: foeCol, row: 1 }]
    b.resolveRound([bash, card('c-energy'), card('c-energy')], HOLD)
    return b.state.pos[1].col
  }
  check('① 몬스터가 내 오른쪽 → 오른쪽으로 한 칸', shoved(2, 3), 4)
  check('② 몬스터가 내 왼쪽 → 왼쪽으로 한 칸', shoved(3, 2), 1)
  check('③ 같은 타일 → 몬스터는 오른쪽으로', shoved(2, 2), 3)
}

// --- 넉백 재판정 (2026-08-05) ------------------------------------------------
// 신고: "넉백을 당하면 넉백당한 자리에서 공격해야 하는데 이전 자리에서 공격을 당한다."
// 같은 슬롯 트레이드는 둘 다 **밀리기 전 판**으로 계산해 두므로, 밀어내기가 같은
// 슬롯 안에서 아무 일도 하지 않았다. 이제 밀려난 쪽은 새 자리에서 다시 겨눈다.
console.log('\n넉백 재판정 — 밀려나면 그 슬롯 공격은 새 자리에서 다시 겨눈다')
{
  const shove: CardDef = {
    id: 'test-shove2', name: '테스트 밀치기', kind: 'attack', desc: '',
    range: [{ df: 1, du: 0 }], damage: 1, energyCost: 0, push: 2, cooldown: 0,
  }
  /** 사거리 1칸짜리 반격 — 두 칸 밀려나면 닿을 수 없다. */
  const jab: CardDef = {
    id: 'test-jab', name: '테스트 잽', kind: 'attack', desc: '',
    range: [{ df: 1, du: 0 }], damage: 30, energyCost: 0, cooldown: 0,
  }
  const b = battleWith({}, {})
  b.state.pos = [{ col: 1, row: 1 }, { col: 2, row: 1 }]
  const hp0 = b.state.hp[0]
  b.resolveRound([shove, card('c-energy'), card('c-energy')], [jab, card('c-energy'), card('c-energy')])
  check('밀어낸 쪽은 두 칸 밀어냈다', b.state.pos[1].col, 4)
  check('밀려난 쪽의 반격은 빗나간다', hp0 - b.state.hp[0], 0)
}
{
  // 밀어내도 **여전히 닿으면** 그대로 맞는다 — 넉백은 면죄부가 아니다.
  const nudge: CardDef = {
    id: 'test-nudge', name: '테스트 살짝밀기', kind: 'attack', desc: '',
    range: [{ df: 1, du: 0 }], damage: 1, energyCost: 0, push: 1, cooldown: 0,
  }
  const reach: CardDef = {
    id: 'test-reach', name: '테스트 장창', kind: 'attack', desc: '',
    range: [{ df: 1, du: 0 }, { df: 2, du: 0 }], damage: 30, energyCost: 0, cooldown: 0,
  }
  const b = battleWith({}, {})
  b.state.pos = [{ col: 1, row: 1 }, { col: 2, row: 1 }]
  const hp0 = b.state.hp[0]
  b.resolveRound([nudge, card('c-energy'), card('c-energy')], [reach, card('c-energy'), card('c-energy')])
  check('한 칸 밀려도 사거리 안이면 그대로 맞는다', hp0 - b.state.hp[0], 30)
}
{
  // 서로 밀어내면 **대칭이라 재판정하지 않는다** — 누구를 먼저 놓느냐로 결과가
  // 갈리면 호스트가 유리해진다(락스텝에서 절대 하면 안 되는 것).
  const shove: CardDef = {
    id: 'test-shove3', name: '테스트 맞밀치기', kind: 'attack', desc: '',
    range: [{ df: 1, du: 0 }], damage: 7, energyCost: 0, push: 2, cooldown: 0,
  }
  const b = battleWith({}, {})
  // ⚠ 양쪽 다 두 칸을 **온전히** 밀릴 수 있는 자리에 세운다 — 2026-08-07부터 벽에
  //   막혀 못 밀린 칸은 피해가 되므로, 구석에 세우면 이 검사가 넉백 피해까지 재게 된다.
  b.state.pos = [{ col: 2, row: 1 }, { col: 3, row: 1 }]
  const hp = [b.state.hp[0], b.state.hp[1]]
  b.resolveRound([shove, card('c-energy'), card('c-energy')], [shove, card('c-energy'), card('c-energy')])
  check('서로 밀면 둘 다 그대로 맞는다', [hp[0] - b.state.hp[0], hp[1] - b.state.hp[1]], [7, 7])
}

// --- 쓰러진 뒤엔 못 때린다(2026-08-04) ---------------------------------------
console.log('\n동시 트레이드 — 쓰러진 쪽은 그 턴에 못 때린다')
{
  const hew = getChar('warrior').basics.find((c) => c.id === 'war-hew')!
  /** 두 전사를 밀착시켜 같은 슬롯에 서로 공격을 물린다. */
  const trade = (hp0: number, hp1: number) => {
    const b = new CardBattle('warrior', 'warrior', { startHp: [hp0, hp1] })
    b.state.pos[0] = { col: 2, row: 1 }
    b.state.pos[1] = { col: 3, row: 1 }
    const steps = b.resolveRound([hew], [hew])
    return { b, steps, attacks: steps.filter((s) => s.phase === 'attack') }
  }

  // ① 신고된 버그 — 내가 죽이면 적의 공격은 아예 안 나간다.
  {
    const { b, attacks } = trade(103, 1)
    check('죽인 적의 공격은 해소되지 않는다', attacks.length, 1)
    check('죽인 적에게 피해를 안 입는다', b.state.hp[0], 103) // 풀피(103) 유지 — 재생은 상한에서 막힘
    check('적은 쓰러졌고 내가 이긴다', [b.state.hp[1], b.state.over, b.state.winner], [0, true, 0])
  }
  // ② 아무도 안 죽으면 예전 그대로 — 양쪽 다 맞는 트레이드.
  {
    const { b, attacks } = trade(200, 200)
    check('둘 다 살면 트레이드는 그대로', attacks.length, 2)
    check('양쪽 다 피해를 입는다', [b.state.hp[0] < 204, b.state.hp[1] < 204], [true, true])
  }
  // ③ 서로를 쓰러뜨리면 **진짜 동시 KO** — 무승부 판정이 살아 있어야 한다.
  //    체력 비율이 정확히 같으므로(같은 캐릭터·같은 체력) 승자 없음.
  {
    const { b, attacks } = trade(1, 1)
    check('상호 치명타는 둘 다 해소된다', attacks.length, 2)
    check('둘 다 쓰러진다', [b.state.hp[0], b.state.hp[1]], [0, 0])
    check('체력비가 같으면 무승부(랜덤 없음)', b.state.winner, null)
  }
  // ④ 상호 치명타지만 체력비가 다르면 높던 쪽이 이긴다(기존 타이브레이크 유지).
  {
    const { b } = trade(20, 1)
    check('상호 치명타 — 체력비 높던 쪽 승리', [b.state.over, b.state.winner], [true, 0])
  }
}

// --- 확장 훅(2026-08-05) -----------------------------------------------------
console.log('\n확장 훅 — 빙결 부여 · 방벽/치유 증폭 · 시작 기력 · 처형 · 붕괴 저항')
{
  // freezeOnHit — 피해가 들어가야 걸리고, freezeCap 만큼만 걸린다.
  const b = battleWith({ freezeOnHit: 1, freezeCap: 2 })
  const steps = b.resolveRound(
    [card('c-strike'), card('c-energy'), card('c-energy')],
    [card('c-energy'), card('c-strike'), card('c-strike')],
  )
  check('freezeOnHit — 적중하면 남은 슬롯이 얼어붙는다', steps.filter((x) => x.result === 'frozen').length, 2)
  for (let t = 0; t < 4; t++)
    b.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('freezeOnHit — 전투당 freezeCap(2)회까지만', b.state.freezesUsed[0], 2)
}
{
  // guardPowerPct — 수비 카드만 커진다(매 턴 보호막 turnShield는 그대로).
  const plain = battleWith({})
  plain.resolveRound([card('c-guard'), card('c-energy'), card('c-energy')], IDLE)
  const boosted = battleWith({ guardPowerPct: 50 })
  boosted.resolveRound([card('c-guard'), card('c-energy'), card('c-energy')], IDLE)
  check('guardPowerPct 50% — 가드 25 → 38', boosted.state.shield[0] - plain.state.shield[0], 13)
  const std = battleWith({ turnShield: 20 })
  const std2 = battleWith({ turnShield: 20, guardPowerPct: 100 })
  check('guardPowerPct는 매 턴 보호막엔 안 붙는다', std2.state.shield[0], std.state.shield[0])
}
{
  // healPowerPct — 힐 카드와 regen 둘 다 키운다.
  const b = battleWith({ healPowerPct: 100 })
  b.state.hp[0] = 50
  b.resolveRound([card('c-repair'), card('c-energy'), card('c-energy')], IDLE)
  check('healPowerPct 100% — 상처 봉합 10 → 20', b.state.hp[0], 70)
  const r = battleWith({ regen: 10, healPowerPct: 50 })
  r.state.hp[0] = 50
  r.resolveRound(IDLE, IDLE)
  check('healPowerPct — regen 10 → 15', r.state.hp[0], 65)
}
{
  const b = battleWith({ startEnergyBonus: 25 })
  const base = battleWith({})
  check('startEnergyBonus — 시작 기력 +25', b.state.energy[0] - base.state.energy[0], 25)
  const capped = battleWith({ startEnergyBonus: 9999 })
  check('시작 기력은 최대 기력으로 클램프', capped.state.energy[0], capped.chars[0].maxEnergy)
}
{
  // executeBonusPct — **상대가** 반피 이하일 때만. lowHpBonusPct와는 합산.
  const base = battleWith({})
  base.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  const normal = base.maxHp[1] - base.state.hp[1]

  const full = battleWith({ executeBonusPct: 100 })
  full.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('상대가 만피면 처형 배율 없음', full.maxHp[1] - full.state.hp[1], normal)

  const low = battleWith({ executeBonusPct: 100 })
  low.state.hp[1] = 40 // 103의 절반 이하 — 대신 한 방에 안 죽을 만큼은 남긴다
  const before = low.state.hp[1]
  low.resolveRound([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('상대가 반피 이하 + 100% → 피해 2배', before - low.state.hp[1], normal * 2)
}
{
  // 카드 `shatter` — 적중하면 상대 보호막이 통째로 날아간다.
  const b = battleWith({})
  b.state.energy = [100, 100]
  b.resolveRound(
    [card('c-energy'), card('r-havoc'), card('c-energy')],
    [card('c-guard'), card('c-energy'), card('c-energy')],
  )
  check('shatter — 가드를 부수고 피해가 들어간다', b.state.hp[1] < b.maxHp[1], true)
}
{
  // 전장 붕괴 — 무너진 칸에 서 있으면 턴 종료에 피해. `collapseResist`가 깎는다.
  const at = (turn: number, pas: Partial<Passive>) => {
    const b = battleWith(pas)
    b.state.round = turn
    b.state.pos = [{ col: 0, row: 1 }, { col: 3, row: 1 }] // 왼쪽 끝 = 가장 먼저 무너지는 열
    const hp = b.state.hp[0]
    b.resolveRound(HOLD, HOLD)
    return hp - b.state.hp[0] // battleWith는 패시브를 통째로 갈아끼우므로 regen이 없다
  }
  check('붕괴 1단계 — 턴당 5', at(6, {}), 5)
  check('붕괴 2단계 — 턴당 8', at(9, {}), 8)
  check('붕괴 3단계 — 턴당 12', at(12, {}), 12)
  check('collapseResist가 붕괴 피해를 깎는다', at(6, { collapseResist: 3 }), 2)
  check('collapseResist가 크면 아예 안 아프다', at(6, { collapseResist: 99 }), 0)
}
{
  // ⚠ **무너진 칸으로 들어갈 수 있어야 한다**(사용자 신고 — 소프트 위험지대).
  const b = battleWith({})
  b.state.round = 6
  b.state.pos = [{ col: 1, row: 1 }, { col: 4, row: 1 }]
  b.resolveRound([card('m-left'), card('c-energy'), card('c-energy')], HOLD)
  check('무너진 칸으로 이동이 막히지 않는다', b.state.pos[0].col, 0)
}
{
  // 전면 붕괴 뒤에는 AI가 도망치지 않고 계속 싸운다 — 예전엔 슬롯을 전부 이동에 썼다.
  const b = battleWith({})
  b.state.round = 12 // 판 전체가 무너진 단계
  b.state.pos = [{ col: 2, row: 1 }, { col: 3, row: 1 }]
  const plan = decideAI(b.state, 1, getChar('warrior'), 'hard', COMMON_CARDS.concat(getChar('warrior').basics))
  check('전면 붕괴 뒤 AI는 이동만 하지 않는다', plan.every((c) => c.kind === 'move'), false)
}

// --- 분기 지도 그래프(2026-08-05) --------------------------------------------
console.log('\n분기 지도 — 간선으로 이어진 사다리')
{
  // 무작위 생성이라 한 번으로는 못 잡는다. 여러 런을 훑어 불변식을 확인한다.
  const RUNS = 300
  let bossBranched = 0
  let supportToCombat = 0
  let eliteShapeBad = 0
  let noCenter = 0
  let orphan = 0 // 들어오는 간선이 없는 칸
  let deadend = 0 // 나가는 간선이 없는 칸(마지막 층 제외)
  let farEdge = 0 // 줄을 두 칸 이상 건너뛰는 간선
  let centerUnreachable = 0
  const centerTypes = new Set<string>()
  const widths = new Set<number>()

  for (let i = 0; i < RUNS; i++) {
    const run = startRun('warrior')
    const center = (f: number) => run.map[f].find((n) => n.lane === 1)
    centerTypes.add(run.map.map((nodes, f) => center(f)?.type ?? '?').join(','))
    run.map.forEach((nodes, f) => {
      widths.add(nodes.length)
      const isBoss = nodes[0].type === 'boss'
      if (isBoss && nodes.length !== 1) bossBranched++
      // 가운데 줄은 **모든 층**에 있어야 한다 — 옛 사다리 경로가 거기로 이어진다.
      if (!center(f)) noCenter++
      // ⚠ 핵심 회귀 검사. 지원 칸(이벤트·상점)의 대안을 전투로 뒀다가 클리어율이
      //   27%→10%로 무너졌다(상점이 회복의 주 수단이라서). 지원 칸끼리만 바꾼다.
      const head = center(f)?.type
      if (head === 'event' || head === 'shop') {
        if (nodes.some((o) => o.type !== 'event' && o.type !== 'shop')) supportToCombat++
      }
      // 엘리트는 유일하게 "전투량"을 고르는 칸 — 엘리트 하나 + 나머지는 일반 전투.
      if (head === 'elite') {
        const elites = nodes.filter((o) => o.type === 'elite').length
        const rest = nodes.filter((o) => o.type !== 'elite')
        if (elites !== 1 || rest.some((o) => o.type !== 'combat')) eliteShapeBad++
      }
      const last = f === run.map.length - 1
      nodes.forEach((n) => {
        if (!last && !n.next.length) deadend++
        // 어느 칸에서든 **다음 층 가운데 칸**으로는 갈 수 있어야 한다(옛 사다리 경로).
        if (!last) {
          const centerIdx = run.map[f + 1].findIndex((m) => m.lane === 1)
          if (centerIdx < 0 || !n.next.includes(centerIdx)) centerUnreachable++
          for (const j of n.next) {
            if (Math.abs(run.map[f + 1][j].lane - n.lane) > 1) farEdge++
          }
        }
      })
      if (f > 0 && !run.map[f - 1].some((a) => a.next.includes(nodes.indexOf(nodes[0]))))
        void 0 // (아래에서 칸별로 본다)
      if (f > 0)
        nodes.forEach((_, j) => {
          if (!run.map[f - 1].some((a) => a.next.includes(j))) orphan++
        })
    })
  }
  check('보스 층은 갈래가 없다', bossBranched, 0)
  check('모든 층에 가운데 줄이 있다', noCenter, 0)
  check('지원 칸(이벤트·상점)은 전투로 바뀌지 않는다', supportToCombat, 0)
  check('엘리트 층은 엘리트 1 + 나머지 일반전투', eliteShapeBad, 0)
  check('막다른 칸이 없다(마지막 층 제외)', deadend, 0)
  check('들어오는 길이 없는 칸이 없다', orphan, 0)
  check('간선은 줄을 한 칸까지만 건넌다', farEdge, 0)
  // 이게 밸런스 기준선(`sim:run --path=template`)이 성립하는 근거다.
  check('어느 칸에서든 다음 층 가운데로 갈 수 있다', centerUnreachable, 0)
  check('가운데 줄의 타입 열은 항상 같다(옛 사다리)', centerTypes.size, 1)
  // 폭이 늘 같으면 "사다리"가 아니라 격자다 — 1~3이 섞여야 길이 모였다 갈라진다.
  check('층 폭이 1~3으로 섞인다', [...widths].sort().join(','), '1,2,3')
}
{
  const run = startRun('mage')
  check('시작하면 아직 안 골랐다', run.status, 'choosing')
  check('1층부터 갈래가 있다', currentOptions(run).length >= 2, true)

  // 고르면 그 칸의 종류에 맞는 status로 간다.
  const opts = currentOptions(run)
  const combatAt = opts.findIndex((o) => o.type === 'combat' || o.type === 'elite')
  const picked = chooseBranch(run, combatAt < 0 ? 0 : combatAt)
  check('고르면 choosing이 풀린다', picked.status !== 'choosing', true)
  check('고른 칸이 현재 칸이 된다', currentNode(picked), opts[combatAt < 0 ? 0 : combatAt])

  // 2층의 선택지는 **1층에서 고른 칸에서 이어진 칸**뿐이다.
  {
    const f2 = advanceFloor(picked)
    const from = picked.map[0][picked.picked[0]]
    check('다음 층 선택지 = 직전 칸의 next', currentOptionIndices(f2), from.next)
    check('선택지는 1~3개', currentOptions(f2).length >= 1 && currentOptions(f2).length <= 3, true)
  }

  // 범위 밖 인덱스는 잘라 낸다(네트워크·저장본이 이상해도 런이 안 깨지게).
  check('인덱스는 클램프된다', currentNode(chooseBranch(run, 99)), opts[opts.length - 1])

  // 다음 층으로 가면 **다시 고르는 상태**여야 한다 — 자동으로 칸이 정해지면 안 된다.
  const next = advanceFloor(picked)
  check('다음 층은 다시 choosing', next.status, 'choosing')
  check('층이 하나 올랐다', next.floor, picked.floor + 1)

  // 마지막 층을 넘기면 승리.
  const last = { ...run, floor: LADDER_FLOORS }
  check('마지막 층 다음은 승리', advanceFloor(last).status, 'won')
}

// --- 기존 규칙이 안 깨졌는지(회귀) -------------------------------------------
console.log('\n회귀 — 옵션을 안 주면 예전과 같아야 한다')
{
  const b = new CardBattle('archer', 'warrior')
  check('풀피로 시작(startHp 미지정)', [b.state.hp[0], b.state.hp[1]], [b.maxHp[0], b.maxHp[1]])
  check('패시브는 각자 자기 캐릭터 것', [b.passive[0].attackBonus, b.passive[1].damageReduction], [
    getChar('archer').passive.attackBonus,
    getChar('warrior').passive.damageReduction,
  ])
  check('누적 기력·상태이상은 비어 있다', [b.state.energySpent, b.state.status], [[0, 0], [[], []]])
}
{
  const b = new CardBattle('warrior', 'warrior', { startHp: [77, undefined] })
  check('startHp — 지정한 쪽만 이월', [b.state.hp[0], b.state.hp[1]], [77, b.maxHp[1]])
  const c = new CardBattle('warrior', 'warrior', { startHp: [99999, -5] })
  check('startHp는 1..maxHp로 클램프', [c.state.hp[0], c.state.hp[1]], [c.maxHp[0], 1])
}

// --- 보스 전용 패턴·연출 -----------------------------------------------------
// 보스는 스크립트가 카드 id를 **문자열로** 들고 있어서, 카드 이름을 바꾸거나 지우면
// 타입 검사에 안 걸리고 조용히 그 슬롯이 비어 버린다(플랜 3장 → 2장). 여기서 잡는다.
console.log('\n보스 전용 패턴 (bosses.ts + bosscards.ts)')
{
  const ctxs = [
    { turn: 1, hpFrac: 1 }, { turn: 2, hpFrac: 1 }, { turn: 3, hpFrac: 1 }, { turn: 4, hpFrac: 1 },
    { turn: 1, hpFrac: 0.2 }, { turn: 2, hpFrac: 0.2 },
  ]
  let missing = 0
  let dupAttack = 0
  let shortPlan = 0
  for (const id of BOSS_IDS) {
    for (const ctx of ctxs) {
      const action = bossAction(id, ctx)!
      const plan = bossPlan(id, ctx)!
      // ① 모든 카드 id가 해석돼야 한다 — 하나라도 못 찾으면 플랜이 짧아진다.
      if (plan.length !== action.plan.length) missing++
      if (plan.length !== 3) shortPlan++
      // ② 같은 공격 카드를 한 턴에 두 번 넣지 않는다. 플레이어에겐 UI·AI가 이걸
      //    강제하므로(`placedNoRepeat`) 보스만 예외가 되면 불공평하다.
      const atks = plan.filter((c) => c.kind === 'attack').map((c) => c.id)
      if (new Set(atks).size !== atks.length) dupAttack++
    }
  }
  check('보스 플랜의 카드 id가 전부 해석된다', missing, 0)
  check('보스 플랜은 항상 3장', shortPlan, 0)
  check('한 턴에 같은 공격 카드를 두 번 쓰지 않는다', dupAttack, 0)

  // ③ 컷인의 격노 문턱이 스크립트의 페이즈 전환과 **같아야** 한다. 어긋나면
  //    "격노 컷인이 떴는데 행동은 그대로"가 되어 연출이 거짓말이 된다.
  const mismatched = BOSS_IDS.filter((id) => {
    const cine = bossCinematic(id, id)!
    const justAbove = bossAction(id, { turn: 1, hpFrac: cine.enrageAt + 0.02 })!
    const atOrBelow = bossAction(id, { turn: 1, hpFrac: cine.enrageAt })!
    return justAbove.phase !== 1 || atOrBelow.phase !== 2
  })
  check('격노 문턱 = 페이즈 전환 지점', mismatched, [])

  // ④ 보스 카드는 **플레이어에게 새어 나가면 안 된다**. 덱 빌더(deckFor)·런 보상
  //    풀(RUN_CARDS) 어느 쪽에도 들어 있으면 안 된다.
  const playerPool = new Set([
    ...ROSTER.flatMap((c) => deckFor(c).map((x) => x.id)),
    ...RUN_CARDS.map((c) => c.id),
  ])
  check('보스 카드가 플레이어 풀에 없다', BOSS_CARDS.filter((c) => playerPool.has(c.id)).map((c) => c.id), [])

  // ⑤ 보스마다 무대가 달라야 한다 — 셋이 같은 배경이면 "어떤 보스인가"를 못 말한다.
  const scenes = BOSS_IDS.map((id) => bossScene(id))
  check('보스마다 전용 무대', new Set(scenes).size, BOSS_IDS.length)
  check('무대가 빠진 보스가 없다', scenes.filter((s) => !s), [])

  // ⑥ 몬스터 덱과 스크립트가 같은 카드를 봐야 한다(도감·AI 폴백이 실제 행동과 일치).
  const outOfDeck: string[] = []
  for (const id of BOSS_IDS) {
    const deck = new Set(getMonster(id).deckCardIds)
    for (const ctx of ctxs)
      for (const c of bossPlan(id, ctx)!)
        if (c.kind === 'attack' && !deck.has(c.id)) outOfDeck.push(`${id}:${c.id}`)
  }
  check('스크립트가 쓰는 공격은 몬스터 덱에도 있다', [...new Set(outOfDeck)], [])
}

// --- 지형: 바위 (2026-08-05 · 2026-08-07 개편) -------------------------------
// 규칙 셋(못 들어간다 · 사격선을 끊는다 · 부술 수 있다) + 처박기 기절.
// ⚠ **2026-08-07에 전제가 하나 바뀌었다**: 전사·마법사의 지형 카드가 들어오면서
//   바위가 PvP 판에도 놓인다. 그래서 "바위는 런 전용이라 RULES_VERSION을 안 올린다"는
//   근거는 더 이상 없고, 같은 커밋에서 5 → 6으로 올렸다. 마지막 검사(빈 지형 = 지형
//   인자 없음)는 여전히 유효하지만 이제 그 근거가 아니라 **회귀 방지**용이다.
console.log('\n지형 — 바위')
{
  const rocks = (...cells: [number, number][]) =>
    cells.map(([col, row]) => ({ cell: { col, row }, hp: ROCK_HP, maxHp: ROCK_HP }))
  // ⚠ 시작 칸은 **여기서 정확히** 준다 — 생성자가 시작 칸과 겹치는 바위를 버리므로,
  //   나중에 `state.pos`를 갈아 끼우면 원하던 바위가 이미 사라져 있다(실제로 한 번
  //   걸렸다: 상대 시작 칸에 바위를 두고 밀어내기를 검사하려다 바위 없이 쟀다).
  const withRocks = (
    list: ReturnType<typeof rocks>,
    p0: [number, number] = [1, 1],
    p1: [number, number] = [4, 1],
  ) =>
    new CardBattle('warrior', 'warrior', {
      chars: [getChar('warrior'), getChar('warrior')],
      passives: [{ desc: '' }, { desc: '' }],
      startCells: [{ col: p0[0], row: p0[1] }, { col: p1[0], row: p1[1] }],
      obstacles: list,
    })

  // ① 못 들어간다 — 이동이 바위 앞에서 멈춘다(벽과 같은 규칙).
  {
    const b = withRocks(rocks([2, 1]))
    b.resolveRound([card('m-right'), card('c-energy'), card('c-energy')], HOLD)
    check('바위 앞에서 이동이 멈춘다', b.state.pos[0].col, 1)
    const b2 = withRocks(rocks([3, 1]))
    b2.resolveRound([card('m-right2'), card('c-energy'), card('c-energy')], HOLD)
    check('2칸 이동은 바위 직전까지만 간다', b2.state.pos[0].col, 2)
    const b3 = withRocks(rocks([2, 1]))
    b3.resolveRound([card('m-up'), card('m-right'), card('c-energy')], HOLD)
    check('줄을 바꾸면 바위를 지나갈 수 있다', [b3.state.pos[0].col, b3.state.pos[0].row], [2, 0])
  }

  // ② 사격선을 끊는다 — 사이에 낀 바위가 그 칸을 가린다. 대각은 안 가린다.
  {
    const beam: CardDef = {
      id: 'test-beam', name: '테스트 광선', kind: 'attack', desc: '',
      range: [{ df: 1, du: 0 }, { df: 2, du: 0 }, { df: 3, du: 0 }],
      damage: 30, energyCost: 0, cooldown: 0,
    }
    const b = withRocks(rocks([2, 1]))
    const hp1 = b.state.hp[1]
    b.resolveRound([beam, card('c-energy'), card('c-energy')], HOLD)
    check('바위 뒤 상대는 안 맞는다', hp1 - b.state.hp[1], 0)

    // 관통은 바위를 무시하고 뒤를 그대로 때린다(궁수·마법사의 답).
    const bp = withRocks(rocks([2, 1]))
    const hpp = bp.state.hp[1]
    bp.resolveRound([{ ...beam, id: 'test-beam-p', pierce: true }, card('c-energy'), card('c-energy')], HOLD)
    check('관통은 바위를 뚫고 맞힌다', hpp - bp.state.hp[1] > 0, true)

    // 유물 `alwaysPierce`도 같은 규칙(엔진 piercesRock 한 곳을 본다).
    const ba = new CardBattle('warrior', 'warrior', {
      chars: [getChar('warrior'), getChar('warrior')],
      passives: [{ desc: '', alwaysPierce: true }, { desc: '' }],
      startCells: [{ col: 1, row: 1 }, { col: 4, row: 1 }],
      obstacles: rocks([2, 1]),
    })
    const hpa = ba.state.hp[1]
    ba.resolveRound([beam, card('c-energy'), card('c-energy')], HOLD)
    check('alwaysPierce 유물도 바위를 뚫는다', hpa - ba.state.hp[1] > 0, true)

    // 다른 줄의 바위는 아무것도 안 가린다 — 우회로가 늘 남아 있어야 한다.
    const bd = withRocks(rocks([2, 0]))
    const hpd = bd.state.hp[1]
    bd.resolveRound([beam, card('c-energy'), card('c-energy')], HOLD)
    check('다른 줄 바위는 사격선을 안 막는다', hpd - bd.state.hp[1] > 0, true)
  }

  // ③ 부술 수 있다 — 가로막은 바위가 그 공격의 피해를 받는다(빗나가도).
  {
    const hit: CardDef = {
      id: 'test-rockhit', name: '테스트 타격', kind: 'attack', desc: '',
      range: [{ df: 1, du: 0 }, { df: 2, du: 0 }], damage: 13, energyCost: 0, cooldown: 0,
    }
    const b = withRocks(rocks([2, 1]))
    b.resolveRound([hit, card('c-energy'), card('c-energy')], HOLD)
    check('가로막은 바위가 깎인다', b.state.obstacles[0]?.hp, ROCK_HP - 13)
    // 한 번 더 때리면 부서져 판에서 사라진다.
    b.resolveRound([hit, card('c-energy'), card('c-energy')], HOLD)
    check('바위가 부서지면 판에서 사라진다', b.state.obstacles.length, 0)
    // 관통은 바위를 그냥 지나간다 — 깎지도 않는다.
    const bp = withRocks(rocks([2, 1]))
    bp.resolveRound([{ ...hit, id: 'test-rockhit-p', pierce: true }, card('c-energy'), card('c-energy')], HOLD)
    check('관통은 바위를 깎지 않는다', bp.state.obstacles[0]?.hp, ROCK_HP)
  }

  // ④ 처박기(2026-08-07 사용자 확정) — 밀려날 곳이 막혀 있으면 **벽이든 바위든**
  //    못 간 칸마다 KNOCKBACK_BLOCK_DAMAGE, 한 칸도 못 밀리면 그 라운드 기절.
  //    ⚠ 2026-08-05까지는 바위만 대상이었다(구석 좌석 운으로 무한 기절을 막으려고).
  //      사용자가 벽도 포함하도록 확정해 뒤집었고, **기절은 0칸일 때만**으로 남겼다.
  {
    const shove: CardDef = {
      id: 'test-slam', name: '테스트 처박기', kind: 'attack', desc: '',
      range: [{ df: 1, du: 0 }], damage: 1, energyCost: 0, push: 2, cooldown: 0,
    }
    const b = withRocks(rocks([3, 1]))
    b.state.pos = [{ col: 1, row: 1 }, { col: 2, row: 1 }]
    const hp = b.state.hp[1]
    const st = b.resolveRound([shove, card('c-energy'), card('c-energy')], [card('c-strike'), card('c-strike'), card('c-strike')])
    check('바위에 막히면 한 칸도 안 밀린다', b.state.pos[1].col, 2)
    check('바위에 처박히면 2칸분 피해(1 + 5×2)', hp - b.state.hp[1], 1 + KNOCKBACK_BLOCK_DAMAGE * 2)
    check('바위에 처박히면 그 라운드 기절', st.filter((x) => x.result === 'stun' && x.actor === 1).length, 2)

    // 벽도 같다 — 판 끝에 몰린 상대는 밀려날 곳이 없어 그대로 부딪힌다.
    const w = withRocks([])
    w.state.pos = [{ col: 4, row: 1 }, { col: 5, row: 1 }]
    const hpw = w.state.hp[1]
    w.resolveRound([shove, card('c-energy'), card('c-energy')], HOLD)
    check('벽에 몰려도 똑같이 처박힌다', hpw - w.state.hp[1], 1 + KNOCKBACK_BLOCK_DAMAGE * 2)

    // **부분 차단도 기절한다**(2026-08-07 사용자 예시). 못 간 칸만 피해가 된다.
    const p = withRocks(rocks([4, 1]), [1, 1], [2, 1])
    const hpp = p.state.hp[1]
    const sp = p.resolveRound(
      [shove, card('c-energy'), card('c-energy')],
      [card('c-energy'), card('c-strike'), card('c-strike')],
    )
    check('부분 차단 — 한 칸 밀리고 막혔다', p.state.pos[1].col, 3)
    check('부분 차단 — 못 간 한 칸만 피해(1 + 5)', hpp - p.state.hp[1], 1 + KNOCKBACK_BLOCK_DAMAGE)
    check('부분 차단도 기절한다', sp.filter((x) => x.result === 'stun' && x.actor === 1).length, 2)

    // 온전히 밀리면 넉백 피해가 없다.
    const f = withRocks([], [1, 1], [2, 1])
    const hpf = f.state.hp[1]
    f.resolveRound([shove, card('c-energy'), card('c-energy')], HOLD)
    check('끝까지 밀리면 넉백 피해 없음', [f.state.pos[1].col, hpf - f.state.hp[1]], [4, 1])
  }

  // ⑤ 세우기 — 「석벽 소환」이 상대 좌우에 바위를 만든다.
  {
    const menhir = BOSS_CARDS.find((c) => c.id === 'b-ward-menhir')!
    // p1(보스)이 내면 **상대(p0) 좌우**에 선다.
    const b = withRocks([], [1, 1], [3, 1])
    b.resolveRound(HOLD, [menhir, card('c-energy'), card('c-energy')])
    check(
      '석벽은 상대 좌우에 선다',
      b.state.obstacles.map((r) => r.cell.col).sort((x, y) => x - y),
      [0, 2],
    )
    check('석벽 체력은 카드가 정한다', b.state.obstacles[0]?.maxHp, 23)
    // 파이터가 선 칸에는 안 세운다(바위 위에 서 있는 상태를 만들면 안 된다).
    // p0=2·p1=3이면 상대 좌우는 1과 3인데, 3은 보스 자신이 서 있으므로 1만 선다.
    const c2 = withRocks([], [2, 1], [3, 1])
    c2.resolveRound(HOLD, [menhir, card('c-energy'), card('c-energy')])
    check('파이터가 선 칸엔 안 세운다', c2.state.obstacles.map((r) => r.cell.col), [1])
  }

  // ⑥ 생성자 — 시작 칸과 겹치는 바위는 버린다.
  {
    const b = new CardBattle('warrior', 'warrior', {
      startCells: [{ col: 1, row: 1 }, { col: 4, row: 1 }],
      obstacles: rocks([1, 1], [9, 9], [3, 1]),
    })
    check('시작 칸·격자 밖 바위는 버린다', b.state.obstacles.map((r) => r.cell.col), [3])
  }

  // ⑤-bis 지형 카드(2026-08-07) — 전사·마법사가 **앞에** 바위를 세운다.
  // 요점은 "바위 위에 사람이 서 있는 상태를 만들 수 없다"는 것이다: 그 칸에 상대가
  // 있으면 먼저 밀어내고, 밀어내지 못하면 바위가 서지 않는다.
  {
    const wm = getChar('warrior').cards.find((c) => c.id === 'war-menhir')!
    const mm = getChar('mage').cards.find((c) => c.id === 'mag-menhir')!

    // 빈 칸이면 그냥 선다 — 전사는 앞 1칸, 마법사는 앞 2칸.
    const a = withRocks([], [1, 1], [5, 1])
    a.resolveRound([wm, card('c-energy'), card('c-energy')], HOLD)
    check('돌기둥은 바로 앞 한 칸에 선다', a.state.obstacles.map((r) => r.cell.col), [2])
    check('돌기둥 체력은 ROCK_HP', a.state.obstacles[0]?.maxHp, ROCK_HP)

    const m = new CardBattle('mage', 'warrior', {
      chars: [getChar('mage'), getChar('warrior')],
      passives: [{ desc: '' }, { desc: '' }],
      startCells: [{ col: 1, row: 1 }, { col: 5, row: 1 }],
      obstacles: [],
    })
    m.resolveRound([mm, card('c-energy'), card('c-energy')], HOLD)
    check('석순은 두 칸 앞에 선다', m.state.obstacles.map((r) => r.cell.col), [3])

    // 그 칸에 상대가 서 있으면: 밀려나고(넉백 1) 피해를 받고 기절한 **뒤에** 바위가 선다.
    const b = withRocks([], [1, 1], [2, 1])
    const hp0 = b.state.hp[1]
    const st = b.resolveRound([wm, card('c-energy'), card('c-energy')], HOLD)
    check('상대가 선 칸이면 한 칸 밀려난다', b.state.pos[1].col, 3)
    check('밀려난 자리에 바위가 선다', b.state.obstacles.map((r) => r.cell.col), [2])
    check('밀어내며 피해를 준다', b.state.hp[1] > 0 && hp0 - b.state.hp[1] > 0, true)
    check('밀어내며 기절시킨다', st.some((x) => x.result === 'stun' && x.actor === 1), true)

    // 밀어내지 못하면(등 뒤가 벽) 바위는 서지 않는다 — 대신 처박기가 대가를 치른다.
    const c3 = withRocks([], [4, 1], [5, 1])
    const st3 = c3.resolveRound([wm, card('c-energy'), card('c-energy')], HOLD)
    check('못 밀어내면 바위가 안 선다', c3.state.obstacles.length, 0)
    check('못 밀어내도 처박혀 기절한다', st3.some((x) => x.result === 'stun' && x.actor === 1), true)

    // `ahead`는 좌석이 아니라 **facing**이다 — 상대를 지나치면 바위도 반대쪽에 선다.
    const d = withRocks([], [4, 1], [1, 1])
    d.resolveRound([wm, card('c-energy'), card('c-energy')], HOLD)
    check('앞은 좌석이 아니라 상대 쪽이다', d.state.obstacles.map((r) => r.cell.col), [3])
  }

  // ⑦ 이름 붙은 지형 — 열을 통째로 막으면 접근 자체가 불가능한 개전이 나온다.
  {
    const bad: string[] = []
    for (const [scene, list] of Object.entries(TERRAIN)) {
      for (let col = 0; col < GRID_COLS; col++) {
        const blocked = list.filter((r) => r.cell.col === col).length
        if (blocked >= GRID_ROWS - 1) bad.push(`${scene}:col${col}`)
      }
      if (list.some((r) => r.cell.col === 0 || r.cell.col === GRID_COLS - 1)) bad.push(`${scene}:끝열`)
    }
    check('열을 통째로 막는 무대가 없다', bad, [])
  }

  // ⑦-bis **지형은 누가 데려오는가**(2026-08-07). 층·무대가 아니라 **상대**가 정한다 —
  // 일반 전투는 빈 판이어야 하고(1층부터 바위가 서 있으면 안 된다), 바위는 엘리트나
  // 몸이 곧 돌인 몬스터에게서 처음 나온다.
  {
    const terrainOf = (type: NodeType, monsterId?: string) =>
      terrainFor({
        ...startRun('warrior'),
        floor: 1,
        map: [[{ type, monsterId, lane: 1, next: [] }]],
        picked: [0],
      } as RunState).length

    check('일반 전투는 빈 판', terrainOf('combat', 'slime'), 0)
    check('엘리트 칸에는 바위가 선다', terrainOf('elite', 'knight') > 0, true)
    check('골렘은 일반 전투에도 바위를 데려온다', terrainOf('combat', 'golem') > 0, true)
    // 보스 전용 무대는 비워 둔다 — 심연은 "도망칠 수 없다"가 정체성이고, 성소의 바위는
    // 수호기사가 직접 세워야 「석벽 소환」이 무슨 일을 한 건지 보인다.
    check('심연(오버로드)은 빈 판', terrainOf('boss', 'overlord'), 0)
    check('성소(수호기사)는 빈 판', terrainOf('elite', 'warden'), 0)
    // 몬스터가 자기 지형을 가졌으면 보스라도 그게 이긴다(화염군주 = 굳은 용암).
    check('화염군주는 자기 지형을 가진다', terrainOf('elite', 'pyrelord') > 0, true)
    // 이벤트·상점 칸은 전투가 아니라 애초에 지형이 없다.
    check('전투가 아닌 칸은 빈 판', terrainOf('shop'), 0)
  }

  // ⑧ **바위가 없으면 지형 규칙이 통째로 no-op이다** — 바위도 지형 카드도 없는 판은
  //    예전과 완전히 같아야 한다(지형 코드가 빈 판에 부작용을 흘리지 않는다는 회귀 검사).
  {
    const plan = [card('m-right'), card('c-strike'), card('c-guard')]
    const run = (obstacles: ReturnType<typeof rocks>) => {
      const b = new CardBattle('warrior', 'archer', { obstacles })
      const out = [b.resolveRound(plan, HOLD), b.resolveRound(plan, HOLD)]
      return JSON.stringify(out)
    }
    check('빈 지형은 지형 인자를 안 준 것과 동일', run([]), run(undefined as never))
  }
}

console.log(`\n${failed === 0 ? '전부 통과 ✅' : `실패 ${failed}건 ❌`}\n`)
process.exit(failed === 0 ? 0 : 1)
