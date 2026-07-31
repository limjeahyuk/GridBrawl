import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { buildPortraitSvg } from '../art/art'
import { clipUrl, sheetFor } from '../art/sprites'
import type { CharacterDef } from '../data/roster'

/**
 * 메뉴·목록에 쓰는 초상. 스프라이트 시트가 있으면 **대기 동작의 첫 프레임**을
 * 잘라 쓰고, 없으면 절차 SVG(`art.ts`)로 떨어진다.
 *
 * 이게 한 곳에 모여 있어야 하는 이유: 전투는 픽셀인데 메뉴만 옛 SVG로 남으면
 * 같은 캐릭터가 화면마다 다른 그림으로 보인다. 여기만 고치면 캐릭터 선택·런
 * 시작·도감이 한 번에 따라온다.
 */
export function PortraitSvg({
  char,
  className,
  style,
}: {
  char: CharacterDef
  className?: string
  style?: CSSProperties
}) {
  const sheet = sheetFor(char.spriteId ?? char.id)
  const html = useMemo(() => (sheet ? '' : buildPortraitSvg(char)), [char.id, sheet])

  if (sheet) {
    // 스트립에서 첫 프레임만 보이게 잘라 낸다. `background-size`를 프레임 수만큼
    // 키우고 위치를 0으로 두면 1프레임짜리 정지 이미지가 된다.
    const frames = sheet.clips.idle?.frames ?? 1
    return (
      <div
        className={className}
        style={{
          ...style,
          // 프레임 비율을 유지한 채 부모 칸에 맞춘다(초상 칸 크기는 화면마다 다르다)
          aspectRatio: `${sheet.frameW} / ${sheet.frameH}`,
          backgroundImage: `url(${clipUrl(sheet, 'idle')})`,
          backgroundSize: `${frames * 100}% 100%`,
          backgroundPosition: '0 0',
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          // 원본이 왼쪽을 보고 그려진 시트는 뒤집어 오른쪽(=상대 방향)을 보게 한다
          transform: sheet.facesRight ? undefined : 'scaleX(-1)',
        }}
      />
    )
  }
  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />
}
