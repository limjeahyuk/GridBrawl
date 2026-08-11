import { ROCK_HP, type BuffKind, type CardDef, type Offset } from '../battle/types'

// ---------------------------------------------------------------------------
// 로스터. **테마는 다크 판타지**(2026-07-31 리스킨 — 사이버 아레나에서 전환).
// 바뀐 것은 이름·칭호·소개문·색뿐이고 **id·카드·수치는 그대로**다: id는 저장된
// 덱(RTDB `decks/<uid>`)·유물(`sig-<id>`)·몬스터 `baseArtId`가 참조하고, 수치는
// 시뮬로 맞춘 밸런스라 건드리면 재측정이 필요하다. 옛 이름 대응표는
// docs/GAME_DESIGN.md "로스터 리스킨" 참고(밸런스 기록은 옛 이름 그대로 남겼다).
//
// 각 캐릭터는 고유 카드로 정체성을 낸다: 공용의 약한 공격/가드는 모두가 쓰고
// (battle/cards.ts),
// and the character's own cards carry the exciting abilities — wide ranges,
// heavy damage, energy drain, lifesteal, pierce, knockback, self-shield,
// recoil. Unique cards are mostly attacks but can be any kind (the warrior
// has a unique guard).
//
// Range offsets are { df, du }: df = cells forward (+ toward opponent), du =
// rows upward (+ above). The engine mirrors df by the attacker's facing.
// ---------------------------------------------------------------------------

/**
 * A character's signature passive. Each field is an independent hook the engine
 * applies at a fixed moment (see `CardBattle.resolveRound` / `computeAttack`):
 *   turnEnergy/turnShield — granted at the start of every turn (after the global
 *     regen + shield reset).
 *   damageReduction — flat amount subtracted from each incoming attack's damage.
 *   lifesteal — on an attack that deals damage, heal this flat amount of HP.
 *   shieldBreak — a connecting attack wipes the defender's remaining shield.
 *   revive — once per battle, a KO'd fighter comes back with this much HP.
 */
export interface Passive {
  desc: string
  turnEnergy?: number
  turnShield?: number
  damageReduction?: number
  lifesteal?: number
  shieldBreak?: boolean
  revive?: number
  // --- 로그라이크 유물용 추가 훅(2026-07-24) — 엔진이 결정론적으로 적용 ---
  /** 매 **라운드** 시작 시 체력 +N(최대치 cap). */
  regen?: number
  /** 내 공격이 실제로 겨냥에 들면 피해 +N(맞기 전 raw에 더함). */
  attackBonus?: number
  /** 피격해 피해를 실제로 입으면 공격자에게 N 반사. */
  thorns?: number
  /** 최대 체력 ±N(전투 시작 시 반영, 최소 1). */
  maxHpBonus?: number
  // --- 조합형 유물 훅(2026-07-31) — 로그라이크 전용, 전부 결정론적 ---
  /**
   * **누적 기력 소비 트리거**. 이 전투에서 쓴 기력이 `per`의 배수를 넘길 때마다 발동.
   * 여러 유물의 트리거는 배열로 **누적**된다(각자 자기 주기로 따로 발동) — 유물을
   * 겹쳐 쌓는 조합 플레이를 막지 않기 위한 설계. 순서는 유물 장착 순서(랜덤 없음).
   */
  energyTriggers?: EnergyTrigger[]
  /** 체력이 절반(`LOW_HP_FRAC`) 이하일 때 내 공격 피해 +N%. 유물끼리 합산된다. */
  lowHpBonusPct?: number
  /** 상대 보호막을 무시하고 피해를 관통시킨다(카드의 `pierce`를 상시화). */
  alwaysPierce?: boolean
  /** 내 공격이 적중하면 상대를 **그 라운드 동안** 기절시킨다(전투당 `stunCap`회까지). */
  stunOnHit?: number
  /** `stunOnHit`이 전투당 발동할 수 있는 횟수(합산). 없으면 1회. */
  stunCap?: number
  /** 첫 라운드에 얻는 보호막(선공 방어형). */
  openingShield?: number
  // --- 상태이상 훅(2026-08-01) — 3직업 개편의 빌드 재료 ---
  /**
   * 내 공격이 피해를 입히면 중독 **한 겹**을 더 건다 — 값은 그 겹의 **지속 라운드**다
   * (위력이 아니다: 한 겹은 늘 이동 1칸당 `POISON_TICK_DAMAGE`). 카드의 `poison`과
   * 겹치면 **지속이 긴 쪽**을 쓴다 — 한 대에 한 겹이 규칙이라 유물로 두 겹이 되면 안 된다.
   */
  poisonOnHit?: number
  /** 같은 규칙의 화상판 — 값은 지속 라운드. */
  burnOnHit?: number
  /**
   * 내가 거는 중독·화상 **한 겹의 위력** +N%(중독은 이동 1칸당, 화상은 피격 1회당).
   * **거는 순간 한 번 계산해 박아 넣는다** — 매번 다시 계산하면 유물을 도중에 얻었을
   * 때 이미 걸린 겹까지 소급돼 어긋난다.
   */
  statusPowerPct?: number
  /** 상대가 상태이상에 하나라도 걸려 있으면 내 공격 피해 +N(상태이상 시너지). */
  bonusVsAfflicted?: number

