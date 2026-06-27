import { useCallback, useEffect, useMemo, useState } from 'react'
import './ui/ui.css'
import { useStageScale } from './ui/useStageScale'
import { useAuth } from './ui/useAuth'
import { signOutUser } from './net/auth'
import { buildGauntlet, isFinalMatch, type Gauntlet } from './game/tournament'
import { decideAI } from './battle/ai'
import { createPlanExchange } from './net/session'
import { LoginScreen } from './ui/screens/LoginScreen'
import { TitleScreen } from './ui/screens/TitleScreen'
import { CharacterSelect } from './ui/screens/CharacterSelect'
import { BracketScreen } from './ui/screens/BracketScreen'
import { BattleScreen } from './ui/screens/BattleScreen'
import { MultiplayerLobby, type MatchReady } from './ui/screens/MultiplayerLobby'
import { ResultScreen, type Outcome } from './ui/screens/ResultScreen'

type Phase =
  | 'title'
  | 'select'
  | 'bracket'
  | 'fight'
  | 'result'
  | 'mp-select'
  | 'mp-lobby'
  | 'mp-fight'
  | 'mp-result'

export default function App() {
  const scale = useStageScale()
  const { user, loading: authLoading } = useAuth()
  const [phase, setPhase] = useState<Phase>('title')
  const [gauntlet, setGauntlet] = useState<Gauntlet | null>(null)
  const [outcome, setOutcome] = useState<Outcome>('win')
  // --- online multiplayer ---
  const [mpCharId, setMpCharId] = useState<string | null>(null)
  const [mpMatch, setMpMatch] = useState<MatchReady | null>(null)
  const [mpOutcome, setMpOutcome] = useState<Outcome>('win')

  const toTitle = useCallback(() => {
    setGauntlet(null)
    setPhase('title')
  }, [])

  const onLogout = useCallback(() => {
    setMpMatch((m) => {
      m?.transport.close()
      return null
    })
    setMpCharId(null)
    setGauntlet(null)
    setPhase('title')
    void signOutUser() // auth listener swaps to the login screen
  }, [])

  // -- single-player gauntlet ------------------------------------------------
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

  // -- online multiplayer ----------------------------------------------------
  const leaveMp = useCallback(() => {
    setMpMatch((m) => {
      m?.transport.close()
      return null
    })
    setMpCharId(null)
    setPhase('title')
  }, [])

  const mpConfirmChar = useCallback((id: string) => {
    setMpCharId(id)
    setPhase('mp-lobby')
  }, [])

  const mpOnReady = useCallback((m: MatchReady) => {
    setMpMatch(m)
    setPhase('mp-fight')
  }, [])

  const mpFightEnd = useCallback((localWon: boolean) => {
    setMpOutcome(localWon ? 'win' : 'loss')
    setPhase('mp-result')
  }, [])

  // one plan-exchange per connected match; disposed when the match changes
  const mpExchange = useMemo(
    () => (mpMatch ? createPlanExchange(mpMatch.transport, mpMatch.localSide) : null),
    [mpMatch],
  )
  useEffect(() => () => mpExchange?.dispose(), [mpExchange])

  let screen: React.ReactNode = null
  if (phase === 'title') {
    screen = (
      <TitleScreen
        user={user}
        onLogout={onLogout}
        onStart={() => setPhase('select')}
        onOnline={() => setPhase('mp-select')}
      />
    )
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
        p0CharId={gauntlet.playerCharId}
        p1CharId={opp.charId}
        localSide={0}
        getOpponentPlan={(_localPlan, b) =>
          Promise.resolve(decideAI(b.state, 1, b.chars[1], opp.difficulty))
        }
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
  } else if (phase === 'mp-select') {
    screen = <CharacterSelect onConfirm={mpConfirmChar} onBack={toTitle} />
  } else if (phase === 'mp-lobby' && mpCharId) {
    screen = (
      <MultiplayerLobby myCharId={mpCharId} onReady={mpOnReady} onBack={leaveMp} />
    )
  } else if (phase === 'mp-fight' && mpMatch && mpExchange) {
    screen = (
      <BattleScreen
        key={`mp-${mpMatch.p0CharId}-${mpMatch.p1CharId}`}
        p0CharId={mpMatch.p0CharId}
        p1CharId={mpMatch.p1CharId}
        localSide={mpMatch.localSide}
        getOpponentPlan={mpExchange.getOpponentPlan}
        onEnd={mpFightEnd}
        onQuit={leaveMp}
      />
    )
  } else if (phase === 'mp-result' && mpMatch) {
    screen = (
      <ResultScreen
        outcome={mpOutcome}
        playerCharId={mpCharId ?? mpMatch.p0CharId}
        variant="versus"
        onNext={leaveMp}
        onRetry={leaveMp}
        onMenu={leaveMp}
      />
    )
  }

  // app-wide gate: wait for auth to resolve, then require a signed-in user
  const gated = authLoading ? (
    <div className="screen login">
      <div className="grid-bg" />
      <div className="login__content">
        <p className="login__lead">접속 중…</p>
      </div>
      <div className="scanlines" />
    </div>
  ) : !user ? (
    <LoginScreen />
  ) : (
    screen
  )

  return (
    <div className="viewport">
      <div className="stage" style={{ transform: `scale(${scale})` }}>
        {gated}
      </div>
    </div>
  )
}
