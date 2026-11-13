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
  /** 이벤트에서만 얻는다 — 보상·상점·고블린 풀에 안 나온다. */
  eventOnly?: boolean
}

// --- 직업 패시브(런) — **유물이 아니다** ----------------------------------------
// 2026-11-09 사용자 확정: 서약의 돌무덤 · 독니 화살통 · 혼백의 마법서는 **직업에 붙은 패시브**다.
// 예전엔 `sig-*` 유물로 `run.relicIds`에 넣어 두고 보상·거래에서만 빼 주는 "유물 모양의 패시브"
// 였는데, 유물 목록·유물 줄·도감에 같이 보여 "거래할 수 있는 유물인가?"가 모호했다. 이제
// `RELICS`·`run.relicIds` 어디에도 없고 `mergeRelics(ids, charId)`가 직업에서 직접 얹는다.
// ⚠ `maxHpBonus`가 직업 밴드를 맞추는 손잡이라 거래·분실이 가능하면 안 된다 — 그래서 패시브다.
// `id`(`sig-*`)는 아이콘 아틀라스 키로만 남았다.
//
// **런 보정(runEffect, 2026-07-30)**: 캐릭터 패시브를 그대로 유물화하면 런 클리어율이
// 27~57%로 벌어진다(캐릭터별 대량 시뮬 — docs/rules/RUN.md ⑪). 이유는 구조적이다:
//   ① 체력이 층 사이에 이어지는 런에선 **지속회복 > 피해감소**다(감소는 출혈을 늦추고,
//      회복은 되돌린다) → 회복 수단이 없는 캐릭터가 누적 출혈로 죽는다.
//   ② 런의 제약은 기력이 아니라 **슬롯 3칸**이다(쿨0 공격은 턴당 1회, 기력은 턴마다
//      쌓임) → 매 라운드 기력을 크게 주는 패시브가 큰 카드를 매 라운드 쏘게 해 압도한다.
// 그래서 직업 패시브는 PvP 패시브에서 출발하되 **런 수치를 따로 지정**한다(가감 모두).
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
    // ⚠ **AI 예측 개편(2026-08-10)에서 전사가 제일 크게 무너졌다** — 31.6 → 13%.
    //   사거리 1칸이라 붙는 동안 통째로 얻어맞는데, 몬스터가 이제 걸어오는 나를
    //   정확히 조준한다(원거리 hard 몬스터에 특히 약하다 — 팬텀 45.8% · 화염군주
    //   52.7%). 56 → 107로 되돌렸다. 민감도 ≈ **0.16%p/HP**로 셋 중 가장 둔하다.
    runEffect: { damageReduction: 2, regen: 2, thorns: 2, maxHpBonus: 97 },
    desc: '서약의 돌무덤: 최대 체력 +97, 받는 공격 피해 -2, 매 라운드 체력 +2, 피격 시 2 반사.',
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
    // ⚠ **민감도가 뒤집혔다(2026-08-10)** — 예전 문서의 "1포인트 ≈ 0.43%p"가 아니라
    //   지금은 **≈0.64%p/HP**로 셋 중 압도적으로 민감하다. 거리를 벌고 싸우는 쪽이라
    //   AI 예측 개편의 타격이 제일 적었고(24.7%), 그래서 18 → 16으로 **내려서** 맞췄다.
    //   전사·마법사와 달리 궁수는 몇 포인트로 밴드가 통째로 움직인다.
    // 흡혈 2는 2026-11-10, 중독 2는 2026-11-12(중독 개편 — `STATUS.md` 1절) 사용자 지정으로 뺐다.
    runEffect: { attackBonus: 5, damageReduction: 2, maxHpBonus: 19 },
    desc: '독니 화살통: 최대 체력 +19, 받는 피해 -2. 내 공격 피해 +5.',
  },
  mage: {
    id: 'sig-mage', name: '혼백의 마법서', icon: '📖',
    // 마법사는 기력으로 큰 주문을 계속 돌리고 보호막으로 버틴다.
    // ⚠ turnEnergy는 봇 인공물을 만들어 측정이 튄다(GDD ⑪) — 조정은 체력·보호막으로
    // 하고 이 값은 고정해 둘 것. 실제로 turnEnergy 10은 최대체력 14와 맞먹었다.
    // ⚠ AI 예측 개편(2026-08-10)으로 57 → 80. 민감도 ≈ **0.23%p/HP**.
    // 2026-11-10 사용자 지정: 런 시작 체력은 **전사 200 · 궁수 100 · 마법사 100**으로 못 박는다
    //   (마법사가 전사만큼 단단한 건 이상하다). 마법사는 대신 **전투 시작 보호막 +30**.
    //   ⚠ 그래서 직업 밴드를 더는 maxHpBonus로 못 맞춘다. 체력 100 + 시작 보호막만으로는 5%였고
    //   (카드를 원거리·속박으로 바꾼 뒤에도), **매 라운드 보호막(turnShield) 3 → 13**으로 메웠다 —
    //   7 = 11.9% · 11 = 20.4% · 13 = 26.6%(≈2.1%p/점). 마법사의 손잡이는 이제 이 값이다.
    // 화상 2(`burnOnHit`)는 2026-11-13 화상 개편(`STATUS.md` 2절)으로 뺐다 — 다른 효과는 사용자가 추후 정한다.
    runEffect: { turnEnergy: 5, turnShield: 13, damageReduction: 2, maxHpBonus: 22, openingShield: 30 },
    desc: '혼백의 마법서: 최대 체력 +22, 전투 시작 보호막 +30, 받는 피해 -2. 매 라운드 기력 +5·보호막 +13.',
  },
}

