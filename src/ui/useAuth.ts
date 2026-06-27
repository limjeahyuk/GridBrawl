import { useEffect, useState } from 'react'
import { subscribeAuth, type AuthUser } from '../net/auth'

/** Tracks the signed-in user. `loading` is true until the first auth callback
 *  (Firebase restores a persisted session asynchronously on load). */
export function useAuth(): { user: AuthUser | null; loading: boolean } {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(
    () =>
      subscribeAuth((u) => {
        setUser(u)
        setLoading(false)
      }),
    [],
  )
  return { user, loading }
}
