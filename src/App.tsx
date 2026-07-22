import { useCallback, useEffect, useMemo, useState } from 'react'
import './ui/ui.css'
import { useStageScale } from './ui/useStageScale'
import { useAuth } from './ui/useAuth'
import { signOutUser } from './net/auth'
import { ROSTER } from './data/roster'
import { decideAI } from './battle/ai'
import type { CardDef } from './battle/types'
import { assembleDeck, presetDeck, saveDeck, type Deck } from './game/decks'
import { createPlanExchange } from './net/session'
import { LoginScreen } from './ui/screens/LoginScreen'
import { TitleScreen } from './ui/screens/TitleScreen'
import { CodexScreen } from './ui/screens/CodexScreen'
import { DeckManagerScreen } from './ui/screens/DeckManagerScreen'
import { DeckBuilderScreen } from './ui/screens/DeckBuilderScreen'
import { DeckSelectScreen } from './ui/screens/DeckSelectScreen'
import { ModeSelectScreen } from './ui/screens/ModeSelectScreen'
import { BattleScreen } from './ui/screens/BattleScreen'
import { MultiplayerLobby, type MatchReady } from './ui/screens/MultiplayerLobby'
import { ResultScreen, type Outcome } from './ui/screens/ResultScreen'
import { TutorialScreen } from './ui/screens/TutorialScreen'

const TUTORIAL_DONE_KEY = 'gb-tutorial-done'
/** 온라인 대전 턴 제한(초). 0이 되면 자동 제출 — 상대를 무한정 기다리지 않게. */
const MP_TURN_SECONDS = 30

type Phase =
  | 'tutorial'
  | 'title'
  | 'codex'
  | 'deck-manage'
  | 'deck-build'
  | 'deck-select'
  | 'mode-select'
  | 'fight'
  | 'result'
  | 'mp-lobby'
  | 'mp-fight'
  | 'mp-result'

interface BotMatch {
  oppCharId: string
  oppDeckCards: CardDef[]
}

