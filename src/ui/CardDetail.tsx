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
import type { CardDef } from '../battle/types'
import { RangeChart, cardAccent, kindIcon } from './CardFace'
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

/**
 * 상세 카드. 화면 전체를 덮는 어두운 판 위에 한 장을 크게 띄운다. 아무 데나
 * 누르면 닫힌다 — 읽으려고 연 것이라 "닫기"를 찾게 만들면 안 된다.
 */
export function CardDetail({
  card,
  accent,
  onClose,
}: {
  card: CardDef
  accent: string
  onClose: () => void
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
      <div
        className="cardzoom__sheet"
        style={{ ['--accent' as string]: cardAccent(card, accent) }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cardzoom__head">
          <span className="cardzoom__kindicon">{kindIcon(card)}</span>
          <div>
            <div className="cardzoom__name">{card.name}</div>
            <div className="cardzoom__kind">
              {KIND_LABEL[card.kind]}
              {card.signature && <em> · 시그니처</em>}
            </div>
          </div>
        </div>

        <p className="cardzoom__desc">{card.desc}</p>

        <div className="cardzoom__stats">
          {stat && (
            <div className="cardzoom__stat">
              <b>{stat.value}</b>
              <span>{stat.unit}</span>
            </div>
          )}
          {cost > 0 && (
            <div className="cardzoom__stat">
              <b>{cost}</b>
              <span>기력</span>
            </div>
          )}
          {(card.cooldown ?? 0) > 0 && (
            <div className="cardzoom__stat">
              <b>{card.cooldown}</b>
              <span>라운드 쿨타임</span>
            </div>
          )}
          {card.kind === 'buff' && (
            <div className="cardzoom__stat">
              <b>{card.buffRounds ?? 1}</b>
              <span>라운드 지속</span>
            </div>
          )}
        </div>

        {card.kind === 'attack' && (
          <div className="cardzoom__range">
            <div className="cardzoom__label">사거리</div>
            <RangeChart card={card} />
            <p className="cardzoom__hint">
              가운데가 나, 오른쪽이 상대 쪽이다.
              {fwd && ` 앞 ${fwd}칸째`}
              {back && ` · 뒤 ${back}칸째`}
              {card.pointBlank !== false ? ' · 겹쳐 있어도 맞힌다' : ' · 겹치면 못 맞힌다'}
            </p>
          </div>
        )}

        {abils.length > 0 && (
          <div className="cardzoom__abils">
            <div className="cardzoom__label">특수 능력</div>
            {abils.map((a) => (
              <div key={a.label} className={`cardzoom__abil ${a.bad ? 'is-bad' : ''}`}>
                <i>{a.icon}</i>
                <div>
                  <b>{a.label}</b>
                  <span>{a.meaning}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="cardzoom__close" onClick={onClose}>
          닫기
        </button>
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
