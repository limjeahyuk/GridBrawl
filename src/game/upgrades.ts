// ---------------------------------------------------------------------------
// 카드 강화 — 룰렛(2026-11 리디자인 · 규칙 `docs/redesign/CARD_UPGRADE.md`)
//
// 옛 "같은 카드를 또 얻으면 강화"(2026-08-08)는 **없앴다**(사용자 결정). 강화는 이제
// 모닥불(휴식 칸)·상점·대장장이 이벤트의 룰렛 하나뿐이다.
//
//   ① 수치 룰렛 0/+5/+10/+15/+20 — 공격=피해 · 가드=방어 · 회복=회복량 · 기력=+기력
//   ② 범위 룰렛 0~5 — 공격 카드만. 걸린 수만큼 **붙은 칸을 직접 고른다**
//   ③ 카드당 최대 2번(`MAX_UPGRADE`). **꽝(0)은 횟수에 안 센다**
//   ④ 이동 카드는 강화하지 않는다
//
// ⚠ **런 전용이다.** 여기서 만든 CardDef는 `run.ts`/`runbattle.ts`를 거쳐서만 엔진에
// 들어간다. PvP 카드 풀은 원본 그대로라 `RULES_VERSION`과 무관하다.
// ---------------------------------------------------------------------------
import type { CardDef, Offset } from '../battle/types'

export const MAX_UPGRADE = 2

/** 카드 한 장의 강화 기록. `RunState.upgrades[cardId]`. */
export interface CardUpgrade {
  valueBonus: number
  extraCells: Offset[]
  times: number
}

/** 룰렛 판 — [값, %]. 확률 합 100. */
export const ROULETTE_VALUE = [[0, 10], [5, 25], [10, 30], [15, 25], [20, 10]] as const
export const ROULETTE_RANGE = [[0, 10], [1, 20], [2, 20], [3, 20], [4, 20], [5, 10]] as const
export type RouletteTable = readonly (readonly [number, number])[]

/** 가중 추첨. 그림(칸 배치)은 이 결과에 맞춰 돌리므로 확률과 그림이 항상 맞는다. */
export function spinRoulette(table: RouletteTable, rng: () => number = Math.random): number {
  let r = rng() * 100
  for (const [v, p] of table) {
    if (r < p) return v
    r -= p
  }
  return table[table.length - 1][0]
}

/** 수치 강화가 오르는 필드. 없으면 수치 강화 불가. */
type ValueField = 'damage' | 'block' | 'healHp' | 'gain'
export function valueFieldOf(c: CardDef): ValueField | null {
  if (c.kind === 'attack') return 'damage'
  if (c.kind === 'guard') return 'block'
  if (c.kind === 'heal') return 'healHp'
  if (c.kind === 'energy') return 'gain'
  return null
}
/** 화면 표기 — 버튼 이름과 칩. */
export const VALUE_LABEL: Record<ValueField, { name: string; word: string; tag: string; en: string }> = {
  damage: { name: '공격력', word: '피해', tag: 'DM', en: 'DAMAGE' },
  block: { name: '방어량', word: '방어량', tag: 'BLOCK', en: 'GUARD' },
  healHp: { name: '회복량', word: '회복량', tag: 'HP+', en: 'HEAL' },
  gain: { name: '기력량', word: '기력', tag: 'EN+', en: 'ENERGY' },
}

export const canUpgradeValue = (c: CardDef): boolean => valueFieldOf(c) !== null
export const canUpgradeRange = (c: CardDef): boolean => c.kind === 'attack' && !!c.range?.length

/** 이 카드를 한 번 더 강화할 수 있는가(덱에 있든 없든). 이유도 같이. */
export function upgradeBlock(c: CardDef, up?: CardUpgrade): string | null {
  if (c.kind === 'move') return '강화 불가 — 이동 카드'
  if ((up?.times ?? 0) >= MAX_UPGRADE) return `최대 강화 ${MAX_UPGRADE}/${MAX_UPGRADE}`
  if (!canUpgradeValue(c) && !canUpgradeRange(c)) return '강화 불가 — 올릴 수치가 없다'
  return null
}

const key = (o: Offset) => `${o.df},${o.du}`

/**
 * 범위 고르기 — 지금 범위 · 나(0,0) · 이미 고른 칸에 8방향으로 붙은 빈 칸.
 * 편집 칸은 df −4…4, du −2…2(판이 6×4라 그 밖은 닿지 않는다).
 */
export function canPickCell(range: Offset[], picks: Offset[], c: Offset): boolean {
  if (Math.abs(c.df) > 4 || Math.abs(c.du) > 2) return false
  const all = [...range, ...picks]
  if ((c.df === 0 && c.du === 0) || all.some((o) => key(o) === key(c))) return false
  return [...all, { df: 0, du: 0 }].some((o) => Math.abs(o.df - c.df) <= 1 && Math.abs(o.du - c.du) <= 1)
}

/**
 * 강화를 적용한 카드. 기록이 없으면 **원본을 그대로**(참조까지 같다).
 * ⚠ 원본을 변형하지 않는다 — 원본 상수는 PvP가 같이 쓴다.
 */
export function upgradedCard(base: CardDef, up?: CardUpgrade): CardDef {
  if (!up || up.times <= 0) return base
  const c: CardDef = { ...base }
  const notes: string[] = []
  const f = valueFieldOf(base)
  if (f && up.valueBonus) {
    c[f] = (base[f] ?? 0) + up.valueBonus
    notes.push(`${VALUE_LABEL[f].word} +${up.valueBonus}`)
  }
  if (up.extraCells.length && base.range) {
    c.range = [...base.range, ...up.extraCells]
    notes.push(`범위 +${up.extraCells.length}칸`)
  }
  c.name = `${base.name}+${up.times}`
  c.upgraded = up.times
  c.upgradeNote = notes.join(' · ')
  return c
}

/** 룰렛 결과를 기록에 더한다. 0(꽝)은 아무것도 안 바뀌고 횟수도 안 센다. */
export function addUpgrade(
  up: CardUpgrade | undefined,
  gain: { value?: number; cells?: Offset[] },
): CardUpgrade | undefined {
  const value = gain.value ?? 0
  const cells = gain.cells ?? []
  if (!value && !cells.length) return up
  const cur = up ?? { valueBonus: 0, extraCells: [], times: 0 }
  return {
    valueBonus: cur.valueBonus + value,
    extraCells: [...cur.extraCells, ...cells],
    times: Math.min(MAX_UPGRADE, cur.times + 1),
  }
}
