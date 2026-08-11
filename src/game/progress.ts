// ---------------------------------------------------------------------------
// 런 진행도 — **어느 난이도를 깼는가**만 담는다(2026-08-11).
//
// 초급을 깨면 중급이, 중급을 깨면 고급이 열린다(`run.ts`의 `isDifficultyUnlocked`).
// 여기는 그 "깼다" 사실을 기기에 남기는 얇은 층이다.
//
// ⚠ **기기 단위 저장이다**(계정 동기화 없음 — 덱과 다르다). 덱은 PvP에서 상대에게
//   보내는 것이라 계정에 묶여야 하지만, 해금은 순전히 싱글 진행도라 오프라인에서도
//   반드시 읽고 써져야 한다. 클라우드에 두면 네트워크가 없을 때 "깬 난이도가 잠기는"
//   최악의 실패가 생긴다 — `gb-tutorial-done`과 같은 판단이다.
// ⚠ localStorage가 막힌 환경(사파리 프라이빗 등)에서도 **던지면 안 된다** — 읽기는
//   빈 값, 쓰기는 조용한 실패로 떨어뜨린다. 진행도를 못 적는 건 아쉬운 일이지만
//   게임이 멈출 이유는 아니다.
// ---------------------------------------------------------------------------
import { RUN_DIFFICULTIES, type RunDifficulty } from './run'

const KEY = 'gb-run-cleared'

const isDifficulty = (v: unknown): v is RunDifficulty =>
  typeof v === 'string' && RUN_DIFFICULTIES.some((d) => d.id === v)

/** 지금까지 클리어한 난이도들. 읽기 실패는 "아직 아무것도 못 깼다"로 본다. */
export function clearedDifficulties(): Set<RunDifficulty> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.filter(isDifficulty) : [])
  } catch {
    return new Set()
  }
}

/**
 * 클리어를 기록하고 **이번에 새로 열린 난이도**를 돌려준다(없으면 null).
 * 결과 화면이 이 값으로 "중급 해금!"을 띄운다 — 이미 깬 난이도를 또 깼을 땐 null이라
 * 같은 축하가 반복되지 않는다.
 */
export function markCleared(id: RunDifficulty): RunDifficulty | null {
  const cleared = clearedDifficulties()
  const already = cleared.has(id)
  cleared.add(id)
  try {
    localStorage.setItem(KEY, JSON.stringify([...cleared]))
  } catch {
    // 저장이 막힌 환경 — 이번 세션에서는 열린 채로 두고 조용히 넘어간다.
  }
  if (already) return null
  const i = RUN_DIFFICULTIES.findIndex((d) => d.id === id)
  const next = i >= 0 ? RUN_DIFFICULTIES[i + 1] : undefined
  return next ? next.id : null
}
