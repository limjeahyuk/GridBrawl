// ---------------------------------------------------------------------------
// 어드민(밸런스 튜닝 콘솔) — **개발 빌드 전용 화면**. 몬스터 20종과 카드 전량을
// **엑셀 같은 스프레드시트**로 한자리에서 보고 인라인으로 고친다. 저장 모델·왜 소스가
// 진실의 원천인지는 `game/admin.ts` 머리말.
//
// ⚠ 배포 번들에 남지 않아야 하므로 **부작용 있는 import를 만들지 않는다** — 스타일도
// CSS 파일이 아니라 문자열(`adminCss.ts`)을 `<style>`로 렌더한다. `App.tsx`가 이
// 화면을 `import.meta.env.DEV` 뒤에서만 참조하므로 배포 빌드에서는 통째로 사라진다.
//
// 데이터 계층(setField/diffAll…)은 `admin.ts` 그대로 쓴다 — 이 파일은 표 렌더링만
// 담당한다. 사거리 격자·몬스터 덱처럼 표에 못 담는 편집은 셀의 버튼으로 모달을 연다.
// ---------------------------------------------------------------------------
import { useMemo, useReducer, useState } from 'react'
import { ROSTER } from '../../data/roster'
import { SHEETS } from '../../art/sprites'
import { MONSTERS, type MonsterDef } from '../../game/monsters'
import {
  CARD_ENTRIES,
  CARD_ENTRY_BY_ID,
  CARD_GROUP_LABEL,
  diffAll,
  exportText,
  isDirty,
  resetAll,
  resetEntity,
  setField,
  type CardGroup,
  type EntityKind,
} from '../../game/admin'
import { CardFace, cardAccent } from '../CardFace'
import type { CardDef, Offset } from '../../battle/types'
import { ADMIN_CSS } from './adminCss'

// --- 선택지 표 ---------------------------------------------------------------
const AI_LEVELS = ['easy', 'normal', 'hard'] as const
const BEHAVIORS = ['balanced', 'rusher', 'kiter', 'turtle', 'skirmisher'] as const
const FX_LIST = ['slash', 'bolt', 'orb', 'quake', 'flame', 'shield', 'rush', 'punch'] as const
const DIR_LIST = [
  'right',
  'left',
  'up',
  'down',
  'up-right',
  'up-left',
  'down-right',
  'down-left',
] as const
const BUFF_LIST = ['atkUp', 'defUp', 'freeCast'] as const

interface Hook {
  key: string
  label: string
  type: 'int' | 'bool'
}

/** 몬스터 인라인 패시브가 쓸 수 있는 훅(= 유물과 같은 엔진 훅). */
const PASSIVE_HOOKS: Hook[] = [
  { key: 'turnEnergy', label: '매 턴 기력 +N', type: 'int' },
  { key: 'turnShield', label: '매 턴 보호막 +N', type: 'int' },
  { key: 'damageReduction', label: '받는 피해 −N', type: 'int' },
  { key: 'lifesteal', label: '흡혈 +N', type: 'int' },
  { key: 'shieldBreak', label: '적중 시 보호막 파괴', type: 'bool' },
  { key: 'revive', label: '1회 부활(체력 N)', type: 'int' },
  { key: 'regen', label: '매 턴 체력 +N', type: 'int' },
  { key: 'attackBonus', label: '공격 피해 +N', type: 'int' },
  { key: 'thorns', label: '반사 N', type: 'int' },
  { key: 'maxHpBonus', label: '최대 체력 ±N', type: 'int' },
  { key: 'lowHpBonusPct', label: '저체력 시 피해 +N%', type: 'int' },
  { key: 'alwaysPierce', label: '상시 관통', type: 'bool' },
  { key: 'stunOnHit', label: '적중 시 기절 N턴', type: 'int' },
  { key: 'stunCap', label: '기절 발동 횟수 상한', type: 'int' },
  { key: 'openingShield', label: '첫 턴 보호막 +N', type: 'int' },
  { key: 'poisonOnHit', label: '적중 시 중독 +N겹', type: 'int' },
  { key: 'burnOnHit', label: '적중 시 화상 +N겹', type: 'int' },
  { key: 'statusPowerPct', label: '지속피해 위력 +N%', type: 'int' },
  { key: 'bonusVsAfflicted', label: '상태이상 상대에게 +N', type: 'int' },
  { key: 'freezeOnHit', label: '적중 시 빙결 N턴', type: 'int' },
  { key: 'freezeCap', label: '빙결 발동 횟수 상한', type: 'int' },
  { key: 'guardPowerPct', label: '수비 카드 흡수 +N%', type: 'int' },
  { key: 'healPowerPct', label: '회복량 +N%', type: 'int' },
  { key: 'startEnergyBonus', label: '시작 기력 +N', type: 'int' },
  { key: 'executeBonusPct', label: '처형(상대 저체력) +N%', type: 'int' },
  { key: 'collapseResist', label: '붕괴 피해 −N', type: 'int' },
]

