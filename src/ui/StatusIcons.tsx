// 상태이상 · 버프 아이콘(시안 `docs/design/screens/StatusIcons.dc.html` · 규칙 `docs/rules/STATUS.md` 화면 절).
// 16×16 타일 한 장짜리 시트(`ui/status/tiles.png` · 10칸)를 **정수 배율**로 그린다 — 전투 ×2(32px) · 설명창 ×3.
// 2 이상이면 오른쪽 아래에 `×N` 픽셀 숫자(`ui/status/digits.png` · 0~9 · ×). 1은 숫자 없음.
import { useState } from 'react'
import type { StatusEffect } from '../battle/types'

/** 시트 칸 순서(왼쪽부터). 힘 · 출혈은 칸만 있다 — 힘은 화면 표시를 사용자가 추후 정하고, 출혈은 엔진에 아직 없다. */
const TILE = ['poison', 'burn', 'bleed', 'bind', 'stunned', 'frozen', 'empower', 'atkUp', 'defUp', 'freeCast'] as const
type Cat = 'dot' | 'lock' | 'buff'
const CAT_OF: Record<string, Cat> = {
  poison: 'dot', burn: 'dot', bleed: 'dot',
  bind: 'lock', stunned: 'lock', frozen: 'lock',
  empower: 'buff', atkUp: 'buff', defUp: 'buff', freeCast: 'buff',
}
const CAT: Record<Cat, { name: string; col: string }> = {
  dot: { name: '피해', col: '#ff6a6a' },
  lock: { name: '이동불가', col: '#b8a8ff' },
  buff: { name: '버프', col: '#f4d470' },
}

/** 한 종류로 묶은 상태 — 숫자는 갈래마다 뜻이 다르다(겹 · 남은 턴 · 남은 라운드). */
export interface StatusIcon {
  kind: string
  /** 아이콘 숫자. 피해 = 겹, 이동불가 = 남은 턴, 버프 = 남은 라운드. */
  n: number
  /** 버프의 위력(공격 +N · 피해 −N) — 설명창에만. */
  power: number
}

/** 상태 목록 → 종류별 아이콘(걸린 순서 그대로). 시트에 칸이 없는 종류는 뺀다. */
export function statusIcons(list: readonly StatusEffect[]): StatusIcon[] {
  const out: StatusIcon[] = []
  for (const e of list) {
    if (!(TILE as readonly string[]).includes(e.kind)) continue
    // 이동불가의 `rounds`는 "지금 턴 뒤로 남은 턴" — 0이어도 이 턴은 묶여 있으니 1로 보인다.
    const n = CAT_OF[e.kind] === 'lock' ? Math.max(1, e.rounds) : e.rounds
    const cur = out.find((c) => c.kind === e.kind)
    if (cur) {
      cur.n = Math.max(cur.n, n)
      cur.power += e.power
    } else out.push({ kind: e.kind, n, power: e.power })
  }
  return out
}

/** 설명창 글 — [제목, 효과, 줄어드는 때]. */
function describe(s: StatusIcon): [string, string, string] {
  const n = s.n
  switch (s.kind) {
    case 'poison': return [`중독 ${n}겹`, `행동할 때마다 피해 ${n}(보호막 무시).`, '라운드가 끝나면 1겹 줄어든다']
    case 'burn': return [`화상 ${n}겹`, `카드 공격에 맞으면 피해 +${Math.min(n, 3) * 10}%(3겹에서 멈춤).`, '라운드가 끝나면 1겹 줄어든다']
    case 'bleed': return [`출혈 ${n}겹`, `카드 공격에 맞을 때마다 추가 피해 ${Math.min(n, 3) * 5}(3겹에서 멈춤).`, '라운드가 끝나면 1겹 줄어든다']
    case 'bind': return [`속박 ${n}턴`, '이동 카드가 무효가 된다. 공격 · 수비는 된다.', '턴이 끝날 때마다 1 줄어든다']
    case 'stunned': return [`기절 ${n}턴`, '카드를 낼 수 없다.', '턴이 끝날 때마다 1 줄어든다']
    case 'frozen': return [`빙결 ${n}턴`, '카드를 낼 수 없다. 피해를 받으면 깨지며 피해 +5.', '턴이 끝날 때마다 1 줄어든다']
    case 'empower': return [`힘 ${n}`, `모든 공격 피해 +${n}.`, '전투 내내 간다']
    case 'atkUp': return [`공격 강화 · ${n}라운드`, `공격 피해 +${s.power}.`, '라운드가 끝나면 1 줄어든다']
    case 'defUp': return [`방어 강화 · ${n}라운드`, `받는 공격 피해 −${s.power}.`, '라운드가 끝나면 1 줄어든다']
    case 'freeCast': return [`무아지경 · ${n}라운드`, '카드의 기력 소모가 0.', '라운드가 끝나면 1 줄어든다']
    default: return [s.kind, '', '']
  }
}

/** 타일 하나(+ `×N`). `k` = 정수 배율(1 · 2 · 3). */
export function StatusTile({ kind, n = 1, k = 2 }: { kind: string; n?: number; k?: 1 | 2 | 3 }) {
  const i = (TILE as readonly string[]).indexOf(kind)
  const digits = n >= 2 ? String(Math.min(99, n)) : ''
  return (
    <i
      className="sttile"
      aria-hidden="true"
      style={{
        width: 16 * k,
        height: 16 * k,
        backgroundSize: `${160 * k}px ${16 * k}px`,
        backgroundPosition: `${-16 * k * i}px 0`,
        ['--k' as string]: k,
      }}
    >
      {digits && (
        <span className="sttile__n">
          {['x', ...digits].map((ch, j) => (
            <i key={j} style={{ backgroundPosition: `${-5 * k * (ch === 'x' ? 10 : Number(ch))}px 0` }} />
          ))}
        </span>
      )}
    </i>
  )
}

/**
 * 상태바 아래 한 줄 — 내 쪽은 왼쪽부터, 상대는 오른쪽부터 걸린 순서대로. 누르면 설명창.
 * 위치는 CSS(`.strow--left/right`)가 정한다 — `.bhud`(96px 고정) 밖에 따로 둔다.
 */
export function StatusRow({ status, side, owner }: { status: readonly StatusEffect[]; side: 'left' | 'right'; owner: string }) {
  const icons = statusIcons(status)
  const [open, setOpen] = useState<string | null>(null)
  const k = icons.findIndex((s) => s.kind === open)
  const sel = k >= 0 ? icons[k] : null
  const [title, body, next] = sel ? describe(sel) : ['', '', '']
  const cat = sel ? CAT[CAT_OF[sel.kind]] : null
  return (
    <div className={`strow strow--${side}`} aria-label={`${owner}의 상태`}>
      {icons.map((s) => (
        <button
          key={s.kind}
          type="button"
          className={`strow__btn ${open === s.kind ? 'is-on' : ''}`}
          aria-label={describe(s)[0]}
          onClick={() => setOpen(open === s.kind ? null : s.kind)}
        >
          <StatusTile kind={s.kind} n={s.n} />
        </button>
      ))}
      {sel && cat && (
        <div
          className="strow__tip"
          style={{ [side]: Math.max(0, k * 44 - 14), ['--tipcol' as string]: cat.col }}
          role="tooltip"
        >
          <StatusTile kind={sel.kind} k={3} />
          <div>
            <span className="strow__name">
              <b>{title}</b>
              <em>{cat.name}</em>
            </span>
            <p>{body}</p>
            <span className="strow__next">{next}</span>
          </div>
        </div>
      )}
    </div>
  )
}
