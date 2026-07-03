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
  /** True for a local guest session (no Google account behind it). */
  guest?: boolean
}

const toUser = (u: User): AuthUser => ({
  uid: u.uid,
  name: u.displayName ?? u.email ?? '플레이어',
  email: u.email,
  photo: u.photoURL,
})

// --- guest session ---------------------------------------------------------
// A guest is a purely local identity persisted in localStorage (the web's
// equivalent of a keychain entry), so the player auto-reconnects on the next
// visit without any account. A real Google sign-in always takes priority.
const GUEST_KEY = 'gridbrawl.guest'

function loadGuest(): AuthUser | null {
  try {
    const raw = localStorage.getItem(GUEST_KEY)
    if (!raw) return null
    const g = JSON.parse(raw) as { uid?: string; name?: string }
    if (!g?.uid || !g?.name) return null
    return { uid: g.uid, name: g.name, email: null, photo: null, guest: true }
  } catch {
    return null
  }
}

function saveGuest(g: AuthUser): void {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify({ uid: g.uid, name: g.name }))
  } catch {
    /* storage unavailable (private mode) — session just won't persist */
  }
}

function clearGuest(): void {
  try {
    localStorage.removeItem(GUEST_KEY)
  } catch {
    /* ignore */
  }
}

// --- combined auth store ---------------------------------------------------
// One current user, sourced from Firebase (Google) OR the local guest session,
// with Firebase taking priority. Listeners get the resolved user; `ready` gates
// the very first emit so we don't flash "logged out" while Firebase restores a
// persisted Google session.
type Listener = (u: AuthUser | null) => void
const listeners = new Set<Listener>()
let firebaseUser: AuthUser | null = null
let guestUser: AuthUser | null = loadGuest()
let ready = false
let started = false

const current = (): AuthUser | null => firebaseUser ?? guestUser
const emit = (): void => {
  const u = current()
  listeners.forEach((l) => l(u))
}

function ensureStarted(): void {
  if (started) return
  started = true
  if (!API_KEY) {
    ready = true // no Firebase to wait on — guest (if any) resolves immediately
    return
  }
  onAuthStateChanged(auth(), (u) => {
    firebaseUser = u ? toUser(u) : null
    if (firebaseUser && guestUser) {
      // a real account signed in — retire the local guest identity
      guestUser = null
      clearGuest()
    }
    ready = true
    emit()
  })
}

/** Subscribe to sign-in state. Emits the current user once Firebase has had a
 *  chance to restore its session (immediately when Firebase is unconfigured). */
export function subscribeAuth(cb: Listener): () => void {
  ensureStarted()
  listeners.add(cb)
  if (ready) cb(current())
  return () => {
    listeners.delete(cb)
  }
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth(), new GoogleAuthProvider())
}

/** Start (or resume) a local guest session and notify listeners. */
export function signInAsGuest(): void {
  ensureStarted()
  if (!guestUser) {
    const uid = `guest-${Math.random().toString(36).slice(2, 10)}`
    guestUser = { uid, name: `게스트-${uid.slice(-4).toUpperCase()}`, email: null, photo: null, guest: true }
    saveGuest(guestUser)
  }
  ready = true
  emit()
}

export async function signOutUser(): Promise<void> {
  guestUser = null
  clearGuest()
  if (API_KEY && firebaseUser) await signOut(auth()) // fires onAuthStateChanged → emit
  else emit()
}
