// 런 공용 상태 바 — 층·HP·골드·유물·덱 수. 맵/보상/이벤트/상점 화면에서 공유.
import { getRelic } from '../game/relics'
import { LADDER_FLOORS, type RunState } from '../game/run'
import { RelicIcon } from './RelicIcon'

export function RelicChip({ id }: { id: string }) {
  const r = getRelic(id)
  if (!r) return null
  return (
    <span className="relicchip" title={`${r.name} — ${r.desc}`}>
      <RelicIcon id={id} />
      <span className="relicchip__name">{r.name}</span>
    </span>
  )
}

export function RunBar({ run }: { run: RunState }) {
  const hpPct = Math.max(0, (run.hp / run.maxHp) * 100)
  return (
    <div className="runbar">
      <div className="runbar__stat">
        <span className="runbar__label">층</span>
        <span className="runbar__floor">
          {run.act}막 {run.floor} / {LADDER_FLOORS}
        </span>
      </div>
      <div className="runbar__hp">
        <div className="runbar__hpfill" style={{ width: `${hpPct}%` }} />
        <span className="runbar__hpnum">
          HP {Math.ceil(run.hp)}/{run.maxHp}
        </span>
      </div>
      <div className="runbar__gold">골드 {run.gold}</div>
      <div className="runbar__deck">덱 {run.deck.length}장</div>
      <div className="runbar__relics">
        {run.relicIds.map((id) => {
          const r = getRelic(id)
          return (
            <span key={id} title={r ? `${r.name} — ${r.desc}` : id}>
              <RelicIcon id={id} />
            </span>
          )
        })}
      </div>
    </div>
  )
}
