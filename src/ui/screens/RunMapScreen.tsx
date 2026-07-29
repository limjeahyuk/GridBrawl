// 런 사다리 지도 — 현재 위치·앞으로의 노드를 보여주고 다음 노드로 진입한다.
import { getMonster } from '../../game/monsters'
import { currentEnemy, type RunNode, type RunState } from '../../game/run'
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
function nodeName(n: RunNode): string {
  if (n.monsterId) return getMonster(n.monsterId).name
  return NODE_LABEL[n.type]
}

export function RunMapScreen({
  run,
  onEnter,
  onQuit,
}: {
  run: RunState
  onEnter: () => void
  onQuit: () => void
}) {
  const node = run.ladder[run.floor - 1]
  const enemy = node.monsterId ? currentEnemy(run) : null
  const enterLabel =
    node.type === 'shop'
      ? '상점 들르기'
      : node.type === 'event'
        ? '이벤트 살펴보기'
        : `${NODE_LABEL[node.type]} 시작`

  return (
    <div className="screen runmap">
      <div className="grid-bg" />
      <div className="runmap__topbar">
        <RunBar run={run} />
        <button className="btn btn--ghost runmap__quit" onClick={onQuit}>
          런 포기
        </button>
      </div>

      <div className="runmap__track">
        {run.ladder.map((n, i) => {
          const st = i + 1 < run.floor ? 'done' : i + 1 === run.floor ? 'cur' : 'next'
          return (
            <div key={i} className={`runnode runnode--${n.type} runnode--${st}`}>
              <span className="runnode__icon">{NODE_ICON[n.type]}</span>
              <span className="runnode__floor">{i + 1}</span>
            </div>
          )
        })}
      </div>

      <div className="runmap__panel">
        <div className={`runmap__card runnode--${node.type}`}>
          <div className="runmap__card-icon">{NODE_ICON[node.type]}</div>
          <div className="runmap__card-type">{NODE_LABEL[node.type]}</div>
          <div className="runmap__card-name">{nodeName(node)}</div>
          {enemy && (
            <div className="runmap__card-detail">
              체력 {enemy.maxHp} · {enemy.note}
            </div>
          )}
          {node.type === 'shop' && <div className="runmap__card-detail">골드로 카드·유물·회복을 산다.</div>}
          {node.type === 'event' && <div className="runmap__card-detail">대가를 치르면 보상을 얻을 수도.</div>}
        </div>
        <button className="btn runmap__enter" onClick={onEnter}>
          {enterLabel} ▶
        </button>
      </div>
      <div className="scanlines" />
    </div>
  )
}
