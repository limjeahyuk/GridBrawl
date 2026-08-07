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
  /** 상점 진열 +N칸(카드 칸이 늘어난다). */
  shopExtraItems?: number
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
//      쌓임) → 매 라운드 기력을 크게 주는 패시브가 큰 카드를 매 라운드 쏘게 해 압도한다.
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
    runEffect: { damageReduction: 2, regen: 2, thorns: 2, maxHpBonus: 50 },
    desc: '서약의 돌무덤: 최대 체력 +50, 받는 공격 피해 -2, 매 라운드 체력 +2, 피격 시 2 반사.',
  },
  archer: {
    id: 'sig-archer', name: '독니 화살통', icon: '🏹',
    // 궁수는 물렁하고 카드 4장 중 3장이 밀착 사각이라, 몬스터가 접근하기 시작한
    // 뒤로는 붙으면 아무것도 못 하고 녹는다(2026-08-01 재조정 전 클리어율 0.7%).
    // ⚠ 화력·독을 올리는 건 답이 아니었다 — 오히려 떨어졌다(독 위력 +45% 실험에서
    // 24.7%→22.2%). 필요한 건 **버티는 힘**이라 흡혈·피해감소·최대체력으로 준다.
    // 그중 lifesteal이 지배 변수다(1포인트 ≈ +5%p) — 손대면 반드시 스윕 재측정.
    // ⚠ 4행 전환(2026-08-05)으로 궁수가 −2.6%p 떨어졌다(세로가 벌어져 밀착 사각이 더
    //   노출). 대각 사거리(arc-shot·arc-kite)는 손맛용이라 유지하고, 밸런스는 문서대로
    //   생존 훅으로만 되돌린다.
    // ⚠ 상태이상 개편(2026-08-07)에서 **중독이 라운드마다 갉는 지속피해가 아니게 됐다**.
    //   1차(이동할 때만 아픔)에선 붙어서 제자리 공격만 하는 몬스터에게 거의 0이라
    //   궁수가 16.9%까지 떨어졌고, 최대체력을 23→49로 올려 메웠다. 2차에서 **공격도
    //   행동으로 세게** 되자(사용자 요청) 궁수가 41%로 튀어 다시 49→30으로 내렸다 —
    //   즉 지금 궁수의 생존력은 최대체력이 아니라 **중독이 실제로 값을 한다**는 데서
    //   온다. 중독 규칙을 되돌리면 여기부터 다시 올려야 한다.
    runEffect: { attackBonus: 5, poisonOnHit: 2, damageReduction: 2, maxHpBonus: 30, lifesteal: 2 },
    desc: '독니 화살통: 최대 체력 +30, 받는 피해 -2. 내 공격 피해 +5, 피해를 주면 체력 2 흡수 + 중독 2라운드.',
  },
  mage: {
    id: 'sig-mage', name: '혼백의 등불', icon: '🕯',
    // 마법사는 기력으로 큰 주문을 계속 돌리고 보호막으로 버틴다.
    // ⚠ turnEnergy는 봇 인공물을 만들어 측정이 튄다(GDD ⑪) — 조정은 체력·보호막으로
    // 하고 이 값은 고정해 둘 것. 실제로 turnEnergy 10은 최대체력 14와 맞먹었다.
    runEffect: { turnEnergy: 5, turnShield: 3, burnOnHit: 2, damageReduction: 2, maxHpBonus: 58 },
    desc: '혼백의 등불: 최대 체력 +58, 받는 피해 -2. 매 라운드 기력 +5·보호막 +3, 피해를 주면 화상 2라운드를 묻힌다.',
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
  { id: 'fang', name: '송곳니', icon: '🦷', rarity: 'common', desc: '공격으로 피해를 주면 체력 3 회복.', effect: { lifesteal: 3 } },
  { id: 'feather', name: '불꽃 깃털', icon: '🪶', rarity: 'epic', desc: '전투당 한 번, 체력 20으로 되살아난다.', effect: { revive: 20 } },
  { id: 'thorns', name: '가시 갑옷', icon: '🌵', rarity: 'common', desc: '피해를 입으면 공격자에게 4 반사.', effect: { thorns: 4 } },
  { id: 'heart', name: '심장 강화', icon: '❤️', rarity: 'common', desc: '최대 체력 +15.', effect: { maxHpBonus: 15 } },
  // ⚠ **이스터에그 — 일부러 남긴 사이버 잔재**(2026-08-05). 리스킨 때 '여분의 심지'로
  // 갈았던 걸 되돌린 것이다. 세계관을 벗어난 물건이 하나쯤 굴러다니는 게 재미있다는
  // 사용자 결정. 짝은 런 카드 `r-railgun`('레일건'). **정리 대상이 아니다 — 고치지 말 것.**
  { id: 'battery', name: '예비 배터리', icon: '🔋', rarity: 'common', desc: '매 라운드 기력 +4. 어느 세계에서 굴러떨어진 쇳덩이. 정체는 아무도 모른다.', effect: { turnEnergy: 4 } },
  { id: 'nanobot', name: '치유의 이끼', icon: '🌿', rarity: 'rare', desc: '매 라운드 체력 +3.', effect: { regen: 3 } },
  { id: 'rage', name: '분노의 인장', icon: '😤', rarity: 'rare', desc: '내 공격 피해 +3.', effect: { attackBonus: 3 } },
  { id: 'plating', name: '두꺼운 판금', icon: '🪨', rarity: 'common', desc: '받는 피해 -3.', effect: { damageReduction: 3 } },
  { id: 'crystal', name: '수정 방벽', icon: '💠', rarity: 'common', desc: '매 라운드 보호막 +6.', effect: { turnShield: 6 } },
  { id: 'breaker', name: '파쇄 날', icon: '🪚', rarity: 'rare', desc: '공격이 적중하면 상대 보호막을 전부 없앤다.', effect: { shieldBreak: true } },
  { id: 'leech-rune', name: '흡성의 룬', icon: '🔮', rarity: 'rare', desc: '공격으로 피해를 주면 체력 5 회복.', effect: { lifesteal: 5 } },
  { id: 'bulwark', name: '가시 방패', icon: '🛡', rarity: 'rare', desc: '매 라운드 보호막 +4, 피격 시 3 반사.', effect: { turnShield: 4, thorns: 3 } },
  { id: 'reactor', name: '작은 화로', icon: '⚗️', rarity: 'common', desc: '매 라운드 기력 +3, 보호막 +3.', effect: { turnEnergy: 3, turnShield: 3 } },
  { id: 'titanheart', name: '거인의 심장', icon: '🫀', rarity: 'epic', desc: '최대 체력 +30.', effect: { maxHpBonus: 30 } },
  { id: 'berserk', name: '광기의 낙인', icon: '🩸', rarity: 'epic', desc: '내 공격 피해 +6, 최대 체력 -10.', effect: { attackBonus: 6, maxHpBonus: -10 } },
  { id: 'phoenix2', name: '재의 부적', icon: '🕯', rarity: 'epic', desc: '전투당 한 번, 체력 15으로 되살아난다.', effect: { revive: 15 } },
  { id: 'aegis-core', name: '수호의 원석', icon: '💎', rarity: 'rare', desc: '매 라운드 보호막 +9.', effect: { turnShield: 9 } },
  { id: 'overdrive', name: '광휘의 각성', icon: '🌟', rarity: 'rare', desc: '매 라운드 기력 +8.', effect: { turnEnergy: 8 } },
  // --- 확장 세트(2026-07-24) ---
  { id: 'ironwill', name: '강철 의지', icon: '🪛', rarity: 'rare', desc: '받는 피해 -5.', effect: { damageReduction: 5 } },
  { id: 'vitality', name: '활력의 정수', icon: '🌿', rarity: 'epic', desc: '최대 체력 +23, 매 라운드 체력 +2.', effect: { maxHpBonus: 23, regen: 2 } },
  { id: 'spark-chip', name: '불티 부적', icon: '✨', rarity: 'common', desc: '매 라운드 기력 +6.', effect: { turnEnergy: 6 } },
  { id: 'aegis-plate', name: '방벽판', icon: '🔰', rarity: 'rare', desc: '매 라운드 보호막 +10.', effect: { turnShield: 10 } },
  { id: 'greatfang', name: '대송곳니', icon: '🧛', rarity: 'epic', desc: '공격으로 피해를 주면 체력 6 회복.', effect: { lifesteal: 6 } },
  { id: 'spikes', name: '대못 갑옷', icon: '🦔', rarity: 'rare', desc: '피해를 입으면 공격자에게 6 반사.', effect: { thorns: 6 } },
  { id: 'eternal-ember', name: '영원의 불씨', icon: '🔆', rarity: 'epic', desc: '전투당 한 번, 체력 30으로 되살아난다.', effect: { revive: 30 } },
  { id: 'brute', name: '괴력의 장갑', icon: '💪', rarity: 'rare', desc: '내 공격 피해 +5.', effect: { attackBonus: 5 } },
  { id: 'regen-core', name: '재생의 씨앗', icon: '🌱', rarity: 'rare', desc: '매 라운드 체력 +4.', effect: { regen: 4 } },
  { id: 'glasscannon', name: '유리 심장', icon: '🔻', rarity: 'epic', desc: '내 공격 피해 +9, 최대 체력 -20.', effect: { attackBonus: 9, maxHpBonus: -20 } },
  { id: 'balance', name: '균형의 저울', icon: '⚖️', rarity: 'rare', desc: '매 라운드 기력 +3, 보호막 +3, 체력 +1.', effect: { turnEnergy: 3, turnShield: 3, regen: 1 } },
  { id: 'fortress', name: '성채의 주춧돌', icon: '🏰', rarity: 'epic', desc: '최대 체력 +20, 받는 피해 -3.', effect: { maxHpBonus: 20, damageReduction: 3 } },
  { id: 'quickcharge', name: '성급한 각성', icon: '🌠', rarity: 'common', desc: '매 라운드 기력 +5, 내 공격 피해 +2.', effect: { turnEnergy: 5, attackBonus: 2 } },
  { id: 'lifebloom', name: '생명꽃', icon: '🌸', rarity: 'rare', desc: '최대 체력 +10, 매 라운드 체력 +3.', effect: { maxHpBonus: 10, regen: 3 } },
  { id: 'razor', name: '면도날 파편', icon: '🔪', rarity: 'rare', desc: '내 공격 피해 +3, 적중 시 상대 보호막 제거.', effect: { attackBonus: 3, shieldBreak: true } },
  { id: 'juggernaut', name: '파성추', icon: '🐂', rarity: 'epic', desc: '최대 체력 +15, 내 공격 피해 +4.', effect: { maxHpBonus: 15, attackBonus: 4 } },
  { id: 'sanctuary', name: '성역의 문장', icon: '⛩', rarity: 'epic', desc: '매 라운드 보호막 +7, 체력 +3.', effect: { turnShield: 7, regen: 3 } },

  // --- 조합형 세트(2026-07-31) — 누적 기력 트리거 / 저체력 폭주 / 경제 -------
  // "말도 안 되는 뽕맛"을 내는 재료들. 하나만 끼면 준수하고, 서로 물리면 폭발한다
  // (예: 기력 강탈 카드로 기력을 굴리며 넘치는 술잔 + 뇌운의 고리 + 순환의 매듭).
  // 대신 재료가 다 모이려면 희귀도 가중 추첨을 여러 번 통과해야 한다(⑫ 참고).
  {
    id: 'capacitor', name: '넘치는 술잔', icon: '🍷', rarity: 'epic',
    desc: '기력을 100 쓸 때마다 상대를 그 라운드 기절시킨다.',
    effect: { energyTriggers: [{ per: 100, stun: 1, label: '술잔 범람' }] },
  },
  {
    id: 'coil', name: '뇌운의 고리', icon: '⚡', rarity: 'legend',
    desc: '기력을 60 쓸 때마다 상대를 그 라운드 기절시키고 13 고정 피해를 준다.',
    effect: { energyTriggers: [{ per: 60, stun: 1, damage: 13, label: '뇌격' }] },
  },
  {
    id: 'circuit', name: '순환의 매듭', icon: '🔗', rarity: 'rare',
    desc: '기력을 50 쓸 때마다 체력을 13 회복한다.',
    effect: { energyTriggers: [{ per: 50, heal: 13, label: '순환' }] },
  },
  {
    id: 'condenser', name: '응결의 수정', icon: '🔆', rarity: 'rare',
    desc: '기력을 40 쓸 때마다 보호막 +15.',
    effect: { energyTriggers: [{ per: 40, shield: 15, label: '응결' }] },
  },
  {
    id: 'flywheel', name: '쉼 없는 물레', icon: '🌀', rarity: 'epic',
    desc: '기력을 45 쓸 때마다 기력 +23. 큰 카드를 계속 쏘게 해준다.',
    effect: { energyTriggers: [{ per: 45, energy: 23, label: '물레 회전' }] },
  },
  {
    id: 'reservoir', name: '심층 저수조', icon: '🛢', rarity: 'legend',
    desc: '기력을 30 쓸 때마다 체력 +6, 보호막 +6, 기력 +10.',
    effect: { energyTriggers: [{ per: 30, heal: 6, shield: 6, energy: 10, label: '저수조 방출' }] },
  },
  {
    id: 'lastditch', name: '벼랑의 각오', icon: '🔥', rarity: 'epic',
    desc: '체력이 절반 이하면 내 공격 피해 +50%.',
    effect: { lowHpBonusPct: 50 },
  },
  {
    id: 'deathwish', name: '사경의 광기', icon: '💀', rarity: 'legend',
    desc: '체력이 절반 이하면 내 공격 피해 +100%. 최대 체력 -12.',
    effect: { lowHpBonusPct: 100, maxHpBonus: -12 },
  },
  {
    id: 'emberheart', name: '잿불 심장', icon: '🫀', rarity: 'rare',
    desc: '체력이 절반 이하면 내 공격 피해 +25%, 매 라운드 체력 +2.',
    effect: { lowHpBonusPct: 25, regen: 2 },
  },
  {
    id: 'voidedge', name: '공허의 날', icon: '🗡', rarity: 'legend',
    desc: '내 모든 공격이 상대 보호막을 무시하고 관통한다.',
    effect: { alwaysPierce: true },
  },
  {
    id: 'concussor', name: '강타의 인장', icon: '💥', rarity: 'epic',
    desc: '전투당 두 번, 내 공격이 피해를 주면 상대를 그 라운드 기절시킨다.',
    effect: { stunOnHit: 1, stunCap: 2 },
  },
  {
    id: 'firstguard', name: '선제 방벽', icon: '🚧', rarity: 'common',
    desc: '전투 첫 라운드에 보호막 +20.',
    effect: { openingShield: 40 },
  },
  {
    id: 'warmup', name: '불씨 지피기', icon: '🔥', rarity: 'common',
    desc: '전투 첫 라운드에 보호막 +10, 매 라운드 기력 +3.',
    effect: { openingShield: 20, turnEnergy: 3 },
  },

  // --- 확장 세트 2 (2026-07-31) — 빈 메커니즘 보강(기절·반사·관통·저체력·지속회복) --
  {
    id: 'taser', name: '마비의 가시', icon: '🦂', rarity: 'rare',
    desc: '기력을 75 쓸 때마다 상대를 그 라운드 기절시킨다.',
    effect: { energyTriggers: [{ per: 75, stun: 1, label: '마비' }] },
  },
  {
    id: 'dischargelens', name: '집광 수정', icon: '🔮', rarity: 'epic',
    desc: '기력을 55 쓸 때마다 상대에게 18 고정 피해(보호막 무시).',
    effect: { energyTriggers: [{ per: 55, damage: 18, label: '집광' }] },
  },
  {
    id: 'thorncrown', name: '가시 왕관', icon: '👑', rarity: 'epic',
    desc: '피해를 입으면 공격자에게 8 반사.', effect: { thorns: 8 },
  },
  {
    id: 'hedgehog', name: '고슴도치 갑주', icon: '🦔', rarity: 'rare',
    desc: '받는 피해 -3, 피격 시 공격자에게 4 반사.', effect: { damageReduction: 3, thorns: 4 },
  },
  {
    id: 'sanctum', name: '재생의 성소', icon: '🌿', rarity: 'epic',
    desc: '매 라운드 체력 +6.', effect: { regen: 6 },
  },
  {
    id: 'reaperscythe', name: '수확자의 낫', icon: '🌾', rarity: 'rare',
    desc: '공격으로 피해를 주면 체력 3 회복. 내 공격 피해 +3.', effect: { lifesteal: 3, attackBonus: 3 },
  },
  {
    id: 'lastresort', name: '배수진', icon: '🩸', rarity: 'epic',
    desc: '체력이 절반 이하면 내 공격 피해 +40%. 피격 시 공격자에게 4 반사.',
    effect: { lowHpBonusPct: 40, thorns: 4 },
  },
  {
    id: 'piercecore', name: '꿰뚫는 송곳', icon: '🪡', rarity: 'epic',
    desc: '내 모든 공격이 상대 보호막을 관통한다. 최대 체력 -12.',
    effect: { alwaysPierce: true, maxHpBonus: -12 },
  },
  {
    id: 'chainshock', name: '연쇄 벼락', icon: '⛈', rarity: 'epic',
    desc: '전투당 세 번, 내 공격이 피해를 주면 상대를 그 라운드 기절시킨다.',
    effect: { stunOnHit: 1, stunCap: 3 },
  },
  {
    id: 'vanguard', name: '선봉대장', icon: '🎖', rarity: 'rare',
    desc: '전투 첫 라운드에 보호막 +15. 내 공격 피해 +3.', effect: { openingShield: 30, attackBonus: 3 },
  },
  {
    id: 'meditation', name: '명상의 룬', icon: '🧘', rarity: 'common',
    desc: '매 라운드 체력 +3, 보호막 +3.', effect: { regen: 3, turnShield: 3 },
  },
  {
    id: 'giantserum', name: '거인 혈청', icon: '🧪', rarity: 'legend',
    desc: '최대 체력 +43.', effect: { maxHpBonus: 43 },
  },
  {
    id: 'tinder', name: '불씨 심지', icon: '🪔', rarity: 'rare',
    desc: '전투당 한 번 체력 13로 되살아난다. 매 라운드 체력 +2.', effect: { revive: 13, regen: 2 },
  },
  {
    id: 'bloodpact-relic', name: '피의 계약', icon: '🩸', rarity: 'legend',
    desc: '내 공격 피해 +6. 공격으로 피해를 주면 체력 4 회복. 최대 체력 -7.',
    effect: { attackBonus: 6, lifesteal: 4, maxHpBonus: -7 },
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
  //
  // ⚠ **`bonusVsAfflicted`가 ÷2 리스케일을 빠뜨리고 있었다(2026-08-07 발견·수정).**
  //   2026-08-05에 설명 스크립트는 이 숫자를 절반으로 내렸는데 값 스크립트가 이
  //   필드를 매그니튜드로 인식하지 못해 값만 그대로 남았다 — 8종이 전부 **표기의
  //   2배로** 때리고 있었다. 사용자 결정으로 **값을 절반으로 내려** 표기(= 원래 의도한
  //   ÷2 스케일)에 맞췄다. 이 훅은 **평면 가산**이라 기본 공격이 5~7인 지금 스케일에서
  //   +14는 기본기 두세 대 값이었다.
  //   ⚠ 값을 다시 만질 생각이면 반드시 `sim:run --sweep` 5시드로 전후를 재고 들어갈 것.
  { id: 'venomflask', name: '독약 플라스크', icon: '🧪', rarity: 'common', desc: '공격으로 피해를 주면 중독 1라운드를 묻힌다.', effect: { poisonOnHit: 1 } },
  { id: 'emberbrand', name: '잉걸 낙인', icon: '🔥', rarity: 'common', desc: '공격으로 피해를 주면 화상 1라운드를 묻힌다.', effect: { burnOnHit: 1 } },
  { id: 'coldiron', name: '차가운 쇠', icon: '❄️', rarity: 'common', desc: '상태이상에 걸린 상대에게 주는 피해 +3.', effect: { bonusVsAfflicted: 3 } },
  { id: 'wickedmortar', name: '사악한 절구', icon: '⚗️', rarity: 'rare', desc: '내가 거는 중독·화상 위력 +40%.', effect: { statusPowerPct: 40 } },
  { id: 'plaguebearer', name: '역병 운반자', icon: '🐀', rarity: 'rare', desc: '피해를 주면 중독 2라운드를 묻히고, 내 중독·화상 위력 +20%.', effect: { poisonOnHit: 2, statusPowerPct: 20 } },
  { id: 'pyremark', name: '화형의 표식', icon: '🕯', rarity: 'epic', desc: '피해를 주면 화상 2라운드를 묻히고, 상태이상에 걸린 상대에게 피해 +4.', effect: { burnOnHit: 2, bonusVsAfflicted: 4 } },
  { id: 'hunterspite', name: '사냥꾼의 앙심', icon: '🎯', rarity: 'epic', desc: '상태이상에 걸린 상대에게 피해 +7. 보호막을 무시한다.', effect: { bonusVsAfflicted: 7, alwaysPierce: true } },
  { id: 'rotcrown', name: '부패의 왕관', icon: '👑', rarity: 'legend', desc: '피해를 주면 중독 2라운드·화상 2라운드를 함께 묻히고, 중독·화상 위력 +50%, 상태이상 상대에게 피해 +5.', effect: { poisonOnHit: 2, burnOnHit: 2, statusPowerPct: 50, bonusVsAfflicted: 5 } },

  // =========================================================================
  // 확장 세트 3 (2026-08-05) — 유물 종류 2배
  //
  // 앞선 세트가 "같은 훅의 수치 차이"로 불어나 있었다(피해감소 5·6·10, 흡혈 5·6·9·12…).
  // 그래서 이번엔 **훅을 여섯 개 새로 파고**(`roster.ts` Passive 확장 훅) 그 위에
  // 세트를 짰다. 새 유물이 만드는 새 빌드는 이렇다:
  //   빙결 부여   freezeOnHit  — 그 라운드를 통째로 지운다(단, 때리면 깨진다)
  //   방벽 증폭   guardPowerPct— 수비 카드를 낸 턴만 보상. 버티기 연타 빌드
  //   치유 증폭   healPowerPct — 회복 카드·regen을 함께 키운다. 장기전 빌드
  //   시작 기력   startEnergyBonus — 1턴부터 큰 카드. 짧고 굵게 끝내는 빌드
  //   처형        executeBonusPct — 상대가 반피 이하일 때 배율. 마무리 빌드
  //   발판        collapseResist  — 무너진 칸을 딛고 버틴다(전장 붕괴 대응)
  // ⚠ 희귀도별 **파워 예산을 기존 세트에 맞췄다** — 아래 새 70종은 유물 풀을 두 배로
  //   희석하므로, 평균 세기가 어긋나면 클리어율이 통째로 움직인다(실제로 측정했다).

  // --- 빙결 부여 계열 -------------------------------------------------------
  { id: 'frostbite', name: '동상의 손', icon: '🧊', rarity: 'common', desc: '전투당 두 번, 피해를 주면 상대를 그 라운드 빙결.', effect: { freezeOnHit: 1 } },
  { id: 'glacier', name: '빙하의 파편', icon: '❄️', rarity: 'rare', desc: '전투당 세 번, 피해를 주면 상대를 그 라운드 빙결. 받는 피해 -2.', effect: { freezeOnHit: 1, freezeCap: 3, damageReduction: 2 } },
  { id: 'permafrost', name: '만년설', icon: '🏔', rarity: 'epic', desc: '전투당 네 번, 피해를 주면 상대를 그 라운드 빙결. 내 공격 피해 +3.', effect: { freezeOnHit: 1, freezeCap: 4, attackBonus: 3 } },
  { id: 'rimeheart', name: '서릿발 심장', icon: '💙', rarity: 'legend', desc: '전투당 여섯 번, 피해를 주면 상대를 그 라운드 빙결. 상태이상 상대에게 피해 +6.', effect: { freezeOnHit: 1, freezeCap: 6, bonusVsAfflicted: 6 } },
  { id: 'coldsnap', name: '한파', icon: '🌨', rarity: 'rare', desc: '전투당 두 번 빙결을 걸고, 내가 거는 중독·화상 위력 +25%.', effect: { freezeOnHit: 1, statusPowerPct: 25 } },

  // --- 방벽 증폭 계열 -------------------------------------------------------
  { id: 'buckler', name: '단단한 손잡이', icon: '🛡', rarity: 'common', desc: '수비 카드의 흡수량 +35%.', effect: { guardPowerPct: 35 } },
  { id: 'towershield', name: '탑 방패', icon: '🗼', rarity: 'rare', desc: '수비 카드의 흡수량 +60%.', effect: { guardPowerPct: 60 } },
  { id: 'rampart', name: '성벽의 맹세', icon: '🧱', rarity: 'epic', desc: '수비 카드의 흡수량 +80%, 최대 체력 +13.', effect: { guardPowerPct: 80, maxHpBonus: 13 } },
  { id: 'aegisoath', name: '불괴의 서약', icon: '⚜️', rarity: 'legend', desc: '수비 카드의 흡수량 +120%, 첫 라운드 보호막 +20, 받는 피해 -3.', effect: { guardPowerPct: 120, openingShield: 40, damageReduction: 3 } },
  { id: 'spiked-boss', name: '가시 방패심', icon: '🔩', rarity: 'rare', desc: '수비 카드의 흡수량 +40%, 피격 시 5 반사.', effect: { guardPowerPct: 40, thorns: 5 } },

  // --- 치유 증폭 계열 -------------------------------------------------------
  { id: 'poultice', name: '약초 습포', icon: '🌾', rarity: 'common', desc: '회복 카드와 매 라운드 체력 회복 +40%.', effect: { healPowerPct: 40 } },
  { id: 'elixir', name: '비약', icon: '⚗️', rarity: 'rare', desc: '회복량 +70%, 매 라운드 체력 +2.', effect: { healPowerPct: 70, regen: 2 } },
  { id: 'lifewell', name: '생명의 우물', icon: '🕳', rarity: 'epic', desc: '회복량 +100%, 매 라운드 체력 +3.', effect: { healPowerPct: 100, regen: 3 } },
  { id: 'worldtree', name: '세계수 가지', icon: '🌳', rarity: 'legend', desc: '회복량 +140%, 매 라운드 체력 +4, 최대 체력 +15.', effect: { healPowerPct: 140, regen: 4, maxHpBonus: 15 } },
  { id: 'bloodleaf', name: '피의 잎사귀', icon: '🍁', rarity: 'rare', desc: '회복량 +50%, 피해를 주면 체력 3 회복.', effect: { healPowerPct: 50, lifesteal: 3 } },

  // --- 시작 기력 계열 -------------------------------------------------------
  { id: 'primer', name: '점화약', icon: '🧨', rarity: 'common', desc: '전투 시작 기력 +13.', effect: { startEnergyBonus: 13 } },
  { id: 'kindling', name: '마른 장작', icon: '🪵', rarity: 'common', desc: '전투 시작 기력 +8, 첫 라운드 보호막 +8.', effect: { startEnergyBonus: 8, openingShield: 15 } },
  { id: 'jumpstart', name: '출진의 북', icon: '🥁', rarity: 'rare', desc: '전투 시작 기력 +20.', effect: { startEnergyBonus: 20 } },
  { id: 'bigbang', name: '개전의 봉화', icon: '🧨', rarity: 'epic', desc: '전투 시작 기력 +28, 내 공격 피해 +3.', effect: { startEnergyBonus: 28, attackBonus: 3 } },
  { id: 'firstlight', name: '여명의 불꽃', icon: '🌅', rarity: 'legend', desc: '전투 시작 기력 +35, 첫 라운드 보호막 +23, 매 라운드 기력 +4.', effect: { startEnergyBonus: 35, openingShield: 45, turnEnergy: 4 } },

  // --- 처형 계열 ------------------------------------------------------------
  { id: 'finisher', name: '마무리 칼', icon: '🔪', rarity: 'common', desc: '상대 체력이 절반 이하면 내 공격 피해 +25%.', effect: { executeBonusPct: 25 } },
  { id: 'headsman', name: '망나니의 도끼', icon: '🪓', rarity: 'rare', desc: '상대 체력이 절반 이하면 내 공격 피해 +45%.', effect: { executeBonusPct: 45 } },
  { id: 'guillotine', name: '단두대', icon: '⚰️', rarity: 'epic', desc: '상대 체력이 절반 이하면 내 공격 피해 +70%.', effect: { executeBonusPct: 70 } },
  { id: 'reaperveil', name: '사신의 장막', icon: '☠️', rarity: 'legend', desc: '상대 체력이 절반 이하면 내 공격 피해 +100%. 보호막을 무시한다.', effect: { executeBonusPct: 100, alwaysPierce: true } },
  { id: 'vulture', name: '독수리 눈', icon: '🦅', rarity: 'rare', desc: '상대가 반피 이하면 피해 +30%, 피해를 주면 체력 3 회복.', effect: { executeBonusPct: 30, lifesteal: 3 } },
  { id: 'closer', name: '숨통', icon: '🫁', rarity: 'epic', desc: '상대가 반피 이하면 피해 +40%, 내가 반피 이하면 피해 +40%.', effect: { executeBonusPct: 40, lowHpBonusPct: 40 } },

  // --- 발판 계열 (전장 붕괴 대응) -------------------------------------------
  { id: 'ironshoes', name: '무쇠 신발', icon: '🥾', rarity: 'common', desc: '무너진 칸에서 받는 피해 -4.', effect: { collapseResist: 8 } },
  { id: 'anchorstone', name: '고정 말뚝', icon: '⚓', rarity: 'rare', desc: '무너진 칸에서 받는 피해 -7, 최대 체력 +8.', effect: { collapseResist: 14, maxHpBonus: 8 } },
  { id: 'skywalk', name: '허공 걸음', icon: '☁️', rarity: 'epic', desc: '무너진 칸에서 받는 피해 -12. 무너진 판을 그냥 딛고 선다.', effect: { collapseResist: 24 } },
  { id: 'worldpillar', name: '세계의 기둥', icon: '🏛', rarity: 'legend', desc: '무너진 칸 피해를 완전히 무시하고, 매 라운드 보호막 +6.', effect: { collapseResist: 99, turnShield: 6 } },

  // --- 기존 훅 조합 보강 — 빈자리를 메우는 조합들 ---------------------------
  { id: 'gravepact', name: '무덤의 약조', icon: '⚱️', rarity: 'rare', desc: '전투당 한 번 체력 18로 되살아난다. 받는 피해 -2.', effect: { revive: 18, damageReduction: 2 } },
  { id: 'secondwind', name: '두 번째 숨', icon: '🌬', rarity: 'epic', desc: '전투당 한 번 체력 23로 되살아나고, 되살아날 힘으로 매 라운드 체력 +3.', effect: { revive: 23, regen: 3 } },
  { id: 'stoneskin', name: '돌갗', icon: '🗿', rarity: 'epic', desc: '받는 피해 -7.', effect: { damageReduction: 7 } },
  { id: 'adamant', name: '금강석 갑주', icon: '💎', rarity: 'legend', desc: '받는 피해 -9, 최대 체력 +13.', effect: { damageReduction: 9, maxHpBonus: 13 } },
  { id: 'warhorn', name: '전쟁 나팔', icon: '📯', rarity: 'common', desc: '내 공격 피해 +2, 첫 라운드 보호막 +9.', effect: { attackBonus: 2, openingShield: 18 } },
  { id: 'duelist', name: '결투가의 검', icon: '🤺', rarity: 'epic', desc: '내 공격 피해 +8.', effect: { attackBonus: 8 } },
  { id: 'godslayer', name: '신살자의 창', icon: '🔱', rarity: 'legend', desc: '내 공격 피해 +10, 보호막을 무시한다. 최대 체력 -10.', effect: { attackBonus: 10, alwaysPierce: true, maxHpBonus: -10 } },
  { id: 'gluttony', name: '탐식의 이빨', icon: '😋', rarity: 'legend', desc: '피해를 주면 체력 8 회복. 최대 체력 -10.', effect: { lifesteal: 8, maxHpBonus: -10 } },
  { id: 'moonwell', name: '달빛 샘', icon: '🌙', rarity: 'rare', desc: '매 라운드 체력 +2, 보호막 +5.', effect: { regen: 2, turnShield: 5 } },
  { id: 'dynamo', name: '마력의 샘', icon: '💧', rarity: 'rare', desc: '매 라운드 기력 +6, 시작 기력 +10.', effect: { turnEnergy: 6, startEnergyBonus: 10 } },
  { id: 'stormcell', name: '폭풍의 정수', icon: '🌩', rarity: 'epic', desc: '매 라운드 기력 +9, 시작 기력 +13.', effect: { turnEnergy: 9, startEnergyBonus: 13 } },
  { id: 'perpetual', name: '영원의 수레바퀴', icon: '☸️', rarity: 'legend', desc: '매 라운드 기력 +12, 보호막 +5.', effect: { turnEnergy: 12, turnShield: 5 } },
  { id: 'barbwire', name: '가시철선', icon: '🪢', rarity: 'common', desc: '피격 시 공격자에게 3 반사.', effect: { thorns: 3 } },
  { id: 'retribution', name: '응보의 문장', icon: '⚖️', rarity: 'legend', desc: '피격 시 11 반사, 받는 피해 -2.', effect: { thorns: 11, damageReduction: 2 } },
  { id: 'oxheart', name: '황소 심장', icon: '🐂', rarity: 'rare', desc: '최대 체력 +19.', effect: { maxHpBonus: 19 } },
  { id: 'colossus', name: '거상의 뼈', icon: '🦴', rarity: 'legend', desc: '최대 체력 +35, 받는 피해 -3. 대신 내 공격 피해 -2.', effect: { maxHpBonus: 35, damageReduction: 3, attackBonus: -2 } },
  { id: 'martyr', name: '순교자의 못', icon: '🩻', rarity: 'epic', desc: '최대 체력 -17, 받는 피해 -6, 피격 시 5 반사.', effect: { maxHpBonus: -17, damageReduction: 6, thorns: 5 } },
  { id: 'hollowking', name: '공허의 왕관', icon: '👑', rarity: 'legend', desc: '보호막을 무시하고, 상대가 반피 이하면 피해 +55%.', effect: { alwaysPierce: true, executeBonusPct: 55 } },
  { id: 'shatterfang', name: '파쇄 송곳니', icon: '🦈', rarity: 'epic', desc: '적중 시 상대 보호막을 없애고, 피해를 주면 체력 4 회복.', effect: { shieldBreak: true, lifesteal: 4 } },
  { id: 'punisher', name: '처벌자의 손', icon: '✊', rarity: 'rare', desc: '전투당 두 번, 피해를 주면 상대를 그 라운드 기절시킨다. 받는 피해 -2.', effect: { stunOnHit: 1, stunCap: 2, damageReduction: 2 } },
  { id: 'oblivion', name: '망각의 종', icon: '🔔', rarity: 'legend', desc: '전투당 다섯 번, 피해를 주면 상대를 그 라운드 기절시킨다.', effect: { stunOnHit: 1, stunCap: 5 } },

  // --- 누적 기력 트리거 보강 ------------------------------------------------
  {
    id: 'sparkplug', name: '부싯돌', icon: '🪨', rarity: 'common',
    desc: '기력을 70 쓸 때마다 보호막 +13.',
    effect: { energyTriggers: [{ per: 70, shield: 13, label: '불붙이기' }] },
  },
  {
    id: 'siphonring', name: '흡혈의 반지', icon: '💍', rarity: 'rare',
    desc: '기력을 65 쓸 때마다 체력 +15.',
    effect: { energyTriggers: [{ per: 65, heal: 15, label: '반지의 갈증' }] },
  },
  {
    id: 'turbine', name: '질풍의 고동', icon: '🌬', rarity: 'rare',
    desc: '기력을 60 쓸 때마다 기력 +25.',
    effect: { energyTriggers: [{ per: 60, energy: 25, label: '질풍' }] },
  },
  {
    id: 'sunforge', name: '태양의 화로', icon: '☀️', rarity: 'epic',
    desc: '기력을 50 쓸 때마다 상대에게 15 고정 피해, 내 보호막 +8.',
    effect: { energyTriggers: [{ per: 50, damage: 15, shield: 8, label: '화로 폭발' }] },
  },
  {
    id: 'doomclock', name: '종말의 모래시계', icon: '⏳', rarity: 'legend',
    desc: '기력을 38 쓸 때마다 상대에게 20 고정 피해.',
    effect: { energyTriggers: [{ per: 38, damage: 20, label: '모래 한 알' }] },
  },
  {
    id: 'gearbox', name: '운명의 톱니', icon: '⚙️', rarity: 'epic',
    desc: '기력을 43 쓸 때마다 기력 +15, 체력 +8.',
    effect: { energyTriggers: [{ per: 43, energy: 15, heal: 8, label: '톱니 맞물림' }] },
  },
  {
    id: 'coldengine', name: '동토의 숨결', icon: '🧊', rarity: 'epic',
    desc: '기력을 48 쓸 때마다 상대를 그 라운드 기절시키고 내 보호막 +10.',
    effect: { energyTriggers: [{ per: 48, stun: 1, shield: 10, label: '동토의 한기' }] },
  },

  // --- 저체력 폭주 보강 -----------------------------------------------------
  { id: 'cornered', name: '궁지의 이빨', icon: '🐺', rarity: 'common', desc: '체력이 절반 이하면 내 공격 피해 +20%.', effect: { lowHpBonusPct: 20 } },
  { id: 'painengine', name: '고통의 제단', icon: '🖤', rarity: 'rare', desc: '체력이 절반 이하면 피해 +35%, 매 라운드 기력 +3.', effect: { lowHpBonusPct: 35, turnEnergy: 3 } },
  { id: 'ragebrand', name: '격노의 낙인', icon: '🥵', rarity: 'epic', desc: '체력이 절반 이하면 피해 +60%, 피해를 주면 체력 3 회복.', effect: { lowHpBonusPct: 60, lifesteal: 3 } },
  { id: 'phoenixrage', name: '잿불의 격정', icon: '🔥', rarity: 'legend', desc: '체력이 절반 이하면 피해 +80%. 전투당 한 번 체력 15으로 되살아난다.', effect: { lowHpBonusPct: 80, revive: 15 } },

  // --- 상태이상 보강 --------------------------------------------------------
  { id: 'toxinvial', name: '맹독 병', icon: '🧫', rarity: 'rare', desc: '피해를 주면 중독 2라운드를 묻힌다.', effect: { poisonOnHit: 2 } },
  { id: 'cinderbrand', name: '잿불 인장', icon: '🕯', rarity: 'rare', desc: '피해를 주면 화상 2라운드를 묻힌다.', effect: { burnOnHit: 2 } },
  { id: 'witchbrew', name: '마녀의 탕약', icon: '🍯', rarity: 'epic', desc: '내가 거는 중독·화상 위력 +65%.', effect: { statusPowerPct: 65 } },
  { id: 'bonepicker', name: '뼈 발라내기', icon: '🦴', rarity: 'rare', desc: '상태이상에 걸린 상대에게 피해 +5.', effect: { bonusVsAfflicted: 5 } },
  { id: 'blightlord', name: '역병군주의 인장', icon: '🪱', rarity: 'legend', desc: '피해를 주면 중독 2라운드를 묻히고, 상태이상 상대에게 피해 +7, 중독·화상 위력 +30%.', effect: { poisonOnHit: 2, bonusVsAfflicted: 7, statusPowerPct: 30 } },
  { id: 'ashlung', name: '재의 폐', icon: '🌫', rarity: 'epic', desc: '피해를 주면 화상 2라운드·중독 1라운드를 함께 묻힌다.', effect: { burnOnHit: 2, poisonOnHit: 1 } },
  { id: 'freezerot', name: '동사의 저주', icon: '🥶', rarity: 'legend', desc: '전투당 세 번 빙결을 걸고, 피해를 주면 중독 2라운드·화상 2라운드를 묻힌다.', effect: { freezeOnHit: 1, freezeCap: 3, poisonOnHit: 2, burnOnHit: 2 } },

  // --- 지속 연장 계열 (2026-08-07 2차) — **전부 legend, 런 전용** ------------
  //
  // 다른 상태이상 유물은 **위력**이나 **부여 확률**을 사지만, 이 여섯은 **시간**을 산다.
  // 시간은 다른 모든 훅과 곱해지므로(중독 1라운드가 늘면 그 라운드의 모든 행동이 아프고,
  // 화상 1라운드가 늘면 그 라운드의 모든 피격이 아프다) 값이 작아도 판을 바꾼다.
  // 그래서 **전부 `legend`**로만 낸다 — 층 1에서 ≈6%, 층 15에서 ≈17%로 뽑히고 상점가 230이라
  // "이걸 노리고 굴리는" 빌드가 되려면 깊이 살아남아야 한다.
  //
  // ⚠ **봉인 연장(기절·빙결·속박)은 라운드를 넘어간다.** 무한 봉인이 안 되는 근거는
  //   엔진 `applyStatus`의 **재부여 가드** 하나뿐이다 — 이미 걸린 봉인은 다시 안 걸리므로
  //   "이번 라운드 + 다음 라운드"가 끝이고 그다음 라운드엔 반드시 일어난다. 그 가드를
  //   지우면 이 유물들이 곧바로 "상대가 영원히 못 움직인다"가 된다.
  // ⚠ **`ROSTER.passive`·몬스터에 이 훅을 넣지 말 것.** 유물에만 있는 한 규칙 자체가
  //   PvP에 존재하지 않아 `RULES_VERSION`을 안 올려도 된다(`npm run check`가 단정한다).
  {
    id: 'hourglass', name: '썩어드는 모래시계', icon: '⏳', rarity: 'legend',
    desc: '내가 거는 중독이 1라운드 더 간다. 중독·화상 위력 +25%.',
    effect: { poisonRoundBonus: 1, statusPowerPct: 25 },
  },
  {
    id: 'everember', name: '꺼지지 않는 잉걸', icon: '🔥', rarity: 'legend',
    desc: '내가 거는 화상이 1라운드 더 간다. 상태이상에 걸린 상대에게 피해 +6.',
    effect: { burnRoundBonus: 1, bonusVsAfflicted: 6 },
  },
  {
    id: 'sabbath', name: '마녀의 안식일', icon: '🌙', rarity: 'legend',
    desc: '내가 거는 중독·화상이 각각 1라운드 더 간다.',
    effect: { poisonRoundBonus: 1, burnRoundBonus: 1 },
  },
  {
    id: 'silentbell', name: '침묵의 종', icon: '🔕', rarity: 'legend',
    // ⚠ 이 게임에서 가장 위험한 유물이다 — 기절은 상대의 라운드를 통째로 지운다.
    //   재부여 가드가 없으면 그대로 무한 봉인이 되므로, 설명에도 "그다음 라운드엔
    //   깨어난다"를 명시해 플레이어가 기대치를 잘못 잡지 않게 한다.
    desc: '내가 거는 기절이 다음 라운드까지 이어진다. 단, 기절 중에는 다시 걸리지 않아 그다음 라운드엔 깨어난다.',
    effect: { stunRoundBonus: 1 },
  },
  {
    id: 'glacialtomb', name: '빙하의 관', icon: '🧊', rarity: 'legend',
    desc: '내가 거는 빙결이 다음 라운드까지 이어진다. 전투당 네 번까지 빙결을 건다. (맞으면 깨지는 건 그대로)',
    effect: { freezeRoundBonus: 1, freezeOnHit: 1, freezeCap: 4 },
  },
  {
    id: 'grasproot', name: '얽매는 뿌리', icon: '🕸', rarity: 'legend',
    desc: '내가 거는 속박이 다음 라운드까지 이어진다. 받는 피해 -3.',
    effect: { bindRoundBonus: 1, damageReduction: 3 },
  },

  // --- 경제형 보강 ----------------------------------------------------------
  { id: 'ledger', name: '상인의 장부', icon: '📒', rarity: 'common', desc: '상점 가격 12% 할인, 골드 +15%.', effect: {}, mods: { shopDiscountPct: 12, goldBonusPct: 15 } },
  { id: 'caravan', name: '행상 마차', icon: '🛒', rarity: 'rare', desc: '상점 진열 +2칸.', effect: {}, mods: { shopExtraItems: 2 } },
  { id: 'bazaar', name: '암시장 통로', icon: '🏮', rarity: 'epic', desc: '상점 진열 +3칸, 가격 25% 할인.', effect: {}, mods: { shopExtraItems: 3, shopDiscountPct: 25 } },
  { id: 'saddlebag', name: '안장 가방', icon: '👜', rarity: 'common', desc: '덱 상한 +2장.', effect: {}, mods: { deckCapBonus: 2 } },
  { id: 'librarian', name: '사서의 색인', icon: '📚', rarity: 'rare', desc: '승리 보상 선택지 +1칸, 덱 상한 +2장.', effect: {}, mods: { rewardOptions: 1, deckCapBonus: 2 } },
  { id: 'saltpouch', name: '소금 주머니', icon: '🧂', rarity: 'common', desc: '모든 회복 효과 +25%.', effect: {}, mods: { healBonusPct: 25 } },
  { id: 'grailshard', name: '성배 조각', icon: '🏆', rarity: 'epic', desc: '모든 회복 효과 +80%, 회복 카드 회복량 +30%.', effect: { healPowerPct: 30 }, mods: { healBonusPct: 80 } },
  { id: 'ravenomen', name: '까마귀의 전조', icon: '🐦‍⬛', rarity: 'epic', desc: '일반 전투 보상에 유물이 섞일 확률 +18%p.', effect: {}, mods: { relicChanceBonus: 0.18 } },
  { id: 'kingsseal', name: '왕의 봉인', icon: '📜', rarity: 'legend', desc: '승리 보상 선택지 +2칸, 골드 +60%, 상점 진열 +2칸.', effect: {}, mods: { rewardOptions: 2, goldBonusPct: 60, shopExtraItems: 2 } },
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
 *
 * ⚠ **훅 이름을 하나씩 나열하지 않는다**(2026-08-05). 예전엔 `addNum('turnEnergy', …)`
 * 식으로 손으로 적어 뒀는데, 2026-08-01에 추가한 상태이상 훅 네 개
 * (`poisonOnHit`/`burnOnHit`/`statusPowerPct`/`bonusVsAfflicted`)를 여기 적는 걸
 * 빠뜨려서 **상태이상 유물 8종과 궁수·마법사 시그니처의 독·화상이 런에서 통째로
 * 무시되고 있었다**(카드에 붙은 독은 엔진이 따로 처리해 살아 있었기에 겉으론
 * 멀쩡해 보였다). 이제 effect의 키를 그대로 훑으므로 훅을 새로 파도 자동으로 붙는다.
 */
export function mergeRelics(ids: string[]): Passive {
  const out: Passive = { desc: '' }
  const acc = out as unknown as Record<string, unknown>
  for (const id of ids) {
    const r = RELIC_BY_ID[id]
    if (!r) continue
    for (const [k, v] of Object.entries(r.effect)) {
      if (k === 'desc' || v == null) continue
      if (k === 'energyTriggers') {
        // 누적 기력 트리거는 **합치지 않고 이어 붙인다** — 주기가 다른 트리거들이
        // 각자 따로 터져야 조합이 성립한다(주기를 더하면 조합이 오히려 약해진다).
        const list = v as NonNullable<Passive['energyTriggers']>
        if (list.length) out.energyTriggers = [...(out.energyTriggers ?? []), ...list]
      } else if (typeof v === 'number') {
        acc[k] = ((acc[k] as number) ?? 0) + v
      } else if (typeof v === 'boolean') {
        if (v) acc[k] = true
      }
    }
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
