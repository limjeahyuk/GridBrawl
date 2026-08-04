import { useEffect, useRef, useState } from 'react'
import { RULES_VERSION } from '../../battle/types'
import { getChar } from '../../data/roster'
import { PortraitSvg } from '../PortraitSvg'
import { firebaseConfigured, hostRoom, joinRoom } from '../../net/firebase'
import { startQuickMatch } from '../../net/matchmaking'
import type { NetTransport } from '../../net/protocol'

export interface MatchReady {
  transport: NetTransport
  localSide: 0 | 1
  p0CharId: string
  p1CharId: string
}

type Role = 'host' | 'guest'
/** 로비 화면 모드: 코드 방 만들기/참가 + 빠른 대전(랜덤 매칭). */
type Mode = Role | 'quick'
type Cancelable = { cancel(): void }

/** ⚠ 빠른 대전(랜덤 매칭) 일시 중단(2026-08-04, 사용자 결정). PVP는 방 만들기·방 찾기
 *  두 경로로만 간다. 코드는 `net/matchmaking.ts`째로 남겨 뒀으니 이 값만 true로
 *  되돌리면 버튼·대기 화면이 그대로 살아난다 — 되살릴 땐 RTDB 대기열(`gridbrawl-mm`)
 *  규칙과 `RULES_VERSION` 필터가 아직 열려 있는지 함께 확인할 것. */
const QUICK_MATCH_ENABLED = false

/** 룰셋이 다른 상대와는 붙지 않는다. 락스텝은 양쪽이 같은 엔진을 돌린다는
 *  전제 위에 서 있어서, 버전이 어긋나면 화면이 조용히 갈린다(desync). 양쪽이
 *  서로에게 hello를 보내므로 판정도 양쪽에서 똑같이 난다. */
export const VERSION_MISMATCH =
  '상대와 게임 버전이 다릅니다. 앱을 최신으로 업데이트한 뒤 다시 시도하세요.'

/** Exchange `hello` so each peer learns the other's avatar and ruleset version,
 *  then build the canonical match (host = side 0, guest = side 1). */
function finishHandshake(transport: NetTransport, role: Role, myCharId: string): Promise<MatchReady> {
  return new Promise((resolve, reject) => {
    const off = transport.onMessage((m) => {
      if (m.t !== 'hello') return
      off()
      if (m.rules !== RULES_VERSION) {
        transport.close()
        reject(new Error(VERSION_MISMATCH))
        return
      }
      resolve({
        transport,
        localSide: role === 'host' ? 0 : 1,
        p0CharId: role === 'host' ? myCharId : m.charId,
        p1CharId: role === 'host' ? m.charId : myCharId,
      })
    })
    transport.send({ t: 'hello', charId: myCharId, rules: RULES_VERSION })
  })
}

