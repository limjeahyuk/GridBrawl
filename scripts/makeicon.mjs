// ---------------------------------------------------------------------------
// 앱 아이콘 생성기 — **전사(hero-knight) 스프라이트**를 다크 판타지 배경에 얹어
// 웹(PWA)·iOS·Android 아이콘을 한 번에 굽는다.
//
//   npm run icon
//
// 의존성 0개(`png.mjs` 코덱만 쓴다). 원본은 게임이 실제로 쓰는 스프라이트라
// **아이콘과 게임 화면의 전사가 같은 그림**이다 — 아이콘용 그림을 따로 그려
// 두면 캐릭터를 갈아 끼울 때 아이콘만 옛것으로 남는다(예전 SF 아이콘이 그랬다).
//
// ⚠ 굽고 나면 네이티브에 반영하려면 `npx cap sync`가 필요하다(웹 사본이
//   `ios/App/App/public`·`android/.../assets/public`으로 복사된다).
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng } from './png.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---- 원본 프레임 ------------------------------------------------------------

/**
 * 어느 포즈를 쓸지 — `sprites.ts`의 warrior 시트와 같은 규격(90×50 · 8프레임).
 * 대기 0프레임은 **방패가 앞, 검을 뒤로 당긴 가드 자세**라 실루엣이 가장 또렷하다
 * (공격 프레임은 검기가 프레임 밖으로 뻗어 잘린다).
 */
const SRC = { file: 'public/sprites/hero-knight/idle.png', frameW: 90, frameH: 50, frame: 0 }

/** 아이콘에서 캐릭터가 차지할 높이 비율. 너무 크면 홈 화면에서 답답해 보인다. */
const FIGURE_H = 0.62
/** 발끝을 바닥에서 얼마나 띄울지(캔버스 높이 비율). 살짝 아래에 세운다. */
const FOOT_MARGIN = 0.16
/** 마스터 캔버스. 여기서 한 번 그리고 각 크기로 줄인다. */
const MASTER = 1024

// ---- 팔레트 (index.css와 같은 값) --------------------------------------------

const BG_CORE = [0x2a, 0x21, 0x33] // 중앙 — --bg-2보다 한 단계 밝게
const BG_EDGE = [0x06, 0x05, 0x0a] // --bg-0
const TORCH = [0xc9, 0xa8, 0x6a] // --neon-cyan(횃불 금)
const EMBER = [0xd9, 0x79, 0x3a] // --neon-orange(잉걸불)

// ---- 픽셀 도구 --------------------------------------------------------------

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const mix = (a, b, t) => a + (b - a) * t
/** 부드러운 감쇠 — 선형 그라디언트는 띠(밴딩)가 보인다. */
const smooth = (t) => {
  const u = clamp(t, 0, 1)
  return u * u * (3 - 2 * u)
}

/** RGBA 버퍼 위에 색을 알파 합성한다. */
function over(px, i, rgb, a) {
  if (a <= 0) return
  const k = clamp(a, 0, 1)
  px[i] = mix(px[i], rgb[0], k) | 0
  px[i + 1] = mix(px[i + 1], rgb[1], k) | 0
  px[i + 2] = mix(px[i + 2], rgb[2], k) | 0
  px[i + 3] = Math.max(px[i + 3], (k * 255) | 0)
}

/** 스트립에서 프레임 한 장을 떼어 내용 경계(bbox)까지 바짝 자른다. */
function cutFigure() {
  const im = decodePng(readFileSync(join(ROOT, SRC.file)))
  const { frameW: fw, frameH: fh, frame } = SRC
  let x0 = fw
  let y0 = fh
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      if (im.px[(y * im.w + frame * fw + x) * 4 + 3] < 16) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) throw new Error('프레임이 비어 있다')
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const px = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * im.w + frame * fw + x0) * 4
    im.px.copy(px, y * w * 4, from, from + w * 4)
  }
  /**
   * 가운데를 **bbox가 아니라 화소 무게중심**으로 잡는다. 뻗은 검이 bbox를 한쪽으로
   * 크게 늘려서, bbox 기준으로 맞추면 몸이 반대쪽으로 밀려 보인다.
   */
  let mass = 0
  let sum = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = px[(y * w + x) * 4 + 3]
      mass += a
      sum += a * x
    }
  }
  return { w, h, px, cx: sum / mass }
}

// ---- 배치 -------------------------------------------------------------------

/**
 * 전사를 캔버스 어디에 얼마나 크게 놓을지. **가로는 bbox 기준으로 가운데** —
 * 무게중심에 맞추면 뻗은 검(왼쪽 1/3을 차지한다)이 가장자리에 닿아 잘린다.
 * 대신 몸통 위치(`bodyX`)를 함께 돌려줘서 **배경의 후광을 몸 뒤에 놓는다**:
 * 시선이 몸으로 모이므로 검이 왼쪽으로 치우쳐도 구도가 기울어 보이지 않는다.
 */
