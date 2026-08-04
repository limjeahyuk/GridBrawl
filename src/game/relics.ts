// ---------------------------------------------------------------------------
// 유물(Relic) — 로그라이크 런에서 장착하는 상시 능력. 각 유물은 엔진 패시브
// 훅(data/roster.ts의 Passive)의 조합이다. 여러 유물을 끼면 효과가 합쳐진다
// (mergeRelics). 캐릭터의 옛 패시브가 그 캐릭터의 "시그니처 유물"로 이관됐다.
// 전투 엔진은 랜덤이 없으므로 유물 효과도 전부 결정론적이다.
// ---------------------------------------------------------------------------
import type { Passive } from '../data/roster'
import { ROSTER } from '../data/roster'

export type Rarity = 'common' | 'rare' | 'epic' | 'legend'

/**
 * 전투 밖(런 메타)에 작용하는 유물 효과 — 상점 할인·골드·보상 칸처럼 엔진이 알 필요
 * 없는 것들. `run.ts`가 `mergeRunMods`로 합쳐서 읽는다.
 */
export interface RunMods {
  /** 상점 가격 -N%(합산, 최대 80%). */
  shopDiscountPct?: number
  /** 전투 승리 골드 +N%(합산). */
  goldBonusPct?: number
  /** 승리 보상 선택지 +N칸. */
  rewardOptions?: number
  /** 모든 회복 효과(보상 포기·이벤트·상점) +N%. */
  healBonusPct?: number
  /** 일반 전투 보상에 유물이 섞일 확률 +N포인트(0.01 = +1%p). */
  relicChanceBonus?: number
  /** 덱 상한 +N장. */
  deckCapBonus?: number
}

export interface Relic {
  id: string
  name: string
  desc: string
  icon: string // 이모지
  rarity: Rarity
  /** 이 유물이 부여하는 패시브 훅(desc는 안 씀 — Relic.desc가 설명). */
  effect: Omit<Passive, 'desc'>
  /** 전투 밖에 작용하는 효과(상점·골드·보상). */
  mods?: RunMods
  /** 시작 시그니처 유물이면 해당 캐릭터 id. 일반 보상 풀엔 넣지 않는다. */
  signatureOf?: string
}

// --- 캐릭터별 시그니처 유물 (옛 passive를 이관) -----------------------------
// 각 캐릭터의 roster passive를 그대로 유물화한다. 이름/아이콘은 캐릭터 콘셉트에 맞춰.
//
// **런 보정(runEffect, 2026-07-30)**: 캐릭터 패시브를 그대로 유물화하면 런 클리어율이
// 27~57%로 벌어진다(캐릭터별 대량 시뮬 — docs/ROGUELIKE.md ⑪). 이유는 구조적이다:
//   ① 체력이 층 사이에 이어지는 런에선 **지속회복 > 피해감소**다(감소는 출혈을 늦추고,
//      회복은 되돌린다) → 회복 수단이 없는 캐릭터가 누적 출혈로 죽는다.
//   ② 런의 제약은 기력이 아니라 **슬롯 3칸**이다(쿨0 공격은 턴당 1회, 기력은 턴마다
//      쌓임) → 매 턴 기력을 크게 주는 패시브가 큰 카드를 매 턴 쏘게 해 압도한다.
// 그래서 시그니처 유물은 패시브에서 출발하되 **런 수치를 따로 지정**한다(가감 모두).
// roster의 `passive`는 건드리지 않으므로 **PvP·봇전·1:1 시뮬은 불변**이다.
const SIGNATURE: Record<
  string,
  {
    id: string
    name: string
    icon: string
    /** 런에서의 실효 수치 — 캐릭터 패시브 위에 덮어쓴다. 비우면 패시브 그대로. */
    runEffect?: Omit<Passive, 'desc'>
    /** runEffect가 있으면 설명도 실제 수치로 다시 쓴다(UI가 거짓말하지 않게). */
    desc?: string
  }
