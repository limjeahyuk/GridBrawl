import type { CardDef, Offset } from '../battle/types'

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
// recoil. Unique cards are mostly attacks but can be any kind (AEGIS has a
// unique guard).
//
// Range offsets are { df, du }: df = cells forward (+ toward opponent), du =
// rows upward (+ above). The engine mirrors df by the attacker's facing.
// ---------------------------------------------------------------------------

/**
 * A character's signature passive. Each field is an independent hook the engine
 * applies at a fixed moment (see `CardBattle.resolveTurn` / `computeAttack`):
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
  /** 매 턴 시작 시 체력 +N(최대치 cap). */
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
  /** 내 공격이 적중하면 상대를 N턴 기절시킨다(전투당 `stunCap`회까지). */
  stunOnHit?: number
  /** `stunOnHit`이 전투당 발동할 수 있는 횟수(합산). 없으면 1회. */
  stunCap?: number
  /** 첫 턴에 얻는 보호막(선공 방어형). */
  openingShield?: number
  // --- 상태이상 훅(2026-08-01) — 3직업 개편의 빌드 재료 ---
  /**
   * 내 공격이 피해를 입히면 독을 N(턴당 피해) 추가로 건다. 카드의 `poison`과 합산.
   * 궁수 "독으로 조이기" 빌드의 핵심 — 유물을 겹칠수록 위력이 쌓인다.
   */
  poisonOnHit?: number
  /** 내 공격이 피해를 입히면 화상을 N 추가로 건다(마법사 상태이상 빌드). */
  burnOnHit?: number
  /**
   * 내가 거는 지속피해(독·화상)의 위력 +N%. **거는 순간 한 번 계산해 박아 넣는다**
   * — 매 틱 다시 계산하면 유물을 도중에 얻었을 때 이미 걸린 것까지 소급돼 어긋난다.
   */
  statusPowerPct?: number
  /** 상대가 상태이상에 하나라도 걸려 있으면 내 공격 피해 +N(상태이상 시너지). */
  bonusVsAfflicted?: number
}

/** 누적 기력 소비 트리거 한 개. `per`만큼 쓸 때마다 아래 효과가 한 번씩 터진다. */
export interface EnergyTrigger {
  per: number
  /** 상대를 N턴 기절시킨다(카드를 못 냄). */
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
  /** 고유(전용) 카드. 대부분 공격이지만 어떤 종류든 될 수 있다(예: AEGIS의 전용 가드). */
  cards: CardDef[]
}

// --- range helpers ---------------------------------------------------------
// 교차(뛰어넘기) 플레이가 의도된 룰이라 대부분의 공격은 앞뒤를 함께 커버한다.
// 대신 한쪽 사거리는 짧게 — 예: 앞 3칸 빔 대신 앞뒤 2칸씩.
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

