import { useState } from 'react'
import { ROSTER, type CharacterDef } from '../../data/roster'
import { COMMON_CARDS } from '../../battle/cards'
import { RELICS, type Rarity } from '../../game/relics'
import { RUN_CARDS } from '../../game/runcards'
import { PortraitSvg } from '../PortraitSvg'
import { CardFace, cardAccent } from '../CardFace'
import { statBars } from '../statBars'

const RARITY_LABEL: Record<Rarity, string> = {
  common: '일반',
  rare: '희귀',
  epic: '영웅',
  legend: '전설',
}

/** 도감: 영웅과 각 영웅의 전용 공격 카드 + 공용 카드를 열람하는 화면. */
export function CodexScreen({ onBack }: { onBack: () => void }) {
  const [sel, setSel] = useState<CharacterDef>(ROSTER[0])
  const bars = statBars(sel)

  return (
    <div className="screen select codex">
      <div className="grid-bg" />
      <div className="select__header">
        <button className="btn btn--ghost select__back" onClick={onBack}>
          ◀ 뒤로
        </button>
        <h2 className="neon-text">영웅 도감</h2>
        <div style={{ width: 90 }} />
      </div>

      <div className="codex__body">
        <div className="codex__roster">
          {ROSTER.map((c) => (
            <button
              key={c.id}
              className={`avatar-card ${sel.id === c.id ? 'is-active' : ''}`}
              style={{ ['--accent' as string]: c.accent }}
              onClick={() => setSel(c)}
            >
              <PortraitSvg char={c} className="avatar-card__art" />
              <span className="avatar-card__name">{c.name}</span>
            </button>
          ))}
        </div>

        <div className="codex__detail" style={{ ['--accent' as string]: sel.accent }}>
          <div className="codex__hero">
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
            </div>
          </div>

          <div className="codex__cards">
            <div className="codex__cards-title">기본 공격 (직업별)</div>
            <div className="codex__deck">
              {sel.basics.map((c) => (
                <div className="codex__card" key={c.id}>
                  <CardFace card={c} accent={cardAccent(c, sel.accent)} />
                  <p className="codex__card-desc">{c.desc}</p>
                </div>
              ))}
            </div>

            <div className="codex__cards-title">전용 카드</div>
            <div className="codex__deck">
              {sel.cards.map((c) => (
                <div className="codex__card" key={c.id}>
                  <CardFace card={c} accent={cardAccent(c, sel.accent)} />
                  <p className="codex__card-desc">{c.desc}</p>
                </div>
              ))}
            </div>

            <div className="codex__cards-title">공용 카드</div>
            <div className="codex__deck">
              {COMMON_CARDS.map((c) => (
                <div className="codex__card" key={c.id}>
                  <CardFace card={c} accent={cardAccent(c, sel.accent)} />
                  <p className="codex__card-desc">{c.desc}</p>
                </div>
              ))}
            </div>

            <div className="codex__cards-title">로그라이크 전용 카드 (런 보상·상점)</div>
            <div className="codex__deck">
              {RUN_CARDS.map((c) => (
                <div className="codex__card" key={c.id}>
                  <CardFace card={c} accent={cardAccent(c, sel.accent)} />
                  <p className="codex__card-desc">{c.desc}</p>
                </div>
              ))}
            </div>

            <div className="codex__cards-title">유물 (로그라이크)</div>
            <div className="codex__relics">
              {RELICS.filter((r) => !r.signatureOf).map((r) => (
                <div className={`codex__relic is-${r.rarity}`} key={r.id}>
                  <span className="codex__relic-icon">{r.icon}</span>
                  <b>{r.name}</b>
                  <span className="codex__relic-rarity">{RARITY_LABEL[r.rarity]}</span>
                  <p>{r.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="scanlines" />
    </div>
  )
}
