// 런 이벤트 — 대가를 치르고 보상을 얻는 선택. 카드 제거형은 버릴 카드를, 강화형은
// 벼릴 카드를 고른다(2026-08-08).
import { useMemo, useState } from 'react'
import { getChar } from '../../data/roster'
import { getRelic } from '../../game/relics'
import { upgradedCard, upgradePreview } from '../../game/upgrades'
import { resolveRunCard } from '../../game/runcards'
import {
  advanceFloor, canUpgradeCard, cardLevel, resolveEventEffect, rollEvent, runCard,
  upgradableDeckCards, type EventEffect, type RunState,
} from '../../game/run'
import { CardFace, cardAccent } from '../CardFace'
import { RunBar } from '../RunBar'

/** 강화형 선택지인가 — 카드 목록을 "강화 가능한 것만"으로 좁히는 기준. */
const isUpgradeEffect = (e: EventEffect): boolean =>
  e.type === 'upgradeCard' || e.type === 'loseHpUpgradeCard' || e.type === 'payGoldUpgradeCard'

/**
 * 그 선택지를 지금 고를 수 있는가. 고를 수 없는 이유를 **누르기 전에** 보여 준다 —
 * 예전엔 골드가 모자란 채로 `payGoldHeal`을 누르면 아무 일도 없이 결과 화면으로
 * 넘어가서, 손해를 본 건지 아무 일도 안 일어난 건지 알 수 없었다.
 */
function blockedReason(run: RunState, e: EventEffect): string | null {
  if (isUpgradeEffect(e) && !upgradableDeckCards(run).length) return '강화할 카드가 없다'
  if (e.type === 'payGoldUpgradeCard' && run.gold < e.gold) return '골드 부족'
  if (e.type === 'payGoldHeal' && run.gold < e.gold) return '골드 부족'
  return null
}

export function EventScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const ev = useMemo(() => rollEvent(), [run])
  const char = getChar(run.charId)
  const [pending, setPending] = useState<EventEffect | null>(null) // 카드 선택 대기
  const [result, setResult] = useState<{
    run: RunState
    relicId?: string
    upgradedCardId?: string
  } | null>(null)

  const choose = (effect: EventEffect) => {
    if (blockedReason(run, effect)) return
    const res = resolveEventEffect(run, effect)
    if (res.needsCardPick) setPending(effect)
    else setResult({ run: res.run, relicId: res.gainedRelicId })
  }
  const pickCard = (id: string) => {
    if (!pending) return
    const res = resolveEventEffect(run, pending, id)
    setResult({ run: res.run, relicId: res.gainedRelicId, upgradedCardId: res.upgradedCardId })
    setPending(null)
  }

  if (result) {
    const relic = result.relicId ? getRelic(result.relicId) : null
    // 강화 결과는 **강화된 카드 앞면 그대로** 보여 준다 — "무엇이 어떻게 됐는지"를
    // 글로 다시 설명하는 것보다 카드를 보여 주는 쪽이 짧고 정확하다.
    const upped = result.upgradedCardId ? runCard(result.run, result.upgradedCardId) : null
    return (
      <div className="screen event">
        <div className="grid-bg" />
        <div className="event__result">
          {upped ? (
            <div className="event__upcard">
              <CardFace card={upped} accent={cardAccent(upped, char.accent)} />
            </div>
          ) : (
            <div className="event__icon">{relic ? relic.icon : '✓'}</div>
          )}
          <div className="event__result-text">
            {upped ? (
              <>
                <b>{upped.name}</b> 강화! <span className="event__result-desc">{upped.upgradeNote}</span>
              </>
            ) : relic ? (
              <>
                <b>{relic.name}</b> 획득! <span className="event__result-desc">{relic.desc}</span>
              </>
            ) : (
              '처리되었습니다.'
            )}
          </div>
          <button className="btn event__continue" onClick={() => onDone(advanceFloor(result.run))}>
            계속 ▶
          </button>
        </div>
      </div>
    )
  }

  if (pending) {
    const upgrading = isUpgradeEffect(pending)
    // 강화형은 **올릴 수 있는 카드만** 늘어놓는다. 최대 강화에 도달했거나 올릴 게
    // 없는 카드(쿨 0짜리 기본 이동)를 골라서 아무 일도 안 일어나면 대가만 날아간다.
    const list = upgrading ? upgradableDeckCards(run) : run.deck
    return (
      <div className="screen event">
        <div className="grid-bg" />
        <h2 className="event__title">{upgrading ? '벼릴 카드를 고르세요' : '녹일 카드를 고르세요'}</h2>
        <div className="reward__deck">
          {list.map((id, i) => {
            const base = resolveRunCard(run.charId, id)
            if (!base) return null
            // 강화형이면 고르기 전에 **강화 후 모습**을 보여 준다.
            const c = upgrading && canUpgradeCard(run, id)
              ? upgradedCard(base, cardLevel(run, id) + 1)
              : (runCard(run, id) ?? base)
            return (
              <button
                key={`${id}-${i}`}
                className="reward__card"
                style={{ ['--accent' as string]: cardAccent(c, char.accent) }}
                onClick={() => pickCard(id)}
                title={upgrading ? upgradePreview(base, cardLevel(run, id)) : undefined}
              >
                <CardFace card={c} accent={cardAccent(c, char.accent)} compact />
              </button>
            )
          })}
        </div>
        <button className="btn btn--ghost" onClick={() => setPending(null)}>
          취소
        </button>
      </div>
    )
  }

  return (
    <div className="screen event">
      <div className="grid-bg" />
      <div className="event__topbar">
        <RunBar run={run} />
      </div>
      <div className="event__body">
        <div className="event__icon">{ev.icon}</div>
        <h2 className="event__name">{ev.name}</h2>
        <p className="event__desc">{ev.desc}</p>
        <div className="event__options">
          {ev.options.map((o, i) => {
            const blocked = blockedReason(run, o.effect)
            return (
              <button
                key={i}
                className={`btn event__opt ${blocked ? 'is-disabled' : ''}`}
                disabled={!!blocked}
                onClick={() => choose(o.effect)}
              >
                {o.label}
                {blocked && <span className="event__opt-why"> — {blocked}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
