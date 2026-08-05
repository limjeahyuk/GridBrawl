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

export function DeckPicker({
  charId,
  deck,
  zoom,
  onPick,
}: {
  charId: string
  deck: string[]
  zoom: ReturnType<typeof useCardZoom>
  onPick: (cardId: string) => void
}) {
  const char = getChar(charId)
  return (
    <div className="reward__deck">
      {deck.map((id, i) => {
        const c = resolveRunCard(charId, id)
        if (!c) return null
        const locked = isLockedCard(id)
        return (
          <button
            key={`${id}-${i}`}
            className={`reward__card${locked ? ' is-locked' : ''}`}
            style={{ ['--accent' as string]: cardAccent(c, char.accent) }}
            aria-disabled={locked || undefined}
            title={locked ? '고정 카드 — 뺄 수 없습니다' : '꾹 누르면 자세히'}
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
