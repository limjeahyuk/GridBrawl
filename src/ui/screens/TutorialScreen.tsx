// 첫 접속 튜토리얼(디자인 `Tutorial` · `TutorialFlow`) — 슬라임 한 마리를 쓰러뜨리며 9단계로 배운다.
//   ① 한 단계에 하나만 — 스포트라이트 밖은 어둡게  ② 설명보다 행동이 먼저(4~7단계는 직접 눌러야 넘어간다)
//   ③ 질 수 없다 — 내 피해는 0, 슬라임은 앞만 친다  ④ 언제든 건너뛰기
// 강조할 자리는 좌표를 박지 않고 **실제 DOM 요소에서 잰다** — 전투 화면이 바뀌어도 따라간다.
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { CardDef } from '../../battle/types'
import { COMMON_CARDS } from '../../battle/cards'
import { getChar } from '../../data/roster'
import { getMonster, monsterChar } from '../../game/monsters'
import { mergeRelics } from '../../game/relics'
import { BattleScreen, type OpponentPlanner } from './BattleScreen'

type Rect = { x: number; y: number; w: number; h: number }
interface Step {
  tag: string
  title: string
  body: string
  /** 강조할 요소(첫 번째로 찾은 것). 없으면 가운데 안내판만. */
  spot?: string
  cta: string
  /** 직접 해야 넘어가는 단계 — 순서 칸 / 라운드 재생을 보고 자동으로 넘어간다. */
  wait?: 'move' | 'attack' | 'guard' | 'round'
}
const STEPS: Step[] = [
  { tag: '상대', title: '한 명만 쓰러뜨리면 끝', body: '6×4 칸짜리 판 위에서 1:1로 싸운다.\n이 슬라임이 첫 상대 — 쓰러뜨리면 튜토리얼이 끝난다.', spot: '.gridboard', cta: '다음' },
  { tag: 'HP', title: 'HP — 0이 되면 진다', body: '빨간 막대가 내 체력. 상대 막대도 똑같이 읽는다.\n상대를 먼저 0으로 만들면 이긴다.', spot: '.bhud__side--left .bhud__row--hp', cta: '다음' },
  { tag: '기력', title: '기력(EN) — 카드의 연료', body: '공격 카드는 기력을 쓴다. 카드의 EN 숫자가 비용.\n매 라운드 조금씩 다시 찬다 — 한 번에 다 쓰지 말 것.', spot: '.bhud__side--left .bhud__energy', cta: '다음' },
  { tag: '이동', title: '판을 눌러 다가가기', body: '노랗게 빛나는 칸을 눌러 보자.\n그 칸으로 가는 이동 카드가 1번 칸에 담긴다.\n이동 카드는 손패 왼쪽 묶음에 모여 있다.', spot: '.cell--move', cta: '칸을 눌렀다', wait: 'move' },
  { tag: '사거리', title: '빨간 칸 = 맞는 자리', body: '공격 카드의 작은 그림에서 가운데가 나, 빨간 칸이 때리는 자리.\n다가간 뒤면 슬라임이 딱 그 칸이다 — 공격 카드를 하나 놓자.', spot: '.cards__hand', cta: '공격을 놓았다', wait: 'attack' },
  { tag: '가드', title: '맞을 것 같으면 막는다', body: '슬라임은 붙으면 앞을 친다.\n「방패 세우기」를 놓으면 이번 라운드 피해를 25까지 막는다.', spot: '.cards__hand', cta: '방패를 놓았다', wait: 'guard' },
  { tag: '순서', title: '3장은 이동 → 수비 → 공격', body: '놓은 순서와 상관없이 이동이 먼저, 그다음 가드, 마지막에 공격이 풀린다.\n상대도 동시에 3장을 낸다. 준비됐으면 확정!', spot: '.cards__slots', cta: '확정 ▶', wait: 'round' },
  { tag: '유물', title: '유물은 상태바 바로 아래', body: '첫 유물 「송곳니」 — 때리면 체력 +3.\n발동하면 아이콘이 번쩍이고 숫자가 뜬다. 눌러 보면 설명.', spot: '.brelics', cta: '다음' },
  { tag: '완료', title: '이제 쓰러뜨리자', body: 'HP · 기력 · 이동 · 사거리 · 가드 · 순서 · 유물 — 이게 전부다.\n슬라임을 쓰러뜨리면 진짜 모험이 시작된다.', cta: '알겠다' },
]
const LAST = STEPS.length - 1

