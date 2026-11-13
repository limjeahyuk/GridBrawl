// ---------------------------------------------------------------------------
// 앱 아이콘 생성기 — **구운 마스터 한 장**(1024×1024)을 각 크기로 줄여 웹(PWA)
// 아이콘을 만든다.
//
//   npm run icon
//
// 의존성 0개(`png.mjs` 코덱만 쓴다).
//
// 2026-11-12에 그림이 바뀌었다. 전엔 `public/sprites/hero-knight` 도트에서
// 얼굴을 떼어 배경까지 코드로 그렸는데, 그 전사는 **지금 게임에 없다** —
// 리디자인으로 영웅 도트가 전부 새로 그려졌고 옛 시트는 아이콘에만 남아 있었다.
// 지금 아이콘은 ? 칸 거래상 일러스트(`docs/design/2dImg/거래상.png`)에서
// 구운 마스터다. 구도·빛을 바꾸려면 마스터를 다시 굽는다:
//
//   python3 docs/design/tools/icon/build.py   (pillow · rembg · numpy 필요)
//
// 마스터를 같이 커밋해 두므로 **아이콘만 다시 뽑을 때는 파이썬이 필요 없다.**
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng } from './png.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MASTER_FILE = 'docs/design/tools/icon/master-1024.png'

const master = decodePng(readFileSync(join(ROOT, MASTER_FILE)))
if (master.w !== master.h) throw new Error('마스터는 정사각이어야 한다')
const MASTER = master.w

/**
 * 면적 평균 축소 — 최근접으로 줄이면 48px에서 눈·입이 통째로 사라진다.
 * 알파로 가중해 더하므로 투명 화소의 색이 가장자리에 섞이지 않는다(마스터는
 * 불투명하지만, 나중에 투명 배경 아이콘을 쓰더라도 그대로 맞는다).
 */
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
      const wsum = a / 255 || 1
      out[i] = r / wsum
      out[i + 1] = g / wsum
      out[i + 2] = b / wsum
      out[i + 3] = a / n
    }
  }
  return out
}

// 미리보기 — 한 장만 임시 경로에 쓴다(구도를 다듬을 때).
const preview = process.argv.indexOf('--preview')
if (preview >= 0) {
  const out = process.argv[preview + 1]
  writeFileSync(out, encodePng(512, 512, resize(master.px, MASTER, 512)))
  console.log('미리보기: ' + out)
  process.exit(0)
}

const wrote = []
/** `opaque`는 알파 채널을 아예 뺀다 — iOS 홈 화면 아이콘의 요구사항이다. */
const emit = (rel, size, { opaque = false } = {}) => {
  writeFileSync(join(ROOT, rel), encodePng(size, size, resize(master.px, MASTER, size), { opaque }))
  wrote.push(`${rel} (${size}×${size})`)
}

// 웹 / PWA
emit('public/icon-512.png', 512)
emit('public/icon-192.png', 192)
emit('public/apple-touch-icon.png', 180, { opaque: true })

console.log(`아이콘 ${wrote.length}장 (원본 ${MASTER_FILE}):\n  ` + wrote.join('\n  '))
