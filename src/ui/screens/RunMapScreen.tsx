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
import {
  currentEnemy,
  currentOptionIndices,
  LADDER_FLOORS,
  type RunNode,
  type RunState,
} from '../../game/run'
import { getMonster } from '../../game/monsters'
import { RunBar } from '../RunBar'

const NODE_ICON: Record<RunNode['type'], string> = {
  combat: '⚔',
  elite: '💀',
  boss: '👑',
  event: '❓',
  shop: '🛒',
}
const NODE_LABEL: Record<RunNode['type'], string> = {
  combat: '전투',
  elite: '엘리트',
  boss: '보스',
  event: '이벤트',
  shop: '상점',
}
/** 그 칸을 고르면 무엇을 얻고 무엇을 포기하는지 — 지금 고를 수 있는 칸에만 붙인다. */
const NODE_HINT: Record<RunNode['type'], string> = {
  combat: '보상 카드 · 골드',
  elite: '유물 확정 · 강함',
  boss: '마지막 관문',
  event: '대가를 치르면 보상',
  shop: '골드로 산다',
}
/** 칸 이름 — 몬스터 칸은 몬스터 이름, 그 외는 종류. */
function nodeName(n: RunNode): string {
  return n.monsterId ? getMonster(n.monsterId).name : NODE_LABEL[n.type]
}

const LANES = 3
/** 간선 SVG의 좌표계 — 칸 중심을 층/줄 번호에서 바로 계산한다(격자가 균일하므로). */
const edgeX = (floor0: number) => ((floor0 + 0.5) / LADDER_FLOORS) * 100
const edgeY = (lane: number) => ((lane + 0.5) / LANES) * 100

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
  // 이번 층 적의 실제 체력은 층 스케일이 걸린 값이라 `currentEnemy`로 뽑는다.
  // ⚠ 앞으로의 층은 **숫자를 보여주지 않는다** — 스케일이 그 층 기준이라
  //    지금 계산하면 거짓말이 된다. 이름·종류까지만 미리 보여 준다.
  const optionIdx = currentOptionIndices(run)
  const hpOf = (nodeIdx: number): number | null => {
    const n = run.map[run.floor - 1]?.[nodeIdx]
    if (!n?.monsterId) return null
    return currentEnemy({ ...run, picked: withPick(run, nodeIdx) }).maxHp
  }

  return (
    <div className="screen runmap">
      <div className="grid-bg" />
      <div className="runmap__topbar">
        <RunBar run={run} />
        <button className="btn btn--ghost runmap__quit" onClick={onQuit}>
          런 포기
        </button>
      </div>

      <div className="runmap__prompt">
        층 {run.floor} / {LADDER_FLOORS} — 이어진 칸만 고를 수 있습니다. 갈 칸을 누르세요.
      </div>

      <div className="runmap__track">
        {/* 간선 — 칸 뒤에 깔린다. 지나온 길은 밝게, 못 가는 길은 흐리게. */}
        <svg
          className="runmap__edges"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {run.map.flatMap((nodes, f) =>
            nodes.flatMap((n, i) =>
              n.next.map((j) => {
                const to = run.map[f + 1]?.[j]
                if (!to) return null
                // 밟은 간선 = 이 층에서 이 칸을 골랐고, 다음 층에서 저 칸을 골랐다.
                const taken = run.picked[f] === i && run.picked[f + 1] === j
                // 지금 고를 수 있는 갈래로 이어지는 간선은 강조한다.
                const live = f === run.floor - 2 && run.picked[f] === i
                const cls = taken ? 'runedge runedge--taken' : live ? 'runedge runedge--live' : 'runedge'
                return (
                  <line
                    key={`${f}-${i}-${j}`}
                    className={cls}
                    x1={edgeX(f)}
                    y1={edgeY(n.lane)}
                    x2={edgeX(f + 1)}
                    y2={edgeY(to.lane)}
                  />
                )
              }),
            ),
          )}
        </svg>

        {run.map.map((nodes, i) => {
          const floor = i + 1
          const past = floor < run.floor
          const cur = floor === run.floor
          const takenIdx = run.picked[i]
          return (
            <div key={i} className={`runcol ${cur ? 'runcol--cur' : ''}`}>
              {/* 줄(lane)마다 자리를 잡아 둔다 — 빈 줄은 빈칸으로 남아 지도가 흔들리지 않는다. */}
              {Array.from({ length: LANES }, (_, lane) => {
                const j = nodes.findIndex((n) => n.lane === lane)
                if (j < 0) return <div key={lane} className="runnode-slot" />
                const n = nodes[j]
                const taken = takenIdx === j
                const pickable = cur && optionIdx.includes(j)
                // 지나온 층에서 안 밟은 갈래는 흔적만, 이번 층에서 못 가는 칸은 잠금.
                const st = past
                  ? taken
                    ? 'done'
                    : 'missed'
                  : cur
                    ? pickable
                      ? 'cur'
                      : 'locked'
                    : 'next'
                const cls = `runnode runnode--${n.type} runnode--${st}`
                const body = (
                  <>
                    <span className="runnode__icon">{NODE_ICON[n.type]}</span>
                    <span className="runnode__label">{nodeName(n)}</span>
                    {pickable && (
                      <span className="runnode__meta">
                        {hpOf(j) !== null ? `체력 ${hpOf(j)}` : NODE_HINT[n.type]}
                      </span>
                    )}
                  </>
                )
                // 이번 층에서 **이어진** 칸만 누를 수 있다.
                return pickable ? (
                  <button
                    key={lane}
                    className={cls}
                    onClick={() => onChoose(optionIdx.indexOf(j))}
                    title={nodeName(n)}
                  >
                    {body}
                  </button>
                ) : (
                  <div key={lane} className={cls} title={nodeName(n)}>
                    {body}
                  </div>
                )
              })}
              <span className="runcol__floor">{floor}</span>
            </div>
          )
        })}
      </div>
      <div className="scanlines" />
    </div>
  )
}

/** `currentEnemy`가 볼 수 있도록 "이 칸을 골랐다면"의 picked 배열을 만든다. */
function withPick(run: RunState, nodeIdx: number): number[] {
  const picked = run.picked.slice()
  picked[run.floor - 1] = nodeIdx
  return picked
}