/** 공격 카드에 붙일 수 있는 특수 능력. 값이 없으면 그 능력이 없는 것이다. */
const CARD_ABILITIES: Hook[] = [
  { key: 'drain', label: '기력 흡수 N', type: 'int' },
  { key: 'leech', label: '흡혈 N', type: 'int' },
  { key: 'pierce', label: '보호막 관통', type: 'bool' },
  { key: 'shatter', label: '보호막 파괴', type: 'bool' },
  { key: 'push', label: '넉백 N칸', type: 'int' },
  { key: 'pull', label: '끌어당김 N칸', type: 'int' },
  { key: 'selfShield', label: '자신 보호막 +N', type: 'int' },
  { key: 'recoil', label: '반동 자해 N', type: 'int' },
  { key: 'stun', label: '기절 N턴', type: 'int' },
  { key: 'poison', label: '중독 N겹', type: 'int' },
  { key: 'burn', label: '화상 N겹', type: 'int' },
  { key: 'freeze', label: '빙결 N턴', type: 'int' },
  { key: 'empower', label: '전투 내내 피해 +N (충전)', type: 'int' },
  { key: 'dashForward', label: '공격 직전 이동 ±N칸', type: 'int' },
]

/** 몬스터 덱에 넣을 수 있는 카드 묶음. `monsters.ts`의 카드 해석기가 보는 범위와 같다. */
const MONSTER_DECK_GROUPS: CardGroup[] = ['common', 'class', 'boss']

type Bag = Record<string, unknown>
type Tab = 'monster' | 'card' | 'export'
type Edit = (kind: EntityKind, id: string, field: string, value: unknown) => void

// --- 스프레드시트 열 정의 ------------------------------------------------------
type ColKind = 'num' | 'text' | 'sel' | 'bool'
interface Col {
  key: string
  /** 헤더에 뜨는 짧은 라벨. */
  label: string
  /** 마우스 오버 툴팁(긴 설명). */
  title?: string
  kind: ColKind
  w?: number
  /** num: 비우면 필드를 지운다. false면 빈 입력을 무시(필수 필드). */
  opt?: boolean
  options?: readonly string[]
  /** sel: 빈 선택지 라벨. 있으면 "지움"이 가능하다. */
  empty?: string
  /** 이 카드/몬스터에 이 열이 해당하는가(카드 종류 게이팅). false면 회색 빈 칸. */
  applies?: (row: Bag) => boolean
  /** 값이 몬스터 `passive` 안에 있으면 'passive'. 기본은 최상위. */
  path?: 'passive'
}

const isKind = (k: string) => (row: Bag) => row.kind === k

