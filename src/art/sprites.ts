// ---------------------------------------------------------------------------
// 픽셀 스프라이트 시트 — 절차 SVG(`art.ts`)를 대체하는 실제 프레임 애니메이션.
//
// 파일 배치: `public/sprites/<sheetId>/<clip>.png`. 각 PNG는 프레임을 **가로로
// 이어 붙인 스트립** 한 장이다(`idle.png` = 8프레임이면 폭 = frameW × 8).
//
// 재생은 JS가 아니라 CSS `steps()` 애니메이션이 맡는다. 이유가 있다:
//   ① 프레임마다 리렌더가 없다(무료).
//   ② `battlefx.css`의 히트스톱(`animation-play-state: paused`)이 **스프라이트
//      프레임까지 그대로 얼린다** — 칼을 휘두르던 그 프레임에서 멈춘다.
// ---------------------------------------------------------------------------

export type ClipName =
  | 'idle'
  | 'run'
  | 'attack1'
  | 'attack2'
  | 'attack3'
  | 'block'
  | 'hurt'
  | 'death'

export interface ClipDef {
  frames: number
  /** 한 프레임이 화면에 머무는 시간(ms). */
  frameMs: number
  loop: boolean
  /**
   * 이 공격이 상대에게 **닿는 프레임**(0-based). 연출 타이밍의 기준점이다 —
   * `BattleScreen`이 `impactDelayOf`로 "몇 ms 뒤에 피해를 터뜨릴지"를 여기서 뽑는다.
   * 시간(ms)을 눈대중으로 맞추던 `IMPACT_MS`를 대체한다.
   */
  impactFrame?: number
}

export interface SheetDef {
  /** `public/sprites/<id>/` 폴더 이름. */
  id: string
  frameW: number
  frameH: number
  /** 화면 배율. 픽셀 아트라 **정수만** 쓴다(소수면 픽셀이 뭉갠다). */
  scale: number
  /**
   * 프레임 안에서 발이 닿는 y(픽셀). 시트마다 캐릭터가 프레임 안 다른 높이에
   * 그려져 있어, 이 값을 맞춰야 여러 시트가 같은 바닥선에 선다.
   */
  footY: number
  /**
   * 프레임 안에서 **몸통의 가로 중심** x(픽셀). 프레임 한가운데가 아니다 —
   * 프레임 폭은 공격 검기까지 담느라 한쪽으로 늘어나 있기 때문. 이 값을 기준으로
   * 캐릭터를 셀에 세우고, 피해 숫자·보호막·그림자도 여기에 맞춘다.
   * `scripts/packsprites.mjs`가 대기 자세에서 측정해 출력한다.
   */
  anchorX: number
  /**
   * 원본 시트가 **오른쪽을 보고 그려져 있는가.** 기본값 `true` — 지금까지 받은
   * 팩(Sven Thole·LuizMelo·Monsters Creatures)은 전부 오른쪽을 본다.
   *
   * ⚠ **눈대중으로 정하지 말 것. 무기가 향한 쪽이 앞이 아니다.**
   * 전사(hero-knight)를 여기서 한 번 틀렸다 — 검이 왼쪽으로 뻗어 있어 "왼쪽을
   * 본다"고 넣었는데, 실제로는 **방패가 앞**이고 검은 뒤로 당긴 가드 자세다.
   * 확실한 판정법은 **공격 프레임을 보는 것** — 타격 이펙트(검기)가 나가는 쪽이
   * 곧 앞이다. `assets-raw`의 Attack 프레임을 확대해 보면 바로 갈린다.
   *
   * 게임은 "앞 = 오른쪽"이라 왼쪽 파이터가 오른쪽을 봐야 하고, 그 판정은 이
   * 값과 좌우 진영을 함께 봐야 나온다 — `placeSprite` 참고.
   */
  facesRight?: boolean
  /**
   * 팩마다 들어 있는 동작이 다르다(가드·3연격이 없는 팩이 흔하다). 없는 클립은
   * `clipOrFallback`이 대기 동작으로 떨어뜨리므로 **비워 두면 된다** — 억지로
   * 다른 동작을 채워 넣으면 엉뚱한 모션이 나온다.
   */
  clips: Partial<Record<ClipName, ClipDef>>
}

