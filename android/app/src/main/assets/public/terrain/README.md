# 지형 에셋 — 바위

판 위에 서는 바위(`Obstacle`)의 그림. 스프라이트·배경과 같은 규칙을 따른다:
**원본은 `assets-raw/`에 두고 여기 있는 것은 굽는다.** 손으로 만들지 않는다.

```bash
npm run rocks     # assets-raw/stones/ → public/terrain/rocks.png
```

## rocks.png — 가로 스트립 (256×32, 32px × 8프레임)

한 장을 `background-position`으로 잘라 쓴다. 바위는 판에 두세 덩이가 동시에
서므로 낱장 파일로 두면 전투 하나에 요청이 여러 번 난다.

| `--v` | 재질 | 쓰이는 곳 |
| --- | --- | --- |
| 0~3 | 회색 돌 네 종 | 기본 — 칸 좌표로 골라 같은 모양이 반복되지 않게 한다 |
| 4~5 | 이끼 낀 돌 두 종 | 묘지(`cemetery`) — 유일한 야외 무대 |
| 6~7 | 흑요석·용암 두 종 | 용암(`lava`) — 화염군주 무대 |

⚠ **프레임 순서 = CSS의 `--v` 번호다.** `scripts/packrocks.mjs`의 `PICKS`를
손대면 `ui/battlefx.css`의 `.rock`과 `ui/screens/BattleScreen.tsx`의
`rockVariant()`를 같은 커밋에서 고쳐야 한다.

⚠ **배율은 정수 3배 고정**(32 → 96px, `background-size: 768px 96px`).
캐릭터 스프라이트가 정수 배율이라 바위만 소수 배율이면 픽셀 크기가 어긋난다.
`image-rendering: pixelated`와 짝이라 한쪽만 바꾸면 안 된다.

## 원본

- `assets-raw/stones/` — Raziel Nozac Zerreitug, **CC0**(퍼블릭 도메인).
  크레딧 의무는 없지만 적어 둔다. 원본에는 눈 덮인 돌·사암 행도 있는데
  흰색·주황이 이 게임의 황동/자주 팔레트에서 혼자 튀어 안 골랐다.
