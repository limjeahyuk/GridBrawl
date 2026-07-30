// ---------------------------------------------------------------------------
// 런 전용 카드 — 로그라이크 보상·상점에서만 나오는 카드들. **공용 카드(`cards.ts`)나
// 캐릭터 고유 카드(`roster.ts`)에 넣지 않는다**: 덱 빌더(`decks.ts`의 `deckFor`)는
// 공용+고유만 보므로, 여기 카드는 PvP·봇전 밸런스를 건드리지 않는다.
//
// 설계 의도(2026-07-31): 시작 덱이 공용 기본 카드 9장으로 줄면서, "무엇을 주워
// 덱을 세울 것인가"가 런의 핵심이 됐다. 그래서 이 풀은 **조합의 재료**로 짠다:
//   · 기력을 많이 쓰는 카드 → 누적 기력 유물(기절·회복 트리거)과 맞물린다
//   · 기력을 벌어오는 카드(강탈·예비 셀) → 그 트리거를 더 빨리 돌린다
//   · 각성(`empower`)·저체력 배율 유물 → 길게 끌수록 무거워지는 빌드
//   · 기절·끌어당김 → 상대 턴을 지우거나 사거리로 끌어오는 통제
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
const CROSS: Offset[] = [
  { df: 1, du: 0 },
  { df: -1, du: 0 },
  { df: 0, du: 1 },
  { df: 0, du: -1 },
]

function atk(over: Partial<CardDef> & { id: string; name: string }): CardDef {
  return { kind: 'attack', desc: '', cooldown: 0, range: [fwd(1)], damage: 20, energyCost: 10, fx: 'punch', ...over }
}