const card = (id: string): CardDef => {
  const c = [...COMMON_CARDS, ...getChar('warrior').basics, ...getChar('warrior').cards].find((x) => x.id === id)
  if (!c) throw new Error(`튜토리얼 카드 없음: ${id}`)
  return c
}
const DECK = ['m-up', 'm-down', 'm-left', 'm-right', 'war-cleave', 'war-hew', 'c-guard', 'c-energy'].map(card)
const SLIME = { ...monsterChar(getMonster('slime')), maxHp: 24, passive: {} } // 분열(부활) 없음 — 한 번에 끝난다
const OPTS = {
  chars: [getChar('warrior'), SLIME] as [ReturnType<typeof getChar>, ReturnType<typeof getChar>],
  // 질 수 없다 — 내가 받는 피해는 전부 막힌다. 유물 「송곳니」는 실제로 붙여 둔다.
  passives: [{ ...mergeRelics(['fang']), damageReduction: 999 }, {}] as [ReturnType<typeof mergeRelics>, ReturnType<typeof mergeRelics>],
  startCells: [{ col: 1, row: 2 }, { col: 3, row: 2 }] as [{ col: number; row: number }, { col: number; row: number }],
}

export function TutorialScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [closed, setClosed] = useState(false) // 마지막 안내를 닫으면 남은 전투는 자유롭게
  const submitted = useRef(false)
  const s = STEPS[step]
  const next = useCallback(() => setStep((n) => Math.min(LAST, n + 1)), [])

  // 슬라임은 앞을 한 번 친다(행동 고정). 확정 = 7단계 통과 조건의 절반.
  const planner: OpponentPlanner = useCallback(async () => {
    submitted.current = true
    return [card('c-strike')]
  }, [])
  // 순서 칸을 보고 "직접 해 봤다"를 알아챈다.
  const onSlots = useCallback(
    (slots: (CardDef | null)[]) => {
      const w = STEPS[step].wait
      if (w === 'move' && slots.some((c) => c?.kind === 'move')) next()
      if (w === 'attack' && slots.some((c) => c?.kind === 'attack')) next()
      if (w === 'guard' && slots.some((c) => c?.kind === 'guard')) next()
      // 라운드 재생이 끝나면 순서 칸이 비워진다 — 그때 넘어간다.
      if (w === 'round' && submitted.current && slots.every((c) => !c)) next()
    },
    [step, next],
  )

  // 스포트라이트 자리 — 무대(1280×720, 배율이 걸린다) 좌표로 바꿔 잰다.
  const host = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const stage = host.current?.closest('.stage') as HTMLElement | null
      const el = s.spot ? (document.querySelector(s.spot) as HTMLElement | null) : null
      if (!stage || !el) return setRect(null)
      const sr = stage.getBoundingClientRect()
      const k = sr.width / 1280
      const r = el.getBoundingClientRect()
      setRect({ x: (r.left - sr.left) / k - 6, y: (r.top - sr.top) / k - 6, w: r.width / k + 12, h: r.height / k + 12 })
    }
    measure()
    const t = window.setInterval(measure, 250) // 칸이 밝혀지는 시점·연출 뒤 레이아웃이 움직인다
    return () => clearInterval(t)
  }, [s.spot, step])

  // 안내판 자리 — 강조한 곳 위/아래, 무대 밖으로 안 나가게.
  const box = { w: 380, h: 230 }
  const bx = rect ? Math.min(1280 - box.w - 16, Math.max(16, rect.x + rect.w / 2 - box.w / 2)) : 450
  const by = rect ? (rect.y + rect.h + box.h + 20 < 720 ? rect.y + rect.h + 14 : Math.max(16, rect.y - box.h - 14)) : 250

  return (
    <div ref={host} className="tut">
      <BattleScreen
        p0CharId="warrior"
        p1CharId="archer"
        localSide={0}
        deck={DECK}
        battleOpts={OPTS}
        relics={['fang']}
        place="튜토리얼 · 연습용 슬라임"
        getOpponentPlan={planner}
        onSlotsChange={onSlots}
        tips={false}
        onEnd={onDone}
        onQuit={onDone}
      />
      {!closed ? (
        <>
          {rect ? (
            <div className="tut__spot" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} aria-hidden />
          ) : (
            <div className="tut__dim" aria-hidden />
          )}
          <section className="tut__coach" aria-live="polite" style={{ left: bx, top: by, width: box.w }}>
            <div className="tut__head">
              <span>
                STEP {step + 1} / {STEPS.length}
              </span>
              <span>{s.tag}</span>
            </div>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
            <div className="tut__dots">
              {STEPS.map((_, i) => (
                <i key={i} className={i <= step ? 'is-on' : ''} />
              ))}
            </div>
            <div className="tut__nav">
              <button type="button" className="tut__prev" disabled={step === 0} onClick={() => setStep((n) => Math.max(0, n - 1))}>
                이전
              </button>
              {/* 직접 해야 하는 단계는 버튼을 흐리게 — 그래도 누르면 넘어간다(막히지 않게). */}
              <button
                type="button"
                className={`tut__next ${s.wait ? 'is-wait' : ''}`}
                onClick={() => (step === LAST ? setClosed(true) : next())}
              >
                {s.cta}
              </button>
            </div>
          </section>
        </>
      ) : null}
      <button type="button" className="tut__skip" onClick={onDone}>
        튜토리얼 건너뛰기
      </button>
    </div>
  )
}
