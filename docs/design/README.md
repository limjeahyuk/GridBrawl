# GridBrawl 디자인 자료 — 에셋 · 시안 · 굽는 도구 (2026-11 리디자인)

새로 그린 픽셀아트 스프라이트·배경입니다. 전부 `public/redesign/`에 있고 **코드에 이미 붙어 있다**(`art/sprites.ts`의 `SHEETS` · `run.ts`의 `sceneFor` — 2026-11-07~12).

> 이 폴더(`docs/design/`)는 **그림 · 시안 · 도구**만 둔다 — 게임 규칙은 [`docs/rules/`](../rules/RUN.md), 진행표는 [PROGRESS.md](../PROGRESS.md), 문서 지도는 CLAUDE.md §0.
> 시안 대응표 [screens/README.md](screens/README.md) · 사용자 원본 그림 `2dImg/`(git에 넣는다 · 배포 안 됨 · **Claude는 건드리지 않는다** — 읽기만) · 굽는 도구 `tools/` · 미리보기 `previews/` · 데이터 `events.json`(이벤트 카탈로그 시안용) · `relics-100.json` · `relics-source.json`(유물 정리 원본).

```
public/redesign/
  sprites/<id>/<clip>.png   ← 가로 스트립 (기존 public/sprites 규격 그대로)
  sprites/<id>/meta.json    ← frameW/H · footY · anchorX · 클립별 frames/frameMs/impactFrame
  sprites/index.json        ← 위 meta 전체
  sprites/fx/arrow.png, ember-arrow.png   ← 궁수 투사체
  bg/grassland/{sky,clouds,mountains,hills,meadow}.png   ← 320×180, repeat-x, ×4 = 1280×720
  bg/dungeon/{wall,torchlight,floor,foreground}.png, torch.png(16×28 ×4f)
  terrain/{grass-tile,dirt-tile,dungeon-tile}.png   ← 판 칸 32×32, 이음매 없음
  heroes/bg-{cairn,sable,dirge}.png   ← 영웅 선택 일러스트 배경(1280×720)
  cutscene/{inn,smith,goblin,events}/  ← 여관 · 대장간 · 고블린 3단계 · 이벤트 3종 일러스트 배경
  ui/{map-icons,events,rest,move,relics,status}/  ← 지도 아이콘 · 이벤트 도트 · 모루(rest/anvil — 모닥불은 11-12 삭제) · 이동 묶음 · 유물 아틀라스 · 상태 아이콘
docs/design/
  sprites-v2.ts             ← SHEETS에 바로 붙일 수 있는 SheetDef 값 (자동 생성)
  previews/*.png            ← 시트별 전체 프레임 미리보기
  tools/*.py                ← 생성기 원본 (python3 + numpy + Pillow)
```

## 들어 있는 것

| 시트 id | 대체 대상 | 프레임 | 클립 |
| --- | --- | --- | --- |
| `cairn` | warrior | 96×64 | idle · run · **back** · attack1~3 · block · hurt · death |
| `sable` | archer | 96×64 | idle · run · **back** · attack1~3 · hurt · death |
| `dirge` | mage | 96×64 | idle · run · **back** · attack1~3 · hurt · death |
| `slime` `goblin` `ogre` | 같은 id | 64×44 / 72×48 / 120×92 | idle · run · attack1(·2) · hurt · death |
| `bat` `golem` `witch` | 같은 id | 64×52 / 120×92 / 96×64 | 〃 |
| `warden` `pyrelord` `overlord` | 같은 id (보스) | 160×112 / 160×112 / 176×128 | idle · run · attack1 · attack2 · hurt · death |
| `goblin-poor` `goblin-mid` `goblin-rich` | 고블린 장사꾼(덮쳤을 때의 전투) | `meta.json` | idle · run · attack1 · attack2 · hurt · death |
| `snake` | 동굴 뱀(항아리 이벤트) | 72×40 | idle · run · back · attack1 · attack2 · hurt · death |

