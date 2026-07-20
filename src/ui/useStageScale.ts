import { useEffect, useState } from 'react'

export interface StageFit {
  width: number
  height: number
  transform: string
}

const BASE_W = 1280
const BASE_H = 720
const MAX_W = 1600 // 초광각 화면에서 UI가 너무 벌어지지 않게 상한

/**
 * Fit the fixed-height design surface (720) to the viewport.
 * - 화면 비율이 16:9보다 넓으면(폰 19.5:9 등) 무대 폭을 늘려 좌우 여백 없이 꽉 채운다.
 * - 세로 화면(폰을 세로로 든 경우)에서는 무대를 90° 회전한다 —
 *   iOS 홈 화면 앱은 manifest의 가로 고정을 무시하기 때문.
 */
export function useStageScale(): StageFit {
  const [fit, setFit] = useState<StageFit>({ width: BASE_W, height: BASE_H, transform: 'scale(1)' })
  useEffect(() => {
    const refit = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (!vw || !vh) return // 리사이즈/회전 도중 0이 들어오면 NaN 방지
      const portrait = vh > vw
      // 회전 시 무대가 실제로 차지하는 화면 축은 (긴 축 = 무대 가로)
      const longSide = portrait ? vh : vw
      const shortSide = portrait ? vw : vh
      const width = Math.min(MAX_W, Math.max(BASE_W, Math.round((longSide / shortSide) * BASE_H)))
      const scale = Math.min(longSide / width, shortSide / BASE_H)
      setFit({
        width,
        height: BASE_H,
        transform: portrait ? `rotate(90deg) scale(${scale})` : `scale(${scale})`,
      })
    }
    refit()
    window.addEventListener('resize', refit)
    window.addEventListener('orientationchange', refit)
    return () => {
      window.removeEventListener('resize', refit)
      window.removeEventListener('orientationchange', refit)
    }
  }, [])
  return fit
}
