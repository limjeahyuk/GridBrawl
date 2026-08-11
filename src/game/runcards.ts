// ---------------------------------------------------------------------------
// 런 전용 카드 — 로그라이크 보상·상점에서만 나오는 카드들. **공용 카드(`cards.ts`)나
// 캐릭터 고유 카드(`roster.ts`)에 넣지 않는다**: 덱 빌더(`decks.ts`의 `deckFor`)는
// 공용+고유만 보므로, 여기 카드는 PvP·봇전 밸런스를 건드리지 않는다.
//
// 설계 의도(2026-07-31): 시작 덱이 공용 기본 카드 9장으로 줄면서, "무엇을 주워
// 덱을 세울 것인가"가 런의 핵심이 됐다. 그래서 이 풀은 **조합의 재료**로 짠다:
//   · 기력을 많이 쓰는 카드 → 누적 기력 유물(기절·회복 트리거)과 맞물린다
//   · 기력을 벌어오는 카드(강탈·기력의 성수) → 그 트리거를 더 빨리 돌린다
//   · 각성(`empower`)·저체력 배율 유물 → 길게 끌수록 무거워지는 빌드
//   · 기절·끌어당김 → 상대의 라운드를 지우거나 사거리로 끌어오는 통제
// 강한 조합을 막지 않는 대신, 재료가 다 모이기가 어렵다(유물 희귀도 가중 + 덱 상한).
// ---------------------------------------------------------------------------
import { COMMON_CARDS } from '../battle/cards'
import { getChar } from '../data/roster'
import type { CardDef, Offset } from '../battle/types'

const fwd = (n: number): Offset => ({ df: n, du: 0 })
const both = (n: number): Offset[] => [fwd(n), fwd(-n)]
const beam = (a: number, b: number): Offset[] => {
  const out: Offset[] = []
  for (let n = a; n <= b; n++) out.push(fwd(n))
  return out
}
const bar = (df: number): Offset[] => [
  { df, du: 1 },
  { df, du: 0 },
  { df, du: -1 },
]
// ⚠ 이 파일은 범위 헬퍼를 roster.ts와 **따로** 갖고 있다. 앞뒤 대칭 규약
// (2026-08-03)을 여기서도 쓰려면 같은 이름으로 추가해 둬야 한다.
/** 앞뒤 대칭 직선: 같은 줄 양방향 a..b칸. */
const beamBoth = (a: number, b: number): Offset[] => {
  const out: Offset[] = []
  for (let n = a; n <= b; n++) out.push(fwd(n), fwd(-n))
  return out
}
/** 앞뒤 대칭 세로줄: 앞 n칸·뒤 n칸의 세로 3줄(6칸). */
const barBoth = (n: number): Offset[] => [...bar(n), ...bar(-n)]
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
/** 내 칸을 둘러싼 여덟 칸 전부(십자 + X자). */
const RING: Offset[] = [...CROSS, ...FORK]

function atk(over: Partial<CardDef> & { id: string; name: string }): CardDef {
  return { kind: 'attack', desc: '', cooldown: 0, range: [fwd(1)], damage: 10, energyCost: 5, fx: 'punch', ...over }
}

