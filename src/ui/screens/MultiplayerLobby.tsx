import { useEffect, useRef, useState } from 'react'
import { getChar } from '../../data/roster'
import { PortraitSvg } from '../PortraitSvg'
import { firebaseConfigured, hostRoom, joinRoom } from '../../net/firebase'
import type { NetTransport } from '../../net/protocol'

export interface MatchReady {
  transport: NetTransport
  localSide: 0 | 1
  p0CharId: string
  p1CharId: string
}

type Role = 'host' | 'guest'
type Cancelable = { cancel(): void }

/** Exchange `hello` so each peer learns the other's avatar, then build the
 *  canonical match (host = side 0, guest = side 1). */
function finishHandshake(transport: NetTransport, role: Role, myCharId: string): Promise<MatchReady> {
  return new Promise((resolve) => {
    const off = transport.onMessage((m) => {
      if (m.t !== 'hello') return
      off()
      resolve({
        transport,
        localSide: role === 'host' ? 0 : 1,
        p0CharId: role === 'host' ? myCharId : m.charId,
        p1CharId: role === 'host' ? m.charId : myCharId,
      })
    })
    transport.send({ t: 'hello', charId: myCharId })
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
  const [role, setRole] = useState<Role | null>(null)
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
    finishHandshake(transport, r, myCharId).then((m) => {
      done.current = true
      onReady(m)
    })
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
            <p className="mp__lead">친구와 1:1 대전. 6자리 코드를 주고받아 연결합니다.</p>
            <div className="mp__roles">
              <button className="btn mp__rolebtn" onClick={startHost}>
                <span className="mp__roleicon">🛰</span>방 만들기 (호스트)
                <span className="mp__rolehint">코드를 만들어 친구에게 알려줍니다.</span>
              </button>
              <button className="btn btn--ghost mp__rolebtn" onClick={startGuest}>
                <span className="mp__roleicon">🔗</span>참가하기 (게스트)
                <span className="mp__rolehint">친구의 6자리 코드를 입력해 참가합니다.</span>
              </button>
            </div>
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
      <div className="scanlines" />
    </div>
  )
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
