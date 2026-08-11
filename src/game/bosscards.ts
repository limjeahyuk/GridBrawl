// ---------------------------------------------------------------------------
// 보스 전용 카드 — **보스만 낸다**. 플레이어는 보상·상점·덱 빌더 어디서도 얻을 수
// 없고, `deckFor`(PvP 덱 빌더)·`RUN_CARDS`(런 보상 풀) 어느 쪽에도 들어가지 않는다.
//
// 왜 따로 파는가(2026-08-05): 보스 셋이 **플레이어 카드를 빌려 쓰고 있었다**
// (`mag-doom`·`war-oath`·`arc-pin`). 그래서 화면에 뜨는 이름이 플레이어가 이미
// 아는 카드였고, "보스가 자기만의 수를 쓴다"는 느낌이 나오지 않았다. 예고(telegraph)
// 문구만 보스 것이고 실제로 날아오는 건 남의 시그니처였던 셈이다.
//
// 설계 규칙 — 셋이 **다른 축**을 건드려야 한다. 수치가 아니라 모양으로 가른다:
//   오버로드  끌어당김(pull) + 관통 광역 → **도망칠 수 없다**
//   수호기사  두꺼운 방벽 + 보호막 파괴(shatter) 반격 → **때릴 타이밍을 고른다**
//   화염군주  각성(empower) 충전 → 인페르노 → **길어질수록 무거워진다**
//
// ⚠ **`RULES_VERSION`은 올리지 않는다.** 이 카드들은 런(싱글) 전용이라 멀티 락스텝의
//   양쪽 피어가 보는 카드 풀에 없다 — 버전을 올리면 웹·앱이 서로를 거부하는
//   기간만 늘고 얻는 게 없다. 반대로 이 카드가 언젠가 PvP 풀로 넘어가면 그때는
//   반드시 올려야 한다.
// ⚠ 수치를 건드리면 `npm run sim:run -- --sweep`을 다시 돌린다. 엘리트 두 종
//   (수호기사·화염군주)은 7층·후반에 나오므로 클리어율에 직접 얹힌다.
// ---------------------------------------------------------------------------
import type { CardDef, Offset } from '../battle/types'

// 범위 헬퍼 — roster.ts·runcards.ts와 **같은 규약**(2026-08-03 앞뒤 대칭)이지만
// 파일마다 따로 갖고 있다. 보스도 지나쳐 가는 상대를 놓치면 안 되므로 대칭이 기본.
const fwd = (n: number): Offset => ({ df: n, du: 0 })
const both = (n: number): Offset[] => [fwd(n), fwd(-n)]
const beamBoth = (a: number, b: number): Offset[] => {
  const out: Offset[] = []
  for (let n = a; n <= b; n++) out.push(fwd(n), fwd(-n))
  return out
}
const bar = (df: number): Offset[] => [
  { df, du: 1 },
  { df, du: 0 },
  { df, du: -1 },
]
/** 앞뒤 대칭 세로줄: 앞 n칸·뒤 n칸의 세로 3줄(6칸). */
const barBoth = (n: number): Offset[] => [...bar(n), ...bar(-n)]
const CROSS: Offset[] = [
  { df: 1, du: 0 },
  { df: -1, du: 0 },
  { df: 0, du: 1 },
  { df: 0, du: -1 },
]
const FORK: Offset[] = [
  { df: 1, du: 1 },
  { df: 1, du: -1 },
  { df: -1, du: 1 },
  { df: -1, du: -1 },
]
/** 내 칸을 둘러싼 여덟 칸 전부. 밀착한 상대는 어느 줄에 있든 맞는다. */
const RING: Offset[] = [...CROSS, ...FORK]

function atk(over: Partial<CardDef> & { id: string; name: string }): CardDef {
  return {
    kind: 'attack',
    desc: '',
    cooldown: 0, // 보스는 스크립트가 리듬을 정한다 — 쿨타임으로 다시 묶지 않는다
    range: [fwd(1)],
    damage: 10,
    energyCost: 5,
    fx: 'punch',
    ...over,
  }
}

// --- 오버로드 · 심연의 군주 --------------------------------------------------
// 정체성: **거리가 방어가 되지 않는다.** 멀면 끌어오고, 붙으면 관통 광역으로 씹는다.
// 그래서 이 보스전은 "거리를 재는 싸움"이 아니라 "맞으면서 뚫는 싸움"이 된다.
const ABYSS: CardDef[] = [
  atk({
    id: 'b-abyss-grasp', name: '심연의 손아귀', range: beamBoth(2, 3), damage: 10, energyCost: 9,
    pull: 2, pointBlank: false, fx: 'rush', accent: '#8f5fd4',
    desc: '앞뒤 2~3칸의 상대를 두 칸 끌어당긴다. 물러나 봐야 다시 품 안이다.',
  }),
  atk({
    id: 'b-abyss-tide', name: '파멸의 물결', range: barBoth(1), damage: 13, energyCost: 13,
    drain: 6, fx: 'orb', accent: '#8f5fd4',
    desc: '앞뒤 세로 3줄을 덮는 검은 물결. 적중하면 상대 기력을 6까지 빨아들인다.',
  }),
  atk({
    id: 'b-abyss-brand', name: '심연의 낙인', range: [...CROSS, ...both(2)], damage: 9, energyCost: 10,
    burn: 2, freeze: 1, fx: 'flame', accent: '#8f5fd4',
    desc: '십자 네 칸 + 앞뒤 2칸째에 낙인을 새긴다. 화상 2라운드 + 이 라운드 빙결.',
  }),
  atk({
    id: 'b-abyss-maw', name: '집어삼키는 아가리', range: [...RING, ...both(2)], damage: 21, energyCost: 23,
    pierce: true, leech: 7, fx: 'quake', signature: true, accent: '#b06fe8',
    desc: '시그니처. 몸을 둘러싼 여덟 칸 + 앞뒤 2칸째를 통째로 삼킨다. 보호막을 무시하고, 입힌 만큼 스스로 아문다.',
  }),
]

