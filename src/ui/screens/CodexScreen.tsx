import { useMemo, useState } from 'react'
import { ROSTER, type CharacterDef } from '../../data/roster'
import { COMMON_CARDS } from '../../battle/cards'
import { FOE_ATLAS, RELIC_ATLAS } from '../../art/relicAtlas'
import { RELICS, type Rarity } from '../../game/relics'
import { seenFoeAbilities, seenMonsters, seenRelics } from '../../game/progress'
import { MONSTERS, type MonsterDef } from '../../game/monsters'
import { sheetFor } from '../../art/sprites'
import { SpriteClip } from '../SpriteClip'
import { FoeIcon, RARITY_LABEL, RelicIcon } from '../RelicIcon'
import { RUN_CARDS } from '../../game/runcards'
import { PortraitSvg } from '../PortraitSvg'
import { CardFace, cardAccent } from '../CardFace'
import { statBars } from '../statBars'

const KIND_LABEL: Record<string, string> = {
  p: '발동',
  s: '상시',
  c: '누적',
  l: '횟수',
  k: '조건',
  o: '첫 라운드',
  u: '런',
}
const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legend']

/**
 * 유물 도감 — 등급별 격자. 아직 못 얻은 유물은 검은 실루엣 + ???로, 칸을 누르면 위에 설명이
 * 뜬다. 보스 유물은 전투에서 처음 드러난 뒤에 등록된다.
 */
