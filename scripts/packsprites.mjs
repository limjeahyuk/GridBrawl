// ---------------------------------------------------------------------------
// 스프라이트 패커 — 원본 팩(`assets-raw/`)을 게임이 쓰는 **가로 스트립**으로
// 굽는다(`public/sprites/<id>/<clip>.png`). 규격은 public/sprites/README.md.
//
//   node scripts/packsprites.mjs
//
// 의존성 0개. PNG 디코드/인코드는 `png.mjs`가 직접 한다(zlib은 node 내장) —
// ImageMagick 설치를 강요하지 않는다.
//
// 하는 일:
//   ① 낱장 프레임 폴더 또는 격자 시트에서 프레임을 모은다
//   ② **모든 클립을 통틀어** 내용 경계(bbox)를 구해 전 프레임을 같은 크기로 자른다
//      — 클립마다 따로 자르면 캐릭터가 클립 전환 때 튄다
//   ③ 가로로 이어 붙여 클립당 PNG 한 장을 쓴다
//   ④ `sprites.ts`에 넣을 frameW/frameH/footY/프레임수를 출력한다
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'

// PNG 코덱은 아이콘 생성기와 공유한다.
import { decodePng, encodePng } from './png.mjs'

// ---- 프레임 조작 ------------------------------------------------------------

const blit = (dst, dw, sx, sy, src, sw, sh, dx, dy) => {
  for (let y = 0; y < sh; y++) {
    const from = ((sy + y) * sw + sx) * 4
    src.copy(dst, ((dy + y) * dw + dx) * 4, from, from + sw * 4)
  }
}

/**
 * 클립마다 캔버스 크기가 다른 팩을 하나로 맞춘다(Gothicvania demon: 대기 256×176,
 * 공격 312×220). 뒤따르는 공통 bbox 크롭이 **모든 프레임이 같은 크기**임을 전제로
 * 해서, 안 맞으면 버퍼를 넘겨 읽고 터진다.
 *
 * ⚠ 정렬이 핵심이다 — **가로는 가운데, 세로는 아래**에 맞춘다. 서 있는 캐릭터는
 * 발이 닿는 선과 몸통 중심이 기준이라, 좌상단에 맞추면 큰 캔버스 클립에서
 * 캐릭터가 공중에 뜨거나 옆으로 밀린다.
 */