export interface ClassPassive {
  /** 아이콘 아틀라스 키(`sig-*`) — 유물 id가 아니다. */
  id: string
  name: string
  icon: string
  desc: string
  effect: Omit<Passive, 'desc'>
}
/** 이 직업의 런 패시브. 런 밖(PvP·봇전)은 `ROSTER.passive`를 그대로 쓴다. */
export function classPassive(charId: string): ClassPassive | undefined {
  const meta = SIGNATURE[charId]
  const c = ROSTER.find((x) => x.id === charId)
  if (!meta || !c) return undefined
  const { desc, ...base } = c.passive
  return { id: meta.id, name: meta.name, icon: meta.icon, desc: meta.desc ?? desc, effect: meta.runEffect ?? base }
}

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
  // 「치유의 이끼」(regen 3)를 지우고 이 자리에 넣었다(2026-11-09 사용자 지정). 초록 정령 이벤트의
  // 보상이자 세계수 이벤트의 열쇠다 — 보상·상점에서도 나온다.
  { id: 'seed', name: '의문의 씨앗', icon: '🌱', rarity: 'rare', desc: '매 라운드 체력 +5.', effect: { regen: 5 } },
  { id: 'rage', name: '분노의 인장', icon: '😤', rarity: 'rare', desc: '내 공격 피해 +3.', effect: { attackBonus: 3 } },
  { id: 'plating', name: '두꺼운 판금', icon: '🪨', rarity: 'common', desc: '받는 피해 -3.', effect: { damageReduction: 3 } },
  { id: 'crystal', name: '수정 방벽', icon: '💠', rarity: 'common', desc: '매 라운드 보호막 +6.', effect: { turnShield: 6 } },
  { id: 'breaker', name: '파쇄 날', icon: '🪚', rarity: 'rare', desc: '공격이 적중하면 상대 보호막을 전부 없앤다.', effect: { shieldBreak: true } },
  { id: 'leech-rune', name: '흡성의 룬', icon: '🔮', rarity: 'rare', desc: '공격으로 피해를 주면 체력 5 회복.', effect: { lifesteal: 5 } },
  { id: 'bulwark', name: '가시 방패', icon: '🛡', rarity: 'rare', desc: '매 라운드 보호막 +4, 피격 시 3 반사.', effect: { turnShield: 4, thorns: 3 } },
  { id: 'titanheart', name: '거인의 심장', icon: '🫀', rarity: 'epic', desc: '최대 체력 +30.', effect: { maxHpBonus: 30 } },
  { id: 'aegis-core', name: '수호의 원석', icon: '💎', rarity: 'rare', desc: '매 라운드 보호막 +9.', effect: { turnShield: 9 } },
  { id: 'overdrive', name: '광휘의 각성', icon: '🌟', rarity: 'rare', desc: '매 라운드 기력 +8.', effect: { turnEnergy: 8 } },
  // --- 확장 세트(2026-07-24) ---
  { id: 'ironwill', name: '강철 의지', icon: '🪛', rarity: 'rare', desc: '받는 피해 -5.', effect: { damageReduction: 5 } },
  { id: 'greatfang', name: '대송곳니', icon: '🧛', rarity: 'epic', desc: '공격으로 피해를 주면 체력 6 회복.', effect: { lifesteal: 6 } },
  { id: 'quickcharge', name: '성급한 각성', icon: '🌠', rarity: 'common', desc: '매 라운드 기력 +5, 내 공격 피해 +2.', effect: { turnEnergy: 5, attackBonus: 2 } },
  { id: 'sanctuary', name: '성역의 문장', icon: '⛩', rarity: 'epic', desc: '매 라운드 보호막 +7, 체력 +3.', effect: { turnShield: 7, regen: 3 } },

  // --- 조합형 세트(2026-07-31) — 누적 기력 트리거 / 저체력 폭주 / 경제 -------
  // "말도 안 되는 뽕맛"을 내는 재료들. 하나만 끼면 준수하고, 서로 물리면 폭발한다
  // (예: 기력 강탈 카드로 기력을 굴리며 넘치는 술잔 + 뇌운의 고리 + 순환의 매듭).
  // 대신 재료가 다 모이려면 희귀도 가중 추첨을 여러 번 통과해야 한다(⑫ 참고).
  {
    id: 'capacitor', name: '넘치는 술잔', icon: '🍷', rarity: 'epic',
    desc: '기력을 100 쓸 때마다 상대를 다음 턴 기절시킨다.',
    effect: { energyTriggers: [{ per: 100, stun: 1, label: '술잔 범람' }] },
  },
  {
    id: 'coil', name: '뇌운의 고리', icon: '⚡', rarity: 'legend',
    desc: '기력을 60 쓸 때마다 상대를 다음 턴 기절시키고 13 고정 피해를 준다.',
    effect: { energyTriggers: [{ per: 60, stun: 1, damage: 13, label: '뇌격' }] },
  },
  {
    id: 'circuit', name: '순환의 매듭', icon: '🔗', rarity: 'rare',
    desc: '기력을 50 쓸 때마다 체력을 13 회복한다.',
    effect: { energyTriggers: [{ per: 50, heal: 13, label: '순환' }] },
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
    id: 'firstguard', name: '선제 방벽', icon: '🚧', rarity: 'common',
    desc: '전투 첫 라운드에 보호막 +20.',
    effect: { openingShield: 20 },
  },

  // --- 확장 세트 2 (2026-07-31) — 빈 메커니즘 보강(기절·반사·관통·저체력·지속회복) --
  {
    id: 'thorncrown', name: '가시 왕관', icon: '👑', rarity: 'epic',
    desc: '피해를 입으면 공격자에게 8 반사.', effect: { thorns: 8 },
  },
  {
    id: 'sanctum', name: '재생의 성소', icon: '🌿', rarity: 'epic',
    desc: '매 라운드 체력 +6.', effect: { regen: 6 },
  },
  {
    id: 'piercecore', name: '꿰뚫는 송곳', icon: '🪡', rarity: 'epic',
    desc: '내 모든 공격이 상대 보호막을 관통한다. 최대 체력 -12.',
    effect: { alwaysPierce: true, maxHpBonus: -12 },
  },
  {
    id: 'chainshock', name: '연쇄 벼락', icon: '⛈', rarity: 'epic',
    desc: '전투당 세 번, 내 공격이 피해를 주면 상대를 다음 턴 기절시킨다.',
    effect: { stunOnHit: 1, stunCap: 3 },
  },
  {
    id: 'vanguard', name: '선봉대장', icon: '🎖', rarity: 'rare',
    desc: '전투 첫 라운드에 보호막 +15. 내 공격 피해 +3.', effect: { openingShield: 15, attackBonus: 3 },
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
    id: 'purse', name: '두툼한 지갑', icon: '💰', rarity: 'common',
    desc: '전투 승리 골드 +35%.', effect: {}, mods: { goldBonusPct: 35 },
  },
  {
    id: 'compass', name: '탐색가의 나침반', icon: '🧭', rarity: 'rare',
    desc: '승리 보상 선택지 +1칸.', effect: {}, mods: { rewardOptions: 1 },
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
  { id: 'venomflask', name: '독약 플라스크', icon: '🧪', rarity: 'common', desc: '공격으로 피해를 주면 중독 1겹을 묻힌다.', effect: { poisonOnHit: 1 } },
  { id: 'emberbrand', name: '잉걸 낙인', icon: '🔥', rarity: 'common', desc: '공격으로 피해를 주면 화상 1겹을 묻힌다.', effect: { burnOnHit: 1 } },
  { id: 'coldiron', name: '차가운 쇠', icon: '❄️', rarity: 'common', desc: '상태이상에 걸린 상대에게 주는 피해 +3.', effect: { bonusVsAfflicted: 3 } },
  { id: 'wickedmortar', name: '사악한 절구', icon: '⚗️', rarity: 'rare', desc: '내가 거는 중독 위력 +40%.', effect: { statusPowerPct: 40 } },
  { id: 'hunterspite', name: '사냥꾼의 앙심', icon: '🎯', rarity: 'epic', desc: '상태이상에 걸린 상대에게 피해 +7. 보호막을 무시한다.', effect: { bonusVsAfflicted: 7, alwaysPierce: true } },
  { id: 'rotcrown', name: '부패의 왕관', icon: '👑', rarity: 'legend', desc: '피해를 주면 중독 2겹·화상 2겹을 함께 묻히고, 중독 위력 +50%, 상태이상 상대에게 피해 +5.', effect: { poisonOnHit: 2, burnOnHit: 2, statusPowerPct: 50, bonusVsAfflicted: 5 } },

  // =========================================================================
  // 확장 세트 3 (2026-08-05) — 유물 종류 2배
  //
  // 앞선 세트가 "같은 훅의 수치 차이"로 불어나 있었다(피해감소 5·6·10, 흡혈 5·6·9·12…).
  // 그래서 이번엔 **훅을 여섯 개 새로 파고**(`roster.ts` Passive 확장 훅) 그 위에
  // 세트를 짰다. 새 유물이 만드는 새 빌드는 이렇다:
  //   빙결 부여   freezeOnHit  — 다음 턴을 지운다(단, 때리면 깨진다)
  //   방벽 증폭   guardPowerPct— 수비 카드를 낸 턴만 보상. 버티기 연타 빌드
  //   치유 증폭   healPowerPct — 회복 카드만 키운다(regen은 안 탄다 — 2026-11-12). 장기전 빌드
  //   시작 기력   startEnergyBonus — 1턴부터 큰 카드. 짧고 굵게 끝내는 빌드
  //   처형        executeBonusPct — 상대가 반피 이하일 때 배율. 마무리 빌드
  //   발판        collapseResist  — 구멍에 빠진 피해를 줄인다(2026-11-13 임시 — 전장 붕괴를 없애며 돌림)
  // ⚠ 희귀도별 **파워 예산을 기존 세트에 맞췄다** — 아래 새 70종은 유물 풀을 두 배로
  //   희석하므로, 평균 세기가 어긋나면 클리어율이 통째로 움직인다(실제로 측정했다).

  // --- 빙결 부여 계열 -------------------------------------------------------
  { id: 'frostbite', name: '동상의 손', icon: '🧊', rarity: 'common', desc: '전투당 두 번, 피해를 주면 상대를 다음 턴 빙결.', effect: { freezeOnHit: 1 } },
  { id: 'permafrost', name: '만년설', icon: '🏔', rarity: 'epic', desc: '전투당 네 번, 피해를 주면 상대를 다음 턴 빙결. 내 공격 피해 +3.', effect: { freezeOnHit: 1, freezeCap: 4, attackBonus: 3 } },
  { id: 'rimeheart', name: '서릿발 심장', icon: '💙', rarity: 'legend', desc: '전투당 여섯 번, 피해를 주면 상대를 다음 턴 빙결. 상태이상 상대에게 피해 +6.', effect: { freezeOnHit: 1, freezeCap: 6, bonusVsAfflicted: 6 } },
  { id: 'coldsnap', name: '한파', icon: '🌨', rarity: 'rare', desc: '전투당 두 번 빙결을 걸고, 내가 거는 중독 위력 +25%.', effect: { freezeOnHit: 1, statusPowerPct: 25 } },

  // --- 방벽 증폭 계열 -------------------------------------------------------
  { id: 'buckler', name: '단단한 손잡이', icon: '🛡', rarity: 'common', desc: '수비 카드의 흡수량 +35%.', effect: { guardPowerPct: 35 } },
  { id: 'towershield', name: '탑 방패', icon: '🗼', rarity: 'rare', desc: '수비 카드의 흡수량 +60%.', effect: { guardPowerPct: 60 } },
  { id: 'rampart', name: '성벽의 맹세', icon: '🧱', rarity: 'epic', desc: '수비 카드의 흡수량 +80%, 최대 체력 +13.', effect: { guardPowerPct: 80, maxHpBonus: 13 } },
  { id: 'aegisoath', name: '불괴의 서약', icon: '⚜️', rarity: 'legend', desc: '수비 카드의 흡수량 +120%, 첫 라운드 보호막 +20, 받는 피해 -3.', effect: { guardPowerPct: 120, openingShield: 20, damageReduction: 3 } },

  // --- 치유 증폭 계열 -------------------------------------------------------
  { id: 'poultice', name: '약초 습포', icon: '🌾', rarity: 'common', desc: '회복 카드 회복량 +40%.', effect: { healPowerPct: 40 } },

  // --- 시작 기력 계열 -------------------------------------------------------
  { id: 'primer', name: '점화약', icon: '🧨', rarity: 'common', desc: '전투 시작 기력 +13.', effect: { startEnergyBonus: 13 } },
  { id: 'jumpstart', name: '출진의 북', icon: '🥁', rarity: 'rare', desc: '전투 시작 기력 +20.', effect: { startEnergyBonus: 20 } },
  { id: 'bigbang', name: '개전의 봉화', icon: '🧨', rarity: 'epic', desc: '전투 시작 기력 +28, 내 공격 피해 +3.', effect: { startEnergyBonus: 28, attackBonus: 3 } },
  { id: 'firstlight', name: '여명의 불꽃', icon: '🌅', rarity: 'legend', desc: '전투 시작 기력 +35, 첫 라운드 보호막 +23, 매 라운드 기력 +4.', effect: { startEnergyBonus: 35, openingShield: 23, turnEnergy: 4 } },

  // --- 처형 계열 ------------------------------------------------------------
  { id: 'finisher', name: '마무리 칼', icon: '🔪', rarity: 'common', desc: '상대 체력이 절반 이하면 내 공격 피해 +25%.', effect: { executeBonusPct: 25 } },
  { id: 'headsman', name: '망나니의 도끼', icon: '🪓', rarity: 'rare', desc: '상대 체력이 절반 이하면 내 공격 피해 +45%.', effect: { executeBonusPct: 45 } },
  { id: 'guillotine', name: '단두대', icon: '⚰️', rarity: 'epic', desc: '상대 체력이 절반 이하면 내 공격 피해 +70%.', effect: { executeBonusPct: 70 } },
  { id: 'reaperveil', name: '사신의 장막', icon: '☠️', rarity: 'legend', desc: '상대 체력이 절반 이하면 내 공격 피해 +100%. 보호막을 무시한다.', effect: { executeBonusPct: 100, alwaysPierce: true } },

  // --- 발판 계열 (구멍 대응 — 2026-11-13 임시, 사용자가 추후 재정의) ----------
  { id: 'ironshoes', name: '무쇠 신발', icon: '🥾', rarity: 'common', desc: '구멍에 빠졌을 때 받는 피해 -4.', effect: { collapseResist: 4 } },
  { id: 'anchorstone', name: '고정 말뚝', icon: '⚓', rarity: 'rare', desc: '구멍에 빠졌을 때 받는 피해 -7, 최대 체력 +8.', effect: { collapseResist: 7, maxHpBonus: 8 } },
  { id: 'skywalk', name: '허공 걸음', icon: '☁️', rarity: 'epic', desc: '구멍에 빠졌을 때 받는 피해 -12.', effect: { collapseResist: 12 } },
  { id: 'worldpillar', name: '세계의 기둥', icon: '🏛', rarity: 'legend', desc: '구멍에 빠져도 피해가 없고, 매 라운드 보호막 +6.', effect: { collapseResist: 99, turnShield: 6 } },

  // --- 기존 훅 조합 보강 — 빈자리를 메우는 조합들 ---------------------------
  { id: 'gravepact', name: '무덤의 약조', icon: '⚱️', rarity: 'rare', desc: '전투당 한 번 체력 18로 되살아난다. 받는 피해 -2.', effect: { revive: 18, damageReduction: 2 } },
  { id: 'stoneskin', name: '돌갗', icon: '🗿', rarity: 'epic', desc: '받는 피해 -7.', effect: { damageReduction: 7 } },
  { id: 'adamant', name: '금강석 갑주', icon: '💎', rarity: 'legend', desc: '받는 피해 -9, 최대 체력 +13.', effect: { damageReduction: 9, maxHpBonus: 13 } },
  { id: 'duelist', name: '결투가의 검', icon: '🤺', rarity: 'epic', desc: '내 공격 피해 +8.', effect: { attackBonus: 8 } },
  { id: 'godslayer', name: '신살자의 창', icon: '🔱', rarity: 'legend', desc: '내 공격 피해 +10, 보호막을 무시한다. 최대 체력 -10.', effect: { attackBonus: 10, alwaysPierce: true, maxHpBonus: -10 } },
  { id: 'perpetual', name: '영원의 수레바퀴', icon: '☸️', rarity: 'legend', desc: '매 라운드 기력 +12, 보호막 +5.', effect: { turnEnergy: 12, turnShield: 5 } },
  { id: 'retribution', name: '응보의 문장', icon: '⚖️', rarity: 'legend', desc: '피격 시 11 반사, 받는 피해 -2.', effect: { thorns: 11, damageReduction: 2 } },
  { id: 'oxheart', name: '황소 심장', icon: '🐂', rarity: 'rare', desc: '최대 체력 +19.', effect: { maxHpBonus: 19 } },
  { id: 'colossus', name: '거상의 뼈', icon: '🦴', rarity: 'legend', desc: '최대 체력 +35, 받는 피해 -3. 대신 내 공격 피해 -2.', effect: { maxHpBonus: 35, damageReduction: 3, attackBonus: -2 } },
  { id: 'punisher', name: '처벌자의 손', icon: '✊', rarity: 'rare', desc: '전투당 두 번, 피해를 주면 상대를 다음 턴 기절시킨다. 받는 피해 -2.', effect: { stunOnHit: 1, stunCap: 2, damageReduction: 2 } },
  { id: 'oblivion', name: '망각의 종', icon: '🔔', rarity: 'legend', desc: '전투당 다섯 번, 피해를 주면 상대를 다음 턴 기절시킨다.', effect: { stunOnHit: 1, stunCap: 5 } },

  // --- 누적 기력 트리거 보강 ------------------------------------------------
  {
    id: 'sparkplug', name: '부싯돌', icon: '🪨', rarity: 'common',
    desc: '기력을 70 쓸 때마다 보호막 +13.',
    effect: { energyTriggers: [{ per: 70, shield: 13, label: '불붙이기' }] },
  },
  {
    id: 'doomclock', name: '종말의 모래시계', icon: '⏳', rarity: 'legend',
    desc: '기력을 38 쓸 때마다 상대에게 20 고정 피해.',
    effect: { energyTriggers: [{ per: 38, damage: 20, label: '모래 한 알' }] },
  },

  // --- 저체력 폭주 보강 -----------------------------------------------------
  { id: 'cornered', name: '궁지의 이빨', icon: '🐺', rarity: 'common', desc: '체력이 절반 이하면 내 공격 피해 +20%.', effect: { lowHpBonusPct: 20 } },
  { id: 'phoenixrage', name: '잿불의 격정', icon: '🔥', rarity: 'legend', desc: '체력이 절반 이하면 피해 +80%. 전투당 한 번 체력 15으로 되살아난다.', effect: { lowHpBonusPct: 80, revive: 15 } },

  // --- 상태이상 보강 --------------------------------------------------------
  { id: 'toxinvial', name: '맹독 병', icon: '🧫', rarity: 'rare', desc: '피해를 주면 중독 2겹을 묻힌다.', effect: { poisonOnHit: 2 } },
  { id: 'cinderbrand', name: '잿불 인장', icon: '🕯', rarity: 'rare', desc: '피해를 주면 화상 2겹을 묻힌다.', effect: { burnOnHit: 2 } },
  { id: 'witchbrew', name: '마녀의 탕약', icon: '🍯', rarity: 'epic', desc: '내가 거는 중독 위력 +65%.', effect: { statusPowerPct: 65 } },
  { id: 'bonepicker', name: '뼈 발라내기', icon: '🦴', rarity: 'rare', desc: '상태이상에 걸린 상대에게 피해 +5.', effect: { bonusVsAfflicted: 5 } },
  { id: 'ashlung', name: '재의 폐', icon: '🌫', rarity: 'epic', desc: '피해를 주면 화상 2겹·중독 1겹을 함께 묻힌다.', effect: { burnOnHit: 2, poisonOnHit: 1 } },
  { id: 'freezerot', name: '동사의 저주', icon: '🥶', rarity: 'legend', desc: '전투당 세 번 빙결을 걸고, 피해를 주면 중독 2겹·화상 2겹을 묻힌다.', effect: { freezeOnHit: 1, freezeCap: 3, poisonOnHit: 2, burnOnHit: 2 } },

  // --- 지속 연장 계열 (2026-08-07 2차) — **전부 legend, 런 전용** ------------
  //
  // 다른 상태이상 유물은 **위력**이나 **부여 확률**을 사지만, 이 둘은 **시간**을 산다
  // (2026-11-12 유물 100종 정리로 여섯에서 둘이 됐다 — 기절·빙결 연장 유물은 없다. 훅은 엔진에 남아 있다).
  // 시간은 다른 모든 훅과 곱해지므로(중독 · 화상은 겹 = 남은 라운드라 1겹이 곧 한 라운드 더 —
  // 2026-11-12/13 개편) 값이 작아도 판을 바꾼다.
  // 그래서 **전부 `legend`**로만 낸다 — 층 1에서 ≈6%, 층 15에서 ≈17%로 뽑히고 상점가 230이라
  // "이걸 노리고 굴리는" 빌드가 되려면 깊이 살아남아야 한다.
  //
  // ⚠ **봉인 연장(기절·빙결·속박 — 값은 턴)은 라운드를 넘어간다**(2026-11-13). 무한 봉인이 안 되는
  //   근거는 엔진 `applyStatus`의 겹치기 규칙 — 봉인 중엔 같은 것 · 낮은 것이 안 걸리고, 높은
  //   것도 처음 걸린 봉인의 남은 길이를 못 넘는다. 그 규칙을 풀면 "영원히 못 움직인다"가 된다.
  // ⚠ **`ROSTER.passive`·몬스터에 이 훅을 넣지 말 것.** 유물에만 있는 한 규칙 자체가
  //   PvP에 존재하지 않아 `RULES_VERSION`을 안 올려도 된다(`npm run check`가 단정한다).
  {
    id: 'sabbath', name: '마녀의 안식일', icon: '🌙', rarity: 'legend',
    desc: '내가 중독 · 화상을 걸 때 각각 1겹 더.',
    effect: { poisonRoundBonus: 1, burnRoundBonus: 1 },
  },
  {
    id: 'grasproot', name: '얽매는 뿌리', icon: '🕸', rarity: 'legend',
    // 2026-11-13 이동불가 개편: 속박 +2턴(사용자 지정 · 임시 — 추후 조정).
    desc: '내가 거는 속박이 2턴 더 간다. 받는 피해 -3.',
    effect: { bindRoundBonus: 2, damageReduction: 3 },
  },

  // --- 경제형 보강 ----------------------------------------------------------
  { id: 'caravan', name: '행상 마차', icon: '🛒', rarity: 'rare', desc: '상점 진열 +2칸.', effect: {}, mods: { shopExtraItems: 2 } },
  { id: 'bazaar', name: '암시장 통로', icon: '🏮', rarity: 'epic', desc: '상점 진열 +3칸, 가격 25% 할인.', effect: {}, mods: { shopExtraItems: 3, shopDiscountPct: 25 } },
  { id: 'saddlebag', name: '안장 가방', icon: '👜', rarity: 'common', desc: '승리 보상 선택지 +1칸.', effect: {}, mods: { rewardOptions: 1 } },
  { id: 'grailshard', name: '성배 조각', icon: '🏆', rarity: 'epic', desc: '모든 회복 효과 +80%, 회복 카드 회복량 +30%.', effect: { healPowerPct: 30 }, mods: { healBonusPct: 80 } },
  { id: 'ravenomen', name: '까마귀의 전조', icon: '🐦‍⬛', rarity: 'epic', desc: '일반 전투 보상에 유물이 섞일 확률 +18%p.', effect: {}, mods: { relicChanceBonus: 0.18 } },
  { id: 'kingsseal', name: '왕의 봉인', icon: '📜', rarity: 'legend', desc: '승리 보상 선택지 +2칸, 골드 +60%, 상점 진열 +2칸.', effect: {}, mods: { rewardOptions: 2, goldBonusPct: 60, shopExtraItems: 2 } },

  // --- 이벤트 사슬(2026-11-09 · `docs/rules/EVENTS.md` 초록 정령 · 타오르는 알 · 세계수 · 불사조) ---
  // 알·영양가루는 보상 풀에도 있다. 가지·깃털은 사슬의 끝이라 이벤트에서만 나온다.
  { id: 'fireegg', name: '타오르는 알', icon: '🥚', rarity: 'epic', desc: '화상에 걸리지 않는다.', effect: { burnImmune: true } },
  { id: 'nutrient', name: '영양가루', icon: '✨', rarity: 'rare', desc: '최대 체력 +10, 최대 기력 +10.', effect: { maxHpBonus: 10, maxEnergyBonus: 10 } },
  // 세계수의 가지 = 원래 보상 풀에 있던 전설 유물 「세계수 가지」(`worldtree`, 그림 있음)를 이벤트 전용으로 돌린 것이다
  // (2026-11-12 사용자 지정 — "둘이 같은 것"). 같은 날 사용자 버프: 매 라운드 체력 +10 · 최대 체력 +15 · 최대 기력 +15+ 회복 카드 회복량 +200%(매 라운드 회복은 안 탄다 — 엔진 규칙).
  { id: 'worldtree', name: '세계수의 가지', icon: '🌳', rarity: 'legend', eventOnly: true, desc: '회복 카드 회복량 +200%, 매 라운드 체력 +10, 최대 체력 +15, 최대 기력 +15.', effect: { healPowerPct: 200, regen: 10, maxHpBonus: 15, maxEnergyBonus: 15 } },
  // ⚠ 깃털의 효과는 기획서에 없어 정한 값이다 — 사슬에 들인 것(알)보다 세게.
  { id: 'phoenixfeather', name: '불사조의 깃털', icon: '🪶', rarity: 'legend', eventOnly: true, desc: '전투당 한 번, 체력 40으로 되살아난다. 화상에 걸리지 않는다.', effect: { revive: 40, burnImmune: true } },
]

