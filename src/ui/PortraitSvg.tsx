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
          /**
           * 초상은 **왼쪽을 보게 통일**한다. 여긴 상대가 없는 화면이라 "적을 향한다"는
           * 기준이 없고, 셋이 제각각 보면 목록이 어수선하다.
           * 왼쪽으로 잡은 이유: 시트 원본이 왼쪽을 보고 그려진 전사를 굳이 뒤집으면
           * 방패와 검이 반대 손으로 가서 그 캐릭터만 어색해진다. 상대를 향해 돌아서는
           * 것은 **전투 화면에서만** 한다(`faceToward`).
           */
          transform: sheet.facesRight ? 'scaleX(-1)' : undefined,
        }}
      />
    )
  }
  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />
}
