import type { CharacterDef } from '../data/roster'

// ---------------------------------------------------------------------------
// 절차적 SVG 일러스트 — 캐주얼 치비(마스코트) 스타일.
// 동글동글한 공용 리그(큰 머리 + 작은 몸통)를 캐릭터 색으로 틴트하고,
// 머리 장식(더듬머리·뿔·후광·고양이 귀…)과 시그니처 소품으로 실루엣을
// 구분한다. 문자열 SVG로 반환 — 배틀은 래스터/인라인, 메뉴는 초상화 인라인.
// ---------------------------------------------------------------------------

interface Pal {
  accent: string
  accent2: string
  line: string
  face: string
  belly: string
  cheek: string
}

function pal(c: CharacterDef): Pal {
  return {
    accent: c.accent,
    accent2: c.accent2,
    line: '#4a3f3c',
    face: '#fffdf4',
    belly: '#fff3d9',
    cheek: '#ff9f9a',
  }
}

/** 공용 아웃라인 속성(둥근 조인/캡) */
const S = (p: Pal, w = 5) =>
  `stroke="${p.line}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`

/** 짧은 팔다리 — 아웃라인 먼저, 본색 위에. */
function limb(pts: [number, number][], w: number, col: string, p: Pal) {
  const d = 'M ' + pts.map((pt) => `${pt[0]} ${pt[1]}`).join(' L ')
  return (
    `<path d="${d}" fill="none" stroke="${p.line}" stroke-width="${w + 8}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
  )
}

// --- 캐릭터별 머리 장식 (머리 중심 102,128 · 반지름 62 기준) -----------------

function hat(id: string, p: Pal): string {
  switch (id) {
    case 'volt': // 번개 더듬머리
      return `<polygon points="96,72 128,30 114,62 142,46 104,84" fill="${p.accent2}" ${S(p, 4)}/>`
    case 'titan': // 리벳 박힌 머리띠
      return (
        `<rect x="44" y="86" width="118" height="22" rx="11" fill="${p.accent2}" ${S(p, 4)}/>` +
        `<circle cx="68" cy="97" r="4" fill="${p.line}"/><circle cx="102" cy="97" r="4" fill="${p.line}"/><circle cx="136" cy="97" r="4" fill="${p.line}"/>`
      )
    case 'nova': // 후광 + 별
      return (
        `<ellipse cx="102" cy="50" rx="36" ry="11" fill="none" stroke="${p.accent2}" stroke-width="7" opacity="0.95"/>` +
        `<path d="M160 54 l5 10 11 2 -8 8 2 11 -10 -5 -10 5 2 -11 -8 -8 11 -2 Z" fill="#ffd166" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>`
      )
    case 'cipher': // 고양이 귀 (스텔스 냥)
      return (
        `<polygon points="52,90 58,44 94,74" fill="${p.accent}" ${S(p, 4)}/>` +
        `<polygon points="152,88 150,42 114,72" fill="${p.accent}" ${S(p, 4)}/>` +
        `<polygon points="62,80 66,58 84,74" fill="${p.accent2}"/>` +
        `<polygon points="144,78 142,56 126,70" fill="${p.accent2}"/>`
      )
    case 'aegis': // 기사 투구 깃털
      return `<path d="M92 68 Q 92 26 132 26 Q 112 42 112 72 Z" fill="${p.accent2}" ${S(p, 4)}/>`
    case 'ember': // 작은 뿔 + 불꽃 앞머리
      return (
        `<polygon points="62,86 46,52 84,72" fill="${p.accent2}" ${S(p, 4)}/>` +
        `<polygon points="142,82 154,48 120,68" fill="${p.accent2}" ${S(p, 4)}/>` +
        `<path d="M90 68 Q 86 42 102 32 Q 100 48 112 52 Q 116 40 124 36 Q 122 58 108 70 Z" fill="#ffb35c" ${S(p, 3)}/>`
      )
    default:
      return ''
  }
}

// --- 시그니처 소품 -----------------------------------------------------------

function signatureBack(id: string, p: Pal): string {
  switch (id) {
    case 'volt': // 등 뒤 스파크
      return `<polygon points="34,190 58,178 46,206 68,198 38,236 50,210 28,216" fill="${p.accent2}" opacity="0.9"/>`
    case 'nova': // 떠다니는 빛방울
      return `<circle cx="44" cy="198" r="20" fill="${p.accent2}" opacity="0.5"/><circle cx="44" cy="198" r="11" fill="#fff" opacity="0.85"/>`
    case 'ember': // 불꽃 꼬리
      return `<path d="M46 252 Q 30 212 52 188 Q 48 220 66 230 Q 72 206 84 196 Q 80 236 60 258 Z" fill="#ff9d5c" ${S(p, 3)}/>`
    case 'titan': // 든든한 배낭
      return `<rect x="34" y="210" width="30" height="48" rx="12" fill="${p.accent2}" ${S(p, 4)}/>`
    default:
      return ''
  }
}

function signatureFront(id: string, p: Pal): string {
  switch (id) {
    case 'nova': // 손끝의 플라즈마 구슬
      return `<circle cx="172" cy="248" r="18" fill="${p.accent2}" opacity="0.55"/><circle cx="172" cy="248" r="10" fill="#fff"/><circle cx="172" cy="248" r="16" fill="none" stroke="${p.accent}" stroke-width="2.5"/>`
    case 'cipher': // 장난감 수리검
      return `<path d="M172 230 l6 13 13 6 -13 6 -6 13 -6 -13 -13 -6 13 -6 Z" fill="${p.accent2}" ${S(p, 3)}/>`
    case 'aegis': // 미니 방패
      return (
        `<path d="M168 222 Q 196 228 194 258 Q 192 288 168 300 Q 144 288 142 258 Q 140 228 168 222 Z" fill="${p.accent2}" ${S(p, 5)}/>` +
        `<circle cx="168" cy="256" r="10" fill="${p.accent}" stroke="${p.line}" stroke-width="3"/>`
      )
    case 'volt': // 손끝 번개
      return `<polygon points="162,236 186,228 172,252 194,246 166,276 178,254 158,258" fill="${p.accent2}" ${S(p, 3)}/>`
    case 'ember': // 손끝 불꽃
      return `<path d="M162 258 Q 154 234 172 222 Q 168 244 184 250 Q 192 232 198 226 Q 194 258 176 272 Z" fill="#ffb35c" ${S(p, 3)}/>`
    case 'titan': // 커다란 주먹장갑
      return `<circle cx="170" cy="252" r="21" fill="${p.accent2}" ${S(p, 5)}/>`
    default:
      return ''
  }
}

/** 얼굴(눈·입·볼터치) — 오른쪽을 바라보는 배치 */
function facial(p: Pal): string {
  return [
    `<ellipse cx="112" cy="134" rx="44" ry="37" fill="${p.face}"/>`,
    `<circle cx="96" cy="128" r="9.5" fill="#453a37"/>`,
    `<circle cx="134" cy="128" r="9.5" fill="#453a37"/>`,
    `<circle cx="93" cy="124" r="3.2" fill="#fff"/>`,
    `<circle cx="131" cy="124" r="3.2" fill="#fff"/>`,
    `<path d="M106 150 Q 115 158 124 150" fill="none" stroke="#453a37" stroke-width="4" stroke-linecap="round"/>`,
    `<ellipse cx="80" cy="148" rx="8" ry="5.5" fill="${p.cheek}" opacity="0.55"/>`,
    `<ellipse cx="148" cy="148" rx="8" ry="5.5" fill="${p.cheek}" opacity="0.55"/>`,
  ].join('')
}

/** 전신 치비 스프라이트, 오른쪽을 바라봄. viewBox 0 0 200 340; 발 y≈330. */
export function buildFighterSvg(c: CharacterDef): string {
  const p = pal(c)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 340" width="200" height="340">
<g>
  <ellipse cx="100" cy="329" rx="54" ry="9" fill="rgba(60,90,50,0.18)"/>
  ${signatureBack(c.id, p)}
  ${limb([[84, 288], [80, 318]], 16, c.accent, p)}
  ${limb([[116, 288], [122, 318]], 16, c.accent, p)}
  <ellipse cx="78" cy="323" rx="17" ry="9" fill="${p.accent2}" ${S(p, 4)}/>
  <ellipse cx="126" cy="323" rx="17" ry="9" fill="${p.accent2}" ${S(p, 4)}/>
  <ellipse cx="100" cy="246" rx="50" ry="55" fill="${c.accent}" ${S(p, 5)}/>
  <ellipse cx="108" cy="258" rx="28" ry="33" fill="${p.belly}"/>
  <circle cx="52" cy="240" r="13" fill="${c.accent}" ${S(p, 4)}/>
  ${limb([[140, 236], [158, 248]], 14, c.accent, p)}
  <circle cx="164" cy="250" r="12" fill="${p.accent2}" ${S(p, 4)}/>
  <circle cx="102" cy="128" r="62" fill="${c.accent}" ${S(p, 5)}/>
  ${facial(p)}
  ${hat(c.id, p)}
  ${signatureFront(c.id, p)}
</g>
</svg>`
}

/** 얼굴 위주 초상화(선택 화면용). viewBox 0 0 300 340. */
export function buildPortraitSvg(c: CharacterDef): string {
  const p = pal(c)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 340" width="300" height="340" preserveAspectRatio="xMidYMid slice">
<defs>
  <radialGradient id="bg-${c.id}" cx="0.5" cy="0.35" r="0.85">
    <stop offset="0" stop-color="${c.accent}" stop-opacity="0.30"/>
    <stop offset="0.7" stop-color="${c.accent2}" stop-opacity="0.14"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect width="300" height="340" fill="#eaf6ff"/>
<rect width="300" height="340" fill="url(#bg-${c.id})"/>
<g fill="#ffffff" opacity="0.85">
  <ellipse cx="60" cy="52" rx="46" ry="17"/>
  <ellipse cx="98" cy="40" rx="32" ry="13"/>
  <ellipse cx="252" cy="86" rx="40" ry="14"/>
</g>
<path d="M0 300 Q 150 258 300 296 L 300 340 L 0 340 Z" fill="#9bd77f"/>
<ellipse cx="150" cy="352" rx="98" ry="72" fill="${c.accent}" stroke="${p.line}" stroke-width="6"/>
<ellipse cx="150" cy="362" rx="56" ry="42" fill="${p.belly}"/>
<circle cx="150" cy="178" r="96" fill="${c.accent}" stroke="${p.line}" stroke-width="6"/>
<g transform="translate(-8 -20) scale(1.55)">
  ${facial(p)}
  ${hat(c.id, p)}
</g>
</svg>`
}

/** 초원 아레나 배경. viewBox는 1280x720 스테이지와 일치. */
export function buildStageSvg(accentA = '#8fdc74', accentB = '#ffd166'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#7ec8ec"/>
    <stop offset="0.6" stop-color="#d8f1fb"/>
    <stop offset="1" stop-color="#e8f7e0"/>
  </linearGradient>
</defs>
<rect width="1280" height="720" fill="url(#sky)"/>
<circle cx="1080" cy="118" r="56" fill="#ffdf8a"/>
<circle cx="1080" cy="118" r="82" fill="#ffdf8a" opacity="0.35"/>
<g fill="#ffffff" opacity="0.92">
  <ellipse cx="230" cy="142" rx="90" ry="32"/>
  <ellipse cx="305" cy="122" rx="66" ry="26"/>
  <ellipse cx="700" cy="92" rx="78" ry="25"/>
  <ellipse cx="640" cy="112" rx="58" ry="22"/>
</g>
<path d="M0 470 Q 250 380 520 440 T 1280 420 L 1280 720 L 0 720 Z" fill="#a5dd8b"/>
<path d="M0 560 Q 320 470 680 540 T 1280 520 L 1280 720 L 0 720 Z" fill="#85cc68"/>
<path d="M0 660 Q 400 610 760 650 T 1280 640 L 1280 720 L 0 720 Z" fill="#72bd55"/>
<g fill="#ffffff">
  <circle cx="180" cy="608" r="7"/><circle cx="560" cy="592" r="6"/><circle cx="980" cy="624" r="7"/>
</g>
<g fill="${accentB}">
  <circle cx="180" cy="608" r="3"/><circle cx="560" cy="592" r="2.6"/><circle cx="980" cy="624" r="3"/>
</g>
<rect y="700" width="1280" height="20" fill="${accentA}" opacity="0.5"/>
</svg>`
}
