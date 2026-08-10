// ---------------------------------------------------------------------------
// 어드민(밸런스 튜닝 콘솔) — **개발 빌드 전용**. 몬스터 20종과 카드 전량을 화면에서
// 보고 고친다.
//
// **소스가 여전히 진실의 원천이다.** 여기서 고친 값은 ① 지금 돌고 있는 세션의
// 라이브 객체에 바로 반영되고(그래서 고친 뒤 곧장 전투로 확인할 수 있다) ②
// localStorage에 초안으로 남을 뿐이며, **영구 반영은 `exportText()`가 뽑아 주는 TS
// 조각을 소스에 붙여 넣어야** 이뤄진다. 이 구조를 고른 이유는 셋이다:
//
//   ① **멀티 락스텝**. 두 피어는 각자 `resolveTurn`을 돌려 같은 결과를 낸다는 전제로
//      붙는데, `RULES_VERSION`은 *코드* 버전만 본다 — 내 브라우저에만 있는 수정값은
//      걸러 내지 못한다. 어긋나면 크래시가 아니라 조용한 desync라 재현이 안 된다.
//      소스를 고쳐 커밋해야 `RULES_VERSION`을 같이 올리는 규율이 성립한다.
//   ② **밸런스 시뮬**. `npm run sim:run`은 node에서 소스를 직접 읽는다. 브라우저에만
//      있는 값은 시뮬이 못 보므로, 화면 밸런스와 측정 밸런스가 조용히 갈린다.
//   ③ **`npm run check`** 의 불변식(보스 카드 격리·보상 보장 등)도 소스를 검사한다.
//
// ⚠ **라이브 객체를 제자리에서 고친다**(`Object.assign`). `MONSTERS`·`COMMON_CARDS`·
// `ROSTER[].cards` 등은 모두 같은 객체를 참조하므로 이 방식이 소비처를 한 곳도
// 건드리지 않고 전 화면에 즉시 반영된다. 대신 **이미 진행 중인 런의 손패**에는
// `upgrades.ts`가 만든 사본이 섞여 있어 그 사본은 갱신되지 않는다 — 확실히 보려면
// 런을 새로 시작한다.
// ---------------------------------------------------------------------------
import { COMMON_CARDS } from '../battle/cards'
import { ROSTER } from '../data/roster'
import { RUN_CARDS } from './runcards'
import { BOSS_CARDS } from './bosscards'
import { MONSTERS } from './monsters'
import type { CardDef } from '../battle/types'
import type { MonsterDef } from './monsters'

export type EntityKind = 'monster' | 'card'

/** 카드가 어느 묶음에서 왔는가 — 목록 필터와 "어느 파일을 고쳐야 하나"의 근거. */
export type CardGroup = 'common' | 'basics' | 'class' | 'run' | 'boss'

export const CARD_GROUP_LABEL: Record<CardGroup, string> = {
  common: '공용',
  basics: '직업 기본기',
  class: '직업 전용',
  run: '런 전용',
  boss: '보스 전용',
}

export interface CardEntry {
  /** 게임이 실제로 쓰는 객체. 여기를 고치면 즉시 반영된다. */
  card: CardDef
  group: CardGroup
  /** 누구 카드인가(캐릭터 이름 또는 묶음 이름). */
  owner: string
  /** 소스 파일 — 내보내기 조각을 이 단위로 묶는다. */
  file: string
  /**
   * PvP(단판·온라인)에서 실제로 쓰이는 카드인가. **`RULES_VERSION` 경고의 기준**이다
   * — 런 전용·보스 전용 카드는 멀티 카드 풀에 없으므로 버전을 올리지 않는다.
   */
  pvp: boolean
}

const charEntries = (): CardEntry[] =>
  ROSTER.flatMap((ch) => [
    ...ch.basics.map((card) => ({
      card,
      group: 'basics' as CardGroup,
      owner: ch.name,
      file: 'src/data/roster.ts',
      pvp: true,
    })),
    ...ch.cards.map((card) => ({
      card,
      group: 'class' as CardGroup,
      owner: ch.name,
      file: 'src/data/roster.ts',
      pvp: true,
    })),
  ])

export const CARD_ENTRIES: CardEntry[] = [
  ...COMMON_CARDS.map((card) => ({
    card,
    group: 'common' as CardGroup,
    owner: '공용',
    file: 'src/battle/cards.ts',
    pvp: true,
  })),
  ...charEntries(),
  ...RUN_CARDS.map((card) => ({
    card,
    group: 'run' as CardGroup,
    owner: '런 보상·상점',
    file: 'src/game/runcards.ts',
    pvp: false,
  })),
  ...BOSS_CARDS.map((card) => ({
    card,
    group: 'boss' as CardGroup,
    owner: '보스',
    file: 'src/game/bosscards.ts',
    pvp: false,
  })),
]

