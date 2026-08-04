# 스프라이트 시트 배치 규격

캐릭터 아트를 절차 SVG(`src/art/art.ts`)에서 픽셀 스프라이트로 옮기는 중입니다.
정의는 [`src/art/sprites.ts`](../../src/art/sprites.ts)에 있습니다.

> **이 폴더의 PNG는 손으로 만들지 않습니다.** 원본 팩을 `assets-raw/`에 두고
> `npm run sprites`(→ `scripts/packsprites.mjs`)로 구워 냅니다. 원본을
> `public/`에 두면 EULA·프리뷰·미사용 애니메이션까지 통째로 배포됩니다.

## 현재 상태

| 쓰는 곳 | 시트 id | 출처 팩 |
| --- | --- | --- |
| `warrior` | `hero-knight` | Hero Knight (Sven Thole) |
| `archer` | `huntress` | Huntress (LuizMelo) |
| `mage` | `wizard` | Wizard Pack (LuizMelo) |
| 몬스터 slime·splitter | `slime` | Monsters Creatures Fantasy 2 |
| 몬스터 bat·phantom | `bat` | 〃 |
| 몬스터 goblin·grunt | `rat` | 〃 |
| 몬스터 vampire | `mimic` | 〃 |
| 몬스터 witch·shaman·overlord·pyrelord | `evil-wizard` | Evil Wizard 3 (LuizMelo) |
| 몬스터 knight·assassin·berserker·crossbow | `martial-hero` | Martial Hero 3 (LuizMelo) |
| 몬스터 ogre | `ogre` | Ansimuz Legacy Collection — Gothicvania |
| 몬스터 sentry | `flying-eye` | 〃 (flying-eye-demon) |
| 몬스터 golem | `golem` | Mecha-stone Golem (Kronovi) |
| 몬스터 guardian | `angel` | GothicVania Church Pack |
| 몬스터 shaman | `church-wizard` | 〃 |
| **보스** overlord | `demon` | Ansimuz Legacy Collection — Gothicvania |
| **보스** pyrelord | `dragon` | 〃 (Grotto Escape 2 보스 용) |
| **보스** warden | `terrible-knight` | 〃 |

**20종이 시트 3개를 돌려 쓰던 상태는 끝났다** — 이제 13개 시트를 쓰고 직업 시트를
빌려 쓰는 몬스터는 없다.

- ⚠ **Gothicvania 계열은 hurt·death 클립이 대부분 없다**(`terrible-knight`만 Hurt 보유). 원본에 그 동작이 없어서다. `clipOrFallback`이 attack1 → idle로 대신하므로 게임은 정상 동작하고, 피격·사망 때 대기 자세가 나온다.
- ⚠ **Gothicvania 원본은 팔레트(colorType 3) PNG다.** 패커가 원래 8bit RGBA만 읽어서 통째로 건너뛰고 있었다(`✗ … 건너뜀`). `decodePng`에 PLTE·tRNS 확장을 넣어 해결했다 — 앞으로 ansimuz 팩은 그냥 들어온다.
- ⚠ **클립마다 캔버스 크기가 다른 팩이 있다**(demon: 대기 256×176 · 공격 312×220). 공통 bbox 크롭이 "모든 프레임이 같은 크기"를 전제해서 그냥 두면 버퍼를 넘겨 읽고 터진다. `padToCommonCanvas()`가 **가로 가운데·세로 아래** 기준으로 맞춰 준다 — 서 있는 캐릭터는 발이 닿는 선과 몸통 중심이 기준이라 좌상단 정렬로는 안 된다.
- ⚠ `bandit-light`/`bandit-heavy`는 궁수·마법사가 임시로 쓰던 시트였고 **2026-08-04에 지웠다**(huntress·wizard로 교체). 구운 스트립·패커 항목·`banditClips()`를 함께 걷어냈으니, 되살리려면 git 기록에서 세 곳을 같이 꺼내야 한다. 원본 팩은 `assets-raw/bandits`에 그대로 있다.
- 미사용 원본: `Pet Dogs Pack`(assets-raw) — 소환수·펫을 넣게 되면 쓸 수 있다.

## 파일 배치

```
assets-raw/<팩>/...          ← 원본 (배포 안 됨)
public/sprites/<시트id>/<클립>.png   ← 생성물 (게임이 읽는 것)
```

에셋 출처: <https://sventhole.itch.io/> (Sven Thole).
라이선스는 "어떤 게임 프로젝트에도 상업/비상업 불문 사용 가능, 단 에셋 자체를
재판매 금지". 크레딧은 필수가 아니지만 작가가 반깁니다 — 도감/타이틀 하단에
한 줄 넣어 두는 걸 권합니다.

## 필요한 클립 8종

각 PNG는 프레임을 **가로로 이어 붙인 스트립 한 장**입니다.
`idle.png`가 8프레임이면 이미지 폭 = `frameW × 8`, 높이 = `frameH`.

| 클립 | 언제 재생되나 | 기본 프레임 수 |
| --- | --- | --- |
| `idle.png` | 대기 (반복) | 8 |
| `run.png` | 이동·대시 중 (반복) | 10 |
| `attack1.png` | `fx: slash` 카드 | 6 |
| `attack2.png` | `fx: punch/bolt/orb/flame` 카드 | 6 |
| `attack3.png` | `fx: rush/quake` 카드 | 8 |
| `block.png` | 보호막이 올라와 있을 때 | 5 |
| `hurt.png` | 피격 | 3 |
| `death.png` | KO | 10 |

## 새 팩을 추가하는 법

1. 원본을 `assets-raw/<팩이름>/`에 푼다
2. `scripts/packsprites.mjs`의 `JOBS`에 항목을 하나 추가한다
   - 낱장 프레임이 클립별 폴더에 있으면 `loadFromFolders`
   - 격자 시트 한 장이면 `loadFromGrid(파일, 프레임폭, 프레임높이, {클립:[시작,개수]})`
3. `npm run sprites` — 스트립을 굽고 **측정값을 출력**한다
4. 출력된 `frameW / frameH / footY / anchorX`를 `sprites.ts`의 `SHEETS`에 옮긴다
5. 구워진 `attack*.png`를 눈으로 보고 `impactFrame`(검이 가장 뻗는 프레임)을 정한다

패커가 알아서 하는 것:
- **전 클립 공통 bbox로 균일하게 크롭** — 클립마다 따로 자르면 전환할 때 캐릭터가 튄다
- 빈 여백 제거로 용량 절감 (Hero Knight 90프레임 = 17KB)
- `_10`이 `_2` 앞에 오지 않도록 프레임 번호 숫자 정렬

## 시트별로 맞춰야 할 값

- `frameW` / `frameH` — 크롭 후 프레임 한 칸의 픽셀 크기 (패커가 측정)
- `scale` — 화면 배율. **정수만** 쓰세요(소수면 픽셀이 뭉갭니다)
- `footY` — 발이 닿는 y. 여러 캐릭터가 같은 바닥선에 서게 한다 (패커가 측정)
- `anchorX` — **몸통의 가로 중심.** 프레임 한가운데가 아닙니다 — 프레임 폭은
  공격 검기까지 담느라 한쪽으로 늘어나 있어서, 이 값이 틀리면 캐릭터가 셀에서
  옆으로 밀려 섭니다 (패커가 대기 자세에서 측정)
- `clips.<클립>.frames` — 실제 프레임 수
- `clips.<클립>.impactFrame` — **공격이 상대에게 닿는 프레임**(0-based).
  피해·불꽃·타격음·히트스톱이 전부 이 프레임에 맞춰 터집니다