export const RUN_CARDS: CardDef[] = [
  // --- 통제(기절·끌어당김) — 조합의 시작점 -----------------------------------
  atk({
    id: 'r-stunrod', name: '충격 봉', range: both(1), damage: 18, energyCost: 30, stun: 1, cooldown: 3,
    fx: 'bolt', accent: '#7fd4ff',
    desc: '앞뒤 한 칸. 피해를 주면 상대를 1턴 기절시킨다(카드를 못 냄). 쿨타임 3턴.',
  }),
  atk({
    id: 'r-hook', name: '사슬 갈고리', range: beam(2, 3), damage: 16, energyCost: 16, pull: 2, pointBlank: false,
    fx: 'rush', desc: '앞 2~3칸의 상대를 두 칸 끌어당긴다. 도망치는 원거리형을 사거리로 끌어온다.',
  }),
  atk({
    id: 'r-tether', name: '자기 견인', range: bar(2), damage: 22, energyCost: 22, pull: 1, pointBlank: false,
    fx: 'orb', desc: '앞 두 칸째 세 줄을 훑어 한 칸 끌어당긴다.',
  }),

  // --- 기력 순환 — 누적 기력 트리거 유물과 맞물린다 --------------------------
  atk({
    id: 'r-siphon', name: '기력 강탈', range: both(1), damage: 14, energyCost: 10, drain: 25,
    fx: 'bolt', desc: '피해는 작지만 상대 기력을 25까지 빨아 내 것으로 쓴다. 기력을 굴리는 빌드의 심장.',
  }),
  {
    id: 'r-cell', name: '예비 셀', kind: 'energy', gain: 60, cooldown: 2,
    desc: '기력을 60 회복한다. 쿨타임 2턴 — 큰 카드를 연달아 쏘거나 누적 기력 유물을 돌린다.',
  },
  {
    id: 'r-overclock', name: '오버클럭', kind: 'energy', gain: 45, cooldown: 1,
    desc: '기력을 45 회복한다. 원기 회복보다 크고 쿨은 같다.',
  },

  // --- 각성(empower) — 길게 끌수록 무거워진다 --------------------------------
  atk({
    id: 'r-protocol', name: '과부하 프로토콜', range: both(1), damage: 12, energyCost: 24, empower: 6, cooldown: 1,
    fx: 'shield', accent: '#f7c948',
    desc: '피해는 작지만 이번 전투 내내 내 모든 공격 피해 +6(중첩). 쓸수록 뒷 턴이 무거워진다.',
  }),
  atk({
    id: 'r-resonance', name: '공명 증폭', range: bar(1), damage: 24, energyCost: 32, empower: 4,
    fx: 'orb', desc: '앞 한 칸 세 줄. 이번 전투 내내 공격 피해 +4(중첩).',
  }),

  // --- 순수 화력 -------------------------------------------------------------
  atk({
    id: 'r-maul', name: '관성 해머', range: [fwd(1)], damage: 42, energyCost: 26, push: 1,
    fx: 'punch', desc: '앞 한 칸을 짓뭉개고 한 칸 밀어낸다. 전방 전용 강타.',
  }),
  atk({
    id: 'r-railgun', name: '레일건', range: beam(2, 5), damage: 44, energyCost: 38, pierce: true, pointBlank: false,
    fx: 'bolt', desc: '앞 2~5칸을 관통하는 초장거리 사격. 보호막을 무시한다. 붙으면 사각.',
  }),
  atk({
    id: 'r-rupture', name: '십자 파열', range: CROSS, damage: 32, energyCost: 26,
    fx: 'quake', desc: '상·하·좌·우 네 칸을 동시에 터뜨린다.',
  }),
  atk({
    id: 'r-collapse', name: '지반 붕괴', range: [...bar(1), ...bar(-1)], damage: 34, energyCost: 32,
    fx: 'quake', desc: '앞뒤 한 칸의 세 줄을 통째로 무너뜨린다.',
  }),
  atk({
    id: 'r-frenzy', name: '광폭 난타', range: [fwd(1)], damage: 58, energyCost: 22, recoil: 16,
    fx: 'rush', accent: '#e25563',
    desc: '앞 한 칸에 모든 걸 쏟아붓는다 — 자신도 체력 16을 잃는다. 저체력 유물과 위험한 궁합.',
  }),
  atk({
    id: 'r-annihilate', name: '소멸 포격', range: [...bar(1), ...bar(2)], damage: 66, energyCost: 58, cooldown: 2,
    fx: 'orb', accent: '#d45fae', signature: true,
    desc: '앞 두 칸 × 세 줄을 지우는 최종 포격. 기력 58·쿨 2턴 — 기력을 굴릴 수 있어야 쓴다.',
  }),
  atk({
    id: 'r-lifedrain', name: '생명 흡수', range: both(1), damage: 26, energyCost: 22, leech: 16,
    fx: 'slash', accent: '#3cbf7a', desc: '앞뒤 한 칸을 베고 체력 16을 빨아온다.',
  }),

  // --- 수비·회복 -------------------------------------------------------------
  {
    id: 'r-bastion', name: '배스티온', kind: 'guard', block: 95, guardCost: 25, cooldown: 2, fx: 'shield',
    desc: '기력 25 소모. 이번 턴 받는 피해를 최대 95 막는다. 쿨타임 2턴 — 예고된 대격변용.',
  },
  {
    id: 'r-deflector', name: '편향 장막', kind: 'guard', block: 55, guardCost: 12, cooldown: 1, fx: 'shield',
    desc: '기력 12 소모. 이번 턴 받는 피해를 최대 55 막는다. 싸고 자주 쓴다.',
  },
  {
    id: 'r-medkit', name: '응급 키트', kind: 'heal', healHp: 45, healCost: 30, cooldown: 2,
    desc: '기력 30을 체력 45로 바꾼다. 쿨타임 2턴 — 층 사이로 체력을 이어가는 핵심 카드.',
  },
  {
    id: 'r-transfuse', name: '수혈', kind: 'heal', healHp: 26, healCost: 14, cooldown: 1,
    desc: '기력 14를 체력 26으로 바꾼다. 값이 싸서 꾸준히 돌린다.',
  },

  // --- 이동 ------------------------------------------------------------------
  {
    id: 'r-blink', name: '블링크', kind: 'move', dir: 'right', steps: 3, cooldown: 2,
    desc: '오른쪽으로 세 칸 도약. 쿨타임 2턴 — 한 턴에 붙어서 때린다.',
  },
  {
    id: 'r-backblink', name: '역블링크', kind: 'move', dir: 'left', steps: 3, cooldown: 2,
    desc: '왼쪽으로 세 칸 후퇴. 쿨타임 2턴 — 원거리 빌드가 거리를 되찾는다.',
  },
  {
    id: 'r-sidestep', name: '측면 활강', kind: 'move', dir: 'up-right', steps: 2, cooldown: 1,
    desc: '오른쪽 위로 두 칸. 줄을 바꾸면서 파고든다.',
  },
  {
    id: 'r-sidestep2', name: '하강 활강', kind: 'move', dir: 'down-right', steps: 2, cooldown: 1,
    desc: '오른쪽 아래로 두 칸. 줄을 바꾸면서 파고든다.',
  },
]

export const RUN_CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(
  RUN_CARDS.map((c) => [c.id, c]),
)

/**
 * 런에서 쓰이는 카드 전체(공용 + 그 캐릭터 고유 + 런 전용)에서 id로 찾는다.
 * 보상·상점·이벤트 화면이 전부 이걸 쓴다 — 한 곳만 빠뜨리면 카드가 빈칸으로 보인다.
 */
export function resolveRunCard(charId: string, id: string): CardDef | undefined {
  return (
    RUN_CARD_BY_ID[id] ??
    COMMON_CARDS.find((c) => c.id === id) ??
    getChar(charId).cards.find((c) => c.id === id)
  )
}
