import { useEffect, useState } from 'react'

/**
 * Uniform-scale a fixed design surface (1280x720) to fit the viewport.
 * 세로 화면(폰을 세로로 든 경우)에서는 무대를 90° 회전해 가로 게임이 화면을
 * 꽉 채우게 한다 — iOS 홈 화면 앱은 manifest의 가로 고정을 무시하기 때문.
 */
export function useStageScale(w = 1280, h = 720): string {
  const [transform, setTransform] = useState('scale(1)')
  useEffect(() => {
    const fit = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (vh > vw) {
        const s = Math.min(vh / w, vw / h)
        setTransform(`rotate(90deg) scale(${s})`)
      } else {
        setTransform(`scale(${Math.min(vw / w, vh / h)})`)
      }
    }
    fit()
    window.addEventListener('resize', fit)
    window.addEventListener('orientationchange', fit)
    return () => {
      window.removeEventListener('resize', fit)
      window.removeEventListener('orientationchange', fit)
    }
  }, [w, h])
  return transform
}
