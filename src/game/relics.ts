// ---------------------------------------------------------------------------
// 유물(Relic) — 로그라이크 런에서 장착하는 상시 능력. 각 유물은 엔진 패시브
// 훅(data/roster.ts의 Passive)의 조합이다. 여러 유물을 끼면 효과가 합쳐진다
// (mergeRelics). 캐릭터의 옛 패시브가 그 캐릭터의 "시그니처 유물"로 이관됐다.
// 전투 엔진은 랜덤이 없으므로 유물 효과도 전부 결정론적이다.
// ---------------------------------------------------------------------------
import type { Passive } from '../data/roster'
import { ROSTER } from '../data/roster'

export type Rarity = 'common' | 'rare' | 'epic'

export interface Relic {
  id: string
  name: string
  desc: string
  icon: string // 이모지
  rarity: Rarity
  /** 이 유물이 부여하는 패시브 훅(desc는 안 씀 — Relic.desc가 설명). */
  effect: Omit<Passive, 'desc'>
  /** 시작 시그니처 유물이면 해당 캐릭터 id. 일반 보상 풀엔 넣지 않는다. */
  signatureOf?: string
}

// --- 캐릭터별 시그니처 유물 (옛 passive를 이관) -----------------------------
// 각 캐릭터의 roster passive를 그대로 유물화한다. 이름/아이콘은 캐릭터 콘셉트에 맞춰.
const SIGNATURE: Record<string, { id: string; name: string; icon: string }> = {
  volt: { id: 'sig-volt', name: '오버차지 코어', icon: '⚡' },
  titan: { id: 'sig-titan', name: '장갑판', icon: '🛡' },
  nova: { id: 'sig-nova', name: '플라스마 코어', icon: '☀' },
  cipher: { id: 'sig-cipher', name: '데이터 드레인', icon: '🩸' },
  aegis: { id: 'sig-aegis', name: '상시 방벽', icon: '🧱' },
  ember: { id: 'sig-ember', name: '불사조 깃털', icon: '🔥' },
}

const signatureRelics: Relic[] = ROSTER.map((c) => {
  const meta = SIGNATURE[c.id]
  const { desc, ...effect } = c.passive
  return {
    id: meta.id,
    name: meta.name,
    desc,
    icon: meta.icon,
    rarity: 'rare' as Rarity,
    effect,
    signatureOf: c.id,
  }
})

