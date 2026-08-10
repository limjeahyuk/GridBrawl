// ---------------------------------------------------------------------------
// 카드 강화 (2026-08-08) — **같은 카드를 또 얻으면 그 카드가 강해진다.**
//
// 왜 필요했나: 덱은 카드 id 목록이고 쿨타임·"같은 공격은 한 턴에 한 번"이 전부 id로
// 판정된다. 그래서 **중복 카드는 지금까지 완전히 낭비**였다 — 덱 칸만 먹고 아무것도
// 안 해 줬는데, 보상 6칸에 이미 가진 카드가 태연히 섞여 나왔다. 중복을 성장으로
// 바꾸면 그 칸이 다시 선택지가 된다.
//
// 설계 규칙 셋:
//   ① **강화는 한 번뿐**(`MAX_UPGRADE = 1`, 사용자 결정). 한 장을 더 얻으면 곧바로
//      최대 강화다 — 같은 카드를 세 장·네 장 모으는 파밍 게임이 되지 않는다.
//   ② **피해는 늘 오르고, 그 카드가 가진 "성격" 하나가 더 좋아진다.** 아래 `IDENTITY`
//      순서에서 **먼저 걸리는 것 하나만** 적용한다. 두세 개를 같이 얹으면 원래 센
//      카드가 혼자 더 세지고(복합 능력 카드일수록 이득), 강화가 무엇을 하는지도
//      한눈에 안 읽힌다.
//   ③ **아무것도 안 바뀌면 강화가 아니다.** `isUpgradable`이 실제 결과를 원본과
//      비교해 판정하고, `run.ts`가 그걸로 보상 풀에서 뺀다(사용자 요청 —
//      "강화가 별로면 가지고 있는 카드는 안 나오게"). 규칙을 늘려도 이 판정은
//      자동으로 따라온다 — 손으로 "강화 불가 카드 목록"을 적지 않는다.
//
// ⚠ **런 전용이다.** 여기서 만든 CardDef는 `run.ts`/`runbattle.ts`를 거쳐서만
// 엔진에 들어간다. PvP·봇전의 카드 풀(`cards.ts`·`roster.ts`)은 원본 그대로라
// 락스텝·`RULES_VERSION`과 무관하다.
// ---------------------------------------------------------------------------
import { GRID_COLS, type CardDef, type Offset } from '../battle/types'

/** 강화 상한. 1 = 같은 카드를 한 장 더 얻으면 그걸로 끝(사용자 결정). */
export const MAX_UPGRADE = 1

/** 강화된 카드 이름에 붙는 표식. `파쇄 베기` → `파쇄 베기+` */
const MARK = '+'

const key = (o: Offset): string => `${o.df},${o.du}`

/**
 * 사거리 한 칸 확장 — 앞뒤 **가장 바깥 칸**에서 한 칸씩 더 뻗는다. 앞뒤 대칭
 * 규약(2026-08-03)을 그대로 따라가므로 대칭 카드는 대칭인 채로 넓어지고,
 * 전방 전용 카드는 앞으로만 길어진다.
 *
 * ⚠ **이미 df 4칸을 넘으면 늘리지 않는다.** 판이 6열뿐이라 df 5가 사실상 판 끝이고,
 * df 6은 어떤 배치에서도 닿는 칸이 없다 — "늘었는데 아무 일도 안 일어나는" 강화가
 * 된다. 그런 카드는 `IDENTITY`의 마지막 항목(기력 절감)으로 떨어진다.
 */
function extendRange(range: Offset[] | undefined): Offset[] | null {
  if (!range?.length) return null
  const maxAbs = Math.max(...range.map((o) => Math.abs(o.df)))
  if (maxAbs < 1 || maxAbs >= GRID_COLS - 2) return null
  const seen = new Set(range.map(key))
  const out = range.slice()
  for (const o of range) {
    if (Math.abs(o.df) !== maxAbs) continue
    const next: Offset = { df: o.df + Math.sign(o.df), du: o.du }
    if (seen.has(key(next))) continue
    seen.add(key(next))
    out.push(next)
  }
  return out.length > range.length ? out : null
}

