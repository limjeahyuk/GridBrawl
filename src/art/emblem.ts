// ---------------------------------------------------------------------------
// 문장(emblem) — 다크 판타지 리스킨(2026-07-31)의 상징. 룬 고리 위에 교차한
// 검, 그 앞에 잉걸불이 타는 투구.
//
// **한 곳에서만 그린다**: 타이틀 화면이 인라인으로 쓰고(`TitleScreen`),
// `npm run icons`(scripts/makeicons.ts)가 같은 함수를 헤드리스 크롬으로 구워
// `public/icon-*.png`를 만든다. 아이콘만 따로 그린 파일을 두면 둘이 어긋난다.
// ---------------------------------------------------------------------------

const GOLD = '#c9a86a'
const GOLD_DIM = '#8a6f3f'
const STEEL = '#3a3b46'
const STEEL_LIGHT = '#6a6c7c'
const STEEL_DARK = '#22222b'
const EMBER = '#e0733a'
const EMBER_HOT = '#ffc46b'
const LINE = '#0a0810'

/** 위를 향한 장검 한 자루(중심 256,256 기준). 회전시켜 교차 검으로 쓴다. */
function sword(rot: number): string {
  return `<g transform="rotate(${rot} 256 256)">
    <polygon points="256,86 268,124 265,300 247,300 244,124" fill="${STEEL_LIGHT}" stroke="${LINE}" stroke-width="6" stroke-linejoin="round"/>
    <polygon points="256,96 262,126 260,296 256,296" fill="#9aa0b4" opacity="0.75"/>
    <rect x="222" y="298" width="68" height="16" rx="5" fill="${GOLD}" stroke="${LINE}" stroke-width="5"/>
    <rect x="246" y="314" width="20" height="46" rx="6" fill="#4a3526" stroke="${LINE}" stroke-width="5"/>
    <circle cx="256" cy="368" r="13" fill="${GOLD_DIM}" stroke="${LINE}" stroke-width="5"/>
  </g>`
}

/** 큰 투구 — 잉걸불이 새어 나오는 가로 시야구. */
function helm(): string {
  return `<g>
    <path d="M188 254 C188 198 214 176 256 176 C298 176 324 198 324 254 L324 300 C324 344 296 362 256 362 C216 362 188 344 188 300 Z"
      fill="url(#helm-steel)" stroke="${LINE}" stroke-width="9" stroke-linejoin="round"/>
    <rect x="243" y="176" width="26" height="186" fill="${STEEL_DARK}" opacity="0.85"/>
    <rect x="190" y="246" width="132" height="30" fill="${STEEL_DARK}" opacity="0.85"/>
    <g filter="url(#emberglow)">
      <rect x="200" y="252" width="112" height="17" rx="5" fill="${EMBER}"/>
      <rect x="206" y="256" width="100" height="8" rx="4" fill="${EMBER_HOT}"/>
    </g>
    <g fill="${STEEL_DARK}">
      <rect x="212" y="304" width="26" height="9" rx="4"/>
      <rect x="274" y="304" width="26" height="9" rx="4"/>
      <rect x="212" y="322" width="26" height="9" rx="4"/>
      <rect x="274" y="322" width="26" height="9" rx="4"/>
    </g>
    <g fill="${GOLD_DIM}">
      <circle cx="203" cy="230" r="7"/><circle cx="309" cy="230" r="7"/>
      <circle cx="203" cy="318" r="7"/><circle cx="309" cy="318" r="7"/>
    </g>
  </g>`
}

/**
 * 문장 SVG. `bg`를 켜면 앱 아이콘용 배경(그을린 돌 + 룬 격자)까지 그린다 —
 * 화면 안에서는 이미 배경이 있으니 끈다.
 */
export function buildEmblemSvg({ bg = false }: { bg?: boolean } = {}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>
  <linearGradient id="helm-steel" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${STEEL_LIGHT}"/>
    <stop offset="0.55" stop-color="${STEEL}"/>
    <stop offset="1" stop-color="${STEEL_DARK}"/>
  </linearGradient>
  <radialGradient id="soot" cx="0.5" cy="0.42" r="0.72">
    <stop offset="0" stop-color="#1c1622"/>
    <stop offset="1" stop-color="#06050a"/>
  </radialGradient>
  <radialGradient id="torch" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="${EMBER}" stop-opacity="0.42"/>
    <stop offset="1" stop-color="${EMBER}" stop-opacity="0"/>
  </radialGradient>
  <filter id="emberglow" x="-80%" y="-80%" width="260%" height="260%">
    <feGaussianBlur stdDeviation="7" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
${
  bg
    ? `<rect width="512" height="512" fill="url(#soot)"/>
<g stroke="${GOLD}" stroke-width="2" opacity="0.10">
  ${[1, 2, 3, 4, 5].map((i) => `<line x1="${i * 85.3}" y1="0" x2="${i * 85.3}" y2="512"/>`).join('')}
  ${[1, 2].map((i) => `<line x1="0" y1="${i * 170.6}" x2="512" y2="${i * 170.6}"/>`).join('')}
</g>`
    : ''
}
<circle cx="256" cy="262" r="196" fill="url(#torch)"/>
<circle cx="256" cy="262" r="182" fill="none" stroke="${GOLD_DIM}" stroke-width="6" opacity="0.55"/>
<circle cx="256" cy="262" r="196" fill="none" stroke="${GOLD}" stroke-width="7" stroke-dasharray="26 20" stroke-linecap="round" opacity="0.85"/>
${sword(40)}
${sword(-40)}
${helm()}
</svg>`
}
