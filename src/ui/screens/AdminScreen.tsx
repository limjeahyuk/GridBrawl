// ---------------------------------------------------------------------------
// 어드민(밸런스 튜닝 콘솔) — **개발 빌드 전용 화면**. 몬스터 20종과 카드 전량을
// 한자리에서 보고 고친다. 저장 모델·왜 소스가 진실의 원천인지는 `game/admin.ts` 머리말.
//
// ⚠ 배포 번들에 남지 않아야 하므로 **부작용 있는 import를 만들지 않는다** — 스타일도
// CSS 파일이 아니라 문자열(`adminCss.ts`)을 `<style>`로 렌더한다. `App.tsx`가 이
// 화면을 `import.meta.env.DEV` 뒤에서만 참조하므로 배포 빌드에서는 통째로 사라진다.
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
const BEHAVIOR_LABEL: Record<string, string> = {
  balanced: 'balanced · 균형 (조정 없음)',
  rusher: 'rusher · 돌격 (무조건 붙는다)',
  kiter: 'kiter · 카이팅 (붙으면 물러나 쏜다)',
  turtle: 'turtle · 거북이 (버티며 기다린다)',
  skirmisher: 'skirmisher · 교란 (붙었다 빠진다)',
}
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
const BUFF_LABEL: Record<string, string> = {
  atkUp: 'atkUp · 피해 +N',
  defUp: 'defUp · 받는 피해 −N',
  freeCast: 'freeCast · 기력 소모 0',
}

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
  { key: 'poisonOnHit', label: '적중 시 독 +N', type: 'int' },
  { key: 'burnOnHit', label: '적중 시 화상 +N', type: 'int' },
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
  { key: 'poison', label: '독 N (턴당 피해)', type: 'int' },
  { key: 'burn', label: '화상 N (턴당 피해)', type: 'int' },
  { key: 'freeze', label: '빙결 N턴', type: 'int' },
  { key: 'empower', label: '전투 내내 피해 +N (충전)', type: 'int' },
  { key: 'dashForward', label: '공격 직전 이동 ±N칸', type: 'int' },
]

/** 몬스터 덱에 넣을 수 있는 카드 묶음. `monsters.ts`의 카드 해석기가 보는 범위와 같다. */
const MONSTER_DECK_GROUPS: CardGroup[] = ['common', 'class', 'boss']

type Bag = Record<string, unknown>
type Tab = 'monster' | 'card' | 'export'

// --- 작은 조각들 --------------------------------------------------------------
function Field({
  label,
  dirty,
  children,
}: {
  label: string
  dirty?: boolean
  children: React.ReactNode
}) {
  return (
    <>
      <div className={`admin__label ${dirty ? 'is-dirty' : ''}`}>{label}</div>
      <div>{children}</div>
    </>
  )
}

function Num({
  v,
  on,
  optional,
}: {
  v: number | undefined
  on: (n: number | undefined) => void
  /** 비우면 필드를 지운다. 필수 필드(체력 등)는 false — 빈 입력을 무시한다. */
  optional?: boolean
}) {
  return (
    <input
      className="admin__in admin__in--num"
      type="number"
      value={v ?? ''}
      onChange={(e) => {
        const s = e.target.value
        if (s === '') {
          if (optional) on(undefined)
          return
        }
        on(Number(s))
      }}
    />
  )
}

function Sel({
  v,
  on,
  options,
  labels,
  allowEmpty,
}: {
  v: string | undefined
  on: (s: string | undefined) => void
  options: readonly string[]
  labels?: Record<string, string>
  allowEmpty?: string
}) {
  return (
    <select className="admin__in" value={v ?? ''} onChange={(e) => on(e.target.value || undefined)}>
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {labels?.[o] ?? o}
        </option>
      ))}
    </select>
  )
}

