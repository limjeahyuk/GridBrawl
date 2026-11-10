import { useEffect, useState } from 'react'

export interface StageFit {
  width: number
  height: number
  transform: string
}

const BASE_W = 1280
const BASE_H = 720
/** 무대가 늘어날 수 있는 최대 폭(21:9 남짓). 내용은 늘 가운데 1280px이라 폭이 늘어도 배경만 넓어진다. */
const MAX_W = 1800

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
 * 1280×720 디자인 무대를 화면에 맞춘다. 내용(가운데 1280×720)은 자르지 않는 contain이고,
 * 화면이 16:9보다 길면 **무대 폭만** 늘려 배경이 화면 끝까지 깔리게 한다(내용은 그대로 가운데).
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
      const portrait = vh > vw
      // 회전 시 무대 가로(1280)는 화면 긴 축에, 세로(720)는 짧은 축에 매핑.
      // **긴 축**: 무대(배경)는 노치 밑까지 화면 끝에서 끝으로 깔고, 가운데 1280px(내용)만 노치를 피한다 —
      //   양쪽 안전 여백 중 큰 쪽을 양옆에 똑같이 비워 내용이 화면 한가운데 온다.
      // **짧은 축**: 홈 인디케이터를 피해 안전 영역 안에 맞춘다.
      const longFull = portrait ? vh : vw
      const longInset = portrait ? Math.max(inset.top, inset.bottom) : Math.max(inset.left, inset.right)
      const shortSide = Math.max(1, portrait ? vw - inset.left - inset.right : vh - inset.top - inset.bottom)
      const scale = Math.min(Math.max(1, longFull - 2 * longInset) / BASE_W, shortSide / BASE_H)
      // 폰은 16:9보다 길다(19.5:9 ≈ 2.17). 무대 **폭을 화면 끝까지 늘려**(1280~MAX_W) 양옆 검은 띠를 없앤다
      // (2026-11-10 — 홈 화면 앱에서 "비율이 이상하다"). 늘어난 자리는 배경만 번진다(`index.css`의 `--bleed`).
      const width = Math.round(Math.min(MAX_W, Math.max(BASE_W, longFull / scale)))
      const dx = portrait ? (inset.left - inset.right) / 2 : 0
      const dy = portrait ? 0 : (inset.top - inset.bottom) / 2
      const transform = `translate(${dx}px, ${dy}px) ${portrait ? 'rotate(90deg) ' : ''}scale(${scale})`
      // ⚠ **값이 그대로면 새 객체를 만들지 않는다.** 여기서 매번 새 객체를 넣으면
      //   App이 리렌더되고, 전투 중이면 `runFightProps(run)`가 통째로 다시 돈다.
      //   `resize`·`orientationchange`·`pageshow`·`visualViewport resize`가 전부 이
      //   함수를 부르는데, 특히 **백그라운드에서 돌아올 때 여러 개가 연달아 터진다**.
      setFit((prev) => (prev.transform === transform && prev.width === width ? prev : { width, height: BASE_H, transform }))
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