- 영웅 도트는 v2(2026-11-09, 선택 일러스트에 맞춤)이고 마법사는 v3(2026-11-11, `magision.png`에 맞춤). ⚠ 전사는 방패가 빠진 채 그려졌다(PROGRESS T5).
- 리디자인 도트가 없는 몬스터 — 철퇴병 · 감시안 · 버서커 · 뱀파이어 · 가디언 · 석궁병 · 주술사 · 기사 · 암살자 — 는 `public/sprites/`의 옛 시트를 쓴다. 팬텀은 `bat`, 분열체는 `slime`, 늑대 무리는 `ogre` 시트를 빌린다(늑대는 임시 · PROGRESS T7).

- 전부 **오른쪽을 본다**(`facesRight: true`). 공격 이펙트(검기·화살 궤적·마법)는 프레임 안에 같이 그려져 있다.
- `footY`·`anchorX`는 `meta.json`에 들어 있다(대기 1프레임에서 측정). 영웅은 발바닥 y=62.
- 권장 배율: 영웅·일반 몬스터 ×3, 보스 ×2.

## 코드에 붙일 때 (이미 붙였다 — 새 시트를 더할 때의 절차)

1. `docs/design/sprites-v2.ts`의 `SHEETS_V2`를 `src/art/sprites.ts`로 옮기고, 원하는 캐릭터만 `SHEETS`에 덮어쓴다.
   id가 `redesign/sprites/<id>`라 `public/redesign/sprites/<id>/`를 읽는다.
2. **`back` 클립** — `ClipName`에 이미 있다(`haggle`·`cheer`도 있지만 지금은 안 쓴다). 이동 카드가 바라보는 반대쪽으로 갈 때 `run` 대신 재생해 "뒤로 물러나는" 걸음이 나온다.
3. 지역 2개: `sceneFor()`가 `regionOf(run)` — **1막 초원 · 2막 던전**(보스 무대 예외)이고, `.boardfloor--grassland` / `--dungeon` 클래스에 위 배경 레이어를 `background-size: 1280px 720px; repeat-x`로 깐다. 던전 횃불은 `torch.png`를 `steps(4)`로 돌리면 된다.

## 다시 굽기

`docs/design/tools/`에서 `python3 build_all.py` → `out/`에 같은 구조로 다시 나온다.
포즈·색은 `hero_*.py`, `mon_*.py`의 키 포즈와 팔레트를 고치면 된다.

일러스트 배경 · 아이콘(원본은 `2dImg/`):

| 도구 | 하는 일 |
| --- | --- |
| `tools/hero-bg/build.py` | 영웅 선택 배경(`cairn` · `sable` · `magision` → `heroes/bg-*.png` — 마법사 결과 이름은 그대로 `bg-dirge.png`) |
| `tools/inn-bg/build.py` | 여관 배경 |
| `tools/event-bg/build.py` · `build_wide.py` · `cover.py` | 이벤트 배경 — 세로 그림을 한쪽에 세우기 · 가로 그림 · 가로 그림 꽉 채우기(1344×768은 화면비가 거의 같다) |
| `tools/icon/build.py` | 웹 아이콘 마스터(`master-1024.png`, 거래상 얼굴) — `npm run icon`이 줄인다 |
| `tools/relic_icons.py [outdir]` | 유물 아이콘 아틀라스(`../relics-source.json` · `../relics-100.json` → `out/ui/relics/` → `public/redesign/ui/relics/`). 글리프는 `legend_glyphs.py` · 새 유물(알 · 영양가루 · 깃털 — 지금 이모지)을 그릴 때 쓴다 |
| `tools/status-icons/status_icons.py` | 상태이상 · 버프 아이콘 16×16 + 숫자(`StatusIcons` 시안) |
| `tools/seal/seal.py` | 봉인 덮개 48×53 ×3(기절 사슬 · 빙결 얼음 · 속박 덩굴) + 자물쇠 14×16 ×3 → `public/redesign/ui/status/seal.png` · `lock.png`(`Seal.dc.html`) |
| `tools/mon_gladiator.py` | 막고라 검투사 96×64 6동작(`gladiator_clips()` — `pix.save_sheet`로 `sprites/gladiator/`) |
| `tools/coin/coin.py` | 카지노 동전 22×22 × 12프레임 → `public/redesign/ui/events/coin.png` |

