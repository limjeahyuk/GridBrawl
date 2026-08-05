// ---------------------------------------------------------------------------
// 카드 특수 능력의 **표시 메타데이터** — 아이콘 · 이름 · 뜻을 한 곳에 모은다.
//
// 압축 카드(전투 손패)는 **아이콘만** 쓰고, 꾹 눌러 여는 상세 카드가 같은 목록을
// "아이콘 · 넉백 1 · 무슨 뜻인지" 한 줄로 펼친다. 두 곳이 같은 배열을 읽으므로
// **아이콘과 설명이 어긋날 수 없다** — 전엔 카드엔 `넉백1` 칩만 있고 그 뜻은
// 어디에도 없어서, 처음 보는 능력은 카드에서 배울 방법이 없었다.
//
// ⚠ 여기 적는 뜻은 **엔진이 실제로 하는 일**이어야 한다(`battle/engine.ts`).
//   능력을 새로 만들거나 규칙을 바꾸면 이 파일도 같은 커밋에서 고친다.
// ---------------------------------------------------------------------------
import type { CardDef } from '../battle/types'

export interface AbilityInfo {
  /** 압축 카드에 그대로 찍히는 아이콘. 한 글자여야 카드 폭을 안 먹는다. */
  icon: string
  /** 상세 카드의 제목 — 수치까지 붙은 완성형(예: `넉백 1`). */
  label: string
  /** 상세 카드의 한 줄 설명. "이 카드가 뭘 하는가"를 평서문으로. */
  meaning: string
  /** 나쁜 것(자신에게 손해)인가 — 상세 카드에서 붉게 표시한다. */
  bad?: boolean
}

/**
 * 이 카드가 가진 특수 능력 목록. 능력이 없으면 빈 배열.
 * 순서는 **중요한 것부터** — 압축 카드는 자리가 모자라면 앞에서 자른다.
 */