const MON_COLS: Col[] = [
  { key: 'tier', label: '티어', kind: 'num', w: 46, opt: false },
  { key: 'maxHp', label: 'HP', kind: 'num', w: 58, opt: false },
  { key: 'startEnergy', label: '기력', kind: 'num', w: 52, opt: false },
  { key: 'aiLevel', label: 'AI', kind: 'sel', options: AI_LEVELS, w: 74 },
  { key: 'behavior', label: '성격', kind: 'sel', options: BEHAVIORS, w: 100 },
  { key: 'baseArtId', label: '아트', kind: 'sel', options: ROSTER.map((c) => c.id), w: 84 },
  {
    key: 'spriteId',
    label: '스프라이트',
    kind: 'sel',
    options: Object.keys(SHEETS),
    empty: '(빌림)',
    w: 118,
  },
  { key: 'note', label: '설명', kind: 'text', w: 240 },
  ...PASSIVE_HOOKS.map(
    (h): Col => ({
      key: h.key,
      label: h.key,
      title: h.label,
      kind: h.type === 'bool' ? 'bool' : 'num',
      opt: true,
      path: 'passive',
      w: h.type === 'bool' ? 40 : 60,
    }),
  ),
]

const attack = isKind('attack')
const CARD_COLS: Col[] = [
  { key: 'cooldown', label: '쿨', kind: 'num', w: 44, opt: true },
  { key: 'damage', label: '피해', kind: 'num', w: 54, applies: attack },
  { key: 'energyCost', label: '기력', kind: 'num', w: 52, applies: attack },
  { key: 'fx', label: '연출', kind: 'sel', options: FX_LIST, empty: '(없음)', w: 82, applies: attack },
  { key: 'block', label: '흡수', kind: 'num', w: 54, applies: isKind('guard') },
  { key: 'guardCost', label: '가드기력', kind: 'num', w: 60, applies: isKind('guard') },
  { key: 'gain', label: '회복기력', kind: 'num', w: 60, applies: isKind('energy') },
  { key: 'healHp', label: '회복HP', kind: 'num', w: 58, applies: isKind('heal') },
  { key: 'healCost', label: '힐기력', kind: 'num', w: 56, applies: isKind('heal') },
  { key: 'buff', label: '버프', kind: 'sel', options: BUFF_LIST, w: 86, applies: isKind('buff') },
  { key: 'buffPower', label: '위력', kind: 'num', w: 50, opt: true, applies: isKind('buff') },
  { key: 'buffRounds', label: '지속', kind: 'num', w: 50, opt: true, applies: isKind('buff') },
  { key: 'buffCost', label: '버프기력', kind: 'num', w: 60, opt: true, applies: isKind('buff') },
  { key: 'dir', label: '방향', kind: 'sel', options: DIR_LIST, w: 96, applies: isKind('move') },
  { key: 'steps', label: '칸', kind: 'num', w: 44, applies: isKind('move') },
  { key: 'desc', label: '설명', kind: 'text', w: 260 },
  ...CARD_ABILITIES.map(
    (h): Col => ({
      key: h.key,
      label: h.key,
      title: h.label,
      kind: h.type === 'bool' ? 'bool' : 'num',
      opt: true,
      applies: attack,
      w: h.type === 'bool' ? 52 : 60,
    }),
  ),
]

