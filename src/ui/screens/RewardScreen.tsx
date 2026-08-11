// 승리 보상 — 6장 중 1택(아주 낮은 확률로 유물 포함). 또는 회복하고 지나가기.
// 덱이 꽉 찬 상태로 카드를 받으면 버릴 카드를 고른다.
//
// 이미 가진 카드는 **강화**로 나온다(2026-08-08) — 카드 앞면을 강화 후 모습으로
// 그리고 "강화" 리본을 붙인다. 더 올릴 게 없는 카드는 애초에 풀에서 빠지므로
// (`cardRewardPool`) 여기서 "아무 일도 안 하는 칸"은 나오지 않는다.
import { useMemo, useState } from 'react'
import { getChar } from '../../data/roster'
import { getRelic } from '../../game/relics'
import { upgradedCard } from '../../game/upgrades'
import { resolveRunCard } from '../../game/runcards'
import {
  advanceFloor, cardLevel, grantCard, grantRelic, rollRewards, runCard, skipRewardForHeal,
  SKIP_HEAL, type Reward, type RunState,
} from '../../game/run'
import { CardFace, cardAccent } from '../CardFace'
import { useCardZoom } from '../CardDetail'
import { DeckPicker } from '../DeckPicker'


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
        {/* 강화가 얹힌 사본을 넘긴다 — 안 넘기면 목록만 원본 수치를 보여 준다 */}
        <DeckPicker
          charId={run.charId}
          deck={run.deck}
          zoom={zoom}
          onPick={confirmReplace}
          cardOf={(id) => runCard(run, id)}
        />
        <button className="btn btn--ghost" onClick={() => setReplaceCard(null)}>
          취소
        </button>
        {zoom.sheet}
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
          const base = resolveRunCard(run.charId, r.cardId)
          if (!base) return null
          // 이미 덱에 있으면 이 칸은 "새 카드"가 아니라 "강화"다 — 받은 뒤의 모습을
          // 그대로 보여 준다. 무엇이 오르는지는 카드 앞면의 ⬆ 줄이 말해 준다.
          const owned = run.deck.includes(r.cardId)
          const c = owned ? upgradedCard(base, cardLevel(run, r.cardId) + 1) : base
          return (
            <button
              key={i}
              className={`reward__opt reward__card ${owned ? 'reward__card--upgrade' : ''}`}
              style={{ ['--accent' as string]: cardAccent(c, char.accent) }}
              {...zoom.bind(c)}
              onClick={() => {
                if (zoom.consumedClick()) return
                take(r)
              }}
            >
              {owned && <span className="reward__uptag">강화</span>}
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
