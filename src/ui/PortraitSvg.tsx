import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { buildPortraitSvg } from '../art/art'
import type { CharacterDef } from '../data/roster'

export function PortraitSvg({
  char,
  className,
  style,
}: {
  char: CharacterDef
  className?: string
  style?: CSSProperties
}) {
  const html = useMemo(() => buildPortraitSvg(char), [char.id])
  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />
}
