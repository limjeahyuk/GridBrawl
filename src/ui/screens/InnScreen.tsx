// 여관 · 대장간 — 2026-11-09 지도의 상점·휴식 칸을 대신하는 두 칸(`docs/redesign/INN_SMITH.md`).
// 시안 `Inn.dc.html` · `Blacksmith.dc.html`. 규칙(값·회복량)은 전부 `game/run.ts`에 있다.
import { useMemo, useState } from 'react'
import {
  advanceFloor, innLeave, innLeaveAmount, innRest, innRestAmount, innRestPrice, paySmith, placeLabel, rollShop,
  smithPass, smithPassAmount, smithPrice, upgradableDeckCards, type RunState,
} from '../../game/run'
import { useFirstTip } from '../FirstTip'
import { ShopScreen } from './ShopScreen'
import { UpgradeScreen } from './UpgradeScreen'

const where = (run: RunState) => `${placeLabel(run)}`

interface Opt {
  label: string
  sub: string
  cost?: number
  /** 골드가 아닌 칩(고블린 상점의 "전투 ★☆☆ · HP 28"). */
  chip?: string
  off?: boolean
  tone?: 'heal' | 'mute' | 'fight'
  onTap: () => void
}

/** 선택지 줄 — 대가 칩(골드)은 오른쪽. 못 고르면 흐리게 막는다. 고블린 상점도 쓴다. */
export function Opts({ opts }: { opts: Opt[] }) {
  return (
    <nav className="inn__opts">
      {opts.map((o, i) => (
        <button
          key={o.label}
          type="button"
          className={`inn__opt ${o.off ? 'is-off' : ''} ${o.tone === 'fight' ? 'inn__opt--fight' : ''}`}
          style={{ animationDelay: `${0.15 * (i + 1)}s` }}
          aria-disabled={o.off}
          onClick={() => !o.off && o.onTap()}
        >
          <span className="inn__optbody">
            <b>{o.label}</b>
            <span className={o.tone ? `is-${o.tone}` : ''}>{o.sub}</span>
          </span>
          {o.chip && <span className="inn__chip inn__chip--fight">{o.chip}</span>}
          {o.cost != null && (
            <span className="inn__chip">
              <i className="coin coin--sm" aria-hidden />
              {o.cost}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}

export function Purse({ run, heal }: { run: RunState; heal?: number }) {
  return (
    <div className="shop__purse">
      <span className="goldchip">
        <i className="coin coin--sm" aria-hidden />
        {run.gold}
      </span>
      <span className="hpchip inn__hp">
        HP {run.hp}/{run.maxHp}
        {!!heal && <em className="inn__heal">+{heal}</em>}
      </span>
    </div>
  )
}

/**
 * 여관 — 휴식(50G · 50%) / 상점 / 나가기(20%). 휴식이나 나가기를 고르면 그걸로 방문이 끝나고
 * "지도로" 하나만 남는다. 상점은 다녀와도 방문이 안 끝난다 — 진열·산 목록을 여기서 들고 있다.
 */
export function InnScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const stock = useMemo(() => rollShop(run), [run])
  const [cur, setCur] = useState(run)
  const [bought, setBought] = useState<Set<string>>(new Set())
  const [inShop, setInShop] = useState(false)
  const [done, setDone] = useState<null | { kind: 'rest' | 'leave'; heal: number }>(null)
  const tip = useFirstTip([!inShop && 'shop'])

  if (inShop)
    return (
      <ShopScreen
        run={cur}
        stock={stock}
        bought={bought}
        onChange={(next, b) => {
          setCur(next)
          setBought(b)
        }}
        onBack={() => setInShop(false)}
      />
    )

  const price = innRestPrice(cur)
  const restN = innRestAmount(cur)
  const leaveN = innLeaveAmount(cur)
  const canRest = cur.gold >= price
  const line = !done
    ? '"어서 와요, 여행자님! 따뜻한 침대도 있고, 쓸 만한 물건도 있답니다."'
    : done.kind === 'rest'
      ? `"푹 쉬셨어요? 한결 나아 보이네요. 체력이 ${done.heal} 회복됐어요. 조심히 가요!"`
      : '"조심히 가요! 다음에 또 들르고요."'
  const opts: Opt[] = done
    ? [{ label: '지도로', sub: '다음 칸을 고르러 간다', onTap: () => onDone(advanceFloor(cur)) }]
    : [
        {
          label: '휴식',
          sub: canRest ? `최대 체력의 50% 회복 (+${restN}) · 쉬면 여관을 떠난다` : '골드가 모자란다',
          cost: price,
          off: !canRest,
          tone: canRest ? 'heal' : 'mute',
          onTap: () => {
            const next = innRest(cur)
            if (!next) return
            setDone({ kind: 'rest', heal: next.hp - cur.hp })
            setCur(next)
          },
        },
        { label: '상점', sub: '카드 · 유물을 골드로 산다 (다 보고 돌아올 수 있다)', onTap: () => setInShop(true) },
        {
          label: '나가기',
          sub: `최대 체력의 20% 회복 (+${leaveN})`,
          tone: 'heal',
          onTap: () => {
            const next = innLeave(cur)
            setDone({ kind: 'leave', heal: next.hp - cur.hp })
            setCur(next)
          },
        },
      ]

  return (
    <div className="screen inn">
      <div className="artbg artbg--fill artbg--inn" aria-hidden="true" />
      <div className="artbg artbg--inn" role="img" aria-label="여관 — 맥주잔을 든 여관 주인 마렌" />
      <i className="inn__veil" aria-hidden="true" />
      {tip}
      <header className="shop__head">
        <div className="shop__where">
          <h1 className="shop__title">여관</h1>
          <span>{where(cur)}</span>
        </div>
        <Purse run={cur} heal={done?.heal} />
      </header>
      <section className="inn__say" key={done?.kind ?? 'hi'}>
        <div className="inn__name">
          <b>마렌</b>
          <span>여관 주인</span>
        </div>
        <p>{line}</p>
      </section>
      <Opts key={done ? 'done' : 'open'} opts={opts} />
    </div>
  )
}

/**
 * 대장간(지도 칸) — 카드 강화 50G(한 번 · 저장하면 바로 지도로) / 쉬어 간다(최대 체력 10%).
 * ⚠ ? 이벤트 「낡은 대장간」과는 다른 곳이다(`EventScreen` — 강화 또는 유물).
 * 룰렛을 돌리기 전에 그만두면 결제 전 런으로 돌아온다(돈을 안 받는다).
 * 배경은 망치를 멘 대장장이 그림(`cutscene/smith/smith-bg.png`) — 여관과 같은 배치.
 * 쉬어 가면 대사가 바뀌고 "지도로" 하나만 남는다(여관과 같은 흐름).
 */
export function SmithScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const [paid, setPaid] = useState<RunState | null>(null)
  const [rested, setRested] = useState<{ run: RunState; heal: number } | null>(null)
  if (paid)
    return <UpgradeScreen run={paid} source="smith" onCancel={() => setPaid(null)} onDone={(next) => onDone(advanceFloor(next))} />

  const cur = rested?.run ?? run
  const price = smithPrice(run)
  const passN = smithPassAmount(run)
  const canUp = upgradableDeckCards(run).length > 0
  const ok = canUp && run.gold >= price
  const opts: Opt[] = rested
    ? [{ label: '지도로', sub: '다음 칸을 고르러 간다', onTap: () => onDone(advanceFloor(rested.run)) }]
    : [
        {
          label: '카드 강화',
          sub: !canUp ? '강화할 카드가 없다' : run.gold < price ? '골드가 모자란다' : '카드 한 장 · 룰렛으로 수치 또는 범위 · 강화하면 대장간을 떠난다',
          cost: price,
          off: !ok,
          tone: ok ? undefined : 'mute',
          onTap: () => setPaid(paySmith(run)),
        },
        {
          label: '쉬어 간다',
          sub: `강화하지 않고 불 곁에서 쉰다 · 최대 체력의 10% 회복 (+${passN})`,
          tone: 'heal',
          onTap: () => {
            const next = smithPass(run)
            setRested({ run: next, heal: next.hp - run.hp })
          },
        },
      ]
  return (
    <div className="screen smith">
      <div className="artbg artbg--fill artbg--smith" aria-hidden="true" />
      <div className="artbg artbg--smith" role="img" aria-label="대장간 — 망치를 멘 대장장이가 손을 흔든다" />
      <i className="inn__veil" aria-hidden="true" />
      <header className="shop__head">
        <div className="shop__where">
          <h1 className="shop__title">대장간</h1>
          <span>{where(run)}</span>
        </div>
        <Purse run={cur} heal={rested?.heal} />
      </header>
      <section className="inn__say smith__say" key={rested ? 'rest' : 'hi'}>
        <div className="inn__name">
          <b>대장장이</b>
          <span>대장간 주인</span>
        </div>
        <p>
          {rested
            ? '"그래, 몸부터 챙겨야지. 다음엔 카드도 들고 오게!"'
            : `"어이, 어서 오게! 쇠든 카드든 두들기면 단단해지지. ${price}골드면 한 장 손봐 주겠네 — 딱 한 장이야."`}
        </p>
      </section>
      <Opts key={rested ? 'done' : 'open'} opts={opts} />
    </div>
  )
}