  // --- 확장 훅(2026-08-05) — 유물 종류를 2배로 늘리면서 추가 ---
  // 기존 훅만으로는 새 유물 70종이 전부 "수치만 다른 같은 것"이 됐다. 아래 여섯은
  // **다른 자리를 건드리는** 훅이라 유물이 서로 다르게 느껴지는 근거가 된다.
  // 전부 결정론적이고 정산 자리가 고정이라 멀티 락스텝은 그대로 안전하다.
  /**
   * 내 공격이 피해를 입히면 상대를 **그 라운드 동안** 빙결(카드를 못 냄. 단 맞으면
   * 깨진다). ⚠ 무제한이면 상대가 계속 봉인되므로 `freezeCap`(기본 2)회로 제한한다.
   */
  freezeOnHit?: number
  /** `freezeOnHit`이 전투당 발동할 수 있는 횟수(합산). 없으면 2회. */
  freezeCap?: number
  /** 방패 세우기·버티기 등 **수비 카드**의 흡수량 +N%(매 라운드 보호막에는 안 붙는다). */
  guardPowerPct?: number
  /** 힐 카드와 `regen`의 회복량 +N%. */
  healPowerPct?: number
  /** 전투 시작 기력 +N(최대 기력으로 클램프). */
  startEnergyBonus?: number
  /** 상대 체력이 절반(`LOW_HP_FRAC`) 이하일 때 내 공격 피해 +N%(처형). */
  executeBonusPct?: number
  /** 무너진 칸에서 받는 라운드당 피해 -N(0까지). 전장 붕괴 전용 방어. */
  collapseResist?: number

  // --- 상태이상 지속 연장 훅 (2026-08-07 2차) — **런 전용 전설 유물 전용** -------
  //
  // 내가 **거는** 상태이상이 N라운드 더 간다. 위력이 아니라 **시간**을 사는 훅이라
  // 다른 어떤 훅과도 곱해지고, 그래서 전부 `legend`로만 낸다(층 1에서 ≈6%, 층 15에서
  // ≈17%로 뽑히고 상점가 230).
  //
  // ⚠ **`ROSTER.passive`·몬스터에는 절대 넣지 않는다.** 유물은 `mergeRelics`를 거쳐
  //   런에서만 합쳐지므로(PvP·봇전은 `relics.ts`를 import조차 안 한다) 이 훅이 유물에만
  //   있는 한 규칙 자체가 PvP에 존재하지 않는다 — `RULES_VERSION`을 안 올리는 근거다.
  //   `npm run check`가 "ROSTER·몬스터에 연장 훅이 없다"를 직접 단정한다.
  //
  // ⚠ **봉인(기절·빙결·속박)을 늘리면 라운드를 넘어간다.** 무한 봉인이 안 되는 이유는
  //   `applyStatus`의 **재부여 가드**다 — 이미 걸려 있는 봉인은 다시 걸리지 않으므로
  //   "이번 라운드 + 다음 라운드"까지가 끝이고 그다음 라운드엔 반드시 일어난다.
  /** 내가 거는 **중독**의 지속 +N라운드(중첩 상한은 그대로 3겹). */
  poisonRoundBonus?: number
  /** 내가 거는 **화상**의 지속 +N라운드. */
  burnRoundBonus?: number
  /** 내가 거는 **기절**의 지속 +N라운드(다음 라운드까지 이어진다). */
  stunRoundBonus?: number
  /** 내가 거는 **빙결**의 지속 +N라운드. 맞으면 깨지는 규칙은 그대로다. */
  freezeRoundBonus?: number
  /** 내가 거는 **속박**의 지속 +N라운드. */
  bindRoundBonus?: number
}

