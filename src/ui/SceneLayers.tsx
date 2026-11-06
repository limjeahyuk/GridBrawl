import type { BattleScene } from '../game/run'

/** 던전 횃불 네 자루 — 벽 그림의 아치 사이 자리다(디자인의 전투 — 던전). */
const TORCH_X = [376, 520, 1016, 1160]

/**
 * 1280×720 무대 전체에 까는 배경 레이어. 지역은 둘이다 — 초원(하늘·구름·산·언덕·풀밭)과
 * 던전(벽·횃불빛·횃불·바닥·종유석). 보스 무대 셋은 같은 그림 위에 색을 얹어 가른다
 * (`.scene--sanctum` 등 — `bosses.ts`가 보스마다 다른 값을 고른다).
 */
export function SceneLayers({ scene }: { scene: BattleScene }) {
  const field = scene === 'grassland' || scene === 'sanctum'
  return (
    <div className={`scene scene--${scene}`} aria-hidden="true">
      {field ? (
        <>
          <i className="scene__l scene__l--sky" />
          <i className="scene__l scene__l--clouds" />
          <i className="scene__l scene__l--mountains" />
          <i className="scene__l scene__l--hills" />
          <i className="scene__l scene__l--meadow" />
        </>
      ) : (
        <>
          <i className="scene__l scene__l--wall" />
          <i className="scene__l scene__l--light" />
          {TORCH_X.map((x) => (
            <i key={x} className="scene__torch" style={{ left: x }} />
          ))}
          <i className="scene__l scene__l--floor" />
          <i className="scene__l scene__l--fg" />
        </>
      )}
      <i className="scene__tint" />
    </div>
  )
}