function padToCommonCanvas(clips) {
  let mw = 0
  let mh = 0
  for (const frames of Object.values(clips))
    for (const f of frames) {
      mw = Math.max(mw, f.w)
      mh = Math.max(mh, f.h)
    }
  const out = {}
  for (const [clip, frames] of Object.entries(clips)) {
    out[clip] = frames.map((f) => {
      if (f.w === mw && f.h === mh) return f
      const px = Buffer.alloc(mw * mh * 4)
      blit(px, mw, 0, 0, f.px, f.w, f.h, Math.floor((mw - f.w) / 2), mh - f.h)
      return { w: mw, h: mh, px }
    })
  }
  return out
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

/**
 * 이미 **가로 스트립**으로 배포된 팩을 읽는다(LuizMelo·Monsters Creatures 계열).
 * 프레임 수는 이미지 폭 / frameW로 나온다 — 팩마다 클립별 프레임 수가 달라서
 * 손으로 세는 것보다 이쪽이 안전하다.
 */
function loadFromStrips(root, frameW, files) {
  const out = {}
  for (const [clip, file] of Object.entries(files)) {
    const img = decodePng(readFileSync(join(root, file)))
    const n = Math.round(img.w / frameW)
    if (n < 1) throw new Error(`${file}: 폭 ${img.w}가 frameW ${frameW}보다 작다`)
    if (img.w % frameW !== 0)
      throw new Error(`${file}: 폭 ${img.w}가 frameW ${frameW}로 나누어떨어지지 않는다`)
    out[clip] = Array.from({ length: n }, (_, i) => ({
      w: frameW,
      h: img.h,
      px: crop(img, { x: i * frameW, y: 0, w: frameW, h: img.h }),
    }))
  }
  return out
}

// ---- 작업 정의 --------------------------------------------------------------

const RAW = 'assets-raw'

const JOBS = [
  // --- 플레이어 직업 --------------------------------------------------------
  {
    id: 'huntress', // 궁수 — 임시로 쓰던 경장 도적을 대체한다
    load: () =>
      loadFromStrips(`${RAW}/Huntress/Sprites`, 150, {
        idle: 'Idle.png',
        run: 'Run.png',
        attack1: 'Attack1.png',
        attack2: 'Attack2.png',
        attack3: 'Attack3.png',
        hurt: 'Take hit.png',
        death: 'Death.png',
      }),
  },
  {
    id: 'wizard', // 마법사 — 임시로 쓰던 중장 도적을 대체한다
    load: () =>
      loadFromStrips(`${RAW}/Wizard Pack`, 231, {
        idle: 'Idle.png',
        run: 'Run.png',
        attack1: 'Attack1.png',
        attack2: 'Attack2.png',
        hurt: 'Hit.png',
        death: 'Death.png',
      }),
  },
  // --- 몬스터 --------------------------------------------------------------
  // 20종이 직업 시트 3개를 돌려쓰던 걸 여기서 갈라 낸다.
  {
    id: 'slime',
    load: () =>
      loadFromStrips(`${RAW}/Monsters Creatures Fantasy 2/Slime`, 156, {
        idle: 'idle.png',
        run: 'walk.png',
        attack1: 'attack.png',
        hurt: 'hurt.png',
        death: 'death.png',
      }),
  },
  {
    id: 'bat',
    load: () =>
      loadFromStrips(`${RAW}/Monsters Creatures Fantasy 2/Bat`, 87, {
        idle: 'fly.png',
        run: 'fly.png',
        attack1: 'attack.png',
        hurt: 'hurt.png',
        death: 'death.png',
      }),
  },
  {
    id: 'rat',
    load: () =>
      loadFromStrips(`${RAW}/Monsters Creatures Fantasy 2/Rat`, 70, {
        idle: 'idle.png',
        run: 'run.png',
        attack1: 'attack_bite.png',
        hurt: 'hurt.png',
        death: 'rat-death.png',
      }),
  },
  {
    id: 'mimic',
    load: () =>
      loadFromStrips(`${RAW}/Monsters Creatures Fantasy 2/Mimic`, 146, {
        idle: 'idle_transformed.png',
        run: 'walk.png',
        attack1: 'attack_1.png',
        attack2: 'attack_2.png',
        hurt: 'hurt.png',
        death: 'death.png',
      }),
  },
  {
    id: 'evil-wizard', // 주술사 계열 몬스터(마녀·주술사·유령·군주)
    load: () =>
      loadFromStrips(`${RAW}/Evil Wizard 3/Sprites`, 140, {
        idle: 'Idle.png',
        run: 'Run.png',
        attack1: 'Attack.png',
        hurt: 'Get hit.png',
        death: 'Death.png',
      }),
  },
  {
    id: 'martial-hero', // 인간형 전투 몬스터(기사·수호자·암살자·광전사)
    load: () =>
      loadFromStrips(`${RAW}/Martial Hero 3/Sprite`, 126, {
        idle: 'Idle.png',
        run: 'Run.png',
        attack1: 'Attack1.png',
        attack2: 'Attack2.png',
        attack3: 'Attack3.png',
        hurt: 'Take Hit.png',
        death: 'Death.png',
      }),
  },
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
  // ⚠ Bandits 팩(경장·중장)은 **더 이상 굽지 않는다** — 궁수·마법사에 임시로
  //   붙여 뒀던 자리를 huntress·wizard가 가져갔다(2026-08-04). 되살리려면 git
  //   기록에서 이 항목과 `sprites.ts`의 `banditClips()`를 함께 꺼내야 한다.

  // --- Gothicvania 계열 (ansimuz) -------------------------------------------
  // 배경과 같은 팩에서 나온 몬스터들. **직업 시트를 빌려 쓰던 세 자리**
  // (오우거·센트리·골렘)를 여기서 메운다.
  // ⚠ 이 팩들은 hurt·death 클립이 없다. `sprites.ts`의 폴백 사슬이
  //   attack1 → idle로 대신하므로 동작은 하고, 피격·사망 때 대기 자세가 나온다.
  {
    id: 'ogre',
    load: () =>
      loadFromFolders(`${RAW}/Legacy Collection/Assets/Gothicvania/Characters/Ogre/Sprites`, {
        idle: 'Idle',
        run: 'walk',
        attack1: 'Attack',
      }),
  },
  {
    // 센트리 — 떠 있는 눈. 애니메이션이 하나뿐이라 세 클립이 같은 프레임을 쓴다.
    id: 'flying-eye',
    load: () =>
      loadFromFolders(
        `${RAW}/Legacy Collection/Assets/Gothicvania/Characters/flying-eye-demon`,
        { idle: 'Sprites', run: 'Sprites', attack1: 'Sprites' },
      ),
  },
  {
    // 골렘 — 성당의 석상 천사. 돌로 된 거구라 골렘 자리에 그대로 맞는다.
    id: 'angel',
    load: () =>
      loadFromFolders(`${RAW}/gothicvania church files/Assets/SPRITES/angel`, {
        idle: 'idle/sprites',
        attack1: 'attack/sprites',
      }),
  },
  // --- 보스 3종 (Gothicvania) -----------------------------------------------
  // tier4 셋이 일반 몬스터와 같은 시트를 돌려 쓰고 있었다. 보스는 첫인상이 전부라
  // 여기서 갈라 낸다. 셋 다 Legacy Collection 안에 있던 것들이다.
  {
    id: 'terrible-knight', // 수호기사 — 이 팩엔 드물게 Hurt까지 있다
    load: () =>
      loadFromFolders(
        `${RAW}/Legacy Collection/Assets/Gothicvania/Characters/Terrible Knight/Sprites`,
        {
          idle: 'Idle',
          run: 'Run',
          attack1: 'SwordSlash',
          attack2: 'AirSwordSlash',
          attack3: 'CrouchSwordSlash',
          block: 'Crouch',
          hurt: 'Hurt',
        },
      ),
  },
  {
    id: 'demon', // 화염군주 — 브레스 동작이 따로 있다
    load: () =>
      loadFromFolders(`${RAW}/Legacy Collection/Assets/Gothicvania/Characters/demon-Files/Sprites`, {
        idle: 'Idle',
        run: 'Idle', // 걷는 동작이 없다
        attack1: 'DemonAttack',
        attack2: 'DemonAttackBreath',
      }),
  },
  {
    id: 'dragon', // 오버로드 — 최종 보스. 꼬리치기 + 브레스
    load: () =>
      loadFromFolders(
        `${RAW}/Legacy Collection/Assets/Gothicvania/Characters/Grotto-escape-2-boss-dragon/sprites`,
        { idle: 'idle', run: 'idle', attack1: 'tail', attack2: 'breath' },
      ),
  },
  {
    /**
     * 골렘 — 마지막까지 직업 시트를 빌려 쓰던 자리(Mecha-stone Golem, Kronovi).
     * 낱장이 아니라 **1000×1000 격자 시트 한 장**이고 프레임은 100×100, 10열이다.
     * 행별 구성(직접 세어 확인):
     *   0행 대기 4 · 1행 발광 8 · 2행 원거리 9 · 3행 웅크리기 8
     *   4행 근접 7 · 5행 레이저 준비 7 · 6행 강화 10 · 7~8행 파괴 14
     * ⚠ **걷는 동작이 없다** — `run`을 대기로 돌려 쓴다(원본에 없어서지 실수가 아님).
     */
    id: 'golem',
    load: () =>
      loadFromGrid(`${RAW}/Mecha-stone Golem 0.1/PNG sheet/Character_sheet.png`, 100, 100, {
        idle: [0, 4],
        run: [0, 4],
        attack1: [40, 7], // 근접 — 팔을 휘두른다
        attack2: [20, 9], // 원거리 — 팔이 쭉 뻗는다
        attack3: [50, 7], // 레이저 준비
        block: [30, 8], // 몸을 말아 바위가 된다
        death: [70, 14],
      }),
  },
  {
    // 주술사 — 시전 동작(Fire)이 따로 있는 몇 안 되는 팩. `evil-wizard` 한 시트를
    // 네 몬스터가 돌려 쓰던 걸 여기서 하나 갈라 낸다.
    id: 'church-wizard',
    load: () =>
      loadFromFolders(`${RAW}/gothicvania church files/Assets/SPRITES/wizard`, {
        idle: 'Idle/sprites',
        attack1: 'Fire/sprites',
      }),
  },
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

  clips = padToCommonCanvas(clips)

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
