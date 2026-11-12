// 런 분기 지도 — 지나온 길과 앞으로의 갈래를 보여주고, 이번 층의 칸을 **골라서** 진입한다.
//
// ⚠ 2026-08-04(2차): 아래에 큰 선택 카드를 따로 두던 걸 없앴다. 카드가 화면 절반을
// 먹는 바람에 정작 **지도가 얇은 띠로 눌려 앞에 뭐가 있는지 안 보였다**("경로를 다르게
// 가야 하는데 너무 작아서 안 보인다"). 이제 **지도의 칸을 직접 누른다** — 고르는 자리와
// 보는 자리가 하나가 되고, 남는 공간이 전부 지도로 간다.
//
// ⚠ 2026-08-05(3차): 층마다 독립된 2택이던 걸 **간선이 있는 그래프**로 바꿨다. 예전
// 지도는 무엇을 고르든 다음 층이 똑같이 열려서, 고른 게 뒤에 아무 영향이 없었다("2가지
// 중 하나를 고르는 느낌"). 이제 칸끼리 **선으로 이어져** 있고 이어진 칸만 다음 선택지가
// 된다 — 갈래가 1~3개로 달라지고, 앞쪽 상점을 노리려면 몇 층 전부터 그 줄을 타야 한다.
// ⚠ 2026-11(4차): 리디자인으로 세로 지도가 됐다 — 아래에서 위로 오르고, 고르는 건 칸을 눌러도,
// 오른쪽 목록을 눌러도 된다.
// ⚠ 2026-11-12(5차): **지도 두 장(1막 초원 · 2막 던전), 막마다 20층 · 가로 5줄**. 20층이 한 화면에
// 안 들어가 지도 안쪽을 **세로로 굴린다**(지금 층이 보이게 저절로 내려간다). 다음 막 지도는 보스를
// 잡아야 생기므로 막 표시는 진행 상황만 보여 준다.
import { useEffect, useRef } from 'react'
import { sheetFor } from '../../art/sprites'
import { getChar } from '../../data/roster'
import {
  currentEnemy,
  currentOptionIndices,
  ACTS,
  LADDER_FLOORS,
  MAP_COLS,
  regionOf,
  type RunNode,
  type RunState,
} from '../../game/run'
import { getMonster } from '../../game/monsters'
import { RelicGrid } from '../RelicIcon'
import { SpriteClip } from '../SpriteClip'
import { useFirstTip } from '../FirstTip'

const NODE_ICON: Record<RunNode['type'], string> = {
  combat: 'enemy',
  elite: 'elite',
  boss: 'boss',
  event: 'unknown',
  inn: 'inn',
  smith: 'smith',
  treasure: 'treasure',
}
const NODE_LABEL: Record<RunNode['type'], string> = {
  combat: '적',
  elite: '엘리트',
  boss: '보스',
  event: '미지',
  inn: '여관',
  smith: '대장간',
  treasure: '보물',
}
/** 그 칸을 고르면 무엇을 얻는지 — 몬스터 칸은 이름·체력이 이 자리에 대신 온다. */
const NODE_HINT: Record<RunNode['type'], string> = {
  combat: '일반 전투 · 카드 보상',
  elite: '강한 적 · 유물 보상',
  boss: '마지막 관문',
  event: '이벤트 · 무엇이 있을지 모른다',
  inn: '휴식(80골드 · 50%) · 카드 · 유물 구매 · 나가도 20%',
  smith: '골드로 카드 한 장 강화 · 그냥 지나가면 휴식',
  treasure: '유물 상자 하나',
}
const LEGEND: RunNode['type'][] = ['event', 'inn', 'treasure', 'smith', 'combat', 'elite', 'boss']

const ACT_LABEL = ['초원', '던전']

/** 지도 안쪽 좌표 — 폭 836, 높이는 층 수만큼(세로로 굴린다). 아래가 먼저 오르는 층이고 줄(lane)이 가로로 놓인다. */
const MAP_W = 836
const ROW = 66
const FLOOR_BOTTOM_PAD = 56
const BOSS_PAD = 120
const MAP_H = FLOOR_BOTTOM_PAD + (LADDER_FLOORS - 1) * ROW + BOSS_PAD
const laneX = (lane: number) => 110 + (lane / (MAP_COLS - 1)) * 616
const floorY = (floor: number) => MAP_H - FLOOR_BOTTOM_PAD - (floor - 1) * ROW - (floor === LADDER_FLOORS ? 30 : 0)

/**
 * 지도 칸 아이콘. 원본이 14×14라 **그림은 늘 14의 정수배로** 그린다(칸 크기와 따로) —
 * `contain`으로 늘리면 32px 같은 어중간한 크기에서 픽셀이 뭉개진다.
 */
