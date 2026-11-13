"""함정 칸 칩 — 12×10 픽셀 아이콘(외곽선 포함), 판의 함정 툴팁 · 칩과 상태 줄이 쓴다.
usage: python3 hazards.py [outdir]  -> <outdir>/ui/status/{poison,burn,bind,block,collapse,slip}.png
(옛 32×32 함정 타일 `terrain/hazards/`는 2026-11-13에 지웠다 — 게임은 1칸 타일 `hazards_cell.py`를 쓴다.)"""
import os, sys
import numpy as np
from PIL import Image
from pix import hx, outline, sprite

OL = hx('#141018')

SPAL = dict(r='#ff5a1a', y='#ffc04a', w='#fff4c0', R='#8a1a08', g='#4aa83a', G='#8af05a', D='#1e3a14',
            s='#c6ccd4', S='#7a8496', b='#3a6a22', t='#d8c890', k='#6a6c78', K='#a2a6b2', c='#7ab8e0', C='#e8f8ff',
            x='#ff3a3a', o='#ff8a3a')
STATUS = {
    'block': '''
..kkkkkk..
.kKKKKKKk.
kKKkKKKKKk
kKKKKkKKKk
kKKKKKKKKk
.kkkkkkkk.
..........
..........
''',
    'burn': '''
....r.....
...ryr....
..ryyr.r..
..rywyrr..
.rywwwyr..
.ryywwyr..
..rryyr...
...RRRR...
''',
    'bind': '''
.b......b.
..bt..tb..
...bbbb...
..tbttbt..
..btbbtb..
...bbbb...
..bt..tb..
.b......b.
''',
    'poison': '''
....g.....
...gGg....
..gGGGg...
..gGwGg...
.gGGGGGg..
.gGwGGGg..
..gGGGg...
...ggg....
''',
    'collapse': '''
..........
.o......o.
..o.xx.o..
...xooxk..
..xokkox..
.kxkkkkxk.
kkkkkkkkkk
..........
''',
    'slip': '''
..........
..C.......
.CcC......
..C..cC...
....cCcC..
...cCCCCc.
..cccccccc
..........
''',
}


def build(outdir):
    sd = os.path.join(outdir, 'ui', 'status')
    os.makedirs(sd, exist_ok=True)
    icons = {}
    for k, art in STATUS.items():
        a = np.pad(sprite(art, SPAL), ((1, 1), (1, 1), (0, 0)))
        a = outline(a, OL)
        Image.fromarray(a).save(os.path.join(sd, f'{k}.png'))
        icons[k] = a
    return icons


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'out')
