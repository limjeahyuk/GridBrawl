import { useCallback, useState } from 'react'
import './ui/ui.css'
import { useStageScale } from './ui/useStageScale'
import { buildGauntlet, isFinalMatch, type Gauntlet } from './game/tournament'
import { TitleScreen } from './ui/screens/TitleScreen'
import { CharacterSelect } from './ui/screens/CharacterSelect'
import { BracketScreen } from './ui/screens/BracketScreen'
import { BattleScreen } from './ui/screens/BattleScreen'
import { ResultScreen, type Outcome } from './ui/screens/ResultScreen'

type Phase = 'title' | 'select' | 'bracket' | 'fight' | 'result'

export default function App() {
  const scale = useStageScale()
  const [phase, setPhase] = useState<Phase>('title')
  const [gauntlet, setGauntlet] = useState<Gauntlet | null>(null)
  const [outcome, setOutcome] = useState<Outcome>('win')

  const toTitle = useCallback(() => {
    setGauntlet(null)
    setPhase('title')
  }, [])

  const confirmChar = useCallback((id: string) => {
    setGauntlet(buildGauntlet(id))
    setPhase('bracket')
  }, [])

  const onFightEnd = useCallback((playerWon: boolean) => {
    setGauntlet((g) => {
      if (g && playerWon) setOutcome(isFinalMatch(g) ? 'champion' : 'win')
      else setOutcome('loss')
      return g
    })
    setPhase('result')
  }, [])

  const resultNext = useCallback(() => {
    setGauntlet((g) => (g ? { ...g, index: g.index + 1, wins: g.wins + 1 } : g))
    setPhase('bracket')
  }, [])

  const resultRetry = useCallback(() => setPhase('fight'), [])

  let screen: React.ReactNode = null
  if (phase === 'title') {
    screen = <TitleScreen onStart={() => setPhase('select')} />
  } else if (phase === 'select') {
    screen = <CharacterSelect onConfirm={confirmChar} onBack={toTitle} />
  } else if (phase === 'bracket' && gauntlet) {
    screen = (
      <BracketScreen gauntlet={gauntlet} onFight={() => setPhase('fight')} onMenu={toTitle} />
    )
  } else if (phase === 'fight' && gauntlet) {
    const opp = gauntlet.opponents[gauntlet.index]
    screen = (
      <BattleScreen
        key={`${gauntlet.index}-${opp.charId}`}
        playerCharId={gauntlet.playerCharId}
        opponent={opp}
        onEnd={onFightEnd}
        onQuit={() => setPhase('bracket')}
      />
    )
  } else if (phase === 'result' && gauntlet) {
    screen = (
      <ResultScreen
        outcome={outcome}
        playerCharId={gauntlet.playerCharId}
        onNext={resultNext}
        onRetry={resultRetry}
        onMenu={toTitle}
      />
    )
  }

  return (
    <div className="viewport">
      <div className="stage" style={{ transform: `scale(${scale})` }}>
        {screen}
      </div>
    </div>
  )
}