function NodeIcon({ type, size }: { type: RunNode['type']; size: number }) {
  const px = Math.max(14, Math.floor(size / 14) * 14)
  return (
    <span
      className="mapicon"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(/redesign/ui/map-icons/${NODE_ICON[type]}.png)`,
        backgroundSize: `${px}px ${px}px`,
      }}
    />
  )
}

export function RunMapScreen({
  run,
  onChoose,
  onQuit,
}: {
  run: RunState
  /** 이번 층의 갈래를 고른다 — 고르는 즉시 그 칸으로 들어간다. */
  onChoose: (index: number) => void
  onQuit: () => void
}) {
  const char = getChar(run.charId)
  const sheet = sheetFor(run.charId)
  const region = regionOf(run)
  const label = `${run.act}막 ${ACT_LABEL[run.act - 1] ?? ''}`
  // 지금 층이 지도 아래쪽 1/3쯤에 오게 굴려 둔다.
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = Math.max(0, floorY(run.floor) - el.clientHeight * 0.66)
  }, [run.act, run.floor])

  // 이번 층 적의 실제 체력은 층 스케일이 걸린 값이라 `currentEnemy`로 뽑는다.
  // ⚠ 앞으로의 층은 **숫자를 보여주지 않는다** — 스케일이 그 층 기준이라
  //    지금 계산하면 거짓말이 된다. 이름·종류까지만 미리 보여 준다.
  const optionIdx = currentOptionIndices(run)
  const hpOf = (nodeIdx: number): number | null => {
    const n = run.map[run.floor - 1]?.[nodeIdx]
    if (!n?.monsterId) return null
    return currentEnemy({ ...run, picked: withPick(run, nodeIdx) }).maxHp
  }

  // 내가 서 있는 칸 = 직전 층에서 고른 칸. 막의 첫 층이면 지도 아래 출발점이다.
  const lastFloor = run.floor - 1
  const lastNode = run.map[lastFloor - 1]?.[run.picked[lastFloor - 1]]
  const standing = lastNode ? { x: laneX(lastNode.lane), y: floorY(lastFloor) } : null
  const atStart = !standing
  const tip = useFirstTip(['map'])

  return (
    <div className="screen runmap">
      {tip}
      <section className={`worldmap worldmap--${region}`} aria-label={`${label} 지도`}>
        <i className="worldmap__bg" aria-hidden="true" />
        <i className="worldmap__vignette" aria-hidden="true" />

        <div className="worldmap__head">
          <h1>모험 지도</h1>
          <span className="worldmap__region">{label}</span>
          <span className="worldmap__floor">
            {run.floor} / {LADDER_FLOORS}F
          </span>
        </div>
        <button className="worldmap__quit" onClick={onQuit}>
          런 포기
        </button>

        <div className="worldmap__scroll" ref={scrollRef}>
        <div className="worldmap__canvas" style={{ height: MAP_H }}>
        {/* 간선 — 칸 뒤에 깔린다. 밟은 길은 금 실선, 지금 고를 길은 밝게, 나머지는 흐린 점선. */}
        <svg className="worldmap__edges" viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true">
          {run.map.flatMap((nodes, f) =>
            nodes.flatMap((n, i) =>
                  n.next.map((j) => {
                    const dest = run.map[f + 1]?.[j]
                    if (!dest) return null
                    // 밟은 간선 = 이 층에서 이 칸을 골랐고, 다음 층에서 저 칸을 골랐다.
                    const taken = run.picked[f] === i && run.picked[f + 1] === j
                    // 지금 고를 수 있는 갈래로 이어지는 간선은 강조한다.
                    const live = f === run.floor - 2 && run.picked[f] === i
                    return (
                      <line
                        key={`${f}-${i}-${j}`}
                        className={`mapedge ${taken ? 'mapedge--taken' : live ? 'mapedge--live' : ''}`}
                        x1={laneX(n.lane)}
                        y1={floorY(f + 1)}
                        x2={laneX(dest.lane)}
                        y2={floorY(f + 2)}
                      />
                    )
                  }),
            ),
          )}
        </svg>

        {run.map.flatMap((nodes, f) => {
          const floor = f + 1
          return nodes.map((n, j) => {
            const taken = run.picked[f] === j && floor < run.floor
            const pickable = floor === run.floor && optionIdx.includes(j)
            const passed = floor <= run.floor && !taken && !pickable
            const boss = n.type === 'boss'
            const size = boss ? 96 : 50
            const name = n.monsterId ? getMonster(n.monsterId).name : NODE_LABEL[n.type]
            const cls = `mapnode ${taken ? 'mapnode--taken' : ''} ${pickable ? 'mapnode--reach' : ''} ${
              passed ? 'mapnode--passed' : ''
            } ${boss ? 'mapnode--boss' : ''}`
            const style = { left: laneX(n.lane) - size / 2, top: floorY(floor) - size / 2, width: size, height: size }
            const bossSheet = boss && n.monsterId ? sheetFor(n.monsterId) : undefined
            return (
              <button
                key={`${floor}-${j}`}
                className={cls}
                style={style}
                // ⚠ 지도의 잠긴 칸은 눌러도 할 일이 없다 — 카드와 달리 읽을 내용은 title로 충분하다.
                disabled={!pickable}
                onClick={() => onChoose(optionIdx.indexOf(j))}
                title={`${floor}층 · ${name}`}
                aria-label={`${floor}층 ${name}${pickable ? ' — 선택 가능' : ''}`}
              >
                {bossSheet ? (
                  <span className="mapnode__boss" style={{ ['--artflip' as string]: -1 }}>
                    <SpriteClip sheet={bossSheet} clip="idle" scale={1} />
                  </span>
                ) : (
                  <NodeIcon type={n.type} size={42} />
                )}
              </button>
            )
          })
        })}

        {(
          <span className="worldmap__bossname" style={{ top: floorY(LADDER_FLOORS) + 54 }}>
            {LADDER_FLOORS}층 보스 ·{' '}
            {run.map[LADDER_FLOORS - 1]?.[0]?.monsterId
              ? getMonster(run.map[LADDER_FLOORS - 1][0].monsterId!).name
              : ''}
          </span>
        )}

        {sheet && (
          <div
            className="maphero"
            aria-label="현재 위치"
            style={standing ? { left: standing.x - 36, top: standing.y - 86 } : { left: 10, top: floorY(1) - 40 }}
          >
            <SpriteClip sheet={sheet} clip="idle" scale={1} />
          </div>
        )}
        </div>
        </div>
        {atStart && <span className="worldmap__start">출발 — 1층 칸을 골라 시작점을 정하세요(못 가는 곳도 있다)</span>}
      </section>

      <aside className="mapside">
        <div className="mapside__regions">
          {Array.from({ length: ACTS }, (_, i) => i + 1).map((act) => (
            <div key={act} className={`regiontab regiontab--${act === 1 ? 'grassland' : 'dungeon'} ${act === run.act ? 'is-on' : ''}`}>
              <b>
                {act}막 {ACT_LABEL[act - 1]}
              </b>
              <span>{act < run.act ? '돌파' : act === run.act ? `${LADDER_FLOORS}층 · 진행 중` : `${LADDER_FLOORS}층`}</span>
            </div>
          ))}
        </div>

        <div className="mapside__hero" style={{ ['--accent' as string]: char.accent, ['--accent2' as string]: char.accent2 }}>
          <div className="mapside__portrait" aria-hidden="true">
            {sheet && (
              <div style={{ position: 'absolute', left: -22, top: -12 }}>
                <SpriteClip sheet={sheet} clip="idle" scale={1} />
              </div>
            )}
          </div>
          <div className="mapside__stats">
            <div>
              <span className="mapside__name">{char.name}</span>
              <span className="mapside__meta">
                골드 {run.gold} · 덱 {run.deck.length}장
              </span>
            </div>
            <div className="bar bar--thin">
              <i style={{ width: `${Math.max(0, (run.hp / run.maxHp) * 100)}%` }} />
            </div>
            <span className="mapside__hp">
              HP {Math.ceil(run.hp)}/{run.maxHp}
            </span>
          </div>
        </div>

        <div className="mapside__choices">
          <span className="mapside__title">다음 갈 곳 고르기</span>
          {optionIdx.map((j, i) => {
            const n = run.map[run.floor - 1][j]
            const hp = hpOf(j)
            return (
              <button key={j} className="mappick" onClick={() => onChoose(i)}>
                <NodeIcon type={n.type} size={32} />
                <span>
                  <b>
                    {run.floor}층 · {NODE_LABEL[n.type]}
                  </b>
                  <em>
                    {n.monsterId ? `${getMonster(n.monsterId).name} · 체력 ${hp}` : NODE_HINT[n.type]}
                  </em>
                </span>
              </button>
            )
          })}
        </div>

        <div className="mapside__relics">
          <div className="mapside__relichead">
            <b>유물 {run.relicIds.length}</b>
            <span>금색 테두리 = 런 효과</span>
          </div>
          <RelicGrid ids={run.relicIds} />
        </div>

        <div className="maplegend">
          <h2>범례</h2>
          <div>
            {LEGEND.map((t) => (
              <span key={t}>
                <NodeIcon type={t} size={28} />
                {NODE_LABEL[t]}
              </span>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}

/** `currentEnemy`가 볼 수 있도록 "이 칸을 골랐다면"의 picked 배열을 만든다. */
function withPick(run: RunState, nodeIdx: number): number[] {
  const picked = run.picked.slice()
  picked[run.floor - 1] = nodeIdx
  return picked
}
