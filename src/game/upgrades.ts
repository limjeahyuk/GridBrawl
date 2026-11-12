// ---------------------------------------------------------------------------
// 카드 강화 — 룰렛(2026-11 리디자인 · 규칙 `docs/redesign/CARD_UPGRADE.md`)
//
// 옛 "같은 카드를 또 얻으면 강화"(2026-08-08)는 **없앴다**(사용자 결정). 강화는 이제
// 대장간(지도 칸 · ? 칸)·낡은 대장간(이벤트)의 룰렛 하나뿐이다.
//
//   룰렛 판은 둘(2026-11-12 사용자 지정) — **맡긴 강화**(`paid` · 대장간 80골드 · 낡은 대장간)는
//   반드시 오르고, **직접 강화**(`free` · 대장간 무료)는 0이나 마이너스도 나온다(`ROULETTES`).
//   ① 수치 — 공격=피해 · 가드=방어 · 회복=회복량 · 기력=+기력. 0 아래로는 안 내려간다
//   ② 범위 — 공격 카드만. 플러스면 **붙은 칸을 직접 고르고**, 마이너스면 **뺄 칸을 직접 고른다**(최소 1칸은 남는다)
//   ③ 카드당 최대 3번(`MAX_UPGRADE`, 별 ★로 표시). **0 · 마이너스도 한 번으로 센다**
//   ④ 이동 카드는 강화하지 않는다
//
// ⚠ **런 전용이다.** 여기서 만든 CardDef는 `run.ts`/`runbattle.ts`를 거쳐서만 엔진에
// 들어간다. PvP 카드 풀은 원본 그대로라 `RULES_VERSION`과 무관하다.
// ---------------------------------------------------------------------------
import type { CardDef, Offset } from '../battle/types'

/** 카드당 최대 강화 횟수(2026-11-12 2 → 3, 사용자 — 2로 되돌릴 수도 있다). */
export const MAX_UPGRADE = 3

/** 카드 한 장의 강화 기록. `RunState.upgrades[cardId]`. */
export interface CardUpgrade {
  /** 수치 합(마이너스 가능). 카드 값이 0 아래로 내려가지 않게 `addUpgrade`가 바닥을 받는다. */
  valueBonus: number
  extraCells: Offset[]
  /** 직접 강화의 마이너스 범위로 뺀 **원래 범위** 칸(2026-11-12). 옛 저장엔 없다. */
  removedCells?: Offset[]
  times: number
}

/** 룰렛 판 — [값, %]. 확률 합 100. */
export type RouletteTable = readonly (readonly [number, number])[]
/** `paid` = 맡긴 강화(대장간 80골드 · 낡은 대장간), `free` = 직접 강화(대장간 무료). */
export type UpgradeTier = 'paid' | 'free'
export const ROULETTES: Record<UpgradeTier, { value: RouletteTable; range: RouletteTable }> = {
  paid: {
    value: [[5, 15], [10, 25], [15, 30], [20, 20], [30, 10]],
    range: [[1, 25], [2, 25], [3, 20], [4, 20], [5, 10]],
  },
  free: {
    value: [[-10, 15], [-5, 20], [0, 40], [10, 15], [20, 10]],
    range: [[-2, 10], [-1, 15], [0, 50], [1, 15], [3, 10]],
  },
}

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

/** 이 카드를 한 번 더 강화할 수 있는가(덱에 있든 없든). 이유도 같이. `c`는 **원본** 카드. */
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
 * 이름은 그대로 두고 강화 횟수는 `upgraded`(별 ★)로 보인다 — 0 · 마이너스가 나와도 별은 붙는다.
 * ⚠ 원본을 변형하지 않는다 — 원본 상수는 PvP가 같이 쓴다.
 */
export function upgradedCard(base: CardDef, up?: CardUpgrade): CardDef {
  if (!up || up.times <= 0) return base
  const c: CardDef = { ...base }
  const notes: string[] = []
  const f = valueFieldOf(base)
  if (f && up.valueBonus) {
    c[f] = Math.max(0, (base[f] ?? 0) + up.valueBonus)
    notes.push(`${VALUE_LABEL[f].word} ${signed(up.valueBonus)}`)
  }
  const removed = up.removedCells ?? []
  if ((up.extraCells.length || removed.length) && base.range) {
    c.range = [...base.range.filter((o) => !removed.some((r) => key(r) === key(o))), ...up.extraCells]
    const net = c.range.length - base.range.length
    if (net) notes.push(`범위 ${signed(net)}칸`)
  }
  c.upgraded = up.times
  c.upgradeNote = notes.join(' · ') || undefined
  return c
}

/** 부호를 붙인 수 — 화면 표기용(+5 · −5 · 0). */
export const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

/**
 * 룰렛 결과를 기록에 더한다. **0 · 마이너스도 횟수를 센다**(2026-11-12 사용자 — 강화는 된 것).
 * `cells` = 붙일 칸, `removed` = 뺄 칸(지금 범위의 칸 — 붙였던 칸이면 그 칸을 지우고, 원래 칸이면 `removedCells`에).
 * `minBonus` = 수치 합의 바닥(−원래 값) — 0 아래로 깎인 몫이 빚으로 남지 않게 한다.
 */
export function addUpgrade(
  up: CardUpgrade | undefined,
  gain: { value?: number; cells?: Offset[]; removed?: Offset[] },
  minBonus = -Infinity,
): CardUpgrade {
  const cur = up ?? { valueBonus: 0, extraCells: [], times: 0 }
  let extra = [...cur.extraCells]
  let removed = [...(cur.removedCells ?? [])]
  for (const o of gain.cells ?? []) {
    if (removed.some((r) => key(r) === key(o))) removed = removed.filter((r) => key(r) !== key(o))
    else extra.push(o)
  }
  for (const o of gain.removed ?? []) {
    if (extra.some((r) => key(r) === key(o))) extra = extra.filter((r) => key(r) !== key(o))
    else removed.push(o)
  }
  return {
    valueBonus: Math.max(minBonus, cur.valueBonus + (gain.value ?? 0)),
    extraCells: extra,
    ...(removed.length ? { removedCells: removed } : {}),
    times: Math.min(MAX_UPGRADE, cur.times + 1),
  }
}
