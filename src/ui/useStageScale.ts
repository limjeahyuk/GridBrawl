import { useEffect, useState } from 'react'

export interface StageFit {
  width: number
  height: number
  transform: string
}

const BASE_W = 1280
const BASE_H = 720

// env(safe-area-inset-*)를 JS에서 읽기 위한 프로브 (viewport-fit=cover 필요)
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
 * 고정 1280×720 디자인 무대를 화면에 맞춘다(uniform contain).
 * - 무대는 항상 16:9 비율 유지 — HUD·보드·카드가 720px를 빈틈없이 쓰므로
 *   더 담으려 스케일을 키우면 HP바/카드가 잘린다. 그래서 자르지 않는 contain.
 * - 세로로 든 폰에서는 90° 회전(iOS 홈 화면 앱은 manifest 가로 고정을 무시).
 * - 노치/홈 인디케이터(safe area)를 피한 영역에 맞추고 그 중심으로 정렬.
 * - 긴 축에 남는 얇은 대칭 여백은 뷰포트 배경 그리드가 이어져 자연스럽게 보인다.
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
      const dx = (inset.left - inset.right) / 2
      const dy = (inset.top - inset.bottom) / 2
      const portrait = vh > vw
      // 회전 시 무대 가로(1280)는 화면 긴 축에, 세로(720)는 짧은 축에 매핑
      const longSide = portrait ? availH : availW
      const shortSide = portrait ? availW : availH
      const scale = Math.min(longSide / BASE_W, shortSide / BASE_H)
      setFit({
        width: BASE_W,
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
