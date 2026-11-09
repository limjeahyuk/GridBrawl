// ---------------------------------------------------------------------------
// 카드 강화 — 룰렛 (2026-11 리디자인 · 기획 docs/redesign/CARD_UPGRADE.md)
//
// 예전(2026-08-08)엔 "같은 카드를 또 얻으면 강화"였다. **그 길은 없앴다**(사용자 결정).
// 강화는 이제 **모닥불(휴식 칸) · 상점 강화 칸 · 대장장이 이벤트**의 룰렛 하나뿐이다.
//
//   ① 카드를 고른다 — **이동 카드만 안 된다**. 공격·가드·회복·기력·버프는 된다.
//   ② 종류를 고른다 — **수치**(주 수치 +0/5/10/15/20) 또는 **범위**(공격만, 붙은 칸 0~5개).
//   ③ 룰렛이 돈다 — 결과를 **먼저 가중 추첨**하고 그 숫자 칸에 바늘을 세운다.
//   ④ 0은 꽝 — **횟수에 안 센다**(카드가 안 바뀌었으니까). 그 강화 기회만 사라진다.
//   ⑤ 카드 한 장당 **최대 2번**(`MAX_UPGRADE`). 이름 뒤 `+1`·`+2`.
//
// ⚠ **런 전용이다.** 여기서 만든 CardDef는 `run.ts`/`runbattle.ts`를 거쳐서만 엔진에
//   들어간다. PvP·봇전의 원본 카드(`cards.ts`·`roster.ts`)는 그대로라 `RULES_VERSION`과
//   무관하다. `npm run check`가 "원본 상수 무오염"을 지킨다.
// ---------------------------------------------------------------------------
import type { CardDef, Offset } from '../battle/types'

/** 카드 한 장당 강화 상한(사용자 결정). 꽝은 세지 않는다. */
export const MAX_UPGRADE = 2

/** 룰렛 판 — [값, 확률%]. 값은 사용자 지정, 확률은 시안에서 정한 것(가운데가 두껍다). */
export const ROULETTE_VALUE = [[0, 10], [5, 25], [10, 30], [15, 25], [20, 10]] as const
export const ROULETTE_RANGE = [[0, 10], [1, 20], [2, 20], [3, 20], [4, 20], [5, 10]] as const
export type RouletteTable = readonly (readonly [number, number])[]

/** 판 하나를 이루는 칸 수. 확률%를 60칸으로 옮기면 10% = 6칸이다. */
export const ROULETTE_SLOTS = 60

/** 카드별 강화 기록. `RunState.upgrades[cardId]`. */
export interface CardUpgrade {
  /** 주 수치(피해·방어량·회복량…)에 더할 값. */
  valueBonus: number
  /** 범위에 덧붙인 칸(df·du). */
  extraCells: Offset[]
  /** 강화된 횟수(꽝 제외, 최대 `MAX_UPGRADE`). */
  times: number
}

export type UpgradeMode = 'value' | 'range'

/** 카드 종류별 "주 수치" — 수치 룰렛이 올리는 값과 화면 표기. */
export interface ValueField {
  field: 'damage' | 'block' | 'healHp' | 'gain' | 'buffPower'
  /** 버튼 이름(공격력 / 방어량 / 회복량 …). */
  label: string
  /** 카드 위 짧은 표기(DM / BLOCK / HP+ …). */
  short: string
}

export function valueFieldOf(card: CardDef): ValueField | null {
  switch (card.kind) {
    case 'attack':
      return card.damage ? { field: 'damage', label: '공격력', short: 'DM' } : null
    case 'guard':
      return card.block ? { field: 'block', label: '방어량', short: 'BLOCK' } : null
    case 'heal':
      return card.healHp ? { field: 'healHp', label: '회복량', short: 'HP+' } : null
    case 'energy':
      return card.gain ? { field: 'gain', label: '기력량', short: 'EN+' } : null
    case 'buff':
      return card.buffPower ? { field: 'buffPower', label: '위력', short: 'PW' } : null
    default:
      return null
  }
}

/** 범위 강화가 되는 카드 — 범위가 있는 공격뿐이다. */
export const canWidenRange = (card: CardDef): boolean => card.kind === 'attack' && !!card.range?.length

/** 이 카드를 지금 강화할 수 있는가(이동이 아니고, 올릴 게 있고, 2번을 다 안 썼다). */
export function isUpgradable(card: CardDef, rec?: CardUpgrade): boolean {
  if (card.kind === 'move') return false
  if ((rec?.times ?? 0) >= MAX_UPGRADE) return false
  return !!valueFieldOf(card) || canWidenRange(card)
}

/** 못 고르는 이유(고르기 화면의 잠금 문구). 고를 수 있으면 null. */
export function upgradeBlockReason(card: CardDef, rec?: CardUpgrade): string | null {
  if (card.kind === 'move') return '강화 불가 — 이동 카드'
  if ((rec?.times ?? 0) >= MAX_UPGRADE) return `최대 ${MAX_UPGRADE}/${MAX_UPGRADE}`
  if (!valueFieldOf(card) && !canWidenRange(card)) return '강화 불가 — 올릴 값이 없다'
  return null
}

/**
 * 룰렛 결과 — **가중 추첨이 먼저**고 그림은 그걸 따라간다(그래서 그림과 확률이 늘 맞는다).
 */
