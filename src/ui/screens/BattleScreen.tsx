import { useEffect, useMemo, useRef, useState } from "react";
import { getChar } from "../../data/roster";
import { buildFighterSvg } from "../../art/art";
import {
  attackClipFor,
  impactDelayOf,
  placeSprite,
  preloadSheet,
  sheetFor,
  type ClipName,
  type SheetDef,
} from "../../art/sprites";
import {
  CardBattle,
  planAffordable,
  type BattleOpts,
} from "../../battle/engine";
import {
  loadBattlePace,
  saveBattlePace,
  PACE_CFG,
  PACE_META,
  type BattlePace,
} from "../../game/settings";
import type { BattleScene } from "../../game/run";
import type { BossCinematic } from "../../game/bosses";
import { deckFor } from "../../battle/cards";
import { CardFace, cardAccent, moveIcon } from "../CardFace";
import { useFirstTip } from "../FirstTip";
import { CardDetail, useLongPress } from "../CardDetail";
import { KIND_LABEL } from "../cardAbility";
import { PortraitSvg } from "../PortraitSvg";
import { RELIC_ATLAS } from "../../art/relicAtlas";
import { markFoeAbilitySeen, seenFoeAbilities } from "../../game/progress";
import { getRelic } from "../../game/relics";
import { FoeIcon, RARITY_LABEL, RelicIcon } from "../RelicIcon";
import {
  battleRelics,
  foeReveals,
  isBigProc,
  relicProcs,
  type FoeAbility,
} from "../relicFx";
import { SceneLayers } from "../SceneLayers";
import { SpriteClip } from "../SpriteClip";
import { isMuted, playSfx, setMuted, unlockAudio } from "../sfx";
import {
  COLLAPSE_START_ROUND,
  LOW_HP_FRAC,
  collapseDamageAt,
  collapseRound,
  collapseEscalatesNext,
  GRID_COLS,
  GRID_ROWS,
  MOVE_DELTA,
  canStand,
  facingBetween,
  inBounds,
  isCollapsedCell,
  MIRROR_DIR,
  rockAt,
  shadowRock,
  type ActionResult,
  type Cell,
  type CardDef,
  type DamageSrc,
  type FogTile,
  type Hazard,
  type HazardKind,
  spikeStateAt,
  hazardAt,
  type MoveDir,
  type Obstacle,
  type Step,
  type StatusEffect,
} from "../../battle/types";

/** Produce the opponent's 3-card plan for a turn (local AI, or a remote peer in
 *  multiplayer). Returns null if the opponent is gone (e.g. peer disconnected). */
export type OpponentPlanner = (
  localPlan: CardDef[],
  battle: CardBattle,
) => Promise<CardDef[] | null>;

interface Fx {
  kind: string;
  result: ActionResult;
}
interface View {
  pos: [Cell, Cell];
  hp: [number, number];
  energy: [number, number];
  shield: [number, number];
  /** 이 시점의 지형(바위). 스텝마다 바뀌므로 뷰에 싣는다 — 부서지는 순간이 보여야 한다. */
  obstacles: Obstacle[];
  /** 이 시점의 독안개 칸. */
  fog: FogTile[];
  /** 이 시점의 함정(런 전용)과 그때의 라운드 — 가시덫 상태가 라운드로 정해진다. */
  hazards: Hazard[];
  round: number;
  acting: [boolean, boolean]; // attack lunge
  /** 지금 내는 공격 카드의 fx 종류. 준비 동작~타격 내내 유지돼야 한다 —
   *  중간에 바뀌면 CSS animation-name이 갈려 모션이 처음부터 다시 뛴다. */
  actFx: [string | null, string | null];
  damage: [number, number];
  /**
   * 그 피해가 **어디서 왔는지**(공격·화상·중독·처박기…). 두 갈래 이상이면 숫자를
   * 한 줄씩 쌓아 보여 준다 — 예전엔 전부 `-19` 하나로 합쳐져서, 중독·화상이 섞이는
   * 순간 "뭐에 맞았는지" 알 길이 없었다(2026-08-12 신고).
   */
  dmgBits: [{ src: DamageSrc; n: number }[], { src: DamageSrc; n: number }[]];
  heal: [number, number];
  stunned: [boolean, boolean]; // 이 턴을 통째로 버리는 기절
  /**
   * 넉백이 판 끝 암벽에 막혀 처박혔다 — **정규 좌표** 기준 방향(+1 = col 5 쪽 벽,
   * −1 = col 0 쪽 벽, 0 = 없음). 화면에 그릴 땐 `flip`으로 뒤집어야 한다.
   */
  slam: [number, number];
  /** 지금 걸려 있는 지속효과(독·화상·빙결 + 강화 버프) — 파이터 발밑 칩으로 표시 */
  status: [StatusEffect[], StatusEffect[]];
  fx: [Fx | null, Fx | null];
  say: [string, string];
  /** step sequence — keys the floating -N/+N so the animation restarts every step */
  seq: number;
}

/**
 * 판 기하 — **칸 184×58 · 간격 7**(디자인 `OneCell`의 실제 판 크기). 칸 하나의
 * 가운데를 px로 돌려준다.
 *
 * ⚠ 예전엔 `(col + 0.5) / GRID_COLS * 100%`로 쟀다. 격자에는 간격(7px)이 있는데
 *   백분율은 그걸 모르므로 칸마다 최대 3px씩 밀렸고, **1칸 함정 타일**(184×96)이
 *   칸에서 어긋났다 — 타일은 칸 왼쪽 위에 맞춰 그려져 있어 어긋남이 그대로 보인다.
 *   `.gridboard`가 1139×253(= 6·184+5·7 × 4·58+3·7)이라 px이 곧 정확한 값이다.
 */
const CELL_W = 184;
const CELL_H = 58;
const CELL_GAP = 7;
const cellX = (col: number) => CELL_W / 2 + col * (CELL_W + CELL_GAP);
const cellY = (row: number) => CELL_H / 2 + row * (CELL_H + CELL_GAP);
/**
 * 스텝 사이의 대기. 턴 재생은 이 `await wait()` 사슬 하나로 굴러간다.
 *
 * ⚠ 모바일 웹뷰는 백그라운드에서 타이머를 안 깨우는 경우가 있어, 이 대기가 안 풀리면
 *   `hitstop`이 켜진 채 판이 굳는다(2026-08-12 신고). 그래서 안 보이면 안 기다리고,
 *   `visibilitychange`가 오면 어느 방향이든 대기를 끝낸다. 상세는 CLAUDE.md "전투 연출".
 */
const wait = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    if (document.hidden) return resolve();
    const finish = () => {
      clearTimeout(id);
      document.removeEventListener("visibilitychange", finish);
      resolve();
    };
    const id = setTimeout(finish, ms);
    document.addEventListener("visibilitychange", finish);
  });

/**
 * Board cells an attack covers, from the attacker's cell and facing (+1 / -1).
 *
 * ⚠ **바위에 가려진 칸은 빼고 그린다**(2026-08-05). 붉은 칸은 "여기를 때린다"는
 * 약속이라, 사격선이 끊긴 칸까지 칠하면 화면이 거짓말을 한다 — 바위 뒤를 노리고
 * 카드를 냈는데 헛치는 게 버그로 읽힌다. 바위 **자체가 선 칸**은 남긴다(그 바위를
 * 때려서 깨는 게 실제로 일어나는 일이다). 관통 공격은 아무것도 안 걸러낸다.
 */
function attackCells(
  from: Cell,
  card: CardDef,
  facing: number,
  foe?: Cell,
  rocks: readonly Obstacle[] = [],
  pierces = false,
): Cell[] {
  if (card.kind !== "attack") return [];
  const cells = (card.range ?? [])
    .map((o) => ({ col: from.col + facing * o.df, row: from.row - o.du }))
    .filter(inBounds)
    .filter(
      (c) =>
        pierces ||
        !rocks.length ||
        !!rockAt(rocks, c) ||
        !shadowRock(rocks, from, c),
    );
  // 밀착: 상대가 내 셀에 겹쳐 서 있으면 이 카드로 때릴 수 있는지(pointBlank)에 따라
  // 내 셀도 타격 범위로 보여 준다 — 엔진 판정과 같은 규칙.
  if (
    foe &&
    foe.col === from.col &&
    foe.row === from.row &&
    card.pointBlank !== false
  )
    cells.push({ col: from.col, row: from.row });
  return cells;
}

/**
 * 화면에서 어느 쪽을 보고 설 것인가 — **상대가 있는 쪽**이다.
 *
 * 반환값은 `.fighter--left` / `.fighter--right` 클래스와 같은 뜻이라 이름이
 * 헷갈리기 쉬운데, `left` = "왼쪽에 서서 오른쪽을 본다"(`--flip: 1`)이고
 * `right` = 그 반대다. 대시로 상대를 지나치면 좌우가 뒤바뀌므로 자리(진영)가
 * 아니라 **매 프레임 열 위치를 비교해** 정한다.
 *
 * 같은 열이면(겹침·수직 정렬) 직전 방향을 유지한다 — 겹칠 때마다 홱홱 도는 것을
 * 막으려는 것으로, `fallback`에는 그 파이터의 진영을 넣는다.
 */
export function faceToward(
  myCol: number,
  foeCol: number,
  fallback: "left" | "right",
): "left" | "right" {
  if (myCol === foeCol) return fallback;
  return myCol < foeCol ? "left" : "right";
}

/** Where a move card lands, mirroring the engine's rule: walls stop you, the
 *  opponent's cell can be passed through or landed on (겹침 허용). Used to
 *  preview an attack's reach *after* earlier move cards in the plan resolve. */
function applyMovePreview(
  from: Cell,
  card: CardDef,
  rocks: readonly Obstacle[] = [],
  hazards: readonly Hazard[] = [],
): Cell {
  const [dc, dr] = MOVE_DELTA[card.dir ?? "right"];
  let cur = { ...from };
  for (let k = 0; k < (card.steps ?? 1); k++) {
    const next = { col: cur.col + dc, row: cur.row + dr };
    if (!canStand(rocks, next)) break; // 벽·바위에서 멈춤 — 엔진 applyMove와 같은 규칙
    cur = next;
  }
  // 빙판 — 엔진 `enterHazard`처럼 한 칸 더 미끄러진다(상대 칸 정지는 미리보기에선 생략).
  if ((cur.col !== from.col || cur.row !== from.row) && hazardAt(hazards, cur)?.kind === "ice") {
    const next = { col: cur.col + dc, row: cur.row + dr };
    if (canStand(rocks, next)) cur = next;
  }
  return cur;
}

const RESULT_TEXT: Partial<Record<ActionResult, string>> = {
  hit: "명중!",
  blocked: "가드됨",
  whiff: "빗나감",
  nofuel: "기력부족",
  guard: "가드",
  energy: "원기 +",
  heal: "회복!",
  move: "이동",
  collapse: "피해!",
  revive: "🔥",
  status: "피해!",
  buff: "강화!",
  frozen: "얼어붙음",
  rock: "",
};
/** 파이터 발밑 상태 칩 — 지금 뭐가 걸려 있는지 숫자를 안 읽어도 보이게. */
const STATUS_CHIP: Record<string, string> = {
  frozen: "❄",
  stunned: "💫",
  atkUp: "🔺",
  defUp: "🔷",
  freeCast: "🌀",
};
/** 몸에 두르는 기운의 색 — 상태이상 하나가 통째로 몸빛을 바꾼다. */
const STATUS_AURA: Record<string, string> = {
  poison: "#7bd88f",
  burn: "#ff9a3d",
  frozen: "#9fd8ff",
  stunned: "#ffe14d",
  bind: "#c4a3ff",
};
/**
 * 몸빛·HP바 색을 정할 때 **어느 상태이상이 이기는가**. 여러 개가 걸리면 앞선
 * 것을 쓴다 — 지금 가장 아픈 것(움직일 때마다 무는 중독 → 맞을 때마다 타는 화상 →
 * 행동을 통째로 막는 봉인) 순서다.
 */
const AURA_PRIORITY = ["poison", "burn", "frozen", "stunned", "bind"] as const;

/** 피해 꼬리표 — 화면에 "왜 깎였는지"를 아이콘+한 단어로 붙인다. */
const DMG_SRC: Record<DamageSrc, { icon: string; label: string }> = {
  attack: { icon: "⚔", label: "타격" },
  burn: { icon: "🔥", label: "화상" },
  shatter: { icon: "❄", label: "파쇄" },
  slam: { icon: "💥", label: "격돌" },
  thorns: { icon: "🌵", label: "반사" },
  recoil: { icon: "💢", label: "반동" },
  poison: { icon: "☠", label: "중독" },
  fog: { icon: "🌫", label: "독안개" },
  collapse: { icon: "🪨", label: "붕괴" },
  relic: { icon: "✦", label: "유물" },
};

/** 이 스텝에서 **그 진영이 실제로 깎인 몫**. 내역이 있으면 그걸 합치고, 없으면
 *  옛 필드(`damage`/`recoil`)로 떨어진다. */
function damageOn(step: Step, side: 0 | 1): number {
  if (step.bits)
    return step.bits.filter((b) => b.on === side).reduce((a, b) => a + b.n, 0);
  return side === 1 - step.actor ? step.damage : step.recoil;
}
/** 그 진영이 받은 피해의 내역(없으면 옛 필드로 한 줄 만들어 준다). */
function bitsOn(step: Step, side: 0 | 1): { src: DamageSrc; n: number }[] {
  if (step.bits)
    return step.bits
      .filter((b) => b.on === side)
      .map((b) => ({ src: b.src, n: b.n }));
  const n = damageOn(step, side);
  if (n <= 0) return [];
  // 내역이 없는 옛 경로 — 자기 몸에 뜨는 피해는 반동, 상대 몸이면 타격으로 본다.
  return [{ src: side === step.actor ? "recoil" : "attack", n }];
}

/** 픽셀 아이콘이 있는 상태이상(`public/redesign/ui/status/`). 나머지는 위 글리프. */
const STATUS_ICON = new Set(["poison", "burn", "bind"]);
function StatusGlyph({ kind }: { kind: string }) {
  return STATUS_ICON.has(kind) ? (
    <i
      className="stchip__ico"
      style={{ backgroundImage: `url(/redesign/ui/status/${kind}.png)` }}
    />
  ) : (
    <>{STATUS_CHIP[kind]}</>
  );
}

/**
 * 상태이상 목록을 **종류별로 묶는다**. 중독·화상은 겹마다 따로 살아 있어서
 * (남은 라운드가 겹마다 다르다) 그대로 그리면 같은 아이콘이 세 개씩 늘어선다.
 * 위력은 합(한 번에 들어오는 총 피해), 남은 라운드는 최대(그때까지는 남아 있다).
 */
function statusChips(
  list: readonly StatusEffect[],
): { kind: string; power: number; rounds: number }[] {
  const out: { kind: string; power: number; rounds: number }[] = [];
  for (const e of list) {
    const cur = out.find((c) => c.kind === e.kind);
    if (cur) {
      cur.power += e.power;
      cur.rounds = Math.max(cur.rounds, e.rounds);
    } else out.push({ kind: e.kind, power: e.power, rounds: e.rounds });
  }
  return out;
}

/**
 * 전투 기록 한 줄 — "누가 · 몇 번째로 · 무슨 카드를 냈고 · 그래서 누가 얼마나 깎였나".
 * 숫자가 떠올랐다 사라지는 것만으로는 놓친다는 신고에 대한 답이라, 이 목록은
 * 라운드가 끝날 때까지 화면에 **남아 있는다**.
 */
interface LogRow {
  id: number;
  /** 몇 번째 카드였나(0·1·2). 라운드 종료 정산은 undefined. */
  slot?: number;
  who: string;
  /** 이 행동을 한 쪽이 나인가 — 색과 정렬이 갈린다. */
  mine: boolean;
  card: string;
  result: ActionResult;
  /** 이 스텝에서 깎인 몫. `onMe`는 **내가** 맞았는지(누가 때렸는지가 아니다). */
  hits: { src: DamageSrc; n: number; onMe: boolean }[];
  heal: number;
}

const isAtk = (r: ActionResult) =>
  r === "hit" || r === "blocked" || r === "whiff";
