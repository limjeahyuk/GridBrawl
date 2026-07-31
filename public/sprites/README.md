# 스프라이트 시트 배치 규격

캐릭터 아트를 절차 SVG(`src/art/art.ts`)에서 픽셀 스프라이트로 옮기는 중입니다.
정의는 [`src/art/sprites.ts`](../../src/art/sprites.ts)에 있습니다.

> **이 폴더의 PNG는 손으로 만들지 않습니다.** 원본 팩을 `assets-raw/`에 두고
> `npm run sprites`(→ `scripts/packsprites.mjs`)로 구워 냅니다. 원본을
> `public/`에 두면 EULA·프리뷰·미사용 애니메이션까지 통째로 배포됩니다.

## 현재 상태

| 캐릭터 | 시트 id | 출처 팩 | 상태 |
| --- | --- | --- | --- |
| volt (VESPER) | `hero-knight` | Hero Knight | ✅ 적용 완료 |
| cipher (SABLE) | `bandit-light` | Bandits (경장) | ✅ 적용 완료 |
| aegis (CAIRN) | `bandit-heavy` | Bandits (중장) | ✅ 적용 완료 |
| titan (MAUL) | — | Chaos Berserker | ⚠ 커버 이미지(48×48 한 장)만 도착 — 애니메이션 시트 필요 |
| nova (DIRGE) | — | Wraith | ⚠ 커버 이미지(48×48 한 장)만 도착 — 애니메이션 시트 필요 |
| ember (PYRE) | — | Flame Demons | ⚠ 커버 이미지(64×64 한 장)만 도착 — 애니메이션 시트 필요 |

> 커버 이미지 3종은 한 장짜리 정지 그림이라 **굽지 않는다.** 예전엔 같은 그림을
> N번 반복한 가짜 스트립을 `berserker/` · `wraith/` · `flame-demon/`에 만들어
> 뒀지만, `SHEETS`가 참조하지 않으면서 배포에만 실려 나가 지웠다. 진짜 시트가
> 도착하면 `JOBS`에 항목을 넣고 다시 굽는다.

Bandits 팩은 Hero Knight와 프레임 구성이 다르다(대기 4·달리기 8·공격 8, 공격
동작 1종). 그래서 `sprites.ts`가 `STD_CLIPS` 대신 `banditClips()`로 따로 잡고,
죽는 동작이 없어 패커가 `Recover`를 거꾸로 돌려 만든다.

`SHEETS`에 없는 캐릭터는 **기존 SVG 아트로 그려집니다.** 한 명씩 옮겨도
게임은 깨지지 않습니다.

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
