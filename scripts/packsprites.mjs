// ---------------------------------------------------------------------------
// 스프라이트 패커 — 원본 팩(`assets-raw/`)을 게임이 쓰는 **가로 스트립**으로
// 굽는다(`public/sprites/<id>/<clip>.png`). 규격은 public/sprites/README.md.
//
//   node scripts/packsprites.mjs
//
// 의존성 0개. PNG 디코드/인코드를 직접 한다(zlib은 node 내장) — 원본 팩이 전부
// 8bit RGBA·비인터레이스라 이 정도면 충분하고, ImageMagick 설치를 강요하지 않는다.
//
// 하는 일:
//   ① 낱장 프레임 폴더 또는 격자 시트에서 프레임을 모은다
//   ② **모든 클립을 통틀어** 내용 경계(bbox)를 구해 전 프레임을 같은 크기로 자른다
//      — 클립마다 따로 자르면 캐릭터가 클립 전환 때 튄다
//   ③ 가로로 이어 붙여 클립당 PNG 한 장을 쓴다
//   ④ `sprites.ts`에 넣을 frameW/frameH/footY/프레임수를 출력한다
// ---------------------------------------------------------------------------
import { deflateSync, inflateSync } from 'node:zlib'
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'

// ---- PNG ------------------------------------------------------------------

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG가 아님')
  let pos = 8
  let w = 0
  let h = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0)
        throw new Error('8bit RGBA 비인터레이스 PNG만 지원한다')
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * 4
  const px = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const cur = px.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? cur[x - 4] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= 4 ? prev[x - 4] : 0
      let v = line[x]
      if (ft === 1) v = (v + a) & 255
      else if (ft === 2) v = (v + b) & 255
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 255
      else if (ft === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255
      } else if (ft !== 0) throw new Error('알 수 없는 필터 ' + ft)
      cur[x] = v
    }
  }
  return { w, h, px }
}

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  let c = -1
  for (const b of body) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE((c ^ -1) >>> 0)
  return Buffer.concat([len, body, crc])
}
function encodePng(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- 프레임 조작 ------------------------------------------------------------

const blit = (dst, dw, sx, sy, src, sw, sh, dx, dy) => {
  for (let y = 0; y < sh; y++) {
    const from = ((sy + y) * sw + sx) * 4
    src.copy(dst, ((dy + y) * dw + dx) * 4, from, from + sw * 4)
  }
}

/** 자른 프레임 하나를 새 버퍼로 뽑는다. */
function crop(img, box) {
  const out = Buffer.alloc(box.w * box.h * 4)
  for (let y = 0; y < box.h; y++) {
    const from = ((box.y + y) * img.w + box.x) * 4
    img.px.copy(out, y * box.w * 4, from, from + box.w * 4)
  }
  return out
}

/** 투명하지 않은 픽셀의 경계. 빈 프레임이면 null. */
function bbox(img) {
  let x0 = img.w
  let y0 = img.h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.px[(y * img.w + x) * 4 + 3] === 0) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}

const numeric = (a, b) => {
  const n = (s) => Number(s.match(/(\d+)\.png$/)?.[1] ?? 0)
  return n(a) - n(b) // _10 이 _2 앞에 오지 않도록 숫자로 정렬
}

/**
 * 클립별 폴더에서 낱장 프레임을 읽는다. 값은 폴더 이름이거나
 * `{ from, reverse }` — `reverse`는 프레임을 거꾸로 돌린다(일어나는 동작을
 * 쓰러지는 동작으로 재활용하는 용도).
 */
function loadFromFolders(root, clips) {
  const out = {}
  for (const [clip, spec] of Object.entries(clips)) {
    const { from, reverse } = typeof spec === 'string' ? { from: spec } : spec
    const dir = join(root, from)
    const files = readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.png'))
      .sort(numeric)
    if (reverse) files.reverse()
    out[clip] = files.map((f) => decodePng(readFileSync(join(dir, f))))
  }
  return out
}

/** 격자 시트를 프레임으로 쪼갠다. clips는 [시작인덱스, 개수]. */
function loadFromGrid(file, fw, fh, clips) {
  const img = decodePng(readFileSync(file))
  const cols = Math.floor(img.w / fw)
  const out = {}
  for (const [clip, [start, count]] of Object.entries(clips)) {
    out[clip] = []
    for (let i = 0; i < count; i++) {
      const n = start + i
      const box = { x: (n % cols) * fw, y: Math.floor(n / cols) * fh, w: fw, h: fh }
      out[clip].push({ w: fw, h: fh, px: crop(img, box) })
    }
  }
  return out
}