function layout(size, fig) {
  const scale = Math.max(1, Math.round((size * FIGURE_H) / fig.h))
  const w = fig.w * scale
  const h = fig.h * scale
  const x0 = Math.round((size - w) / 2)
  return { scale, w, h, x0, y0: Math.round(size * (1 - FOOT_MARGIN) - h), bodyX: x0 + fig.cx * scale }
}

// ---- 그리기 -----------------------------------------------------------------

/**
 * 배경 — 화면(`.grid-bg`)과 같은 언어다: 가운데가 밝은 돌바닥, 아래에서 올라오는
 * 횃불빛, 사방이 어두워지는 비네트. 이미지 파일 없이 계산으로만 그린다.
 *
 * `span`은 **그림이 기준으로 삼는 한 변**이고 캔버스(`size`)와 다를 수 있다.
 * Android 적응형 배경은 캔버스의 가운데 66%만 보이므로, 그 66%에 그림 한 판이
 * 통째로 들어가야 완성본과 같은 구도로 읽힌다 — 안 그러면 비네트가 전부 마스크
 * 밖으로 밀려나 배경이 밋밋한 갈색 판으로만 보인다.
 */
function drawBackdrop(px, size, { bodyX, span = size }) {
  const c = (size - 1) / 2
  const glowX = bodyX // 후광의 중심 — 전사의 몸통 뒤
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      // ① 중앙에서 퍼지는 돌바닥
      const r = Math.hypot(x - c, y - c) / (span * 0.72)
      const t = smooth(r)
      px[i] = mix(BG_CORE[0], BG_EDGE[0], t) | 0
      px[i + 1] = mix(BG_CORE[1], BG_EDGE[1], t) | 0
      px[i + 2] = mix(BG_CORE[2], BG_EDGE[2], t) | 0
      px[i + 3] = 255
      // ② 횃불 후광 — 어두운 갑옷이 어두운 배경에 묻히지 않게 실루엣을 띄운다.
      //    아이콘은 48px까지 줄어들므로 이 대비가 형태를 읽히게 하는 전부다.
      const g = 1 - smooth(Math.hypot(x - glowX, y - c) / (span * 0.62))
      over(px, i, TORCH, g * 0.5)
      over(px, i, EMBER, g * g * 0.22)
      // ③ 비네트 — 네 귀퉁이를 눌러 아이콘이 둥글게 읽히도록
      over(px, i, BG_EDGE, smooth((r - 0.5) / 0.6) * 0.95)
    }
  }
  // ④ 바닥에 새긴 룬 격자 — 가로줄만, 아래로 갈수록 촘촘하게(원근)
  for (let y = 0; y < size; y++) {
    const f = (y - (c + span * 0.12)) / (span * 0.38)
    if (f < 0 || f > 1) continue
    if (Math.abs(((f * f * 4.5) % 1) - 0.5) < 0.44) continue
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const fade = (1 - Math.abs(x - c) / (span * 0.5)) * (1 - f)
      over(px, i, TORCH, clamp(fade, 0, 1) * 0.22)
    }
  }
}

/**
 * 전사를 얹는다. 최근접 확대(정수 배율)라 픽셀이 뭉개지지 않는다 — 게임 안
 * 스프라이트와 같은 규칙(`image-rendering: pixelated`)이다.
 *
 * ⚠ 시트가 **오른쪽을 본다**(`sprites.ts`의 `facesRight: true`). 게임의 "앞 =
 *   오른쪽" 규약과 같으므로 뒤집지 않는다.
 */
function drawFigure(px, size, fig, { shadow = true } = {}) {
  const { scale, w, h, x0, y0, bodyX } = layout(size, fig)

  // 발밑 그림자 — 캐릭터가 배경 위에 떠 보이지 않게 붙잡아 준다
  if (shadow) {
    const cy = y0 + h
    const rx = size * 0.2
    const ry = size * 0.035
    for (let y = Math.max(0, (cy - ry) | 0); y < Math.min(size, cy + ry); y++) {
      for (let x = Math.max(0, (bodyX - rx) | 0); x < Math.min(size, bodyX + rx); x++) {
        const d = Math.hypot((x - bodyX) / rx, (y - cy) / ry)
        over(px, (y * size + x) * 4, BG_EDGE, (1 - smooth(d)) * 0.7)
      }
    }
  }

  for (let y = 0; y < h; y++) {
    const sy = (y / scale) | 0
    const dy = y0 + y
    if (dy < 0 || dy >= size) continue
    for (let x = 0; x < w; x++) {
      const s = (sy * fig.w + ((x / scale) | 0)) * 4
      const a = fig.px[s + 3] / 255
      if (a <= 0.02) continue
      const dx = x0 + x
      if (dx < 0 || dx >= size) continue
      over(px, (dy * size + dx) * 4, [fig.px[s], fig.px[s + 1], fig.px[s + 2]], a)
    }
  }
}

