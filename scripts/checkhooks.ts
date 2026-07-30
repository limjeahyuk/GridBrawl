// ---------------------------------------------------------------------------
// 유물·카드 훅 검증 — 엔진의 새 능력(누적 기력 트리거·기절·저체력 배율·관통·각성·
// 선제 보호막)이 정말 의도대로 발동하는지 단정한다. 엔진은 랜덤이 없으므로 기대값을
// 정확히 쓸 수 있다(전투 시뮬과 달리 통계가 아니라 **참/거짓** 검증).
//
// 실행: npm run check
// ---------------------------------------------------------------------------
import { CardBattle } from '../src/battle/engine'
import { COMMON_CARDS } from '../src/battle/cards'
import { getChar, type CharacterDef, type Passive } from '../src/data/roster'
import { mergeRelics, mergeRunMods } from '../src/game/relics'
import { deckCap, grantRelic, healHp, rollRewards, rollShop, startRun } from '../src/game/run'
import { RUN_CARD_BY_ID } from '../src/game/runcards'
import type { CardDef } from '../src/battle/types'

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
  const b = new CardBattle('titan', 'titan', {
    chars: chars ?? [getChar('titan'), getChar('titan')],
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
  // 스트라이크(기력 10) 3장 = 턴당 30 소모. per:60이면 2턴째에 한 번 발동해야 한다.
  const b = battleWith({ energyTriggers: [{ per: 60, heal: 999 }] })
  b.state.hp[0] = 100
  const atk3 = [card('c-strike'), card('c-strike'), card('c-strike')]
  b.resolveTurn(atk3, IDLE) // 누적 10 (같은 공격은 한 턴에 한 번 → 나머지는 중복이라 그대로 소모)
  const after1 = b.state.energySpent[0]
  b.resolveTurn(atk3, IDLE)
  check('per 60 · 누적 기력이 60을 넘기면 발동', b.state.energySpent[0] >= 60 && b.state.hp[0] > 100, true)
  check('1턴 만에는 발동 안 함(누적 < 60)', after1 < 60, true)
}
{
  // per:20 · 한 턴에 30을 쓰면 같은 슬롯 정산에서 **여러 번** 터져야 한다.
  const b = battleWith({ energyTriggers: [{ per: 20, shield: 5 }] })
  b.resolveTurn([card('c-strike'), card('c-strike'), card('c-strike')], IDLE)
  check('per 20 · 한 턴 30 소모 → 1회 이상 발동(보호막)', b.state.energySpent[0] === 30, true)
}
{
  // 주기가 다른 두 트리거는 **각자** 터진다(합치지 않는다).
  const merged = mergeRelics(['capacitor', 'circuit'])
  check('유물 2개의 트리거는 배열로 누적', merged.energyTriggers?.length, 2)
  check('주기가 섞이지 않는다', merged.energyTriggers?.map((t) => t.per), [200, 100])
}

// --- 기절 ------------------------------------------------------------------
console.log('\n기절(stun)')
{
  const b = battleWith({ energyTriggers: [{ per: 10, stun: 1 }] })
  b.resolveTurn([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('트리거가 상대에게 기절을 걸었다', b.state.stunned[1] >= 1, true)
  const hpBefore = b.state.hp[0]
  const steps = b.resolveTurn(IDLE, [card('c-strike'), card('c-strike'), card('c-strike')])
  check('기절한 쪽 카드는 전부 무효(피해 0)', b.state.hp[0], hpBefore)
  check('기절 스텝이 로그에 남는다', steps.some((s) => s.phase === 'stun' && s.actor === 1), true)
  check('기절은 한 턴만 — 다음 턴엔 풀린다', b.state.stunned[1], 0)
}
{
  // 카드 `stun`(충격 봉) — 피해가 들어가야 걸린다.
  const b = battleWith({})
  b.resolveTurn([card('r-stunrod'), card('c-energy'), card('c-energy')], HOLD)
  check('충격 봉 적중 → 상대 기절 1턴', b.state.stunned[1], 1)
}
{
  // 가드로 완전히 막힌 타격은 기절시키지 못한다.
  const b = battleWith({})
  b.resolveTurn(
    [card('r-stunrod'), card('c-energy'), card('c-energy')],
    [card('c-guard'), card('c-energy'), card('c-energy')],
  )
  check('가드에 막힌 타격은 기절 없음(피해 0)', [b.state.stunned[1], b.state.hp[1]], [0, b.maxHp[1]])
}
{
  // 유물 stunOnHit — stunCap 만큼만.
  const b = battleWith(mergeRelics(['concussor']))
  for (let t = 0; t < 4; t++) b.resolveTurn([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('충격 증폭기는 전투당 stunCap(2)회까지만', b.state.stunsUsed[0], 2)
}

// --- 저체력 배율 ------------------------------------------------------------
console.log('\n저체력 폭주(lowHpBonusPct)')
{
  const base = battleWith({})
  base.resolveTurn([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  const normal = base.maxHp[1] - base.state.hp[1]

  const b = battleWith({ lowHpBonusPct: 100 })
  b.state.hp[0] = 10 // 절반 이하
  b.resolveTurn([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  const boosted = b.maxHp[1] - b.state.hp[1]
  check('체력 절반 이하 + 100% → 피해 2배', boosted, normal * 2)

  const c = battleWith({ lowHpBonusPct: 100 })
  c.resolveTurn([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('체력이 충분하면 배율 없음', c.maxHp[1] - c.state.hp[1], normal)

  check('두 유물의 배율은 합산(50+100=150)', mergeRelics(['lastditch', 'deathwish']).lowHpBonusPct, 150)
}

// --- 관통·각성·선제 보호막 ---------------------------------------------------
console.log('\n관통(alwaysPierce) · 각성(empower) · 선제 보호막(openingShield)')
{
  const b = battleWith(mergeRelics(['voidedge']))
  b.resolveTurn([card('c-strike'), card('c-energy'), card('c-energy')], [card('c-guard'), card('c-energy'), card('c-energy')])
  check('공허의 날 — 가드를 무시하고 피해가 들어간다', b.state.hp[1] < b.maxHp[1], true)
}
{
  const b = battleWith({})
  b.resolveTurn([card('r-protocol'), card('c-energy'), card('c-energy')], HOLD)
  check('과부하 프로토콜 1회 → 각성 +6', b.state.empowered[0], 6)
  b.resolveTurn([card('r-protocol'), card('c-energy'), card('c-energy')], HOLD)
  check('각성은 중첩된다 → +12', b.state.empowered[0], 12)
}
{
  const b = battleWith({ openingShield: 40 })
  check('선제 방벽 — 1턴에만', b.state.turn, 1)
  b.resolveTurn(IDLE, IDLE)
  const b2 = battleWith({ openingShield: 40 })
  b2.resolveTurn(IDLE, IDLE) // 2턴 시작 시 보호막에 40이 안 붙어야 한다
  b2.resolveTurn(IDLE, IDLE)
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
  const run = startRun('volt')
  check('시작 덱은 공용 기본 9장', run.deck.length, 9)
  check('시작 덱에 직업 카드 없음', run.deck.some((id) => id.startsWith('volt-')), false)
  check('시그니처 유물만 들고 시작', run.relicIds, ['sig-volt'])

  // 직업 카드를 하나도 못 얻은 상태에선 보상 한 칸이 직업 카드로 보장된다.
  const classIds = getChar('volt').cards.map((c) => c.id)
  let guaranteed = 0
  for (let i = 0; i < 50; i++) {
    const rewards = rollRewards(run)
    if (rewards.some((r) => r.kind === 'card' && classIds.includes(r.cardId))) guaranteed++
  }
  check('직업 카드 미보유 시 보상에 항상 직업 카드가 있다', guaranteed, 50)

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
}

// --- 기존 규칙이 안 깨졌는지(회귀) -------------------------------------------
console.log('\n회귀 — 옵션을 안 주면 예전과 같아야 한다')
{
  const b = new CardBattle('volt', 'titan')
  check('풀피로 시작(startHp 미지정)', [b.state.hp[0], b.state.hp[1]], [b.maxHp[0], b.maxHp[1]])
  check('패시브는 캐릭터 것', b.passive[0].turnEnergy, getChar('volt').passive.turnEnergy)
  check('누적 기력·기절 상태는 0에서 시작', [b.state.energySpent, b.state.stunned], [[0, 0], [0, 0]])
}
{
  const b = new CardBattle('titan', 'titan', { startHp: [77, undefined] })
  check('startHp — 지정한 쪽만 이월', [b.state.hp[0], b.state.hp[1]], [77, b.maxHp[1]])
  const c = new CardBattle('titan', 'titan', { startHp: [99999, -5] })
  check('startHp는 1..maxHp로 클램프', [c.state.hp[0], c.state.hp[1]], [c.maxHp[0], 1])
}

console.log(`\n${failed === 0 ? '전부 통과 ✅' : `실패 ${failed}건 ❌`}\n`)
process.exit(failed === 0 ? 0 : 1)