const STEP_MS: Record<Step["phase"], number> = {
  move: 540,
  defense: 560,
  attack: 900,
  collapse: 700,
  revive: 1100,
  stun: 900, // 기절은 한 턴을 통째로 날리므로 충분히 보여준다
  trigger: 700,
  status: 620, // 독·화상 틱 — 여러 개가 잇달아 뜰 수 있어 짧게
  rock: 560, // 바위가 솟거나 부서지는 순간 — 판의 모양이 바뀌므로 눈에 담을 틈은 준다
};
/** 필살기(시그니처) 컷인이 화면을 채우는 시간 — 끝나면 실제 타격이 이어진다. */
const CUTIN_MS = 1750;
/**
 * 보스 컷인 길이. 필살기 컷인보다 **길다** — 이건 카드 하나가 아니라 "누구와
 * 싸우는지"를 못 박는 연출이라, 이름과 태그라인을 읽을 시간이 필요하다.
 * ⚠ `ui.css`의 `bosscut-*` 키프레임과 짝이다. 한쪽만 바꾸면 어긋난다.
 */
const BOSSCUT_MS = 2300;

/**
 * 공격 모션이 **실제로 상대에게 닿는** 시점(ms). SVG 아트에서는 `ui.css`의
 * atk-melee/atk-cast/atk-rush/atk-quake 키프레임이 파고드는 순간을 눈대중으로
 * 맞춘 값이다. ⚠ 키프레임 타이밍을 바꾸면 여기도 같이 맞춰야 한다.
 * 스프라이트 시트를 쓰는 캐릭터는 이 표 대신 클립의 `impactFrame`에서 정확한
 * 값이 나온다(`impactDelayOf`) — 추정이 아니라 실제 프레임 번호다.
 */
const IMPACT_MS: Record<string, number> = {
  punch: 265,
  slash: 265,
  rush: 250,
  quake: 345,
  bolt: 330,
  orb: 330,
  flame: 330,
  shield: 265,
};
const impactDelay = (sheet: SheetDef | undefined, fx?: string) =>
  impactDelayOf(sheet, fx) ?? IMPACT_MS[fx ?? "punch"] ?? 265;

/** 타격 순간 화면을 멈춰 무게를 주는 시간(hitstop). 피해량에 비례. */
const hitstopFor = (dmg: number, ko: boolean) =>
  ko ? 420 : Math.round(Math.min(150, 45 + dmg * 3.2));
/** 피해량 → 흔들림 세기(1 약 · 2 강 · 3 결정타). */
const shakeLevel = (dmg: number, ko: boolean): 1 | 2 | 3 =>
  ko ? 3 : dmg >= 26 ? 2 : 1;
/** 사거리 밖에서 날아오는 계열 — 준비 동작 소리가 다르다(차지 vs 바람가르기). */
const RANGED_FX = new Set(["bolt", "orb", "flame"]);

// 손패에는 공격·수비만 둔다 — 이동은 판의 칸을 눌러서 한다(2026-08-03).
// 탭을 오가는 조작이 특히 "이동 후 공격"에서 번거로웠다.

/** 함정 한 줄 설명(툴팁). 규칙은 `types.ts`의 `Hazard`. */
const HAZARD_TIP: Record<HazardKind, string> = {
  fire: "불길 — 들어서거나 라운드 끝에 서 있으면 화상",
  spikes: "가시덫 — 솟은 라운드에 밟으면 속박(경고 다음 라운드에 솟는다)",
  bramble: "가시덩굴 — 밟으면 속박 · 불길에 탄다",
  ice: "빙판 — 들어선 방향으로 한 칸 더 미끄러진다",
};

function baseView(b: CardBattle): View {
  const s = b.state;
  return {
    pos: [{ ...s.pos[0] }, { ...s.pos[1] }],
    hp: [s.hp[0], s.hp[1]],
    energy: [s.energy[0], s.energy[1]],
    shield: [s.shield[0], s.shield[1]],
    obstacles: s.obstacles.map((r) => ({ ...r, cell: { ...r.cell } })),
    fog: s.fog.map((f) => ({ ...f })),
    hazards: s.hazards.map((h) => ({ ...h })),
    round: s.round,
    acting: [false, false],
    actFx: [null, null],
    damage: [0, 0],
    dmgBits: [[], []],
    heal: [0, 0],
    stunned: [false, false],
    slam: [0, 0],
    status: [
      s.status[0].map((e) => ({ ...e })),
      s.status[1].map((e) => ({ ...e })),
    ],
    fx: [null, null],
    say: ["", ""],
    seq: 0,
  };
}

function stepToView(step: Step, seq: number): View {
  const s = step.snapshot;
  const a = step.actor;
  const d = 1 - a;
  const acting: [boolean, boolean] = [false, false];
  acting[a] = isAtk(step.result);
  const actFx: [string | null, string | null] = [null, null];
  if (acting[a]) actFx[a] = step.card.fx ?? "punch";
  // 상대에게 준 피해 — 공격뿐 아니라 유물 트리거(뇌운의 고리 등)도 -N을 띄운다.
  // ⚠ **내역(`Step.bits`)이 있으면 그쪽이 이긴다** — 처박기·가시 반사는 `damage`·
  //   `recoil` 어디에도 안 실려서, 예전엔 뜨는 숫자보다 체력이 더 줄었다.
  const damage: [number, number] = [damageOn(step, 0), damageOn(step, 1)];
  const dmgBits: View["dmgBits"] = [bitsOn(step, 0), bitsOn(step, 1)];
  const heal: [number, number] = [0, 0];
  if (step.heal > 0) heal[a] = step.heal;
  const stunned: [boolean, boolean] = [false, false];
  if (step.card.id === "stun") stunned[a] = true; // 이 턴을 통째로 버리는 기절
  // 넉백이 벽에 막혔다 — 부딪힌 쪽은 언제나 방어자다(`Step.slam`).
  const slam: [number, number] = [0, 0];
  if (step.slam) slam[d] = step.slam;
  const fx: [Fx | null, Fx | null] = [null, null];
  if (step.card.kind === "attack" && step.result !== "nofuel")
    fx[a] = { kind: step.card.fx ?? "punch", result: step.result };
  else if (step.card.id === "trigger")
    fx[a] = { kind: "trigger", result: "trigger" }; // 유물 트리거 발동 팝
  const say: [string, string] = ["", ""];
  say[a] = `${step.card.name} ${RESULT_TEXT[step.result] ?? ""}`.trim();
  if (step.drain > 0) say[a] += ` ⚡+${step.drain}`;
  return {
    pos: [{ ...s.pos[0] }, { ...s.pos[1] }],
    hp: [s.hp[0], s.hp[1]],
    energy: [s.energy[0], s.energy[1]],
    shield: [s.shield[0], s.shield[1]],
    obstacles: s.obstacles.map((r) => ({ ...r, cell: { ...r.cell } })),
    fog: s.fog.map((f) => ({ ...f })),
    hazards: s.hazards.map((h) => ({ ...h })),
    round: s.round,
    acting,
    actFx,
    status: [
      s.status[0].map((e) => ({ ...e })),
      s.status[1].map((e) => ({ ...e })),
    ],
    damage,
    dmgBits,
    heal,
    stunned,
    slam,
    fx,
    say,
    seq,
  };
}

/** 공격이 아닌 스텝(이동·수비·기력·힐·안개·기절·유물)의 효과음. 공격은 준비
 *  동작과 타격이 나뉘어 있어 `submitPlan`에서 따로 울린다. */
function stepSfx(step: Step): void {
  if (step.result === "nofuel") return playSfx("nofuel");
  if (step.card.id === "stun") return playSfx("stun");
  if (step.card.id === "trigger" || step.phase === "revive")
    return playSfx("trigger");
  if (step.phase === "collapse") return playSfx("collapse");
  switch (step.card.kind) {
    case "move":
      return playSfx((step.card.steps ?? 1) >= 2 ? "dash" : "move");
    case "guard":
      return playSfx("guard");
    case "energy":
      return playSfx("energy");
    case "heal":
      return playSfx("heal");
    case "buff":
      return playSfx("guard");
  }
}

