// ---------------------------------------------------------------------------
// 덱에서 카드 한 장을 고르는 목록 — **버릴 카드**(보상·상점 교체)와 **녹일 카드**
// (이벤트)가 공유한다. 세 화면이 같은 목록을 각자 그리고 있었는데, 잠긴 카드 규칙이
// 생기면서 한 곳만 빠뜨리면 그리로 이동 카드가 새어 나가므로 하나로 모았다.
//
// ⚠ 잠긴 카드에 `disabled`를 걸지 않는다 — `disabled` 버튼은 포인터 이벤트를 아예
// 안 받아서 **꾹 눌러 읽을 수조차 없어진다**(손패와 같은 이유, CLAUDE.md "카드 UI").
// 왜 못 고르는지가 가장 궁금한 카드가 바로 이 카드다.
// ---------------------------------------------------------------------------
import { getChar } from '../data/roster'
import { isLockedCard } from '../game/run'
import { resolveRunCard } from '../game/runcards'
import { CardFace, cardAccent } from './CardFace'
import type { useCardZoom } from './CardDetail'
import type { CardDef } from '../battle/types'

export function DeckPicker({
  charId,
  deck,
  zoom,
  onPick,
  cardOf,
  titleOf,
}: {
  charId: string
  deck: string[]
  zoom: ReturnType<typeof useCardZoom>
  onPick: (cardId: string) => void
  /**
   * 카드 id → 실제로 덱에 든 카드 정의. 런에서는 **강화가 얹힌 사본**(`runCard`)을
   * 넘겨야 목록이 판과 같은 수치를 보여 준다 — 안 넘기면 원본으로 떨어진다.
   * 런 밖(도감·덱 빌더)에서는 강화 개념이 없으므로 기본값이 맞다.
   */
  cardOf?: (cardId: string) => CardDef | undefined
  /** 칸에 얹을 툴팁(강화 이벤트가 "무엇이 오르는지"를 고르기 전에 알려 준다). */
  titleOf?: (cardId: string) => string | undefined
}) {
  const char = getChar(charId)
  const resolve = cardOf ?? ((id: string) => resolveRunCard(charId, id))
  return (
    <div className="reward__deck">
      {deck.map((id, i) => {
        const c = resolve(id)
        if (!c) return null
        const locked = isLockedCard(id)
        return (
          <button
            key={`${id}-${i}`}
            className={`reward__card${locked ? ' is-locked' : ''}`}
            style={{ ['--accent' as string]: cardAccent(c, char.accent) }}
            aria-disabled={locked || undefined}
            title={
              locked ? '고정 카드 — 뺄 수 없습니다' : (titleOf?.(id) ?? '꾹 누르면 자세히')
            }
            {...zoom.bind(c)}
            onClick={() => {
              if (zoom.consumedClick() || locked) return
              onPick(id)
            }}
          >
            <CardFace card={c} accent={cardAccent(c, char.accent)} compact />
            {locked && <span className="reward__lock">🔒</span>}
          </button>
        )
      })}
    </div>
  )
}
