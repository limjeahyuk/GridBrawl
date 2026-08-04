import type { CharacterDef } from '../data/roster'

const clamp01 = (v: number) => Math.max(0.08, Math.min(1, v))

/** 캐릭터 선택·도감 화면 공용: 능력치 바(0~1)로 요약한 캐릭터 스탯. */
export function statBars(c: CharacterDef): { label: string; v: number }[] {
  const atks = c.cards.filter((a) => a.kind === 'attack')
  const dmg = Math.max(...atks.map((a) => a.damage ?? 0))
  const reach = Math.max(...atks.flatMap((a) => (a.range ?? []).map((o) => o.df)))
  return [
    // 라벨은 한국어(2026-08-05) — 영문 대문자 HUD는 사이버 시절 표기였다.
    { label: '체력', v: clamp01((c.maxHp - 96) / 50) },
    { label: '공격', v: clamp01((dmg - 16) / 40) },
    { label: '사거리', v: clamp01((reach - 1) / 4) },
    { label: '기력', v: clamp01((c.startEnergy - 38) / 18) },
  ]
}
