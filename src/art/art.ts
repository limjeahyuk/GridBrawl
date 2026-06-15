import type { CharacterDef } from '../data/roster'

// ---------------------------------------------------------------------------
// Procedural SVG illustration for every fighter. A shared "avatar rig" (a
// chunky, side-facing mech-warrior in a guard stance) is tinted per character
// and topped with a unique helmet + signature kit, so each reads as a distinct
// silhouette. Returned as SVG strings; the loader rasterises them for canvas,
// while the menus inline the portraits directly.
// ---------------------------------------------------------------------------

interface Pal {
  accent: string
  accent2: string
  dark: string
  mid: string
  light: string
  line: string
}

function pal(c: CharacterDef): Pal {
  return {
    accent: c.accent,
    accent2: c.accent2,
    dark: '#0d1120',
    mid: '#1c2338',
    light: '#33405f',
    line: '#05070e',
  }
}

const P = (pts: [number, number][]) => pts.map((p) => `${p[0]},${p[1]}`).join(' ')

function poly(points: [number, number][], fill: string, line: string, lw = 4) {
  return `<polygon points="${P(points)}" fill="${fill}" stroke="${line}" stroke-width="${lw}" stroke-linejoin="round"/>`
}

/** Outlined limb built from a poly-line (outline drawn first, then fill). */
function limb(pts: [number, number][], w: number, col: string, line: string) {
  const d = 'M ' + pts.map((p) => `${p[0]} ${p[1]}`).join(' L ')
  return (
    `<path d="${d}" fill="none" stroke="${line}" stroke-width="${w + 7}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
  )
}

function circle(cx: number, cy: number, r: number, fill: string, line = 'none', lw = 0) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${line !== 'none' ? ` stroke="${line}" stroke-width="${lw}"` : ''}/>`
}

// --- per-character helmet (head centred near 110,82) ------------------------

function helmet(id: string, p: Pal): string {
  const eye = `<rect x="106" y="72" width="26" height="9" rx="3" fill="${p.accent}" filter="url(#g-${id})"/>`
  switch (id) {
    case 'volt':
      return [
        poly([[86, 70], [120, 56], [136, 74], [128, 96], [96, 98], [84, 84]], p.light, p.line, 4),
        poly([[120, 56], [150, 40], [138, 70], [128, 70]], p.accent, p.line, 3), // fin
        eye,
      ].join('')
    case 'titan':
      return [
        poly([[80, 72], [96, 52], [128, 54], [140, 76], [132, 100], [88, 100]], p.light, p.line, 5),
        poly([[88, 96], [132, 96], [128, 110], [92, 110]], p.mid, p.line, 4), // heavy jaw
        `<rect x="104" y="74" width="30" height="8" rx="2" fill="${p.accent}" filter="url(#g-${id})"/>`,
      ].join('')
    case 'nova':
      return [
        `<ellipse cx="110" cy="80" rx="30" ry="32" fill="${p.light}" stroke="${p.line}" stroke-width="4"/>`,
        `<circle cx="110" cy="78" r="40" fill="none" stroke="${p.accent}" stroke-width="3" opacity="0.8" filter="url(#g-${id})"/>`, // halo
        eye,
      ].join('')
    case 'cipher':
      return [
        poly([[84, 78], [104, 52], [134, 64], [132, 96], [100, 102], [82, 92]], p.dark, p.line, 4),
        poly([[100, 74], [126, 70], [120, 82], [102, 84]], p.accent, p.line, 0), // single eye slit
        `<polygon points="104,52 112,40 116,56" fill="${p.accent2}" opacity="0.9"/>`,
      ].join('')
    case 'aegis':
      return [
        poly([[84, 74], [98, 50], [126, 50], [138, 74], [130, 100], [92, 100]], p.light, p.line, 5),
        `<rect x="106" y="58" width="9" height="40" rx="3" fill="${p.dark}" stroke="${p.line}" stroke-width="2"/>`, // visor slit
        poly([[104, 50], [114, 30], [120, 50]], p.accent, p.line, 2), // crest
        `<rect x="108" y="64" width="5" height="26" fill="${p.accent}" filter="url(#g-${id})"/>`,
      ].join('')
    case 'ember':
      return [
        poly([[84, 76], [102, 54], [132, 58], [138, 80], [126, 100], [90, 98]], p.light, p.line, 4),
        poly([[96, 56], [86, 30], [108, 52]], p.accent, p.line, 2), // horn
        poly([[126, 58], [142, 34], [134, 62]], p.accent, p.line, 2), // horn
        eye,
      ].join('')
    default:
      return [circle(110, 80, 30, p.light, p.line, 4), eye].join('')
  }
}

function signatureBack(id: string, p: Pal): string {
  switch (id) {
    case 'volt':
      return `<g opacity="0.85" filter="url(#g-${id})"><polygon points="44,150 70,140 58,168 78,162 50,200 62,176 40,182" fill="${p.accent}"/></g>`
    case 'nova':
      return `<g filter="url(#g-${id})"><circle cx="60" cy="170" r="26" fill="${p.accent}" opacity="0.5"/><circle cx="60" cy="170" r="15" fill="${p.accent2}" opacity="0.85"/></g>`
    case 'ember':
      return `<g opacity="0.8" filter="url(#g-${id})"><path d="M60 210 Q48 170 64 150 Q60 184 78 196 Q86 168 96 156 Q92 196 74 220 Z" fill="${p.accent}"/></g>`
    case 'titan':
      return `<polygon points="60,118 92,108 96,150 64,158" fill="${p.mid}" stroke="${p.line}" stroke-width="4"/>` // rear shoulder bulk
    default:
      return ''
  }
}

function signatureFront(id: string, p: Pal): string {
  switch (id) {
    case 'nova':
      // floating plasma orb at the lead hand
      return `<g filter="url(#g-${id})"><circle cx="176" cy="150" r="22" fill="${p.accent}" opacity="0.55"/><circle cx="176" cy="150" r="12" fill="#fff" opacity="0.9"/><circle cx="176" cy="150" r="19" fill="none" stroke="${p.accent2}" stroke-width="2"/></g>`
    case 'cipher':
      return `<g filter="url(#g-${id})"><polygon points="168,150 210,138 176,158" fill="${p.accent}" stroke="${p.line}" stroke-width="2"/><polygon points="150,108 142,84 158,104" fill="${p.accent}"/></g>`
    case 'aegis':
      return `<g><rect x="150" y="116" width="24" height="74" rx="8" fill="${p.mid}" stroke="${p.accent}" stroke-width="3"/><rect x="156" y="128" width="10" height="50" rx="4" fill="${p.accent}" opacity="0.55" filter="url(#g-${id})"/></g>`
    case 'volt':
      return `<g filter="url(#g-${id})"><polygon points="168,140 192,134 178,154 198,150 172,176 182,156 166,158" fill="${p.accent2}"/></g>`
    case 'ember':
      return `<g opacity="0.9" filter="url(#g-${id})"><path d="M170 150 Q160 128 176 116 Q172 140 188 146 Q196 126 202 120 Q198 150 182 166 Z" fill="${p.accent}"/></g>`
    case 'titan':
      return `<circle cx="178" cy="152" r="20" fill="${p.light}" stroke="${p.line}" stroke-width="5"/>` // oversized fist
    default:
      return ''
  }
}

const defs = (id: string, p: Pal) => `
<defs>
  <filter id="g-${id}" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="0" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <linearGradient id="torso-${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${p.light}"/>
    <stop offset="1" stop-color="${p.mid}"/>
  </linearGradient>
</defs>`

/** Full-body fighter sprite, facing right. viewBox 0 0 200 340; feet at y≈330. */
export function buildFighterSvg(c: CharacterDef): string {
  const p = pal(c)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 340" width="200" height="340">
${defs(c.id, p)}
<g>
  ${signatureBack(c.id, p)}
  ${limb([[96, 168], [80, 152], [98, 116]], 15, p.mid, p.line)}
  ${limb([[100, 206], [80, 262], [70, 328]], 19, p.mid, p.line)}
  ${limb([[104, 206], [126, 256], [132, 328]], 19, p.light, p.line)}
  <polygon points="86,196 118,196 122,214 82,214" fill="${p.mid}" stroke="${p.line}" stroke-width="4"/>
  <polygon points="84,118 124,116 120,200 86,200" fill="url(#torso-${c.id})" stroke="${p.line}" stroke-width="4"/>
  <polygon points="92,132 116,131 112,176 96,176" fill="${p.dark}" stroke="${p.accent}" stroke-width="2"/>
  <circle cx="104" cy="150" r="6" fill="${p.accent}" filter="url(#g-${c.id})"/>
  ${helmet(c.id, p)}
  ${limb([[118, 130], [150, 144], [168, 150]], 15, p.light, p.line)}
  <circle cx="172" cy="151" r="11" fill="${p.light}" stroke="${p.line}" stroke-width="4"/>
  ${signatureFront(c.id, p)}
</g>
</svg>`
}

/** Head-and-shoulders portrait for the select screen. viewBox 0 0 300 340. */
export function buildPortraitSvg(c: CharacterDef): string {
  const p = pal(c)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 340" width="300" height="340" preserveAspectRatio="xMidYMid slice">
<defs>
  <radialGradient id="bg-${c.id}" cx="0.5" cy="0.4" r="0.78">
    <stop offset="0" stop-color="${c.accent}" stop-opacity="0.16"/>
    <stop offset="0.55" stop-color="${c.accent2}" stop-opacity="0.06"/>
    <stop offset="1" stop-color="#070a13" stop-opacity="0"/>
  </radialGradient>
  <filter id="pg-${c.id}" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="0" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <linearGradient id="ptorso-${c.id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${p.light}"/>
    <stop offset="1" stop-color="${p.dark}"/>
  </linearGradient>
</defs>
<rect width="300" height="340" fill="url(#bg-${c.id})"/>
<g stroke="${c.accent}" stroke-width="1.5" opacity="0.5" fill="none">
  <path d="M16 16 H64 M16 16 V64"/>
  <path d="M284 324 H236 M284 324 V276"/>
</g>
<polygon points="60,330 74,236 118,212 182,212 226,236 240,330" fill="url(#ptorso-${c.id})" stroke="${p.line}" stroke-width="4"/>
<rect x="136" y="186" width="28" height="34" fill="${p.mid}" stroke="${p.line}" stroke-width="3"/>
<polygon points="118,226 182,226 198,330 102,330" fill="${p.dark}" stroke="${c.accent}" stroke-width="2"/>
<circle cx="150" cy="278" r="9" fill="${c.accent}" filter="url(#pg-${c.id})"/>
<g transform="translate(-34 8) scale(1.62)">
  ${helmet(c.id, p)}
</g>
</svg>`
}

/** Arena backdrop. viewBox matches the 1280x720 stage. */
export function buildStageSvg(accentA = '#2ff3ff', accentB = '#ff3df0'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#080b16"/>
    <stop offset="0.55" stop-color="#0d1428"/>
    <stop offset="1" stop-color="#070a13"/>
  </linearGradient>
  <radialGradient id="halo" cx="0.5" cy="0.3" r="0.6">
    <stop offset="0" stop-color="${accentA}" stop-opacity="0.18"/>
    <stop offset="1" stop-color="${accentA}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#141d35"/>
    <stop offset="1" stop-color="#0a0f1e"/>
  </linearGradient>
</defs>
<rect width="1280" height="720" fill="url(#sky)"/>
<rect width="1280" height="720" fill="url(#halo)"/>
<g opacity="0.5" stroke="${accentB}" stroke-width="2" fill="none">
  <polygon points="180,120 360,90 360,360 180,380"/>
  <polygon points="1100,120 920,90 920,360 1100,380"/>
</g>
<g stroke="${accentA}" stroke-width="1" opacity="0.22">
  ${Array.from({ length: 14 }, (_, i) => `<line x1="${i * 92}" y1="430" x2="${i * 92}" y2="612"/>`).join('')}
  <line x1="0" y1="470" x2="1280" y2="470"/>
  <line x1="0" y1="520" x2="1280" y2="520"/>
  <line x1="0" y1="575" x2="1280" y2="575"/>
</g>
<rect y="612" width="1280" height="108" fill="url(#floor)"/>
<rect y="608" width="1280" height="5" fill="${accentA}" opacity="0.7"/>
<g stroke="${accentA}" stroke-width="2" opacity="0.30" fill="none">
  ${Array.from({ length: 20 }, (_, i) => {
    const x = 640 + (i - 10) * 120
    return `<line x1="${x}" y1="613" x2="${640 + (i - 10) * 320}" y2="720"/>`
  }).join('')}
</g>
</svg>`
}
