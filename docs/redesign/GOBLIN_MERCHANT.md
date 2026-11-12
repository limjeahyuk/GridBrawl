# 고블린 장사꾼

시안: `screens/GoblinShop.dc.html`(고블린 상점, 눌러 볼 수 있음), `screens/Merchants.dc.html`(스프라이트 전체).
스프라이트(전투용): `public/redesign/sprites/{goblin-poor, goblin-mid, goblin-rich}/` — `meta.json` 값은 `sprites-v2.ts`에 들어 있다.

**상점 화면 그림(여관과 같은 배치)**: 화면 왼쪽에 단계별 일러스트를 통째로 두고, 오른쪽에 대사창 · 선택지(또는 진열 · 습격 패널)를 올린다. 이 화면에는 도트 스프라이트를 쓰지 않는다 — 스프라이트는 덮쳤을 때의 전투에서만 나온다.

| 단계 | 배경(1280×720) | 원본 일러스트 |
| --- | --- | --- |
| 가난한 고블린 (쓴 돈 0~79) | `public/redesign/cutscene/goblin/bg-poor.png` | `docs/redesign/2dImg/goblin_2.png` (두건 망토 · 맨발) |
| 중간 고블린 (80~199) | `public/redesign/cutscene/goblin/bg-mid.png` | `docs/redesign/2dImg/goblin_1.png` (안경 · 조끼) |
| 부자 고블린 (200 이상) | `public/redesign/cutscene/goblin/bg-rich.png` | `docs/redesign/2dImg/goblin_3.png` (왕좌) |

- 배경은 `tools/event-bg/build.py <원본> <결과>`로 만든다: 그림은 왼쪽에 그대로 두고, 오른쪽은 **같은 그림을 크게 늘려 강하게 흐리고 어둡게 한 색 배경**이다(지어낸 풍경 없음). 그림의 오른쪽 가장자리는 그 배경으로 부드럽게 녹아든다. 다른 ? 이벤트도 일러스트가 생기면 같은 스크립트와 배치를 쓴다.
- **고블린 재산은 화면에 보여 주지 않는다**(2026-11-12 사용자 지정) — 게이지 · 쓴 돈 · "N 더 쓰면 ○○" · 단계 얼굴 표시는 전부 없다. `goblinSpent`는 안에서만 세고, 플레이어에게는 고블린 그림과 진열이 달라지는 것으로만 드러난다. 세 단계 시안은 `screens/GoblinTiers.dc.html`.

> ⚠ 아래 숫자(체력·가격·문턱·보상)는 **시안에서 임의로 정한 값**이다. 규칙의 모양만 지키면 밸런스는 바꿔도 된다.

## 1. 누가 어디서 나오나

`ClipName`에 `haggle` · `cheer`를 추가해야 한다. (여관 주인 마렌은 배경 그림 `public/redesign/cutscene/inn/inn-bg.png` — 원본 `docs/redesign/2dImg/inn.png`)

## 2. 고블린 재산 — 쓸수록 부자가 된다

- 런 상태에 `goblinSpent: number`(이번 런에서 고블린 상점에 쓴 골드 합)를 둔다. 런 시작 때 0이다.
- 단계는 `goblinSpent`로만 정해진다.

```ts
export type GoblinTier = 'poor' | 'mid' | 'rich'
export const GOBLIN_TIER_AT = { mid: 80, rich: 200 } as const
export const goblinTier = (spent: number): GoblinTier =>
  spent >= GOBLIN_TIER_AT.rich ? 'rich' : spent >= GOBLIN_TIER_AT.mid ? 'mid' : 'poor'
```

- 물건을 살 때마다 `goblinSpent += price`를 하고 고블린 대사가 바뀐다(`cheer` · `haggle` 클립은 이 화면에서 쓰지 않는다 — 도트 스프라이트가 없다). 문턱을 넘으면 그 자리에서 **배경 그림을 다음 단계로 바꾼다**(0.6초 겹쳐 넘김). 이때 번쩍임(`flash`)과 토스트를 띄운다: "돈맛을 봤다 — 중간 고블린이 됐다!" / "왕좌까지 샀다 — 부자 고블린이 됐다!"
- ~~상점 화면 위쪽 게이지~~ — 없앴다(2026-11-12). 쓴 돈과 문턱은 화면 어디에도 나오지 않는다.
- **덮쳐서 이기면(고블린을 쓰러뜨리면) `goblinSpent = 0`**으로 돌아간다. **그 뒤에 나오는 고블린 상점은 전부 가난한 고블린부터 다시 시작**한다(사용자 확정). 다시 키우려면 처음부터 돈을 써야 한다.
  - 그래서 "키워서 턴다"는 선택이 생긴다. 많이 사서 부자로 만든 다음 덮치면 보상이 크지만, 그만큼 세다.

