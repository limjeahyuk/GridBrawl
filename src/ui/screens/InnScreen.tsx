// 여관 · 대장간 — 2026-11-09 지도의 상점·휴식 칸을 대신하는 두 칸(`docs/redesign/INN_SMITH.md`).
// 시안 `Inn.dc.html` · `Blacksmith.dc.html`. 규칙(값·회복량)은 전부 `game/run.ts`에 있다.
import { useMemo, useState } from 'react'
import {
  advanceFloor, innLeave, innLeaveAmount, innRest, innRestAmount, innRestPrice, paySmith, placeLabel, rollShop,
  smithPrice, upgradableDeckCards, type RunState,
} from '../../game/run'
import { useFirstTip } from '../FirstTip'
import { ShopScreen } from './ShopScreen'
import type { UpgradeTier } from '../../game/upgrades'
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
 * 여관 — 휴식(80G · 50%) / 상점 / 나가기(20%). 휴식이나 나가기를 고르면 그걸로 방문이 끝나고
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
 * 대장간(지도 칸 · ? 칸) — 강화 맡기기 80G / 직접 강화 무료 / 나가기(2026-11-12 사용자 지정, 규칙은 `run.ts`).
 * 강화는 한 번 · 한 장, 저장하면 바로 지도로. 나가기는 아무것도 없이 다음 층.
 * ⚠ ? 이벤트 「낡은 대장간」과는 다른 곳이다(`EventScreen` — 맡긴 강화 룰렛 또는 유물).
 * 룰렛을 돌리기 전에 그만두면 결제 전 런으로 돌아온다(돈을 안 받는다).
 * 배경은 망치를 멘 대장장이 그림(`cutscene/smith/smith-bg.png`) — 여관과 같은 배치.
 */
export function SmithScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const [up, setUp] = useState<{ run: RunState; tier: UpgradeTier } | null>(null)
  if (up)
    return (
      <UpgradeScreen run={up.run} source="smith" tier={up.tier} onCancel={() => setUp(null)} onDone={(next) => onDone(advanceFloor(next))} />
    )

  const price = smithPrice(run)
  const canUp = upgradableDeckCards(run).length > 0
  const ok = canUp && run.gold >= price
  const opts: Opt[] = [
    {
      label: '강화 맡기기',
      sub: !canUp ? '강화할 카드가 없다' : run.gold < price ? '골드가 모자란다' : '대장장이가 두들긴다 · 반드시 오른다 · 카드 한 장',
      cost: price,
      off: !ok,
      tone: ok ? undefined : 'mute',
      onTap: () => setUp({ run: paySmith(run)!, tier: 'paid' }),
    },
    {
      label: '직접 강화',
      sub: !canUp ? '강화할 카드가 없다' : '공짜 · 대신 그대로거나 오히려 나빠질 수도 있다 · 카드 한 장',
      off: !canUp,
      tone: canUp ? undefined : 'mute',
      onTap: () => setUp({ run, tier: 'free' }),
    },
    { label: '나가기', sub: '아무것도 하지 않고 다음 층으로', onTap: () => onDone(advanceFloor(run)) },
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
        <Purse run={run} />
      </header>
      <section className="inn__say smith__say">
        <div className="inn__name">
          <b>대장장이</b>
          <span>대장간 주인</span>
        </div>
        <p>{`"어이, 어서 오게! ${price}골드면 내가 제대로 두들겨 주지. 돈이 아까우면 망치를 빌려줄 테니 직접 해 보든가 — 망쳐도 난 모르네!"`}</p>
      </section>
      <Opts opts={opts} />
    </div>
  )
}
