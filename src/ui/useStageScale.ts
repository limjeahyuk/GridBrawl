import { useEffect, useState } from 'react'

export interface StageFit {
  width: number
  height: number
  transform: string
}

const BASE_W = 1280
const BASE_H = 720
const MAX_W = 1600 // 초광각 화면에서 UI가 너무 벌어지지 않게 상한

// env(safe-area-inset-*)를 JS에서 읽기 위한 프로브 엘리먼트 (viewport-fit=cover 필요)
let probe: HTMLDivElement | null = null
function readSafeInsets() {
  if (!probe) {
    probe = document.createElement('div')
    probe.style.cssText =
      'position:fixed;inset:0;pointer-events:none;visibility:hidden;' +
      'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
      'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);'
    document.body.appendChild(probe)
  }
  const cs = getComputedStyle(probe)
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  }
}

/**
 * Fit the fixed-height design surface (720) to the viewport.
 * - 화면 비율이 16:9보다 넓으면(폰 19.5:9 등) 무대 폭을 늘려 좌우 여백 없이 채운다.
 * - 세로 화면(폰을 세로로 든 경우)에서는 무대를 90° 회전한다 —
 *   iOS 홈 화면 앱은 manifest의 가로 고정을 무시하기 때문.
 * - 노치/홈 인디케이터(safe area)를 피해 그 안쪽 영역에 맞추고 중앙 정렬한다.
 * - iOS 홈 화면 앱은 첫 페인트에 뷰포트 크기를 작게 보고하고 이후 resize도 안
 *   오는 경우가 있어, visualViewport 리스너 + 지연 재계산으로 따라잡는다.
 */
export function useStageScale(): StageFit {
  const [fit, setFit] = useState<StageFit>({ width: BASE_W, height: BASE_H, transform: 'scale(1)' })
  useEffect(() => {
    const refit = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (!vw || !vh) return // 리사이즈/회전 도중 0이 들어오면 NaN 방지
      const inset = readSafeInsets()
      const availW = Math.max(1, vw - inset.left - inset.right)
      const availH = Math.max(1, vh - inset.top - inset.bottom)
      // safe 영역의 중심으로 무대를 이동 (뷰포트 중심 기준 오프셋)
      const dx = (inset.left - inset.right) / 2
      const dy = (inset.top - inset.bottom) / 2
      const portrait = vh > vw
      const longSide = portrait ? availH : availW
      const shortSide = portrait ? availW : availH
      const width = Math.min(MAX_W, Math.max(BASE_W, Math.round((longSide / shortSide) * BASE_H)))
      const scale = Math.min(longSide / width, shortSide / BASE_H)
      setFit({
        width,
        height: BASE_H,
        transform: `translate(${dx}px, ${dy}px) ${portrait ? 'rotate(90deg) ' : ''}scale(${scale})`,
      })
    }
    refit()
    // iOS 홈 화면 앱의 늦은 뷰포트 안정화 대비 재계산
    const timers = [setTimeout(refit, 250), setTimeout(refit, 1000)]
    window.addEventListener('resize', refit)
    window.addEventListener('orientationchange', refit)
    window.addEventListener('pageshow', refit)
    window.visualViewport?.addEventListener('resize', refit)
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('resize', refit)
      window.removeEventListener('orientationchange', refit)
      window.removeEventListener('pageshow', refit)
      window.visualViewport?.removeEventListener('resize', refit)
    }
  }, [])
  return fit
}