/** 비율 증가(최소·최대 폭 고정). 작은 카드가 손해 보지 않고 큰 카드가 폭주하지 않게. */
const bump = (n: number, pct: number, min: number, max: number): number =>
  n + Math.min(max, Math.max(min, Math.round(n * pct)))

/**
 * 공격 카드의 "성격" 강화 — **위에서부터 먼저 걸리는 것 하나만** 적용한다.
 * 반환값이 없으면 그 규칙은 이 카드에 해당하지 않는다는 뜻(다음 규칙으로).
 */
const IDENTITY: ((up: CardDef, base: CardDef) => string[] | null)[] = [
  // ① 지속피해 — 궁수의 독, 마법사의 화상. 한 장에 둘 다 있으면 둘 다 오른다
  //    (`mag-doom`·`r-blightwave`처럼 "묻히는 게 정체성"인 카드라 갈라 놓으면 반쪽이 된다).
  (up, base) => {
    if (!base.poison && !base.burn) return null
    const n: string[] = []
    if (base.poison) { up.poison = base.poison + 3; n.push('독 +3') }
    if (base.burn) { up.burn = base.burn + 3; n.push('화상 +3') }
    return n
  },
  // ② 통제 — **지속이 한 턴 길어진다.** 지속피해와 달리 빙결·기절은 턴 수가 카드에
  //    적혀 있어서(`STATUS_TURNS`는 독·화상 전용) 여기서만 늘릴 수 있다.
  (up, base) => {
    if (!base.freeze && !base.stun) return null
    const n: string[] = []
    if (base.freeze) { up.freeze = base.freeze + 1; n.push('빙결 +1턴') }
    if (base.stun) { up.stun = base.stun + 1; n.push('기절 +1턴') }
    return n
  },
  // ③ 흡수 — 흡혈·기력흡수. 지속력을 파는 카드는 지속력이 늘어야 강화답다.
  (up, base) => {
    const n: string[] = []
    if (base.leech) { up.leech = bump(base.leech, 0.4, 3, 12); n.push(`흡혈 +${up.leech! - base.leech}`) }
    if (base.drain) { up.drain = bump(base.drain, 0.4, 3, 12); n.push(`기력흡수 +${up.drain! - base.drain}`) }
    return n.length ? n : null
  },
  // ④ 위치 통제 — 넉백·끌기는 칸 단위라 비율이 의미 없다. 딱 한 칸 더.
  (up, base) => {
    const n: string[] = []
    if (base.push) { up.push = base.push + 1; n.push('넉백 +1') }
    if (base.pull) { up.pull = base.pull + 1; n.push('끌기 +1') }
    return n.length ? n : null
  },
  // ⑤ 자기 강화 — 각성(누적)·사용 시 보호막.
  (up, base) => {
    const n: string[] = []
    if (base.empower) { up.empower = bump(base.empower, 0.4, 3, 10); n.push(`각성 +${up.empower! - base.empower}`) }
    if (base.selfShield) { up.selfShield = bump(base.selfShield, 0.4, 5, 20); n.push(`방벽 +${up.selfShield! - base.selfShield}`) }
    return n.length ? n : null
  },
  // ⑥ 반동 — 유일하게 **깎는** 강화. 자해가 정체성인 카드(`r-frenzy`)의 대가를 줄인다.
  (up, base) => {
    if (!base.recoil) return null
    const cut = Math.min(10, Math.max(3, Math.round(base.recoil * 0.4)))
    up.recoil = Math.max(0, base.recoil - cut)
    return [`반동 -${base.recoil - up.recoil}`]
  },
  // ⑦ 사거리 — 붙일 능력이 없는 "순수 타격" 카드가 여기로 온다. 기본기·공용 약공이
  //    앞뒤 2칸까지 뻗는 게 이 규칙이다.
  (up, base) => {
    const ext = extendRange(base.range)
    if (!ext) return null
    up.range = ext
    return ['사거리 +1칸']
  },
  // ⑧ 최후 — 판 끝까지 닿는 장거리 카드(`r-railgun` 등)는 늘릴 사거리가 없다.
  //    대신 값을 깎아 실제로 낼 수 있게 한다.
  (up, base) => {
    const cost = base.energyCost ?? 0
    if (cost <= 2) return null
    const cut = Math.min(8, Math.max(2, Math.round(cost * 0.15)))
    up.energyCost = cost - cut
    return [`기력 -${cut}`]
  },
]

