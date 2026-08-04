// ---------------------------------------------------------------------------
// 의존성 0개 PNG 코덱 — 스프라이트 패커(`packsprites.mjs`)와 앱 아이콘
// 생성기(`makeicon.mjs`)가 함께 쓴다. zlib은 node 내장이라 설치가 필요 없다.
// ---------------------------------------------------------------------------
import { deflateSync, inflateSync } from 'node:zlib'


/**
 * 8bit 비인터레이스 PNG를 RGBA 버퍼로 푼다. 지원하는 색 방식은 두 가지:
 *   - **트루컬러+알파(colorType 6)** — LuizMelo·Sven Thole 계열이 이쪽
 *   - **팔레트(colorType 3)** — ansimuz(Gothicvania) 계열이 이쪽. 팔레트는
 *     PLTE에서 RGB를, tRNS에서 인덱스별 알파를 읽어 RGBA로 펴 준다.
 * ⚠ 픽셀당 바이트 수가 다르므로(팔레트 1 · RGBA 4) 언필터의 "왼쪽 이웃" 거리도
 *   같이 달라진다. 이 값이 어긋나면 이미지가 조용히 비스듬히 뭉개진다.
 */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG가 아님')
  let pos = 8
  let w = 0
  let h = 0
  let colorType = 6
  let plte = null
  let trns = null
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      colorType = data[9]
      if (data[8] !== 8 || data[12] !== 0 || (colorType !== 6 && colorType !== 3))
        throw new Error('8bit RGBA 또는 8bit 팔레트 PNG(비인터레이스)만 지원한다')
    } else if (type === 'PLTE') plte = Buffer.from(data)
    else if (type === 'tRNS') trns = Buffer.from(data)
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const bpp = colorType === 3 ? 1 : 4 // 픽셀당 바이트 = 언필터의 왼쪽 이웃 거리
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const lines = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const cur = lines.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? lines.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= bpp ? prev[x - bpp] : 0
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
  if (colorType === 6) return { w, h, px: lines }
  if (!plte) throw new Error('팔레트 PNG인데 PLTE 청크가 없다')
  // 인덱스 → RGBA. tRNS가 없거나 짧으면 그 인덱스는 불투명이다(PNG 규격).
  const px = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const idx = lines[i]
    px[i * 4] = plte[idx * 3]
    px[i * 4 + 1] = plte[idx * 3 + 1]
    px[i * 4 + 2] = plte[idx * 3 + 2]
    px[i * 4 + 3] = trns && idx < trns.length ? trns[idx] : 255
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
/**
 * RGBA 버퍼를 PNG로 굽는다. 입력은 언제나 RGBA지만, `opaque`를 주면 알파를
 * 버리고 **트루컬러(colorType 2)** 로 쓴다 — iOS 앱 아이콘은 알파 채널이 있으면
 * App Store 업로드가 거부되므로 그쪽 출력에는 이 옵션이 필수다.
 */
export function encodePng(w, h, px, { opaque = false } = {}) {
  const bpp = opaque ? 3 : 4
  const stride = w * bpp
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    const at = y * (stride + 1)
    raw[at] = 0
    if (opaque) {
      for (let x = 0; x < w; x++) {
        const s = (y * w + x) * 4
        raw[at + 1 + x * 3] = px[s]
        raw[at + 2 + x * 3] = px[s + 1]
        raw[at + 3 + x * 3] = px[s + 2]
      }
    } else {
      px.copy(raw, at + 1, y * stride, (y + 1) * stride)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = opaque ? 2 : 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}