/** 면적 평균 축소 — 최근접으로 줄이면 작은 크기에서 픽셀이 통째로 사라진다. */
function resize(src, from, to) {
  if (from === to) return Buffer.from(src)
  const out = Buffer.alloc(to * to * 4)
  const step = from / to
  for (let y = 0; y < to; y++) {
    const sy0 = Math.floor(y * step)
    const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * step))
    for (let x = 0; x < to; x++) {
      const sx0 = Math.floor(x * step)
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * step))
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * from + sx) * 4
          const w = src[i + 3] / 255
          r += src[i] * w
          g += src[i + 1] * w
          b += src[i + 2] * w
          a += src[i + 3]
          n++
        }
      }
      const i = (y * to + x) * 4
      const wsum = a / 255 || 1 // 투명 화소의 색이 섞여 테두리가 검어지는 것 방지
      out[i] = r / wsum
      out[i + 1] = g / wsum
      out[i + 2] = b / wsum
      out[i + 3] = a / n
    }
  }
  return out
}

/** 정사각 아이콘을 원형으로 오려 낸다(Android `ic_launcher_round`). */
function circleMask(px, size) {
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / (size / 2)
      const i = (y * size + x) * 4
      px[i + 3] = Math.round(px[i + 3] * (1 - smooth((d - 0.97) / 0.05)))
    }
  }
}

// ---- 굽기 -------------------------------------------------------------------

const fig = cutFigure()

/** 배경 + 전사(홈 화면에 그대로 놓이는 완성본). */
const master = Buffer.alloc(MASTER * MASTER * 4)
drawBackdrop(master, MASTER, layout(MASTER, fig))
drawFigure(master, MASTER, fig)

/**
 * Android 적응형 아이콘 — 전경(캐릭터)과 배경(돌바닥)을 **따로** 낸다. 런처가
 * 둘을 겹쳐 놓고 제 마음대로 마스크를 씌우기 때문이다.
 *
 * ⚠ 캔버스 108dp 중 **가운데 72dp(66%)만 확실히 보인다** — 바깥은 마스크·시차
 *   애니메이션에 먹힌다. 그래서 전경은 안전 영역 안에만 그리고, 배경은
 *   가장자리까지 꽉 채운다(비워 두면 마스크가 움직일 때 빈 칸이 드러난다).
 */
const FG = 1024
const SAFE = 0.66
const foreground = Buffer.alloc(FG * FG * 4)
const background = Buffer.alloc(FG * FG * 4)
{
  const inner = Math.round(FG * SAFE)
  const off = Math.round((FG - inner) / 2)
  const tmp = Buffer.alloc(inner * inner * 4)
  drawFigure(tmp, inner, fig, { shadow: false })
  for (let y = 0; y < inner; y++)
    tmp.copy(foreground, ((y + off) * FG + off) * 4, y * inner * 4, (y + 1) * inner * 4)
  // 배경은 캔버스 전체에 그리되 후광은 안전 영역 안의 몸통 뒤에 맞춘다 —
  // 그래야 마스크가 씌워진 뒤에도 완성본(레거시 아이콘)과 같은 구도로 읽힌다.
  drawBackdrop(background, FG, { bodyX: off + layout(inner, fig).bodyX, span: inner })
}

// 미리보기 — 19장을 다 굽지 않고 512 한 장만 임시 경로에 쓴다(모양을 다듬을 때).
const preview = process.argv.indexOf('--preview')
if (preview >= 0) {
  const out = process.argv[preview + 1]
  writeFileSync(out, encodePng(512, 512, resize(master, MASTER, 512)))
  console.log('미리보기: ' + out)
  process.exit(0)
}

const wrote = []
const emit = (rel, size, { src = master, from = MASTER, opaque = false, round = false } = {}) => {
  const px = resize(src, from, size)
  if (round) circleMask(px, size)
  writeFileSync(join(ROOT, rel), encodePng(size, size, px, { opaque }))
  wrote.push(`${rel} (${size}×${size})`)
}

// 웹 / PWA
emit('public/icon-512.png', 512)
emit('public/icon-192.png', 192)
emit('public/apple-touch-icon.png', 180)

// iOS — 알파 채널이 있으면 App Store 업로드가 거부된다
emit('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, { opaque: true })

// Android — 밀도별 레거시 아이콘(API 25 이하) + 적응형 두 겹(API 26 이상)
const DENSITY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
for (const [d, n] of Object.entries(DENSITY)) {
  const res = `android/app/src/main/res/mipmap-${d}`
  emit(`${res}/ic_launcher.png`, n)
  emit(`${res}/ic_launcher_round.png`, n, { round: true })
  // 적응형 두 겹은 레거시의 2.25배 규격이다(108dp 중 72dp가 안전 영역)
  const adaptive = Math.round(n * 2.25)
  emit(`${res}/ic_launcher_foreground.png`, adaptive, { src: foreground, from: FG })
  emit(`${res}/ic_launcher_background.png`, adaptive, { src: background, from: FG })
}

console.log(`전사 아이콘 ${wrote.length}장:\n  ` + wrote.join('\n  '))