/** 누적 기력 소비 트리거 한 개. `per`만큼 쓸 때마다 아래 효과가 한 번씩 터진다. */
export interface EnergyTrigger {
  per: number
  /** 상대를 **그 라운드 동안** 기절시킨다(남은 카드를 못 냄). */
  stun?: number
  /** 내 체력 +N. */
  heal?: number
  /** 내 보호막 +N. */
  shield?: number
  /** 상대에게 즉시 N 고정 피해(보호막 무시). */
  damage?: number
  /** 내 기력 +N(무한 순환은 아니다 — 소비량보다 작게 잡는다). */
  energy?: number
  /** 표시용 이름(연출 로그·툴팁). */
  label?: string
}

export interface CharacterDef {
  id: string
  name: string
  title: string
  accent: string
  accent2: string
  description: string
  maxHp: number
  maxEnergy: number
  startEnergy: number
  passive: Passive
  /**
   * 어느 스프라이트 시트로 그릴지(`art/sprites.ts`의 `SHEETS` 키). 비우면 `id`를
   * 쓴다 — 직업은 그래서 지정할 필요가 없고, **몬스터가 자기 그림을 갖는 통로**다
   * (`monsterChar`가 `MonsterDef.spriteId`를 여기에 실어 보낸다).
   */
  spriteId?: string
  /**
   * **직업 기본기 3장**(2026-08-04). 공용 약공(`c-strike`/`c-shot`/`c-jab`)을 직업별로
   * 갈라 놓은 것 — 이름·사거리 모양·피해가 조금씩 다르다. 총합 화력은 공용과 거의
   * 같게 맞춰 뒀다(1층이 여전히 쉬워야 하므로): 차이는 **어디를 때리느냐**에 있다.
   *   전사   전부 밀착 1칸 — 원거리가 없는 대신 한 대가 제일 아프다
   *   궁수   가로로 길다(앞뒤 1~2 / 2~3칸) — 대신 제일 약하다
   *   마법사 십자·X자·세로줄로 넓다 — 대신 기력이 제일 비싸다
   * 첫 장(`basics[0]`)은 **덱 고정 카드**(`decks.ts`의 `fixedCardsFor`), 세 장 모두가
   * **런 시작 덱**(`run.ts`의 `startingDeck`)에 들어간다. 몬스터는 공용 약공을 계속
   * 쓴다 — 직업 기본기는 플레이어 것이다.
   */
  basics: CardDef[]
  /** 고유(전용) 카드. 대부분 공격이지만 어떤 종류든 될 수 있다(예: 전사의 전용 가드 `war-wall`). */
  cards: CardDef[]
}

// --- range helpers ---------------------------------------------------------
// **앞뒤 대칭이 기본이다**(2026-08-03 전면 적용). 겹침·통과·넉백·돌진이 전부
// 허용되는 격자라 "상대를 지나쳐 버리는" 상황이 상시로 생기는데, 전방 전용 카드는
// 그때마다 통째로 빗나가서 맞히는 것 자체가 과제가 돼 있었다. 그래서 공격 카드는
//   뒤 1칸 · 내 칸(밀착) · 앞 1칸
// 을 기본 골격으로 삼고, 넓은 카드는 그 골격을 앞뒤로 데칼코마니처럼 늘린다.
// 대신 한쪽 사거리는 짧게 — 예: 앞 3칸 빔 대신 앞뒤 2칸씩.
//
// **전방 전용은 "정말 강한 것"에만 남긴다** — 한쪽만 노리는 대신 한 방이 크다는
// 교환이 성립할 때뿐이다(궁수의 저격 2장 + 런 전용 필살기 4장). 약한 카드를
// 전방 전용으로 두면 그냥 못 쓰는 카드가 된다.
const fwd = (n: number): Offset => ({ df: n, du: 0 })
/** A straight beam: forward cells a..b on the same row. */
const beam = (a: number, b: number): Offset[] => {
  const out: Offset[] = []
  for (let n = a; n <= b; n++) out.push(fwd(n))
  return out
}
/** 앞뒤 한 칸씩 (n=1) 또는 앞뒤 n칸째 셀 두 개. */
const both = (n: number): Offset[] => [fwd(n), fwd(-n)]
/** 앞뒤 대칭 직선: 같은 줄 양방향 a..b칸. */
const beamBoth = (a: number, b: number): Offset[] => {
  const out: Offset[] = []
  for (let n = a; n <= b; n++) out.push(fwd(n), fwd(-n))
  return out
}
/** A vertical bar (up/mid/down) at forward distance df — good vs other rows. */
const bar = (df: number): Offset[] => [
  { df, du: 1 },
  { df, du: 0 },
  { df, du: -1 },
]
/** 앞뒤 대칭 세로줄: 앞 n칸·뒤 n칸의 세로 3줄(6칸). 근접 광역의 기본형. */
const barBoth = (n: number): Offset[] => [...bar(n), ...bar(-n)]
/** The classic cross: the four cells orthogonally adjacent to the attacker. */
const CROSS: Offset[] = [
  { df: 1, du: 0 },
  { df: -1, du: 0 },
  { df: 0, du: 1 },
  { df: 0, du: -1 },
]
/** 앞뒤 대각선 네 갈래(X자) — 정면·바로 위아래는 사각. */
const FORK: Offset[] = [
  { df: 1, du: 1 },
  { df: 1, du: -1 },
  { df: -1, du: 1 },
  { df: -1, du: -1 },
]
/** 내 칸을 둘러싼 여덟 칸 전부(십자 + X자). 전사의 "붙어 있으면 맞는다"용. */
const RING: Offset[] = [...CROSS, ...FORK]

