// 런 분기 지도 — 지나온 길과 앞으로의 갈래를 보여주고, 이번 층의 칸을 **골라서** 진입한다.
// 위 트랙은 전체 조망(층마다 후보가 세로로 쌓인다), 아래 패널이 실제로 고르는 자리다.
import {
  currentOptions,
  enemyForNode,
  LADDER_FLOORS,
  type RunNode,
  type RunState,
} from '../../game/run'
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
/** 그 칸을 고르면 무엇을 얻고 무엇을 포기하는지 — 고르는 근거가 되는 한 줄. */
const NODE_HINT: Record<RunNode['type'], string> = {
  combat: '보상 카드와 골드를 준다.',
  elite: '유물을 확정으로 주지만 훨씬 강하다.',
  boss: '마지막 관문. 이기면 런이 끝난다.',
  event: '대가를 치르면 보상을 얻을 수도.',
  shop: '골드로 카드·유물·회복을 산다.',
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
  const options = currentOptions(run)

  return (
    <div className="screen runmap">
      <div className="grid-bg" />
      <div className="runmap__topbar">
        <RunBar run={run} />
        <button className="btn btn--ghost runmap__quit" onClick={onQuit}>
          런 포기
        </button>
      </div>

      {/* 전체 조망 — 층마다 후보를 세로로 쌓는다. 지나온 층은 실제로 밟은 칸만
          밝고, 앞으로의 층은 후보가 전부 흐리게 보인다(어디로 갈지 계획하라고). */}
      <div className="runmap__track">
        {run.branches.map((opts, i) => {
          const floor = i + 1
          const past = floor < run.floor
          const cur = floor === run.floor
          const takenIdx = run.picked[i]
          return (
            <div key={i} className={`runcol ${cur ? 'runcol--cur' : ''}`}>
              {opts.map((n, j) => {
                // 지나온 층에서 안 밟은 갈래는 흔적만 남긴다.
                const taken = takenIdx === j
                const st = past ? (taken ? 'done' : 'missed') : cur ? 'cur' : 'next'
                return (
                  <div key={j} className={`runnode runnode--${n.type} runnode--${st}`}>
                    <span className="runnode__icon">{NODE_ICON[n.type]}</span>
                  </div>
                )
              })}
              <span className="runcol__floor">{floor}</span>
            </div>
          )
        })}
      </div>

      <div className="runmap__choose">
        <div className="runmap__prompt">
          층 {run.floor} / {LADDER_FLOORS} — 어느 길로 갈지 고르세요
        </div>
        <div className="runmap__options">
          {options.map((node, i) => {
            const enemy = node.monsterId ? enemyForNode(run, node) : null
            return (
              <button
                key={i}
                className={`runmap__card runnode--${node.type}`}
                onClick={() => onChoose(i)}
              >
                <div className="runmap__card-icon">{NODE_ICON[node.type]}</div>
                <div className="runmap__card-type">{NODE_LABEL[node.type]}</div>
                <div className="runmap__card-name">{enemy ? enemy.name : NODE_LABEL[node.type]}</div>
                {enemy && (
                  <div className="runmap__card-detail">
                    체력 {enemy.maxHp} · {enemy.note}
                  </div>
                )}
                <div className="runmap__card-hint">{NODE_HINT[node.type]}</div>
              </button>
            )
          })}
        </div>
      </div>
      <div className="scanlines" />
    </div>
  )
}
