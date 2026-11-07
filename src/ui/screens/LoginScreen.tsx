import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { authConfigured, signInAsGuest, signInWithGoogle } from '../../net/auth'
import { sheetFor } from '../../art/sprites'
import { SceneLayers } from '../SceneLayers'
import { SpriteClip } from '../SpriteClip'

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

  const cairn = sheetFor('warrior')
  const dirge = sheetFor('mage')
  return (
    <div className="screen login">
      <SceneLayers scene="grassland" />
      {/* 디자인 `Login`: 왼쪽 그늘이 아니라 **가운데를 비우는 비네트**다 — 로그인 판이
          화면 한가운데 서기 때문. 문구는 타이틀과 같아 넘어갈 때 글자가 안 깜빡인다. */}
      <div className="login__vignette" aria-hidden="true" />
      <div className="login__party" aria-hidden="true">
        {cairn && (
          <div className="login__hero login__hero--left">
            <SpriteClip sheet={cairn} clip="idle" />
          </div>
        )}
        {dirge && (
          <div className="login__hero login__hero--right" style={{ ['--artflip' as string]: -1 }}>
            <SpriteClip sheet={dirge} clip="idle" />
          </div>
        )}
      </div>
      <main className="login__content">
        <h1 className="login__logo">
          GRID
          <br />
          BRAWL
        </h1>
        <p className="login__tag">카드 세 장, 한 칸의 승부</p>
        <section className="login__panel" aria-label="로그인">
          <div className="login__actions">
          {configured ? (
            <button className="btn login__google" onClick={onGoogle} disabled={busy}>
              <GoogleMark />
              {busy ? '로그인 중…' : 'Google 계정으로 계속하기'}
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
            게스트로 둘러보기
          </button>
          <p className="login__guest-note">
            게스트 기록은 이 기기에 저장되어 다음 접속 시 자동으로 이어집니다.
          </p>
          {error && <p className="login__error">{error}</p>}
          </div>
          <ul className="login__notes">
            <li>로그인하면 덱 · 도감 · 클리어 기록이 기기 사이에 저장된다</li>
            <li>게스트는 이 기기에만 저장 — 나중에 Google로 옮길 수 있다</li>
          </ul>
        </section>
      </main>
      <span className="login__ver">V0.2</span>
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
