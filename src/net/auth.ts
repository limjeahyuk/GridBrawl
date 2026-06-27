// ---------------------------------------------------------------------------
// Google sign-in via Firebase Authentication. Unlike net/firebase.ts (which
// talks to the RTDB over plain REST for signaling), Auth needs the Firebase
// SDK, so this is the one place we depend on it. The app is gated behind a
// signed-in user (see App.tsx + ui/useAuth.ts).
//
// Setup: set VITE_FIREBASE_API_KEY (Firebase console → project settings → your
// web app) and enable the Google provider under Authentication → Sign-in
// method. authDomain / projectId default to the gridbrawl-9073d project but can
// be overridden via env. See .env.example.
// ---------------------------------------------------------------------------
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'

const API_KEY = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined
const PROJECT_ID =
  (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? 'gridbrawl-9073d'
const AUTH_DOMAIN =
  (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? `${PROJECT_ID}.firebaseapp.com`

/** Is sign-in configured? (the login screen shows setup help otherwise.) */
export const authConfigured = (): boolean => !!API_KEY

let _auth: Auth | null = null
function auth(): Auth {
  if (!API_KEY) throw new Error('로그인이 설정되지 않았습니다. (VITE_FIREBASE_API_KEY)')
  if (!_auth) {
    const app: FirebaseApp =
      getApps()[0] ??
      initializeApp({ apiKey: API_KEY, authDomain: AUTH_DOMAIN, projectId: PROJECT_ID })
    _auth = getAuth(app)
  }
  return _auth
}

/** The trimmed-down user we hand to the UI. */
export interface AuthUser {
  uid: string
  name: string
  email: string | null
  photo: string | null
}

const toUser = (u: User): AuthUser => ({
  uid: u.uid,
  name: u.displayName ?? u.email ?? '플레이어',
  email: u.email,
  photo: u.photoURL,
})

/** Subscribe to sign-in state. Fires with null immediately when unconfigured. */
export function subscribeAuth(cb: (u: AuthUser | null) => void): () => void {
  if (!API_KEY) {
    cb(null)
    return () => {}
  }
  return onAuthStateChanged(auth(), (u) => cb(u ? toUser(u) : null))
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth(), new GoogleAuthProvider())
}

export async function signOutUser(): Promise<void> {
  await signOut(auth())
}