/** 훅 편집기 — 몬스터 패시브와 카드 특수 능력이 같은 모양이라 하나로 쓴다. */
function Hooks({
  bag,
  hooks,
  on,
}: {
  bag: Bag
  hooks: Hook[]
  on: (key: string, value: unknown) => void
}) {
  const set = hooks.filter((h) => bag[h.key] !== undefined)
  const unset = hooks.filter((h) => bag[h.key] === undefined)
  return (
    <div className="admin__hooks">
      {set.map((h) => (
        <div className="admin__hook" key={h.key}>
          <span className="admin__hook-name">
            {h.label} <span className="admin__hook-key">{h.key}</span>
          </span>
          {h.type === 'int' ? (
            <Num v={bag[h.key] as number} on={(n) => on(h.key, n)} optional />
          ) : (
            <input
              type="checkbox"
              checked={!!bag[h.key]}
              onChange={(e) => on(h.key, e.target.checked)}
            />
          )}
          <button className="admin__x" onClick={() => on(h.key, undefined)} title="이 훅을 제거">
            ✕
          </button>
        </div>
      ))}
      {!set.length && <div className="admin__note">없음.</div>}
      {unset.length > 0 && (
        <div className="admin__add">
          <select
            className="admin__in"
            value=""
            onChange={(e) => {
              const h = hooks.find((x) => x.key === e.target.value)
              if (h) on(h.key, h.type === 'bool' ? true : 0)
            }}
          >
            <option value="">+ 추가…</option>
            {unset.map((h) => (
              <option key={h.key} value={h.key}>
                {h.label} ({h.key})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

/**
 * 사거리 격자. 가운데(내 칸)는 `pointBlank` 토글이다 — "밀착한 상대에게도 맞는가"가
 * 곧 자기 칸을 사거리에 넣느냐와 같은 질문이라, 같은 그림 안에서 다루는 게 맞다.
 * 기본 폭은 앞뒤 3칸이고, 그보다 먼 칸을 쓰는 카드는 자동으로 넓어진다.
 */
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
  }, [])
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
export function AdminScreen({ onBack }: { onBack: () => void }) {
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const [tab, setTab] = useState<Tab>('monster')
  const [monsterId, setMonsterId] = useState(MONSTERS[0].id)
  const [cardId, setCardId] = useState(CARD_ENTRIES[0].card.id)
  const [q, setQ] = useState('')
  const [groups, setGroups] = useState<CardGroup[]>([])
  const [copied, setCopied] = useState(false)

  const edit = (kind: EntityKind, id: string, field: string, value: unknown) => {
    setField(kind, id, field, value)
    bump()
  }

  const diffs = diffAll()
  const dirty = diffs.length

  const monster = MONSTERS.find((m) => m.id === monsterId) as MonsterDef
  const entry = CARD_ENTRY_BY_ID[cardId]

  const cards = CARD_ENTRIES.filter((e) => {
    if (groups.length && !groups.includes(e.group)) return false
    if (!q.trim()) return true
    const s = q.trim().toLowerCase()
    return (
      e.card.name.toLowerCase().includes(s) ||
      e.card.id.toLowerCase().includes(s) ||
      e.owner.toLowerCase().includes(s)
    )
  })

  const monstersShown = MONSTERS.filter((m) => {
    if (!q.trim()) return true
    const s = q.trim().toLowerCase()
    return m.name.toLowerCase().includes(s) || m.id.toLowerCase().includes(s)
  })

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
        <div className="admin__body">
          <div className="admin__list">
            <div className="admin__filters">
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
            </div>

            {tab === 'monster'
              ? monstersShown.map((m) => (
                  <button
                    key={m.id}
                    className={`admin__row ${m.id === monsterId ? 'is-on' : ''}`}
                    onClick={() => setMonsterId(m.id)}
                  >
                    {isDirty('monster', m.id) && <span className="admin__dot">●</span>}
                    <span className="admin__row-name">{m.name}</span>
                    <span className="admin__row-meta">
                      T{m.tier} · {m.maxHp}
                    </span>
                  </button>
                ))
              : cards.map((e) => (
                  <button
                    key={e.card.id}
                    className={`admin__row ${e.card.id === cardId ? 'is-on' : ''}`}
                    onClick={() => setCardId(e.card.id)}
                  >
                    {isDirty('card', e.card.id) && <span className="admin__dot">●</span>}
                    <span className="admin__row-name">{e.card.name}</span>
                    <span className="admin__row-meta">{e.owner}</span>
                  </button>
                ))}
            {tab === 'card' && !cards.length && <div className="admin__empty">검색 결과 없음.</div>}
          </div>

          <div className="admin__detail">
            {tab === 'monster'
              ? renderMonster(monster, edit, bump)
              : entry && renderCard(entry.card, entry.owner, entry.file, entry.pvp, edit, bump)}
          </div>
        </div>
      )}
    </div>
  )
}

type Edit = (kind: EntityKind, id: string, field: string, value: unknown) => void

function DetailHead({
  kind,
  id,
  name,
  meta,
  bump,
}: {
  kind: EntityKind
  id: string
  name: string
  meta: string
  bump: () => void
}) {
  return (
    <div className="admin__detail-head">
      <span className="admin__detail-name">{name}</span>
      <span className="admin__id">{id}</span>
      <span className="admin__row-meta">{meta}</span>
      <span className="admin__spacer" />
      {isDirty(kind, id) && (
        <button
          className="admin__btn"
          onClick={() => {
            resetEntity(kind, id)
            bump()
          }}
        >
          ↺ 이 항목 되돌리기
        </button>
      )}
    </div>
  )
}

function renderMonster(m: MonsterDef, edit: Edit, bump: () => void) {
  const set = (f: string, v: unknown) => edit('monster', m.id, f, v)
  const passive = m.passive as Bag
  return (
    <>
      <DetailHead kind="monster" id={m.id} name={m.name} meta="src/game/monsters.ts" bump={bump} />

      <div className="admin__section">
        <span className="admin__section-t">기본</span>
      </div>
      <div className="admin__fields">
        <Field label="이름">
          <input
            className="admin__in admin__in--text"
            value={m.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="티어">
          <Num v={m.tier} on={(n) => set('tier', n)} />
        </Field>
        <Field label="최대 체력">
          <Num v={m.maxHp} on={(n) => set('maxHp', n)} />
        </Field>
        <Field label="시작 기력">
          <Num v={m.startEnergy} on={(n) => set('startEnergy', n)} />
        </Field>
        <Field label="AI 난이도">
          <Sel v={m.aiLevel} on={(s) => set('aiLevel', s)} options={AI_LEVELS} />
        </Field>
        <Field label="성격">
          <Sel
            v={m.behavior ?? 'balanced'}
            on={(s) => set('behavior', s)}
            options={BEHAVIORS}
            labels={BEHAVIOR_LABEL}
          />
        </Field>
        <Field label="아트 기반">
          <Sel v={m.baseArtId} on={(s) => set('baseArtId', s)} options={ROSTER.map((c) => c.id)} />
        </Field>
        <Field label="스프라이트">
          <Sel
            v={m.spriteId}
            on={(s) => set('spriteId', s)}
            options={Object.keys(SHEETS)}
            allowEmpty="(baseArtId의 직업 시트를 빌림)"
          />
        </Field>
        <Field label="설명">
          <textarea
            className="admin__in admin__in--area"
            value={m.note}
            onChange={(e) => set('note', e.target.value)}
          />
        </Field>
      </div>
      <p className="admin__note">
        설명은 조우 안내에 뜨고, 그대로 <code>monsterPassive()</code>의{' '}
        <code>passive.desc</code>가 된다.
      </p>

      <div className="admin__section">
        <span className="admin__section-t">패시브 훅</span>
      </div>
      <Hooks
        bag={passive}
        hooks={PASSIVE_HOOKS}
        on={(k, v) => {
          const next: Bag = { ...passive }
          if (v === undefined) delete next[k]
          else next[k] = v
          set('passive', next)
        }}
      />
      {passive.energyTriggers !== undefined && (
        <p className="admin__note">
          ⚠ <code>energyTriggers</code>(누적 기력 트리거)가 걸려 있다 — 객체 배열이라 여기서는
          편집하지 않는다. 소스에서 직접 고칠 것.
        </p>
      )}

      <div className="admin__section">
        <span className="admin__section-t">덱 ({m.deckCardIds.length}장)</span>
      </div>
      <DeckEditor ids={m.deckCardIds} on={(next) => set('deckCardIds', next)} />
    </>
  )
}

function renderCard(
  c: CardDef,
  owner: string,
  file: string,
  pvp: boolean,
  edit: Edit,
  bump: () => void,
) {
  const set = (f: string, v: unknown) => edit('card', c.id, f, v)
  const bag = c as unknown as Bag
  const accent = cardAccent(c, 'var(--accent)')
  return (
    <>
      <DetailHead kind="card" id={c.id} name={c.name} meta={`${owner} · ${file}`} bump={bump} />

      {pvp && (
        <div className="admin__warn">
          ⚠ 이 카드는 <b>PvP(단판·온라인)에서도 쓰인다</b>. 수치·사거리·능력을 바꾸면 소스에
          반영할 때 <code>battle/types.ts</code>의 <code>RULES_VERSION</code>을 같은 커밋에서
          올려야 한다 — 안 그러면 구버전 앱과 붙었을 때 조용한 desync가 난다.
        </div>
      )}

      <div className="admin__preview">
        <div className="admin__preview-card">
          <CardFace card={c} accent={accent} />
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="admin__fields">
            <Field label="이름">
              <input
                className="admin__in admin__in--text"
                value={c.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </Field>
            <Field label="종류">
              <span className="admin__row-meta">{c.kind} (고정)</span>
            </Field>
            <Field label="쿨타임">
              <Num v={c.cooldown} on={(n) => set('cooldown', n)} optional />
            </Field>
            {c.kind === 'attack' && (
              <>
                <Field label="피해">
                  <Num v={c.damage} on={(n) => set('damage', n)} />
                </Field>
                <Field label="기력 소모">
                  <Num v={c.energyCost} on={(n) => set('energyCost', n)} />
                </Field>
                <Field label="타격 연출">
                  <Sel v={c.fx} on={(s) => set('fx', s)} options={FX_LIST} allowEmpty="(없음)" />
                </Field>
              </>
            )}
            {c.kind === 'guard' && (
              <>
                <Field label="흡수량">
                  <Num v={c.block} on={(n) => set('block', n)} />
                </Field>
                <Field label="기력 소모">
                  <Num v={c.guardCost} on={(n) => set('guardCost', n)} />
                </Field>
              </>
            )}
            {c.kind === 'energy' && (
              <Field label="회복 기력">
                <Num v={c.gain} on={(n) => set('gain', n)} />
              </Field>
            )}
            {c.kind === 'heal' && (
              <>
                <Field label="회복 체력">
                  <Num v={c.healHp} on={(n) => set('healHp', n)} />
                </Field>
                <Field label="기력 소모">
                  <Num v={c.healCost} on={(n) => set('healCost', n)} />
                </Field>
              </>
            )}
            {c.kind === 'buff' && (
              <>
                <Field label="버프 종류">
                  <Sel v={c.buff} on={(s) => set('buff', s)} options={BUFF_LIST} labels={BUFF_LABEL} />
                </Field>
                <Field label="위력">
                  <Num v={c.buffPower} on={(n) => set('buffPower', n)} optional />
                </Field>
                <Field label="지속 턴">
                  <Num v={c.buffTurns} on={(n) => set('buffTurns', n)} optional />
                </Field>
                <Field label="기력 소모">
                  <Num v={c.buffCost} on={(n) => set('buffCost', n)} optional />
                </Field>
              </>
            )}
            {c.kind === 'move' && (
              <>
                <Field label="방향">
                  <Sel v={c.dir} on={(s) => set('dir', s)} options={DIR_LIST} />
                </Field>
                <Field label="칸 수">
                  <Num v={c.steps} on={(n) => set('steps', n)} />
                </Field>
              </>
            )}
            <Field label="설명">
              <textarea
                className="admin__in admin__in--area"
                value={c.desc}
                onChange={(e) => set('desc', e.target.value)}
              />
            </Field>
          </div>
        </div>
      </div>

      {c.kind === 'attack' && (
        <>
          <div className="admin__section">
            <span className="admin__section-t">사거리</span>
          </div>
          <RangeGrid card={c} on={set} />

          <div className="admin__section">
            <span className="admin__section-t">특수 능력</span>
          </div>
          <Hooks bag={bag} hooks={CARD_ABILITIES} on={(k, v) => set(k, v)} />
        </>
      )}
    </>
  )
}
