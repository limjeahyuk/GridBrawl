// 런 분기 지도 — 지나온 길과 앞으로의 갈래를 보여주고, 이번 층의 칸을 **골라서** 진입한다.
//
// ⚠ 2026-08-04(2차): 아래에 큰 선택 카드를 따로 두던 걸 없앴다. 카드가 화면 절반을
// 먹는 바람에 정작 **지도가 얇은 띠로 눌려 앞에 뭐가 있는지 안 보였다**("경로를 다르게
// 가야 하는데 너무 작아서 안 보인다"). 이제 **지도의 칸을 직접 누른다** — 고르는 자리와
// 보는 자리가 하나가 되고, 남는 공간이 전부 지도로 간다.
import {
  currentEnemy,
  currentOptions,
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
/** 그 칸을 고르면 무엇을 얻고 무엇을 포기하는지 — 이번 층 칸에만 붙인다. */
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
  const options = currentOptions(run)
  const hpOf = (idx: number): number | null => {
    const n = options[idx]
    if (!n?.monsterId) return null
    return currentEnemy({ ...run, picked: withPick(run, idx) }).maxHp
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
        층 {run.floor} / {LADDER_FLOORS} — 갈 칸을 누르세요. 앞으로의 갈래도 미리 보입니다.
      </div>

      <div className="runmap__track">
        {run.branches.map((opts, i) => {
          const floor = i + 1
          const past = floor < run.floor
          const cur = floor === run.floor
          const takenIdx = run.picked[i]
          return (
            <div key={i} className={`runcol ${cur ? 'runcol--cur' : ''}`}>
              <div className="runcol__nodes">
                {opts.map((n, j) => {
                  // 지나온 층에서 안 밟은 갈래는 흔적만 남긴다.
                  const taken = takenIdx === j
                  const st = past ? (taken ? 'done' : 'missed') : cur ? 'cur' : 'next'
                  const cls = `runnode runnode--${n.type} runnode--${st}`
                  const body = (
                    <>
                      <span className="runnode__icon">{NODE_ICON[n.type]}</span>
                      <span className="runnode__label">{nodeName(n)}</span>
                      {cur && (
                        <span className="runnode__meta">
                          {hpOf(j) !== null ? `체력 ${hpOf(j)}` : NODE_HINT[n.type]}
                        </span>
                      )}
                    </>
                  )
                  // 이번 층만 누를 수 있다 — 그래서 버튼도 이번 층에만 준다.
                  return cur ? (
                    <button key={j} className={cls} onClick={() => onChoose(j)} title={nodeName(n)}>
                      {body}
                    </button>
                  ) : (
                    <div key={j} className={cls} title={nodeName(n)}>
                      {body}
                    </div>
                  )
                })}
              </div>
              <span className="runcol__floor">{floor}</span>
            </div>
          )
        })}
      </div>
      <div className="scanlines" />
    </div>
  )
}

/** `currentEnemy`가 볼 수 있도록 "이 갈래를 골랐다면"의 picked 배열을 만든다. */
function withPick(run: RunState, idx: number): number[] {
  const picked = run.picked.slice()
  picked[run.floor - 1] = idx
  return picked
}
