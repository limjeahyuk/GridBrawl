/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Firebase Realtime Database URL used for WebRTC signaling (short room
   *  codes). e.g. https://<project>-default-rtdb.firebaseio.com  Optional —
   *  online play is disabled until it is set. See .env.example. */
  readonly VITE_FIREBASE_DB_URL?: string
  /** Firebase web API key — enables Google sign-in (app-wide gate). Required
   *  for login. Firebase console → project settings → your web app. */
  readonly VITE_FIREBASE_API_KEY?: string
  /** Auth domain, defaults to <projectId>.firebaseapp.com. Usually unset. */
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  /** Firebase project id, defaults to gridbrawl-9073d. */
  readonly VITE_FIREBASE_PROJECT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
