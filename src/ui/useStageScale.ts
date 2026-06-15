import { useEffect, useState } from 'react'

/** Uniform-scale a fixed design surface (1280x720) to fit the viewport. */
export function useStageScale(w = 1280, h = 720): number {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / w, window.innerHeight / h))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [w, h])
  return scale
}
