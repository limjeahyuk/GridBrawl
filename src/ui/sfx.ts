// ---------------------------------------------------------------------------
// 전투 효과음 — Web Audio API로 **절차 합성**한다. 오디오 파일이 0개라 번들·로딩
// 비용이 늘지 않고, 노이즈 버스트 + 사인/톱니 스윕 조합이 사이버 아레나 톤과도
// 맞는다.
//
// ⚠ 브라우저 자동재생 정책상 AudioContext는 **첫 사용자 입력 이후에만** 소리를
//   낸다. `installAudioUnlock()`이 pointerdown/keydown을 잡아 깨우고, 그전에
//   호출된 `playSfx`는 조용히 무시된다(에러 없음).
// ---------------------------------------------------------------------------

export type SfxName =
  | 'ui' // 카드 선택
  | 'uiBack' // 카드 회수
  | 'confirm' // 실행
  | 'move'
  | 'dash'
  | 'guard'
  | 'energy'
  | 'heal'
  | 'swing' // 근접 공격 준비 동작(타격 전 바람소리)
  | 'cast' // 원거리 공격 차지
  | 'hit' // 타격 — intensity로 세기 조절
  | 'block'
  | 'whiff'
  | 'nofuel'
  | 'stun'
  | 'collapse'
  | 'trigger'
  | 'cutin'
  | 'bossHorn' // 보스 등장·격노 컷인
  | 'ko'
  | 'win'
  | 'lose'

const MUTE_KEY = 'gb-sfx-muted'
const MASTER = 0.75

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let muted = readMuted()

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(next: boolean): void {
  muted = next
  try {
    localStorage.setItem(MUTE_KEY, next ? '1' : '0')
  } catch {
    /* 사파리 프라이빗 모드 등 — 저장 실패는 이번 세션만 적용하고 넘어간다 */
  }
  if (ctx && master) master.gain.setTargetAtTime(next ? 0 : MASTER, ctx.currentTime, 0.02)
}

/** 오디오를 연다(또는 정지 상태에서 되살린다). 사용자 입력 안에서만 성공한다. */
export function unlockAudio(): void {
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : MASTER
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
}

/** 앱 시작 시 한 번 호출 — 아무 클릭/키 입력에서나 오디오가 깨어난다.
 *  (모바일에서 앱을 백그라운드로 보내면 컨텍스트가 다시 잠기므로 계속 듣는다.) */
export function installAudioUnlock(): void {
  const wake = () => unlockAudio()
  window.addEventListener('pointerdown', wake, { passive: true })
  window.addEventListener('keydown', wake, { passive: true })
}

// ---- 합성 재료 -------------------------------------------------------------

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf
  const len = Math.floor(c.sampleRate * 1.5)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  noiseBuf = buf
  return buf
}

/** 타격형 감쇠 엔벨로프. exponentialRamp는 0을 못 받으므로 미세값으로 수렴시킨다. */
function envelope(g: GainNode, t0: number, peak: number, dur: number, attack: number) {
  const p = Math.max(0.0002, peak)
  g.gain.setValueAtTime(0.0002, t0)
  g.gain.exponentialRampToValueAtTime(p, t0 + Math.min(attack, dur * 0.4))
  g.gain.exponentialRampToValueAtTime(0.0002, t0 + dur)
}

/** 주파수가 from→to로 미끄러지는 톤 한 방. */
function tone(
  from: number,
  to: number,
  dur: number,
  gain: number,
  type: OscillatorType = 'sine',
  delay = 0,
) {
  if (!ctx || !master) return
  const t0 = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(Math.max(1, from), t0)
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur)
  const g = ctx.createGain()
  envelope(g, t0, gain, dur, 0.008)
  osc.connect(g)
  g.connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.03)
}

/** 필터가 쓸고 지나가는 노이즈 — 타격·바람·치찰음의 재료. */
function burst(
  dur: number,
  gain: number,
  cutFrom: number,
  cutTo: number,
  opts: { delay?: number; type?: BiquadFilterType; q?: number } = {},
) {
  if (!ctx || !master) return
  const c = ctx
  const t0 = c.currentTime + (opts.delay ?? 0)
  const src = c.createBufferSource()
  src.buffer = noise(c)
  const f = c.createBiquadFilter()
  f.type = opts.type ?? 'lowpass'
  f.Q.value = opts.q ?? 1
  f.frequency.setValueAtTime(Math.max(20, cutFrom), t0)
  f.frequency.exponentialRampToValueAtTime(Math.max(20, cutTo), t0 + dur)
  const g = c.createGain()
  envelope(g, t0, gain, dur, 0.004)
  src.connect(f)
  f.connect(g)
  g.connect(master)
  src.start(t0)
  src.stop(t0 + dur + 0.03)
}