export const RELICS: Relic[] = genericRelics

export const RELIC_BY_ID: Record<string, Relic> = Object.fromEntries(RELICS.map((r) => [r.id, r]))

export function getRelic(id: string): Relic | undefined {
  return RELIC_BY_ID[id]
}

/** 일반 보상 후보 유물(직업 패시브는 유물이 아니라 애초에 여기 없다 · 이벤트 전용 유물은 뺀다). */
export const REWARD_RELICS: Relic[] = genericRelics.filter((r) => !r.eventOnly)

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
export function mergeRelics(ids: string[], charId?: string): Passive {
  const out: Passive = { desc: '' }
  const acc = out as unknown as Record<string, unknown>
  // 직업 패시브(런)를 먼저 깐다 — 유물이 아니라 직업에 붙어 있다(위 "직업 패시브" 절).
  const effects = [
    ...(charId ? [classPassive(charId)?.effect] : []),
    ...ids.map((id) => RELIC_BY_ID[id]?.effect),
  ]
  for (const effect of effects) {
    if (!effect) continue
    for (const [k, v] of Object.entries(effect)) {
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
  // 2026-11-12 올림(사용자 — 런 골드가 늘었다 · 전설은 상점에서 아주 비싸게): 60 / 95 / 145 / 230 →
  common: 100,
  rare: 160,
  epic: 250,
  legend: 600,
}
