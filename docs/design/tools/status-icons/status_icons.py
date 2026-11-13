"""usage: python status_icons.py <outdir>  -> tiles.png(160x16) · digits.png(55x7) · _preview.png
Status-effect icon tiles 16x16 (glyph 10x10 + outline, framed by category)
+ pixel digit font for the stack badge (×N)."""
import sys, os, json
import numpy as np
from PIL import Image


def hx(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def sprite(art, pal):
    rows = [r.rstrip() for r in art.strip('\n').split('\n')]
    a = np.zeros((len(rows), max(len(r) for r in rows), 4), np.uint8)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch not in '. ':
                a[y, x] = hx(pal[ch])
    return a


def outline(a, col, diag=False):
    m = a[..., 3] > 0
    d = m.copy()
    d[1:] |= m[:-1]; d[:-1] |= m[1:]; d[:, 1:] |= m[:, :-1]; d[:, :-1] |= m[:, 1:]
    if diag:
        d[1:, 1:] |= m[:-1, :-1]; d[:-1, :-1] |= m[1:, 1:]; d[1:, :-1] |= m[:-1, 1:]; d[:-1, 1:] |= m[1:, :-1]
    out = a.copy()
    out[d & ~m] = col
    return out


K = hx('#0a0810')
PAL = dict(
    g='#a6ec5a', G='#4fae2a', d='#2a6a1a', m='#d6eef4', b='#a0683a', B='#5c3a20',
    r='#e8402a', o='#ff8a3a', f='#ffd27a', y='#fff6c8',
    R='#9a1428', q='#ff4a4a', w='#ffffff', W='#ffc8c8',
    c='#bfefff', C='#5ab8f0', V='#3a7a2a', v='#8ad04a', t='#efe2c0',
    Y='#ffd84a', O='#c9952f', h='#e8dcc0',
    s='#f6c098', S='#c8784a', u='#ffe0c0',
    M='#8a96a8', a='#7aff6a', A='#2aa83a', e='#8ae0ff', E='#3a8aff', p='#d8b0ff',
    n='#b0b8c8', N='#5a6478',
)
GLYPH = {
'poison': '''
...bbbb...
...BBBB...
....mm....
....mm....
...m.g.m..
..mg..g.m.
.mgggggggm
.mgGgggGgm
.mgGGGGGgm
..mmmmmmm.
''',
'burn': '''
....r.....
....rr....
...ror..r.
...rorr.r.
..rroorrr.
.rrofoorrr
.rofffoor.
.rofyyfor.
.roffyfor.
..rrrrrr..
''',
'bleed': '''
...R......
...R......
..RqR...R.
..RqR..RqR
.RqqqR.RqR
.RqWqR..R.
RqWqqqR...
RqqqqqR...
RqqqqRR...
.RRRRR....
''',
'bind': '''
...t..t...
..vVVVVv..
.vV....Vvt
tV......V.
.V......V.
.vV....Vv.
t.vVVVVvVv
...t..t..V
.........V
''',
'stunned': '''
.w........
wyw...YY..
.w.YYY..Y.
..Y......Y
.Y.......Y
.Y......w.
..YYY..wyw
.....YYYw.
..........
''',
'frozen': '''
....c....
.c.cCc.c.
..cCwCc..
.cC.C.Cc.
cCwCwCwCc
.cC.C.Cc.
..cCwCc..
.c.cCc.c.
....c....
''',
'empower': '''
.SSSS.....
SsSsuS....
SsSssS....
.SsssS....
.SsuS.SSS.
.SssSSuusS
.SsssssssS
.SsssssssS
..SSsssSS.
....SSS...
''',
'atkUp': '''
.a......nN
aaa....nwN
.a....nwN.
.a...nwN..
....nwN...
.O.nwN....
.OOwN.....
..OO......
.O..O.....
O.........
''',
'defUp': '''
.a........
aaa.......
.aNNNNNNN.
.aNnnwnnN.
..NnCCCnN.
..NnCwCnN.
..NnCCCnN.
...NnnnN..
....NnN...
.....N....
''',
'freeCast': '''
.p...EE...
ppp.EeE...
.p.EeE....
..EeEEEE..
.EeeeeeE..
..EEEEeE..
....EeE.p.
...EeE.ppp
...EE...p.
..........
''',
}
# category: frame colour / inner bg / inner bg top highlight
CAT = {
    'dot':  ('#d04048', '#2a1018', '#3a1822'),   # 피해 — 중독 · 화상 · 출혈
    'lock': ('#9a86ff', '#191432', '#241d44'),   # 이동불가 — 속박 · 기절 · 빙결
    'buff': ('#f4d470', '#2a2008', '#3a2e10'),   # 힘 · 버프
}
ORDER = [('poison', 'dot', '중독'), ('burn', 'dot', '화상'), ('bleed', 'dot', '출혈'),
         ('bind', 'lock', '속박'), ('stunned', 'lock', '기절'), ('frozen', 'lock', '빙결'),
         ('empower', 'buff', '힘'), ('atkUp', 'buff', '공격 강화'), ('defUp', 'buff', '방어 강화'),
         ('freeCast', 'buff', '무아지경')]


def tile(key, cat):
    fr, bg, hi = (hx(c) for c in CAT[cat])
    t = np.zeros((16, 16, 4), np.uint8)
    t[:] = K
    t[1:15, 1:15] = fr
    t[2:14, 2:14] = bg
    t[2, 2:14] = hi
    # chamfered corners
    for (y, x) in [(0, 0), (0, 15), (15, 0), (15, 15)]:
        t[y, x] = 0
    for (y, x) in [(1, 1), (1, 14), (14, 1), (14, 14)]:
        t[y, x] = K
    g = sprite(GLYPH[key], PAL)
    g = outline(np.pad(g, ((1, 1), (1, 1), (0, 0))), K)
    h, w = g.shape[:2]
    oy, ox = 2 + (12 - h) // 2, 2 + (12 - w) // 2
    blk = t[oy:oy + h, ox:ox + w]
    m = g[..., 3] > 0
    blk[m] = g[m]
    return t


# --- 3x5 digit font + × (badge) ---------------------------------------
DIG = {
'0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'],
'2': ['###', '..#', '###', '#..', '###'], '3': ['###', '..#', '.##', '..#', '###'],
'4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '###', '..#', '###'],
'6': ['###', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'],
'8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '###'],
'x': ['...', '#.#', '.#.', '#.#', '...'],
}
INK = hx('#fff6dc')


def badge(text, ink=INK):
    """glyphs 3x5 with 1px gap, 1px black outline all round (incl. diagonals)."""
    w = len(text) * 4 - 1
    a = np.zeros((5, w, 4), np.uint8)
    for i, ch in enumerate(text):
        for y, row in enumerate(DIG[ch]):
            for x, c in enumerate(row):
                if c == '#':
                    a[y, i * 4 + x] = ink
    a = np.pad(a, ((1, 1), (1, 1), (0, 0)))
    return outline(a, K, diag=True)


def font_sheet():
    """one cell per glyph: 5x7 (3x5 + outline). order 0-9 then ×."""
    keys = list('0123456789x')
    cells = []
    for k in keys:
        cells.append(badge(k))
    return np.concatenate(cells, 1), keys


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'out'
    os.makedirs(out, exist_ok=True)
    tiles = []
    for k, cat, _ in ORDER:
        t = tile(k, cat)
        tiles.append(t)
    sheet = np.concatenate(tiles, 1)
    Image.fromarray(sheet).save(f'{out}/tiles.png')
    fs, keys = font_sheet()
    Image.fromarray(fs).save(f'{out}/digits.png')
    # preview
    P = np.zeros((40, 16 * 10 + 9 * 8 + 16, 4), np.uint8); P[:] = hx('#5fb4ec')
    for i, t in enumerate(tiles):
        x = 8 + i * 24
        m = t[..., 3] > 0
        P[8:24, x:x + 16][m] = t[m]
        b = badge('x' + str([2, 3, 12, 1, 2, 1, 5, 2, 3, 2][i]))
        bh, bw = b.shape[:2]
        by, bx = 24 - bh + 3, x + 16 - bw + 4
        mb = b[..., 3] > 0
        P[by:by + bh, bx:bx + bw][mb] = b[mb]
    Image.fromarray(P).resize((P.shape[1] * 6, P.shape[0] * 6), Image.NEAREST).save(f'{out}/_preview.png')
    print('ok')
