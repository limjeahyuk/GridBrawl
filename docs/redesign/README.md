# GridBrawl 리디자인 에셋 (2026-11)

새로 그린 픽셀아트 스프라이트·배경입니다. **기존 파일은 하나도 건드리지 않았고**, 전부 새 폴더에만 넣었습니다.

```
public/redesign/
  sprites/<id>/<clip>.png   ← 가로 스트립 (기존 public/sprites 규격 그대로)
  sprites/<id>/meta.json    ← frameW/H · footY · anchorX · 클립별 frames/frameMs/impactFrame
  sprites/index.json        ← 위 meta 전체
  sprites/fx/arrow.png, ember-arrow.png   ← 궁수 투사체
  bg/grassland/{sky,clouds,mountains,hills,meadow}.png   ← 320×180, repeat-x, ×4 = 1280×720
  bg/dungeon/{wall,torchlight,floor,foreground}.png, torch.png(16×28 ×4f)
  terrain/{grass-tile,dirt-tile,dungeon-tile}.png   ← 판 칸 32×32, 이음매 없음
docs/redesign/
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

- 전부 **오른쪽을 본다**(`facesRight: true`). 공격 이펙트(검기·화살 궤적·마법)는 프레임 안에 같이 그려져 있다.
- `footY`·`anchorX`는 `meta.json`에 들어 있다(대기 1프레임에서 측정). 영웅은 발바닥 y=62.
- 권장 배율: 영웅·일반 몬스터 ×3, 보스 ×2.

## 코드에 붙일 때

1. `docs/redesign/sprites-v2.ts`의 `SHEETS_V2`를 `src/art/sprites.ts`로 옮기고, 원하는 캐릭터만 `SHEETS`에 덮어쓴다.
   id가 `redesign/sprites/<id>`라 `public/redesign/sprites/<id>/`를 읽는다.
2. **`back` 클립이 새로 생겼다** — `ClipName`에 `'back'`을 추가하고, 이동 카드가 바라보는 반대쪽으로 갈 때 `run` 대신 재생하면 "뒤로 물러나는" 걸음이 나온다.
3. 지역 2개: `sceneFor()`를 `floor <= 7 ? 'grassland' : 'dungeon'`처럼 바꾸고, `.boardfloor--grassland` / `--dungeon` 클래스에 위 배경 레이어를 `background-size: 1280px 720px; repeat-x`로 깐다. 던전 횃불은 `torch.png`를 `steps(4)`로 돌리면 된다.

## 다시 굽기

`docs/redesign/tools/`에서 `python3 build_all.py` → `out/`에 같은 구조로 다시 나온다.
포즈·색은 `hero_*.py`, `mon_*.py`의 키 포즈와 팔레트를 고치면 된다.