// ---- 작업 정의 --------------------------------------------------------------

const JOBS = [
  {
    id: 'hero-knight',
    load: () =>
      loadFromFolders('assets-raw/hero-knight/Sprites/HeroKnight', {
        idle: 'Idle',
        run: 'Run',
        attack1: 'Attack1',
        attack2: 'Attack2',
        attack3: 'Attack3',
        // 원본 Block은 번쩍이는 이펙트가 붙어 있다. 이 게임은 보호막을 따로
        // 그리므로(`fighter__shield`) 이펙트 없는 판을 쓴다.
        block: 'BlockNoEffect',
        hurt: 'Hurt',
        death: 'DeathNoBlood',
      }),
  },
  // Bandits 팩 하나에 경장·중장 두 캐릭터가 들어 있다(폴더만 다르다).
  ...['Light', 'Heavy'].map((weight) => ({
    id: `bandit-${weight.toLowerCase()}`,
    load: () =>
      loadFromFolders(`assets-raw/bandits/Sprites/${weight} Bandit`, {
        idle: 'Idle',
        run: 'Run',
        // 이 팩엔 공격 동작이 하나뿐이라 세 클립이 같은 프레임을 쓴다.
        attack1: 'Attack',
        attack2: 'Attack',
        attack3: 'Attack',
        // 칼을 든 대기 자세 = 방어 포즈.
        block: 'Combat Idle',
        hurt: 'Hurt',
        // 죽는 동작이 없다(Death는 이미 쓰러진 한 장). 일어나는 Recover를
        // 거꾸로 돌려 쓰러지는 8프레임을 만든다 — 마지막 프레임이 Death와 같다.
        death: { from: 'Recover', reverse: true },
      }),
  })),
]

// ---- 실행 ------------------------------------------------------------------

for (const job of JOBS) {
  let clips
  try {
    clips = job.load()
  } catch (e) {
    console.log(`✗ ${job.id}: ${e.message} — 건너뜀`)
    continue
  }

  // 전 클립 공통 bbox로 잘라야 클립이 바뀔 때 캐릭터가 안 튄다
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const frames of Object.values(clips))
    for (const f of frames) {
      const b = bbox(f)
      if (!b) continue
      x0 = Math.min(x0, b.x0)
      y0 = Math.min(y0, b.y0)
      x1 = Math.max(x1, b.x1)
      y1 = Math.max(y1, b.y1)
    }
  const fw = x1 - x0 + 1
  const fh = y1 - y0 + 1

  // 발이 닿는 선 = idle에서 가장 아래 픽셀(잘라낸 좌표계 기준)
  let footY = fh
  // 몸통의 가로 중심. 공통 bbox는 공격 검기까지 품느라 옆으로 늘어나 있어서
  // 프레임 한가운데가 캐릭터의 중심이 아니다 — 대기 자세를 기준으로 따로 잡는다.
  // 이 값이 틀어지면 캐릭터가 셀에서 옆으로 밀려 선다.
  let anchorSum = 0
  let anchorN = 0
  for (const f of clips.idle ?? []) {
    const b = bbox(f)
    if (!b) continue
    footY = Math.min(footY, Math.max(1, b.y1 - y0 + 1))
    anchorSum += (b.x0 + b.x1) / 2 - x0
    anchorN++
  }
  const anchorX = anchorN ? Math.round(anchorSum / anchorN) : Math.round(fw / 2)

  const report = []
  for (const [clip, frames] of Object.entries(clips)) {
    const strip = Buffer.alloc(fw * frames.length * fh * 4)
    frames.forEach((f, i) => {
      const one = crop(f, { x: x0, y: y0, w: fw, h: fh })
      blit(strip, fw * frames.length, 0, 0, one, fw, fh, i * fw, 0)
    })
    const out = `public/sprites/${job.id}/${clip}.png`
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, encodePng(fw * frames.length, fh, strip))
    report.push(`${clip}:${frames.length}`)
  }
  const bytes = readdirSync(`public/sprites/${job.id}`)
    .filter((f) => f.endsWith('.png'))
    .reduce((n, f) => n + statSync(join('public/sprites', job.id, f)).size, 0)
  console.log(`✓ ${job.id}`)
  console.log(`   frameW: ${fw}, frameH: ${fh}, footY: ${footY}, anchorX: ${anchorX}`)
  console.log(`   ${report.join('  ')}`)
  console.log(`   ${(bytes / 1024).toFixed(1)} KB`)
}
