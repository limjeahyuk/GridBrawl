import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { authConfigured, signInAsGuest, signInWithGoogle } from '../../net/auth'

// 네이티브 앱(WebView)에서는 구글이 임베디드 WebView OAuth를 차단하므로
// (disallowed_useragent) 팝업 로그인을 숨기고 게스트를 기본으로 쓴다.
// 구글 로그인은 추후 네이티브 플러그인(토큰 → Firebase 연동)으로 지원 예정.
const isNativeApp = Capacitor.isNativePlatform()

/** App-wide gate: the player signs in before reaching the title. */
export function LoginScreen() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const configured = authConfigured() && !isNativeApp

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
            : code === 'auth/network-request-failed'
              ? '네트워크에 연결되어 있지 않습니다. 게스트로 시작하면 오프라인에서도 플레이할 수 있습니다.'
              : e instanceof Error
                ? e.message
                : '로그인에 실패했습니다.',
      )
      setBusy(false)
    }
  }

  return (
    <div className="screen login">
      <div className="grid-bg grid-bg--hall" />
      <div className="login__content">
        {/* ⚠ 타이틀 화면과 같은 문구를 쓴다(TitleScreen 참고) — 로그인 직후 타이틀로
            넘어가므로 다르면 글자만 바뀌어 깜빡이는 것처럼 보인다. */}
        <div className="title__kicker neon-text">THE GRID · DEMON ASCENT</div>
        <h1 className="title__logo">
          <span className="title__word title__word--a">GRID</span>
          <span className="title__word title__word--b">BRAWL</span>
        </h1>
        <p className="login__lead">계정으로 로그인하고 그리드에 입장하세요.</p>

        <div className="login__actions">
          {configured ? (
            <button className="btn login__google" onClick={onGoogle} disabled={busy}>
              <GoogleMark />
              {busy ? '로그인 중…' : 'Google로 로그인'}
            </button>
          ) : isNativeApp ? null : (
            <div className="login__setup">
              <p className="login__setup-title">Google 로그인이 아직 설정되지 않았습니다.</p>
              <p className="login__hint">
                <code>.env</code> 에 <code>VITE_FIREBASE_API_KEY</code> 를 추가하고, Firebase 콘솔의
                Authentication → 로그인 방법에서 <b>Google</b> 공급업체를 활성화하세요. 자세한 절차는{' '}
                <code>.env.example</code> 참고.
              </p>
            </div>
          )}

          {/* ⚠ 이 버튼은 어떤 조건에서도 사라지면 안 된다. 앱 전체가 로그인 뒤에
              막혀 있어서(App.tsx), 게스트 경로가 없으면 네트워크가 없는 첫 실행에서
              앱이 통째로 잠긴다 — 오프라인에서 아무것도 못 보는 앱은 iOS 심사
              2.1/4.2 반려 사유다. 구글(또는 Apple) 로그인을 붙여도 병행 유지한다. */}
          <button
            className={`btn ${isNativeApp ? '' : 'btn--ghost'} login__guest`}
            onClick={signInAsGuest}
            disabled={busy}
          >
            게스트로 시작
          </button>
          <p className="login__guest-note">
            게스트 기록은 이 기기에 저장되어 다음 접속 시 자동으로 이어집니다.
          </p>
          {error && <p className="login__error">{error}</p>}
        </div>
      </div>
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