/** 플레이스홀더/기본 클립 구성 — Hero Knight 계열의 프레임 수에 맞춰 두었다. */
const STD_CLIPS: Record<ClipName, ClipDef> = {
  idle: { frames: 8, frameMs: 110, loop: true },
  run: { frames: 10, frameMs: 70, loop: true },
  // 임팩트 프레임: 팔이 가장 뻗는 지점. 프레임 수가 바뀌면 같이 조정한다.
  attack1: { frames: 6, frameMs: 60, loop: false, impactFrame: 3 },
  attack2: { frames: 6, frameMs: 60, loop: false, impactFrame: 3 },
  attack3: { frames: 8, frameMs: 60, loop: false, impactFrame: 4 },
  block: { frames: 5, frameMs: 70, loop: false },
  hurt: { frames: 3, frameMs: 90, loop: false },
  death: { frames: 10, frameMs: 95, loop: false },
}

/**
 * Bandits 팩(경장·중장 공용)의 클립 구성. `atkMs`로 공격 속도만 갈라 무게를 준다.
 * 이 팩은 공격 동작이 하나뿐이라 attack1/2/3이 같은 8프레임을 쓰고, 칼날 궤적이
 * 처음 그려지는 **4번 프레임**이 임팩트다(구운 `attack1.png`에서 확인).
 * `block`은 잠깐 취하는 자세가 아니라 보호막이 살아 있는 동안 계속 서 있는
 * 전투 대기 자세라 유일하게 반복 재생한다.
 */
const banditClips = (atkMs: number): Record<ClipName, ClipDef> => {
  const attack: ClipDef = { frames: 8, frameMs: atkMs, loop: false, impactFrame: 4 }
  return {
    idle: { frames: 4, frameMs: 150, loop: true },
    run: { frames: 8, frameMs: 70, loop: true },
    attack1: attack,
    attack2: attack,
    attack3: attack,
    block: { frames: 4, frameMs: 150, loop: true },
    hurt: { frames: 2, frameMs: 90, loop: false },
    // 일어나는 Recover를 거꾸로 돌려 만든 쓰러지는 동작(패커 참고)
    death: { frames: 8, frameMs: 95, loop: false },
  }
}

/** 플레이스홀더 기본값 — 진짜 에셋이 들어오면 측정값으로 덮어쓴다. */
const sheet = (id: string, over: Partial<SheetDef> = {}): SheetDef => ({
  id,
  frameW: 48,
  frameH: 48,
  scale: 3,
  footY: 45,
  anchorX: 24,
  facesRight: true, // 받은 팩이 전부 오른쪽을 본다 — 왼쪽 팩이 오면 그때만 false
  clips: STD_CLIPS,
  ...over,
})

/**
 * 캐릭터 id → 스프라이트 시트. **여기 없는 캐릭터는 기존 SVG 아트로 그려진다**
 * — 팩이 하나씩 들어오는 동안에도 게임이 깨지지 않게 한 폴백이다.
 *
 * 수치(frameW/frameH/footY/anchorX)는 눈대중이 아니라 `npm run sprites`가
 * 실제 픽셀에서 측정해 출력한 값이다. 에셋을 갈아끼우면 다시 돌려서 옮긴다.
 */
