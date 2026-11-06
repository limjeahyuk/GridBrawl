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
    const ratio = sheet.frameW / sheet.frameH
    return (
      // 칸 크기는 화면마다 다르다. 어느 칸에 들어가도 비율이 안 찌그러지도록 칸을
      // 컨테이너로 두고 안쪽 그림을 몸통 기준점으로 세운다(프레임 폭은 검기까지 담아 치우쳐 있다).
      <div
        className={className}
        style={{ ...style, position: 'relative', overflow: 'hidden', containerType: 'size' }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 0,
            width: `min(100cqw, calc(100cqh * ${ratio}))`,
            aspectRatio: `${sheet.frameW} / ${sheet.frameH}`,
            transform: `translateX(${(-sheet.anchorX / sheet.frameW) * 100}%)`,
            backgroundImage: `url(${clipUrl(sheet, 'idle')})`,
            backgroundSize: `${frames * 100}% 100%`,
            backgroundPosition: '0 0',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
          }}
        />
      </div>
    )
  }
  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />
}
