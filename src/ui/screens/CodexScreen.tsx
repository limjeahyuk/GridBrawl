import { useMemo, useState } from 'react'
import { ROSTER, type CharacterDef } from '../../data/roster'
import { sheetFor } from '../../art/sprites'
import { MONSTERS, type MonsterDef } from '../../game/monsters'
import { SpriteClip } from '../SpriteClip'
import { COMMON_CARDS } from '../../battle/cards'
import { FOE_ATLAS, RELIC_ATLAS } from '../../art/relicAtlas'
import { RELICS, type Rarity } from '../../game/relics'
import { seenFoeAbilities, seenFoes, seenRelics } from '../../game/progress'
import { FoeIcon, RARITY_LABEL, RelicIcon } from '../RelicIcon'
import { EVENT_CARDS, RUN_CARDS } from '../../game/runcards'
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
                {known && relic.eventOnly && <span className="relictip__rarity is-legend">이벤트 전용</span>}
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
 * 몬스터 도감(2026-11 리디자인의 세 번째 탭). **마주친 적만** 실루엣이 걷힌다
 * (`gb-foe-met`). 보스는 맨 뒤에 따로 선다 — 층 순서로 늘어놓으면 보스가 일반
 * 몬스터 사이에 묻힌다.
 */
function MonsterCodex() {
  const met = useMemo(() => seenFoes(), [])
  const groups: { label: string; color: string; list: MonsterDef[] }[] = [
    { label: '초원 · 1~7층', color: '#b6ea6a', list: MONSTERS.filter((m) => m.tier <= 2) },
    { label: '던전 · 8층~', color: '#c9c4ee', list: MONSTERS.filter((m) => m.tier === 3) },
    { label: '보스 · 엘리트', color: '#ff8a7a', list: MONSTERS.filter((m) => m.tier >= 4) },
  ]
  const [sel, setSel] = useState<MonsterDef>(MONSTERS[0])
  const known = met.has(sel.id)
  const selSheet = sheetFor(sel.spriteId ?? sel.baseArtId)
  return (
    <div className="codex__body codex__body--mon">
      <div className="mondex">
        {groups.map((g) => (
          <section key={g.label} className="mondex__group">
            <span style={{ color: g.color }}>{g.label}</span>
            <div className="mondex__grid">
              {g.list.map((m) => {
                const on = met.has(m.id)
                const sheet = sheetFor(m.spriteId ?? m.baseArtId)
                return (
                  <button
                    key={m.id}
                    className={`montile ${sel.id === m.id ? 'is-on' : ''}`}
                    onClick={() => setSel(m)}
                    aria-label={on ? m.name : '미발견 몬스터'}
                  >
                    {sheet && (
                      <span className={`montile__art ${on ? '' : 'is-sil'}`}>
                        <SpriteClip sheet={sheet} clip="idle" scale={1} />
                      </span>
                    )}
                    <span className="montile__name">{on ? m.name : '???'}</span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      <aside className="mondex__detail">
        <div className="mondex__stage">
          {selSheet && (
            <span className={known ? '' : 'is-sil'}>
              <SpriteClip sheet={selSheet} clip="idle" scale={2} />
            </span>
          )}
        </div>
        <div className="mondex__name">
          <h2>{known ? sel.name : '???'}</h2>
          <span>{sel.tier >= 4 ? '보스 · 엘리트' : `티어 ${sel.tier}`}</span>
        </div>
        <p className="mondex__note">
          {known ? sel.note : '아직 만나지 못했다. 한 번 싸우면 실루엣이 걷힌다.'}
        </p>
        {known && (
          <div className="mondex__stats">
            <div className="statbox">
              <span>체력</span>
              <b>{sel.maxHp}</b>
            </div>
            <div className="statbox">
              <span>기력</span>
              <b>{sel.startEnergy}</b>
            </div>
            <div className="statbox">
              <span>AI</span>
              <b>{sel.aiLevel}</b>
            </div>
          </div>
        )}
      </aside>
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
        <div className="codex__tabs" role="tablist">
          <button
            className={`codextab ${tab === 'hero' ? 'is-on' : ''}`}
            role="tab"
            aria-selected={tab === 'hero'}
            onClick={() => setTab('hero')}
          >
            영웅 · 카드 <span>{ROSTER.length}</span>
          </button>
          <button
            className={`codextab ${tab === 'monster' ? 'is-on' : ''}`}
            role="tab"
            aria-selected={tab === 'monster'}
            onClick={() => setTab('monster')}
          >
            몬스터 <span>{MONSTERS.length}</span>
          </button>
          <button
            className={`codextab ${tab === 'relic' ? 'is-on' : ''}`}
            role="tab"
            aria-selected={tab === 'relic'}
            onClick={() => setTab('relic')}
          >
            유물 <span>{RELICS.length}</span>
          </button>
        </div>
      </div>

      {tab === 'relic' ? (
        <RelicCodex />
      ) : tab === 'monster' ? (
        <MonsterCodex />
      ) : (
        <div className="codex__body codex__body--mon">
          {/* 영웅 탭도 몬스터 탭과 같은 틀이다(디자인 `Codex`) — 왼쪽에 스프라이트
              타일, 오른쪽에 고른 영웅의 상세. 카드 목록은 타일 아래에 이어 붙인다. */}
          <div className="mondex">
            <div className="herodex__row">
              {ROSTER.map((c) => {
                const sheet = sheetFor(c.id)
                return (
                  <button
                    key={c.id}
                    className={`montile montile--hero ${sel.id === c.id ? 'is-on' : ''}`}
                    style={{ ['--accent' as string]: c.accent }}
                    onClick={() => setSel(c)}
                  >
                    {sheet && (
                      <span className="montile__art">
                        <SpriteClip sheet={sheet} clip="idle" scale={2} />
                      </span>
                    )}
                    <span className="montile__name montile__name--px">{c.name}</span>
                  </button>
                )
              })}
            </div>

            <div className="codex__cards" style={{ ['--accent' as string]: sel.accent }}>
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

              <div className="codex__cards-title">전설 카드 (중립 · 이벤트로만 얻는다)</div>
              <div className="codex__deck">
                {EVENT_CARDS.map((c) => (
                  <div className="codex__card" key={c.id}>
                    <CardFace card={c} accent={cardAccent(c, sel.accent)} />
                    <p className="codex__card-desc">{c.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="mondex__detail" style={{ ['--accent' as string]: sel.accent }}>
            <div className="mondex__stage">
              {sheetFor(sel.id) ? (
                <SpriteClip sheet={sheetFor(sel.id)!} clip="idle" scale={2} />
              ) : (
                <PortraitSvg char={sel} className="detail__portrait" />
              )}
            </div>
            <div className="mondex__name">
              <h2>{sel.name}</h2>
              <span>{sel.title}</span>
            </div>
            <p className="mondex__note">{sel.description}</p>
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
          </aside>
        </div>
      )}
    </div>
  )
}
