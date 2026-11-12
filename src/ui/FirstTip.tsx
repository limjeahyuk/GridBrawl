// 첫 만남 팁(디자인 `TutorialFlow` 하단) — 처음 만날 때 딱 한 번 뜨고, "알겠다"를 누르면 다시 안 뜬다.
// 기록은 기기 로컬 `gb-tips-seen`(`game/progress.ts`). 튜토리얼 안에서는 안 쓴다.
import { useState } from 'react'
import { markTipSeen, seenTips } from '../game/progress'

export type TipId = 'map' | 'question' | 'shop' | 'elite' | 'collapse' | 'boss' | 'energy' | 'longpress' | 'status'
export const TIPS: Record<TipId, { title: string; body: string }> = {
  map: { title: '갈림길은 직접 고른다', body: '빛나는 칸이 지금 갈 수 있는 곳이다. 오른쪽 범례가 칸 종류 — 여관·대장간을 노리려면 몇 층 전부터 그 줄을 타자.' },
  question: { title: '? 칸은 들어가 봐야 안다', body: '전투 · 휴식 · 고블린 상점 · 이벤트 중 하나. 무엇이 나올지는 정체가 공개되는 순간 정해진다.' },
  // id는 'shop' 그대로(기기에 남은 `gb-tips-seen` 기록) — 2026-11-09부터 여관에서 뜬다.
  shop: { title: '여관에선 쉬거나 산다', body: '휴식(80골드)은 최대 체력의 50%를 채우고 방문을 끝낸다. 상점은 들렀다 돌아올 수 있다. 그냥 나가도 20%는 회복된다.' },
  elite: { title: '바위는 못 지나간다', body: '바위는 들어갈 수도, 밀려 들어갈 수도 없다. 같은 줄 · 같은 열의 사격선도 막는다 — 줄을 바꾸면 대각선으로 우회한다.' },
  collapse: { title: '판 가장자리가 무너진다', body: '6라운드부터 바깥 열부터 무너져 3라운드마다 안쪽으로 번진다. 라운드 끝에 무너진 칸에 서 있으면 피해.' },
  boss: { title: '붉은 ? 칸 = 숨은 보스 능력', body: '오른쪽 위의 ? 칸은 아직 드러나지 않은 보스 능력이다. 처음 발동하는 순간 뒤집혀 공개된다.' },
  energy: { title: '흐린 카드 = 기력 부족', body: '비싼 카드가 흐려지면 이번 라운드 기력이 모자란 것. 「원기 회복」이나 싼 카드로 버티면 다음 라운드에 다시 찬다.' },
  longpress: { title: '카드를 꾹 누르면 자세히', body: '카드를 길게 누르면 설명 · 사거리 · 용어가 크게 펼쳐진다. "지금 쓰면" 판에서 닿는지도 바로 보인다.' },
  status: { title: '상태이상이 걸렸다', body: '상태바 옆 칩이 지금 걸린 것이다. 중독 = 움직이거나 때릴 때마다 아프다 · 화상 = 맞을 때 더 아프다 · 빙결 = 이 라운드 정지(맞으면 깨진다).' },
}

/**
 * 뜰 수 있는 팁 하나를 고른다(`want` 중 아직 안 본 첫 번째). 닫으면 기록하고 사라진다.
 * 한 번에 하나만 — 둘 이상 겹치면 판이 글자로 덮인다.
 */
export function useFirstTip(want: (TipId | false | null | undefined)[]) {
  const [seen, setSeen] = useState(() => seenTips())
  const id = want.find((t): t is TipId => !!t && !seen.has(t)) ?? null
  const close = () => {
    if (!id) return
    markTipSeen(id)
    setSeen((s) => new Set(s).add(id))
  }
  const el = id ? <FirstTip id={id} onClose={close} /> : null
  return el
}

function FirstTip({ id, onClose }: { id: TipId; onClose: () => void }) {
  const t = TIPS[id]
  return (
    <aside className={`firsttip firsttip--${id}`} role="status">
      <span className="firsttip__kicker">TIP · 처음 한 번</span>
      <b>{t.title}</b>
      <p>{t.body}</p>
      <button type="button" onClick={onClose}>
        알겠다
      </button>
    </aside>
  )
}