export const CARD_ENTRY_BY_ID: Record<string, CardEntry> = Object.fromEntries(
  CARD_ENTRIES.map((e) => [e.card.id, e]),
)

const MONSTER_FILE = 'src/game/monsters.ts'

// --- 원본 스냅샷 --------------------------------------------------------------
// 모듈이 처음 로드될 때(= 초안을 적용하기 **전에**) 한 번 뜬다. 이후 모든 diff·초기화의
// 기준이 되므로, 초안 적용보다 반드시 먼저 실행돼야 한다.
type Bag = Record<string, unknown>

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const cardBase = new Map<string, CardDef>(
  CARD_ENTRIES.map((e) => [e.card.id, clone(e.card)]),
)
const monsterBase = new Map<string, MonsterDef>(MONSTERS.map((m) => [m.id, clone(m)]))

const liveCard = (id: string): CardDef | undefined => CARD_ENTRY_BY_ID[id]?.card
const liveMonster = (id: string): MonsterDef | undefined => MONSTERS.find((m) => m.id === id)

const live = (kind: EntityKind, id: string): Bag | undefined =>
  (kind === 'card' ? liveCard(id) : liveMonster(id)) as Bag | undefined
const base = (kind: EntityKind, id: string): Bag | undefined =>
  (kind === 'card' ? cardBase.get(id) : monsterBase.get(id)) as Bag | undefined

// --- 비교 --------------------------------------------------------------------
/** 키 순서에 흔들리지 않는 정규화 문자열. 훅을 추가하면 순서가 달라지므로 필요하다. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val as Bag)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : val,
  )
}

const same = (a: unknown, b: unknown): boolean => canon(a) === canon(b)

export interface FieldDiff {
  field: string
  from: unknown
  to: unknown
}

export interface EntityDiff {
  kind: EntityKind
  id: string
  /** 화면에 뜨는 이름(현재 값 기준). */
  label: string
  file: string
  fields: FieldDiff[]
}

function diffOne(kind: EntityKind, id: string): FieldDiff[] {
  const now = live(kind, id)
  const was = base(kind, id)
  if (!now || !was) return []
  const keys = [...new Set([...Object.keys(was), ...Object.keys(now)])].sort()
  const out: FieldDiff[] = []
  for (const k of keys) {
    if (!same(was[k], now[k])) out.push({ field: k, from: was[k], to: now[k] })
  }
  return out
}

/** 지금까지 고친 것 전부. 목록 순서는 몬스터 → 카드(등록 순). */
export function diffAll(): EntityDiff[] {
  const out: EntityDiff[] = []
  for (const m of MONSTERS) {
    const fields = diffOne('monster', m.id)
    if (fields.length) out.push({ kind: 'monster', id: m.id, label: m.name, file: MONSTER_FILE, fields })
  }
  for (const e of CARD_ENTRIES) {
    const fields = diffOne('card', e.card.id)
    if (fields.length)
      out.push({ kind: 'card', id: e.card.id, label: e.card.name, file: e.file, fields })
  }
  return out
}

export const dirtyCount = (): number => diffAll().length

export function isDirty(kind: EntityKind, id: string): boolean {
  return diffOne(kind, id).length > 0
}

// --- 편집 --------------------------------------------------------------------
/**
 * 필드 하나를 고친다. `value`가 `undefined`면 **필드를 지운다** — 엔진이 대부분의
 * 능력 필드를 `if (card.poison)`처럼 보므로 "0"과 "없음"이 사실상 같지만, 소스에
 * 0을 남겨 두면 다음 사람이 "일부러 0으로 둔 것"으로 읽는다. 지우는 쪽이 정확하다.
 */
export function setField(kind: EntityKind, id: string, field: string, value: unknown): void {
  const obj = live(kind, id)
  if (!obj) return
  if (value === undefined) delete obj[field]
  else obj[field] = value
  saveDraft()
}

/** 한 항목을 원본으로 되돌린다. 객체 정체성은 유지한다(참조가 곳곳에 퍼져 있다). */
export function resetEntity(kind: EntityKind, id: string): void {
  const obj = live(kind, id)
  const src = base(kind, id)
  if (!obj || !src) return
  for (const k of Object.keys(obj)) if (!(k in src)) delete obj[k]
  Object.assign(obj, clone(src))
  saveDraft()
}

export function resetAll(): void {
  for (const m of MONSTERS) resetEntity('monster', m.id)
  for (const e of CARD_ENTRIES) resetEntity('card', e.card.id)
  saveDraft()
}

// --- 초안 저장(개발 편의) -------------------------------------------------------
// 새로고침·HMR로 튜닝하던 값이 날아가면 쓸 수가 없어서 남긴다. **영구 반영이 아니다** —
// 개발 빌드에만 존재하고, 화면 곳곳의 배지가 "미저장 N개"를 계속 알린다.
const DRAFT_KEY = 'gb-admin-draft'

interface Draft {
  monster: Record<string, Bag>
  card: Record<string, Bag>
}

