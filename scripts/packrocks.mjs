// ---------------------------------------------------------------------------
// 바위 패커 — 원본 돌 팩(`assets-raw/stones/`)에서 판 위에 세울 바위 몇 덩이만
// 골라 **가로 스트립** 한 장으로 굽는다(`public/terrain/rocks.png`).
//
//   node scripts/packrocks.mjs        (= npm run rocks)
//
// 왜 스트립 한 장인가: 바위는 판 위에 여러 개가 동시에 서고, 낱장 파일로 두면
// 전투 하나에 요청이 여러 번 난다. 한 장을 `background-position`으로 잘라 쓰면
// 요청은 한 번이고 CSS만으로 종류를 고를 수 있다(`.rock`의 `--v`).
//
// ⚠ **프레임 순서가 곧 CSS의 `--v` 번호다.** `PICKS`를 손대면 `battlefx.css`의
//   `.rock` 주석(종류 표)과 `BattleScreen`의 `rockVariant()`를 같이 고쳐야 한다.
//
// 의존성 0개 — PNG 코덱은 스프라이트 패커·아이콘 생성기와 공용(`png.mjs`).
// 원본 라이선스·출처는 public/terrain/README.md.
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { decodePng, encodePng } from './png.mjs'

const SRC = 'assets-raw/stones/ston32x32.png' // 320×192 = 32px 격자 10열 × 6행
const OUT = 'public/terrain/rocks.png'
const CELL = 32

/**
 * 스트립에 담을 프레임 — `[열, 행]`(0부터). 행이 곧 재질이다:
 *   0 회색 돌 · 1 이끼 낀 돌 · 2 눈 덮인 돌 · 3 사암 · 4 흑요석/용암 · 5 석순
 *
 * 고른 기준은 **실루엣이 서로 다를 것**이다. 판에 두세 덩이가 동시에 서므로 같은
 * 모양이 반복되면 도장을 찍은 것처럼 읽힌다. 눈·사암 행은 뺐다 — 흰색·주황은
 * 이 게임의 황동/자주 팔레트에서 혼자 튄다.
 */
const PICKS = [
  // 0~3 — 기본 회색 돌 네 종(일반 지형)
  [4, 0], // 뾰족하게 솟은 큰 덩이
  [0, 0], // 뭉툭한 육면체
  [7, 0], // 두 덩이가 겹쳐 쌓인 것
  [2, 0], // 옆으로 누운 납작한 것
  // 4~5 — 이끼 낀 돌 두 종(묘지·야외)
  [0, 1],
  [4, 1],
  // 6~7 — 흑요석/용암(화염군주 무대)
  [1, 4],
  [6, 4],
]

const src = decodePng(readFileSync(SRC))
const N = PICKS.length
const W = CELL * N
const out = Buffer.alloc(W * CELL * 4)

PICKS.forEach(([cx, cy], i) => {
  for (let y = 0; y < CELL; y++) {
    const from = ((cy * CELL + y) * src.w + cx * CELL) * 4
    src.px.copy(out, (y * W + i * CELL) * 4, from, from + CELL * 4)
  }
})

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, encodePng(W, CELL, out))
console.log(`${OUT} — ${N}프레임 × ${CELL}px (${W}×${CELL})`)
