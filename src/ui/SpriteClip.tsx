import { clipOrFallback, clipUrl, type ClipName, type SheetDef } from '../art/sprites'

/**
 * 스프라이트 한 클립을 재생한다. 재생은 전부 CSS `steps()`가 맡고 JS는 프레임을
 * 세지 않는다 — 덕분에 히트스톱(`animation-play-state: paused`)이 스프라이트
 * 프레임까지 그대로 얼린다.
 *
 * `key`로 remount해 클립을 처음부터 다시 돌린다. animation-name이 계속
 * `sprite-play`라 클래스만 바꿔서는 재시작되지 않기 때문(이미지는 캐시돼 있어
 * remount 비용은 사실상 0).
 */
export function SpriteClip({
  sheet,
  clip,
  seq = 0,
  scale = sheet.scale,
}: {
  sheet: SheetDef
  clip: ClipName
  seq?: number
  /** 화면마다 배율이 다르다(지도 ×1 · HUD ×2 · 전투 ×3). 정수만 쓴다. */
  scale?: number
}) {
  // 없는 동작은 대기로 떨어진다 — 팩마다 들어 있는 클립이 다르다
  const [actual, def] = clipOrFallback(sheet, clip)
  const w = sheet.frameW * scale
  const h = sheet.frameH * scale
  return (
    <div
      key={`${actual}-${seq}`}
      className="sprite"
      style={{
        width: `${w}px`,
        height: `${h}px`,
        backgroundImage: `url(${clipUrl(sheet, actual)})`,
        backgroundSize: `${w * def.frames}px ${h}px`,
        // 애니메이션이 끝나면 이 base 값이 드러난다 = 마지막 프레임에서 정지.
        // (fill:forwards는 프레임 범위를 한 칸 넘어가 빈 칸을 보여 준다.)
        backgroundPositionX: def.loop ? '0px' : `${-(def.frames - 1) * w}px`,
        animationTimingFunction: `steps(${def.frames})`,
        animationDuration: `${def.frames * def.frameMs}ms`,
        animationIterationCount: def.loop ? 'infinite' : 1,
        ['--strip' as string]: `${-def.frames * w}px`,
      }}
    />
  )
}