export function rollRoulette(table: RouletteTable, rng: () => number = Math.random): number {
  const total = table.reduce((s, [, p]) => s + p, 0)
  let r = rng() * total
  for (const [v, p] of table) {
    if ((r -= p) < 0) return v
  }
  return table[table.length - 1][0]
}

/**
 * 판의 60칸 배치 — 숫자마다 원 둘레에 등간격으로 흩뿌린 뒤, 같은 숫자가 붙은 자리를
 * 바꿔 없앤다(시안 코드 `seq`). 결정적이라 같은 판은 늘 같은 그림이다.
 */
export function rouletteSlots(table: RouletteTable): number[] {
  const slots: (number | null)[] = Array(ROULETTE_SLOTS).fill(null)
  const order = table
    .map(([v, p]) => ({ v, n: Math.round((p / 100) * ROULETTE_SLOTS) }))
    .sort((a, b) => b.n - a.n)
  for (const { v, n } of order) {
    for (let k = 0; k < n; k++) {
      let at = Math.floor((k * ROULETTE_SLOTS) / n)
      while (slots[at % ROULETTE_SLOTS] !== null) at++
      slots[at % ROULETTE_SLOTS] = v
    }
  }
  const out = slots.map((s) => s ?? table[0][0])
  // 이웃이 같은 숫자면 뒤쪽에서 다른 숫자와 자리를 바꾼다.
  for (let i = 0; i < out.length; i++) {
    const j = (i + 1) % out.length
    if (out[i] !== out[j]) continue
    for (let k = 2; k < out.length; k++) {
      const m = (i + k) % out.length
      const prev = out[(m - 1 + out.length) % out.length]
      const next = out[(m + 1) % out.length]
      if (out[m] !== out[j] && prev !== out[j] && next !== out[j] && out[(j + 1) % out.length] !== out[m] && out[i] !== out[m]) {
        ;[out[j], out[m]] = [out[m], out[j]]
        break
      }
    }
  }
  return out
}

// --- 범위 고르기 ------------------------------------------------------------
/** 편집 칸 — df −4…4, du −2…2. 판이 6×4라 그 밖은 닿을 일이 없다. */
export const EDIT_DF = 4
export const EDIT_DU = 2

const same = (a: Offset, b: Offset) => a.df === b.df && a.du === b.du

/**
 * 고를 수 있는 칸 — **지금 범위 · 나(0,0) · 이미 고른 칸에 8방향으로 붙은 빈 칸**.
 * 고를수록 다음 칸이 열린다(시안 코드와 같다).
 */
export function canPickCell(range: readonly Offset[], picks: readonly Offset[], c: Offset): boolean {
  if (Math.abs(c.df) > EDIT_DF || Math.abs(c.du) > EDIT_DU) return false
  const all = [...range, ...picks]
  if ((c.df === 0 && c.du === 0) || all.some((o) => same(o, c))) return false
  return [...all, { df: 0, du: 0 }].some((o) => Math.abs(o.df - c.df) <= 1 && Math.abs(o.du - c.du) <= 1)
}

/**
 * 한 번 누를 때 찍히는 칸 — 대칭이 켜져 있으면 `(df,du)`와 `(−df,du)` 둘(남은 칸이
 * 1개거나 df가 0이면 하나). 대칭 짝이 못 고르는 칸이면 그 칸만 찍는다.
 */
export function cellsForTap(
  range: readonly Offset[],
  picks: readonly Offset[],
  c: Offset,
  mirror: boolean,
  left: number,
): Offset[] {
  if (left <= 0 || !canPickCell(range, picks, c)) return []
  const out = [c]
  const twin = { df: -c.df, du: c.du }
  if (mirror && left >= 2 && c.df !== 0 && canPickCell(range, [...picks, c], twin)) out.push(twin)
  return out
}

// --- 적용 -------------------------------------------------------------------
/**
 * 강화 기록에 이번 결과를 얹는다. **꽝(0칸·+0)은 횟수에 안 센다.**
 */
export function addUpgrade(
  rec: CardUpgrade | undefined,
  step: { value?: number; cells?: readonly Offset[] },
): CardUpgrade {
  const base: CardUpgrade = rec ?? { valueBonus: 0, extraCells: [], times: 0 }
  const value = step.value ?? 0
  const cells = step.cells ?? []
  if (value <= 0 && !cells.length) return base
  return {
    valueBonus: base.valueBonus + Math.max(0, value),
    extraCells: [...base.extraCells, ...cells],
    times: Math.min(MAX_UPGRADE, base.times + 1),
  }
}

/**
 * 강화가 반영된 **사본**. 기록이 없으면 원본을 그대로 돌려준다(객체가 안 는다).
 * ⚠ 원본을 절대 고치지 않는다 — PvP 카드 풀이 같은 객체를 쓴다.
 */
export function upgradedCard(base: CardDef, rec?: CardUpgrade): CardDef {
  if (!rec || rec.times <= 0) return base
  const out: CardDef = { ...base }
  const notes: string[] = []
  const vf = valueFieldOf(base)
  if (vf && rec.valueBonus > 0) {
    out[vf.field] = (base[vf.field] ?? 0) + rec.valueBonus
    notes.push(`${vf.label} +${rec.valueBonus}`)
  }
  if (rec.extraCells.length && base.range) {
    out.range = [...base.range, ...rec.extraCells]
    notes.push(`범위 +${rec.extraCells.length}칸`)
  }
  out.name = `${base.name}+${rec.times}`
  out.upgraded = rec.times
  out.upgradeNote = notes.join(' · ')
  return out
}
