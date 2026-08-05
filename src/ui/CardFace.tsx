import type { CardDef } from '../battle/types'
import { abilityList, cardCost, primaryStat } from './cardAbility'

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

/** 이동 카드의 화살표(대시는 두 개). 전투 화면의 작은 이동 칩도 이걸 쓴다. */
export function moveIcon(dir: CardDef['dir'], steps: number): string {
  const one = MOVE_ARROW[dir ?? 'right'] ?? '▶'
  return steps >= 2 ? one + one : one
}

/** 특수 능력 요약 태그(설명이 붙는 큰 카드용). 아이콘·뜻은 `cardAbility.ts`. */
export function abilityTags(c: CardDef): string[] {
  return abilityList(c).map((a) => a.label)
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

/** 종류 아이콘 — 카드가 무엇인지 한 글자로. */
export function kindIcon(card: CardDef): string {
  return card.kind === 'attack'
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
}

/**
 * 카드 한 장의 앞면. 기본은 설명까지 보여주는 "읽는" 카드(덱 빌더·도감)이고,
 * `compact`를 주면 전투용이다.
 *
 * ⚠ **압축 카드는 2026-08-05에 다시 짰다**(신고: "가독성이 정말 최악입니다").
 * 전엔 104px 폭에 이름 + `⚔14 ↦1 ⚡10` + 사거리표 + `넉백1` 칩을 전부 우겨넣어,
 * 무엇이 중요한 값인지 읽히지 않고 능력은 **뜻을 알 방법조차 없었다**. 이제
 * 압축 카드에는 **이름 · 큰 수치 하나 · 기력 · 능력 아이콘 · 사거리**만 남기고,
 * 자세한 건 **꾹 눌러 여는 상세 카드**(`CardDetail`)가 맡는다.
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
  const icon = kindIcon(card)
  const tags = abilityTags(card)

  // ---- 전투용 압축 카드 ----------------------------------------------------
  if (compact) {
    const stat = primaryStat(card)
    const cost = cardCost(card)
    const abils = abilityList(card)
    return (
      <div
        className={`cardface cardface--compact cardface--${card.kind}`}
        style={{ ['--accent' as string]: accent }}
      >
        <div className="cf__head">
          <span className="cf__kind">{icon}</span>
          <span className="cf__name">{card.name}</span>
          {card.signature && <span className="cf__sig">SP</span>}
        </div>
        {card.kind === 'move' ? (
          <div className="cf__moveart">{icon}</div>
        ) : (
          stat && (
            <div className="cf__stat">
              <b>{stat.value}</b>
              <span>{stat.unit}</span>
            </div>
          )
        )}
        {card.kind === 'attack' && <RangeChart card={card} />}
        <div className="cf__foot">
          {cost > 0 && <span className="cf__cost">⚡{cost}</span>}
          {(card.cooldown ?? 0) > 0 && <span className="cf__cd">쿨{card.cooldown}</span>}
          {abils.length > 0 && (
            <span className="cf__abils">
              {abils.map((a) => (
                <i key={a.label} className={a.bad ? 'is-bad' : ''}>
                  {a.icon}
                </i>
              ))}
            </span>
          )}
        </div>
      </div>
    )
  }

  // ---- 읽는 카드(덱 빌더·도감·상점) ---------------------------------------
  return (
    <div
      className={`cardface cardface--${card.kind} ${tags.length > 0 ? 'cardface--tagged' : ''}`}
      style={{ ['--accent' as string]: accent }}
    >
      <div className="cardface__top">
        <span className="cardface__icon">{icon}</span>
        {card.signature && <span className="cardface__sig">SP</span>}
        {(card.cooldown ?? 0) > 0 && <span className="cardface__cd">CD{card.cooldown}</span>}
      </div>
      <div className="cardface__name">{card.name}</div>
      <p className="cardface__desc">{card.desc}</p>
      {card.kind === 'attack' && <RangeChart card={card} />}
      {/* ⚠ 수치는 **말로** 적는다(2026-08-05). 전엔 `⚔14 ↦1 ⚡10`처럼 기호만
          늘어놓아서, 무엇이 피해고 무엇이 기력인지 배우기 전엔 못 읽었다.
          사거리(↦)는 바로 위 범위표가 이미 보여 주므로 아예 뺐다. */}
      {card.kind === 'attack' && (
        <div className="cardface__meta">
          <span>피해 {card.damage}</span>
          <span>기력 {card.energyCost}</span>
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
          <span>기력 {card.guardCost}</span>
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
          <span>기력 {card.healCost}</span>
        </div>
      )}
      {card.kind === 'buff' && (
        <div className="cardface__meta">
          <span>{BUFF_LABEL[card.buff ?? 'atkUp'](card.buffPower ?? 0)}</span>
          <span>{card.buffTurns}턴</span>
          <span>기력 {card.buffCost}</span>
        </div>
      )}
    </div>
  )
}