export function abilityList(c: CardDef): AbilityInfo[] {
  const out: AbilityInfo[] = []
  if (c.pierce)
    out.push({
      icon: '➤',
      label: '관통',
      meaning: '보호막에 막히지 않고 그대로 체력을 깎는다. 바위도 뚫고 그 뒤를 맞힌다.',
    })
  if (c.shatter)
    out.push({
      icon: '💥',
      label: '보호막 파괴',
      meaning: '맞히는 순간 상대의 보호막이 먼저 통째로 사라진다.',
    })
  if (c.push)
    out.push({
      icon: '👊',
      label: `넉백 ${c.push}`,
      meaning: `맞은 상대를 나에게서 ${c.push}칸 밀어낸다. 벽에 닿으면 거기서 멈추고, 바위에 막혀 한 칸도 못 밀리면 그 상대는 1턴 기절한다.`,
    })
  if (c.pull)
    out.push({
      icon: '🪝',
      label: `끌어당김 ${c.pull}`,
      meaning: `맞은 상대를 나에게로 ${c.pull}칸 끌어온다. 도망치는 적을 사거리 안으로 잡아 오고, 바위에 막혀 한 칸도 못 오면 그 상대는 1턴 기절한다.`,
    })
  if (c.stun)
    out.push({
      icon: '💫',
      label: `기절 ${c.stun}턴`,
      meaning: `맞은 상대는 ${c.stun}턴 동안 카드를 한 장도 못 낸다. 피해가 실제로 들어가야 걸린다.`,
    })
  if (c.freeze)
    out.push({
      icon: '❄',
      label: `빙결 ${c.freeze}턴`,
      meaning: `맞은 상대는 ${c.freeze}턴 동안 이동할 수 없다. 공격과 수비는 그대로 나간다.`,
    })
  if (c.poison)
    out.push({
      icon: '☠',
      label: `독 ${c.poison}`,
      meaning: `턴이 끝날 때마다 ${c.poison} 피해. 보호막을 무시하고 그대로 깎는다.`,
    })
  if (c.burn)
    out.push({
      icon: '🔥',
      label: `화상 ${c.burn}`,
      meaning: `턴이 끝날 때마다 ${c.burn} 피해. 보호막을 무시하고 그대로 깎는다.`,
    })
  if (c.leech)
    out.push({
      icon: '🩸',
      label: `흡혈 ${c.leech}`,
      meaning: `피해를 입히면 내 체력이 ${c.leech} 회복된다.`,
    })
  if (c.drain)
    out.push({
      icon: '🔌',
      label: `기력 흡수 ${c.drain}`,
      meaning: `상대의 기력을 ${c.drain} 빼앗아 내 기력으로 채운다. 가드에 막혀도 빼앗는다.`,
    })
  if (c.selfShield)
    out.push({
      icon: '🛡',
      label: `보호막 +${c.selfShield}`,
      meaning: `카드를 내는 것만으로 내 보호막이 ${c.selfShield} 늘어난다. 빗나가도 남는다.`,
    })
  if (c.empower)
    out.push({
      icon: '📈',
      label: `각성 +${c.empower}`,
      meaning: `이 전투가 끝날 때까지 내 모든 공격의 피해가 ${c.empower} 오른다. 쓸수록 쌓인다.`,
    })
  if (c.dashForward)
    out.push(
      c.dashForward > 0
        ? {
            icon: '⇨',
            label: `전진 ${c.dashForward}`,
            meaning: `사거리를 재기 전에 상대 쪽으로 ${c.dashForward}칸 파고든다.`,
          }
        : {
            icon: '⇦',
            label: `후퇴 ${-c.dashForward}`,
            meaning: `사거리를 재기 전에 상대 반대쪽으로 ${-c.dashForward}칸 물러난 뒤 쏜다.`,
          },
    )
  if (c.recoil)
    out.push({
      icon: '💢',
      label: `반동 ${c.recoil}`,
      meaning: `쓸 때마다 내 체력이 ${c.recoil} 깎인다. 빗나가도 깎인다.`,
      bad: true,
    })
  // 겹친 상대를 못 때리는 원거리 카드만 알려준다 — 대부분의 카드는 때릴 수 있다.
  if (c.kind === 'attack' && c.pointBlank === false)
    out.push({
      icon: '🚫',
      label: '밀착 사각',
      meaning: '상대와 같은 칸에 겹쳐 있으면 맞힐 수 없다. 붙기 전에 쏴야 한다.',
      bad: true,
    })
  return out
}

/**
 * 카드의 **주 수치** — 압축 카드 한가운데 크게 놓는 값 하나. 종류마다 뭘 보는지가
 * 다른데(공격은 피해, 가드는 방어…) 전엔 작은 글씨로 `⚔14 ↦1 ⚡10`처럼 나란히
 * 늘어놓아서 무엇이 중요한지 읽히지 않았다. 카드를 고를 땐 이 숫자 하나면 된다.
 */
export function primaryStat(c: CardDef): { value: string; unit: string } | null {
  switch (c.kind) {
    case 'attack':
      return { value: String(c.damage ?? 0), unit: '피해' }
    case 'guard':
      return { value: String(c.block ?? 0), unit: '방어' }
    case 'energy':
      return { value: `+${c.gain ?? 0}`, unit: '기력' }
    case 'heal':
      return { value: `+${c.healHp ?? 0}`, unit: '체력' }
    case 'buff':
      // 무아지경(freeCast)은 수치가 없다 — 지속 턴이 곧 카드의 크기다.
      return c.buff === 'freeCast'
        ? { value: `${c.buffTurns ?? 1}`, unit: '턴' }
        : { value: `${c.buffPower ?? 0}`, unit: c.buff === 'defUp' ? '경감' : '공격' }
    default:
      return null
  }
}

/** 이 카드가 요구하는 기력(0이면 표시하지 않는다). 종류마다 필드 이름이 다르다. */
export function cardCost(c: CardDef): number {
  return c.energyCost ?? c.guardCost ?? c.healCost ?? c.buffCost ?? 0
}

/** 종류를 한국어로 — 상세 카드의 부제. */
export const KIND_LABEL: Record<CardDef['kind'], string> = {
  attack: '공격',
  guard: '수비',
  energy: '기력',
  heal: '회복',
  buff: '강화',
  move: '이동',
}