const arp = (notes: number[], dur: number, gain: number, type: OscillatorType, gap: number) => {
  notes.forEach((f, i) => tone(f, f, dur, gain, type, i * gap))
}

// ---- 소리 표 ---------------------------------------------------------------

const SFX: Record<SfxName, (k: number) => void> = {
  ui: () => tone(1180, 880, 0.05, 0.09, 'square'),
  uiBack: () => tone(640, 400, 0.07, 0.08, 'square'),
  confirm: () => {
    tone(300, 920, 0.13, 0.12, 'sawtooth')
    burst(0.1, 0.06, 3000, 900)
  },
  move: () => burst(0.15, 0.09, 1500, 320),
  dash: () => {
    burst(0.24, 0.15, 3200, 380)
    tone(170, 88, 0.2, 0.1)
  },
  guard: () => {
    tone(420, 980, 0.17, 0.13, 'triangle')
    tone(1240, 1720, 0.2, 0.05, 'sine', 0.03)
  },
  energy: () => {
    tone(180, 760, 0.28, 0.11, 'sawtooth')
    tone(540, 1520, 0.28, 0.05, 'sine', 0.02)
  },
  heal: () => arp([523, 659, 784], 0.17, 0.09, 'sine', 0.055),
  swing: () => burst(0.16, 0.12, 2800, 620, { type: 'bandpass', q: 0.8 }),
  cast: () => tone(220, 700, 0.2, 0.09, 'sawtooth'),
  // 피해량에 비례하는 세기(k) — 저음 쿵 + 크랙 노이즈 + 금속 성분
  hit: (k) => {
    burst(0.14 + 0.05 * k, 0.34 * k, 4200, 380)
    tone(210, 44, 0.22 + 0.08 * k, 0.42 * k, 'sine')
    tone(940, 300, 0.08, 0.12 * k, 'square', 0.004)
  },
  block: () => {
    burst(0.1, 0.18, 6500, 1800, { q: 5 })
    tone(1600, 940, 0.13, 0.12, 'square')
    tone(300, 150, 0.16, 0.14)
  },
  whiff: () => burst(0.22, 0.08, 1900, 1000, { type: 'bandpass', q: 0.6 }),
  nofuel: () => tone(150, 96, 0.2, 0.13, 'square'),
  stun: () => arp([720, 520, 700, 470], 0.11, 0.09, 'triangle', 0.075),
  collapse: () => burst(0.55, 0.09, 1000, 220, { type: 'bandpass', q: 0.5 }),
  trigger: () => {
    tone(880, 1760, 0.18, 0.09)
    tone(1320, 2640, 0.18, 0.05, 'sine', 0.035)
  },
  // 필살기 컷인 — 라이저가 차오르다 컷인이 끝나는 지점(0.86s)에서 붐
  cutin: () => {
    tone(120, 1500, 0.85, 0.13, 'sawtooth')
    burst(0.85, 0.09, 400, 6000)
    tone(300, 34, 0.55, 0.42, 'sine', 0.86)
    burst(0.4, 0.3, 5000, 200, { delay: 0.86 })
  },
  // 보스 컷인 — 필살기 라이저와 **반대 방향**으로 간다. 저 아래로 떨어지는 뿔나팔
  // 두 겹(완전5도)이 먼저 울리고, 그 위에 낮게 깔리는 바람이 붙는다. 라이저(위로
  // 차오름)는 "간다"는 소리라 이미 필살기가 쓰고 있어서, 보스는 "온다"는 소리여야
  // 구분된다. 길이는 `BOSSCUT_MS`(2.3s)보다 짧게 끝내 여운을 남긴다.
  bossHorn: () => {
    tone(150, 62, 1.5, 0.3, 'sawtooth')
    tone(224, 93, 1.5, 0.17, 'sawtooth', 0.06) // 완전5도 위 — 겹치면 뿔나팔이 된다
    tone(75, 38, 1.9, 0.22, 'sine')
    burst(1.7, 0.07, 700, 130, { type: 'bandpass', q: 0.4 })
    burst(0.5, 0.26, 3800, 160, { delay: 1.15 }) // 마지막에 한 번 내려앉는 굉음
  },
  ko: () => {
    burst(0.55, 0.42, 5200, 180)
    tone(320, 30, 0.75, 0.45)
    tone(130, 28, 0.9, 0.22, 'square', 0.02)
  },
  win: () => arp([523, 659, 784, 1046], 0.22, 0.1, 'triangle', 0.09),
  lose: () => arp([440, 392, 330, 262], 0.28, 0.09, 'triangle', 0.13),
}

/** 효과음 재생. `intensity`는 세기가 있는 소리(hit)에서만 쓰인다 — 0.35~1.8로 clamp. */
export function playSfx(name: SfxName, intensity = 1): void {
  if (muted || !ctx || ctx.state !== 'running') return
  SFX[name](Math.max(0.35, Math.min(1.8, intensity)))
}
