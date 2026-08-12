/**
 * 플레이어가 고르는 **연출 설정**. 룰에는 닿지 않는다 — 같은 라운드를 얼마나
 * 천천히, 얼마나 설명하며 보여줄지만 정한다(엔진·AI·시뮬 불변).
 *
 * 신고(2026-08-12): *"중독이나 그런 것까지 있으니까 무슨 데미지가 들어갔는지 잘
 * 모르겠고 그냥 후다닥 지나가니까 헷갈린다. 처음엔 각각의 공격 전에 카드가 나와서
 * 누가 뭘 냈는지 볼 수 있게, 익숙해지면 지금 이 세팅이었으면 좋겠다."*
 *
 * 그래서 **두 가지**뿐이다. 눈금이 여러 개인 속도 슬라이더가 아니라 "배우는 중"과
 * "익숙하다" 둘 중 하나를 고르는 것이다.
 */
export type BattlePace = 'showcase' | 'swift'

/** 처음 켜면 이쪽이다 — 아무것도 모르는 상태에서 빠른 진행은 읽을 수가 없다. */
export const DEFAULT_PACE: BattlePace = 'showcase'

export const PACE_META: Record<BattlePace, { icon: string; name: string; hint: string }> = {
  showcase: {
    icon: '🐢',
    name: '차근차근',
    hint: '슬롯마다 양쪽 카드를 펼쳐 보여주고 천천히 진행한다',
  },
  swift: {
    icon: '⚡',
    name: '빠르게',
    hint: '카드 공개 없이 곧바로 진행한다 (익숙해진 뒤)',
  },
}

/**
 * 연출 길이·설명량. `step`은 스텝 사이 대기 시간의 배수고, `hold`는 피해가 뜬
 * 뒤에 숫자를 읽을 시간이다.
 *
 * ⚠ **타격까지의 선행 시간(`impactDelay`)은 배수를 안 탄다.** 그 값은 스프라이트
 *   클립의 실제 프레임 번호라, 늘이면 모션이 끝난 뒤 허공에서 피해가 터진다.
 *   늘어나는 건 언제나 **스텝의 꼬리**뿐이다.
 */
export const PACE_CFG: Record<
  BattlePace,
  {
    /** 스텝 뒤 대기 배수 */
    step: number
    /** 슬롯이 바뀔 때 양쪽 카드를 펼쳐 보여줄 것인가 */
    reveal: boolean
    /** 그 카드 공개가 화면에 머무는 시간(ms) */
    revealMs: number
    /** 피해가 뜬 뒤 추가로 멈춰 주는 시간(ms) */
    hold: number
    /** 해소 중 화면 아래에 양쪽 플랜 3장씩과 전투 기록을 펼쳐 둘 것인가 */
    board: boolean
  }
> = {
  showcase: { step: 1.45, reveal: true, revealMs: 1250, hold: 380, board: true },
  swift: { step: 1, reveal: false, revealMs: 0, hold: 0, board: false },
}

const KEY = 'gb-battle-pace'

export function loadBattlePace(): BattlePace {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'showcase' || v === 'swift') return v
  } catch {
    /* 저장소를 못 읽어도 게임은 굴러가야 한다 */
  }
  return DEFAULT_PACE
}

export function saveBattlePace(p: BattlePace): void {
  try {
    localStorage.setItem(KEY, p)
  } catch {
    /* 사파리 프라이빗 모드 등 — 이번 세션에만 적용되고 만다 */
  }
}