function RelicCodex() {
  const seen = useMemo(() => seenRelics(), [])
  const seenFoe = useMemo(() => [...seenFoeAbilities()].map((k) => k.split(':')[0]), [])
  const [sel, setSel] = useState<string>(RELICS[0].id)
  const bossIds = Object.keys(FOE_ATLAS).filter((id) => id.startsWith('boss-'))
  const relic = RELICS.find((r) => r.id === sel)
  const boss = FOE_ATLAS[sel]
  const known = relic ? seen.has(relic.id) : false
  // 보스 유물은 그 보스의 능력을 하나라도 봤으면 등록된다(`boss-w-*` = 수호기사).
  const bossSeen = (id: string) =>
    seenFoe.includes({ w: 'warden', p: 'pyrelord', o: 'overlord' }[id.split('-')[1]] ?? '')
  const found = RELICS.filter((r) => seen.has(r.id)).length

  return (
    <div className="relicdex">
      <div className="relicdex__sel">
        {relic ? (
          <>
            <RelicIcon id={relic.id} size={78} hidden={!known} />
            <div>
              <div className="relictip__name">
                <b>{known ? relic.name : '???'}</b>
                {known && <span className={`relictip__rarity is-${relic.rarity}`}>{RARITY_LABEL[relic.rarity]}</span>}
              </div>
              <p>{known ? relic.desc : '아직 얻지 못한 유물이다. 처음 얻는 순간 실루엣이 걷힌다.'}</p>
            </div>
          </>
        ) : (
          boss && (
            <>
              <FoeIcon id={bossSeen(sel) ? sel : 'unknown'} size={78} />
              <div>
                <div className="relictip__name">
                  <b>{bossSeen(sel) ? boss.name : '???'}</b>
                  <span className="relictip__rarity is-boss">보스</span>
                </div>
                <p>{bossSeen(sel) ? boss.desc : '보스와 싸우며 드러나면 등록된다.'}</p>
              </div>
            </>
          )
        )}
        <span className="relicdex__count">
          발견 {found} / {RELICS.length}
        </span>
      </div>
      {RARITIES.map((rar) => {
        const list = RELICS.filter((r) => r.rarity === rar)
        return (
          <section key={rar} className={`relicdex__group is-${rar}`}>
            <h3>
              {RARITY_LABEL[rar]} <span>{list.length}</span>
            </h3>
            <div className="relicdex__grid">
              {list.map((r) => {
                const on = seen.has(r.id)
                return (
                  <button
                    key={r.id}
                    className={`relicdex__cell ${sel === r.id ? 'is-on' : ''}`}
                    aria-label={on ? r.name : '미발견 유물'}
                    onClick={() => setSel(r.id)}
                  >
                    <RelicIcon id={r.id} size={52} hidden={!on} />
                    <span className="relicdex__name">{on ? r.name : '???'}</span>
                    <span className="relicdex__kind">{KIND_LABEL[RELIC_ATLAS[r.id]?.[2] ?? 'p']}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
      <section className="relicdex__group is-boss">
        <h3>
          보스 <span>{bossIds.length}</span>
        </h3>
        <div className="relicdex__grid">
          {bossIds.map((id) => (
            <button
              key={id}
              className={`relicdex__cell ${sel === id ? 'is-on' : ''}`}
              aria-label={bossSeen(id) ? FOE_ATLAS[id].name : '미발견 유물'}
              onClick={() => setSel(id)}
            >
              <FoeIcon id={bossSeen(id) ? id : 'unknown'} size={52} />
              <span className="relicdex__name">{bossSeen(id) ? FOE_ATLAS[id].name : '???'}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

/**
 * 몬스터 도감(2026-11 · 시안 Codex.dc.html) — 지역별 격자. 못 만난 몬스터는 **검은 실루엣 + ???**.
 * 만남 기록은 기기 로컬(`gb-monsters-seen`, 런 전투에 들어갈 때 등록).
 */
const MON_GROUPS: { label: string; cls: string; of: (m: MonsterDef) => boolean }[] = [
  { label: '초원', cls: 'is-field', of: (m) => m.tier === 1 || m.tier === 2 },
  { label: '던전', cls: 'is-dungeon', of: (m) => m.tier === 3 },
  { label: '보스 · 엘리트', cls: 'is-boss', of: (m) => m.tier === 4 },
  { label: '? 칸', cls: 'is-unknown', of: (m) => m.tier === 0 },
]
function MonsterCodex() {
  const seen = useMemo(() => seenMonsters(), [])
  const [sel, setSel] = useState<MonsterDef>(MONSTERS[0])
  const known = seen.has(sel.id)
  const sheet = sheetFor(sel.spriteId ?? '')
  return (
    <div className="relicdex mondex">
      <div className="relicdex__sel mondex__sel">
        <div className={`mondex__art ${known ? '' : 'is-sil'}`}>{sheet && <SpriteClip sheet={sheet} clip="idle" scale={Math.min(sheet.scale, Math.max(1, Math.floor(110 / sheet.frameH)))} />}</div>
        <div>
          <b className="relicdex__name">{known ? sel.name : '???'}</b>
          <p>{known ? sel.note : '아직 만나지 못한 적. 런에서 마주치면 모습이 드러난다.'}</p>
          {known && (
            <p className="mondex__stat">
              체력 {sel.maxHp} · 시작 기력 {sel.startEnergy}
            </p>
          )}
        </div>
        <span className="relicdex__count">
          {MONSTERS.filter((m) => seen.has(m.id)).length} / {MONSTERS.length}종
        </span>
      </div>
      {MON_GROUPS.map((g) => {
        const list = MONSTERS.filter(g.of)
        return (
          <section key={g.label} className={`relicdex__group ${g.cls}`}>
            <h3>
              {g.label} <span>{list.length}</span>
            </h3>
            <div className="relicdex__grid mondex__grid">
              {list.map((m) => {
                const sh = sheetFor(m.spriteId ?? '')
                const k = seen.has(m.id)
                return (
                  <button
                    key={m.id}
                    className={`relicdex__cell mondex__cell ${sel.id === m.id ? 'is-on' : ''}`}
                    aria-label={k ? m.name : '미발견 몬스터'}
                    onClick={() => setSel(m)}
                  >
                    <span className={`mondex__thumb ${k ? '' : 'is-sil'}`}>
                      {sh && <SpriteClip sheet={sh} clip="idle" scale={1} />}
                    </span>
                    <span className="relicdex__name">{k ? m.name : '???'}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** 도감: 영웅과 각 영웅의 전용 공격 카드 + 공용 카드를 열람하는 화면. */
export function CodexScreen({ onBack }: { onBack: () => void }) {
  const [sel, setSel] = useState<CharacterDef>(ROSTER[0])
  const [tab, setTab] = useState<'hero' | 'monster' | 'relic'>('hero')
  const bars = statBars(sel)

  return (
    <div className="screen select codex">
      <div className="grid-bg" />
      <div className="select__header">
        <button className="btn btn--ghost select__back" onClick={onBack}>
          ← 돌아가기
        </button>
        <h2 className="neon-text">도감</h2>
        <div className="codex__tabs">
          <button className={`diffseg ${tab === 'hero' ? 'is-active' : ''}`} onClick={() => setTab('hero')}>
            영웅 · 카드
          </button>
          <button className={`diffseg ${tab === 'monster' ? 'is-active' : ''}`} onClick={() => setTab('monster')}>
            몬스터
          </button>
          <button className={`diffseg ${tab === 'relic' ? 'is-active' : ''}`} onClick={() => setTab('relic')}>
            유물
          </button>
        </div>
      </div>

      {tab === 'relic' ? <RelicCodex /> : tab === 'monster' ? <MonsterCodex /> : <div className="codex__body">
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
          </div>
        </div>
      </div>}
    </div>
  )
}
