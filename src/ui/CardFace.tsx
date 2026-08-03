import type { CardDef } from '../battle/types'

/** Accent colour for a card by kind (attacks keep their signature accent). */
export function cardAccent(c: CardDef, fallback: string): string {
  if (c.kind === 'attack') return c.accent ?? fallback
  if (c.kind === 'guard') return '#9fc2ff'
  if (c.kind === 'energy') return '#ffe14d'
  if (c.kind === 'heal') return '#3fca87'
  if (c.kind === 'buff') return c.accent ?? '#e0a94a'
  return '#8493bd'
}

const MOVE_ARROW: Record<string, string> = {
  right: '▶',
  left: '◀',
  up: '▲',
  down: '▼',
  'up-right': '↗',
  'up-left': '↖',
  'down-right': '↘',
  'down-left': '↙',
}

/** 버프 종류별 아이콘·표기. 셋의 성격이 완전히 달라 한눈에 갈려야 한다. */
const BUFF_ICON: Record<string, string> = { atkUp: '🔺', defUp: '🔷', freeCast: '🌀' }
const BUFF_LABEL: Record<string, (n: number) => string> = {
  atkUp: (n) => `공격 +${n}`,
  defUp: (n) => `받는 피해 -${n}`,
  freeCast: () => '기력 소모 0',
}

function moveIcon(dir: CardDef['dir'], steps: number): string {
  const one = MOVE_ARROW[dir ?? 'right'] ?? '▶'
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
  if (c.stun) t.push(`기절${c.stun}턴`)
  if (c.pull) t.push(`끌기${c.pull}`)
  if (c.empower) t.push(`각성+${c.empower}`)
  if (c.poison) t.push(`독${c.poison}`)
  if (c.burn) t.push(`화상${c.burn}`)
  if (c.freeze) t.push(`빙결${c.freeze}턴`)
  // 쏘면서 움직이는 카드 — 앞뒤 어느 쪽으로 몇 칸인지가 카드의 정체다
  if (c.dashForward) t.push(c.dashForward > 0 ? `전진${c.dashForward}` : `후퇴${-c.dashForward}`)
  // 겹친 상대를 못 때리는 원거리 카드만 따로 알려준다(대부분의 카드는 때릴 수 있다)
  if (c.kind === 'attack' && c.pointBlank === false) t.push('밀착사각')
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
          // 가운데 칸(=내가 선 칸)도 사거리다 — 겹쳐 선 상대는 `pointBlank`로
          // 판정하므로, 맞힐 수 있는 카드면 그 사실이 보여야 한다(밀착사각 카드만 예외).
          const pb = self && card.kind === 'attack' && card.pointBlank !== false
          return (
            <span
              key={`${df},${du}`}
              className={`rc ${self ? 'rc--self' : on ? 'rc--on' : ''}${pb ? ' rc--pb' : ''}`}
            />
          )
        }),
      )}
    </div>
  )
}

/**
 * 카드 한 장의 앞면. 기본은 설명까지 보여주는 "읽는" 카드(덱 빌더·도감)이고,
 * `compact`를 주면 전투용 — **이름 · 수치(기력/데미지) · 사거리**만 남긴다.
 * 전투 중엔 설명을 읽을 새가 없고, 카드를 크게 키워 고르기 쉬운 게 우선.
 */
export function CardFace({
  card,
  accent,
  compact,
}: {
  card: CardDef
  accent: string
  compact?: boolean
}) {
  const icon =
    card.kind === 'attack'
      ? '⚔'
      : card.kind === 'guard'
        ? '🛡'
        : card.kind === 'energy'
          ? '⚡'
          : card.kind === 'heal'
            ? '✚'
            : card.kind === 'buff'
              ? BUFF_ICON[card.buff ?? 'atkUp']
              : moveIcon(card.dir, card.steps ?? 1)
  const reach =
    card.kind === 'attack' ? Math.max(0, ...(card.range ?? []).map((o) => o.df)) : 0
  // 능력 칩이 있으면 수치줄이 한 줄 더 차지 → 설명을 한 줄 줄여 잘리지 않게
  const tags = abilityTags(card)
  return (
    <div
      className={`cardface cardface--${card.kind} ${tags.length > 0 ? 'cardface--tagged' : ''} ${
        compact ? 'cardface--compact' : ''
      }`}
      style={{ ['--accent' as string]: accent }}
    >
      {/* 압축 카드에선 종류 아이콘을 우상단 구석으로 뺀다 — 주역은 이름·수치·범위.
          단 이동 카드는 화살표 자체가 내용이라 본문에 크게 넣는다(아래). */}
      <div className="cardface__top">
        {!(compact && card.kind === 'move') && <span className="cardface__icon">{icon}</span>}
        {card.signature && <span className="cardface__sig">SP</span>}
        {(card.cooldown ?? 0) > 0 && <span className="cardface__cd">CD{card.cooldown}</span>}
      </div>
      <div className="cardface__name">{card.name}</div>
      {/* 설명은 카드를 고르며 읽는 화면(덱 빌더·도감)에서만. 전투에선 생략. */}
      {!compact && <p className="cardface__desc">{card.desc}</p>}
      {compact && card.kind === 'move' && <div className="cardface__moveart">{icon}</div>}
      {card.kind === 'attack' && <RangeChart card={card} />}
      {card.kind === 'attack' && (
        <div className="cardface__meta">
          <span>⚔{card.damage}</span>
          <span>↦{reach}</span>
          <span>⚡{card.energyCost}</span>
          {tags.map((t) => (
            <span key={t} className="cardface__tag">
              {t}
            </span>
          ))}
        </div>
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
      {card.kind === 'heal' && (
        <div className="cardface__meta">
          <span>체력 +{card.healHp}</span>
          <span>⚡{card.healCost}</span>
        </div>
      )}
      {card.kind === 'buff' && (
        <div className="cardface__meta">
          <span>{BUFF_LABEL[card.buff ?? 'atkUp'](card.buffPower ?? 0)}</span>
          <span>{card.buffTurns}턴</span>
          <span>⚡{card.buffCost}</span>
        </div>
      )}
    </div>
  )
}