// --- 셀 ----------------------------------------------------------------------
function Cell({
  col,
  row,
  kind,
  id,
  edit,
  dirty,
}: {
  col: Col
  row: Bag
  kind: EntityKind
  id: string
  edit: Edit
  dirty: boolean
}) {
  if (col.applies && !col.applies(row)) return <td className="xl__td xl__na" />

  const val = col.path === 'passive' ? (row.passive as Bag | undefined)?.[col.key] : row[col.key]
  const put = (v: unknown) => {
    if (col.path === 'passive') {
      const next: Bag = { ...((row.passive as Bag | undefined) ?? {}) }
      if (v === undefined) delete next[col.key]
      else next[col.key] = v
      edit(kind, id, 'passive', next)
    } else edit(kind, id, col.key, v)
  }

  const cls = `xl__td ${dirty ? 'is-dirty' : ''} xl__td--${col.kind}`
  return (
    <td className={cls} style={col.w ? { width: col.w } : undefined} title={col.title}>
      {col.kind === 'bool' ? (
        <input
          type="checkbox"
          checked={!!val}
          onChange={(e) => put(e.target.checked || undefined)}
        />
      ) : col.kind === 'sel' ? (
        <select className="xl__in" value={(val as string) ?? ''} onChange={(e) => put(e.target.value || undefined)}>
          {col.empty !== undefined && <option value="">{col.empty}</option>}
          {col.options!.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : col.kind === 'text' ? (
        <input
          className="xl__in xl__in--text"
          value={(val as string) ?? ''}
          onChange={(e) => put(e.target.value)}
        />
      ) : (
        <input
          className="xl__in xl__in--num"
          type="number"
          value={(val as number) ?? ''}
          onChange={(e) => {
            const s = e.target.value
            if (s === '') {
              if (col.opt) put(undefined)
              return
            }
            put(Number(s))
          }}
        />
      )}
    </td>
  )
}

// --- 사거리 격자(모달) --------------------------------------------------------
function RangeGrid({ card, on }: { card: CardDef; on: (field: string, v: unknown) => void }) {
  const range = card.range ?? []
  const [pad, setPad] = useState(0)
  const maxDf = Math.max(3, ...range.map((o) => Math.abs(o.df))) + pad
  const maxDu = Math.max(1, ...range.map((o) => Math.abs(o.du)))
  const dfs = Array.from({ length: maxDf * 2 + 1 }, (_, i) => i - maxDf)
  const dus = Array.from({ length: maxDu * 2 + 1 }, (_, i) => maxDu - i)
  const has = (df: number, du: number) => range.some((o) => o.df === df && o.du === du)
  const toggle = (df: number, du: number) => {
    if (df === 0 && du === 0) {
      on('pointBlank', card.pointBlank === false ? undefined : false)
      return
    }
    const next: Offset[] = has(df, du)
      ? range.filter((o) => !(o.df === df && o.du === du))
      : [...range, { df, du }]
    on('range', next)
  }
  return (
    <div>
      <table className="admin__grid">
        <tbody>
          {dus.map((du) => (
            <tr key={du}>
              {dfs.map((df) => {
                const self = df === 0 && du === 0
                const hit = self ? card.pointBlank !== false : has(df, du)
                return (
                  <td key={df}>
                    <button
                      className={`admin__cell ${hit ? 'is-hit' : ''} ${self ? 'is-self' : ''}`}
                      onClick={() => toggle(df, du)}
                      title={self ? '밀착(내 칸) — pointBlank' : `df ${df} · du ${du}`}
                    >
                      {self ? '나' : hit ? '●' : ''}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
          <tr>
            {dfs.map((df) => (
              <td className="admin__axis" key={df}>
                {df > 0 ? `+${df}` : df}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="admin__note">
        가로 = df(앞 +, 뒤 −) · 세로 = du(위 +, 아래 −). 가운데 “나” 칸은 밀착 판정
        (<code>pointBlank</code>)이라 켜져 있으면 겹친 상대에게도 맞는다.{' '}
        <button className="admin__btn" onClick={() => setPad((p) => p + 1)}>
          + 폭 넓히기
        </button>
      </p>
    </div>
  )
}

/** 몬스터 덱 편집 — 해석 가능한 카드만 고를 수 있게 막는다(아래 주의 참고). */
function DeckEditor({ ids, on }: { ids: string[]; on: (next: string[]) => void }) {
  const pickable = CARD_ENTRIES.filter((e) => MONSTER_DECK_GROUPS.includes(e.group))
  const byOwner = useMemo(() => {
    const m = new Map<string, typeof pickable>()
    for (const e of pickable) m.set(e.owner, [...(m.get(e.owner) ?? []), e])
    return [...m.entries()]
  }, [pickable])
  return (
    <div>
      <div className="admin__chipsrow">
        {ids.map((id, i) => {
          const entry = CARD_ENTRY_BY_ID[id]
          const ok = entry && MONSTER_DECK_GROUPS.includes(entry.group)
          return (
            <span
              className="admin__cardchip"
              key={`${id}-${i}`}
              style={ok ? undefined : { borderColor: 'var(--accent)' }}
              title={ok ? id : '이 카드는 몬스터 덱에서 해석되지 않는다 — 조용히 빠진다'}
            >
              {ok ? entry.card.name : `⚠ ${id}`} <small>{id}</small>
              <button className="admin__x" onClick={() => on(ids.filter((_, j) => j !== i))}>
                ✕
              </button>
            </span>
          )
        })}
        {!ids.length && <span className="admin__note">비어 있음.</span>}
      </div>
      <div className="admin__add">
        <select
          className="admin__in"
          value=""
          onChange={(e) => {
            if (e.target.value) on([...ids, e.target.value])
          }}
        >
          <option value="">+ 카드 추가…</option>
          {byOwner.map(([owner, list]) => (
            <optgroup key={owner} label={owner}>
              {list.map((e) => (
                <option key={e.card.id} value={e.card.id}>
                  {e.card.name} ({e.card.id})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <p className="admin__note">
        ⚠ 공용·직업 전용·보스 전용 카드만 고를 수 있다. 몬스터 덱을 해석하는{' '}
        <code>monsters.ts</code>의 카드 풀에 <b>직업 기본기와 런 전용 카드가 없어서</b>,
        그 id를 넣으면 에러 없이 조용히 빠진다. 공용 이동 카드는{' '}
        <code>runbattle.ts</code>가 따로 주입하므로 여기 넣지 않아도 된다.
      </p>
    </div>
  )
}

// --- 화면 --------------------------------------------------------------------
type Modal =
  | { kind: 'range'; id: string }
  | { kind: 'deck'; id: string }
  | { kind: 'card'; id: string }
  | null

export function AdminScreen({ onBack }: { onBack: () => void }) {
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const [tab, setTab] = useState<Tab>('monster')
  const [q, setQ] = useState('')
  const [groups, setGroups] = useState<CardGroup[]>([])
  const [copied, setCopied] = useState(false)
  const [modal, setModal] = useState<Modal>(null)

  const edit: Edit = (kind, id, field, value) => {
    setField(kind, id, field, value)
    bump()
  }

  const diffs = diffAll()
  const dirty = diffs.length
  // 셀 하이라이트용: entity별 바뀐 필드 집합.
  const dirtyBy = new Map<string, Set<string>>()
  for (const d of diffs) dirtyBy.set(`${d.kind}:${d.id}`, new Set(d.fields.map((f) => f.field)))
  const isDirtyCell = (kind: EntityKind, id: string, col: Col) =>
    dirtyBy.get(`${kind}:${id}`)?.has(col.path === 'passive' ? 'passive' : col.key) ?? false

  const s = q.trim().toLowerCase()
  const cards = CARD_ENTRIES.filter((e) => {
    if (groups.length && !groups.includes(e.group)) return false
    if (!s) return true
    return (
      e.card.name.toLowerCase().includes(s) ||
      e.card.id.toLowerCase().includes(s) ||
      e.owner.toLowerCase().includes(s)
    )
  })
  const monstersShown = MONSTERS.filter(
    (m) => !s || m.name.toLowerCase().includes(s) || m.id.toLowerCase().includes(s),
  )

  const modalCard = modal && modal.kind !== 'deck' ? CARD_ENTRY_BY_ID[modal.id] : undefined
  const modalMonster =
    modal?.kind === 'deck' ? MONSTERS.find((m) => m.id === modal.id) : undefined

  return (
    <div className="screen admin">
      <style>{ADMIN_CSS}</style>

      <div className="admin__header">
        <button className="btn btn--ghost" onClick={onBack}>
          ◀ 뒤로
        </button>
        <span className="admin__title">밸런스 어드민</span>
        <div className="admin__tabs">
          <button
            className={`admin__tab ${tab === 'monster' ? 'is-on' : ''}`}
            onClick={() => setTab('monster')}
          >
            몬스터 {MONSTERS.length}
          </button>
          <button
            className={`admin__tab ${tab === 'card' ? 'is-on' : ''}`}
            onClick={() => setTab('card')}
          >
            카드 {CARD_ENTRIES.length}
          </button>
          <button
            className={`admin__tab ${tab === 'export' ? 'is-on' : ''}`}
            onClick={() => {
              setTab('export')
              setCopied(false)
            }}
          >
            변경사항
            {dirty > 0 && <span className="admin__badge">{dirty}</span>}
          </button>
        </div>
      </div>

      {tab === 'export' ? (
        <div className="admin__detail">
          <div className="admin__warn">
            여기서 고친 값은 <b>지금 이 세션에만</b> 반영돼 있다(브라우저 초안에 남아
            새로고침해도 유지된다). 영구 반영은 아래 조각을 소스에 붙여 넣어야 이뤄진다 —
            그래야 <code>npm run sim:run</code>의 밸런스 측정, <code>npm run check</code>의
            불변식, 온라인 락스텝이 같은 수치를 본다.
          </div>
          <div className="admin__add">
            <button
              className="admin__btn admin__btn--go"
              onClick={() => {
                void navigator.clipboard?.writeText(exportText()).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }}
            >
              {copied ? '복사됨 ✓' : '클립보드로 복사'}
            </button>
            <button
              className="admin__btn"
              onClick={() => {
                if (confirm(`${dirty}개 항목의 수정을 전부 되돌립니다. 계속할까요?`)) {
                  resetAll()
                  bump()
                }
              }}
            >
              전체 초기화
            </button>
          </div>

          {dirty > 0 && (
            <>
              <div className="admin__section">
                <span className="admin__section-t">바뀐 항목</span>
              </div>
              <div className="admin__chipsrow">
                {diffs.map((d) => (
                  <span className="admin__cardchip" key={`${d.kind}-${d.id}`}>
                    {d.label} <small>{d.fields.map((f) => f.field).join(', ')}</small>
                    <button
                      className="admin__x"
                      title="이 항목만 되돌리기"
                      onClick={() => {
                        resetEntity(d.kind, d.id)
                        bump()
                      }}
                    >
                      ↺
                    </button>
                  </span>
                ))}
              </div>
            </>
          )}

          <textarea className="admin__export" readOnly value={exportText()} />
        </div>
      ) : (
        <div className="admin__sheetwrap">
          <div className="admin__toolbar">
            <input
              className="admin__search"
              placeholder="이름 · id 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {tab === 'card' && (
              <div className="admin__chips">
                {(Object.keys(CARD_GROUP_LABEL) as CardGroup[]).map((g) => (
                  <button
                    key={g}
                    className={`admin__chip ${groups.includes(g) ? 'is-on' : ''}`}
                    onClick={() =>
                      setGroups((cur) =>
                        cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g],
                      )
                    }
                  >
                    {CARD_GROUP_LABEL[g]}
                  </button>
                ))}
              </div>
            )}
            <span className="admin__count">
              {tab === 'monster' ? monstersShown.length : cards.length}행
            </span>
          </div>

          <div className="xl__scroll">
            {tab === 'monster' ? (
              <table className="xl">
                <thead>
                  <tr>
                    <th className="xl__th xl__th--name">몬스터</th>
                    {MON_COLS.map((c) => (
                      <th className="xl__th" key={c.key} title={c.title} style={c.w ? { width: c.w } : undefined}>
                        {c.label}
                      </th>
                    ))}
                    <th className="xl__th">덱</th>
                  </tr>
                </thead>
                <tbody>
                  {monstersShown.map((m) => {
                    const row = m as unknown as Bag
                    return (
                      <tr key={m.id} className={isDirty('monster', m.id) ? 'is-dirty' : ''}>
                        <th className="xl__name">
                          {isDirty('monster', m.id) && <span className="admin__dot">●</span>}
                          <input
                            className="xl__in xl__in--name"
                            value={m.name}
                            onChange={(e) => edit('monster', m.id, 'name', e.target.value)}
                          />
                          <small>{m.id}</small>
                        </th>
                        {MON_COLS.map((c) => (
                          <Cell
                            key={c.key}
                            col={c}
                            row={row}
                            kind="monster"
                            id={m.id}
                            edit={edit}
                            dirty={isDirtyCell('monster', m.id, c)}
                          />
                        ))}
                        <td className="xl__td">
                          <button className="admin__btn xl__mini" onClick={() => setModal({ kind: 'deck', id: m.id })}>
                            {m.deckCardIds.length}장 ✎
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <table className="xl">
                <thead>
                  <tr>
                    <th className="xl__th xl__th--name">카드</th>
                    <th className="xl__th">종류</th>
                    <th className="xl__th">소유</th>
                    {CARD_COLS.map((c) => (
                      <th className="xl__th" key={c.key} title={c.title} style={c.w ? { width: c.w } : undefined}>
                        {c.label}
                      </th>
                    ))}
                    <th className="xl__th">사거리</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((e) => {
                    const c = e.card
                    const row = c as unknown as Bag
                    return (
                      <tr key={c.id} className={isDirty('card', c.id) ? 'is-dirty' : ''}>
                        <th className="xl__name">
                          {isDirty('card', c.id) && <span className="admin__dot">●</span>}
                          <input
                            className="xl__in xl__in--name"
                            value={c.name}
                            onChange={(ev) => edit('card', c.id, 'name', ev.target.value)}
                            title={e.pvp ? 'PvP 카드 — 고치면 RULES_VERSION을 올려야 한다' : c.id}
                          />
                          <small>
                            {e.pvp && <span className="xl__pvp" title="PvP에서 쓰이는 카드">PvP</span>}
                            {c.id}
                          </small>
                        </th>
                        <td className="xl__td xl__td--ro">{c.kind}</td>
                        <td className="xl__td xl__td--ro">{CARD_GROUP_LABEL[e.group]}</td>
                        {CARD_COLS.map((col) => (
                          <Cell
                            key={col.key}
                            col={col}
                            row={row}
                            kind="card"
                            id={c.id}
                            edit={edit}
                            dirty={isDirtyCell('card', c.id, col)}
                          />
                        ))}
                        <td className="xl__td">
                          {c.kind === 'attack' ? (
                            <button className="admin__btn xl__mini" onClick={() => setModal({ kind: 'range', id: c.id })}>
                              격자 ✎
                            </button>
                          ) : (
                            <span className="xl__na-t">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {tab === 'card' && !cards.length && <div className="admin__empty">검색 결과 없음.</div>}
          </div>
        </div>
      )}

      {modal && (
        <div className="xl__overlay" onClick={() => setModal(null)}>
          <div className="xl__modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin__detail-head">
              <span className="admin__detail-name">
                {modalMonster ? modalMonster.name : modalCard?.card.name}
              </span>
              <span className="admin__id">{modal.id}</span>
              <span className="admin__spacer" />
              {isDirty(modalMonster ? 'monster' : 'card', modal.id) && (
                <button
                  className="admin__btn"
                  onClick={() => {
                    resetEntity(modalMonster ? 'monster' : 'card', modal.id)
                    bump()
                  }}
                >
                  ↺ 되돌리기
                </button>
              )}
              <button className="admin__btn" onClick={() => setModal(null)}>
                닫기 ✕
              </button>
            </div>

            {modal.kind === 'deck' && modalMonster && (
              <>
                <div className="admin__section">
                  <span className="admin__section-t">덱 ({modalMonster.deckCardIds.length}장)</span>
                </div>
                <DeckEditor
                  ids={modalMonster.deckCardIds}
                  on={(next) => edit('monster', modalMonster.id, 'deckCardIds', next)}
                />
              </>
            )}

            {modal.kind === 'range' && modalCard && (
              <div className="admin__preview">
                <div className="admin__preview-card">
                  <CardFace card={modalCard.card} accent={cardAccent(modalCard.card, 'var(--accent)')} />
                </div>
                <div style={{ flex: 1, minWidth: 260 }}>
                  {modalCard.pvp && (
                    <div className="admin__warn">
                      ⚠ 이 카드는 <b>PvP에서도 쓰인다</b>. 사거리를 바꾸면 소스에 반영할 때{' '}
                      <code>RULES_VERSION</code>을 같은 커밋에서 올려야 한다.
                    </div>
                  )}
                  <RangeGrid
                    card={modalCard.card}
                    on={(field, v) => edit('card', modalCard.card.id, field, v)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
