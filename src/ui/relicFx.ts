// 전투 화면의 유물·적 능력 표시 규칙. 엔진은 "어떤 유물이 터졌는지"를 알려 주지 않으므로
// **스텝 결과에서 추정한다** — 연출 전용이라 틀려도 판 상태에는 아무 영향이 없다.
// ⚠ 라운드 시작 훅(기력·보호막·재생)은 스텝이 없어 아이콘이 튀지 않는다. 상시로 놓여 있다.
import { FOE_ATLAS, RELIC_ATLAS } from '../art/relicAtlas'
import type { Step } from '../battle/types'
import type { Passive } from '../data/roster'
import { getRelic } from '../game/relics'

/** 이 스텝에서 터진 내 유물들. */
export function relicProcs(step: Step, side: 0 | 1, ids: readonly string[]): string[] {
  const mine = step.actor === side
  const landed = step.result === 'hit' && step.damage > 0
  const foe = (1 - side) as 0 | 1
  const foeHas = (kind: string) => step.snapshot.status[foe].some((e) => e.kind === kind)
  return ids.filter((id) => {
    const e = getRelic(id)?.effect
    if (!e) return false
    if (step.phase === 'revive') return mine && !!e.revive
    if (step.card.id === 'trigger')
      return mine && !!e.energyTriggers?.some((t) => (t.label ?? '유물 발동') === step.card.name)
    if (!landed) return false
    if (!mine) return !!e.thorns
    return (
      (!!e.lifesteal && step.heal > 0) ||
      !!e.poisonOnHit ||
      !!e.burnOnHit ||
      (!!e.freezeOnHit && foeHas('frozen')) ||
      (!!e.stunOnHit && foeHas('stunned'))
    )
  })
}

/** 화면 가운데 띠로 크게 알릴 만한 발동 — 부활과 누적 터짐. */
export const isBigProc = (step: Step) => step.phase === 'revive' || step.card.id === 'trigger'

/** 전투 줄에 놓는 유물 — 런 효과(골드·상점·보상)는 지도에서만 보인다. */
export const battleRelics = (ids: readonly string[]) =>
  ids.filter((id) => RELIC_ATLAS[id]?.[2] !== 'u')

// --- 적 능력 -----------------------------------------------------------------
type Hook = 'turnEnergy' | 'turnShield' | 'damageReduction' | 'attackBonus' | 'lifesteal' | 'regen' | 'revive'

const HOOK_DESC: Record<Hook, (n: number) => string> = {
  turnEnergy: (n) => `매 라운드 기력 +${n}.`,
  turnShield: (n) => `매 라운드 보호막 +${n}.`,
  damageReduction: (n) => `받는 피해 -${n}.`,
  attackBonus: (n) => `공격 피해 +${n}.`,
  lifesteal: (n) => `피해를 주면 체력 ${n} 회복.`,
  regen: (n) => `매 라운드 체력 +${n}.`,
  revive: (n) => `전투당 한 번, 체력 ${n}으로 되살아난다.`,
}

/** 보스는 훅마다 고유한 이름의 보스 유물을 쓴다. 나머지는 공용 `enemy-<훅>`. */
const BOSS_RELIC: Record<string, Partial<Record<Hook, string>>> = {
  warden: { turnShield: 'boss-w-wall', damageReduction: 'boss-w-plate', turnEnergy: 'boss-w-pulse' },
  pyrelord: { attackBonus: 'boss-p-fist', revive: 'boss-p-core', turnEnergy: 'boss-p-ember' },
  overlord: {
    turnEnergy: 'boss-o-crown',
    turnShield: 'boss-o-veil',
    damageReduction: 'boss-o-scale',
    revive: 'boss-o-second',
  },
}

export interface FoeAbility {
  /** 도감 기록 키 — `<몬스터 id>:<훅>`. */
  key: string
  hook: Hook
  atlasId: string
  name: string
  desc: string
}

/** 몬스터 패시브 → 표시할 능력 목록. 게임이 실제로 쓰는 값에서 뽑으므로 설명이 어긋나지 않는다. */
export function foeAbilities(monsterId: string, passive: Omit<Passive, 'desc'>): FoeAbility[] {
  return (Object.keys(HOOK_DESC) as Hook[]).flatMap((hook) => {
    const n = passive[hook]
    if (!n) return []
    const atlasId = BOSS_RELIC[monsterId]?.[hook] ?? `enemy-${hook}`
    return [
      {
        key: `${monsterId}:${hook}`,
        hook,
        atlasId,
        name: FOE_ATLAS[atlasId].name,
        desc: HOOK_DESC[hook](n),
      },
    ]
  })
}

/** 이 스텝으로 처음 드러나는 능력들. 라운드 시작 훅은 첫 스텝에서 바로 뒤집힌다. */
export function foeReveals(step: Step, foeSide: 0 | 1, list: readonly FoeAbility[]): FoeAbility[] {
  const byFoe = step.actor === foeSide
  const landed = step.result === 'hit' && step.damage > 0
  return list.filter((a) => {
    switch (a.hook) {
      case 'turnEnergy':
      case 'turnShield':
      case 'regen':
        return true
      case 'attackBonus':
        return byFoe && landed
      case 'lifesteal':
        return byFoe && landed && step.heal > 0
      case 'damageReduction':
        return !byFoe && landed
      case 'revive':
        return byFoe && step.phase === 'revive'
    }
  })
}