// --- 수호기사 · 봉인의 파수꾼 ------------------------------------------------
// 정체성: **때릴 타이밍이 정해져 있다.** 방벽 라운드엔 화력을 버리게 만들고, 커튼을
// 여는 라운드에 보호막을 통째로 깨며 되갚는다. 플레이어에게 "기다렸다 친다"를 가르친다.
const SANCTUM: CardDef[] = [
  {
    id: 'b-ward-bulwark', name: '봉인의 방벽', kind: 'guard', block: 44, guardCost: 8, cooldown: 0,
    fx: 'shield', accent: '#c9a24a',
    desc: '이번 라운드 받는 피해를 최대 88 막는다. 이 라운드에 큰 카드를 쓰면 통째로 삼켜진다.',
  },
  {
    // **석벽 소환** — 이 보스의 새 축(2026-08-05). 플레이어 **양옆**에 바위를 세워
    // 가로 이동을 끊는다. 빠져나가려면 줄을 바꿔야 하고, 그 한 라운드가 곧 수호기사가
    // 방벽을 세우는 시간이다. 「돌파 창격」과 짝이다 — 바위에 등을 댄 채로 밀리면
    // 한 칸도 못 밀려 **처박혀 기절한다**(엔진 `slammed`).
    // ⚠ 세우는 위치는 상대 **좌우**뿐이다. 위아래까지 막으면 갇혀서 못 빠져나온다.
    id: 'b-ward-menhir', name: '석벽 소환', kind: 'guard', block: 17, guardCost: 7, cooldown: 0,
    raiseRocks: { hp: 23, where: 'flankFoe' },
    fx: 'shield', accent: '#c9a24a',
    desc: '바닥을 내리쳐 상대 좌우에 바위를 세운다(체력 23). 보호막 17를 함께 두른다.',
  },
  atk({
    id: 'b-ward-riposte', name: '되갚는 일격', range: barBoth(1), damage: 15, energyCost: 11,
    selfShield: 8, fx: 'slash', accent: '#c9a24a',
    desc: '앞뒤 세로 3줄을 되받아친다. 휘두르면서 보호막 +8을 두른다.',
  }),
  atk({
    id: 'b-ward-lance', name: '돌파 창격', range: [...bar(1), ...bar(-1)], damage: 16, energyCost: 13,
    dashForward: 2, push: 2, fx: 'rush', accent: '#c9a24a',
    desc: '두 칸 파고들며 창을 내지른다. 맞은 상대는 두 칸 밀린다.',
  }),
  atk({
    id: 'b-ward-verdict', name: '최후의 심판', range: [...barBoth(1), ...both(2)], damage: 22, energyCost: 22,
    shatter: true, stun: 1, fx: 'quake', signature: true, accent: '#e6c05f',
    desc: '시그니처. 앞뒤 세로 3줄 + 앞뒤 2칸째에 심판을 내린다. 보호막을 남김없이 부수고 이 라운드 동안 기절시킨다.',
  }),
]

// --- 화염군주 · 잿불의 폭군 ---------------------------------------------------
// 정체성: **충전이 실제로 쌓인다.** 예고 라운드에 쓰는 「불씨 모으기」가 `empower`로
// 이 전투 내내 남는 공격력이 된다 — 예전엔 "모은다"가 문구뿐이었고 실제로는 아무
// 것도 쌓이지 않았다. 그래서 오래 끌수록 위험해지고, 충전 라운드가 곧 반격 창이다.
const PYRE: CardDef[] = [
  atk({
    id: 'b-pyre-ember', name: '불씨 모으기', range: both(1), damage: 6, energyCost: 7,
    empower: 2, fx: 'flame', accent: '#e0663a',
    desc: '앞뒤 한 칸을 툭 지지며 불씨를 모은다. 이 전투 내내 자기 공격 피해 +2(중첩).',
  }),
  atk({
    id: 'b-pyre-lash', name: '화염 채찍', range: beamBoth(1, 3), damage: 12, energyCost: 12,
    burn: 2, fx: 'flame', accent: '#e0663a',
    desc: '같은 줄 앞뒤 3칸까지 채찍처럼 뻗는 불길. 화상 2라운드.',
  }),
  atk({
    id: 'b-pyre-pillar', name: '화염 기둥', range: [...bar(1), ...bar(-1), ...both(2)], damage: 12, energyCost: 15,
    burn: 2, fx: 'flame', accent: '#e0663a',
    desc: '앞뒤 세로 3줄 + 앞뒤 2칸째에서 불기둥이 솟는다. 화상 2라운드.',
  }),
  atk({
    id: 'b-pyre-inferno', name: '인페르노', range: [...barBoth(1), ...barBoth(2)], damage: 16, energyCost: 24,
    burn: 3, fx: 'flame', signature: true, accent: '#ff8a3d',
    desc: '시그니처. 앞뒤 1~2칸의 세 줄을 통째로 불바다로 만든다. 화상 3라운드 — 모아 둔 불씨가 전부 얹힌다.',
  }),
]

/** 보스 전용 카드 전부. `bosses.ts`가 id로 찾아 쓴다. */
export const BOSS_CARDS: CardDef[] = [...ABYSS, ...SANCTUM, ...PYRE]

export const BOSS_CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(
  BOSS_CARDS.map((c) => [c.id, c]),
)
