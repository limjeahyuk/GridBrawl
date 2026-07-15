import type { CardDef } from '../battle/types'

/** Accent colour for a card by kind (attacks keep their signature accent). */
export function cardAccent(c: CardDef, fallback: string): string {
  if (c.kind === 'attack') return c.accent ?? fallback
  if (c.kind === 'guard') return '#9fc2ff'
  if (c.kind === 'energy') return '#ffe14d'
  return '#8493bd'
}

function moveIcon(dir: CardDef['dir'], steps: number): string {
  const one = dir === 'right' ? '▶' : dir === 'left' ? '◀' : dir === 'up' ? '▲' : '▼'
  return steps >= 2 ? one + one : one
}

/** 특수 능력 요약 태그(카드 하단 칩). 능력이 없는 카드는 빈 배열. */
export function abilityTags(c: CardDef): string[] {
  const t: string[] = []
  if (c.pierce) t.push('관통')
  if (c.drain) t.push(`기력흡수${c.drain}`)
  if (c.leech) t.push(`흡혈${c.leech}`)
  if (c.push) t.push(`넉백${c.push}`)
  if (c.selfShield) t.push(`방벽+${c.selfShield}`)
  if (c.recoil) t.push(`반동${c.recoil}`)
  return t
}

/** Compact range chart, like the reference 3x3: center = attacker. "Forward" is
 *  always to the right (the local fighter always faces right on screen).
 *  앞뒤 대칭 공격이 기본이 되면서 창을 -3..3으로 넓혔다. */
export function RangeChart({ card }: { card: CardDef }) {
  const cols = [-3, -2, -1, 0, 1, 2, 3] // back..forward window
  const rows = [1, 0, -1] // up..down
  const hit = (df: number, du: number) =>
    (card.range ?? []).some((o) => o.df === df && o.du === du)
  return (
    <div className="rangechart">
      {rows.map((du) =>
        cols.map((df) => {
          const self = df === 0 && du === 0
          const on = hit(df, du)
          return <span key={`${df},${du}`} className={`rc ${self ? 'rc--self' : on ? 'rc--on' : ''}`} />
        }),
      )}
    </div>
  )
}

export function CardFace({ card, accent }: { card: CardDef; accent: string }) {
  const icon =
    card.kind === 'attack'
      ? '⚔'
      : card.kind === 'guard'
        ? '🛡'
        : card.kind === 'energy'
          ? '⚡'
          : moveIcon(card.dir, card.steps ?? 1)
  const reach =
    card.kind === 'attack' ? Math.max(0, ...(card.range ?? []).map((o) => o.df)) : 0
  return (
    <div className={`cardface cardface--${card.kind}`} style={{ ['--accent' as string]: accent }}>
      <div className="cardface__top">
        <span className="cardface__icon">{icon}</span>
        {card.signature && <span className="cardface__sig">SP</span>}
        {(card.cooldown ?? 0) > 0 && <span className="cardface__cd">CD{card.cooldown}</span>}
      </div>
      <div className="cardface__name">{card.name}</div>
      {card.kind === 'attack' && (
        <>
          <RangeChart card={card} />
          <div className="cardface__meta">
            <span>⚔{card.damage}</span>
            <span>↦{reach}</span>
            <span>⚡{card.energyCost}</span>
            {abilityTags(card).map((t) => (
              <span key={t} className="cardface__tag">
                {t}
              </span>
            ))}
          </div>
        </>
      )}
      {card.kind === 'guard' && (
        <div className="cardface__meta">
          <span>방어 {card.block}</span>
          <span>⚡{card.guardCost}</span>
        </div>
      )}
      {card.kind === 'energy' && (
        <div className="cardface__meta">
          <span>기력 +{card.gain}</span>
        </div>
      )}
      {card.kind === 'move' && <div className="cardface__meta cardface__meta--move"><span>{card.desc}</span></div>}
    </div>
  )
}