/**
 * 강화 한 단계. 바뀌는 게 없으면 `null`(= 이 카드는 더 올릴 게 없다).
 * ⚠ **원본을 변형하지 않는다.** 원본 상수(`cards.ts`·`roster.ts`·`runcards.ts`)는
 * PvP가 같이 쓰므로 항상 새 객체를 만들어 돌려준다.
 */
function applyOnce(base: CardDef): { card: CardDef; notes: string[] } | null {
  const up: CardDef = { ...base }
  const notes: string[] = []

  if (base.kind === 'attack') {
    const d = base.damage ?? 0
    if (d > 0) {
      up.damage = bump(d, 0.2, 4, 12)
      notes.push(`피해 +${up.damage! - d}`)
    }
    for (const rule of IDENTITY) {
      const n = rule(up, base)
      if (n) { notes.push(...n); break }
    }
  } else if (base.kind === 'guard') {
    const b = base.block ?? 0
    up.block = bump(b, 0.25, 6, 24)
    notes.push(`방어 +${up.block! - b}`)
  } else if (base.kind === 'energy') {
    const g = base.gain ?? 0
    up.gain = bump(g, 0.25, 6, 20)
    notes.push(`기력 +${up.gain! - g}`)
  } else if (base.kind === 'heal') {
    const h = base.healHp ?? 0
    up.healHp = bump(h, 0.25, 5, 20)
    notes.push(`회복 +${up.healHp! - h}`)
  } else if (base.kind === 'buff') {
    // 위력이 있는 버프는 위력을, 위력이라는 게 없는 버프(`freeCast`)는 지속을 올린다.
    if (base.buffPower) {
      up.buffPower = bump(base.buffPower, 0.25, 2, 8)
      notes.push(`효과 +${up.buffPower! - base.buffPower}`)
    } else {
      up.buffTurns = (base.buffTurns ?? 1) + 1
      notes.push('지속 +1턴')
    }
  } else if (base.kind === 'move') {
    // ⚠ 이동은 걸음 수를 늘리면 카드의 정체가 바뀐다(↗ 한 칸 = 비껴 딛기 두 칸).
    //    쿨타임만 깎고, 쿨이 없는 기본 이동은 **강화할 게 없다** — `isUpgradable`이
    //    false가 되어 보상 풀에서 빠진다.
    const cd = base.cooldown ?? 0
    if (cd <= 0) return null
    up.cooldown = cd - 1
    notes.push('쿨타임 -1턴')
  }
  return notes.length ? { card: up, notes } : null
}

/**
 * 강화를 적용한 카드. `level <= 0`이거나 더 올릴 게 없으면 **원본을 그대로**
 * 돌려준다(참조까지 같다 — 강화가 없는 대부분의 카드에서 객체를 새로 만들지 않고,
 * `isUpgradable`이 이 동일성으로 판정한다).
 *
 * 지금은 `MAX_UPGRADE`가 1이라 한 번만 돌지만, 상한을 올리면 그만큼 누적된다.
 */
export function upgradedCard(base: CardDef, level: number): CardDef {
  let cur = base
  let notes: string[] = []
  const steps = Math.min(level, MAX_UPGRADE)
  for (let i = 0; i < steps; i++) {
    const next = applyOnce(cur)
    if (!next) break
    cur = next.card
    notes = next.notes
  }
  if (cur === base) return base
  cur.name = base.name + MARK.repeat(steps)
  cur.upgraded = steps
  cur.upgradeNote = notes.join(' · ')
  return cur
}

/** 이 카드를 한 번 더 강화하면 실제로 무언가 바뀌는가. 풀 필터·강화 이벤트의 기준. */
export function isUpgradable(base: CardDef, level: number): boolean {
  return level < MAX_UPGRADE && applyOnce(upgradedCard(base, level)) !== null
}

/** 강화하면 무엇이 좋아지는지 한 줄 요약(강화 전에 보여 주는 미리보기). */
export function upgradePreview(base: CardDef, level: number): string {
  return upgradedCard(base, level + 1).upgradeNote ?? ''
}
