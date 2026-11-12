// ---------------------------------------------------------------------------
// 카드 상세 — **꾹 누르면** 크게 펼쳐지는 설명판(2026-08-05).
//
// 압축 카드(전투 손패)는 104px 폭에 아이콘과 숫자만 담는다. 그 대가로 "넉백 1이
// 대체 무슨 뜻인가"를 배울 곳이 필요했고, 그게 여기다. 아이콘·이름·뜻은 전부
// `cardAbility.ts` 한 곳에서 오므로 **카드와 설명이 어긋날 수 없다.**
//
// ⚠ 룰이 아니라 **읽기용 화면**이다 — 엔진·AI·시뮬과 아무 관계가 없다.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react'
import { GRID_COLS, GRID_ROWS, type Cell, type CardDef } from '../battle/types'
import { RangeChart, cardAccent } from './CardFace'
import { KIND_LABEL, abilityList, cardCost, primaryStat } from './cardAbility'

/**
 * 꾹 누르기(길게 누르기) 감지. 마우스·터치·펜을 한 번에 받으려고 포인터 이벤트를
 * 쓴다. 누른 채 손가락이 크게 움직이면(스크롤) 취소한다 — 손패는 가로 스크롤이라
 * 이게 없으면 넘기려다 상세가 떠 버린다.
 *
 * ⚠ 상세가 뜨고 나면 그 뒤의 `click`을 **삼켜야 한다.** 안 그러면 손을 떼는
 *   순간 카드가 슬롯에 담긴다(읽으려고 눌렀을 뿐인데 골라진다).
 */
export function useLongPress(onLong: () => void, ms = 380) {
  const timer = useRef<number | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }
  useEffect(() => clear, [])

  return {
    /** 카드 요소에 그대로 펼쳐 넣는다. */
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        fired.current = false
        start.current = { x: e.clientX, y: e.clientY }
        timer.current = window.setTimeout(() => {
          fired.current = true
          onLong()
        }, ms)
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current
        if (!s) return
        if (Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10) clear()
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      // 길게 누르면 브라우저 기본 컨텍스트 메뉴가 뜬다(모바일 웹뷰 포함) — 막는다.
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
    /** 클릭 핸들러 맨 앞에서 부른다. true면 이번 클릭은 상세를 연 것이므로 무시. */
    consumedClick: () => {
      if (!fired.current) return false
      fired.current = false
      return true
    },
  }
}

const same = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row
function MiniBoard({ card, board }: { card: CardDef; board: DetailBoard }) {
  const hit = board.hits.some((c) => same(c, board.foe))
  return (
    <div className="cardzoom__now">
      <span>지금 쓰면</span>
      <div className="cardzoom__mini">
        {Array.from({ length: GRID_ROWS }, (_, row) =>
          Array.from({ length: GRID_COLS }, (_, col) => {
            const c = { col, row }
            const me = same(c, board.me), foe = same(c, board.foe), h = board.hits.some((x) => same(x, c))
            return (
              <i key={`${col},${row}`} className={`${h ? 'is-hit' : ''} ${me ? 'is-me' : ''} ${foe ? 'is-foe' : ''}`}>
                {me ? '나' : foe ? '적' : ''}
              </i>
            )
          }),
        )}
      </div>
      <b className={hit ? 'is-hit' : ''}>
        {hit
          ? `${board.foeName}이(가) 범위 안${card.push ? ` — 맞고 ${card.push}칸 밀려난다` : ''}`
          : '이 자리에선 아직 안 닿는다'}
      </b>
    </div>
  )
}

/**
 * 상세 카드. 화면 전체를 덮는 어두운 판 위에 한 장을 크게 띄운다. 아무 데나
 * 누르면 닫힌다 — 읽으려고 연 것이라 "닫기"를 찾게 만들면 안 된다.
 */
/** 전투에서 열었을 때만 — "지금 쓰면" 미니 판(6×4, 화면 좌표 그대로). */
export interface DetailBoard {
  me: Cell
  foe: Cell
  hits: Cell[]
  foeName: string
}