function atk(over: Partial<CardDef> & { id: string; name: string }): CardDef {
  return {
    kind: 'attack',
    desc: '',
    cooldown: 0, // attacks are limited by energy, not cooldown
    range: [fwd(1)],
    damage: 10,
    energyCost: 5,
    fx: 'punch',
    ...over,
  }
}

/**
 * 자기 강화 카드(2026-08-01). 수비 티어라 **같은 슬롯의 공격보다 먼저** 걸리므로,
 * 1번 슬롯에 버프 + 2·3번에 공격을 넣으면 그 라운드부터 바로 효과를 본다.
 * ⚠ 버프는 여러 라운드를 가는 대신 슬롯 하나를 통째로 쓴다 — 한 라운드 3장 제약이 곧
 * 비용이라, 지속·위력을 올릴 땐 반드시 `npm run sim:run -- --sweep`으로 확인할 것.
 */
function buff(
  over: Partial<CardDef> & { id: string; name: string; buff: BuffKind },
): CardDef {
  return {
    kind: 'buff',
    desc: '',
    cooldown: 2,
    buffRounds: 3,
    buffPower: 0,
    buffCost: 10,
    fx: 'shield',
    ...over,
  }
}

// ---------------------------------------------------------------------------
// 로스터 — 전사 / 궁수 / 마법사 3직업 (2026-08-01, 6종에서 개편)
//
// 6종은 성격이 서로 겹쳐 "무엇을 노리는 캐릭터인가"가 흐렸다. 3종으로 줄이되
// **각자 못 하는 것을 확실히** 준다 — 전사는 느리고, 궁수는 물렁하고, 마법사는
// 한 방이 약하다. 빌드는 유물이 완성한다(`game/relics.ts`).
//
//   전사  내구·회복·기절·넉백·반사   / 느린 기동, 원거리 없음
//   궁수  기동·한방·관통·독          / 낮은 체력, 밀착 사각
//   마법사 넓은 범위·화상·빙결·보호막 / 낮은 단일 화력, 비싼 기력
//
// ⚠ **id는 새로 팠다**(`warrior`/`archer`/`mage`). 옛 6종 id를 가리키는 저장 덱은
// 마이그레이션하지 않고 기본 덱으로 떨어뜨린다(사용자 결정, 2026-08-01).
// ---------------------------------------------------------------------------
export const ROSTER: CharacterDef[] = [
  {
    id: 'warrior',
    name: 'CAIRN',
    title: 'Oathbound Warden',
    accent: '#6d8ac4',
    accent2: '#a7b8d4',
    description:
      '무너진 성채에 홀로 남은 파수꾼. 느리지만 좀처럼 쓰러지지 않고, 대지를 가르는 강타로 상대의 숨통을 끊어 놓는다. 방벽을 올리고 버티다가 한 번에 갚아 주는 싸움을 한다.',
    maxHp: 103,
    maxEnergy: 50,
    startEnergy: 25,
    passive: { desc: '불침의 서약: 받는 공격 피해 -3, 매 라운드 체력 +2.', damageReduction: 3, regen: 2 },
    // 기본기 — 전부 밀착 1칸. 원거리가 아예 없는 대신 **한 대가 셋 중 제일 아프다**.
    basics: [
      atk({ id: 'war-hew', name: '거친 도끼질', range: both(1), damage: 7, energyCost: 5, fx: 'slash', desc: '앞뒤 한 칸을 도끼로 내리찍는다. 기본기 중 가장 아프지만 붙어야 한다.' }),
      atk({ id: 'war-ring', name: '발치 후리기', range: RING, damage: 5, energyCost: 6, fx: 'quake', desc: '몸을 둘러싼 여덟 칸을 통째로 후려친다. 어느 줄에서 붙든 맞는다.' }),
      atk({ id: 'war-shove', name: '어깨 밀치기', range: both(1), damage: 5, energyCost: 4, push: 1, fx: 'punch', desc: '앞뒤 한 칸을 어깨로 밀어 한 칸 떨어뜨린다. 값싼 정리용.' }),
    ],
    cards: [
      atk({ id: 'war-cleave', name: '파쇄 베기', range: both(1), damage: 13, energyCost: 5, fx: 'slash', desc: '앞뒤 한 칸을 후려치는 기본 근접. 싸고 묵직하다.' }),
      atk({ id: 'war-bash', name: '방패 밀치기', range: barBoth(1), damage: 14, energyCost: 13, push: 2, fx: 'punch', desc: '몸 앞뒤 세로 3줄을 방패로 후려쳐 두 칸 넉백. 들러붙는 상대를 떼어낸다.' }),
      atk({ id: 'war-quake', name: '대지 가르기', range: barBoth(1), damage: 14, energyCost: 12, stun: 1, cooldown: 2, fx: 'quake', desc: '몸 주변 앞뒤 세로 3줄을 쪼갠다. 피해를 입히면 이 라운드 동안 기절 — 남은 카드를 통째로 못 낸다. 쿨타임 2라운드.' }),
      {
        id: 'war-wall',
        name: '불침의 벽',
        kind: 'guard',
        block: 35,
        guardCost: 10,
        cooldown: 2,
        fx: 'shield',
        desc: '전용 방벽. 기력 10 소모, 이번 라운드 받는 피해를 최대 70 막는다. 쿨타임 2라운드.',
      },
      atk({ id: 'war-oath', name: '서약의 파쇄', range: [...barBoth(1), ...both(2)], damage: 23, energyCost: 24, push: 1, selfShield: 10, fx: 'quake', signature: true, accent: '#5b7ee0', desc: '시그니처. 앞뒤 세로 3줄 + 앞뒤 2칸째를 무너뜨리는 지진파 — 상대를 한 칸 밀고 보호막 +10.' }),
      // 전사는 원거리가 없어 **붙는 것 자체가 과제**다. 돌진으로 거리를 지우고,
      // 버프로 버티거나 한 번에 갚는 두 갈래를 준다.
      // ⚠ 두 칸이나 파고드는 카드라 **지나쳐 버리기 쉽다** — 사거리가 앞쪽뿐이면
      // 상대를 넘어선 순간 통째로 빗나간다. 지나간 줄을 앞뒤로 훑게 했다.
      atk({ id: 'war-charge', name: '방패 돌진', range: beamBoth(1, 2), damage: 15, energyCost: 13, push: 1, cooldown: 1, dashForward: 2, fx: 'rush', desc: '앞으로 두 칸 파고들며 지나간 줄을 앞뒤 두 칸씩 훑는다. 상대를 지나쳐도 등 뒤를 때린다 — 넉백 1칸, 쿨타임 1라운드.' }),
      atk({ id: 'war-grudge', name: '응보의 일격', range: both(1), damage: 10, energyCost: 9, selfShield: 15, fx: 'slash', desc: '앞뒤 한 칸을 치면서 몸을 사린다 — 사용 시 보호막 +15. 맞고 버티며 갚는 카드.' }),
      buff({ id: 'war-cry', name: '불굴의 함성', buff: 'defUp', buffPower: 5, buffRounds: 3, buffCost: 10, accent: '#8fb6d6', desc: '3라운드간 받는 공격 피해 -5. 버티는 구간을 통째로 사 온다 — 쿨타임 2라운드.' }),
      buff({ id: 'war-blood', name: '피의 맹세', buff: 'atkUp', buffPower: 7, buffRounds: 3, buffCost: 13, fx: 'quake', accent: '#c9713a', desc: '3라운드간 내 공격 피해 +7. 방벽을 올리고 버틴 뒤 한 번에 갚을 때.' }),
      // 지형 카드(2026-08-07) — 판의 모양을 **내가** 바꾸는 첫 플레이어 카드. 규칙·근거는
      // 아래 `mag-menhir` 옆 주석에 함께 적었다. 전사는 **바로 앞 한 칸**이라 밀착
      // 싸움에 그대로 얹힌다: 붙은 상대를 떼어내고 그 자리를 막아 다시 못 붙게 한다.
      atk({ id: 'war-menhir', name: '돌기둥 세우기', range: [fwd(1)], damage: 8, energyCost: 11, push: 1, stun: 1, cooldown: 2, pointBlank: false, raiseRocks: { hp: ROCK_HP, where: 'ahead', dist: 1 }, fx: 'quake', accent: '#c9b183', desc: `바닥을 갈라 바로 앞 한 칸에 돌기둥을 세운다(체력 ${ROCK_HP}). 그 칸에 상대가 서 있었다면 한 칸 밀려나며 피해를 입고 이 라운드 기절한다. 쿨타임 2라운드.` }),
    ],
  },
  {
    id: 'archer',
    name: 'SABLE',
    title: 'Ashen Fletcher',
    accent: '#5aa06d',
    accent2: '#3f9a90',
    description:
      '재를 뒤집어쓴 채 그림자에서 활을 겨누는 사냥꾼. 갑주가 얇아 붙으면 죽지만, 거리를 유지하는 한 독과 관통으로 확실히 갉아낸다. 밀어내며 물러서는 싸움이 본령.',
    maxHp: 81,
    maxEnergy: 50,
    startEnergy: 28,
    passive: { desc: '독니: 내 공격 피해 +3, 피해를 주면 중독 1라운드를 묻힌다.', attackBonus: 3, poisonOnHit: 1 },
    // 기본기 — 가로로 제일 길다(앞뒤 1~2 / 2~3칸). 대신 한 대가 제일 약하다.
    // 밀착 사각은 저격(`arc-mark`) 한 장에만 남긴다 — 기본기까지 사각이면 붙인 상대에게
    // 아무것도 못 하고 1층에서 막힌다(2026-08-01 궁수 구조 문제와 같은 함정).
    basics: [
      atk({ id: 'arc-nock', name: '짧은 화살', range: beamBoth(1, 2), damage: 5, energyCost: 5, fx: 'bolt', desc: '앞뒤 1~2칸을 훑는 기본 사격. 붙은 상대도 맞힌다.' }),
      atk({ id: 'arc-mark', name: '먼 겨냥', range: beamBoth(2, 3), damage: 6, energyCost: 6, pointBlank: false, fx: 'bolt', desc: '앞뒤 2~3칸째를 노리는 견제 사격. 거리를 벌어 둔 만큼 아프다 — 밀착 사각.' }),
      atk({ id: 'arc-knife', name: '단검 긋기', range: both(1), damage: 6, energyCost: 4, fx: 'slash', desc: '앞뒤 한 칸을 단검으로 긋는다. 붙잡혔을 때의 최후 수단.' }),
    ],
    cards: [
      atk({ id: 'arc-shot', name: '잿빛 화살', range: [...beamBoth(1, 2), ...FORK], damage: 12, energyCost: 8, fx: 'bolt', desc: '앞뒤 1~2칸 + 앞뒤 대각 네 칸을 노리는 기본 사격. 한 줄 어긋난 상대도 대각으로 잡는다. 겹쳐 선 상대도 맞힌다.' }),
      atk({ id: 'arc-venom', name: '독니 화살', range: beam(2, 4), damage: 11, energyCost: 10, poison: 2, pointBlank: false, fx: 'bolt', desc: '앞 2~4칸 저격. 피해를 입히면 중독 2라운드 — 중독은 움직일 때마다 갉으므로 거리를 벌리려는 상대에게 값을 물린다. 밀착 사각.' }),
      atk({ id: 'arc-pin', name: '말뚝 화살', range: beamBoth(1, 2), damage: 14, energyCost: 16, pierce: true, push: 1, fx: 'bolt', desc: '앞뒤 1~2칸을 꿰뚫는 한 방. 보호막을 무시하고, 맞은 상대를 한 칸 밀어낸다.' }),
      atk({ id: 'arc-rain', name: '독의 비', range: [...bar(1), ...bar(2)], damage: 20, energyCost: 23, poison: 3, fog: 2, pointBlank: false, fx: 'orb', signature: true, accent: '#3cbf7a', desc: '시그니처. 앞 1~2칸 × 세 줄에 독화살을 퍼붓는다 — 중독 3라운드 + 맞은 자리에 독안개 2라운드. 서 있으면 안개가 갉고 비키면 중독이 갉는다. 밀착 사각.' }),
      // ⚠ 궁수의 구조적 약점: 카드 대부분이 밀착 사각인데 몬스터가 접근한다.
      // 아래 두 장이 그 해법이다 — 물러나며 쏘고(카이팅), 붙은 적을 얼려 떼어낸다.
      atk({ id: 'arc-kite', name: '물러서며 쏘기', range: [...beamBoth(1, 2), ...FORK], damage: 11, energyCost: 10, dashForward: -1, fx: 'bolt', desc: '뒤로 한 칸 물러난 뒤에 앞뒤 1~2칸 + 앞뒤 대각 네 칸에 흩뿌린다. 빠지면서 어긋난 줄을 대각으로 쓸어 맞힌다 — 공격 페이즈에 움직이므로 상대가 붙은 다음에 빠진다.' }),
      atk({ id: 'arc-snare', name: '가시 올가미', range: barBoth(1), damage: 8, energyCost: 12, bind: 1, push: 1, cooldown: 2, fx: 'orb', desc: '앞뒤 한 칸 × 세 줄에 올가미를 깐다. 상대를 한 칸 밀고 이 라운드 동안 속박(이동 카드 무효 — 공격·수비는 그대로 나간다) — 쿨타임 2라운드.' }),
      buff({ id: 'arc-focus', name: '사냥꾼의 집중', buff: 'atkUp', buffPower: 6, buffRounds: 3, buffCost: 11, fx: 'bolt', accent: '#3cbf7a', desc: '3라운드간 내 공격 피해 +6. 거리를 벌어 둔 라운드에 깔아 두는 카드.' }),
      buff({ id: 'arc-veil', name: '잿빛 장막', buff: 'defUp', buffPower: 4, buffRounds: 3, buffCost: 10, accent: '#5aa06d', desc: '3라운드간 받는 공격 피해 -4. 갑주가 얇은 궁수가 붙잡혔을 때 버는 시간.' }),
    ],
  },
  {
    id: 'mage',
    name: 'DIRGE',
    title: 'Hollow Oracle',
    accent: '#a578cf',
    accent2: '#6fc0b0',
    description:
      '만가를 읊는 원령 무녀. 한 방은 가볍지만 판을 통째로 덮는 주문으로 도망칠 자리를 지운다. 태우고 얼려 놓은 뒤 천천히 조여드는 싸움을 한다.',
    maxHp: 78,
    maxEnergy: 50,
    startEnergy: 30,
    passive: { desc: '혼백의 등불: 매 라운드 기력 +6, 보호막 +4.', turnEnergy: 6, turnShield: 4 },
    // 기본기 — 십자·X자·세로줄로 **제일 넓다**. 대신 한 대가 가볍고 기력이 비싸다
    // (매 라운드 기력 +12 패시브가 그 비용을 감당하는 자리다).
    basics: [
      atk({ id: 'mag-ember', name: '불티', range: CROSS, damage: 6, energyCost: 6, fx: 'flame', desc: '상·하·좌·우 네 칸에 불티를 튀긴다. 줄이 어긋난 상대도 잡는다.' }),
      atk({ id: 'mag-shard', name: '서리 조각', range: FORK, damage: 5, energyCost: 5, fx: 'orb', desc: '앞뒤 대각 네 칸에 서릿발을 세운다. 정면·바로 위아래는 사각.' }),
      atk({ id: 'mag-touch', name: '망령의 손길', range: barBoth(1), damage: 5, energyCost: 7, fx: 'orb', desc: '앞뒤 세로 3줄 여섯 칸을 훑는 망령의 손. 기본기 중 가장 넓고 가장 비싸다.' }),
    ],
    cards: [
      atk({ id: 'mag-spark', name: '혼불', range: CROSS, damage: 9, energyCost: 7, burn: 1, fx: 'flame', desc: '상·하·좌·우 네 칸에 도깨비불을 흩뿌린다. 피해를 입히면 화상 1라운드 — 화상 중에는 맞을 때마다 5씩 더 아프다.' }),
      atk({ id: 'mag-frost', name: '서리 결계', range: barBoth(1), damage: 9, energyCost: 14, freeze: 1, selfShield: 5, fx: 'orb', desc: '앞뒤 한 칸의 세 줄을 얼린다. 피해를 입히면 이 라운드 동안 빙결 — 남은 카드를 못 낸다. 단, 때리면 깨진다(그 타격에 +5). 사용 시 보호막 +5.' }),
      atk({ id: 'mag-flame', name: '화염 폭풍', range: [...barBoth(1), ...both(2)], damage: 13, energyCost: 18, burn: 2, fx: 'flame', desc: '앞뒤 한 칸 × 세 줄 + 앞뒤 2칸째를 태우는 광역 화염. 피해를 입히면 화상 2라운드.' }),
      atk({ id: 'mag-doom', name: '종언의 만가', range: [...barBoth(1), ...barBoth(2)], damage: 22, energyCost: 25, burn: 3, freeze: 1, fx: 'orb', signature: true, accent: '#d45fae', desc: '시그니처. 앞뒤 1~2칸의 세 줄을 통째로 덮는 만가 — 화상 3라운드 + 이 라운드 빙결.' }),
      // 마법사의 제약은 기력이다. 무아지경이 그 제약을 2라운드간 통째로 없앤다 —
      // 선불이 비싸고 쿨이 길지만, 켜진 동안 종언의 만가를 계속 쏠 수 있다.
      buff({ id: 'mag-trance', name: '무아지경', buff: 'freeCast', buffRounds: 2, buffCost: 20, cooldown: 3, fx: 'flame', accent: '#d45fae', desc: '2라운드간 모든 카드의 기력 소모가 0이 된다. 켜진 동안 가장 비싼 주문을 매 턴 퍼부을 수 있다 — 쿨타임 3라운드.' }),
      buff({ id: 'mag-ward', name: '혼백의 장막', buff: 'defUp', buffPower: 5, buffRounds: 3, buffCost: 12, accent: '#6fc0b0', desc: '3라운드간 받는 공격 피해 -5. 큰 주문을 모으는 동안 몸을 지킨다.' }),
      atk({ id: 'mag-blink', name: '그림자 도약', range: CROSS, damage: 10, energyCost: 11, burn: 1, dashForward: -2, fx: 'flame', desc: '뒤로 두 칸 물러난 뒤에 상·하·좌·우를 태운다 — 화상 1라운드. 포위를 빠져나오는 카드.' }),
      atk({ id: 'mag-hex', name: '속박의 저주', range: barBoth(1), damage: 11, energyCost: 14, bind: 1, pull: 1, cooldown: 2, fx: 'orb', desc: '앞뒤 세로 3줄을 저주해 상대를 한 칸 끌어당기고 이 라운드 동안 속박한다. 잡아 온 자리에 묶어 두는 카드 — 쿨타임 2라운드.' }),
      // ---- 지형 카드(2026-08-07) ------------------------------------------------
      // 판의 모양을 **내가** 바꾸는 첫 플레이어 카드. 그전까지 바위는 무대가 주는
      // 것이라 플레이어에겐 순수한 방해물이었다.
      //
      // ⚠ **앞뒤 대칭 원칙의 예외 둘 중 하나다.** 뒤에도 바위를 세우면 내 등 뒤를
      //   내가 막아 도망칠 곳이 사라진다 — 이 카드는 방향이 곧 뜻이라 대칭이 성립하지
      //   않는다(전방 전용을 "정말 강한 것"에만 남긴다는 규칙의 진짜 예외).
      // ⚠ **바위 위에 사람이 서 있는 상태는 만들 수 없다.** 그래서 그 칸에 상대가
      //   있으면 넉백 1 + 피해 + 기절로 **먼저 밀어낸다**. 밀어내지 못하면(벽·바위)
      //   엔진의 처박기가 피해와 기절을 대신 주고 바위는 안 선다 — `raiseRocks`가
      //   파이터가 선 칸을 건너뛰기 때문이고, 그게 곧 규칙이다.
      // ⚠ 마법사는 **두 칸 앞**이라 붙기 전에 길을 끊는다. 전사의 한 칸(`war-menhir`)이
      //   "떼어내고 막는다"라면 이쪽은 "오지 못하게 한다"다 — 낮은 단일 화력을
      //   거리로 메우는 직업 정체성과 같은 방향이다.
      atk({ id: 'mag-menhir', name: '석순 소환', range: [fwd(2)], damage: 7, energyCost: 13, push: 1, stun: 1, cooldown: 2, pointBlank: false, raiseRocks: { hp: ROCK_HP, where: 'ahead', dist: 2 }, fx: 'orb', accent: '#c9b183', desc: `두 칸 앞 바닥에서 석순을 끌어올린다(체력 ${ROCK_HP}). 그 칸에 상대가 서 있었다면 한 칸 밀려나며 피해를 입고 이 라운드 기절한다. 쿨타임 2라운드.` }),
    ],
  },
]

// 기본기는 **정확히 3장**이어야 한다 — 시작 덱 9장(`run.ts`)과 고정 카드 7장
// (`decks.ts`)이 그 수를 전제로 짜여 있다. 카드 id 중복도 여기서 바로 터뜨린다
// (같은 id가 둘이면 `find`가 앞의 것만 집어 조용히 엉뚱한 카드가 나간다).
for (const c of ROSTER) {
  if (c.basics.length !== 3)
    throw new Error(`${c.id}의 기본기는 3장이어야 한다 (현재 ${c.basics.length})`)
}
{
  const ids = ROSTER.flatMap((c) => [...c.basics, ...c.cards]).map((c) => c.id)
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dup.length) throw new Error(`카드 id 중복: ${[...new Set(dup)].join(', ')}`)
}

export const ROSTER_BY_ID: Record<string, CharacterDef> = Object.fromEntries(
  ROSTER.map((c) => [c.id, c]),
)

export function getChar(id: string): CharacterDef {
  const c = ROSTER_BY_ID[id]
  if (!c) throw new Error(`Unknown character: ${id}`)
  return c
}