export const SHEETS: Record<string, SheetDef> = {
  // --- 플레이어 직업 --------------------------------------------------------
  // Hero Knight (Sven Thole)
  warrior: sheet('hero-knight', {
    frameW: 90, frameH: 50, footY: 50, anchorX: 29, scale: 3, facesRight: true,
    clips: {
      ...STD_CLIPS,
      // 원본 프레임을 눈으로 확인한 값 — 검이 가장 뻗는 프레임에서 피해가 터진다
      attack1: { frames: 6, frameMs: 62, loop: false, impactFrame: 2 },
      attack2: { frames: 6, frameMs: 62, loop: false, impactFrame: 2 },
      attack3: { frames: 8, frameMs: 58, loop: false, impactFrame: 3 },
      death: { frames: 10, frameMs: 95, loop: false },
    },
  }),
  // Huntress (LuizMelo) — 창을 든 사냥꾼. 궁수의 "거리를 지킨다"와 맞는다.
  archer: sheet('huntress', {
    frameW: 91, frameH: 66, footY: 66, anchorX: 42, scale: 2, facesRight: true,
    clips: {
      idle: { frames: 8, frameMs: 120, loop: true },
      run: { frames: 8, frameMs: 75, loop: true },
      attack1: { frames: 5, frameMs: 70, loop: false, impactFrame: 2 },
      attack2: { frames: 5, frameMs: 70, loop: false, impactFrame: 2 },
      attack3: { frames: 7, frameMs: 65, loop: false, impactFrame: 3 },
      hurt: { frames: 3, frameMs: 90, loop: false },
      death: { frames: 8, frameMs: 100, loop: false },
    },
  }),
  // Wizard Pack (LuizMelo) — 원본이 고해상도라 scale 1로 둔다(정수 배율 규칙).
  mage: sheet('wizard', {
    frameW: 186, frameH: 136, footY: 136, anchorX: 66, scale: 1, facesRight: true,
    clips: {
      idle: { frames: 6, frameMs: 130, loop: true },
      run: { frames: 8, frameMs: 80, loop: true },
      attack1: { frames: 8, frameMs: 70, loop: false, impactFrame: 4 },
      attack2: { frames: 8, frameMs: 70, loop: false, impactFrame: 4 },
      hurt: { frames: 4, frameMs: 90, loop: false },
      death: { frames: 7, frameMs: 110, loop: false },
    },
  }),

  // --- 몬스터 --------------------------------------------------------------
  // 20종이 직업 시트를 돌려쓰던 걸 갈라 낸다. `MonsterDef.spriteId`로 고른다.
  slime: sheet('slime', {
    frameW: 111, frameH: 35, footY: 35, anchorX: 34, scale: 3, facesRight: true,
    clips: {
      idle: { frames: 14, frameMs: 110, loop: true },
      run: { frames: 6, frameMs: 110, loop: true },
      attack1: { frames: 19, frameMs: 55, loop: false, impactFrame: 9 },
      hurt: { frames: 3, frameMs: 90, loop: false },
      death: { frames: 11, frameMs: 95, loop: false },
    },
  }),
  bat: sheet('bat', {
    frameW: 72, frameH: 55, footY: 44, anchorX: 34, scale: 2, facesRight: true,
    clips: {
      idle: { frames: 11, frameMs: 70, loop: true },
      run: { frames: 11, frameMs: 60, loop: true },
      attack1: { frames: 11, frameMs: 55, loop: false, impactFrame: 5 },
      hurt: { frames: 3, frameMs: 90, loop: false },
      death: { frames: 4, frameMs: 110, loop: false },
    },
  }),
  rat: sheet('rat', {
    frameW: 59, frameH: 22, footY: 22, anchorX: 32, scale: 3, facesRight: true,
    clips: {
      idle: { frames: 10, frameMs: 110, loop: true },
      run: { frames: 8, frameMs: 65, loop: true },
      attack1: { frames: 12, frameMs: 55, loop: false, impactFrame: 6 },
      hurt: { frames: 3, frameMs: 90, loop: false },
      death: { frames: 6, frameMs: 100, loop: false },
    },
  }),
  mimic: sheet('mimic', {
    frameW: 113, frameH: 44, footY: 44, anchorX: 43, scale: 3, facesRight: true,
    clips: {
      idle: { frames: 9, frameMs: 120, loop: true },
      run: { frames: 6, frameMs: 100, loop: true },
      attack1: { frames: 14, frameMs: 55, loop: false, impactFrame: 7 },
      attack2: { frames: 13, frameMs: 55, loop: false, impactFrame: 6 },
      hurt: { frames: 3, frameMs: 90, loop: false },
      death: { frames: 6, frameMs: 110, loop: false },
    },
  }),
  'evil-wizard': sheet('evil-wizard', {
    frameW: 88, frameH: 66, footY: 66, anchorX: 25, scale: 2, facesRight: true,
    clips: {
      idle: { frames: 10, frameMs: 120, loop: true },
      run: { frames: 8, frameMs: 80, loop: true },
      attack1: { frames: 13, frameMs: 60, loop: false, impactFrame: 6 },
      hurt: { frames: 3, frameMs: 90, loop: false },
      death: { frames: 18, frameMs: 80, loop: false },
    },
  }),
  'martial-hero': sheet('martial-hero', {
    frameW: 125, frameH: 80, footY: 80, anchorX: 68, scale: 2, facesRight: true,
    clips: {
      idle: { frames: 10, frameMs: 120, loop: true },
      run: { frames: 8, frameMs: 75, loop: true },
      attack1: { frames: 7, frameMs: 65, loop: false, impactFrame: 3 },
      attack2: { frames: 6, frameMs: 65, loop: false, impactFrame: 3 },
      attack3: { frames: 9, frameMs: 60, loop: false, impactFrame: 4 },
      hurt: { frames: 3, frameMs: 90, loop: false },
      death: { frames: 11, frameMs: 95, loop: false },
    },
  }),
}

