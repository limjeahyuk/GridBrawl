// 승리 보상 — 6장 중 1택(아주 낮은 확률로 유물 포함). 또는 회복하고 지나가기.
// 덱이 꽉 찬 상태로 카드를 받으면 버릴 카드를 고른다.
//
// 이미 가진 카드는 **강화**로 나온다(2026-08-08) — 카드 앞면을 강화 후 모습으로
// 그리고 "강화" 리본을 붙인다. 더 올릴 게 없는 카드는 애초에 풀에서 빠지므로
// (`cardRewardPool`) 여기서 "아무 일도 안 하는 칸"은 나오지 않는다.
import { useMemo, useState } from 'react'
import { getChar } from '../../data/roster'
import { getRelic } from '../../game/relics'
import { resolveRunCard } from '../../game/runcards'
import {
  advanceFloor, deckCap, goblinItemName, goldForWin, grantCard, grantRelic, GOBLIN_LOOT, healHp, regionOf,
  rollRewards, runCard, sceneFor, skipRewardForHeal, SKIP_HEAL, type Reward, type RunState,
} from '../../game/run'
import { CardFace, cardAccent } from '../CardFace'
import { useCardZoom } from '../CardDetail'
import { DeckPicker } from '../DeckPicker'
import { RelicIcon } from '../RelicIcon'
import { SceneLayers } from '../SceneLayers'


export function RewardScreen({
  run,
  onDone,
}: {
  run: RunState
  onDone: (next: RunState) => void
}) {
  // 고블린을 덮쳐 이겼으면 보상 = **고블린의 짐**(진열품 고르기). 가난한 고블린은
  // 이미 무작위로 하나 받았으므로 고를 게 없다(`applySpecialWin`).
  const goblin = run.special?.kind === 'goblin' ? run.special : null
  const loot = goblin ? GOBLIN_LOOT[goblin.goblinTier ?? 'poor'] : null
  const rewards = useMemo<Reward[]>(() => {
    if (!goblin) return rollRewards(run)
    if (!loot?.pick) return []
    return (goblin.goblinStock ?? [])
      .map((it): Reward =>
        it.kind === 'card' ? { kind: 'card', cardId: it.cardId }
        : it.kind === 'relic' ? { kind: 'relic', relicId: it.relicId }
        : { kind: 'heal', amount: it.amount },
      )
      .filter((r) => r.kind !== 'relic' || !run.relicIds.includes(r.relicId))
  }, [run])
  const wonItem = goblin?.goblinStock?.find((it) => it.id === goblin.wonItemId)
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
    if (r.kind === 'heal') {
      onDone(advanceFloor(healHp(run, r.amount)))
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
      {/* 방금 싸운 지역을 그대로 깔고 어둡게 눌러 둔다(디자인 `Reward`) — 보상은
          전투가 끝난 **그 자리**에서 받는 것이라 화면이 이어져 보여야 한다. */}
      <SceneLayers scene={sceneFor(run)} />
      <div className="screenveil" />
      <header className="reward__head">
        <span className="reward__kicker">
          VICTORY · {regionOf(run.floor) === 'grassland' ? '초원' : '던전'} {run.floor}층
        </span>
        <h1 className="reward__title">{goblin ? '고블린의 짐' : '보상'}</h1>
      </header>
      {/* 골드는 늘 받는다 — 고르기 전에 이미 들어온 몫이라 따로 알려 준다. */}
      <div className="goldbar">
        <i className="coin" aria-hidden />
        <span className="goldbar__n">+{goldForWin(run) + (loot?.gold ?? 0)}</span>
        <span className="goldbar__note">
          {loot ? '돈주머니 포함' : '골드는 늘 받는다'} · 보유 {run.gold}
        </span>
      </div>
      {/* 압축 카드에는 설명이 없다 — 어디서 읽는지 한 번은 말해 줘야 한다.
          모바일엔 툴팁이 없어서 `title` 속성만으로는 영영 안 보인다. */}
      {/* 이벤트 전투의 덤(항아리 뱀 → 독 유물 · 고블린 전리품)은 이미 받은 것이라 알리기만 한다. */}
      <p className="reward__hint">
        {run.special?.wonRelicId && (
          <b className="reward__won">
            <RelicIcon id={run.special.wonRelicId} size={32} />
            {goblin ? '부자 고블린의 금고' : '항아리 뱀을 물리쳤다'} — 「{getRelic(run.special.wonRelicId)?.name}」 획득 ·{' '}
          </b>
        )}
        {wonItem && <b className="reward__won">짐에서 {goblinItemName(run, wonItem)}을(를) 챙겼다 · </b>}
        {goblin ? (rewards.length ? '하나를 고르세요' : '') : '하나를 고르세요 · 카드를 꾹 누르면 자세히 볼 수 있습니다'}
      </p>
      <div className="reward__options">
        {rewards.map((r, i) => {
          if (r.kind === 'heal')
            return (
              <button key={i} className="reward__opt reward__opt--relic" onClick={() => take(r)}>
                <i className="item__potion" aria-hidden />
                <div className="reward__relic-name">물약 · HP +{r.amount}</div>
                <div className="reward__relic-tag">회복</div>
              </button>
            )
          if (r.kind === 'relic') {
            const relic = getRelic(r.relicId)
            return (
              <button key={i} className="reward__opt reward__opt--relic" onClick={() => take(r)}>
                <RelicIcon id={r.relicId} size={78} className="reward__relic-icon" />
                <div className="reward__relic-name">{relic?.name}</div>
                <div className="reward__relic-desc">{relic?.desc}</div>
                <div className="reward__relic-tag">유물</div>
              </button>
            )
          }
          const base = resolveRunCard(run.charId, r.cardId)
          if (!base) return null
          const c = base
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
              {/* 보상 칸은 **설명이 붙는 큰 카드**다(디자인 `Reward`) — 고르기 전에
                  무엇을 하는 카드인지 읽혀야 한다. 꾹 누르면 능력의 뜻까지 열린다. */}
              <CardFace card={c} accent={cardAccent(c, char.accent)} />
            </button>
          )
        })}
      </div>
      <footer className="reward__foot">
        {goblin && !rewards.length ? (
          <button className="btn reward__skip" onClick={() => onDone(advanceFloor(run))}>
            지도로 ▶
          </button>
        ) : (
          <button className="btn btn--ghost reward__skip" onClick={() => onDone(skipRewardForHeal(run))}>
            건너뛰고 체력 회복 (+{SKIP_HEAL} HP)
          </button>
        )}
        <span className="reward__deckcount">
          덱 {run.deck.length} / {deckCap(run)}장
        </span>
      </footer>
      {zoom.sheet}
    </div>
  )
}
