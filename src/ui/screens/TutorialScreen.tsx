// ---------------------------------------------------------------------------
// 첫 접속 튜토리얼 — 9단계 스포트라이트 온보딩(2026-11 · 시안 Tutorial.dc.html · TutorialFlow.dc.html).
//
// 원칙(시안 그대로): ① 한 단계에 하나만 — 나머지 UI는 어둡게 ② 직접 누르게 — 설명보다 행동이
// 먼저 ③ 질 수 없다 — 상대 슬라임은 아무것도 안 한다 ④ 언제든 건너뛰기.
//
// ⚠ 스포트라이트는 시안의 좌표가 아니라 **실제 화면 요소**를 찾아 비춘다(`spot` 선택자). 전투
//   화면 배치가 바뀌어도 어긋나지 않게 하려는 것이다. 행동 단계는 화면 상태를 보고 넘어간다
//   (순서 칸이 찼는가 · 라운드가 재생되는가) — `BattleScreen`에 튜토리얼 전용 배선을 두지 않는다.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getChar } from '../../data/roster'
import { getMonster, monsterChar } from '../../game/monsters'
import { mergeRelics } from '../../game/relics'
import { BattleScreen, type OpponentPlanner } from './BattleScreen'

/** 튜토리얼 첫 유물 — 때리면 체력 +3. 발동 연출을 보여 주려고 준다. */
const TUTORIAL_RELIC = 'fang'

interface Step {
  tag: string
  title: string
  body: string
  /** 비출 요소(전투 화면 안의 선택자). 없으면 판 전체. */
  spot?: string
  /** 행동 단계 — 이 조건이 참이 되면 저절로 넘어간다(버튼 없음). */
  until?: (s: Watch) => boolean
  cta?: string
}
interface Watch {
  filled: number
  resolving: boolean
}

const STEPS: Step[] = [
  { tag: '상대', title: '한 명만 쓰러뜨리면 끝', body: '6×4 칸짜리 판 위에서 1:1로 싸운다.\n이 슬라임이 첫 상대 — 쓰러뜨리면 튜토리얼이 끝난다.', spot: '.gridboard', cta: '다음' },
  { tag: 'HP', title: 'HP — 0이 되면 진다', body: '빨간 막대가 내 체력. 상대 막대도 똑같이 읽는다.\n상대를 먼저 0으로 만들면 이긴다.', spot: '.bhud__hp', cta: '다음' },
  { tag: '기력', title: '기력(EN) — 카드의 연료', body: '공격 카드는 기력을 쓴다. 카드 위 숫자가 비용.\n매 라운드 조금씩 다시 찬다 — 한 번에 다 쓰지 말 것.', spot: '.bhud__energy', cta: '다음' },
  { tag: '이동', title: '판을 눌러 다가가기', body: '노랗게 깜빡이는 칸을 눌러 보자.\n그 칸으로 가는 이동 카드가 1번 칸에 담긴다.', spot: '.gridboard', until: (s) => s.filled >= 1 },
  { tag: '사거리', title: '빨간 칸 = 맞는 자리', body: '공격 카드의 작은 그림에서 가운데가 나, 빨간 칸이 때리는 자리.\n공격 카드 하나를 눌러 순서 칸에 담아 보자.', spot: '.cards__hand', until: (s) => s.filled >= 2 },
  { tag: '가드', title: '맞을 것 같으면 막는다', body: '「방패 세우기」·「버티기」 같은 가드 카드는 이번 라운드 피해를 막는다.\n하나를 순서 칸에 담아 보자.', spot: '.cards__hand', until: (s) => s.filled >= 3 },
  { tag: '순서', title: '3장은 이동 → 수비 → 공격', body: '놓은 순서와 상관없이 이동이 먼저, 그다음 가드, 마지막에 공격이 풀린다.\n상대도 동시에 3장을 낸다. 준비됐으면 확정!', spot: '.cards__slots', until: (s) => s.resolving },
  { tag: '유물', title: '유물은 상태바 바로 아래', body: '첫 유물 「송곳니」를 얻었다 — 때리면 체력 +3.\n발동하면 아이콘이 번쩍이고 숫자가 뜬다. 눌러 보면 설명.', spot: '.brelics', cta: '다음' },
]