export const sheetFor = (spriteId: string): SheetDef | undefined => SHEETS[spriteId]

/**
 * 이 시트에서 실제로 재생할 클립. 없는 동작은 단계적으로 떨어진다:
 *   attack2/3 → attack1 → idle,  block/hurt/death/run → idle.
 * 대기 동작은 어느 팩에나 있으므로 여기서 반드시 멈춘다.
 */
export function clipOrFallback(sheet: SheetDef, want: ClipName): [ClipName, ClipDef] {
  const chain: ClipName[] =
    want === 'attack3' || want === 'attack2'
      ? [want, 'attack1', 'idle']
      : [want, 'idle']
  for (const c of chain) {
    const def = sheet.clips[c]
    if (def) return [c, def]
  }
  // idle조차 없는 시트는 만들 수 없다(패커가 항상 굽는다) — 방어적 기본값.
  return ['idle', { frames: 1, frameMs: 200, loop: true }]
}

/**
 * 시트를 셀 위에 세우는 데 필요한 값 셋. 좌우 반전이 **기준점까지 옮기기 때문에**
 * 뒤집기와 기준점을 한곳에서 같이 계산한다 — 따로 두면 한쪽만 고쳐져서 뒤집힌
 * 파이터만 셀에서 옆으로 밀린다(hero-knight 기준 96px).
 */
export function placeSprite(sheet: SheetDef, side: 'left' | 'right') {
  // 화면에 그려지는 방향은 **두 번의 뒤집기가 곱해진 결과**다:
  //   ① 진영(`--flip`) — 왼쪽 파이터는 그대로, 오른쪽 파이터는 반전(CSS가 건다)
  //   ② 시트 원본 방향(`--artflip`) — 왼쪽을 보고 그려진 시트는 한 번 더 반전
  // 둘을 합쳐야 "정말 좌우가 뒤집혀 보이는가"가 나오고, 기준점 보정은 그 결과를 본다.
  const artFlip = sheet.facesRight ? 1 : -1
  const sideFlip = side === 'left' ? 1 : -1
  const mirrored = artFlip * sideFlip === -1
  return {
    artFlip,
    /**
     * 뒤집으면 몸통 기준점이 프레임 반대편으로 간다. 프레임 폭은 공격 검기를
     * 담느라 한쪽으로만 늘어나 있어 좌우 대칭이 아니라서, 그냥 `anchorX`를
     * 쓰면 어긋난 만큼 캐릭터가 옆으로 밀린다(hero-knight 기준 96px).
     */
    anchorPx: (mirrored ? sheet.frameW - sheet.anchorX : sheet.anchorX) * sheet.scale,
    footPx: sheet.footY * sheet.scale,
  }
}

/** 카드의 fx 종류 → 공격 클립. 근접·돌진·원거리가 서로 다른 동작을 쓰도록. */
const FX_CLIP: Record<string, ClipName> = {
  slash: 'attack1',
  punch: 'attack2',
  rush: 'attack3',
  quake: 'attack3',
  bolt: 'attack2',
  orb: 'attack2',
  flame: 'attack2',
  shield: 'block',
}
export const attackClipFor = (fx?: string): ClipName => FX_CLIP[fx ?? 'punch'] ?? 'attack2'

/** 공격이 상대에게 닿기까지의 시간(ms) — 클립의 impactFrame에서 직접 나온다. */
export function impactDelayOf(sheet: SheetDef | undefined, fx: string | undefined): number | null {
  if (!sheet) return null
  const [, clip] = clipOrFallback(sheet, attackClipFor(fx))
  if (clip.impactFrame === undefined) return null
  return clip.impactFrame * clip.frameMs
}

export const clipUrl = (sheet: SheetDef, clip: ClipName) => `/sprites/${sheet.id}/${clip}.png`

/**
 * 시트의 모든 클립을 미리 받아 둔다. 안 하면 첫 공격에서 PNG를 받는 동안
 * 한 프레임이 비어 깜빡인다. 실패해도 게임은 진행돼야 하므로 항상 resolve한다.
 */
export function preloadSheet(sheet: SheetDef): Promise<void> {
  const names = Object.keys(sheet.clips) as ClipName[]
  return Promise.all(
    names.map(
      (c) =>
        new Promise<void>((done) => {
          const img = new Image()
          img.onload = () => done()
          img.onerror = () => done()
          img.src = clipUrl(sheet, c)
        }),
    ),
  ).then(() => undefined)
}
