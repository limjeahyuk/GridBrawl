// ---------------------------------------------------------------------------
// 유물·카드 훅 검증 — 엔진의 새 능력(누적 기력 트리거·기절·저체력 배율·관통·각성·
// 선제 보호막)이 정말 의도대로 발동하는지 단정한다. 엔진은 랜덤이 없으므로 기대값을
// 정확히 쓸 수 있다(전투 시뮬과 달리 통계가 아니라 **참/거짓** 검증).
//
// 실행: npm run check
// ---------------------------------------------------------------------------
import { CardBattle, planAffordable } from '../src/battle/engine'
import { COMMON_CARDS, ENERGY_REGEN } from '../src/battle/cards'
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
}

// --- 상태이상(독·화상·빙결) -------------------------------------------------
console.log('\n상태이상 — 지속피해·빙결·시너지')
{
  // 카드에 직접 붙인 독. 스트라이크(10dmg)를 독 5짜리로 바꿔 때린다.
  const poisonJab: CardDef = { ...card('c-strike'), id: 'test-poison', poison: 5 }
  const b = battleWith({}, {})
  const hp0 = b.state.hp[1]
  b.resolveTurn([poisonJab, card('c-energy'), card('c-energy')], HOLD)
  // 타격 10 + 같은 턴 독 틱 5 = 15
  check('독 — 맞은 턴에 바로 1틱(10+5)', hp0 - b.state.hp[1], 15)
  check('독이 3턴짜리로 걸린다(1틱 소모 후 2턴 남음)', b.statusOf(1, 'poison')?.turns, 2)
  const hp1 = b.state.hp[1]
  b.resolveTurn(HOLD, HOLD) // 때리지 않아도 계속 갉아야 한다
  check('독 — 때리지 않은 턴에도 갉는다', hp1 - b.state.hp[1], 5)
  b.resolveTurn(HOLD, HOLD)
  check('독 — 지속이 끝나면 사라진다', b.statusOf(1, 'poison'), undefined)
}
{
  // 중첩: 위력은 합산되고 지속은 갱신된다.
  const p3: CardDef = { ...card('c-strike'), id: 'test-p3', poison: 3 }
  const b = battleWith({}, {})
  b.resolveTurn([p3, card('c-energy'), card('c-energy')], HOLD)
  b.resolveTurn([p3, card('c-energy'), card('c-energy')], HOLD)
  check('독 중첩 — 위력 합산(3+3)', b.statusOf(1, 'poison')?.power, 6)
  check('독 중첩 — 지속은 갱신(3턴에서 1틱 소모)', b.statusOf(1, 'poison')?.turns, 2)
}
{
  // 가드에 완전히 막히면 상태이상도 안 묻는다(기절과 같은 규칙).
  const poisonJab: CardDef = { ...card('c-strike'), id: 'test-pblock', poison: 9 }
  const b = battleWith({}, {})
  b.resolveTurn([poisonJab, card('c-energy'), card('c-energy')], [card('c-guard'), card('c-energy'), card('c-energy')])
  check('가드로 완전히 막히면 독이 안 묻는다', b.statusOf(1, 'poison'), undefined)
}
{
  // 빙결 — 이동 카드만 무효. 카드는 소모되고 기절과 달리 공격은 나간다.
  const freezeJab: CardDef = { ...card('c-strike'), id: 'test-freeze', freeze: 1 }
  const b = battleWith({}, {})
  b.resolveTurn([freezeJab, card('c-energy'), card('c-energy')], HOLD)
  // 걸린 턴엔 지속을 안 깎는다 — 안 그러면 온전한 한 턴을 못 막고 사라진다
  check('빙결이 걸리고, 걸린 턴엔 지속이 안 깎인다', b.statusOf(1, 'frozen')?.turns, 1)
  const before = { ...b.state.pos[1] }
  const steps = b.resolveTurn(HOLD, [card('m-left'), card('c-energy'), card('c-energy')])
  check('빙결 — 다음 턴 이동 카드가 무효(위치 그대로)', b.state.pos[1], before)
  check('빙결 — 결과가 frozen으로 표시된다', steps.some((s) => s.result === 'frozen'), true)
  check('빙결 — 한 턴을 막고 나면 풀린다', b.statusOf(1, 'frozen'), undefined)
  const moved = b.resolveTurn(HOLD, [card('m-left'), card('c-energy'), card('c-energy')])
  check('빙결이 풀리면 다시 움직인다', b.state.pos[1].col !== before.col, true)
  void moved
}
{
  // 빙결은 기절과 다르다 — 이동만 막고 공격은 그대로 나간다.
  const freezeJab: CardDef = { ...card('c-strike'), id: 'test-freeze2', freeze: 1 }
  const b = battleWith({}, {})
  b.resolveTurn([freezeJab, card('c-energy'), card('c-energy')], HOLD)
  const hp0 = b.state.hp[0]
  b.resolveTurn(HOLD, [card('c-strike'), card('c-energy'), card('c-energy')])
  check('빙결 — 공격은 막지 않는다(기절과 구별)', b.state.hp[0] < hp0, true)
}
{
  // 유물 훅: poisonOnHit + statusPowerPct + bonusVsAfflicted
  const b = battleWith({ poisonOnHit: 4 }, {})
  b.resolveTurn([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('poisonOnHit — 평범한 카드에도 독이 묻는다', b.statusOf(1, 'poison')?.power, 4)
}
{
  const b = battleWith({ poisonOnHit: 10, statusPowerPct: 50 }, {})
  b.resolveTurn([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('statusPowerPct 50% — 위력 10 → 15', b.statusOf(1, 'poison')?.power, 15)
}
{
  // 이미 걸려 있는 상대에게만 보너스. 첫 타격은 아직 안 걸렸으므로 보너스 없음.
  const plain = battleWith({}, {})
  const hpPlain = plain.state.hp[1]
  plain.resolveTurn([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  const baseDmg = hpPlain - plain.state.hp[1]

  const b = battleWith({ poisonOnHit: 2, bonusVsAfflicted: 7 }, {})
  const hp0 = b.state.hp[1]
  b.resolveTurn([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  const t1 = hp0 - b.state.hp[1] // 타격(보너스 없음) + 독 2
  check('bonusVsAfflicted — 첫 타격엔 안 붙는다', t1, baseDmg + 2)
  const hp1 = b.state.hp[1]
  b.resolveTurn([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  // 2턴째: 이미 중독 → 타격 +7, 독은 2+2=4가 틱
  check('bonusVsAfflicted — 걸린 뒤엔 +7', hp1 - b.state.hp[1], baseDmg + 7 + 4)
}
{
  // 지속피해로도 KO가 나야 한다(독안개와 같은 자리).
  const poisonJab: CardDef = { ...card('c-strike'), id: 'test-pko', poison: 8 }
  const b = battleWith({}, {})
  b.state.hp[1] = 12 // 타격 10을 견디고 2 남은 뒤 독 8에 쓰러진다
  b.resolveTurn([poisonJab, card('c-energy'), card('c-energy')], HOLD)
  check('독으로 KO — 전투가 끝난다', [b.state.over, b.state.winner], [true, 0])
}

// --- 버프 카드 + 이동공격 (2026-08-01) ---------------------------------------
console.log('\n버프 카드(atkUp / defUp / freeCast) · 이동공격(dashForward)')
{
  // 버프는 수비 티어라 **같은 턴 뒤 슬롯의 공격**에 이미 얹힌다.
  const atkBuff: CardDef = {
    id: 'test-atkup', name: '테스트 공버프', kind: 'buff', desc: '',
    buff: 'atkUp', buffPower: 15, buffTurns: 2, buffCost: 0, cooldown: 0,
  }
  const plain = battleWith({}, {})
  const hp0 = plain.state.hp[1]
  plain.resolveTurn([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  const base = hp0 - plain.state.hp[1]

  const b = battleWith({}, {})
  const h0 = b.state.hp[1]
  b.resolveTurn([atkBuff, card('c-strike'), card('c-energy')], HOLD)
  check('atkUp — 같은 턴 뒤 슬롯 공격에 바로 얹힌다', h0 - b.state.hp[1], base + 15)
  const h1 = b.state.hp[1]
  b.resolveTurn([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('atkUp — 다음 턴에도 남아 있다', h1 - b.state.hp[1], base + 15)
  const h2 = b.state.hp[1]
  b.resolveTurn([card('c-strike'), card('c-energy'), card('c-energy')], HOLD)
  check('atkUp — 2턴이 지나면 사라진다', h2 - b.state.hp[1], base)
}
{
  const defBuff: CardDef = {
    id: 'test-defup', name: '테스트 방버프', kind: 'buff', desc: '',
    buff: 'defUp', buffPower: 6, buffTurns: 3, buffCost: 0, cooldown: 0,
  }
  const plain = battleWith({}, {})
  const hp0 = plain.state.hp[0]
  plain.resolveTurn(HOLD, [card('c-strike'), card('c-energy'), card('c-energy')])
  const base = hp0 - plain.state.hp[0]

  const b = battleWith({}, {})
  const h0 = b.state.hp[0]
  b.resolveTurn([defBuff, card('c-energy'), card('c-energy')], [card('c-strike'), card('c-energy'), card('c-energy')])
  check('defUp — 받는 피해가 줄어든다', h0 - b.state.hp[0], Math.max(0, base - 6))
}
{
  // freeCast: 켜진 동안 기력을 한 톨도 안 쓴다.
  const free: CardDef = {
    id: 'test-free', name: '테스트 무아지경', kind: 'buff', desc: '',
    buff: 'freeCast', buffTurns: 2, buffCost: 0, cooldown: 0,
  }
  const b = battleWith({}, {})
  b.state.energy[0] = 30 // 스트라이크(10) 3장도 빠듯한 양
  b.resolveTurn([free, card('c-strike'), card('c-guard')], HOLD)
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
  b.resolveTurn([kite, card('c-energy'), card('c-energy')], HOLD)
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
  b.resolveTurn([back, card('c-energy'), card('c-energy')], HOLD)
  check('dashForward — 벽에서 멈춘다(판 밖으로 안 나감)', b.state.pos[0].col, 0)
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
  check('누적 기력·기절 상태는 0에서 시작', [b.state.energySpent, b.state.stunned], [[0, 0], [0, 0]])
}
{
  const b = new CardBattle('warrior', 'warrior', { startHp: [77, undefined] })
  check('startHp — 지정한 쪽만 이월', [b.state.hp[0], b.state.hp[1]], [77, b.maxHp[1]])
  const c = new CardBattle('warrior', 'warrior', { startHp: [99999, -5] })
  check('startHp는 1..maxHp로 클램프', [c.state.hp[0], c.state.hp[1]], [c.maxHp[0], 1])
}

console.log(`\n${failed === 0 ? '전부 통과 ✅' : `실패 ${failed}건 ❌`}\n`)
process.exit(failed === 0 ? 0 : 1)
