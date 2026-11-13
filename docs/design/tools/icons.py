"""12×12 pixel map-node icons."""
import os
import numpy as np
from PIL import Image
from pix import sprite, outline

PAL = dict(
    y='#f4d470', Y='#c9952f', G='#7a5418', w='#fff6dc',
    b='#8a5a36', B='#5c3a20', n='#b07a4a',
    s='#c6ccd4', S='#7a8496', k='#3a4252',
    r='#ff4a3a', R='#8a1020', o='#ff8a3a', f='#ffd27a',
    h='#e8dcc0', H='#a8987a', D='#2a1c14', p='#c48aff', P='#6a2aa8',
)

ICONS = {
    'unknown': '''
....yyyy....
...yYGGYy...
..yY....Yy..
..GG....yY..
.......yY...
......yY....
.....yY.....
.....YG.....
............
.....yy.....
.....YG.....
............
''',
    'merchant': '''
....BBBB....
.....BB.....
....bnnb....
...bnnnnb...
..bnnyynnb..
..bnyYYynb..
.bnnyYGynnb.
.bnnnyynnnb.
.bnnnnnnnnb.
.Bbnnnnnnb..
..BBbbbbBB..
............
''',
    'treasure': '''
............
..bbbbbbbb..
.bnnnnnnnnb.
.bnnnnnnnnb.
.YyyyyyyyyY.
.BbbbyYbbbB.
.BbbbGGbbbB.
.BnnnnnnnnB.
.BnnnnnnnnB.
.YyyyyyyyyY.
.GGGGGGGGGG.
............
''',
    'rest': '''
.....f......
....ffo.....
...fof.o....
...ofwfo....
..oofwwfo...
..orfwwfro..
...rroorr...
.B.bnnnnb.B.
..BbnBBnbB..
.BnbB..BbnB.
.BB......BB.
............
''',
    'enemy': '''
..........ss
.........ssS
........ssS.
.......ssS..
..k...ssS...
..kk.ssS....
...kssS.....
....kS......
...YkGk.....
..YG..kk....
.YG....k....
.G..........
''',
    'elite': '''
.h........h.
.hH......Hh.
..hHhhhhHh..
..hhhhhhhh..
.hhhhhhhhhh.
.hRRhhhhRRh.
.hRrhhhhrRh.
.hhhhDDhhhh.
..hhhhhhhh..
..hDhDhDhh..
...hHhHhH...
............
''',
    'boss': '''
............
.y...yy...y.
.yy..yy..yy.
.yYy.yy.yYy.
.yYYyyyyYYy.
.yYYYYYYYYy.
.yRyYpPYyRy.
.yYYYYYYYYy.
.GGGGGGGGGG.
.yyyyyyyyyy.
.GGGGGGGGGG.
............
''',
}


def build(outdir):
    os.makedirs(outdir, exist_ok=True)
    out = {}
    for k, art in ICONS.items():
        a = sprite(art, PAL)
        a = np.pad(a, ((1, 1), (1, 1), (0, 0)))
        a = outline(a)
        Image.fromarray(a).save(os.path.join(outdir, f'{k}.png'))
        out[k] = a
    return out


if __name__ == '__main__':
    from pix import preview
    ic = build('out/ui/map-icons')
    preview([list(ic.values())], 'prev_icons.png', scale=8)