export function BattleScreen({
  p0CharId,
  p1CharId,
  localSide,
  deck,
  battleOpts,
  telegraph,
  boss,
  scene = "grassland",
  relics = [],
  place,
  foeInfo,
  getOpponentPlan,
  turnSeconds,
  onSlotsChange,
  tips = true,
  onEnd,
  onQuit,
}: {
  /** Canonical fighters: index 0 is shown on the left, 1 on the right. In
   *  multiplayer this is host vs guest, identical on both peers. */
  p0CharId: string;
  p1CharId: string;
  /** Which side this client controls (0 in single-player). */
  localSide: 0 | 1;
  /** 로컬 플레이어의 손패(고정 7 + 고른 카드). 미지정 시 캐릭터 전체 카드
   *  (`deckFor`) — 튜토리얼·구 흐름 호환. */
  deck?: CardDef[];
  /** 로그라이크용 — 유물 merge 패시브·몬스터 스탯 override(엔진 BattleOpts). */
  battleOpts?: BattleOpts;
  /** 보스 예고 — 선택 화면에 상대(side 1)의 이번 턴 행동을 미리 알린다. */
  telegraph?: (turn: number, oppHpFrac: number) => string | null;
  /**
   * 보스 컷인(등장·격노). 주면 **전투 시작 직전**에 등장 컷인이 한 번 뜨고,
   * 보스 체력이 `enrageAt` 아래로 떨어지는 순간 격노 컷인이 한 번 더 뜬다.
   * 스크립트 보스가 아니면 미지정 = 컷인 없음(봇전·온라인은 항상 미지정).
   * ⚠ **상대(side 1)가 보스라는 전제**다 — 런은 항상 `localSide === 0`이다.
   */
  boss?: BossCinematic;
  /** 전장 배경. 로그라이크는 지역을 따르고(`sceneFor`), 봇전·멀티는 기본 초원. */
  scene?: BattleScene;
  /** 내 유물 — 체력·기력 아래 줄에 놓인다. 단판에는 없다. */
  relics?: string[];
  /** HUD 가운데 부제(예: "초원 · 5층"). */
  place?: string;
  /** 상대 정보 — 등급 표기 · 처음엔 ?로 가려지는 능력들. */
  foeInfo?: { tag?: string; abilities: FoeAbility[] };
  getOpponentPlan: OpponentPlanner;
  /** 턴 제한(초). 주면 카운트다운이 돌고 0에서 자동 제출한다 — 상대를 무한정
   *  기다리지 않도록 온라인 대전에서만 사용(싱글·튜토리얼은 미지정). */
  turnSeconds?: number;
  /** 순서 칸이 바뀔 때마다(튜토리얼이 "카드를 놓았다"를 알아채는 자리). */
  onSlotsChange?: (slots: (CardDef | null)[]) => void;
  /** 첫 만남 팁(꾹 누르기 · 기력 부족 · 바위 · 붕괴 · 보스 · 상태이상). 튜토리얼만 끈다. */
  tips?: boolean;
  /** 전투 종료 콜백 — 로컬 승패 + 로컬 남은 체력(로그라이크 HP 인계용). */
  onEnd: (localWon: boolean, selfHpLeft: number) => void;
  onQuit: () => void;
}) {
  const battleRef = useRef<CardBattle | null>(null);
  if (!battleRef.current)
    battleRef.current = new CardBattle(p0CharId, p1CharId, battleOpts);
  const battle = battleRef.current;

  // canonical (left/right) fighters for rendering + the local one for controls
  const c0 = battle.chars[0];
  const c1 = battle.chars[1];
  const local = battle.chars[localSide];
  const hand = useMemo(() => deck ?? deckFor(local), [deck, local]);

  // Render from THIS client's perspective: the local fighter always sits on the
  // left facing right, the opponent on the right. The engine stays canonical
  // (host = side 0); we only mirror the *display* when we control side 1, so
  // forward is always "right" on screen — no per-seat card flipping needed.
  const flip = localSide === 1;
  const dcol = (col: number) => (flip ? GRID_COLS - 1 - col : col);
  // Move cards are absolute (col +/-); when mirrored, relabel left<->right so a
  // card's arrow/name matches the direction the sprite actually goes on screen.
  const faceCard = (c: CardDef): CardDef => {
    if (!flip || c.kind !== "move" || !c.dir) return c;
    const dir = MIRROR_DIR[c.dir];
    if (dir === c.dir) return c; // 위/아래는 반전해도 그대로
    const steps = c.steps ?? 1;
    // 대각선은 이름·설명에 방향 화살표를 그대로 쓰므로 라벨만 짝으로 바꾼다
    if (c.dir.includes("-")) {
      const arrows: Partial<Record<MoveDir, string>> = {
        "up-right": "↗",
        "up-left": "↖",
        "down-right": "↘",
        "down-left": "↙",
      };
      const arrow = arrows[dir] ?? "";
      const word = dir.startsWith("up") ? "위" : "아래";
      const side = dir.endsWith("right") ? "오른쪽" : "왼쪽";
      return {
        ...c,
        dir,
        name: `${arrow} 대각 이동`,
        desc: `${side} ${word}로 한 칸 이동. (${arrow})`,
      };
    }
    const word = dir === "right" ? "오른쪽" : "왼쪽";
    const sym =
      dir === "right" ? (steps >= 2 ? ">>" : ">") : steps >= 2 ? "<<" : "<";
    const name = steps >= 2 ? `${word} 대시` : word;
    const desc =
      steps >= 2
        ? `${word}으로 두 칸 이동. (${sym})`
        : `${word}으로 한 칸 이동. (${sym})`;
    return { ...c, dir, name, desc };
  };
  const svgs = useMemo(
    () => [buildFighterSvg(c0), buildFighterSvg(c1)] as const,
    [c0, c1],
  );
  // 스프라이트 시트가 있는 캐릭터는 픽셀 애니메이션으로, 없으면 기존 SVG로 그린다
  // (마이그레이션 도중에도 전투가 깨지지 않게 한 폴백).
  const sheets = useMemo(
    () =>
      [sheetFor(c0.spriteId ?? c0.id), sheetFor(c1.spriteId ?? c1.id)] as const,
    [c0, c1],
  );
  // 첫 공격에서 PNG를 받느라 한 프레임 비는 걸 막는다
  useEffect(() => {
    for (const s of sheets) if (s) void preloadSheet(s);
  }, [sheets]);
  // 이동 미리보기 잔상 — 본체와 같은 몸·같은 방향으로 서야 한다
  const ghostSheet = sheets[localSide];
  // 필살기 컷인에 쓰는 대형 초상 (선택 화면과 같은 아트)

  const [view, setView] = useState<View>(() => baseView(battle));
  /**
   * 연출 속도 — **차근차근 / 빠르게** 둘뿐이다(`game/settings.ts`).
   * ⚠ 해소 루프는 async라 state를 잡아 두면 **시작 시점의 옛 값**을 계속 본다.
   *   루프 안에서는 반드시 `paceRef`를 읽는다(격노 컷인의 `enragedRef`와 같은 이유).
   */
  const [pace, setPaceState] = useState<BattlePace>(loadBattlePace);
  const paceRef = useRef(pace);
  paceRef.current = pace;
  const setPace = (p: BattlePace) => {
    setPaceState(p);
    saveBattlePace(p);
  };
  const [slots, setSlots] = useState<(CardDef | null)[]>([null, null, null]);
  useEffect(() => onSlotsChange?.(slots), [slots, onSlotsChange]);
  const [phase, setPhase] = useState<"select" | "resolving" | "over">("select");
  const [waitingRemote, setWaitingRemote] = useState(false);
  /**
   * 이번 라운드에 **양쪽이 낸 3장**(정규 좌표 — [side0, side1]). 해소하는 동안
   * 화면 아래에 그대로 펼쳐 둔다: 예전엔 실행을 누르는 순간 카드가 사라져서
   * "내가 뭘 냈더라 / 쟤는 뭘 냈지"를 확인할 방법이 아예 없었다.
   */
  const [roundPlans, setRoundPlans] = useState<[CardDef[], CardDef[]] | null>(
    null,
  );
  /** 지금 재생 중인 슬롯(0·1·2). 라운드 종료 정산 구간에서는 null. */
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  /** 슬롯이 바뀔 때 양쪽 카드를 크게 펼치는 공개 연출(차근차근 모드 전용). */
  const [slotReveal, setSlotReveal] = useState<{
    seq: number;
    slot: number;
  } | null>(null);
  /** 이번 라운드에 실제로 일어난 일 — 무엇이 몇 대미지였는지 글로 남는다. */
  const [log, setLog] = useState<LogRow[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  /** 턴 제한 남은 초(온라인 전용, 미사용 시 null) */
  const [remain, setRemain] = useState<number | null>(null);
  const submittingRef = useRef(false);
  const cancelled = useRef(false);
  // bump to re-read cooldowns after a turn resolves
  const [, setTick] = useState(0);
  const [hoveredCard, setHoveredCard] = useState<CardDef | null>(null);
  // where the hovered attack sits in the plan: a slot index, or null = "from hand"
  // (would land in the next empty slot). Drives the move-aware range preview.
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [hitFlash, setHitFlash] = useState<{
    seq: number;
    target: 0 | 1;
  } | null>(null);
  // cells the currently-resolving attack covers, with which fighter is attacking
  const [resolveHit, setResolveHit] = useState<{
    cells: Cell[];
    actor: 0 | 1;
  } | null>(null);
  // 필살기 컷인(시그니처 카드 발동 순간 화면을 덮는 연출)
  const [cutIn, setCutIn] = useState<{
    seq: number;
    actor: 0 | 1;
    card: CardDef;
  } | null>(null);
  // 실행 중 위쪽에 뜨는 "CARD n/3" 안내.
  const [callout, setCallout] = useState<{
    no: number;
    name: string;
    note: string;
  } | null>(null);
  // 유물 발동 연출 — 재생을 기다리지 않는다(`key`로 다시 뛰는 CSS 애니메이션뿐이다).
  const [fired, setFired] = useState<{ seq: number; ids: string[] } | null>(
    null,
  );
  const [ribbon, setRibbon] = useState<{
    seq: number;
    kind: "relic" | "foe";
    atlasId: string;
    title: string;
    note: string;
  } | null>(null);
  const seenFoe = useMemo(() => seenFoeAbilities(), []);
  /** 이미 드러난 적 능력. 한 번 본 건 도감에 남아 처음부터 보인다. */
  const [revealed, setRevealed] = useState<Set<string>>(
    () =>
      new Set(
        foeInfo?.abilities.filter((a) => seenFoe.has(a.key)).map((a) => a.key),
      ),
  );
  const revealedRef = useRef(revealed);
  /**
   * 꾹 눌러 여는 **카드 상세**(2026-08-05). 압축 카드에서 뺀 설명·능력의 뜻이
   * 여기로 갔다. 누른 카드는 ref로 기억한다 — 훅은 화면에 하나뿐이라 손패 카드마다
   * 따로 걸 수 없다.
   */
  const [zoomCard, setZoomCard] = useState<CardDef | null>(null);
  const pressedCard = useRef<CardDef | null>(null);
  const longPress = useLongPress(() => {
    if (!pressedCard.current) return;
    setZoomCard(pressedCard.current);
    setHoveredCard(null);
    setHoverSlot(null);
    playSfx("ui");
  });
  // 보스 컷인 — 등장(전투 시작)과 격노(페이즈 전환) 두 번뿐이다. 필살기 컷인과
  // **별개의 레이어**다: 저쪽은 카드 한 장을 못 박고 이쪽은 상대가 누구인지를 못 박는다.
  const [bossCut, setBossCut] = useState<{
    seq: number;
    kind: "entrance" | "enrage";
  } | null>(null);
  // 격노 컷인은 전투당 한 번. ref로 두는 이유는 해소 루프(async) 안에서 읽고 쓰기
  // 때문 — state로 두면 루프가 잡아 둔 옛 값을 계속 본다. state 쪽은 **그리기용**
  // (격노 뒤에는 무대·HP바가 계속 붉게 남아야 하므로 리렌더가 필요하다).
  const enragedRef = useRef(false);
  const [enraged, setEnraged] = useState(false);
  // 타격 순간 화면 정지(hitstop) — 켜져 있는 동안 모든 애니메이션이 멈춘다
  const [hitstop, setHitstop] = useState(false);
  // 피격 지점에서 터지는 불꽃 파편
  const [sparks, setSparks] = useState<{
    seq: number;
    cell: Cell;
    n: number;
    color: string;
    big: boolean;
  } | null>(null);
  // KO 순간 화면을 덮는 백색 섬광
  const [koFlash, setKoFlash] = useState(0);
  // 벽 격돌 — 넉백이 판 끝 암벽에 막힌 순간 그 가장자리에서 터지는 돌먼지.
  // `side`는 **화면 기준**이라 `flip`을 이미 반영한 값이 들어온다.
  const [wallSlam, setWallSlam] = useState<{
    seq: number;
    side: "left" | "right";
  } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  /**
   * 카메라 펀치 — 타격이 꽂힐 때 판을 흔들고 살짝 밀어 넣는다.
   * CSS 클래스가 아니라 Web Animations로 돌린다: 연타가 400ms 안에 겹쳐도
   * 매번 처음부터 다시 재생된다(클래스 토글은 같은 클래스가 유지되면 안 뛴다).
   */
  const punch = (level: 1 | 2 | 3) => {
    const el = gridRef.current;
    if (!el) return;
    const amp = level === 3 ? 17 : level === 2 ? 10 : 5;
    const zoom = level === 3 ? 1.04 : level === 2 ? 1.018 : 1.007;
    const at = (x: number, y: number, s: number, offset: number) => ({
      transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s})`,
      offset,
    });
    el.animate(
      [
        at(0, 0, 1, 0),
        at(-amp, amp * 0.6, zoom, 0.14),
        at(amp * 0.85, -amp * 0.7, zoom, 0.32),
        at(-amp * 0.6, -amp * 0.35, 1, 0.5),
        at(amp * 0.45, amp * 0.45, 1, 0.7),
        at(-amp * 0.18, amp * 0.12, 1, 0.86),
        at(0, 0, 1, 1),
      ],
      { duration: level === 3 ? 640 : 400, easing: "ease-out" },
    );
  };

  // ---- plan building -----------------------------------------------------
  const cdLeft = (id: string) => battle.state.cooldowns[localSide][id] ?? 0;
  // 한 턴에 같은 카드를 두 번 못 넣는 경우: 쿨타임 카드(다음 턴 잠기므로)와
  // 모든 공격 카드(같은 공격 반복 금지 — 3공격은 서로 다른 카드로만 가능).
  const placedNoRepeat = (c: CardDef) =>
    ((c.cooldown ?? 0) >= 1 || c.kind === "attack") &&
    slots.some((s) => s?.id === c.id);
  /**
   * **봉인이 라운드를 넘어온 경우**만 손패에 이유를 세운다(2026-08-07).
   *
   * 기절·빙결·속박은 기본적으로 걸린 라운드 안에서만 살기 때문에, 카드를 고르는 이
   * 시점에는 보통 아무것도 안 걸려 있다(예전 "넉백 당하고 이동이 안 된다" 함정은
   * 그래서 규칙째로 사라졌다). 예외는 **런 전용 전설 유물**(`stunRoundBonus` 계열)로
   * 지속이 2라운드가 된 봉인뿐이다 — 그때는 고른 카드가 통째로 무효가 되므로
   * **왜인지 말해 주지 않으면 "실행했는데 아무 일도 안 일어난다"가 된다**.
   *
   * ⚠ 카드를 **못 고르게 막지는 않는다**. 봉인은 엔진이 슬롯마다 다시 판정하고
   *   (같은 라운드 안에서 풀릴 수도 있다 — 빙결은 맞으면 깨진다), 여기서 잠그면
   *   그 경우에 낼 수 있었던 카드를 화면이 먼저 빼앗는 셈이 된다.
   */
  const roundLock =
    battle.lockedThisRound(localSide) ?? battle.statusOf(localSide, "bind");
  const selectable = (c: CardDef) => cdLeft(c.id) === 0 && !placedNoRepeat(c);

  // which slot numbers (1-based) contain this card id
  const slotNosFor = (id: string): number[] =>
    slots
      .map((s, i) => (s?.id === id ? i + 1 : null))
      .filter((n): n is number => n !== null);


  const addCard = (c: CardDef) => {
    if (phase !== "select" || !selectable(c) || !canAfford(c)) return;
    const i = slots.indexOf(null);
    if (i === -1) return;
    const next = slots.slice();
    next[i] = c;
    setSlots(next);
    playSfx("ui");
    // 배치 후엔 호버 미리보기를 놓는다 — 대신 `planPreview`가 이어받아 고른
    // 카드 기준 예시가 계속 남는다(터치 기기는 mouseleave가 없어 방금 놓은
    // 카드가 호버로 남으면 같은 이동이 두 번 반영돼 보인다).
    setHoveredCard(null);
    setHoverSlot(null);
  };
  const clearSlot = (i: number) => {
    if (phase !== "select" || !slots[i]) return;
    const next = slots.slice();
    next[i] = null;
    setSlots(next);
    playSfx("uiBack");
    setHoveredCard(null);
    setHoverSlot(null);
  };
  const reset = () => {
    setSlots([null, null, null]);
    playSfx("uiBack");
  };

  // 실효 패시브(유물 merge 반영) — 유물로 매턴 기력이 붙으면 기력 예산에 반영
  const passiveEnergy = battle.passive[localSide].turnEnergy ?? 0;
  // 무아지경(freeCast)이 걸려 있으면 이번 턴 모든 카드가 공짜다 — 엔진과 같은 규칙
  const freeCastOn = !!battle.statusOf(localSide, "freeCast");
  const filled = slots.every((c): c is CardDef => c !== null);
  const affordable =
    filled &&
    planAffordable(
      slots as CardDef[],
      battle.state.energy[localSide],
      local.maxEnergy,
      passiveEnergy,
      freeCastOn,
    );

  // 이 카드를 다음 빈 슬롯에 넣어도 플랜 전체를 지불할 수 있는가.
  // 기력은 슬롯 순서대로 오가므로(원기 회복이 중간에 채워줄 수도) 엔진과 같은
  // `planAffordable`로 정확히 검사한다. 못 내는 카드는 아예 선택 불가(disabled).
  const canAfford = (c: CardDef): boolean => {
    const i = slots.indexOf(null);
    if (i === -1) return true; // 슬롯이 가득 — 어차피 추가되지 않는다
    const next = slots.slice();
    next[i] = c;
    return planAffordable(
      next.filter((x): x is CardDef => !!x),
      battle.state.energy[localSide],
      local.maxEnergy,
      passiveEnergy,
      freeCastOn,
    );
  };

  // 지금까지 고른 카드만으로 그리는 **상시 미리보기**. 슬롯을 순서대로 훑으며
  // 이동은 위치를 옮기고, 공격은 그 시점 위치에서의 타격 셀을 모은다. 카드를
  // 놓아도 예시가 유지되고, 슬롯이 모두 비어야 사라진다.
  // ⚠ 카드를 고르는 동안에만 그린다 — 실행을 누르면 슬롯은 그대로지만(해소가
  //   끝나야 비운다) 예시는 즉시 사라져야 실제 진행과 겹치지 않는다.
  // 지금 판에 선 바위. 이동 가능 칸·사거리 미리보기가 전부 이걸 본다(엔진과 같은 규칙).
  const rocks = battle.state.obstacles;
  /** 이 카드가 바위를 무시하는가 — 엔진 `piercesRock`(카드 pierce + 유물 alwaysPierce). */
  const piercesRock = (c: CardDef) =>
    !!c.pierce || !!battle.passive[localSide].alwaysPierce;

  const planPreview = useMemo(() => {
    const cur = view.pos[localSide];
    const none = {
      ghost: null as Cell | null,
      cells: [] as Cell[],
      steps: [] as { cell: Cell; no: number }[],
    };
    if (phase !== "select") return none;
    const foe = view.pos[1 - localSide];
    let at = { ...cur };
    // 공격 범위는 **누적하지 않는다** — 여러 장을 고르면 빨간 칸이 뒤섞여 헷갈리므로
    // 가장 마지막에 고른 공격의 범위만 남긴다(위치는 앞선 이동까지 반영된 값).
    let cells: Cell[] = [];
    // 발자국 — 이동이 담긴 순서대로 내려앉는 칸(디자인 `MoveBundle`의 `.trail`).
    const steps: { cell: Cell; no: number }[] = [];
    for (let si = 0; si < slots.length; si++) {
      const c = slots[si];
      if (!c) continue;
      if (c.kind === "move") {
        at = applyMovePreview(at, c, rocks, battle.state.hazards);
        steps.push({ cell: { ...at }, no: si + 1 });
      }
      // ⚠ 방향은 **그 카드가 나갈 자리에서** 다시 잰다(2026-08-05) — 앞선 이동으로
      //   상대를 지나쳤으면 사거리도 같이 뒤집힌다. 엔진과 같은 규칙.
      else if (c.kind === "attack")
        cells = attackCells(
          at,
          c,
          facingBetween(at, foe, localSide),
          foe,
          rocks,
          piercesRock(c),
        );
    }
    const moved = at.col !== cur.col || at.row !== cur.row;
    return { ghost: moved ? at : null, cells, steps };
  }, [slots, view, localSide, battle, phase]);

  // Preview the hovered card's effect on my position. `from` = where I stand
  // when this card resolves (start cell shifted by every move card *before* it
  // in the plan, so it tracks queued dashes). `ghost` = where I'll actually be
  // standing for it — after this move for a move card, or `from` for an attack —
  // or null when it doesn't change my cell.
  const preview = useMemo(() => {
    const cur = view.pos[localSide];
    // 위치와 무관한 카드(가드·원기·힐)를 올려보거나 아무것도 안 올려봤으면
    // 고른 카드 기준 미리보기를 그대로 유지한다 — 예시는 깜빡이지 않는다.
    const spatial =
      hoveredCard?.kind === "move" || hoveredCard?.kind === "attack";
    if (!hoveredCard || !spatial)
      return { from: cur, ghost: planPreview.ghost };
    const nextEmpty = slots.indexOf(null);
    const upto = hoverSlot ?? (nextEmpty === -1 ? slots.length : nextEmpty);
    let from = { ...cur };
    for (let j = 0; j < upto; j++) {
      const c = slots[j];
      if (c?.kind === "move") from = applyMovePreview(from, c, rocks, battle.state.hazards);
    }
    let ghost: Cell | null =
      hoveredCard.kind === "move"
        ? applyMovePreview(from, hoveredCard, rocks, battle.state.hazards)
        : from;
    if (ghost && ghost.col === cur.col && ghost.row === cur.row) ghost = null;
    return { from, ghost };
  }, [hoveredCard, hoverSlot, slots, view, localSide, planPreview]);

  /**
   * **칸을 눌러 이동한다**(2026-08-03). 이동 카드를 탭에서 고르는 대신, 지금
   * 갈 수 있는 칸을 노란색으로 밝혀 두고 그걸 누르면 해당 이동 카드가 슬롯에
   * 담긴다 — "이동 탭 → 카드 → 공격 탭 → 카드"를 오가던 걸 없앤다.
   *
   * 출발점은 **고른 카드까지 반영된 위치**(`planPreview.ghost`)다. 그래야 두
   * 번 연속으로 눌러 두 칸을 갈 수 있다.
   * 같은 칸에 닿는 카드가 둘이면 **적은 걸음 수**를 고른다(대시보다 한 칸짜리를
   * 먼저 — 대시는 쿨이 있어 아껴 두는 게 보통 이득이다).
   */
  const moveTargets = useMemo(() => {
    const out = new Map<string, CardDef>();
    if (phase !== "select" || slots.every((x) => x !== null)) return out;
    const from = planPreview.ghost ?? view.pos[localSide];
    for (const c of hand) {
      if (c.kind !== "move" || !selectable(c) || !canAfford(c)) continue;
      const to = applyMovePreview(from, c, rocks, battle.state.hazards);
      if (to.col === from.col && to.row === from.row) continue; // 벽·바위에 막혀 제자리
      const key = `${to.col},${to.row}`;
      const prev = out.get(key);
      if (!prev || (c.steps ?? 1) < (prev.steps ?? 1)) out.set(key, c);
    }
    return out;
  }, [
    hand,
    slots,
    planPreview,
    view,
    localSide,
    phase,
    battle.state.cooldowns,
  ]);

  /**
   * **안 밝혀진 칸을 눌렀을 때 띄울 이유**(디자인 `MoveBundleSpec`의 "못 가는 칸을
   * 눌렀을 때"). 밝혀지지 않는 칸은 전부 똑같이 생겨서, 쿨인지·이미 담았는지·
   * 기력인지·속박인지가 구분되지 않았다 — 그 칸을 눌러 1초간 이유를 보여 준다.
   */
  const moveReasons = useMemo(() => {
    const out = new Map<string, string>();
    if (phase !== "select") return out;
    const full = slots.every((x) => x !== null);
    const from = planPreview.ghost ?? view.pos[localSide];
    for (const c of hand) {
      if (c.kind !== "move") continue;
      const to = applyMovePreview(from, c, rocks, battle.state.hazards);
      if (to.col === from.col && to.row === from.row) continue;
      const key = `${to.col},${to.row}`;
      if (moveTargets.has(key)) continue;
      const why = full
        ? "순서 칸이 꽉 찼다"
        : cdLeft(c.id) > 0
          ? `${c.name} 쿨 ${cdLeft(c.id)}`
          : placedNoRepeat(c)
            ? `${c.name}은 이미 담았다`
            : `기력 부족 — ${c.name}`;
      if (!out.has(key)) out.set(key, why);
    }
    return out;
  }, [hand, slots, planPreview, view, localSide, phase, moveTargets, battle.state.cooldowns]);

  // 1초만 떠 있는 안내. ⚠ 생 `setTimeout`이 아니라 `wait`을 거친다 — 백그라운드에서
  // 안 깨는 타이머에 걸리면 안내가 영구히 남는다(CLAUDE.md "전투 연출").
  const [moveToast, setMoveToast] = useState<{ key: string; text: string } | null>(null);
  const toastSeq = useRef(0);
  const sayWhy = (key: string, text: string) => {
    const seq = ++toastSeq.current;
    setMoveToast({ key, text });
    playSfx("uiBack");
    void wait(1100).then(() => {
      if (toastSeq.current === seq) setMoveToast(null);
    });
  };

  // --- 이동 묶음(디자인 `MoveBundle`) -------------------------------------
  const moveDeck = useMemo(() => hand.filter((c) => c.kind === "move"), [hand]);
  const [tray, setTray] = useState(false);
  /**
   * 묶음 앞면 — 3×3 나침반과 준비·쿨 개수. 색의 뜻은 디자인 그대로다:
   * 파랑 = 그 방향 준비 · 주황 테 = 대시도 준비 · 어두움+숫자 = 쿨 · 금 = 순서 칸에
   * 담김 · 빈 칸 = 그 방향 카드 없음.
   */
  const bundle = useMemo(() => {
    const ORDER: (MoveDir | null)[] = [
      "up-left", "up", "up-right",
      "left", null, "right",
      "down-left", "down", "down-right",
    ];
    const dirOf = (c: CardDef) => faceCard(c).dir;
    const compass = ORDER.map((d) => {
      if (!d) return { k: "me", t: "" };
      const ms = moveDeck.filter((c) => dirOf(c) === d);
      if (!ms.length) return { k: "none", t: "" };
      const ready = ms.filter((c) => selectable(c) && canAfford(c));
      const placed = ms.some((c) => slotNosFor(c.id).length > 0);
      if (!ready.length && placed) return { k: "in", t: "" };
      if (!ready.length) {
        const cds = ms.map((c) => cdLeft(c.id)).filter((n) => n > 0);
        return { k: "cd", t: cds.length ? String(Math.min(...cds)) : "" };
      }
      return {
        k: ready.some((c) => (c.steps ?? 1) > 1) ? "dash" : "ready",
        t: "",
      };
    });
    const ready = moveDeck.filter((c) => selectable(c) && canAfford(c)).length;
    const cooling = moveDeck.filter((c) => cdLeft(c.id) > 0).length;
    const full = slots.every((x) => x !== null);
    const bind = roundLock?.kind === "bind";
    const dim = roundLock?.kind === "frozen" || roundLock?.kind === "stunned";
    return {
      compass,
      ready: bind || dim ? 0 : ready,
      cooling: bind || dim ? "—" : String(cooling),
      locked: bind,
      dim,
      hint: dim
        ? "행동 불가"
        : bind
          ? "속박 · 1R"
          : tray
            ? "▼ 닫기"
            : full
              ? "순서 칸이 꽉 찼다"
              : "▲ 펼치기",
    };
  }, [moveDeck, slots, tray, roundLock, battle.state.cooldowns, battle.state.energy]);

  // 강조할 타격 셀 — 공격 카드를 올려보는 중이면 그 카드의 사거리, 아니면 고른
  // 플랜의 공격들이 덮는 셀(그대로 남아 있는 예시).
  const targetCells = useMemo(
    () =>
      hoveredCard?.kind === "attack"
        ? attackCells(
            preview.from,
            hoveredCard,
            facingBetween(preview.from, view.pos[1 - localSide], localSide),
            view.pos[1 - localSide],
            rocks,
            piercesRock(hoveredCard),
          )
        : planPreview.cells,
    [hoveredCard, preview, battle, localSide, planPreview],
  );

  // 잔상이 **도착 지점에서** 상대를 보는 방향. 본체와 같은 규칙을 쓰되 기준 셀만
  // 이동 후 위치라, 상대를 지나쳐 가는 이동이면 본체와 반대쪽을 보게 된다.
  const ghostFace = faceToward(
    dcol(preview.ghost?.col ?? view.pos[localSide].col),
    dcol(view.pos[1 - localSide].col),
    "left",
  );
  const ghostPlace = ghostSheet ? placeSprite(ghostSheet, ghostFace) : null;

  // ---- resolve a turn ----------------------------------------------------
  /** 한 턴을 굴리고 끝까지 재생한다. 이중 제출 잠금·실패 복구는 아래 `submitPlan`이 감싼다. */
  const playTurn = async (localPlan: CardDef[]) => {
    setPhase("resolving");
    setHoveredCard(null);

    // get the opponent's plan (instant for AI, awaits the peer in multiplayer)
    setWaitingRemote(true);
    const oppPlan = await getOpponentPlan(localPlan, battle);
    setWaitingRemote(false);
    if (cancelled.current) return;
    if (!oppPlan) {
      // peer disconnected while we waited
      setBanner("상대 연결 끊김");
      setPhase("over");
      await wait(1600);
      if (cancelled.current) return;
      onQuit();
      return;
    }

    // host is side 0, guest side 1 — feed plans in canonical order
    const planA = localSide === 0 ? localPlan : oppPlan;
    const planB = localSide === 0 ? oppPlan : localPlan;
    // 이번 라운드의 연출 길이는 **시작할 때 한 번** 정한다 — 재생 도중에 토글을
    // 눌러 템포가 중간에 바뀌면 그게 더 헷갈린다(다음 라운드부터 적용된다).
    const cfg = PACE_CFG[paceRef.current];
    /** 스텝 꼬리 대기에만 붙는 배수 — 타격까지의 선행 시간은 손대지 않는다. */
    const paced = (ms: number) => Math.round(ms * cfg.step);
    setRoundPlans([planA, planB]);
    setLog([]);
    setActiveSlot(null);
    // ⚠ resolveRound은 battle.state를 **턴 종료 상태로** 밀어 버린다. 첫 공격의
    //   준비 동작에 쓸 턴 시작 화면은 그 전에 떠 둬야 한다.
    const turnStart = baseView(battle);
    const steps = battle.resolveRound(planA, planB);

    /** 이 스텝의 피해로 정말 쓰러졌는가 — 뒤에 부활 스텝이 오면 KO가 아니다. */
    const koAt = (si: number, target: 0 | 1) =>
      steps[si].snapshot.hp[target] <= 0 &&
      !steps
        .slice(si + 1)
        .some((s) => s.phase === "revive" && s.actor === target);

    /**
     * 피해가 꽂히는 순간 한 묶음 — 섬광·불꽃·카메라 펀치·소리, 그리고 화면 정지.
     * 되돌려주는 값은 정지에 쓴 시간(ms)이라 남은 대기에서 빼면 템포가 유지된다.
     */
    const impact = async (
      step: Step,
      target: 0 | 1,
      dmg: number,
      ko: boolean,
      opts: { blocked?: boolean; sound?: boolean } = {},
    ): Promise<number> => {
      setHitFlash((prev) => ({ seq: (prev?.seq ?? 0) + 1, target }));
      setSparks((prev) => ({
        seq: (prev?.seq ?? 0) + 1,
        cell: step.snapshot.pos[target],
        n: opts.blocked ? 7 : Math.min(18, 7 + Math.round(dmg / 2.2)),
        color: opts.blocked ? "#9fc2ff" : dmg >= 26 ? "#fff1a8" : "#ffd9d9",
        big: dmg >= 26 || ko,
      }));
      // 벽 격돌 — 넉백이 판 끝에 막혔으면 그 가장자리에서 돌먼지가 터진다.
      // ⚠ 넉백은 **가드로 막혀도** 들어가므로(엔진 `computeAttack`) 아래 blocked
      //   조기 반환보다 **먼저** 봐야 한다. 부딪히는 쪽은 언제나 방어자다.
      const slam = target === 1 - step.actor ? (step.slam ?? 0) : 0;
      if (slam) {
        // 정규 좌표 → 화면 좌표(내가 side 1이면 판이 좌우로 뒤집혀 있다)
        const dir = flip ? -slam : slam;
        setWallSlam((prev) => ({
          seq: (prev?.seq ?? 0) + 1,
          side: dir > 0 ? "right" : "left",
        }));
        playSfx("slam");
      }
      if (opts.blocked) {
        playSfx("block");
        punch(slam ? 2 : 1);
        return 0;
      }
      punch(slam ? 3 : shakeLevel(dmg, ko));
      if (ko) {
        playSfx("ko");
        setKoFlash((n) => n + 1);
      } else if (opts.sound !== false) {
        playSfx("hit", dmg / 18);
      }
      // 잠깐 얼어붙는 순간이 "묵직함"을 만든다 — 피해가 클수록 길다.
      // 격돌은 그 위에 한 겹 더 얹는다 — 벽에 처박히는 순간이 제일 무겁다.
      const ms = hitstopFor(dmg, ko) + (slam ? 60 : 0);
      setHitstop(true);
      await wait(ms);
      setHitstop(false);
      return ms;
    };

    // 이전 스텝까지 화면에 남아 있는 상태. 공격의 **준비 동작** 구간에 그대로
    // 쓴다 — 몸이 파고드는 동안엔 아직 피해도 HP 감소도 보이면 안 된다.
    let shown: View = turnStart;
    /** 직전 스텝이 몇 번째 슬롯이었나 — 여기가 바뀌는 순간이 카드 공개 시점이다. */
    let seenSlot: number | null = null;

    for (const [si, step] of steps.entries()) {
      if (cancelled.current) return;

      // ── 슬롯이 넘어갔다: "이번엔 양쪽이 이 카드를 낸다"를 먼저 못 박는다.
      //    차근차근 모드에서만 화면을 덮고, 빠르게 모드에서는 표시만 갱신한다.
      if (step.slot !== undefined && step.slot !== seenSlot) {
        seenSlot = step.slot;
        setActiveSlot(step.slot);
        if (cfg.reveal) {
          setSlotReveal({ seq: si + 1, slot: step.slot });
          playSfx("ui");
          await wait(cfg.revealMs);
          setSlotReveal(null);
          if (cancelled.current) return;
        }
      } else if (step.slot === undefined && seenSlot !== null) {
        // 라운드 종료 정산(독안개·붕괴) — 더 이상 어느 카드의 결과도 아니다.
        seenSlot = null;
        setActiveSlot(null);
      }

      // 필살기: 타격을 보여주기 전에 컷인으로 "이게 필살기다"를 못 박는다.
      // 기력 부족으로 불발된 카드는 연출하지 않는다.
      if (
        step.card.signature &&
        step.card.kind === "attack" &&
        step.result !== "nofuel"
      ) {
        setCutIn({ seq: si + 1, actor: step.actor as 0 | 1, card: step.card });
        playSfx("cutin");
        await wait(CUTIN_MS);
        setCutIn(null);
        if (cancelled.current) return;
      }

      const full = stepToView(step, si + 1);
      const actor = step.actor as 0 | 1;
      const foe = (1 - actor) as 0 | 1;

      // 실행 중인 카드 안내 — 슬롯 번호는 그 쪽 계획에서의 자리다.
      const plan = actor === 0 ? planA : planB;
      const slotNo = plan.findIndex((c) => c.id === step.card.id) + 1;
      setCallout(
        slotNo > 0
          ? {
              no: slotNo,
              name: step.card.name,
              note:
                step.card.kind === "attack"
                  ? `피해 ${step.card.damage ?? 0}`
                  : KIND_LABEL[step.card.kind],
            }
          : null,
      );

      // 유물 발동 · 적 능력 공개 — 연출뿐이라 재생 사슬을 멈추지 않는다.
      const procs = relicProcs(step, localSide, relics);
      if (procs.length) {
        setFired({ seq: si + 1, ids: procs });
        const r = getRelic(procs[0]);
        if (r && isBigProc(step))
          setRibbon({
            seq: si + 1,
            kind: "relic",
            atlasId: r.id,
            title: r.name,
            note: r.desc,
          });
      }
      if (foeInfo) {
        const fresh = foeReveals(
          step,
          (1 - localSide) as 0 | 1,
          foeInfo.abilities,
        ).filter((a) => !revealedRef.current.has(a.key));
        if (fresh.length) {
          revealedRef.current = new Set([
            ...revealedRef.current,
            ...fresh.map((a) => a.key),
          ]);
          setRevealed(revealedRef.current);
          markFoeAbilitySeen(fresh.map((a) => a.key));
          if (boss)
            setRibbon({
              seq: si + 1,
              kind: "foe",
              atlasId: fresh[0].atlasId,
              title: fresh[0].name,
              note: `${fresh[0].desc} 지금 막 처음 발동했다`,
            });
        }
      }

      if (step.card.kind === "attack" && step.result !== "nofuel") {
        setResolveHit({
          cells: attackCells(
            step.snapshot.pos[actor],
            step.card,
            // ⚠ **이 스텝의 스냅샷**으로 방향을 잰다 — `battle.facing()`은 이미 턴이
            //   끝난 뒤의 위치를 보므로, 재생 중에 사거리가 엉뚱한 쪽에 그려진다.
            facingBetween(
              step.snapshot.pos[actor],
              step.snapshot.pos[foe],
              actor,
            ),
            step.snapshot.pos[foe],
            // 지형도 **그 스텝의 스냅샷**으로 본다 — 바위가 부서지는 건 뒤따르는
            // 별도 스텝이라, 이 시점엔 아직 서 있고 그게 실제로 막은 상태다.
            step.snapshot.obstacles,
            !!step.card.pierce || !!battle.passive[actor].alwaysPierce,
          ),
          actor,
        });
        // ① 준비 동작 — 카드 이름만 뜨고 판은 아직 그대로다
        setView({
          ...shown,
          acting: full.acting,
          actFx: full.actFx, // 준비→타격 내내 같은 모션이어야 한다
          say: full.say,
          fx: [null, null],
          damage: [0, 0],
          heal: [0, 0],
          stunned: [false, false],
          slam: [0, 0], // 격돌은 ②타격에서만 — 준비 동작에 미리 뜨면 안 된다
          seq: si + 1,
        });
        playSfx(RANGED_FX.has(step.card.fx ?? "") ? "cast" : "swing");
        const lead = impactDelay(sheets[actor], step.card.fx);
        await wait(lead);
        if (cancelled.current) return;

        // ② 타격 — 여기서 비로소 피해·HP·불꽃이 한꺼번에 터진다
        setView(full);
        let held = 0;
        // ⚠ 불꽃·흔들림의 세기는 **실제로 깎인 몫**(`damageOn`)으로 잰다 —
        //   `step.damage`에는 처박기 피해가 안 들어 있어 벽에 처박은 큰 한 방이
        //   작은 타격처럼 보였다.
        if (step.result === "whiff") playSfx("whiff");
        else
          held = await impact(step, foe, damageOn(step, foe), koAt(si, foe), {
            blocked: step.result === "blocked",
          });
        if (cancelled.current) return;
        await wait(Math.max(150, paced(STEP_MS.attack) - lead - held));
      } else {
        setResolveHit(null);
        setView(full);
        stepSfx(step);
        // 공격이 아닌데 피해가 났다 — 유물 트리거(상대에게) 또는 붕괴·반동(자신에게).
        // 붕괴는 stepSfx가 이미 굉음을 내므로 타격음은 겹쳐 울리지 않는다.
        let held = 0;
        if (damageOn(step, foe) > 0)
          held = await impact(step, foe, damageOn(step, foe), koAt(si, foe));
        else if (damageOn(step, actor) > 0)
          held = await impact(
            step,
            actor,
            damageOn(step, actor),
            koAt(si, actor),
            {
              sound: step.phase !== "collapse",
            },
          );
        if (cancelled.current) return;
        await wait(Math.max(160, paced(STEP_MS[step.phase]) - held));
      }
      if (cancelled.current) return;
      shown = full;

      // ── 이 스텝을 기록에 남긴다. 떠올랐다 사라지는 숫자와 달리 라운드가 끝날
      //    때까지 남으므로, 놓쳤어도 "무엇이 얼마였는지" 되짚을 수 있다.
      const hits = ([0, 1] as const).flatMap((side) =>
        bitsOn(step, side).map((b) => ({ ...b, onMe: side === localSide })),
      );
      if (hits.length || step.heal > 0 || step.result !== "move")
        setLog((rows) => [
          ...rows,
          {
            id: si + 1,
            slot: step.slot,
            who: battle.chars[actor].name,
            mine: actor === localSide,
            card: step.card.name,
            result: step.result,
            hits,
            heal: step.heal,
          },
        ]);

      // 피해가 났으면 숫자를 읽을 틈을 준다(차근차근 모드에서만 — `hold`가 0이면
      // 아무 일도 일어나지 않는다).
      if (cfg.hold && (damageOn(step, 0) > 0 || damageOn(step, 1) > 0)) {
        await wait(cfg.hold);
        if (cancelled.current) return;
      }

      // 격노 컷인 — 보스 체력이 문턱을 지나는 순간 스텝 사이를 끊고 들어간다.
      // ⚠ 판정은 `battle.state`가 아니라 **이 스텝의 스냅샷**(`full.hp`)으로 한다:
      //   엔진은 턴을 통째로 먼저 계산하고 스텝은 그 재생이라, `battle.state`를
      //   보면 첫 스텝부터 이미 턴 끝 체력이라 컷인이 한 턴 일찍 튄다.
      if (boss && !enragedRef.current) {
        const b = (1 - localSide) as 0 | 1;
        if (full.hp[b] > 0 && full.hp[b] / battle.maxHp[b] <= boss.enrageAt) {
          enragedRef.current = true;
          setEnraged(true);
          setBossCut({ seq: 2, kind: "enrage" });
          playSfx("bossHorn");
          await wait(BOSSCUT_MS);
          setBossCut(null);
          if (cancelled.current) return;
        }
      }
    }
    setCutIn(null);
    setCallout(null);

    if (battle.state.over) {
      const localWon = battle.state.winner === localSide;
      setBanner(
        battle.state.winner === null ? "DRAW" : localWon ? "K.O." : "DEFEAT",
      );
      if (battle.state.winner !== null) playSfx(localWon ? "win" : "lose");
    }
    await settle(1300);
  };

  /** 연출 레이어를 접고 다음 선택(또는 종료)으로 넘긴다. `playTurn` 끝과 실패 복구가 같이 쓴다. */
  const settle = async (overWait: number) => {
    setView(baseView(battle));
    setResolveHit(null);
    setSparks(null);
    setWallSlam(null);

    if (battle.state.over) {
      setPhase("over");
      await wait(overWait);
      if (cancelled.current) return;
      onEnd(battle.state.winner === localSide, battle.state.hp[localSide]); // 남은 체력 인계(로그라이크 HP 캐리)
      return;
    }

    setSlots([null, null, null]);
    setRoundPlans(null);
    setTick((t) => t + 1); // refresh cooldown display
    submittingRef.current = false;
    setPhase("select");
  };

  /**
   * 턴 제출 — 이중 제출을 막고, **재생이 도중에 죽어도 판을 되살린다**.
   *
   * ⚠ 재생 사슬은 `await` 하나만 안 풀려도 `phase: 'resolving'` · `submittingRef: true` ·
   *   `hitstop: true`가 그대로 굳어 **판이 통째로 벽돌이 된다**(위 `wait` 주석의 신고).
   *   `wait`이 화면 복귀에 반응하도록 고쳤지만, 그건 타이머 경로 하나를 막은 것뿐이다.
   *   예외가 어디서 터지든 최소한 **카드를 다시 낼 수 있는 상태**로는 돌아와야 한다.
   * ⚠ 예외를 삼키지 않는다 — 여기 걸리는 건 전부 버그이므로 콘솔에 남긴다.
   */
  const submitPlan = async (localPlan: CardDef[]) => {
    // 수동 제출과 타이머 자동 제출이 겹쳐 두 번 보내지 않도록 ref로 잠근다
    if (phase !== "select" || submittingRef.current) return;
    submittingRef.current = true;
    try {
      await playTurn(localPlan);
    } catch (err) {
      console.error("[battle] 턴 재생이 중단됐다 — 화면을 복구한다", err);
      if (cancelled.current) return;
      // 판 상태는 엔진이 이미 확정해 뒀다(resolveRound은 동기다). 연출 레이어만 접는다.
      setHitstop(false);
      setCutIn(null);
      setCallout(null);
      setBossCut(null);
      setWaitingRemote(false);
      await settle(0);
    }
  };

  const confirm = () => {
    if (!filled || !affordable) return;
    playSfx("confirm");
    void submitPlan(slots as CardDef[]);
  };

  // 시간 초과 자동 제출 — 항상 유효한 플랜을 만들어 낸다.
  // ① 지금 플랜이 완성·지불 가능하면 그대로 ② 아니면 빈 슬롯을 원기 회복으로
  // 메우고 ③ 그래도 기력이 모자라면 원기 회복 3장(언제나 유효).
  const autoSubmitRef = useRef<() => void>(() => {});
  autoSubmitRef.current = () => {
    if (phase !== "select" || submittingRef.current) return;
    if (filled && affordable) {
      void submitPlan(slots as CardDef[]);
      return;
    }
    const energyCard = hand.find((c) => c.kind === "energy");
    if (!energyCard) return;
    const padded = slots.map((s) => s ?? energyCard) as CardDef[];
    const ok = planAffordable(
      padded,
      battle.state.energy[localSide],
      local.maxEnergy,
      passiveEnergy,
      freeCastOn,
    );
    void submitPlan(ok ? padded : [energyCard, energyCard, energyCard]);
  };

  // 턴 카운트다운(온라인 전용). 0이 되면 자동 제출해 상대 대기가 끝난다.
  useEffect(() => {
    if (!turnSeconds || phase !== "select") {
      setRemain(null);
      return;
    }
    const end = Date.now() + turnSeconds * 1000;
    setRemain(turnSeconds);
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setRemain(left);
      if (left <= 0) {
        clearInterval(id);
        autoSubmitRef.current();
      }
    }, 200);
    return () => clearInterval(id);
  }, [phase, turnSeconds]);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  // 등장 컷인 — 첫 카드를 고르기 전에 "누구와 싸우는지"를 못 박는다.
  // ⚠ **ref로 한 번만** 돈다. `boss`는 `runFightProps(run)`가 App 렌더마다 새로
  //   만드는 객체라 의존성 배열만 믿으면 리렌더마다 컷인이 다시 뜬다.
  const bossIntroRef = useRef(false);
  useEffect(() => {
    if (!boss || bossIntroRef.current) return;
    bossIntroRef.current = true;
    setBossCut({ seq: 1, kind: "entrance" });
    playSfx("bossHorn");
    // ⚠ 생 setTimeout이 아니라 `wait`을 쓴다 — 컷인이 떠 있는 동안 앱을 내려놓으면
    //   타이머가 안 깨어나 **전면 오버레이가 그대로 남고 판이 안 보인다**(재생 사슬이
    //   굳는 것과 같은 원인). `wait`은 화면 복귀에도 풀린다.
    let alive = true;
    void wait(BOSSCUT_MS).then(() => {
      if (alive) setBossCut(null);
    });
    return () => {
      alive = false;
    };
  }, [boss]);

  // 판 바닥 — 초원은 풀, 초원 엘리트 무대는 흙길, 던전은 판석.
  const tile =
    scene === "grassland" || scene === "sanctum"
      ? foeInfo?.tag === "엘리트" || scene === "sanctum"
        ? "dirt"
        : "grass"
      : "dungeon";

  // 첫 만남 팁 — 카드를 고르는 동안에만, 한 번에 하나(`ui/FirstTip.tsx`).
  const tip = useFirstTip(
    tips && phase === "select"
      ? [
          view.status[localSide].some((e) => e.kind === "poison" || e.kind === "burn" || e.kind === "frozen") && "status",
          !!boss && "boss",
          battle.state.obstacles.length > 0 && "elite",
          collapseRound(battle.state) >= COLLAPSE_START_ROUND && "collapse",
          hand.some((c) => c.kind !== "move" && selectable(c) && !canAfford(c)) && "energy",
          "longpress",
        ]
      : [],
  );

  return (
    <div
      className={`screen battle ${hitstop ? "is-hitstop" : ""} ${boss ? "battle--boss" : ""}`}
      // 보스전은 화면 전체가 그 보스의 색을 띤다 — 무대·컷인·예고가 같은 변수를
      // 읽으므로 보스를 추가할 때 색은 `bosses.ts`의 `accent` 한 곳만 정하면 된다.
      style={boss ? { ["--boss" as string]: boss.accent } : undefined}
    >
      <SceneLayers scene={scene} />

      <BattleHud
        c0={c0}
        c1={c1}
        maxHp={battle.maxHp}
        localSide={localSide}
        view={view}
        turn={battle.state.round}
        collapseTurn={collapseRound(battle.state)}
        remain={remain}
        boss={boss}
        place={place}
        phase={phase === "select" ? "카드 선택" : "실행 중"}
        foeTag={foeInfo?.tag}
        enraged={enraged}
        onQuit={onQuit}
      />

      {relics.length > 0 && (
        <BattleRelics
          ids={battleRelics(relics)}
          battle={battle}
          side={localSide}
          view={view}
          fired={fired}
          owner={local.name}
        />
      )}
      {foeInfo && foeInfo.abilities.length > 0 && (
        <FoeRow
          abilities={foeInfo.abilities}
          revealed={revealed}
          boss={!!boss}
        />
      )}

      <div className="board">
        {/* 보스 기운 — 무대 위에 얹히는 보스 색 맥동. 판 위 레이어라 반드시
            `pointer-events: none`이어야 한다(칸을 눌러 이동하므로). */}
        {boss && (
          <div className={`bossaura ${enraged ? "bossaura--enraged" : ""}`} />
        )}
        <div className={`gridboard gridboard--${tile}`} ref={gridRef}>
          {Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => {
            const row = Math.floor(i / GRID_COLS);
            // visual column -> canonical column (mirrored when we hold side 1)
            const ccol = dcol(i % GRID_COLS);
            const hovered = targetCells.some(
              (c) => c.col === ccol && c.row === row,
            );
            const live = resolveHit?.cells.some(
              (c) => c.col === ccol && c.row === row,
            );
            // 전장 붕괴: 무너진 열은 갈라진 붉은 바닥, 다음 턴에 무너질 열은 예고.
            // ⚠ **`cell--fog`는 이동 강조와 겹칠 수 있다**(무너진 칸에도 들어갈 수
            //   있으므로). 그래서 배타적인 `cls` 삼항에 넣지 않고 **따로 붙인다** —
            //   예전엔 이동 강조가 붕괴 표시를 통째로 덮어써서, 갈 수 있는 칸은 전부
            //   멀쩡해 보였고 "이동하면 안개에 안 들어간다"로 읽혔다.
            const cell = { col: ccol, row };
            // 붕괴 시계 — 엘리트·보스는 늦게 시작한다(`collapseRound`).
            const turn = collapseRound(battle.state);
            const hazard = isCollapsedCell(cell, turn)
              ? " cell--fog"
              : isCollapsedCell(cell, turn + 1)
                ? " cell--fog-next"
                : "";
            const cls =
              (hovered || (live && resolveHit?.actor === localSide)
                ? " cell--target"
                : live
                  ? " cell--target cell--target-foe"
                  : "") + hazard;
            // 이동 가능한 칸이면 눌러서 그 자리로 간다(노란 강조 + 커서)
            const key = `${ccol},${row}`;
            const mv = moveTargets.get(key);
            if (mv) {
              const warn = hazard
                ? ` — ${collapseDamageAt(turn + 1)} 피해`
                : "";
              // 대시·특수 이동은 **주황**이고 쿨을 라벨에 같이 적는다(디자인
              // `MoveBundleSpec`) — 칸 하나로 두세 칸을 가는 것과 한 칸짜리가
              // 같은 색이면 "왜 여기까지 가지"가 된다.
              const face = faceCard(mv);
              const dash = (mv.steps ?? 1) > 1 || (mv.cooldown ?? 0) > 0;
              return (
                <button
                  key={i}
                  className={`cell cell--move${dash ? " cell--move-dash" : ""}${cls}`}
                  onClick={() => addCard(mv)}
                  title={`이동: ${mv.name}${warn}`}
                  aria-label={`이동: ${mv.name}${warn}`}
                >
                  {hazard && (
                    <span className="cell__warn">
                      붕괴 → {collapseDamageAt(turn + 1)} 피해
                    </span>
                  )}
                  {/* 화살표만 — 카드 이름("오른쪽" · "아래")은 칸 위에서 군더더기였다(2026-11-10 사용자 지정).
                      이름은 title·aria-label에 남는다. 대시는 칸 색(주황)으로 가른다. */}
                  <span className="cell__movelab">{moveIcon(face.dir, face.steps ?? 1)}</span>
                </button>
              );
            }
            // 안 밝혀진 칸 — 이동 카드가 닿기는 하는데 못 쓰는 칸이면 이유를 띄운다.
            const why = moveReasons.get(key);
            if (why)
              return (
                <button
                  key={i}
                  className={`cell cell--movewhy${cls}`}
                  onClick={() => sayWhy(key, why)}
                  title={why}
                  aria-label={why}
                >
                  {moveToast?.key === key && (
                    <span className="cell__why">{moveToast.text}</span>
                  )}
                </button>
              );
            return <span className={`cell${cls}`} key={i} />;
          })}
          {/* 지형 — 판 위에 얹는 바위. ⚠ `pointer-events: none`이 필수다(칸을 눌러
              이동하므로 바위가 클릭을 먹으면 그 줄이 통째로 안 눌린다). 금이 간
              정도는 남은 체력으로 3단계 — 몇 대 더 때리면 깨지는지가 보여야 한다. */}
          {view.obstacles.map((r) => {
            const frac = r.hp / Math.max(1, r.maxHp);
            const wear = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
            return (
              <div
                key={`rock-${r.cell.col},${r.cell.row}`}
                className="rock"
                style={{
                  left: `${cellX(dcol(r.cell.col))}px`,
                  top: `${cellY(r.cell.row)}px`,
                  ["--wear" as string]: wear,
                }}
                aria-hidden
              />
            );
          })}
          {/* 함정(런 전용) — 바닥형이라 파이터 **아래**(z 1). 1칸 타일(184×96)은 바위와 같은 맞춤이다.
              모서리 칩 = 밟으면 무엇이 되는가(화상 · 속박 · 미끄러짐). 가시덫은 경고 라운드에 붉게 선다. */}
          {view.hazards.map((h) => {
            const st = h.kind === "spikes" ? spikeStateAt(h, view.round) : null;
            return (
              <div
                key={`hz-${h.cell.col},${h.cell.row}`}
                className={`hztile hztile--${h.kind}${st ? ` is-${st}` : ""}`}
                style={{ left: `${cellX(dcol(h.cell.col))}px`, top: `${cellY(h.cell.row)}px` }}
                title={HAZARD_TIP[h.kind]}
                aria-hidden
              >
                {st !== "hidden" && <i className={`hztile__chip hztile__chip--${h.kind}`} />}
              </div>
            );
          })}
          {/* 독안개 — 파이터 **위**에 반투명으로 덮는다(서 있으면 안개 속에 잠긴다).
              판 위 레이어라 `pointer-events: none`은 CSS가 건다. */}
          {view.fog
            .filter((f) => f.rounds > 0)
            .map((f) => (
              <div
                key={`fog-${f.cell.col},${f.cell.row}`}
                className="fogtile"
                style={{
                  left: `${cellX(dcol(f.cell.col))}px`,
                  top: `${cellY(f.cell.row)}px`,
                }}
                aria-hidden
              />
            ))}
          {/* 발자국 — 담아 둔 이동이 지나가는 칸에 순서 번호를 찍는다(디자인
              `MoveBundle`). 잔상만 있으면 "몇 번째 이동으로 거기까지 가는지"가
              안 보인다. ⚠ 클릭을 먹으면 안 된다(칸을 눌러 이동한다). */}
          {planPreview.steps.map((st) => (
            <span
              key={`trail-${st.no}`}
              className="trail"
              style={{
                left: `${cellX(dcol(st.cell.col)) + 54}px`,
                top: `${cellY(st.cell.row) - 15}px`,
              }}
              aria-hidden
            >
              {st.no}
            </span>
          ))}
          {preview.ghost && (
            // 잔상도 본체와 **같은 몸**이어야 한다 — 스프라이트 캐릭터인데 잔상만
            // SVG로 그리면 딴 사람이 서 있고 바닥선까지 어긋난다.
            <div
              className={`fighter fighter--${ghostFace} fighter--seat-left fighter--ghost${
                ghostSheet ? " fighter--sprite" : ""
              }`}
              style={{
                left: `${cellX(dcol(preview.ghost.col))}px`,
                top: `${cellY(preview.ghost.row)}px`,
                ["--accent" as string]: local.accent,
                // 잔상도 **도착 지점에서** 상대를 바라본다 — 상대를 지나쳐 가는
                // 이동이면 본체와 반대쪽을 보게 되고, 그게 실제 결과와 맞다.
                ...(ghostPlace
                  ? {
                      ["--anchorpx" as string]: ghostPlace.anchorPx,
                      ["--footpx" as string]: ghostPlace.footPx,
                      ["--artflip" as string]: ghostPlace.artFlip,
                    }
                  : null),
              }}
            >
              {ghostSheet ? (
                <div className="fighter__art">
                  <SpriteClip sheet={ghostSheet} clip="idle" seq={0} />
                </div>
              ) : (
                <div
                  className="fighter__art"
                  dangerouslySetInnerHTML={{ __html: svgs[localSide] }}
                />
              )}
            </div>
          )}
          <FighterSprite
            svg={svgs[0]}
            sheet={sheets[0]}
            side={localSide === 0 ? "left" : "right"}
            accent={c0.accent}
            v={view}
            idx={0}
            flip={flip}
            isLocal={localSide === 0}
          />
          <FighterSprite
            svg={svgs[1]}
            sheet={sheets[1]}
            side={localSide === 1 ? "left" : "right"}
            accent={c1.accent}
            v={view}
            idx={1}
            flip={flip}
            isLocal={localSide === 1}
          />
          {sparks && (
            <div
              key={`sp-${sparks.seq}`}
              className={`sparks ${sparks.big ? "sparks--big" : ""}`}
              style={{
                left: `${cellX(dcol(sparks.cell.col))}px`,
                top: `${cellY(sparks.cell.row)}px`,
                ["--spark" as string]: sparks.color,
              }}
            >
              {Array.from({ length: sparks.n }, (_, i) => (
                // 방향·거리·속도는 인덱스에서 뽑는다 — 난수 없이도 흩어져 보이고,
                // 같은 입력이면 같은 그림이라 리렌더에도 튀지 않는다.
                <span
                  key={i}
                  className="spark"
                  style={{
                    ["--a" as string]: `${(360 / sparks.n) * i + ((i * 37) % 26) - 13}deg`,
                    ["--d" as string]: `${34 + ((i * 53) % 48)}px`,
                    ["--t" as string]: `${0.34 + ((i * 29) % 20) / 100}s`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* 벽 격돌 — 넉백이 막힌 쪽 가장자리에서 터지는 균열 섬광 + 돌먼지.
            ⚠ `key`로 remount해야 연달아 격돌해도 매번 처음부터 재생된다(같은
            클래스가 유지되면 CSS 애니메이션이 다시 뛰지 않는다 — 카메라 펀치와
            같은 이유). 판 위 레이어라 `pointer-events: none`은 CSS가 건다. */}
        {wallSlam && (
          <div
            key={`slam-${wallSlam.seq}`}
            className={`board__slam board__slam--${wallSlam.side}`}
          >
            <span className="board__slamdust" />
          </div>
        )}
        {koFlash > 0 && (
          <div key={`ko-${koFlash}`} className="board__koflash" />
        )}
        {hitFlash && (
          <div
            key={hitFlash.seq}
            className={`board__hitflash board__hitflash--${hitFlash.target === localSide ? "left" : "right"}`}
          />
        )}
        {banner && <div className="board__banner">{banner}</div>}
        {callout && !banner && (
          <div className="board__callout">
            <em>CARD {callout.no}/3</em>
            <b>{callout.name}</b>
            <span>{callout.note}</span>
          </div>
        )}
        {phase === "select" &&
          telegraph &&
          (() => {
            const opp = (1 - localSide) as 0 | 1;
            const msg = telegraph(
              battle.state.round,
              battle.state.hp[opp] / battle.maxHp[opp],
            );
            return msg ? (
              <div
                className={`board__telegraph ${boss ? "board__telegraph--boss" : ""}`}
              >
                {msg}
              </div>
            ) : null;
          })()}
      </div>

      {ribbon && (
        <div
          key={`rb-${ribbon.seq}`}
          className={`procribbon procribbon--${ribbon.kind}`}
        >
          {ribbon.kind === "relic" ? (
            <RelicIcon id={ribbon.atlasId} size={52} />
          ) : (
            <FoeIcon id={ribbon.atlasId} size={78} />
          )}
          <div>
            {ribbon.kind === "foe" && <em>BOSS RELIC REVEALED</em>}
            <b>{ribbon.title}</b>
            <span>{ribbon.note}</span>
          </div>
        </div>
      )}

      {phase === "select" ? (
        <div className="cards">
          <div className="cards__slots">
            {slots.map((c, i) => (
              <button
                key={i}
                className={`slot ${c ? "slot--filled" : ""}`}
                onClick={() => {
                  // 슬롯도 꾹 누르면 읽힌다 — 담아 놓고 "이게 뭐였지" 할 때가 있다.
                  if (longPress.consumedClick()) return;
                  clearSlot(i);
                }}
                onPointerEnter={(e) => {
                  if (e.pointerType !== "mouse") return;
                  setHoveredCard(
                    c && (c.kind === "attack" || c.kind === "move") ? c : null,
                  );
                  setHoverSlot(i);
                }}
                onPointerDown={(e) => {
                  pressedCard.current = c;
                  if (c) longPress.handlers.onPointerDown(e);
                  if (e.pointerType === "mouse") return;
                  setHoveredCard(
                    c && (c.kind === "attack" || c.kind === "move") ? c : null,
                  );
                  setHoverSlot(i);
                }}
                onPointerMove={longPress.handlers.onPointerMove}
                onContextMenu={longPress.handlers.onContextMenu}
                onPointerLeave={() => {
                  longPress.handlers.onPointerLeave();
                  setHoveredCard(null);
                }}
                onPointerUp={(e) => {
                  longPress.handlers.onPointerUp();
                  if (e.pointerType !== "mouse") setHoveredCard(null);
                }}
                onPointerCancel={() => {
                  longPress.handlers.onPointerCancel();
                  setHoveredCard(null);
                }}
                style={
                  c
                    ? { ["--accent" as string]: cardAccent(c, local.accent) }
                    : undefined
                }
              >
                <span className="slot__no">{i + 1}</span>
                {c ? (
                  <CardFace
                    card={faceCard(c)}
                    accent={cardAccent(c, local.accent)}
                    compact
                  />
                ) : (
                  <span className="slot__empty">비어 있음</span>
                )}
              </button>
            ))}
          </div>

          {/* 이동 묶음 — **이동 카드는 손패에 펼치지 않고 한 장으로 접는다**
              (디자인 `MoveBundle`·`MoveBundleSpec`). 이동은 판의 칸을 눌러서 하지만
              (2026-08-05), 숨기기만 하면 ① 보상·상점에서 산 이동 카드가 전투에서
              안 보이고 ② 칸이 안 밝혀질 때 쿨·막힘·속박이 구분되지 않고 ③ 꾹 눌러
              읽을 곳이 없다. 묶음이 그 셋을 받는다. */}
          {moveDeck.length > 0 && (
            <div className="bundlewrap">
              {tray && (
                <section className="tray" aria-label="이동 카드 목록">
                  <div className="tray__head">
                    <span>이동 카드 {moveDeck.length}장</span>
                    <em>판의 칸을 눌러도 똑같이 담긴다 · 꾹 누르면 상세</em>
                  </div>
                  <div className="tray__cards">
                    {moveDeck.map((c) => {
                      const face = faceCard(c);
                      const at = slotNosFor(c.id);
                      const cd = cdLeft(c.id);
                      const from = planPreview.ghost ?? view.pos[localSide];
                      const to = applyMovePreview(from, c, rocks, battle.state.hazards);
                      const stuck = to.col === from.col && to.row === from.row;
                      const full = slots.every((x) => x !== null);
                      const st = at.length
                        ? { t: `${at.join(" ")}번 칸`, k: "in" }
                        : cd > 0
                          ? { t: `쿨 ${cd}`, k: "cd" }
                          : stuck
                            ? { t: "막힘", k: "stuck" }
                            : full
                              ? { t: "칸 없음", k: "cd" }
                              : { t: "준비", k: "ready" };
                      return (
                        <button
                          key={c.id}
                          className={`mc mc--${st.k}${(c.steps ?? 1) > 1 ? " mc--dash" : ""}`}
                          onClick={() => {
                            if (longPress.consumedClick()) return;
                            addCard(c);
                          }}
                          onPointerDown={(e) => {
                            pressedCard.current = face;
                            longPress.handlers.onPointerDown(e);
                          }}
                          onPointerMove={longPress.handlers.onPointerMove}
                          onPointerUp={longPress.handlers.onPointerUp}
                          onPointerLeave={longPress.handlers.onPointerLeave}
                          onPointerCancel={longPress.handlers.onPointerCancel}
                          onContextMenu={longPress.handlers.onContextMenu}
                          aria-disabled={st.k !== "ready"}
                        >
                          <span className="mc__top">
                            <span>{c.steps ?? 1}칸</span>
                            <em>{(c.cooldown ?? 0) > 0 ? `CD${c.cooldown}` : "—"}</em>
                          </span>
                          <span className="mc__g">
                            {moveIcon(face.dir, face.steps ?? 1)}
                          </span>
                          <span className="mc__name">{face.name}</span>
                          <span className="mc__st">{st.t}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
              <button
                className={`bundle${tray ? " bundle--open" : ""}${
                  bundle.locked ? " bundle--locked" : ""
                }${bundle.dim ? " bundle--dim" : ""}`}
                onClick={() => setTray((v) => !v)}
                aria-expanded={tray}
                aria-label="이동 카드 묶음 — 눌러서 펼치기"
              >
                <span className="bundle__b2" aria-hidden />
                <span className="bundle__b1" aria-hidden />
                <span className="bundle__f">
                  <span className="bundle__head">
                    <i className="bundle__boot" aria-hidden />
                    <span>
                      <em>MOVE</em>
                      <b>×{moveDeck.length}</b>
                    </span>
                  </span>
                  <span className="bundle__mid">
                    <span className="cmp" aria-hidden>
                      {bundle.compass.map((q, i) => (
                        <i key={i} className={`cmp--${q.k}`}>
                          {q.t}
                        </i>
                      ))}
                    </span>
                    <span className="bundle__counts">
                      <span>
                        준비 <b>{bundle.ready}</b>
                      </span>
                      <span>
                        쿨 <em>{bundle.cooling}</em>
                      </span>
                    </span>
                  </span>
                  <span className="bundle__hint">{bundle.hint}</span>
                  {bundle.locked && <span className="bundle__chain" aria-hidden />}
                </span>
              </button>
            </div>
          )}
          <div className="cards__row">
            {/* 봉인이 라운드를 넘어왔을 때만 뜬다(전설 유물 상대). 이 자리가 없으면
                "카드를 냈는데 아무 일도 안 일어난다"가 되고, 그건 버그로 읽힌다. */}
            {roundLock && (
              <span className="cards__note">
                {roundLock.kind === "frozen"
                  ? "❄ 얼어붙음"
                  : roundLock.kind === "bind"
                    ? "🕸 속박"
                    : "💫 기절"}
                <em>
                  {roundLock.kind === "bind"
                    ? "이번 라운드 이동 불가"
                    : roundLock.kind === "frozen"
                      ? "맞으면 풀린다"
                      : "이번 라운드 행동 불가"}
                </em>
              </span>
            )}
            <div className="cards__hand">
              {hand
                .filter((c) => c.kind !== "move")
                .map((c) => {
                  const onCd = cdLeft(c.id) > 0;
                  const locked = onCd || placedNoRepeat(c);
                  // 기력이 모자라 이번 플랜에 넣을 수 없는 카드도 선택 불가로 잠근다
                  const poor = !locked && !canAfford(c);
                  const unusable = locked || poor;
                  const inSlots = slotNosFor(c.id);
                  return (
                    <button
                      key={c.id}
                      className={`handcard handcard--${c.kind} ${unusable ? "is-dim is-locked" : ""}`}
                      onClick={() => {
                        // 꾹 눌러 상세를 연 손짓이면 이번 클릭은 삼킨다 — 읽으려고
                        // 눌렀을 뿐인데 카드가 슬롯에 담기면 안 된다.
                        if (longPress.consumedClick()) return;
                        addCard(c);
                      }}
                      onPointerEnter={(e) => {
                        // 마우스: 올려두면 미리보기(hover). 못 쓰는 카드는 예측 없음.
                        if (unusable || e.pointerType !== "mouse") return;
                        setHoveredCard(c);
                        setHoverSlot(null);
                      }}
                      onPointerDown={(e) => {
                        pressedCard.current = c;
                        longPress.handlers.onPointerDown(e);
                        // 터치/펜: 누르는 동안만 미리보기(떼면 배치되며 지워짐).
                        if (unusable || e.pointerType === "mouse") return;
                        setHoveredCard(c);
                        setHoverSlot(null);
                      }}
                      onPointerMove={longPress.handlers.onPointerMove}
                      onContextMenu={longPress.handlers.onContextMenu}
                      onPointerLeave={() => {
                        longPress.handlers.onPointerLeave();
                        setHoveredCard(null);
                      }}
                      onPointerUp={(e) => {
                        longPress.handlers.onPointerUp();
                        if (e.pointerType !== "mouse") setHoveredCard(null);
                      }}
                      onPointerCancel={() => {
                        longPress.handlers.onPointerCancel();
                        setHoveredCard(null);
                      }}
                      // ⚠ `disabled`를 걸지 않는다 — 못 쓰는 버튼은 포인터 이벤트를 아예
                      //   안 받아서 **꾹 눌러 읽을 수조차 없어진다**. 정작 설명이 가장
                      //   궁금한 건 "왜 못 쓰지" 싶은 그 카드다. 선택은 `addCard`가 막는다.
                      aria-disabled={unusable}
                      title="꾹 누르면 자세히"
                      style={{
                        ["--accent" as string]: cardAccent(c, local.accent),
                      }}
                    >
                      <CardFace
                        card={faceCard(c)}
                        accent={cardAccent(c, local.accent)}
                        compact
                      />
                      {onCd && (
                        <span className="handcard__cd">{cdLeft(c.id)}</span>
                      )}
                      {inSlots.length > 0 && (
                        <span className="handcard__slot-badge">
                          {inSlots.join(" ")}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
          <div className="cards__actions">
            <button
              className="btn btn--ghost cards__reset"
              onClick={reset}
              disabled={slots.every((s) => !s)}
            >
              초기화
            </button>
            <button
              className={`btn cards__confirm ${affordable ? "" : "is-disabled"}`}
              onClick={confirm}
              disabled={!affordable}
            >
              {filled && !affordable ? "기력 부족" : "확정 ▶"}
            </button>
          </div>
        </div>
      ) : (
        <div className="cards cards--resolving">
          <div className="cards__status">
            {waitingRemote
              ? "상대의 카드를 기다리는 중…"
              : [
                  view.say[0] && `${c0.name}: ${view.say[0]}`,
                  view.say[1] && `${c1.name}: ${view.say[1]}`,
                ]
                  .filter(Boolean)
                  .join("     ") || " "}
          </div>
          {/* 차근차근 모드: 양쪽이 낸 3장을 그대로 펼쳐 두고, 지금 몇 번째가
              나가는지 표시한다. 곁에 전투 기록이 쌓여 "무엇이 몇 대미지였는지"가
              라운드가 끝날 때까지 남는다. */}
          {PACE_CFG[pace].board && roundPlans && !waitingRemote && (
            <div className="rplay">
              <div className="rplay__plans">
                {([localSide, 1 - localSide] as const).map((sideIdx) => {
                  const side = sideIdx as 0 | 1;
                  const mine = side === localSide;
                  return (
                    <div
                      key={side}
                      className={`rplay__row ${mine ? "is-me" : ""}`}
                    >
                      <span className="rplay__who">
                        {mine ? "나" : battle.chars[side].name}
                      </span>
                      {[0, 1, 2].map((i) => {
                        const c = roundPlans[side][i];
                        return (
                          <span
                            key={i}
                            className={`rplay__card ${
                              activeSlot === i
                                ? "rplay__card--now"
                                : activeSlot !== null && i < activeSlot
                                  ? "rplay__card--done"
                                  : ""
                            }`}
                            style={
                              c
                                ? {
                                    ["--accent" as string]: cardAccent(
                                      c,
                                      battle.chars[side].accent,
                                    ),
                                  }
                                : undefined
                            }
                          >
                            <b className="rplay__no">{i + 1}</b>
                            {c ? (
                              <CardFace
                                card={mine ? faceCard(c) : c}
                                accent={cardAccent(
                                  c,
                                  battle.chars[side].accent,
                                )}
                                compact
                              />
                            ) : (
                              <span className="rplay__none">—</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <BattleLog rows={log} />
            </div>
          )}
        </div>
      )}

      {tip}
      {/* 꾹 눌러 편 카드 상세 — 판 위 어디든 덮는다(읽는 동안 전투는 멈춰 있다). */}
      {zoomCard && (
        <CardDetail
          card={faceCard(zoomCard)}
          accent={local.accent}
          onClose={() => setZoomCard(null)}
          board={
            // "지금 쓰면" — 이미 담은 이동까지 반영한 자리에서 이 카드가 덮는 칸(화면 좌표).
            zoomCard.kind === "attack"
              ? (() => {
                  let from = { ...view.pos[localSide] };
                  for (const c of slots) if (c?.kind === "move") from = applyMovePreview(from, c, rocks, battle.state.hazards);
                  const foe = view.pos[1 - localSide];
                  const hits = attackCells(from, zoomCard, facingBetween(from, foe, localSide), foe, rocks, piercesRock(zoomCard));
                  const m = (c: Cell) => ({ col: dcol(c.col), row: c.row });
                  return { me: m(from), foe: m(foe), hits: hits.map(m), foeName: battle.chars[1 - localSide].name };
                })()
              : undefined
          }
        />
      )}

      {/* 카드 공개 — 슬롯이 바뀔 때마다 "이번엔 이 두 장"을 크게 보여준다.
          ⚠ **입력을 삼키지 않는다**(pointer-events: none) — 이 구간엔 누를 게
            없고, 삼키면 그 시간만큼 종료 버튼도 안 눌린다. */}
      {slotReveal && roundPlans && (
        <div key={`reveal-${slotReveal.seq}`} className="reveal">
          <div className="reveal__no">{slotReveal.slot + 1}번째 카드</div>
          <div className="reveal__pair">
            {([localSide, 1 - localSide] as const).map((sideIdx) => {
              const side = sideIdx as 0 | 1;
              const mine = side === localSide;
              const c = roundPlans[side][slotReveal.slot];
              return (
                <div
                  key={side}
                  className={`reveal__one ${mine ? "reveal__one--me" : ""}`}
                >
                  <div className="reveal__who">
                    {mine ? "나" : battle.chars[side].name}
                  </div>
                  {c ? (
                    <CardFace
                      card={mine ? faceCard(c) : c}
                      accent={cardAccent(c, battle.chars[side].accent)}
                    />
                  ) : (
                    // 봉인돼 카드를 못 내는 라운드 — 빈칸으로 두면 "왜 안 나오지"가 된다
                    <div className="reveal__none">행동 불가</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {cutIn && (
        <div
          key={`cutin-${cutIn.seq}`}
          className={`cutin ${cutIn.actor === localSide ? "cutin--me" : "cutin--foe"}`}
          style={{
            ["--accent" as string]: battle.chars[cutIn.actor].accent,
            ["--accent2" as string]: battle.chars[cutIn.actor].accent2,
          }}
        >
          <div className="cutin__streaks">
            {Array.from({ length: 9 }, (_, i) => (
              <span
                key={i}
                className="cutin__streak"
                style={{ ["--i" as string]: i }}
              />
            ))}
          </div>
          {/* 시트가 있으면 픽셀 초상, 없으면 절차 SVG로 폴백(`PortraitSvg`가 판단). */}
          <PortraitSvg
            char={battle.chars[cutIn.actor]}
            className="cutin__art"
          />
          <div className="cutin__label">
            <div className="cutin__who">
              {battle.chars[cutIn.actor].name} · 필살기
            </div>
            <div className="cutin__name">{cutIn.card.name}</div>
          </div>
          <div className="cutin__flash" />
        </div>
      )}

      {/* 보스 컷인 — 등장/격노. 필살기 컷인과 달리 **입력을 삼킨다**(pointer-events),
          연출이 도는 동안 카드가 눌리면 안 되기 때문이다. */}
      {boss && bossCut && (
        <div
          key={`bosscut-${bossCut.seq}`}
          className={`bosscut bosscut--${bossCut.kind}`}
          style={{ ["--boss" as string]: boss.accent }}
        >
          <div className="bosscut__rays">
            {Array.from({ length: 7 }, (_, i) => (
              <span
                key={i}
                className="bosscut__ray"
                style={{ ["--i" as string]: i }}
              />
            ))}
          </div>
          <PortraitSvg
            char={battle.chars[(1 - localSide) as 0 | 1]}
            className="bosscut__art"
          />
          <div className="bosscut__label">
            <div className="bosscut__kicker">
              {bossCut.kind === "entrance" ? boss.title : "페이즈 2"}
            </div>
            <div className="bosscut__name">{boss.name}</div>
            <div className="bosscut__line">
              {bossCut.kind === "entrance" ? boss.entrance : boss.enrage}
            </div>
          </div>
          <div className="bosscut__flash" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * 이번 라운드 전투 기록. **마지막 다섯 줄만** 남긴다 — 한 라운드에 스텝이 열 개를
 * 넘길 수 있는데(중독 틱·바위·붕괴가 각자 한 줄이다) 전부 쌓으면 자리가 넘치고,
 * 정작 방금 일어난 일이 위로 밀려 올라간다.
 */
function BattleLog({ rows }: { rows: LogRow[] }) {
  const tail = rows.slice(-5);
  return (
    <div className="rlog">
      <div className="rlog__head">이번 라운드에 일어난 일</div>
      {tail.length === 0 && <div className="rlog__empty">…</div>}
      {tail.map((r) => (
        <div key={r.id} className={`rlog__row ${r.mine ? "is-me" : "is-foe"}`}>
          {r.slot !== undefined && <b className="rlog__slot">{r.slot + 1}</b>}
          <span className="rlog__who">{r.mine ? "나" : r.who}</span>
          <span className="rlog__card">{r.card}</span>
          {RESULT_TEXT[r.result] && (
            <span className="rlog__res">{RESULT_TEXT[r.result]}</span>
          )}
          {r.heal > 0 && <span className="rlog__heal">+{r.heal}</span>}
          {r.hits.map((h, i) => (
            <span key={i} className={`rlog__hit ${h.onMe ? "is-onme" : ""}`}>
              {DMG_SRC[h.src].icon} {DMG_SRC[h.src].label} <b>-{h.n}</b>
              <em>{h.onMe ? "나" : "상대"}</em>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** 지금 이 파이터가 재생해야 할 스프라이트 클립. 우선순위는 "가장 극적인 것"順. */
function clipOf(v: View, idx: number, moving: "run" | "back" | null): ClipName {
  if (v.hp[idx] <= 0) return "death";
  // ⚠ **때리는 중이면 때리는 그림이 이긴다.** 공격자도 피해를 받을 수 있어서
  //   (반동·가시 반사) 예전 순서로는 그런 카드가 자기 공격 모션을 통째로 못 냈다.
  //   맞는 쪽은 `acting`이 false라 그대로 `hurt`로 떨어진다.
  if (v.acting[idx]) return attackClipFor(v.actFx[idx] ?? "punch");
  if (v.damage[idx] > 0) return "hurt";
  if (v.shield[idx] > 0) return "block";
  return moving ?? "idle";
}

function FighterSprite({
  svg,
  sheet,
  side,
  accent,
  v,
  idx,
  flip,
  isLocal,
}: {
  svg: string;
  /** 있으면 픽셀 스프라이트로, 없으면 `svg`(절차 아트)로 그린다. */
  sheet?: SheetDef;
  side: "left" | "right";
  accent: string;
  v: View;
  idx: number;
  flip: boolean;
  isLocal?: boolean;
}) {
  // 두 파이터가 같은 셀에 겹치면 화면상 좌우로 살짝 비켜 둘 다 보이게 한다
  const stacked =
    v.pos[0].col === v.pos[1].col && v.pos[0].row === v.pos[1].row;
  const fx = v.fx[idx];
  // 셀이 바뀌는 동안엔 달리는 클립을 재생한다(위치 전환은 CSS transition이 맡는다)
  const prevCell = useRef(v.pos[idx]);
  const [moving, setMoving] = useState<"run" | "back" | null>(null);
  useEffect(() => {
    const p = prevCell.current;
    const now = v.pos[idx];
    prevCell.current = now;
    if (p.col === now.col && p.row === now.row) return;
    // 상대에게서 멀어지는 쪽으로 가면 뒷걸음이다(열이 그대로면 앞으로 걷는 동작).
    const away =
      Math.abs(now.col - v.pos[1 - idx].col) >
      Math.abs(p.col - v.pos[1 - idx].col);
    setMoving(away ? "back" : "run");
    const id = setTimeout(() => setMoving(null), 500); // .fighter의 이동 transition과 같은 길이
    return () => clearTimeout(id);
  }, [v.pos, idx]);

  // 바라보는 방향은 자리가 아니라 **상대와의 열 관계**로 정한다(대시로 지나치면
  // 뒤바뀐다). 화면 좌표로 비교해야 멀티에서 좌우 반전(`flip`)까지 맞는다.
  const dispCol = (c: Cell) => (flip ? GRID_COLS - 1 - c.col : c.col);
  const face = faceToward(dispCol(v.pos[idx]), dispCol(v.pos[1 - idx]), side);

  // ⚠ 진영(`side`)과 방향(`face`)은 다른 값이다.
  //   · `fighter--${face}`  — `--flip`(좌우 반전)과 타격 이펙트가 나가는 쪽
  //   · `fighter--seat-*`   — 숨쉬기 위상. 둘이 같은 박자로 숨쉬지 않게 하는 값이라
  //                           방향이 아니라 자리를 따라야 한다(마주 보면 방향이 같아진다)
  //   · `fighter--stacked-*` — 겹쳤을 때 좌우로 비켜 세우는 오프셋. 서로 반대여야
  //                           둘 다 보이므로 역시 자리 기준이다
  const place = sheet ? placeSprite(sheet, face) : null;
  // 벽 격돌 방향 — 엔진은 정규 좌표로 주므로 화면 좌표로 되돌린다(멀티 미러링).
  const slamDir = (flip ? -v.slam[idx] : v.slam[idx]) || 0;
  /**
   * 몸에 두르는 기운 — **상태이상이 걸린 몸은 몸빛이 달라야 한다**(2026-08-12 신고:
   * "상태이상이 정말로 안 보임"). 발밑 칩은 스프라이트·불꽃에 계속 가려지지만
   * 몸빛은 가려질 수가 없다. 여러 개가 걸리면 `AURA_PRIORITY`가 하나를 고른다.
   */
  const aura = AURA_PRIORITY.find((k) =>
    v.status[idx].some((e) => e.kind === k),
  );
  const cls = [
    "fighter",
    `fighter--${face}`,
    `fighter--seat-${side}`,
    stacked ? `fighter--stacked-${side}` : "",
    isLocal ? "fighter--me" : "",
    sheet ? "fighter--sprite" : "",
    // 공격 모션은 카드의 fx 종류별로 다르다(베기·사격·돌진·내려찍기…)
    v.acting[idx] ? `is-attacking is-atk-${v.actFx[idx] ?? "punch"}` : "",
    v.damage[idx] > 0 ? "is-hit" : "",
    v.shield[idx] > 0 ? "is-guard" : "",
    v.stunned[idx] ? "is-stunned" : "",
    // 벽 격돌 — 피격 흔들림(`is-hit`)을 **덮어쓴다**(battlefx.css가 뒤에 온다).
    // 사방으로 떠는 것과 한 방향으로 처박히는 건 다른 그림이라 겹치면 안 된다.
    slamDir ? "is-slam" : "",
    aura ? `is-st is-st-${aura}` : "",
  ].join(" ");
  return (
    <div
      className={cls}
      style={{
        left: `${cellX(flip ? GRID_COLS - 1 - v.pos[idx].col : v.pos[idx].col)}px`,
        top: `${cellY(v.pos[idx].row)}px`,
        ["--accent" as string]: accent,
        // 격돌 키프레임이 "어느 쪽 벽으로 처박히는가"를 이 값으로 읽는다(±1)
        ...(slamDir ? { ["--slam" as string]: slamDir } : null),
        ...(aura ? { ["--aura" as string]: STATUS_AURA[aura] } : null),
        // 캐릭터를 프레임 한가운데가 아니라 **몸통 기준점**으로 세운다
        // (프레임 폭은 공격 검기까지 담느라 한쪽으로 늘어나 있다).
        // `--artflip`은 시트 원본이 보는 방향을 바로잡는 값이다(진영 반전
        // `--flip`과는 별개 — 자세한 이유는 battlefx.css의 `.sprite`).
        ...(sheet
          ? {
              ["--anchorpx" as string]: place!.anchorPx,
              ["--footpx" as string]: place!.footPx,
              ["--artflip" as string]: place!.artFlip,
            }
          : null),
      }}
    >
      {v.damage[idx] > 0 && (
        // 숫자 크기가 피해량을 따라간다 — 10과 40이 같은 크기로 뜨면 무게가 안 산다
        <div
          key={`dmg-${v.seq}`}
          className={`fighter__dmg ${v.damage[idx] >= 26 ? "fighter__dmg--big" : ""}`}
          style={{
            fontSize: `${Math.round(Math.min(66, 28 + v.damage[idx] * 0.9))}px`,
          }}
        >
          -{v.damage[idx]}
          {/* 어디서 온 피해인지 — 한 갈래뿐이고 그게 평범한 타격이면 굳이 안 적는다
              (숫자만 큼직하게 뜨는 지금 그림이 제일 읽기 좋다). 중독·화상·처박기가
              섞이는 순간부터 줄이 생긴다. */}
          {(() => {
            const bits = v.dmgBits[idx];
            if (
              bits.length === 0 ||
              (bits.length === 1 && bits[0].src === "attack")
            )
              return null;
            return (
              <span className="fighter__dmgsrc">
                {bits.map((b, i) => (
                  <span key={i} className={`dsrc dsrc--${b.src}`}>
                    {DMG_SRC[b.src].icon} {DMG_SRC[b.src].label} {b.n}
                  </span>
                ))}
              </span>
            );
          })()}
        </div>
      )}
      {v.heal[idx] > 0 && (
        <div key={`heal-${v.seq}`} className="fighter__heal">
          +{v.heal[idx]}
        </div>
      )}
      {v.say[idx] && <div className="fighter__say">{v.say[idx]}</div>}
      {v.stunned[idx] && <div className="fighter__stun">💫 기절</div>}
      {slamDir !== 0 && (
        <div key={`slam-${v.seq}`} className="fighter__slam">
          💥 격돌!
        </div>
      )}
      {v.status[idx].length > 0 && (
        <div className="fighter__status">
          {/* 중독·화상은 겹마다 한 칸씩 들어 있다 — 칩은 **종류별로 묶어** 보여준다
              (겹 수만큼 아이콘이 늘어서면 발밑이 금세 넘친다). 앞의 수치는 한 번에
              들어오는 총 피해, 굵은 수치는 가장 오래 남는 겹의 남은 라운드다. */}
          {statusChips(v.status[idx]).map((c) => (
            <span key={c.kind} className={`stchip stchip--${c.kind}`}>
              <StatusGlyph kind={c.kind} />
              {c.power > 0 ? c.power : ""}
              <b>{c.rounds}</b>
            </span>
          ))}
        </div>
      )}
      {aura && <div className="fighter__aura" />}
      {v.shield[idx] > 0 && <div className="fighter__shield" />}
      {fx && <div className={`fx fx--${fx.kind} fx--${fx.result}`} />}
      {isLocal && <div className="fighter__me">나</div>}
      {sheet ? (
        <div className="fighter__art">
          <SpriteClip sheet={sheet} clip={clipOf(v, idx, moving)} seq={v.seq} />
        </div>
      ) : (
        <div
          className="fighter__art"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  );
}

function BattleHud({
  c0,
  c1,
  maxHp,
  localSide,
  view,
  turn,
  collapseTurn,
  remain,
  boss,
  place,
  phase,
  foeTag,
  enraged,
  onQuit,
}: {
  c0: ReturnType<typeof getChar>;
  c1: ReturnType<typeof getChar>;
  /** 실효 최대 체력(유물·몬스터 반영) — HP 바 기준. */
  maxHp: [number, number];
  localSide: 0 | 1;
  view: View;
  turn: number;
  /** 붕괴 시계 라운드(엘리트·보스는 `turn`보다 늦다). */
  collapseTurn: number;
  remain: number | null;
  /** 상대가 스크립트 보스면 그 연출 데이터 — 칭호와 페이즈 문턱 눈금을 붙인다. */
  boss?: BossCinematic;
  place?: string;
  phase: string;
  foeTag?: string;
  enraged: boolean;
  onQuit: () => void;
}) {
  // mirror the HUD to match the board: this client's fighter on the left
  const li = localSide;
  const oi = (1 - localSide) as 0 | 1;
  const chars = [c0, c1] as const;
  return (
    <div className="bhud">
      <BhudSide
        char={chars[li]}
        maxHp={maxHp[li]}
        hp={view.hp[li]}
        energy={view.energy[li]}
        shield={view.shield[li]}
        status={view.status[li]}
        side="left"
      />
      <div className="bhud__turn">
        <div className="bhud__turnno">ROUND {turn}</div>
        <div className="bhud__place">
          {[place, boss ? boss.title : phase].filter(Boolean).join(" · ")}
        </div>
        {remain !== null && (
          <div
            className={`bhud__timer ${remain <= 5 ? "bhud__timer--urgent" : ""}`}
          >
            ⏱ {remain}s
          </div>
        )}
      </div>
      <BhudSide
        char={chars[oi]}
        maxHp={maxHp[oi]}
        hp={view.hp[oi]}
        energy={view.energy[oi]}
        shield={view.shield[oi]}
        status={view.status[oi]}
        side="right"
        boss={boss}
        sub={boss ? (enraged ? "2페이즈" : "1페이즈") : foeTag}
      />
      {/* 라운드 판 아래 보조 줄 — 붕괴 경고와 소리·종료 버튼. */}
      <div className="bhud__tools">
        {collapseEscalatesNext(collapseTurn) && (
          <div className="bhud__fog bhud__fog--warn">
            {collapseTurn < COLLAPSE_START_ROUND
              ? "⚠ 다음 라운드부터 전장이 무너진다!"
              : "⚠ 다음 라운드 붕괴 확대!"}
          </div>
        )}
        {collapseTurn >= COLLAPSE_START_ROUND && (
          <div className="bhud__fog">
            무너진 칸 라운드당 -{collapseDamageAt(collapseTurn)}
          </div>
        )}
        <SfxToggle />
        <button className="btn btn--ghost bhud__quit" onClick={onQuit}>
          종료
        </button>
      </div>
    </div>
  );
}

/** 효과음 음소거 토글 — 설정은 localStorage에 남는다(`sfx.ts`). */
function SfxToggle() {
  const [off, setOff] = useState(isMuted);
  return (
    <button
      className="btn btn--ghost bhud__sfx"
      title={off ? "효과음 켜기" : "효과음 끄기"}
      onClick={() => {
        const next = !off;
        setMuted(next);
        setOff(next);
        if (!next) {
          unlockAudio();
          playSfx("ui");
        }
      }}
    >
      {off ? "🔇" : "🔊"}
    </button>
  );
}

function BhudSide({
  char,
  maxHp,
  hp,
  energy,
  shield,
  status,
  side,
  boss,
  sub,
}: {
  char: ReturnType<typeof getChar>;
  maxHp: number;
  hp: number;
  energy: number;
  shield: number;
  /** 지금 걸려 있는 지속효과 — 기력 바 **아래**에 늘어놓는다(아래 주석 참고). */
  status: StatusEffect[];
  side: "left" | "right";
  /** 이 쪽이 스크립트 보스일 때만. 페이즈 전환 눈금을 그린다. */
  boss?: BossCinematic;
  /** 이름 옆 작은 글씨(엘리트·페이즈). 보호막이 있으면 그쪽이 우선이다. */
  sub?: string;
}) {
  const sheet = sheetFor(char.spriteId ?? char.id);
  const hpPct = Math.max(0, (hp / maxHp) * 100);
  const ePct = Math.max(0, (energy / char.maxEnergy) * 100);
  const hpLow = hpPct <= 30;
  /**
   * 체력 바에 얹히는 상태이상 색 — 사용자 요청("중독일 때는 hp 색상도 좀 변하거나").
   * ⚠ **채움 색을 갈아치우지 않는다.** 저체력 빨강은 그것대로 살아 있어야 하므로
   *   위에 사선 줄무늬 한 겹(`.bhud__hphaze`)만 덮는다.
   */
  const hpAura = AURA_PRIORITY.find((k) => status.some((e) => e.kind === k));

  // 잔상 바(lag bar) — 방금 깎인 만큼이 흰 띠로 남았다가 뒤늦게 따라온다.
  // 격투 게임 체력바의 기본기: "얼마나 맞았는지"가 한눈에 보인다.
  const [lag, setLag] = useState(hp);
  const lagRef = useRef(hp);
  const prevHp = useRef(hp);
  const [shock, setShock] = useState(false);
  useEffect(() => {
    const dropped = hp < prevHp.current;
    prevHp.current = hp;
    if (!dropped) {
      // 회복은 즉시 따라붙는다 — 잔상은 피해를 보여 주기 위한 장치다
      lagRef.current = hp;
      setLag(hp);
      return;
    }
    setShock(true);
    const catchUp = setTimeout(() => {
      lagRef.current = hp;
      setLag(hp);
    }, 340);
    const calm = setTimeout(() => setShock(false), 320);
    return () => {
      clearTimeout(catchUp);
      clearTimeout(calm);
    };
  }, [hp]);
  const lagPct = Math.max(0, (Math.max(lag, hp) / maxHp) * 100);

  return (
    <div
      className={`bhud__side bhud__side--${side} ${shock ? "is-shock" : ""} ${boss ? "bhud__side--boss" : ""}`}
      style={{ ["--accent" as string]: boss ? boss.accent : char.accent }}
    >
      <HudPortrait sheet={sheet} side={side} />
      <div className="bhud__info">
        <div className="bhud__head">
          <span className="bhud__name">
            {boss && <span className="bhud__bosstag">BOSS</span>}
            {char.name}
          </span>
          {/* 상태이상 — 체력·기력과 **같은 자리**에 둬야 "지금 내 상태"를 한 번에 읽는다.
              ⚠ 발밑 칩과 **같은 `statusChips()`를 쓴다** — 중독·화상은 겹마다 따로
              살아 있어서, 여기서만 따로 묶으면 두 자리가 다른 숫자를 말하게 된다. */}
          <span className="bhud__status">
            {statusChips(status).map((c) => (
              <span
                key={c.kind}
                className={`stchip stchip--hud stchip--${c.kind}`}
              >
                <StatusGlyph kind={c.kind} />
                {c.power > 0 ? c.power : ""}
                <b>{c.rounds}</b>
              </span>
            ))}
          </span>
          <span className="bhud__sub">
            {shield > 0 ? `보호막 ${shield}` : sub}
          </span>
        </div>
        <div className="bhud__row bhud__row--hp">
          <span className="bhud__tag">HP</span>
          {/* ⚠ 채움 막대만 클립한다 — 페이즈 눈금은 막대 밖으로 튀어나온다. */}
          <div className="bhud__hp">
            <div className="bhud__barclip">
              <div
                className={`bhud__hplag bhud__hpfill--${side}`}
                style={{ width: `${lagPct}%` }}
              />
              <div
                className={`bhud__hpfill bhud__hpfill--${side} ${hpLow ? "bhud__hpfill--low" : ""}`}
                style={{ width: `${hpPct}%` }}
              />
              <div className={`bhud__hpshock ${shock ? "is-on" : ""}`} />
            </div>
            {/* 페이즈 전환 눈금 — 여기를 지나면 보스가 격노한다. 예고 배너와 달리
                **항상 보이는** 정보라, 플레이어가 "언제 몰아칠지"를 계획할 수 있다.
                ⚠ 바가 바깥에서 안쪽으로 줄어들므로 오른쪽 진영은 눈금도 뒤집는다. */}
            {boss && (
              <div
                className="bhud__phasemark"
                style={{
                  [(side === "left" ? "left" : "right") as string]:
                    `${boss.enrageAt * 100}%`,
                }}
              />
            )}
          </div>
          <span className="bhud__num">
            {Math.ceil(hp)}/{maxHp}
          </span>
        </div>
        <div className="bhud__row">
          <span className="bhud__tag bhud__tag--en">EN</span>
          <div className="bhud__energy">
            <div className="bhud__barclip">
              <div
                className={`bhud__energyfill bhud__energyfill--${side}`}
                style={{ width: `${ePct}%` }}
              />
            </div>
          </div>
          <span className="bhud__num">{Math.floor(energy)}</span>
        </div>
      </div>
    </div>
  );
}

/** HUD 초상 칸. 스프라이트를 ×2로 키워 머리·몸통만 58px 칸에 담는다(큰 보스는 ×1). */
function HudPortrait({
  sheet,
  side,
}: {
  sheet?: SheetDef;
  side: "left" | "right";
}) {
  if (!sheet) return <div className="bhud__portrait" />;
  const sc = sheet.frameH > 100 ? 1 : 2;
  const anchor = side === "left" ? sheet.anchorX : sheet.frameW - sheet.anchorX;
  return (
    <div className="bhud__portrait" aria-hidden="true">
      <div
        style={{
          position: "absolute",
          left: 27 - anchor * sc,
          top: 58 - sheet.footY * sc * 0.75,
          ["--artflip" as string]: side === "left" ? 1 : -1,
        }}
      >
        <SpriteClip sheet={sheet} clip="idle" scale={sc} />
      </div>
    </div>
  );
}

/** 한 줄에 놓는 유물 수 — 넘치면 `+N`으로 접고 눌러서 편다. */
const RELIC_ROW_MAX = 9;

/**
 * 내 유물 줄 — 체력·기력 아래. 발동 방식마다 표시가 다르다(디자인의 "유물 — 상태바 아래 줄"):
 * 누적은 테두리 게이지, 횟수는 칸, 조건은 꺼지면 흐리게, 첫 라운드는 그 라운드에만 테두리.
 * 누르면 말풍선으로 설명이 뜬다.
 */
function BattleRelics({
  ids,
  battle,
  side,
  view,
  fired,
  owner,
}: {
  ids: string[];
  battle: CardBattle;
  side: 0 | 1;
  view: View;
  fired: { seq: number; ids: string[] } | null;
  owner: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const st = battle.state;
  const foe = (1 - side) as 0 | 1;
  const shown = wide ? ids : ids.slice(0, RELIC_ROW_MAX);

  const facts = (id: string) => {
    const e = getRelic(id)?.effect;
    const kind = RELIC_ATLAS[id]?.[2];
    const per = e?.energyTriggers?.[0]?.per;
    const uses = e?.stunOnHit
      ? { all: e.stunCap ?? 1, used: st.stunsUsed[side] }
      : e?.freezeOnHit
        ? { all: e.freezeCap ?? 1, used: st.freezesUsed[side] }
        : e?.revive
          ? { all: 1, used: st.revived[side] ? 1 : 0 }
          : null;
    const off =
      kind === "k" &&
      ((!!e?.lowHpBonusPct &&
        view.hp[side] / battle.maxHp[side] > LOW_HP_FRAC) ||
        (!!e?.executeBonusPct &&
          view.hp[foe] / battle.maxHp[foe] > LOW_HP_FRAC) ||
        (!!e?.bonusVsAfflicted && view.status[foe].length === 0));
    return {
      kind,
      per,
      uses,
      off,
      spent: per ? st.energySpent[side] % per : 0,
    };
  };

  const tip = open ? getRelic(open) : null;
  const tipFacts = open ? facts(open) : null;
  return (
    <div className="brelics" aria-label={`${owner}의 유물`}>
      {shown.map((id) => {
        const f = facts(id);
        const hot = fired?.ids.includes(id);
        return (
          <button
            key={id}
            className={`brelic ${f.off ? "is-off" : ""} ${f.off === false && f.kind === "k" ? "is-glow" : ""} ${
              f.kind === "o" && st.round === 1 ? "is-open" : ""
            }`}
            aria-label={getRelic(id)?.name ?? id}
            onClick={() => setOpen(open === id ? null : id)}
          >
            {f.per ? (
              <span
                className="brelic__ring"
                style={{ ["--pct" as string]: `${(f.spent / f.per) * 100}%` }}
              >
                <RelicIcon id={id} />
              </span>
            ) : (
              <span
                key={hot ? fired?.seq : 0}
                className={hot ? "brelic__pop" : ""}
              >
                <RelicIcon id={id} />
                {hot && (
                  <i
                    className={`brelic__burst brelic__burst--${getRelic(id)?.rarity ?? "common"}`}
                  />
                )}
              </span>
            )}
            {f.per && (
              <span className="brelic__count">
                {f.spent}/{f.per}
              </span>
            )}
            {f.uses && (
              <span className="brelic__pips">
                {Array.from({ length: f.uses.all }, (_, i) => (
                  <i
                    key={i}
                    className={i < f.uses!.all - f.uses!.used ? "is-left" : ""}
                  />
                ))}
              </span>
            )}
          </button>
        );
      })}
      {ids.length > RELIC_ROW_MAX && (
        <button className="brelic__more" onClick={() => setWide((w) => !w)}>
          {wide ? "−" : `+${ids.length - RELIC_ROW_MAX}`}
        </button>
      )}
      {tip && open && (
        <div className="relictip">
          <RelicIcon id={open} size={78} />
          <div>
            <div className="relictip__name">
              <b>{tip.name}</b>
              <span className={`relictip__rarity is-${tip.rarity}`}>
                {RARITY_LABEL[tip.rarity]}
              </span>
            </div>
            <p>{tip.desc}</p>
            {tipFacts?.per && (
              <em>
                누적 {tipFacts.spent} / {tipFacts.per} — 다음 발동까지 기력{" "}
                {tipFacts.per - tipFacts.spent}
              </em>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 적 능력 줄 — 처음엔 개수만큼 ?, 처음 작동하는 순간 뒤집힌다. */
function FoeRow({
  abilities,
  revealed,
  boss,
}: {
  abilities: FoeAbility[];
  revealed: Set<string>;
  boss: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const tip = abilities.find((a) => a.key === open);
  return (
    <div className={`foerow ${boss ? "foerow--boss" : ""}`}>
      <span className="foerow__label">{boss ? "보스 유물" : "능력"}</span>
      {abilities.map((a) => {
        const on = revealed.has(a.key);
        return (
          <button
            key={a.key}
            className={`foerow__item ${on ? "is-on" : ""}`}
            aria-label={on ? a.name : "아직 드러나지 않은 능력"}
            onClick={() => setOpen(open === a.key ? null : a.key)}
          >
            <FoeIcon id={on ? a.atlasId : boss ? "unknown" : "unknown-foe"} />
          </button>
        );
      })}
      {tip && (
        <div className="relictip relictip--foe">
          <FoeIcon
            id={revealed.has(tip.key) ? tip.atlasId : "unknown"}
            size={78}
          />
          <div>
            <div className="relictip__name">
              <b>{revealed.has(tip.key) ? tip.name : "???"}</b>
            </div>
            <p>
              {revealed.has(tip.key)
                ? tip.desc
                : "아직 드러나지 않은 능력이다."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
