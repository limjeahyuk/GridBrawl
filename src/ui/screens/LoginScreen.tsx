import { useState } from 'react'
import { authConfigured, signInWithGoogle } from '../../net/auth'

/** App-wide gate: the player signs in with Google before reaching the title. */
export function LoginScreen() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const configured = authConfigured()

  const onGoogle = async () => {
    setError(null)
    setBusy(true)
    try {
      await signInWithGoogle()
      // on success the auth listener swaps this screen out
    } catch (e) {
      const code = (e as { code?: string })?.code
      setError(
        code === 'auth/popup-closed-by-user'
          ? '로그인 창이 닫혔습니다. 다시 시도하세요.'
          : code === 'auth/unauthorized-domain'
            ? '이 도메인은 Firebase 인증에 등록되어 있지 않습니다. (콘솔 → Authentication → 승인된 도메인)'
            : e instanceof Error
              ? e.message
              : '로그인에 실패했습니다.',
      )
      setBusy(false)
    }
  }

  return (
    <div className="screen login">
      <div className="grid-bg" />
      <div className="login__content">
        <div className="title__kicker neon-text">THE GRID · DEMON GAUNTLET</div>
        <h1 className="title__logo">
          <span className="title__word title__word--a">GRID</span>
          <span className="title__word title__word--b">BRAWL</span>
        </h1>
        <p className="login__lead">계정으로 로그인하고 그리드에 입장하세요.</p>

        {configured ? (
          <>
            <button className="btn login__google" onClick={onGoogle} disabled={busy}>
              <GoogleMark />
              {busy ? '로그인 중…' : 'Google로 로그인'}
            </button>
            {error && <p className="login__error">{error}</p>}
          </>
        ) : (
          <div className="login__setup">
            <p className="login__setup-title">로그인이 아직 설정되지 않았습니다.</p>
            <p className="login__hint">
              <code>.env</code> 에 <code>VITE_FIREBASE_API_KEY</code> 를 추가하고, Firebase 콘솔의
              Authentication → 로그인 방법에서 <b>Google</b> 공급업체를 활성화하세요. 자세한 절차는{' '}
              <code>.env.example</code> 참고.
            </p>
          </div>
        )}
      </div>
      <div className="scanlines" />
    </div>
  )
}

function GoogleMark() {
  return (
    <svg className="login__gmark" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}
