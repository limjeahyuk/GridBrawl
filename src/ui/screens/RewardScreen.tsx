// 승리 보상 — 5장 중 1택(아주 낮은 확률로 유물 포함). 또는 회복하고 지나가기.
// 덱이 꽉 찬 상태로 카드를 받으면 버릴 카드를 고른다.
import { useMemo, useState } from 'react'
import { getChar } from '../../data/roster'
import { getRelic } from '../../game/relics'
import { resolveRunCard } from '../../game/runcards'
import {
  advanceFloor, grantCard, grantRelic, rollRewards, skipRewardForHeal,
  SKIP_HEAL, type Reward, type RunState,
} from '../../game/run'
import { CardFace, cardAccent } from '../CardFace'
import { useCardZoom } from '../CardDetail'


export function RewardScreen({
  run,
  onDone,
}: {
  run: RunState
  onDone: (next: RunState) => void
}) {
  const rewards = useMemo(() => rollRewards(run), [run])
  const char = getChar(run.charId)
  // 꾹 누르면 카드 상세(설명·능력의 뜻)가 열린다 — 압축 카드에는 설명이 없다.
  const zoom = useCardZoom(char.accent)
  // 덱이 꽉 차 교체가 필요할 때 추가하려는 카드 id
  const [replaceCard, setReplaceCard] = useState<string | null>(null)

  const take = (r: Reward) => {
    if (r.kind === 'relic') {
      onDone(advanceFloor(grantRelic(run, r.relicId)))
      return
    }
    const res = grantCard(run, r.cardId)
    if (res.needsReplace) setReplaceCard(r.cardId)
    else onDone(advanceFloor(res.run))
  }
  const confirmReplace = (removeId: string) => {
    if (!replaceCard) return
    onDone(advanceFloor(grantCard(run, replaceCard, removeId).run))
  }

  if (replaceCard) {
    return (
      <div className="screen reward">
        <div className="grid-bg" />
        <h2 className="reward__title">덱이 가득 찼습니다 — 버릴 카드를 고르세요</h2>
        <div className="reward__deck">
          {run.deck.map((id, i) => {
            const c = resolveRunCard(run.charId, id)
            if (!c) return null
            return (
              <button
                key={`${id}-${i}`}
                className="reward__card"
                style={{ ['--accent' as string]: cardAccent(c, char.accent) }}
                {...zoom.bind(c)}
                title="꾹 누르면 자세히"
                onClick={() => {
                  if (zoom.consumedClick()) return
                  confirmReplace(id)
                }}
              >
                <CardFace card={c} accent={cardAccent(c, char.accent)} compact />
              </button>
            )
          })}
        </div>
        <button className="btn btn--ghost" onClick={() => setReplaceCard(null)}>
          취소
        </button>
      </div>
    )
  }

  return (
    <div className="screen reward">
      <div className="grid-bg" />
      <h2 className="reward__title">승리 보상 — 하나를 고르세요</h2>
      {/* 압축 카드에는 설명이 없다 — 어디서 읽는지 한 번은 말해 줘야 한다.
          모바일엔 툴팁이 없어서 `title` 속성만으로는 영영 안 보인다. */}
      <p className="reward__hint">카드를 꾹 누르면 설명과 능력을 자세히 볼 수 있습니다.</p>
      <div className="reward__options">
        {rewards.map((r, i) => {
          if (r.kind === 'relic') {
            const relic = getRelic(r.relicId)
            return (
              <button key={i} className="reward__opt reward__opt--relic" onClick={() => take(r)}>
                <div className="reward__relic-icon">{relic?.icon}</div>
                <div className="reward__relic-name">{relic?.name}</div>
                <div className="reward__relic-desc">{relic?.desc}</div>
                <div className="reward__relic-tag">유물</div>
              </button>
            )
          }
          const c = resolveRunCard(run.charId, r.cardId)
          if (!c) return null
          return (
            <button
              key={i}
              className="reward__opt reward__card"
              style={{ ['--accent' as string]: cardAccent(c, char.accent) }}
              {...zoom.bind(c)}
              onClick={() => {
                if (zoom.consumedClick()) return
                take(r)
              }}
            >
              <CardFace card={c} accent={cardAccent(c, char.accent)} compact />
            </button>
          )
        })}
      </div>
      <button className="btn btn--ghost reward__skip" onClick={() => onDone(skipRewardForHeal(run))}>
        건너뛰고 회복 (+{SKIP_HEAL} HP)
      </button>
      {zoom.sheet}
    </div>
  )
}