## 3. 단계별 상점

**값은 단계와 상관없이 물건마다 제각각이다.** 진열할 때 물건 하나하나에 `정가 × (0.8~1.5)`를 따로 굴리고(소수 첫째 자리), 떠날 때까지 그 값을 유지한다.
- 같은 고블린 상점 안에서도 어떤 건 싸고(×0.8) 어떤 건 바가지(×1.5)다.
- 화면에는 물건마다 배율 칩을 단다: `×0.8 싸다`(초록, 1 미만) · `×1.0 정가` · `×1.1 조금 비쌈` · `×1.4 바가지`(빨강, 1.3 이상). 정가와 다르면 정가를 취소선으로 함께 보여 준다.

```ts
const goblinPrice = (base: number, rng: () => number) => {
  const mul = Math.round((0.8 + rng() * 0.7) * 10) / 10 // 0.8 ~ 1.5
  return { mul, price: Math.round(base * mul) }
}
```

**단계마다 다른 건 무엇을 파느냐다**(가격 배율은 공통):

| 단계 | 진열 |
| --- | --- |
| 가난 | 카드 2(일반) · 회복 1(HP +15) |
| 중간 | 카드 2(일반~희귀) · 유물 1(일반~희귀) · 회복 1(HP +25) |
| 부자 | 카드 2(희귀~영웅) · 유물 2(희귀 이상, **전설 확률**) · 회복 1(HP +40) |

정가는 기존 상점과 같다(카드 35, 유물 60/95/145/230, 회복 30). 진열은 `rollShop`을 단계별 인자로 돌리면 된다.

## 4. 단계별 전투 (`monsters.ts`에 추가할 모양)

보스와 같은 규칙으로, 능력은 **? 칸으로 시작해 처음 발동할 때 공개**된다(`BossHUD.dc.html`). 판은 빈 판이다.

```ts
{ id: 'goblin-poor', name: '가난한 고블린', baseArtId: 'mage', spriteId: 'goblin-poor', tier: 1,
  maxHp: 28, startEnergy: 20, aiLevel: 'easy', behavior: 'skirmisher', passive: {},
  deckCardIds: ['c-shot', 'c-jab'], note: '가진 게 없어 돌을 던지며 도망친다.' },
{ id: 'goblin-mid', name: '중간 고블린', baseArtId: 'mage', spriteId: 'goblin-mid', tier: 2,
  maxHp: 52, startEnergy: 26, aiLevel: 'normal', behavior: 'rusher', passive: { turnShield: 4 },
  deckCardIds: ['war-cleave', 'c-jab', 'c-guard'], note: '단골이 강도로 돌변하면 언월도를 뽑는다.' },
{ id: 'goblin-rich', name: '부자 고블린', baseArtId: 'mage', spriteId: 'goblin-rich', tier: 3,
  maxHp: 88, startEnergy: 32, aiLevel: 'hard', behavior: 'balanced',
  passive: { damageReduction: 3, turnEnergy: 6, attackBonus: 3 },
  deckCardIds: ['war-bash', 'war-cleave', 'arc-shot', 'c-brace'], note: '돈으로 산 갑옷과 금화 세례. 엘리트급.' },
```

전투 연출은 다음과 같다.

| 단계 | attack1 | attack2 |
| --- | --- | --- |
| 가난 | 국자 내려치기 | 돌팔매(조약돌 탄) |
| 중간 | 언월도 베기 | 찌르기 |
| 부자 | 지팡이 후려치기(금빛 궤적) | 금화 뿌리기 |

## 5. 덮쳐서 이겼을 때 보상 (보상 화면에 그대로 얹는다)

| 단계 | 보상 |
| --- | --- |
| 가난 | 골드 20 + 진열품 1개 무작위 |
| 중간 | 골드 55 + 진열품 1개 **고르기** |
| 부자 | 골드 140 + 진열품 1개 고르기 + 유물 확정 |

보상을 받은 뒤 `goblinSpent = 0` → 다음 고블린 상점은 가난부터. 지면 일반 전투와 같다(런 종료).

## 6. ? 칸 흐름

`? 칸 정체 공개(전투/휴식/고블린 상점/이벤트)` → 고블린 상점이면 `만남`(거래한다 · 덮친다 · 그냥 지나간다)으로 간다.

- 거래한다 → `거래` 화면(언제든 "마음이 바뀌었다 — 덮친다"로 전투에 들어갈 수 있다)
- 덮친다 → `습격` 확인 패널(체력 · 기력 · 강함 · 내는 카드 · ? 능력 수 · 보상 · "지면 런이 끝난다") → 전투
- 선택지마다 **대가와 보상 칩을 먼저 보여 준다**(이벤트 화면과 같은 규칙)