> = {
  warrior: {
    id: 'sig-warrior', name: '서약의 돌무덤', icon: '🪦',
    // 전사는 "안 죽는 쪽"이라 방어·회복을 준다. ⚠ 회복은 런에서 극도로 강하니
    // (GDD ⑪) regen은 아주 작게 잡고, 부족한 생존력은 반사(thorns)로 메운다.
    runEffect: { damageReduction: 8, regen: 3, thorns: 6, maxHpBonus: 29 },
    desc: '서약의 돌무덤: 최대 체력 +29, 받는 공격 피해 -8, 매 턴 체력 +3, 피격 시 6 반사.',
  },
  archer: {
    id: 'sig-archer', name: '독니 화살통', icon: '🏹',
    // 궁수는 물렁하고 카드 4장 중 3장이 밀착 사각이라, 몬스터가 접근하기 시작한
    // 뒤로는 붙으면 아무것도 못 하고 녹는다(2026-08-01 재조정 전 클리어율 0.7%).
    // ⚠ 화력·독을 올리는 건 답이 아니었다 — 오히려 떨어졌다(독 위력 +45% 실험에서
    // 24.7%→22.2%). 필요한 건 **버티는 힘**이라 흡혈·피해감소·최대체력으로 준다.
    // 그중 lifesteal이 지배 변수다(4→5만으로 +5%p) — 손대면 반드시 스윕 재측정.
    runEffect: { attackBonus: 9, poisonOnHit: 4, statusPowerPct: 25, damageReduction: 7, maxHpBonus: 28, lifesteal: 4 },
    desc: '독니 화살통: 최대 체력 +28, 받는 피해 -7. 내 공격 피해 +9, 피해를 주면 체력 4 흡수 + 독 4, 내 지속피해 위력 +25%.',
  },
  mage: {
    id: 'sig-mage', name: '혼백의 등불', icon: '🕯',
    // 마법사는 기력으로 큰 주문을 계속 돌리고 보호막으로 버틴다.
    // ⚠ turnEnergy는 봇 인공물을 만들어 측정이 튄다(GDD ⑪) — 조정은 체력·보호막으로
    // 하고 이 값은 고정해 둘 것. 실제로 turnEnergy 10은 최대체력 14와 맞먹었다.
    runEffect: { turnEnergy: 10, turnShield: 16, burnOnHit: 3, damageReduction: 6, maxHpBonus: 58 },
    desc: '혼백의 등불: 최대 체력 +58, 받는 피해 -6. 매 턴 기력 +10·보호막 +16, 피해를 주면 화상 3을 묻힌다.',
  },
}

