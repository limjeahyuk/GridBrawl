import { useState } from 'react'
import { ROSTER, type CharacterDef } from '../../data/roster'
import { PortraitSvg } from '../PortraitSvg'

const clamp01 = (v: number) => Math.max(0.08, Math.min(1, v))

function statBars(c: CharacterDef) {
  const dmg = Math.max(...c.attacks.map((a) => a.damage ?? 0))
  const reach = Math.max(...c.attacks.flatMap((a) => (a.range ?? []).map((o) => o.df)))
  return [
    { label: 'HEALTH', v: clamp01((c.maxHp - 96) / 50) },
    { label: 'POWER', v: clamp01((dmg - 16) / 40) },
    { label: 'RANGE', v: clamp01((reach - 1) / 4) },
    { label: 'ENERGY', v: clamp01((c.startEnergy - 38) / 18) },
  ]
}

export function CharacterSelect({
  onConfirm,
  onBack,
}: {
  onConfirm: (id: string) => void
  onBack: () => void
}) {
  const [sel, setSel] = useState<CharacterDef>(ROSTER[0])
  const bars = statBars(sel)

  return (
    <div className="screen select">
      <div className="grid-bg" />
      <div className="select__header">
        <button className="btn btn--ghost select__back" onClick={onBack}>
          ◀ 뒤로
        </button>
        <h2 className="neon-text">아바타 선택</h2>
        <div style={{ width: 90 }} />
      </div>

      <div className="select__body">
        <div className="select__grid">
          {ROSTER.map((c) => (
            <button
              key={c.id}
              className={`avatar-card ${sel.id === c.id ? 'is-active' : ''}`}
              style={{ ['--accent' as string]: c.accent }}
              onClick={() => setSel(c)}
              onDoubleClick={() => onConfirm(c.id)}
            >
              <PortraitSvg char={c} className="avatar-card__art" />
              <span className="avatar-card__name">{c.name}</span>
            </button>
          ))}
        </div>

        <div className="select__detail" style={{ ['--accent' as string]: sel.accent }}>
          <PortraitSvg char={sel} className="detail__portrait" />
          <div className="detail__info">
            <div className="detail__name neon-text">{sel.name}</div>
            <div className="detail__title">{sel.title}</div>
            <p className="detail__desc">{sel.description}</p>
            <div className="detail__passive">
              <span className="detail__passive-tag">패시브</span>
              <span className="detail__passive-text">{sel.passive.desc}</span>
            </div>
            <div className="detail__stats">
              {bars.map((b) => (
                <div className="stat" key={b.label}>
                  <span className="stat__label">{b.label}</span>
                  <span className="stat__track">
                    <span className="stat__fill" style={{ width: `${b.v * 100}%` }} />
                  </span>
                </div>
              ))}
            </div>
            <button className="btn detail__confirm" onClick={() => onConfirm(sel.id)}>
              이 아바타로 출전
            </button>
          </div>
        </div>
      </div>
      <div className="scanlines" />
    </div>
  )
}
