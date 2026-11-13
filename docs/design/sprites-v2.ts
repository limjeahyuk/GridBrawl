// 자동 생성 — public/redesign/sprites/*/meta.json 에서 뽑은 값 (tools: redesign/build_all.py)
// 기존 SHEETS와 같은 SheetDef 모양. 경로는 'redesign/sprites/<id>'라 sheet id 앞에 접두사를 붙였다.
// ⚠ 'back'(후퇴 걸음) 클립이 새로 생겼다. 고블린 상점용 'haggle'·'cheer'도 ClipName에 추가할 것 — ClipName에 'back'을 추가하고, 이동 카드가 뒤로 갈 때 재생하면 된다.
import type { SheetDef } from './sprites'

export const SHEETS_V2: Record<string, SheetDef> = {
  // hero — 대체 대상: warrior
  warrior: { id: 'redesign/sprites/cairn', frameW: 96, frameH: 64, scale: 3, footY: 62, anchorX: 36, facesRight: true,
    clips: { idle: { frames: 6, frameMs: 120, loop: true }, run: { frames: 8, frameMs: 75, loop: true }, back: { frames: 6, frameMs: 95, loop: true }, attack1: { frames: 6, frameMs: 62, loop: false, impactFrame: 2 }, attack2: { frames: 6, frameMs: 64, loop: false, impactFrame: 2 }, attack3: { frames: 8, frameMs: 66, loop: false, impactFrame: 4 }, block: { frames: 4, frameMs: 80, loop: false }, hurt: { frames: 3, frameMs: 95, loop: false }, death: { frames: 8, frameMs: 100, loop: false } } },
  // hero — 대체 대상: archer
  archer: { id: 'redesign/sprites/sable', frameW: 96, frameH: 64, scale: 3, footY: 62, anchorX: 35, facesRight: true,
    clips: { idle: { frames: 6, frameMs: 125, loop: true }, run: { frames: 8, frameMs: 72, loop: true }, back: { frames: 6, frameMs: 95, loop: true }, attack1: { frames: 7, frameMs: 60, loop: false, impactFrame: 3 }, attack2: { frames: 8, frameMs: 70, loop: false, impactFrame: 4 }, attack3: { frames: 7, frameMs: 66, loop: false, impactFrame: 3 }, hurt: { frames: 3, frameMs: 95, loop: false }, death: { frames: 8, frameMs: 100, loop: false } } },
  // hero — 대체 대상: mage
  mage: { id: 'redesign/sprites/dirge', frameW: 96, frameH: 64, scale: 3, footY: 62, anchorX: 36, facesRight: true,
    clips: { idle: { frames: 8, frameMs: 120, loop: true }, run: { frames: 8, frameMs: 78, loop: true }, back: { frames: 6, frameMs: 100, loop: true }, attack1: { frames: 6, frameMs: 70, loop: false, impactFrame: 2 }, attack2: { frames: 8, frameMs: 75, loop: false, impactFrame: 3 }, attack3: { frames: 7, frameMs: 70, loop: false, impactFrame: 3 }, hurt: { frames: 3, frameMs: 95, loop: false }, death: { frames: 8, frameMs: 105, loop: false } } },
  // monster · grassland — 대체 대상: slime
  slime: { id: 'redesign/sprites/slime', frameW: 64, frameH: 44, scale: 3, footY: 43, anchorX: 26, facesRight: true,
    clips: { idle: { frames: 6, frameMs: 130, loop: true }, run: { frames: 6, frameMs: 85, loop: true }, attack1: { frames: 6, frameMs: 70, loop: false, impactFrame: 3 }, hurt: { frames: 3, frameMs: 95, loop: false }, death: { frames: 6, frameMs: 100, loop: false } } },
  // monster · grassland — 대체 대상: goblin
  goblin: { id: 'redesign/sprites/goblin', frameW: 72, frameH: 48, scale: 3, footY: 45, anchorX: 30, facesRight: true,
    clips: { idle: { frames: 6, frameMs: 110, loop: true }, run: { frames: 8, frameMs: 65, loop: true }, attack1: { frames: 6, frameMs: 60, loop: false, impactFrame: 2 }, attack2: { frames: 6, frameMs: 65, loop: false, impactFrame: 2 }, hurt: { frames: 3, frameMs: 90, loop: false }, death: { frames: 8, frameMs: 100, loop: false } } },
  // monster · grassland — 대체 대상: ogre
  ogre: { id: 'redesign/sprites/ogre', frameW: 120, frameH: 92, scale: 3, footY: 92, anchorX: 48, facesRight: true,
    clips: { idle: { frames: 6, frameMs: 140, loop: true }, run: { frames: 8, frameMs: 90, loop: true }, attack1: { frames: 6, frameMs: 75, loop: false, impactFrame: 2 }, attack2: { frames: 6, frameMs: 85, loop: false, impactFrame: 2 }, hurt: { frames: 3, frameMs: 100, loop: false }, death: { frames: 8, frameMs: 110, loop: false } } },
  // monster · dungeon — 대체 대상: bat
  bat: { id: 'redesign/sprites/bat', frameW: 64, frameH: 52, scale: 3, footY: 35, anchorX: 26, facesRight: true,
    clips: { idle: { frames: 6, frameMs: 80, loop: true }, run: { frames: 6, frameMs: 60, loop: true }, attack1: { frames: 6, frameMs: 65, loop: false, impactFrame: 3 }, hurt: { frames: 3, frameMs: 90, loop: false }, death: { frames: 6, frameMs: 95, loop: false } } },
  // monster · dungeon — 대체 대상: golem
  golem: { id: 'redesign/sprites/golem', frameW: 120, frameH: 92, scale: 3, footY: 92, anchorX: 48, facesRight: true,
    clips: { idle: { frames: 6, frameMs: 150, loop: true }, run: { frames: 8, frameMs: 95, loop: true }, attack1: { frames: 6, frameMs: 80, loop: false, impactFrame: 2 }, attack2: { frames: 6, frameMs: 90, loop: false, impactFrame: 2 }, hurt: { frames: 3, frameMs: 100, loop: false }, death: { frames: 9, frameMs: 110, loop: false } } },
  // monster · dungeon — 대체 대상: witch
  witch: { id: 'redesign/sprites/witch', frameW: 96, frameH: 64, scale: 3, footY: 62, anchorX: 36, facesRight: true,
    clips: { idle: { frames: 8, frameMs: 120, loop: true }, run: { frames: 8, frameMs: 78, loop: true }, attack1: { frames: 6, frameMs: 70, loop: false, impactFrame: 2 }, attack2: { frames: 8, frameMs: 75, loop: false, impactFrame: 3 }, hurt: { frames: 3, frameMs: 95, loop: false }, death: { frames: 8, frameMs: 105, loop: false } } },
  // boss · grassland — 대체 대상: warden
  warden: { id: 'redesign/sprites/warden', frameW: 160, frameH: 112, scale: 2, footY: 112, anchorX: 61, facesRight: true,
    clips: { idle: { frames: 6, frameMs: 140, loop: true }, run: { frames: 8, frameMs: 85, loop: true }, attack1: { frames: 6, frameMs: 75, loop: false, impactFrame: 2 }, attack2: { frames: 6, frameMs: 80, loop: false, impactFrame: 2 }, hurt: { frames: 3, frameMs: 100, loop: false }, death: { frames: 10, frameMs: 110, loop: false } } },
  // boss · dungeon — 대체 대상: pyrelord
  pyrelord: { id: 'redesign/sprites/pyrelord', frameW: 160, frameH: 112, scale: 2, footY: 112, anchorX: 62, facesRight: true,
    clips: { idle: { frames: 8, frameMs: 110, loop: true }, run: { frames: 8, frameMs: 85, loop: true }, attack1: { frames: 6, frameMs: 80, loop: false, impactFrame: 2 }, attack2: { frames: 6, frameMs: 80, loop: false, impactFrame: 2 }, hurt: { frames: 3, frameMs: 100, loop: false }, death: { frames: 10, frameMs: 110, loop: false } } },
  // boss · dungeon — 대체 대상: overlord
  overlord: { id: 'redesign/sprites/overlord', frameW: 176, frameH: 128, scale: 2, footY: 128, anchorX: 71, facesRight: true,
    clips: { idle: { frames: 8, frameMs: 120, loop: true }, run: { frames: 8, frameMs: 90, loop: true }, attack1: { frames: 6, frameMs: 75, loop: false, impactFrame: 2 }, attack2: { frames: 6, frameMs: 85, loop: false, impactFrame: 3 }, hurt: { frames: 3, frameMs: 100, loop: false }, death: { frames: 8, frameMs: 115, loop: false } } },
  // merchant · ? 칸 — 가난한 고블린
  'goblin-poor': { id: 'redesign/sprites/goblin-poor', frameW: 84, frameH: 58, scale: 3, footY: 55, anchorX: 38, facesRight: true,
    clips: { idle: { frames: 6, frameMs: 110, loop: true }, run: { frames: 8, frameMs: 65, loop: true }, back: { frames: 6, frameMs: 80, loop: true }, attack1: { frames: 6, frameMs: 60, loop: false, impactFrame: 2 }, attack2: { frames: 6, frameMs: 70, loop: false, impactFrame: 2 }, hurt: { frames: 3, frameMs: 90, loop: false }, death: { frames: 9, frameMs: 100, loop: false }, haggle: { frames: 6, frameMs: 120, loop: true }, cheer: { frames: 6, frameMs: 110, loop: false } } },
  // merchant · ? 칸 — 중간 고블린
  'goblin-mid': { id: 'redesign/sprites/goblin-mid', frameW: 84, frameH: 58, scale: 3, footY: 55, anchorX: 37, facesRight: true,
    clips: { idle: { frames: 6, frameMs: 110, loop: true }, run: { frames: 8, frameMs: 65, loop: true }, back: { frames: 6, frameMs: 80, loop: true }, attack1: { frames: 6, frameMs: 60, loop: false, impactFrame: 2 }, attack2: { frames: 6, frameMs: 70, loop: false, impactFrame: 2 }, hurt: { frames: 3, frameMs: 90, loop: false }, death: { frames: 9, frameMs: 100, loop: false }, haggle: { frames: 6, frameMs: 120, loop: true }, cheer: { frames: 6, frameMs: 110, loop: false } } },
  // merchant · ? 칸 — 부자 고블린
  'goblin-rich': { id: 'redesign/sprites/goblin-rich', frameW: 84, frameH: 58, scale: 3, footY: 55, anchorX: 37, facesRight: true,
    clips: { idle: { frames: 6, frameMs: 130, loop: true }, run: { frames: 8, frameMs: 80, loop: true }, back: { frames: 6, frameMs: 80, loop: true }, attack1: { frames: 6, frameMs: 70, loop: false, impactFrame: 2 }, attack2: { frames: 6, frameMs: 70, loop: false, impactFrame: 2 }, hurt: { frames: 3, frameMs: 90, loop: false }, death: { frames: 9, frameMs: 100, loop: false }, haggle: { frames: 6, frameMs: 120, loop: true }, cheer: { frames: 6, frameMs: 110, loop: false } } },
  // monster · 항아리 이벤트 — 동굴 뱀
  snake: { id: 'redesign/sprites/snake', frameW: 72, frameH: 40, scale: 3, footY: 40, anchorX: 34, facesRight: true,
    clips: { idle: { frames: 6, frameMs: 120, loop: true }, run: { frames: 6, frameMs: 80, loop: true }, back: { frames: 6, frameMs: 90, loop: true }, attack1: { frames: 6, frameMs: 65, loop: false, impactFrame: 2 }, attack2: { frames: 6, frameMs: 75, loop: false, impactFrame: 3 }, hurt: { frames: 3, frameMs: 90, loop: false }, death: { frames: 7, frameMs: 100, loop: false } } },
}