export default function App() {
  const stageFit = useStageScale()
  const { user, loading: authLoading } = useAuth()
  const [phase, setPhase] = useState<Phase>('title')
  // 선택한 덱(전투용) + 편집 중인 덱(빌더) + 봇 상대
  const [deck, setDeck] = useState<Deck | null>(null)
  const [editingDeck, setEditingDeck] = useState<Deck | undefined>(undefined)
  const [botMatch, setBotMatch] = useState<BotMatch | null>(null)
  const [outcome, setOutcome] = useState<Outcome>('win')
  // --- online multiplayer ---
  const [mpMatch, setMpMatch] = useState<MatchReady | null>(null)
  const [mpOutcome, setMpOutcome] = useState<Outcome>('win')

  const toTitle = useCallback(() => setPhase('title'), [])

  // 첫 접속(이 기기에서 튜토리얼 미완료)이면 로그인 직후 튜토리얼로 진입
  useEffect(() => {
    if (user && !localStorage.getItem(TUTORIAL_DONE_KEY)) setPhase('tutorial')
  }, [user])

  const tutorialDone = useCallback(() => {
    localStorage.setItem(TUTORIAL_DONE_KEY, '1')
    setPhase('title')
  }, [])

  const onLogout = useCallback(() => {
    setMpMatch((m) => {
      m?.transport.close()
      return null
    })
    setPhase('title')
    void signOutUser() // auth listener swaps to the login screen
  }, [])

  // -- deck build / manage ---------------------------------------------------
  const onSaveDeck = useCallback((d: Deck) => {
    saveDeck(d)
    setPhase('deck-manage')
  }, [])

  // -- deck select → mode → battle -------------------------------------------
  const pickDeck = useCallback((d: Deck) => {
    setDeck(d)
    setPhase('mode-select')
  }, [])

  // 봇전(1:1 단판): 상대는 나와 다른 캐릭터를 랜덤으로, 프리셋 덱을 쓴다.
  const startBot = useCallback(() => {
    setDeck((d) => {
      if (!d) return d
      const pool = ROSTER.filter((c) => c.id !== d.charId)
      const opp = pool[Math.floor(Math.random() * pool.length)]
      setBotMatch({ oppCharId: opp.id, oppDeckCards: assembleDeck(presetDeck(opp.id)) })
      setPhase('fight')
      return d
    })
  }, [])

  const onFightEnd = useCallback((playerWon: boolean) => {
    setOutcome(playerWon ? 'win' : 'loss')
    setPhase('result')
  }, [])

  // -- online multiplayer ----------------------------------------------------
  const leaveMp = useCallback(() => {
    setMpMatch((m) => {
      m?.transport.close()
      return null
    })
    setPhase('title')
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

  const localCards = useMemo(() => (deck ? assembleDeck(deck) : null), [deck])

  let screen: React.ReactNode = null
  if (phase === 'tutorial') {
    screen = <TutorialScreen onDone={tutorialDone} />
  } else if (phase === 'title') {
    screen = (
      <TitleScreen
        user={user}
        onLogout={onLogout}
        onStart={() => setPhase('deck-select')}
        onDecks={() => setPhase('deck-manage')}
        onCodex={() => setPhase('codex')}
      />
    )
  } else if (phase === 'codex') {
    screen = <CodexScreen onBack={toTitle} />
  } else if (phase === 'deck-manage') {
    screen = (
      <DeckManagerScreen
        onNew={() => {
          setEditingDeck(undefined)
          setPhase('deck-build')
        }}
        onEdit={(d) => {
          setEditingDeck(d)
          setPhase('deck-build')
        }}
        onBack={toTitle}
      />
    )
  } else if (phase === 'deck-build') {
    screen = (
      <DeckBuilderScreen
        editing={editingDeck}
        onSave={onSaveDeck}
        onCancel={() => setPhase('deck-manage')}
      />
    )
  } else if (phase === 'deck-select') {
    screen = (
      <DeckSelectScreen
        onSelect={pickDeck}
        onManage={() => setPhase('deck-manage')}
        onBack={toTitle}
      />
    )
  } else if (phase === 'mode-select' && deck) {
    screen = (
      <ModeSelectScreen
        deck={deck}
        onBot={startBot}
        onOnline={() => setPhase('mp-lobby')}
        onBack={() => setPhase('deck-select')}
      />
    )
  } else if (phase === 'fight' && deck && localCards && botMatch) {
    screen = (
      <BattleScreen
        key={`bot-${deck.id}-${botMatch.oppCharId}`}
        p0CharId={deck.charId}
        p1CharId={botMatch.oppCharId}
        localSide={0}
        deck={localCards}
        getOpponentPlan={(_localPlan, b) =>
          Promise.resolve(decideAI(b.state, 1, b.chars[1], 'hard', botMatch.oppDeckCards))
        }
        onEnd={onFightEnd}
        onQuit={toTitle}
      />
    )
  } else if (phase === 'result' && deck) {
    screen = (
      <ResultScreen
        outcome={outcome}
        playerCharId={deck.charId}
        variant="single"
        onNext={startBot}
        onRetry={startBot}
        onMenu={toTitle}
      />
    )
  } else if (phase === 'mp-lobby' && deck) {
    screen = <MultiplayerLobby myCharId={deck.charId} onReady={mpOnReady} onBack={() => setPhase('mode-select')} />
  } else if (phase === 'mp-fight' && mpMatch && mpExchange && localCards) {
    screen = (
      <BattleScreen
        key={`mp-${mpMatch.p0CharId}-${mpMatch.p1CharId}`}
        p0CharId={mpMatch.p0CharId}
        p1CharId={mpMatch.p1CharId}
        localSide={mpMatch.localSide}
        deck={localCards}
        getOpponentPlan={mpExchange.getOpponentPlan}
        turnSeconds={MP_TURN_SECONDS}
        onEnd={mpFightEnd}
        onQuit={leaveMp}
      />
    )
  } else if (phase === 'mp-result' && mpMatch) {
    screen = (
      <ResultScreen
        outcome={mpOutcome}
        playerCharId={deck?.charId ?? mpMatch.p0CharId}
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
      <div
        className="stage"
        style={{
          width: stageFit.width,
          height: stageFit.height,
          transform: stageFit.transform,
        }}
      >
        {gated}
      </div>
    </div>
  )
}