const signatureRelics: Relic[] = ROSTER.map((c) => {
  const meta = SIGNATURE[c.id]
  const { desc, ...base } = c.passive
  return {
    id: meta.id,
    name: meta.name,
    desc: meta.desc ?? desc,
    icon: meta.icon,
    rarity: 'rare' as Rarity,
    effect: meta.runEffect ?? base,
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

  // --- 조합형 세트(2026-07-31) — 누적 기력 트리거 / 저체력 폭주 / 경제 -------
  // "말도 안 되는 뽕맛"을 내는 재료들. 하나만 끼면 준수하고, 서로 물리면 폭발한다
  // (예: 기력 강탈 카드로 기력을 굴리며 과충전 축전기 + 방전 코일 + 순환 회로).
  // 대신 재료가 다 모이려면 희귀도 가중 추첨을 여러 번 통과해야 한다(⑫ 참고).
  {
    id: 'capacitor', name: '과충전 축전기', icon: '🔌', rarity: 'epic',
    desc: '기력을 200 쓸 때마다 상대를 1턴 기절시킨다.',
    effect: { energyTriggers: [{ per: 200, stun: 1, label: '과충전 방전' }] },
  },
  {
    id: 'coil', name: '방전 코일', icon: '⚡', rarity: 'legend',
    desc: '기력을 120 쓸 때마다 상대를 1턴 기절시키고 25 고정 피해를 준다.',
    effect: { energyTriggers: [{ per: 120, stun: 1, damage: 25, label: '코일 방전' }] },
  },
  {
    id: 'circuit', name: '순환 회로', icon: '♻️', rarity: 'rare',
    desc: '기력을 100 쓸 때마다 체력을 25 회복한다.',
    effect: { energyTriggers: [{ per: 100, heal: 25, label: '순환 회복' }] },
  },
  {
    id: 'condenser', name: '응축 셀', icon: '🔆', rarity: 'rare',
    desc: '기력을 80 쓸 때마다 보호막 +30.',
    effect: { energyTriggers: [{ per: 80, shield: 30, label: '응축 전개' }] },
  },
  {
    id: 'flywheel', name: '플라이휠', icon: '🌀', rarity: 'epic',
    desc: '기력을 90 쓸 때마다 기력 +45. 큰 카드를 계속 쏘게 해준다.',
    effect: { energyTriggers: [{ per: 90, energy: 45, label: '플라이휠 회전' }] },
  },
  {
    id: 'reservoir', name: '심층 저수조', icon: '🛢', rarity: 'legend',
    desc: '기력을 60 쓸 때마다 체력 +12, 보호막 +12, 기력 +20.',
    effect: { energyTriggers: [{ per: 60, heal: 12, shield: 12, energy: 20, label: '저수조 방출' }] },
  },
  {
    id: 'lastditch', name: '벼랑의 각오', icon: '🔥', rarity: 'epic',
    desc: '체력이 절반 이하면 내 공격 피해 +50%.',
    effect: { lowHpBonusPct: 50 },
  },
  {
    id: 'deathwish', name: '사경의 광기', icon: '💀', rarity: 'legend',
    desc: '체력이 절반 이하면 내 공격 피해 +100%. 최대 체력 -25.',
    effect: { lowHpBonusPct: 100, maxHpBonus: -25 },
  },
  {
    id: 'emberheart', name: '잿불 심장', icon: '🫀', rarity: 'rare',
    desc: '체력이 절반 이하면 내 공격 피해 +25%, 매 턴 체력 +4.',
    effect: { lowHpBonusPct: 25, regen: 4 },
  },
  {
    id: 'voidedge', name: '공허의 날', icon: '🗡', rarity: 'legend',
    desc: '내 모든 공격이 상대 보호막을 무시하고 관통한다.',
    effect: { alwaysPierce: true },
  },
  {
    id: 'concussor', name: '충격 증폭기', icon: '💥', rarity: 'epic',
    desc: '전투당 두 번, 내 공격이 피해를 주면 상대를 1턴 기절시킨다.',
    effect: { stunOnHit: 1, stunCap: 2 },
  },
  {
    id: 'firstguard', name: '선제 방벽', icon: '🚧', rarity: 'common',
    desc: '전투 첫 턴에 보호막 +40.',
    effect: { openingShield: 40 },
  },
  {
    id: 'warmup', name: '예열 장치', icon: '🔥', rarity: 'common',
    desc: '전투 첫 턴에 보호막 +20, 매 턴 기력 +6.',
    effect: { openingShield: 20, turnEnergy: 6 },
  },

  // --- 확장 세트 2 (2026-07-31) — 빈 메커니즘 보강(기절·반사·관통·저체력·지속회복) --
  {
    id: 'taser', name: '테이저 셀', icon: '🔋', rarity: 'rare',
    desc: '기력을 150 쓸 때마다 상대를 1턴 기절시킨다.',
    effect: { energyTriggers: [{ per: 150, stun: 1, label: '테이저 방전' }] },
  },
  {
    id: 'dischargelens', name: '방출 렌즈', icon: '🔦', rarity: 'epic',
    desc: '기력을 110 쓸 때마다 상대에게 35 고정 피해(보호막 무시).',
    effect: { energyTriggers: [{ per: 110, damage: 35, label: '렌즈 방출' }] },
  },
  {
    id: 'thorncrown', name: '가시 왕관', icon: '👑', rarity: 'epic',
    desc: '피해를 입으면 공격자에게 16 반사.', effect: { thorns: 16 },
  },
  {
    id: 'hedgehog', name: '고슴도치 갑주', icon: '🦔', rarity: 'rare',
    desc: '받는 피해 -5, 피격 시 공격자에게 8 반사.', effect: { damageReduction: 5, thorns: 8 },
  },
  {
    id: 'sanctum', name: '재생의 성소', icon: '🌿', rarity: 'epic',
    desc: '매 턴 체력 +11.', effect: { regen: 11 },
  },
  {
    id: 'reaperscythe', name: '수확자의 낫', icon: '🌾', rarity: 'rare',
    desc: '공격으로 피해를 주면 체력 6 회복. 내 공격 피해 +5.', effect: { lifesteal: 6, attackBonus: 5 },
  },
  {
    id: 'lastresort', name: '배수진', icon: '🩸', rarity: 'epic',
    desc: '체력이 절반 이하면 내 공격 피해 +40%. 피격 시 공격자에게 8 반사.',
    effect: { lowHpBonusPct: 40, thorns: 8 },
  },
  {
    id: 'piercecore', name: '관통 코어', icon: '🗜', rarity: 'epic',
    desc: '내 모든 공격이 상대 보호막을 관통한다. 최대 체력 -25.',
    effect: { alwaysPierce: true, maxHpBonus: -25 },
  },
  {
    id: 'chainshock', name: '연쇄 충격기', icon: '⚡', rarity: 'epic',
    desc: '전투당 세 번, 내 공격이 피해를 주면 상대를 1턴 기절시킨다.',
    effect: { stunOnHit: 1, stunCap: 3 },
  },
  {
    id: 'vanguard', name: '선봉대장', icon: '🎖', rarity: 'rare',
    desc: '전투 첫 턴에 보호막 +30. 내 공격 피해 +5.', effect: { openingShield: 30, attackBonus: 5 },
  },
  {
    id: 'meditation', name: '명상의 룬', icon: '🧘', rarity: 'common',
    desc: '매 턴 체력 +6, 보호막 +6.', effect: { regen: 6, turnShield: 6 },
  },
  {
    id: 'giantserum', name: '거인 혈청', icon: '🧪', rarity: 'legend',
    desc: '최대 체력 +85.', effect: { maxHpBonus: 85 },
  },
  {
    id: 'tinder', name: '불씨 심지', icon: '🪔', rarity: 'rare',
    desc: '전투당 한 번 체력 25로 되살아난다. 매 턴 체력 +3.', effect: { revive: 25, regen: 3 },
  },
  {
    id: 'bloodpact-relic', name: '피의 계약', icon: '🩸', rarity: 'legend',
    desc: '내 공격 피해 +12. 공격으로 피해를 주면 체력 8 회복. 최대 체력 -15.',
    effect: { attackBonus: 12, lifesteal: 8, maxHpBonus: -15 },
  },

  // --- 경제형(전투 밖에 작용) -------------------------------------------------
  {
    id: 'coupon', name: '상인의 인증패', icon: '🏷', rarity: 'common',
    desc: '상점 가격 20% 할인.', effect: {}, mods: { shopDiscountPct: 20 },
  },
  {
    id: 'blackcard', name: '암시장 카드', icon: '💳', rarity: 'epic',
    desc: '상점 가격 40% 할인, 골드 획득 +20%.', effect: {}, mods: { shopDiscountPct: 40, goldBonusPct: 20 },
  },
  {
    id: 'purse', name: '두툼한 지갑', icon: '💰', rarity: 'common',
    desc: '전투 승리 골드 +35%.', effect: {}, mods: { goldBonusPct: 35 },
  },
  {
    id: 'compass', name: '탐색가의 나침반', icon: '🧭', rarity: 'rare',
    desc: '승리 보상 선택지 +1칸.', effect: {}, mods: { rewardOptions: 1 },
  },
  {
    id: 'divining', name: '점술 수정구', icon: '🔮', rarity: 'legend',
    desc: '승리 보상 선택지 +2칸, 일반 전투 보상에 유물이 섞일 확률 +12%p.',
    effect: {}, mods: { rewardOptions: 2, relicChanceBonus: 0.12 },
  },
  {
    id: 'satchel', name: '확장 가방', icon: '🎒', rarity: 'common',
    desc: '덱 상한 +4장.', effect: {}, mods: { deckCapBonus: 4 },
  },
  {
    id: 'balm', name: '치유 향유', icon: '🧴', rarity: 'rare',
    desc: '모든 회복 효과 +50%(보상 포기·이벤트·상점).', effect: {}, mods: { healBonusPct: 50 },
  },
  {
    id: 'midastouch', name: '황금손', icon: '🖐', rarity: 'rare',
    desc: '전투 승리 골드 +55%.', effect: {}, mods: { goldBonusPct: 55 },
  },
  {
    id: 'luckycharm', name: '행운의 편자', icon: '🍀', rarity: 'rare',
    desc: '일반 전투 보상에 유물이 섞일 확률 +8%p.', effect: {}, mods: { relicChanceBonus: 0.08 },
  },
  {
    id: 'lockpick', name: '만능 열쇠', icon: '🗝', rarity: 'epic',
    desc: '상점 가격 30% 할인, 덱 상한 +3장.', effect: {}, mods: { shopDiscountPct: 30, deckCapBonus: 3 },
  },

  // --- 상태이상 계열 (2026-08-01, 3직업 개편) -------------------------------
  // 8개 빌드를 "유물로 완성"시키는 재료. 하나만 주우면 미지근하고, **겹쳐야**
  // 빌드가 선다: 부여(poisonOnHit/burnOnHit) → 증폭(statusPowerPct) → 시너지
  // (bonusVsAfflicted) 세 층이 다 모여야 곱이 터진다.
  { id: 'venomflask', name: '독약 플라스크', icon: '🧪', rarity: 'common', desc: '공격으로 피해를 주면 독 3을 묻힌다.', effect: { poisonOnHit: 3 } },
  { id: 'emberbrand', name: '잉걸 낙인', icon: '🔥', rarity: 'common', desc: '공격으로 피해를 주면 화상 3을 묻힌다.', effect: { burnOnHit: 3 } },
  { id: 'coldiron', name: '차가운 쇠', icon: '❄️', rarity: 'common', desc: '상태이상에 걸린 상대에게 주는 피해 +6.', effect: { bonusVsAfflicted: 6 } },
  { id: 'wickedmortar', name: '사악한 절구', icon: '⚗️', rarity: 'rare', desc: '내가 거는 독·화상 위력 +40%.', effect: { statusPowerPct: 40 } },
  { id: 'plaguebearer', name: '역병 운반자', icon: '🐀', rarity: 'rare', desc: '피해를 주면 독 5를 묻히고, 내 지속피해 위력 +20%.', effect: { poisonOnHit: 5, statusPowerPct: 20 } },
  { id: 'pyremark', name: '화형의 표식', icon: '🕯', rarity: 'epic', desc: '피해를 주면 화상 6을 묻히고, 상태이상에 걸린 상대에게 피해 +8.', effect: { burnOnHit: 6, bonusVsAfflicted: 8 } },
  { id: 'hunterspite', name: '사냥꾼의 앙심', icon: '🎯', rarity: 'epic', desc: '상태이상에 걸린 상대에게 피해 +14. 보호막을 무시한다.', effect: { bonusVsAfflicted: 14, alwaysPierce: true } },
  { id: 'rotcrown', name: '부패의 왕관', icon: '👑', rarity: 'legend', desc: '피해를 주면 독 6·화상 6을 함께 묻히고, 지속피해 위력 +50%, 상태이상 상대에게 피해 +10.', effect: { poisonOnHit: 6, burnOnHit: 6, statusPowerPct: 50, bonusVsAfflicted: 10 } },
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
    addNum('lowHpBonusPct', e.lowHpBonusPct)
    addNum('stunOnHit', e.stunOnHit)
    addNum('stunCap', e.stunCap)
    addNum('openingShield', e.openingShield)
    if (e.shieldBreak) out.shieldBreak = true
    if (e.alwaysPierce) out.alwaysPierce = true
    // 누적 기력 트리거는 **합치지 않고 이어 붙인다** — 주기가 다른 트리거들이 각자
    // 따로 터져야 조합이 성립한다(주기를 더하면 조합이 오히려 약해진다).
    if (e.energyTriggers?.length)
      out.energyTriggers = [...(out.energyTriggers ?? []), ...e.energyTriggers]
  }
  return out
}

/** 전투 밖 효과(상점 할인·골드·보상 칸)를 합친다. 퍼센트는 합산, 할인은 80%로 캡. */
export function mergeRunMods(ids: string[]): RunMods {
  const out: RunMods = {}
  const acc = out as unknown as Record<string, number>
  for (const id of ids) {
    const m = RELIC_BY_ID[id]?.mods
    if (!m) continue
    for (const [k, v] of Object.entries(m)) acc[k] = (acc[k] ?? 0) + (v as number)
  }
  if (out.shopDiscountPct) out.shopDiscountPct = Math.min(80, out.shopDiscountPct)
  return out
}

/**
 * 희귀도 가중 추첨(2026-07-31) — **깊이에 따라 좋아진다**.
 *
 * 유물 조합으로 판을 부수는 플레이는 **막지 않는다**(사용자 요구). 대신 재료가 모이려면
 * 깊이 살아남아야 한다: 얕은 층에선 전설이 거의 안 나오고, 깊은 층일수록 영웅·전설
 * 비중이 올라간다. 고정 가중치(전설=일반의 1/10)로 해봤더니 전설 2개 이상을 모으는 런이
 * 0.1%로, "매우 어렵게"가 아니라 사실상 막는 수준이었다(시뮬).
 *
 * 층 1: 일반 9.6 · 희귀 6 · 영웅 3.3 · 전설 1.2   (전설 ≈ 6%)
 * 층 15: 일반 4.0 · 희귀 6 · 영웅 7.5 · 전설 3.5  (전설 ≈ 17%)
 */
export function rarityWeightAt(rarity: Rarity, floor: number): number {
  switch (rarity) {
    case 'common':
      return Math.max(4, 10 - 0.4 * floor)
    case 'rare':
      return 6
    case 'epic':
      return 3 * (1 + floor / 10)
    case 'legend':
      return 1 + floor / 6
  }
}

/** 후보 유물 중 하나를 희귀도 가중으로 고른다(랜덤 — 런은 싱글 전용). */
export function pickWeightedRelic(pool: Relic[], floor = 1): Relic | undefined {
  if (!pool.length) return undefined
  const w = (r: Relic) => rarityWeightAt(r.rarity, floor)
  const total = pool.reduce((s, r) => s + w(r), 0)
  let roll = Math.random() * total
  for (const r of pool) {
    roll -= w(r)
    if (roll <= 0) return r
  }
  return pool[pool.length - 1]
}

/** 상점 가격 기준(희귀도별). legend는 아주 비싸다. */
export const RELIC_PRICE: Record<Rarity, number> = {
  common: 60,
  rare: 95,
  epic: 145,
  legend: 230,
}
