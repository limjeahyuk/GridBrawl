# 화면 배경 그림

`src/art/sprites.ts`가 캐릭터를 맡듯, 이 폴더는 **화면 뒤에 깔리는 그림**을 맡습니다.
스프라이트와 달리 굽는 과정이 없습니다 — PNG를 그대로 CSS `background-image`로 씁니다
(`npm run sprites`는 여기와 무관).

## 지금 들어 있는 것

전투 배경은 **장면(scene) 4종**입니다. 어느 층에서 어느 장면이 나오는지는
`src/game/run.ts`의 `sceneFor()`가 정하고, CSS 클래스 `.boardfloor--<id>`가
짝입니다(`src/ui/battlefx.css`).

| 장면 id | 폴더 | 원본 크기 | 언제 나오나 |
| --- | --- | --- | --- |
| `hall` | `dark-castle/wall.png` | 960×304 | **기본** — 6~10층 · 봇전 · 온라인 · 타이틀/로그인/결과/런 종료(`.grid-bg--hall`) |
| `cemetery` | `cemetery/{sky,mountains,graveyard}.png` | 384×224 / 192×179 / 384×123 | 1~5층 (유일한 야외) |
| `corridor` | `corridor/{far,middle,near,foreground}.png` | 각 224 높이 | 11~14층 |
| `lava` | `lava/{back,rocks}.png` | 432×240 / 196×240 | **화염군주 전용** |
| `abyss` | `abyss/{flesh,rock}.png` | 144×144 / 192×288 | **오버로드 전용** |
| `sanctum` | `sanctum/nave.png` | 624×192 | **수호기사 전용** |

⚠ **보스 무대는 층이 아니라 몬스터 id가 고른다**(`sceneFor`). 수호기사·화염군주는
`boss` 칸이 아니라 **엘리트 칸**으로 나오므로 노드 종류로 판정하면 자기 무대를 영영
못 본다. 어느 보스가 어느 무대를 쓰는지는 `src/game/bosses.ts`의 `CINE[].scene`.

원본 팩은 `assets-raw/`에 있습니다(커밋 안 됨 — 최상위 [.gitignore](../../.gitignore) 참고).

| 폴더 | 원본 팩 | 출처 |
| --- | --- | --- |
| `dark-castle` · `lava` | Ansimuz Legacy Collection | <https://ansimuz.itch.io/gothicvania-patreon-collection> |
| `cemetery` | GothicVania Cemetery | <https://ansimuz.itch.io/gothicvania-cemetery> |
| `corridor` | Gothicvania Cold Corridors | <https://itch.io/c/313331/gothicvania-packs> |
| `abyss` | Ansimuz Legacy Collection (Living Tissue Platform + Caverns) | <https://ansimuz.itch.io/gothicvania-patreon-collection> |
| `sanctum` | GothicVania Church | <https://ansimuz.itch.io/gothic-vania-church> |

전부 같은 작가(ansimuz)라 팔레트·픽셀 크기가 서로 맞습니다 — 이게 다른 팩 대신
이걸 고른 이유입니다. **상업·비상업 게임 프로젝트에 사용 가능하고 수정도 허용**되며
크레딧은 필수가 아니지만 작가가 반깁니다. 스프라이트 팩과 같은 조건이라 크레딧을
넣는다면 한 줄에 같이 적으면 됩니다.

## 규격 — 왜 이 값인가

- ⚠ **한 장은 예외로 양방향 타일이다.** `abyss/flesh.png`(144×144)는 좌우뿐 아니라
  위아래로도 이어지게 그려져 있어 `repeat-x`가 아니라 `repeat`을 쓴다. 배율도 ×3
  (432px)인데, ×2(288px)면 판 높이 302px 안에 두 번째 줄이 들어와 가로 이음매가
  뚜렷하게 보인다.
- **가로 반복(`repeat-x`)이 전제다.** 완성된 한 장면이 아니라 좌우로 이어 붙게
  그려진 **띠**입니다. 화면 폭이 얼마든 채워집니다.
- **배율은 정수배만 씁니다**(`auto 608px` = 304×2, `auto 448px` = 224×2 …).
  캐릭터 스프라이트가 정수 배율이라 배경만 소수 배율이면 픽셀 크기가 어긋나
  눈에 바로 띕니다. `image-rendering: pixelated`와 짝이므로 **둘 중 하나만
  바꾸지 마세요.**
- **바닥 기준으로 붙입니다(`center bottom`).** 그림의 바닥이 격자판 아래쪽 선과
  맞아야 파이터가 공중에 뜬 것처럼 보이지 않습니다.
- ⚠ **판이 302px밖에 안 됩니다**(`.board`, 실측). 원본을 ×2로 키우면 대부분
  화면 밖으로 잘리므로, **어느 부분이 남는지를 `background-position`이 정합니다.**
  묘지의 산맥·무덤을 `calc(100% + N)`으로 아래로 밀어 둔 게 그 예입니다 —
  거의 검은 실루엣이라 그냥 바닥에 붙이면 판이 새까매집니다.
- **밝은 장면일수록 스크림을 올립니다**(`--floor-scrim`). 배경의 밝은 부분이
  스프라이트보다 밝으면 파이터가 배경에 묻힙니다.

## 새 배경을 추가할 때

1. 원본 팩을 `assets-raw/<팩>/`에 풀고, **실제로 쓸 PNG만** 여기로 복사합니다.
   팩을 통째로 `public/`에 두면 프리뷰·라이선스 파일·안 쓰는 레이어까지 배포됩니다.
2. 위 표에 출처와 라이선스를 적습니다.
3. **전장**에 새 장면을 더하려면 세 곳입니다 — `run.ts`의 `BattleScene` 유니온 +
   `sceneFor()`, 그리고 `battlefx.css`의 `.boardfloor--<id>` 규칙. 배경은 그
   클래스의 `background` 한 줄이 전부이고 광원·스크림은 `::before`가 공통으로
   덮으므로 장면 규칙에 광원을 다시 쓰지 마세요.
4. **메뉴 화면**은 `.grid-bg--hall`처럼 `--scene`/`--scrim` 두 변수만 갈아
   끼우면 됩니다(`src/index.css`).

⚠ **전 화면에 까는 건 안 됩니다.** 도감·덱 빌더·상점처럼 반투명 패널에 글자가
빽빽한 화면은 벽 무늬가 글자 뒤로 비쳐 읽기 어려워집니다(실측으로 확인). 그래서
기본 `.grid-bg`는 그라디언트만 두고, 글자가 적은 화면에만 `--hall`을 더합니다.
