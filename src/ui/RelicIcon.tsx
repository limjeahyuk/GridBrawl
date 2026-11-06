import { useState, type CSSProperties } from 'react'
import { FOE_ATLAS, RELIC_ATLAS } from '../art/relicAtlas'
import { getRelic, type Rarity } from '../game/relics'

/** 아틀라스 한 칸 = 원본 16px(mini) · 26px(full). 정수 배율만 쓴다. */
const MINI = 32

export const RARITY_LABEL: Record<Rarity, string> = {
  common: '일반',
  rare: '희귀',
  epic: '영웅',
  legend: '전설',
}

/**
 * 유물 그림 하나. `size`가 32면 작은 아틀라스, 52·78이면 큰 아틀라스를 쓴다.
 * `hidden`이면 검은 실루엣(도감의 미발견). 아틀라스에 없는 id는 옛 이모지로 떨어진다.
 */
export function RelicIcon({
  id,
  size = MINI,
  hidden,
  className = '',
  style,
}: {
  id: string
  size?: 32 | 52 | 78
  hidden?: boolean
  className?: string
  style?: CSSProperties
}) {
  const at = RELIC_ATLAS[id]
  if (!at) return <span className={`rl rl--emoji ${className}`}>{getRelic(id)?.icon}</span>
  const kind = size === MINI ? 'mini' : 'full'
  return (
    <span
      className={`rl ${className}`}
      aria-hidden="true"
      style={{
        ...style,
        width: size,
        height: size,
        backgroundImage: `url(/redesign/ui/relics/atlas-${hidden ? 'silhouette-' : ''}${kind}.png)`,
        backgroundSize: `${size * 10}px ${size * 10}px`,
        backgroundPosition: `${-at[0] * size}px ${-at[1] * size}px`,
      }}
    />
  )
}

/** 적 능력·보스 유물 그림. 아틀라스가 가로 한 줄이다. */
export function FoeIcon({
  id,
  size = MINI,
  className = '',
}: {
  id: string
  size?: 32 | 52 | 78
  className?: string
}) {
  const col = FOE_ATLAS[id]?.col ?? FOE_ATLAS.unknown.col
  const cols = Object.keys(FOE_ATLAS).length
  return (
    <span
      className={`rl ${className}`}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(/redesign/ui/relics/atlas-foe-${size === MINI ? 'mini' : 'full'}.png)`,
        backgroundSize: `${size * cols}px ${size}px`,
        backgroundPosition: `${-col * size}px 0`,
      }}
    />
  )
}

/**
 * 유물을 격자로 늘어놓고, 누르면 아래에 이름·설명이 뜬다. 지도와 공용 런 바가 쓴다.
 * 금색 테두리 = 전투 밖에서만 듣는 런 효과(전투 줄에는 안 나온다).
 */
export function RelicGrid({ ids }: { ids: string[] }) {
  const [sel, setSel] = useState<string | null>(null)
  const relic = sel ? getRelic(sel) : undefined
  return (
    <>
      <div className="relicgrid">
        {ids.map((id, i) => {
          const r = getRelic(id)
          return (
            <button
              key={`${id}-${i}`}
              type="button"
              className={`relicbtn ${RELIC_ATLAS[id]?.[2] === 'u' ? 'relicbtn--run' : ''} ${sel === id ? 'is-on' : ''}`}
              title={r ? `${r.name} — ${r.desc}` : id}
              aria-label={r?.name ?? id}
              onClick={() => setSel(sel === id ? null : id)}
            >
              <RelicIcon id={id} />
            </button>
          )
        })}
      </div>
      {relic && (
        <p className="relicgrid__tip">
          <b>{relic.name}</b> {relic.desc}
        </p>
      )}
    </>
  )
}