export function MultiplayerLobby({
  myCharId,
  onReady,
  onBack,
}: {
  myCharId: string
  onReady: (m: MatchReady) => void
  onBack: () => void
}) {
  const me = getChar(myCharId)
  const configured = firebaseConfigured()
  const [role, setRole] = useState<Mode | null>(null)
  const [code, setCode] = useState('') // host: shown / guest: typed
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const roomRef = useRef<Cancelable | null>(null)
  const done = useRef(false)

  // tear down a half-open room if we leave before the match starts
  useEffect(
    () => () => {
      if (!done.current) roomRef.current?.cancel()
    },
    [],
  )

  const ready = (transport: NetTransport, r: Role) => {
    setStatus('연결됨! 상대 정보 교환 중…')
    finishHandshake(transport, r, myCharId)
      .then((m) => {
        done.current = true
        onReady(m)
      })
      .catch((e) => {
        // 룰셋 불일치 등 — 연결은 finishHandshake가 이미 닫았다. 로비로 되돌린다.
        roomRef.current?.cancel()
        roomRef.current = null
        setRole(null)
        setBusy(false)
        setStatus('')
        setError(msg(e))
      })
  }

  const startQuick = () => {
    setRole('quick')
    setError('')
    setBusy(true)
    setStatus('상대를 찾는 중… 첫 상대가 잡히면 자동으로 시작됩니다.')
    try {
      const ticket = startQuickMatch()
      roomRef.current = ticket
      // ⚠ catch가 없으면 대기열 쓰기가 거부돼도(예: RTDB 규칙) 화면은 "상대를 찾는 중…"
      //   에서 영원히 돈다 — 실패가 비동기 루프 안에서 나기 때문.
      void ticket.matched
        .then(({ transport, role: r }) => ready(transport, r))
        .catch((e) => {
          roomRef.current = null
          setRole(null)
          setBusy(false)
          setStatus('')
          setError(msg(e))
        })
    } catch (e) {
      setBusy(false)
      setError(msg(e))
      setRole(null)
    }
  }

  const startHost = async () => {
    setRole('host')
    setError('')
    setBusy(true)
    setStatus('방 코드 생성 중…')
    try {
      const room = await hostRoom()
      roomRef.current = room
      setCode(room.code)
      setBusy(false)
      setStatus('상대가 코드를 입력하면 자동으로 시작됩니다…')
      const transport = await room.connected
      ready(transport, 'host')
    } catch (e) {
      setBusy(false)
      setError(msg(e))
    }
  }

  const startGuest = () => {
    setRole('guest')
    setError('')
    setCode('')
    setStatus('호스트에게 받은 6자리 코드를 입력하세요.')
  }

  const guestJoin = async () => {
    const c = code.trim().toUpperCase()
    if (c.length < 4) return
    setError('')
    setBusy(true)
    setStatus('연결 중…')
    try {
      const room = await joinRoom(c)
      roomRef.current = room
      const transport = await room.connected
      ready(transport, 'guest')
    } catch (e) {
      setBusy(false)
      setError(msg(e))
      setStatus('')
    }
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard may be blocked; the code is shown for manual copy */
    }
  }

  return (
    <div className="screen mp">
      <div className="grid-bg" />
      <div className="mp__header">
        <button className="btn btn--ghost" onClick={onBack}>
          ◀ 뒤로
        </button>
        <h2 className="neon-text">온라인 대전</h2>
        <div className="mp__me" style={{ ['--accent' as string]: me.accent }}>
          <PortraitSvg char={me} className="mp__me-art" />
          <span>{me.name}</span>
        </div>
      </div>

      <div className="mp__body">
        {!configured ? (
          <div className="mp__notice">
            <p className="mp__lead">온라인 대전을 사용하려면 시그널링 서버 설정이 필요합니다.</p>
            <p className="mp__notice-detail">
              Firebase Realtime Database를 만들고 <code>.env</code> 파일에
              <br />
              <code>VITE_FIREBASE_DB_URL=https://…firebasedatabase.app</code> 을 추가한 뒤 다시 실행하세요.
              <br />
              자세한 안내는 <code>.env.example</code> 와 <code>docs/GAME_DESIGN.md</code> 참고.
            </p>
          </div>
        ) : role === null ? (
          <div className="mp__choose">
            <p className="mp__lead">1:1 온라인 대전 — 방을 만들거나, 친구의 코드로 방을 찾습니다.</p>
            <div className="mp__roles">
              {QUICK_MATCH_ENABLED && (
                <button className="btn btn--online mp__rolebtn" onClick={startQuick}>
                  <span className="mp__roleicon">⚡</span>빠른 대전
                  <span className="mp__rolehint">대기 중인 아무 상대와 자동으로 매칭됩니다.</span>
                </button>
              )}
              <button className="btn btn--online mp__rolebtn" onClick={startHost}>
                <span className="mp__roleicon">🛰</span>방 만들기 (호스트)
                <span className="mp__rolehint">코드를 만들어 친구에게 알려줍니다.</span>
              </button>
              <button className="btn mp__rolebtn" onClick={startGuest}>
                <span className="mp__roleicon">🔗</span>방 찾기 (게스트)
                <span className="mp__rolehint">친구의 6자리 코드를 입력해 참가합니다.</span>
              </button>
            </div>
          </div>
        ) : role === 'quick' ? (
          <div className="mp__flow">
            <div className="mp__codelabel">빠른 대전</div>
            <div className="mp__searching">
              <span className="mp__searching-dot" />
              상대를 찾는 중…
            </div>
            <button
              className="btn btn--ghost"
              onClick={() => {
                roomRef.current?.cancel()
                roomRef.current = null
                setRole(null)
                setBusy(false)
                setStatus('')
              }}
            >
              찾기 중단
            </button>
          </div>
        ) : role === 'host' ? (
          <div className="mp__flow">
            <div className="mp__codelabel">방 코드 — 친구에게 알려주세요</div>
            <div className="mp__code">{code || (busy ? '· · · · · ·' : '')}</div>
            {code && (
              <button className="btn btn--ghost mp__copy" onClick={copyCode}>
                {copied ? '복사됨 ✓' : '코드 복사'}
              </button>
            )}
          </div>
        ) : (
          <div className="mp__flow">
            <div className="mp__codelabel">호스트의 6자리 코드를 입력하세요</div>
            <input
              className="mp__codeinput"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
              onKeyDown={(e) => e.key === 'Enter' && guestJoin()}
              placeholder="ABC123"
              maxLength={8}
              autoFocus
              spellCheck={false}
            />
            <button
              className={`btn mp__go ${code.trim().length >= 4 && !busy ? '' : 'is-disabled'}`}
              disabled={code.trim().length < 4 || busy}
              onClick={guestJoin}
            >
              연결하기 ▶
            </button>
          </div>
        )}

        {status && <div className="mp__status">{status}</div>}
        {error && <div className="mp__error">{error}</div>}
      </div>
    </div>
  )
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