function atk(over: Partial<CardDef> & { id: string; name: string }): CardDef {
  return {
    kind: 'attack',
    desc: '',
    cooldown: 0, // attacks are limited by energy, not cooldown
    range: [fwd(1)],
    damage: 20,
    energyCost: 10,
    fx: 'punch',
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
    maxHp: 205,
    maxEnergy: 100,
    startEnergy: 50,
    passive: { desc: '불침의 서약: 받는 공격 피해 -6, 매 턴 체력 +4.', damageReduction: 6, regen: 4 },
    cards: [
      atk({ id: 'war-cleave', name: '파쇄 베기', range: both(1), damage: 26, energyCost: 10, fx: 'slash', desc: '앞뒤 한 칸을 후려치는 기본 근접. 싸고 묵직하다.' }),
      atk({ id: 'war-bash', name: '방패 밀치기', range: bar(1), damage: 28, energyCost: 22, push: 2, fx: 'punch', desc: '앞 한 칸의 세 줄을 방패로 밀어 두 칸 넉백. 들러붙는 상대를 떼어낸다.' }),
      atk({ id: 'war-quake', name: '대지 가르기', range: [...bar(1), ...bar(-1)], damage: 28, energyCost: 24, stun: 1, cooldown: 2, fx: 'quake', desc: '몸 주변 앞뒤 세로 3줄을 쪼갠다. 피해를 입히면 상대를 1턴 기절 — 쿨타임 2턴.' }),
      {
        id: 'war-wall',
        name: '불침의 벽',
        kind: 'guard',
        block: 70,
        guardCost: 20,
        cooldown: 2,
        fx: 'shield',
        desc: '전용 방벽. 기력 20 소모, 이번 턴 받는 피해를 최대 70 막는다. 쿨타임 2턴.',
      },
      atk({ id: 'war-oath', name: '서약의 파쇄', range: [...bar(1), ...bar(-1), fwd(2), fwd(-2)], damage: 46, energyCost: 48, push: 1, selfShield: 20, fx: 'quake', signature: true, accent: '#5b7ee0', desc: '시그니처. 앞뒤 세로 3줄 + 앞뒤 2칸째를 무너뜨리는 지진파 — 상대를 한 칸 밀고 보호막 +20.' }),
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
    maxHp: 162,
    maxEnergy: 100,
    startEnergy: 55,
    passive: { desc: '독니: 내 공격 피해 +6, 피해를 주면 독 3을 묻힌다.', attackBonus: 6, poisonOnHit: 3 },
    cards: [
      atk({ id: 'arc-shot', name: '잿빛 화살', range: beam(1, 3), damage: 24, energyCost: 14, pointBlank: false, fx: 'bolt', desc: '앞 1~3칸을 노리는 기본 사격. 싸지만 겹쳐 선 상대는 못 맞힌다.' }),
      atk({ id: 'arc-venom', name: '독니 화살', range: beam(2, 4), damage: 22, energyCost: 20, poison: 6, pointBlank: false, fx: 'bolt', desc: '앞 2~4칸 저격. 피해를 입히면 독 6(3턴) — 겹칠수록 위력이 쌓인다. 밀착 사각.' }),
      atk({ id: 'arc-pin', name: '말뚝 화살', range: beam(1, 3), damage: 28, energyCost: 32, pierce: true, push: 1, fx: 'bolt', desc: '앞 1~3칸을 꿰뚫는 한 방. 보호막을 무시하고, 맞은 상대를 한 칸 밀어낸다.' }),
      atk({ id: 'arc-rain', name: '독의 비', range: [...bar(1), ...bar(2)], damage: 40, energyCost: 45, poison: 8, pointBlank: false, fx: 'orb', signature: true, accent: '#3cbf7a', desc: '시그니처. 앞 1~2칸 × 세 줄에 독화살을 퍼붓는다 — 독 8(3턴). 밀착 사각.' }),
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
    maxHp: 155,
    maxEnergy: 100,
    startEnergy: 60,
    passive: { desc: '혼백의 등불: 매 턴 기력 +12, 보호막 +7.', turnEnergy: 12, turnShield: 7 },
    cards: [
      atk({ id: 'mag-spark', name: '혼불', range: CROSS, damage: 18, energyCost: 14, burn: 4, fx: 'flame', desc: '상·하·좌·우 네 칸에 도깨비불을 흩뿌린다. 피해를 입히면 화상 4(2턴).' }),
      atk({ id: 'mag-frost', name: '서리 결계', range: bar(1), damage: 18, energyCost: 24, freeze: 1, selfShield: 10, fx: 'orb', desc: '앞 한 칸의 세 줄을 얼린다. 피해를 입히면 상대를 1턴 빙결(이동 불가) — 사용 시 보호막 +10.' }),
      atk({ id: 'mag-flame', name: '화염 폭풍', range: [...bar(1), ...bar(2)], damage: 26, energyCost: 36, burn: 6, fx: 'flame', desc: '앞 두 칸 × 세 줄을 태우는 광역 화염. 피해를 입히면 화상 6(2턴).' }),
      atk({ id: 'mag-doom', name: '종언의 만가', range: [...bar(1), ...bar(2), ...bar(-1)], damage: 44, energyCost: 50, burn: 8, freeze: 1, fx: 'orb', signature: true, accent: '#d45fae', desc: '시그니처. 앞 두 칸 + 등 뒤 한 칸의 세 줄을 통째로 덮는 만가 — 화상 8 + 1턴 빙결.' }),
    ],
  },
]

export const ROSTER_BY_ID: Record<string, CharacterDef> = Object.fromEntries(
  ROSTER.map((c) => [c.id, c]),
)

export function getChar(id: string): CharacterDef {
  const c = ROSTER_BY_ID[id]
  if (!c) throw new Error(`Unknown character: ${id}`)
  return c
}