/** 무대(1280×720 좌표) 기준 사각형 — 무대가 배율로 줄어 있어도 그 안 좌표로 돌려준다. */
function stageRect(host: HTMLElement | null, sel?: string) {
  const stage = host?.parentElement
  const el = sel ? stage?.querySelector(sel) : null
  if (!stage || !el) return null
  const s = stage.getBoundingClientRect()
  const k = s.width / stage.offsetWidth || 1
  const r = el.getBoundingClientRect()
  return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k }
}

export function TutorialScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [won, setWon] = useState(false)
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const cur = STEPS[step] as Step | undefined

  // 상대는 아무것도 안 한다 — 질 수 없는 첫 판(시안 원칙 ③).
  const dummyPlanner: OpponentPlanner = useCallback(async () => [], [])
  const opts = useMemo(() => {
    const slime = monsterChar(getMonster('slime'))
    return {
      chars: [getChar('warrior'), slime] as [ReturnType<typeof getChar>, typeof slime],
      passives: [mergeRelics([TUTORIAL_RELIC]), slime.passive] as [ReturnType<typeof mergeRelics>, typeof slime.passive],
    }
  }, [])

  // 스포트라이트 위치 + 행동 단계 감시. 화면 상태를 짧게 들여다본다(전투 쪽 배선 없이).
  useEffect(() => {
    if (!cur) return
    const tick = () => {
      const stage = hostRef.current?.parentElement
      setRect(stageRect(hostRef.current, cur.spot))
      if (cur.until && stage) {
        const watch: Watch = {
          filled: stage.querySelectorAll('.slot--filled').length,
          resolving: !!stage.querySelector('.cards--resolving'),
        }
        if (cur.until(watch)) setStep((n) => n + 1)
      }
    }
    tick()
    const id = window.setInterval(tick, 200)
    return () => window.clearInterval(id)
  }, [cur])

  const pad = 8
  const r = rect ?? { x: 150, y: 290, w: 980, h: 292 }
  const bubbleTop = r.y + r.h + 20 > 520 ? Math.max(20, r.y - 200) : r.y + r.h + 20
  const bubbleLeft = Math.min(Math.max(20, r.x), 1280 - 460)

  return (
    <>
      <BattleScreen
        p0CharId="warrior"
        p1CharId="archer"
        localSide={0}
        battleOpts={opts}
        relics={[TUTORIAL_RELIC]}
        getOpponentPlan={dummyPlanner}
        onEnd={() => setWon(true)}
        onQuit={onDone}
      />
      <div ref={hostRef} className="tut" aria-live="polite">
        {cur && !won && (
          <>
            <div
              className={`tut__spot ${cur.until ? 'is-act' : ''}`}
              style={{ left: r.x - pad, top: r.y - pad, width: r.w + pad * 2, height: r.h + pad * 2 }}
            />
            <div className="tut__bubble" style={{ left: bubbleLeft, top: bubbleTop }}>
              <div className="tut__head">
                <span className="tut__tag">{cur.tag}</span>
                <span className="tut__n">
                  {step + 1} / {STEPS.length + 1}
                </span>
              </div>
              <b>{cur.title}</b>
              <p>{cur.body}</p>
              {cur.cta ? (
                <button type="button" className="tut__cta" onClick={() => setStep((n) => n + 1)}>
                  {cur.cta}
                </button>
              ) : (
                <span className="tut__act">직접 해 보자 ↑</span>
              )}
            </div>
          </>
        )}
        {won && (
          <div className="tut__bubble tut__bubble--end">
            <div className="tut__head">
              <span className="tut__tag">완료</span>
              <span className="tut__n">
                {STEPS.length + 1} / {STEPS.length + 1}
              </span>
            </div>
            <b>첫 승리!</b>
            <p>HP · 기력 · 이동 · 사거리 · 가드 · 순서 · 유물 — 이게 전부다.{'\n'}이제 진짜 모험을 시작하자.</p>
            <button type="button" className="tut__cta" onClick={onDone}>
              모험 시작 ▶
            </button>
          </div>
        )}
        <button type="button" className="tut__skip" onClick={onDone}>
          건너뛰기 ✕
        </button>
      </div>
    </>
  )
}