// --- 일반 보상 유물 (런 중 획득) --------------------------------------------
// 사용자 예시(송곳니=흡혈, 깃털=부활)를 포함해 훅을 골고루 쓰는 세트.
const genericRelics: Relic[] = [
  { id: 'fang', name: '송곳니', icon: '🦷', rarity: 'common', desc: '공격으로 피해를 주면 체력 5 회복.', effect: { lifesteal: 5 } },
  { id: 'feather', name: '불꽃 깃털', icon: '🪶', rarity: 'epic', desc: '전투당 한 번, 체력 40으로 되살아난다.', effect: { revive: 40 } },
  { id: 'thorns', name: '가시 갑옷', icon: '🌵', rarity: 'common', desc: '피해를 입으면 공격자에게 8 반사.', effect: { thorns: 8 } },
  { id: 'heart', name: '심장 강화', icon: '❤️', rarity: 'common', desc: '최대 체력 +30.', effect: { maxHpBonus: 30 } },
  { id: 'battery', name: '예비 배터리', icon: '🔋', rarity: 'common', desc: '매 턴 기력 +8.', effect: { turnEnergy: 8 } },
  { id: 'nanobot', name: '재생 나노봇', icon: '💉', rarity: 'rare', desc: '매 턴 체력 +5.', effect: { regen: 5 } },
  { id: 'rage', name: '분노의 인장', icon: '😤', rarity: 'rare', desc: '내 공격 피해 +6.', effect: { attackBonus: 6 } },
  { id: 'plating', name: '두꺼운 판금', icon: '🪨', rarity: 'common', desc: '받는 피해 -6.', effect: { damageReduction: 6 } },
  { id: 'crystal', name: '수정 방벽', icon: '💠', rarity: 'common', desc: '매 턴 보호막 +12.', effect: { turnShield: 12 } },
  { id: 'breaker', name: '파쇄 날', icon: '🪚', rarity: 'rare', desc: '공격이 적중하면 상대 보호막을 전부 없앤다.', effect: { shieldBreak: true } },
  { id: 'leech-rune', name: '흡성의 룬', icon: '🔮', rarity: 'rare', desc: '공격으로 피해를 주면 체력 9 회복.', effect: { lifesteal: 9 } },
  { id: 'bulwark', name: '가시 방패', icon: '🛡', rarity: 'rare', desc: '매 턴 보호막 +8, 피격 시 5 반사.', effect: { turnShield: 8, thorns: 5 } },
  { id: 'reactor', name: '경량 리액터', icon: '⚙️', rarity: 'common', desc: '매 턴 기력 +5, 보호막 +5.', effect: { turnEnergy: 5, turnShield: 5 } },
  { id: 'titanheart', name: '거인의 심장', icon: '🫀', rarity: 'epic', desc: '최대 체력 +60.', effect: { maxHpBonus: 60 } },
  { id: 'berserk', name: '광폭화 회로', icon: '🩹', rarity: 'epic', desc: '내 공격 피해 +12, 최대 체력 -20.', effect: { attackBonus: 12, maxHpBonus: -20 } },
  { id: 'phoenix2', name: '재의 부적', icon: '🕯', rarity: 'epic', desc: '전투당 한 번, 체력 30으로 되살아난다.', effect: { revive: 30 } },
  { id: 'aegis-core', name: '수호 코어', icon: '💎', rarity: 'rare', desc: '매 턴 보호막 +18.', effect: { turnShield: 18 } },
  { id: 'overdrive', name: '오버드라이브', icon: '🚀', rarity: 'rare', desc: '매 턴 기력 +15.', effect: { turnEnergy: 15 } },
  // --- 확장 세트(2026-07-24) ---
  { id: 'ironwill', name: '강철 의지', icon: '🪛', rarity: 'rare', desc: '받는 피해 -10.', effect: { damageReduction: 10 } },
  { id: 'vitality', name: '활력의 정수', icon: '🌿', rarity: 'epic', desc: '최대 체력 +45, 매 턴 체력 +3.', effect: { maxHpBonus: 45, regen: 3 } },
  { id: 'spark-chip', name: '스파크 칩', icon: '✨', rarity: 'common', desc: '매 턴 기력 +12.', effect: { turnEnergy: 12 } },
  { id: 'aegis-plate', name: '방벽판', icon: '🔰', rarity: 'rare', desc: '매 턴 보호막 +20.', effect: { turnShield: 20 } },
  { id: 'greatfang', name: '대송곳니', icon: '🧛', rarity: 'epic', desc: '공격으로 피해를 주면 체력 12 회복.', effect: { lifesteal: 12 } },
  { id: 'spikes', name: '대못 갑옷', icon: '🦔', rarity: 'rare', desc: '피해를 입으면 공격자에게 12 반사.', effect: { thorns: 12 } },
  { id: 'eternal-ember', name: '영원의 불씨', icon: '🔆', rarity: 'epic', desc: '전투당 한 번, 체력 60으로 되살아난다.', effect: { revive: 60 } },
  { id: 'brute', name: '괴력의 장갑', icon: '💪', rarity: 'rare', desc: '내 공격 피해 +9.', effect: { attackBonus: 9 } },
  { id: 'regen-core', name: '재생핵', icon: '🧬', rarity: 'rare', desc: '매 턴 체력 +8.', effect: { regen: 8 } },
  { id: 'glasscannon', name: '유리 대포', icon: '🔻', rarity: 'epic', desc: '내 공격 피해 +18, 최대 체력 -40.', effect: { attackBonus: 18, maxHpBonus: -40 } },
  { id: 'balance', name: '균형추', icon: '⚖️', rarity: 'rare', desc: '매 턴 기력 +6, 보호막 +6, 체력 +2.', effect: { turnEnergy: 6, turnShield: 6, regen: 2 } },
  { id: 'fortress', name: '요새 코어', icon: '🏰', rarity: 'epic', desc: '최대 체력 +40, 받는 피해 -5.', effect: { maxHpBonus: 40, damageReduction: 5 } },
  { id: 'quickcharge', name: '급속 충전', icon: '🔌', rarity: 'common', desc: '매 턴 기력 +10, 내 공격 피해 +3.', effect: { turnEnergy: 10, attackBonus: 3 } },
  { id: 'lifebloom', name: '생명꽃', icon: '🌸', rarity: 'rare', desc: '최대 체력 +20, 매 턴 체력 +6.', effect: { maxHpBonus: 20, regen: 6 } },
  { id: 'razor', name: '면도날 칩', icon: '🔪', rarity: 'rare', desc: '내 공격 피해 +5, 적중 시 상대 보호막 제거.', effect: { attackBonus: 5, shieldBreak: true } },
  { id: 'juggernaut', name: '저거너트', icon: '🚂', rarity: 'epic', desc: '최대 체력 +30, 내 공격 피해 +7.', effect: { maxHpBonus: 30, attackBonus: 7 } },
  { id: 'sanctuary', name: '성역의 문장', icon: '⛩', rarity: 'epic', desc: '매 턴 보호막 +14, 체력 +5.', effect: { turnShield: 14, regen: 5 } },
]

export const RELICS: Relic[] = [...signatureRelics, ...genericRelics]

export const RELIC_BY_ID: Record<string, Relic> = Object.fromEntries(RELICS.map((r) => [r.id, r]))

export function getRelic(id: string): Relic | undefined {
  return RELIC_BY_ID[id]
}

/** 캐릭터의 시작 시그니처 유물 id. */
export function signatureRelicId(charId: string): string {
  return SIGNATURE[charId]?.id ?? ''
}

/** 일반 보상 후보 유물(시그니처 제외). */
export const REWARD_RELICS: Relic[] = genericRelics

/**
 * 장착 유물 id 목록을 하나의 실효 패시브로 합친다. 숫자 훅은 합산, 불리언은 OR.
 * 엔진 `CardBattle`의 `passives` 옵션에 넣는다. 결정론적(정렬·랜덤 없음).
 */
export function mergeRelics(ids: string[]): Passive {
  const out: Passive = { desc: '' }
  const acc = out as unknown as Record<string, number>
  const addNum = (k: string, v?: number) => {
    if (v == null) return
    acc[k] = (acc[k] ?? 0) + v
  }
  for (const id of ids) {
    const r = RELIC_BY_ID[id]
    if (!r) continue
    const e = r.effect
    addNum('turnEnergy', e.turnEnergy)
    addNum('turnShield', e.turnShield)
    addNum('damageReduction', e.damageReduction)
    addNum('lifesteal', e.lifesteal)
    addNum('revive', e.revive)
    addNum('regen', e.regen)
    addNum('attackBonus', e.attackBonus)
    addNum('thorns', e.thorns)
    addNum('maxHpBonus', e.maxHpBonus)
    if (e.shieldBreak) out.shieldBreak = true
  }
  return out
}