function saveDraft(): void {
  const draft: Draft = { monster: {}, card: {} }
  for (const d of diffAll()) {
    const bag: Bag = {}
    // `to`가 undefined인 필드(= 지운 필드)는 JSON이 통째로 날려 버리므로 null로 표시해
    // 둔다. 복원할 때 다시 undefined로 되돌린다.
    for (const f of d.fields) bag[f.field] = f.to === undefined ? null : f.to
    draft[d.kind][d.id] = bag
  }
  try {
    if (!Object.keys(draft.monster).length && !Object.keys(draft.card).length)
      localStorage.removeItem(DRAFT_KEY)
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // 저장 실패(용량·프라이빗 모드)로 편집을 막지 않는다 — 라이브 반영은 이미 끝났다.
  }
}

/** 저장된 초안을 라이브 객체에 다시 얹는다. 스냅샷을 뜬 **뒤에만** 불러야 한다. */
function loadDraft(): void {
  let draft: Draft | null = null
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    draft = raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    draft = null
  }
  if (!draft) return
  for (const kind of ['monster', 'card'] as const) {
    for (const [id, bag] of Object.entries(draft[kind] ?? {})) {
      const obj = live(kind, id)
      if (!obj) continue // 그 사이 삭제된 id — 조용히 흘린다
      for (const [k, v] of Object.entries(bag)) {
        if (v === null) delete obj[k]
        else obj[k] = v
      }
    }
  }
}

loadDraft()

// --- 내보내기 -----------------------------------------------------------------
/** TS 리터럴로. Offset[]은 한 줄에 붙여 소스의 기존 모양과 같게 쓴다. */
function lit(v: unknown): string {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return `[${v.map(lit).join(', ')}]`
  if (typeof v === 'object') {
    const body = Object.entries(v as Bag)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => `${k}: ${lit(x)}`)
      .join(', ')
    return body ? `{ ${body} }` : '{}'
  }
  return String(v)
}

/** 요약 한 줄용 짧은 표기 — 긴 배열은 접는다. */
function brief(v: unknown): string {
  if (v === undefined) return '없음'
  const s = lit(v)
  return s.length > 44 ? `${s.slice(0, 41)}…` : s
}

/**
 * 소스에 붙여 넣을 TS 조각. 파일별로 묶고, 항목마다 **무엇이 어떻게 바뀌었는지는
 * 주석 한 줄**에 몰아 둔다 — 아래 필드 줄은 그대로 복사해 기존 줄을 갈아 끼우면 된다.
 */
export function exportText(): string {
  const diffs = diffAll()
  if (!diffs.length) return '// 바뀐 항목이 없습니다.'

  const touchedPvpCards = diffs.some(
    (d) => d.kind === 'card' && CARD_ENTRY_BY_ID[d.id]?.pvp,
  )

  const head: string[] = [
    '// ===========================================================================',
    `// GridBrawl 어드민 내보내기 — ${diffs.length}개 항목`,
    '//',
    '// 아래 필드 줄을 해당 파일의 기존 줄과 갈아 끼우세요. 붙여 넣기 전에는 소스가',
    '// 바뀌지 않았으므로 시뮬·검사·멀티는 모두 옛 수치로 돕니다.',
    '//',
    '// 붙여 넣은 뒤 할 일:',
    '//   npm run typecheck && npm run check',
    '//   npm run sim:run 900 -- --sweep --seed=12345   ← 밸런스 밴드 재측정',
  ]
  if (touchedPvpCards) {
    head.push(
      '//',
      '// ⚠ PvP에서 쓰이는 카드(공용·직업 기본기·직업 전용)를 고쳤습니다.',
      "//   battle/types.ts 의 RULES_VERSION 을 **같은 커밋에서** 올리세요 —",
      '//   안 올리면 구버전 앱과 붙었을 때 조용한 desync가 납니다.',
      '//   PvP 매치업 승률은 npm run sim 으로 따로 봅니다.',
    )
  }
  head.push('// ===========================================================================', '')

  const out = [...head]
  const files = [...new Set(diffs.map((d) => d.file))]
  for (const file of files) {
    out.push(`// ─────────────────────────────────────────────────────────────`)
    out.push(`// ${file}`)
    out.push(`// ─────────────────────────────────────────────────────────────`)
    for (const d of diffs.filter((x) => x.file === file)) {
      const summary = d.fields
        .map((f) => `${f.field} ${brief(f.from)} → ${brief(f.to)}`)
        .join(' · ')
      out.push(`// ${d.id} · ${d.label}`)
      out.push(`//   ${summary}`)
      for (const f of d.fields) {
        if (f.to === undefined) out.push(`  // (삭제) ${f.field}: ${lit(f.from)},`)
        else out.push(`  ${f.field}: ${lit(f.to)},`)
      }
      out.push('')
    }
  }
  return out.join('\n')
}