export const RUN_CARDS: CardDef[] = [
  // --- 통제(기절·끌어당김) — 조합의 시작점 -----------------------------------
  atk({
    id: 'r-stunrod', name: '뇌명의 지팡이', range: both(1), damage: 9, energyCost: 15, stun: 1, cooldown: 3,
    fx: 'bolt', accent: '#7fd4ff',
    desc: '앞뒤 한 칸. 피해를 주면 이 라운드 동안 기절시킨다(남은 카드를 못 냄). 쿨타임 3라운드.',
  }),
  atk({
    id: 'r-hook', name: '사슬 갈고리', range: beamBoth(2, 3), damage: 8, energyCost: 8, pull: 2, pointBlank: false,
    fx: 'rush', desc: '앞 2~3칸의 상대를 두 칸 끌어당긴다. 도망치는 원거리형을 사거리로 끌어온다.',
  }),
  atk({
    id: 'r-tether', name: '혼백의 손아귀', range: barBoth(2), damage: 11, energyCost: 11, pull: 1, pointBlank: false,
    fx: 'orb', desc: '앞 두 칸째 세 줄을 훑어 한 칸 끌어당긴다.',
  }),

  // --- 기력 순환 — 누적 기력 트리거 유물과 맞물린다 --------------------------
  atk({
    id: 'r-siphon', name: '기력 강탈', range: both(1), damage: 7, energyCost: 5, drain: 13,
    fx: 'bolt', desc: '피해는 작지만 상대 기력을 13까지 빨아 내 것으로 쓴다. 기력을 굴리는 빌드의 심장.',
  }),
  {
    id: 'r-cell', name: '기력의 성수', kind: 'energy', gain: 30, cooldown: 2,
    desc: '기력을 30 회복한다. 쿨타임 2라운드 — 큰 카드를 연달아 쏘거나 누적 기력 유물을 돌린다.',
  },
  {
    id: 'r-overclock', name: '각성의 주문', kind: 'energy', gain: 23, cooldown: 1,
    desc: '기력을 23 회복한다. 원기 회복보다 크고 쿨은 같다.',
  },

  // --- 각성(empower) — 길게 끌수록 무거워진다 --------------------------------
  atk({
    id: 'r-protocol', name: '피의 각인', range: both(1), damage: 6, energyCost: 12, empower: 3, cooldown: 1,
    fx: 'shield', accent: '#f7c948',
    desc: '피해는 작지만 이번 전투 내내 내 모든 공격 피해 +3(중첩). 쓸수록 뒷 라운드가 무거워진다.',
  }),
  atk({
    id: 'r-resonance', name: '울림의 파문', range: barBoth(1), damage: 12, energyCost: 17, empower: 2,
    fx: 'orb', desc: '앞 한 칸 세 줄. 이번 전투 내내 공격 피해 +2(중첩).',
  }),

  // --- 순수 화력 -------------------------------------------------------------
  atk({
    id: 'r-maul', name: '파쇄 망치', range: [fwd(1)], damage: 21, energyCost: 13, push: 1,
    fx: 'punch', desc: '앞 한 칸을 짓뭉개고 한 칸 밀어낸다. 전방 전용 강타.',
  }),
  // ⚠ **이스터에그 — 일부러 남긴 사이버 잔재**(2026-08-05). 리스킨 때 '꿰뚫는 화살'로
  // 갈았던 걸 되돌린 것이다. 짝은 유물 `battery`('예비 배터리').
  // **정리 대상이 아니다 — 고치지 말 것.**
  atk({
    id: 'r-railgun', name: '레일건', range: beam(2, 5), damage: 22, energyCost: 19, pierce: true, pointBlank: false,
    // ⚠ 설명에 농담을 덧붙이지 말 것 — `pointBlank:false`라 능력 칩이 붙고, 그러면
    // `.cardface--tagged`가 설명을 **2줄로 자른다**. 덧붙이면 "붙으면 사각"이 밀려 나간다.
    fx: 'bolt', desc: '앞 2~5칸을 관통하는 초장거리 사격. 보호막을 무시한다. 붙으면 사각.',
  }),
  atk({
    id: 'r-rupture', name: '십자 파열', range: CROSS, damage: 16, energyCost: 13,
    fx: 'quake', desc: '상·하·좌·우 네 칸을 동시에 터뜨린다.',
  }),
  atk({
    id: 'r-collapse', name: '지반 붕괴', range: barBoth(1), damage: 17, energyCost: 16,
    fx: 'quake', desc: '앞뒤 한 칸의 세 줄을 통째로 무너뜨린다.',
  }),
  atk({
    id: 'r-frenzy', name: '광폭 난타', range: [fwd(1)], damage: 29, energyCost: 11, recoil: 8,
    fx: 'rush', accent: '#e25563',
    desc: '앞 한 칸에 모든 걸 쏟아붓는다 — 자신도 체력 8을 잃는다. 저체력 유물과 위험한 궁합.',
  }),
  atk({
    id: 'r-annihilate', name: '소멸 포격', range: [...bar(1), ...bar(2)], damage: 33, energyCost: 29, cooldown: 2,
    fx: 'orb', accent: '#d45fae', signature: true,
    desc: '앞 두 칸 × 세 줄을 지우는 최종 포격. 기력 29·쿨 2라운드 — 기력을 굴릴 수 있어야 쓴다.',
  }),
  atk({
    id: 'r-lifedrain', name: '생명 흡수', range: both(1), damage: 13, energyCost: 11, leech: 8,
    fx: 'slash', accent: '#3cbf7a', desc: '앞뒤 한 칸을 베고 체력 8을 빨아온다.',
  }),

  // --- 수비·회복 -------------------------------------------------------------
  {
    id: 'r-bastion', name: '불락의 성채', kind: 'guard', block: 48, guardCost: 13, cooldown: 2, fx: 'shield',
    desc: '기력 13 소모. 이번 라운드 받는 피해를 최대 95 막는다. 쿨타임 2라운드 — 예고된 대격변용.',
  },
  {
    id: 'r-deflector', name: '편향 장막', kind: 'guard', block: 28, guardCost: 6, cooldown: 1, fx: 'shield',
    desc: '기력 6 소모. 이번 라운드 받는 피해를 최대 55 막는다. 싸고 자주 쓴다.',
  },
  {
    id: 'r-medkit', name: '치유의 성수', kind: 'heal', healHp: 23, healCost: 15, cooldown: 2,
    desc: '기력 15을 체력 23로 바꾼다. 쿨타임 2라운드 — 층 사이로 체력을 이어가는 핵심 카드.',
  },
  {
    id: 'r-transfuse', name: '수혈', kind: 'heal', healHp: 13, healCost: 7, cooldown: 1,
    desc: '기력 7를 체력 13으로 바꾼다. 값이 싸서 꾸준히 돌린다.',
  },

  // --- 이동 ------------------------------------------------------------------
  {
    id: 'r-blink', name: '순간 이동', kind: 'move', dir: 'right', steps: 3, cooldown: 2,
    desc: '오른쪽으로 세 칸 도약. 쿨타임 2라운드 — 한 라운드에 붙어서 때린다.',
  },
  {
    id: 'r-backblink', name: '역행 이동', kind: 'move', dir: 'left', steps: 3, cooldown: 2,
    desc: '왼쪽으로 세 칸 후퇴. 쿨타임 2라운드 — 원거리 빌드가 거리를 되찾는다.',
  },
  {
    id: 'r-sidestep', name: '비껴 딛기', kind: 'move', dir: 'up-right', steps: 2, cooldown: 1,
    desc: '오른쪽 위로 두 칸. 줄을 바꾸면서 파고든다.',
  },
  {
    id: 'r-sidestep2', name: '낮춰 딛기', kind: 'move', dir: 'down-right', steps: 2, cooldown: 1,
    desc: '오른쪽 아래로 두 칸. 줄을 바꾸면서 파고든다.',
  },

  // =========================================================================
  // 확장 세트 (2026-08-05) — 런 카드 2배
  //
  // 22장짜리 풀은 보상 6칸을 두세 번만 봐도 같은 카드가 다시 나왔다. 늘리되
  // **덱에 있는 다른 카드를 바꾸는 카드**를 섞어서, "무엇을 줍는가"가 아니라
  // "무엇과 무엇을 같이 쓰는가"가 되게 했다. 새 축은 셋이다:
  //   ① 자기 강화(buff) — 지금까지 런 풀에 buff 카드가 **한 장도 없었다**(직업 전용
  //      이었다). 슬롯 하나를 미래에 투자하는 선택지를 런에도 준다
  //   ② 상태이상 카드 — 유물(부여·증폭·시너지)과 물려야 값이 나온다
  //   ③ 값싼 반복기 — 누적 기력 트리거 유물을 빨리 돌리는 저비용 카드
  // ⚠ **전방 전용은 여기서도 "정말 강한 것"에만.** 아래 신규 공격은 한 장(관
  //    `r-lance`)만 전방 전용이고 나머지는 앞뒤 대칭이다(2026-08-03 규약).

  // --- ① 자기 강화 ----------------------------------------------------------
  {
    id: 'r-whet', name: '숫돌 갈기', kind: 'buff', buff: 'atkUp', buffPower: 5, buffRounds: 3,
    buffCost: 9, cooldown: 2, fx: 'slash', accent: '#e0a34a',
    desc: '3라운드간 내 공격 피해 +5. 슬롯 하나를 다음 두 라운드에 투자한다.',
  },
  {
    id: 'r-bulwarkcry', name: '결속의 외침', kind: 'buff', buff: 'defUp', buffPower: 4, buffRounds: 3,
    buffCost: 9, cooldown: 2, fx: 'shield', accent: '#7fa8d4',
    desc: '3라운드간 받는 공격 피해 -4. 큰 카드를 모으는 동안 버틴다.',
  },
  {
    id: 'r-warpaint', name: '전투 문신', kind: 'buff', buff: 'atkUp', buffPower: 9, buffRounds: 2,
    buffCost: 15, cooldown: 3, fx: 'quake', accent: '#c9713a',
    desc: '2라운드간 내 공격 피해 +9. 짧고 굵게 — 쿨타임 3라운드.',
  },
  {
    id: 'r-freerein', name: '무아의 경지', kind: 'buff', buff: 'freeCast', buffRounds: 2, buffCost: 21,
    cooldown: 4, fx: 'orb', accent: '#d45fae',
    desc: '2라운드간 모든 카드의 기력 소모가 0. 선불이 비싸고 쿨이 길다 — 켜진 동안 최대 화력.',
  },

  // --- ② 상태이상 -----------------------------------------------------------
  atk({
    id: 'r-plaguebolt', name: '역병 화살', range: beamBoth(1, 2), damage: 10, energyCost: 9, poison: 2, fog: 1,
    fx: 'bolt', accent: '#3cbf7a', desc: '앞뒤 1~2칸. 피해를 주면 중독 2라운드 + 맞은 자리에 독안개 1라운드. 서 있어도 아프고 비켜도 아프다.',
  }),
  atk({
    id: 'r-emberburst', name: '불티 폭발', range: CROSS, damage: 11, energyCost: 10, burn: 1,
    fx: 'flame', accent: '#e2703c', desc: '상·하·좌·우 네 칸. 피해를 주면 화상 2라운드 — 그동안 맞을 때마다 5씩 더 아프다.',
  }),
  atk({
    id: 'r-frostnova', name: '서리 폭발', range: barBoth(1), damage: 10, energyCost: 13, freeze: 1, cooldown: 2,
    fx: 'orb', accent: '#7fd4ff', desc: '앞뒤 세로 3줄을 얼린다 — 이 라운드 빙결(남은 카드를 못 낸다. 때리면 깨진다). 쿨타임 2라운드.',
  }),
  atk({
    id: 'r-blightwave', name: '역병의 물결', range: [...barBoth(1), ...both(2)], damage: 15, energyCost: 19,
    poison: 2, burn: 2, fx: 'quake', accent: '#8f6fb8',
    desc: '앞뒤 세 줄 + 앞뒤 2칸째. 독 3과 화상 3을 함께 묻힌다.',
  }),
  atk({
    id: 'r-witherpulse', name: '쇠약의 파동', range: barBoth(1), damage: 9, energyCost: 11, poison: 2, drain: 8,
    fx: 'orb', accent: '#6fa88f', desc: '앞뒤 세 줄을 훑어 독 3을 묻히고 상대 기력을 8 빼앗는다.',
  }),

  // --- ③ 값싼 반복기 (누적 기력 트리거를 돌린다) -----------------------------
  atk({
    id: 'r-tap', name: '연타', range: both(1), damage: 7, energyCost: 3,
    fx: 'punch', desc: '앞뒤 한 칸. 값이 아주 싸서 매 라운드 낼 수 있다 — 기력을 꾸준히 태운다.',
  }),
  atk({
    id: 'r-scattershot', name: '산탄', range: FORK, damage: 8, energyCost: 6,
    fx: 'bolt', desc: '앞뒤 대각 네 칸을 흩뿌린다. 정면·바로 위아래는 사각.',
  }),
  atk({
    id: 'r-arcburn', name: '불길의 호', range: beamBoth(1, 2), damage: 9, energyCost: 7, burn: 2,
    fx: 'bolt', desc: '앞뒤 1~2칸을 훑고 화상 2. 싸고 자주 낸다.',
  }),
  {
    id: 'r-trickle', name: '실낱 기력', kind: 'energy', gain: 14, cooldown: 0,
    desc: '기력을 14 회복한다. **쿨타임이 없다** — 매 라운드 써서 트리거를 돌릴 수 있다.',
  },

  // --- 순수 화력·통제 보강 ---------------------------------------------------
  atk({
    id: 'r-lance', name: '돌격창', range: beam(1, 3), damage: 23, energyCost: 17, pierce: true, dashForward: 1,
    fx: 'rush', accent: '#d4b25a',
    desc: '한 칸 파고들며 앞 1~3칸을 꿰뚫는다. 보호막 무시 — 전방 전용 한 방.',
  }),
  atk({
    id: 'r-crescent', name: '초승달 베기', range: [...bar(1), ...bar(-1)], damage: 15, energyCost: 12,
    fx: 'slash', desc: '앞뒤 세로 3줄을 한 번에 긋는다. 어느 줄에 있든 붙으면 맞는다.',
  }),
  atk({
    id: 'r-thunderclap', name: '천둥 박수', range: RING, damage: 13, energyCost: 13, push: 1,
    fx: 'quake', desc: '몸을 둘러싼 여덟 칸을 후려치고 한 칸 밀어낸다. 포위를 푸는 카드.',
  }),
  atk({
    id: 'r-executioner', name: '처형인의 낫', range: both(1), damage: 18, energyCost: 14, leech: 5,
    fx: 'slash', accent: '#c04a5a', desc: '앞뒤 한 칸을 베고 체력 5을 빨아온다. 처형 유물과 물린다.',
  }),
  atk({
    id: 'r-havoc', name: '파멸의 일격', range: barBoth(1), damage: 26, energyCost: 22, cooldown: 1, shatter: true,
    fx: 'quake', accent: '#e05050',
    desc: '앞뒤 세 줄을 통째로 부순다. 적중하면 상대 보호막이 남김없이 날아간다 — 쿨타임 1라운드.',
  }),
  atk({
    id: 'r-gale', name: '질풍 연격', range: beamBoth(1, 2), damage: 17, energyCost: 15, dashForward: 1, push: 1,
    fx: 'rush', desc: '한 칸 파고들며 앞뒤 1~2칸을 훑고 밀어낸다.',
  }),
  atk({
    id: 'r-anchor', name: '닻 던지기', range: beamBoth(2, 4), damage: 12, energyCost: 12, pull: 2, pointBlank: false,
    fx: 'rush', desc: '앞뒤 2~4칸의 상대를 두 칸 끌어온다. 도망치는 적을 사거리에 잡아 둔다.',
  }),
  atk({
    id: 'r-shockwave', name: '충격파', range: [...barBoth(1), ...barBoth(2)], damage: 14, energyCost: 20, stun: 1,
    cooldown: 3, fx: 'quake', accent: '#7fd4ff',
    desc: '앞뒤 1~2칸의 세 줄을 통째로 흔든다. 피해를 주면 이 라운드 기절 — 쿨타임 3라운드.',
  }),

  // --- 수비·회복·이동 보강 ---------------------------------------------------
  {
    id: 'r-parry', name: '받아넘기기', kind: 'guard', block: 17, guardCost: 4, cooldown: 0, fx: 'shield',
    desc: '기력 4로 이번 라운드 34를 막는다. 쿨타임이 없어 방벽 증폭 유물과 매 라운드 돌아간다.',
  },
  {
    id: 'r-ironwall', name: '무쇠 성벽', kind: 'guard', block: 65, guardCost: 17, cooldown: 3, fx: 'shield',
    desc: '기력 17로 이번 라운드 130을 막는다. 쿨타임 3라운드 — 보스의 예고된 한 방을 받아 내는 카드.',
  },
  {
    id: 'r-syringe', name: '약초 침', kind: 'heal', healHp: 9, healCost: 4, cooldown: 0,
    desc: '기력 4을 체력 9로 바꾼다. **쿨타임 없음** — 치유 증폭 유물과 매 라운드 돌아간다.',
  },
  {
    id: 'r-lifeline', name: '생명선', kind: 'heal', healHp: 35, healCost: 22, cooldown: 3,
    desc: '기력 22를 체력 35으로 바꾼다. 쿨타임 3라운드 — 층을 넘길 체력을 한 번에 만든다.',
  },
  {
    id: 'r-vault', name: '도약의 발판', kind: 'move', dir: 'up-right', steps: 3, cooldown: 2,
    desc: '오른쪽 위로 세 칸. 줄과 거리를 한 번에 바꾼다.',
  },
  {
    id: 'r-retreat', name: '급후퇴', kind: 'move', dir: 'left', steps: 2, cooldown: 0,
    desc: '왼쪽으로 두 칸. **쿨타임이 없다** — 붙는 족족 빠져나오는 궁수의 발.',
  },
]

export const RUN_CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(
  RUN_CARDS.map((c) => [c.id, c]),
)

/**
 * 런에서 쓰이는 카드 전체(공용 + 그 직업의 기본기·고유 + 런 전용)에서 id로 찾는다.
 * 보상·상점·이벤트 화면이 전부 이걸 쓴다 — 한 곳만 빠뜨리면 카드가 빈칸으로 보인다.
 *
 * ⚠ **`basics`를 빠뜨리면 안 된다**(2026-08-08 수정). 시작 덱 9장 중 3장이 직업
 * 기본기인데 여기서 안 찾아 줘서, "버릴 카드를 고르세요"·"녹일 카드를 고르세요"
 * 같은 **덱을 늘어놓는 화면에서 그 3장이 통째로 안 보였다**(`c` 가 undefined면
 * 화면이 `null`을 그린다). 강화 대상 고르기도 같은 목록을 쓴다.
 */
export function resolveRunCard(charId: string, id: string): CardDef | undefined {
  const char = getChar(charId)
  return (
    RUN_CARD_BY_ID[id] ??
    COMMON_CARDS.find((c) => c.id === id) ??
    char.basics.find((c) => c.id === id) ??
    char.cards.find((c) => c.id === id)
  )
}
