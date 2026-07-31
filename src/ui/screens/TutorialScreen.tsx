import { useCallback, useState } from 'react'
import { BattleScreen, type OpponentPlanner } from './BattleScreen'

// 턴 진행에 따라 바뀌는 코치 멘트. 상대(훈련 더미)는 아무것도 하지 않아
// 이동 → 공격 → 회복만 따라 해도 가볍게 이길 수 있다.
const TIPS = [
  '이동 탭에서 이동 카드 3장을 슬롯에 넣고 [실행 ▶] — 상대에게 다가가 보세요!',
  '공격 탭의 카드를 골라보세요. 카드의 미니 격자가 때리는 칸입니다. 상대가 그 칸에 있으면 명중!',
  '기력(⚡)이 부족하면 수비 탭의 [원기 회복], 맞을 것 같으면 [가드]로 막으세요.',
  '이제 자유롭게! 상대 HP를 0으로 만들면 승리합니다.',
]

/** 첫 접속 튜토리얼 — 움직이지 않는 훈련 더미를 상대로 기본 조작을 익힌다. */
export function TutorialScreen({ onDone }: { onDone: () => void }) {
  const [tipIndex, setTipIndex] = useState(0)

  // 더미의 플랜은 항상 빈 손 — 한 턴이 해소될 때마다 다음 팁으로 넘어간다.
  const dummyPlanner: OpponentPlanner = useCallback(async () => {
    setTipIndex((i) => Math.min(i + 1, TIPS.length - 1))
    return []
  }, [])

  return (
    <>
      <BattleScreen
        p0CharId="warrior"
        p1CharId="archer"
        localSide={0}
        getOpponentPlan={dummyPlanner}
        onEnd={onDone}
        onQuit={onDone}
      />
      <div className="tut-tip">
        <span className="tut-tip__badge">튜토리얼</span>
        <span className="tut-tip__text">{TIPS[tipIndex]}</span>
        <button className="tut-tip__skip" onClick={onDone}>
          건너뛰기 ✕
        </button>
      </div>
    </>
  )
}