export function CardDetail({
  card,
  accent,
  onClose,
  board,
}: {
  card: CardDef
  accent: string
  onClose: () => void
  board?: DetailBoard
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const stat = primaryStat(card)
  const cost = cardCost(card)
  const abils = abilityList(card)
  /**
   * 사거리를 말로 풀 때 **가장 먼 칸이 아니라 실제로 덮는 칸**을 적는다.
   * `먼 겨냥`은 2·3칸째만 때리는데 "앞으로 3칸"이라고 하면 1칸도 맞는 줄 읽힌다.
   */
  const dist = (sign: number): string => {
    const set = [...new Set((card.range ?? []).map((o) => o.df * sign).filter((d) => d > 0))]
    return set.sort((a, b) => a - b).join('·')
  }
  const fwd = card.kind === 'attack' ? dist(1) : ''
  const back = card.kind === 'attack' ? dist(-1) : ''

  return (
    <div className="cardzoom" onClick={onClose} role="presentation">
      {/* 두 칸짜리 판(디자인 `CardDetail`) — 왼쪽은 카드를 크게, 오른쪽은 수치와
          용어. 시안은 사거리를 5×3으로 그리지만 **우리 카드는 앞뒤 3칸째까지
          간다**(궁수 `먼 겨냥`) — 5칸으로 자르면 그 카드가 빈 칸으로 보인다. */}
      <div
        className="cardzoom__sheet"
        style={{ ['--accent' as string]: cardAccent(card, accent) }}
        onClick={(e) => e.stopPropagation()}
      >
        <article className={`cardzoom__card cardzoom__card--${card.kind}`}>
          <span className="cardzoom__strip" />
          <div className="cardzoom__chips">
            {stat && (
              <span className="cardzoom__chip cardzoom__chip--dm">
                {stat.unit} {stat.value}
              </span>
            )}
            {cost > 0 && <span className="cardzoom__chip cardzoom__chip--en">EN {cost}</span>}
          </div>
          <h2 className="cardzoom__name">{card.name}</h2>
          {card.kind === 'attack' && <RangeChart card={card} />}
          {card.kind === 'attack' && (
            <span className="cardzoom__rangehint">
              가운데 = 나 · 빨강 = 맞는 칸
              {fwd && ` · 앞 ${fwd}칸째`}
              {back && ` · 뒤 ${back}칸째`}
            </span>
          )}
          <span className="cardzoom__kinds">
            <em>{KIND_LABEL[card.kind]}</em>
            {card.signature && <em className="is-sig">시그니처</em>}
            {card.legend && <em className="is-legend">전설 · 중립 · 이벤트 전용</em>}
            {!!card.upgraded && <em className="is-up">강화 {'★'.repeat(card.upgraded)}</em>}
          </span>
        </article>

        <div className="cardzoom__panel">
          <p className="cardzoom__desc">{card.desc}</p>
          {card.upgradeNote && <p className="cardzoom__upnote">⬆ {card.upgradeNote}</p>}
          <dl className="cardzoom__stats">
            {stat && (
              <div className="statbox">
                <dt>{stat.unit}</dt>
                <dd>{stat.value}</dd>
              </div>
            )}
            <div className="statbox">
              <dt>기력</dt>
              <dd>{cost > 0 ? cost : '0'}</dd>
            </div>
            <div className="statbox">
              <dt>쿨타임</dt>
              <dd>{(card.cooldown ?? 0) > 0 ? `${card.cooldown}R` : '없음'}</dd>
            </div>
            <div className="statbox">
              <dt>{card.kind === 'buff' ? '지속' : '밀착'}</dt>
              <dd>
                {card.kind === 'buff'
                  ? `${card.buffRounds ?? 1}R`
                  : card.kind === 'attack'
                    ? card.pointBlank !== false
                      ? '가능'
                      : '사각'
                    : '—'}
              </dd>
            </div>
          </dl>
          {board && card.kind === 'attack' && <MiniBoard card={card} board={board} />}
          {abils.length > 0 && (
            <div className="cardzoom__terms">
              <span className="cardzoom__label">용어</span>
              {abils.map((a) => (
                <p key={a.label} className={a.bad ? 'is-bad' : ''}>
                  <i>{a.icon}</i>
                  <b>{a.label}</b> — {a.meaning}
                </p>
              ))}
            </div>
          )}
          <div className="cardzoom__foot">
            <span>꾹 누르면 열림 · 아무 데나 누르면 닫힘</span>
            <button className="cardzoom__close" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 카드를 고르는 화면 어디에나 **꾹 누르기 → 상세**를 붙이는 묶음.
 * 보상·상점·이벤트·런 시작은 전부 "설명을 읽고 하나를 고르는" 화면인데, 압축
 * 카드에는 설명이 없다. 세 줄이면 붙는다:
 *
 * ```tsx
 * const zoom = useCardZoom(char.accent)
 * <button {...zoom.bind(c)} onClick={() => { if (zoom.consumedClick()) return; pick(c) }}>
 * {zoom.sheet}
 * ```
 * (전투 화면은 손패에 미리보기 같은 다른 포인터 처리가 얽혀 있어 직접 배선한다.)
 */
export function useCardZoom(accent: string) {
  const [card, setCard] = useState<CardDef | null>(null)
  const pressed = useRef<CardDef | null>(null)
  const lp = useLongPress(() => {
    if (pressed.current) setCard(pressed.current)
  })
  return {
    bind: (c: CardDef) => ({
      ...lp.handlers,
      onPointerDown: (e: React.PointerEvent) => {
        pressed.current = c
        lp.handlers.onPointerDown(e)
      },
    }),
    consumedClick: lp.consumedClick,
    sheet: card ? (
      <CardDetail card={card} accent={accent} onClose={() => setCard(null)} />
    ) : null,
  }
}
