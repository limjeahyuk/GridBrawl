"""Board hazard tiles — 32×32 frames (game shows them ×4 = 128px, same as the existing rocks.png).
Ground decal sits in the lower part (centre y≈24); standing objects rise above it."""
import math, os
import numpy as np
from PIL import Image
from pix import hx, ramp, Layer, outline, blend_over, over, sprite
from rig import glow

T = 32
CX, CY = 16, 24
OL = hx('#141018')


def L():
    return Layer(T, T)


def ground_ellipse(l, rx, ry, cols, cy=CY, shade=True):
    return l.ellipse(CX, cy, rx, ry, cols, shade)


def fin(a, ol=True):
    return outline(a, OL) if ol else a


def alpha(a, k):
    a = a.copy()
    a[..., 3] = (a[..., 3].astype(float) * k).astype(np.uint8)
    return a


# ------------------------------------------------------------------ ROCKS
def boulder(moss=True, wear=0, pillar=False):
    l = L()
    # shadow
    sh = L(); ground_ellipse(sh, 12, 4, [hx('#000000')] * 3, cy=CY + 3, shade=False)
    sh_a = alpha(sh.a, 0.35)
    if pillar:
        stone = ramp('#2c2a3a', '#545070', '#8a86a8')
        pts = [(8, 27), (7, 14), (9, 7), (13, 4), (19, 4), (23, 8), (25, 15), (24, 27)]
        l.poly(pts, stone, True, light='left')
        for y in (11, 18):  # carved bands
            l.line((8, y), (24, y), hx('#2c2a3a'))
            l.line((8, y + 1), (24, y + 1), hx('#8a86a8'))
        l.px(15, 14, hx('#5ef0ff')); l.px(16, 14, hx('#5ef0ff')); l.px(16, 15, hx('#1a8aa8'))
    else:
        stone = ramp('#3a3a44', '#6a6c78', '#a2a6b2')
        pts = [(5, 26), (4, 20), (7, 13), (12, 9), (19, 9), (25, 13), (28, 20), (27, 26)]
        l.poly(pts, stone, True, light='left')
        l.line((12, 13), (17, 12), hx('#c8ccd6')); l.px(10, 15, hx('#c8ccd6'))
        l.line((19, 22), (24, 20), hx('#3a3a44'))
        if moss:
            for x, y in ((8, 13), (9, 12), (10, 11), (11, 11), (12, 10), (13, 10), (14, 10), (7, 14), (21, 10), (22, 11)):
                l.px(x, y, hx('#5a9a3a'))
            for x, y in ((9, 13), (12, 11), (11, 12)):
                l.px(x, y, hx('#8acb50'))
    crack = hx('#141018')
    if wear >= 1:
        for p, q in (((16, 10 if not pillar else 5), (14, 15)), ((14, 15), (17, 19)), ((17, 19), (15, 24))):
            l.line(p, q, crack)
    if wear >= 2:
        for p, q in (((24, 14), (20, 17)), ((20, 17), (21, 23)), ((8, 18), (12, 20))):
            l.line(p, q, crack)
    a = blend_over(sh_a, fin(l.a))
    if wear >= 2:  # glowing edge = "one more hit"
        g = glow(T, T, (16, 17), 15, hx('#ff6a3a'), 0.35)
        a = blend_over(g, a)
    return a


def rock_break(moss=True, pillar=False):
    frames = []
    base = boulder(moss, 2, pillar)
    rng = np.random.default_rng(4)
    pieces = [(-6, -4), (5, -6), (-3, 3), (7, 2), (0, -8), (-8, 4)]
    for k in range(1, 4):
        l = L()
        for i, (dx, dy) in enumerate(pieces):
            x = 16 + dx * (1 + k * 0.7); y = 18 + dy * (1 + k * 0.4) + k * k * 1.2
            r = 2.4 - k * 0.45
            if y < 31:
                l.ellipse(x, y, r, r * 0.85, ramp('#3a3a44', '#6a6c78', '#a2a6b2') if not pillar else ramp('#2c2a3a', '#545070', '#8a86a8'), True)
        dust = L()
        for i in range(12):
            ang = i / 12 * 6.28
            dust.px(16 + math.cos(ang) * (4 + k * 3), 22 + math.sin(ang) * (2 + k), hx('#c8c0b0'))
        frames.append(blend_over(alpha(dust.a, 1 - k / 4), fin(l.a)))
    return frames


# ------------------------------------------------------------------ FIRE
FLAME = [hx('#8a1a08'), hx('#ff5a1a'), hx('#ffc04a'), hx('#fff4c0')]


def fire_frame(i, n=6, strength=1.0):
    l = L()
    scorch = L()
    ground_ellipse(scorch, 13, 5, [hx('#1e1210'), hx('#3a1e14'), hx('#5a2e18')], shade=True)
    for x, y in ((8, 24), (12, 26), (20, 23), (24, 25), (16, 27)):
        scorch.px(x, y, hx('#ff5a1a') if (x + i) % 3 else hx('#8a1a08'))
    ph = i / n * 2 * math.pi
    for j, (bx, h) in enumerate(((10, 10), (16, 15), (22, 11))):
        hh = h * strength * (0.8 + 0.2 * math.sin(ph + j * 2.1))
        w0 = 4 if j == 1 else 3
        for k in range(int(hh)):
            u = k / hh
            w = max(0.5, w0 * (1 - u ** 1.4))
            sway = math.sin(ph * 1 + k * 0.45 + j) * (u * 1.8)
            for dx in np.arange(-w, w + 0.01, 1):
                d = abs(dx) / max(w, 0.5)
                c = FLAME[3] if (d < 0.35 and u < 0.55) else FLAME[2] if d < 0.7 and u < 0.8 else FLAME[1] if u < 0.92 else FLAME[0]
                l.px(bx + dx + sway, CY + 1 - k, c)
    # embers
    for j in range(3):
        y = (CY - 8 - ((i * 3 + j * 5) % 14))
        l.px(9 + j * 6 + (i + j) % 3, y, FLAME[2])
    g = glow(T, T, (16, 17), 14, hx('#ff8a3a'), 0.35 * strength)
    return blend_over(blend_over(g, scorch.a), l.a)


# ------------------------------------------------------------------ SPIKES (dungeon)
STEEL = [hx('#3a4252'), hx('#7a8496'), hx('#c6ccd4'), hx('#ffffff')]


def spike_frame(stage, glint=False):
    """stage: 0 hidden, 1 warn, 2,3 rising, 4 up"""
    l = L()
    plate = L()
    pts = [(3, 24), (8, 19), (24, 19), (29, 24), (24, 29), (8, 29)]
    plate.poly(pts, ramp('#26242f', '#3e3a4c', '#5a5670'), True)
    holes = [(9, 22), (16, 21), (23, 22), (12, 26), (20, 26), (16, 24)]
    a = fin(plate.a)
    hl = L()
    for x, y in holes:
        c = hx('#ff3a2a') if stage == 1 else hx('#0a0810')
        hl.px(x, y, c); hl.px(x + 1, y, c)
    a = over(a, hl.a)
    if stage == 1:
        a = blend_over(a, glow(T, T, (16, 24), 12, hx('#ff3a2a'), 0.35))
    if stage >= 2:
        hgt = {2: 3, 3: 6, 4: 9}[stage]
        sp = L()
        for x, y in sorted(holes, key=lambda p: p[1]):
            hh = hgt + (1 if y > 24 else 0)
            for k in range(hh):
                w = 1 if k < hh - 2 else 0
                for dx in range(0, 2 if w else 1):
                    c = STEEL[2] if dx == 0 else STEEL[1]
                    if k == hh - 1:
                        c = STEEL[3]
                    sp.px(x + dx, y - k, c)
            sp.px(x + 1, y, STEEL[0])
        sp_a = outline(sp.a, OL)
        a = over(a, sp_a)
        if glint:
            gl = L()
            gx, gy = 16, 21 - hgt
            for d in (-2, -1, 1, 2):
                gl.px(gx + d, gy, hx('#ffffff')); gl.px(gx, gy + d, hx('#ffffff'))
            a = over(a, gl.a)
        if stage == 4:
            # blood tips
            for x, y in holes[:3]:
                a[max(0, y - hgt), x] = hx('#a01a2a')
    return a


# ------------------------------------------------------------------ BRAMBLE (grassland bind)
VINE = ramp('#1e3a14', '#3a6a22', '#6aa83a')


def bramble_frame(i, n=4, snare=0.0):
    l = L()
    base = L()
    ground_ellipse(base, 12, 4, [hx('#2a3a16'), hx('#3e5a20'), hx('#4e6e2a')])
    ph = i / n * 2 * math.pi
    vines = [(6, 26, -1), (11, 27, 1), (16, 26, -1), (21, 27, 1), (26, 26, -1)]
    for j, (x0, y0, d) in enumerate(vines):
        hgt = 9 + (j % 2) * 3 + snare * 8
        pts = []
        for k in range(int(hgt)):
            u = k / hgt
            x = x0 + math.sin(u * 3.2 + ph + j) * (1.8 - snare) * d + snare * (16 - x0) * u * 0.6
            pts.append((x, y0 - k))
        for p, q in zip(pts[:-1], pts[1:]):
            l.seg(p, q, 2, VINE, True)
        for k in range(2, len(pts), 3):  # thorns
            x, y = pts[k]
            l.px(x + 1.5 * d, y, hx('#d8c890')); l.px(x - 1.5 * d, y - 1, hx('#d8c890'))
        if j in (1, 3) and snare < 0.5:  # small red berries / buds
            x, y = pts[-1]
            l.px(x, y - 1, hx('#c8303a'))
    return blend_over(fin(base.a), fin(l.a))


# ------------------------------------------------------------------ POISON FOG
def fog_frame(i, n=6):
    a = np.zeros((T, T, 4), np.uint8)
    ph = i / n * 2 * math.pi
    blobs = [(10, 20, 6), (17, 17, 7), (23, 21, 6), (14, 24, 6), (21, 25, 5), (16, 12, 4)]
    cols = [hx('#2a6a2a'), hx('#4aa83a'), hx('#8af05a'), hx('#d8ffb0')]
    for j, (x, y, r) in enumerate(blobs):
        x2 = x + math.cos(ph + j) * 1.5; y2 = y + math.sin(ph + j * 1.3) * 1.0 - (j == 5) * (i % 3)
        g = glow(T, T, (x2, y2), r, cols[1], 0.55)
        a = blend_over(a, g)
    l = L()
    for j in range(5):  # bubbles / skull motes
        x = 8 + (j * 5 + i) % 18; y = 26 - ((i * 2 + j * 4) % 16)
        l.px(x, y, cols[3] if j % 2 else cols[2])
    return blend_over(a, l.a)


# ------------------------------------------------------------------ COLLAPSE
def collapse_frame(stage, dungeon=False, crumble=0):
    l = L()
    if dungeon:
        top = ramp('#24222e', '#33303f', '#4a4566')
    else:
        top = ramp('#5a3e22', '#8a6a3e', '#b0905a')
    crack = hx('#0a0810')
    if stage == 2:
        # pit with glowing depth
        rim = L(); ground_ellipse(rim, 13, 5.5, top)
        pit = L(); ground_ellipse(pit, 10, 4, [hx('#0a0810'), hx('#0a0810'), hx('#1a0c10')], shade=False)
        a = blend_over(fin(rim.a), pit.a)
        a = blend_over(a, glow(T, T, (16, CY + 1), 8, hx('#ff4a2a'), 0.4))
        for x in (9, 14, 19, 23):
            a[CY - 3 + (x % 2), x] = hx('#6a4a2e') if not dungeon else hx('#4a4566')
        return a
    lay = L(); ground_ellipse(lay, 13, 5.5, top)
    a = fin(lay.a, ol=False)
    cl = L()
    segs = [((5, 24), (10, 23)), ((10, 23), (14, 25)), ((14, 25), (19, 22)), ((19, 22), (25, 24)), ((14, 25), (13, 28))]
    if stage >= 1:
        segs += [((10, 23), (9, 20)), ((19, 22), (21, 27)), ((16, 20), (19, 22)), ((25, 24), (27, 22))]
    for p, q in segs:
        cl.line(p, q, crack)
    if stage >= 1:
        for x, y in ((12, 24), (20, 24), (16, 26)):
            cl.px(x, y, hx('#ff6a3a'))
    a = over(a, cl.a)
    if crumble:
        dl = L()
        for j in range(6):
            dl.ellipse(8 + j * 3.2, CY - 2 + crumble * 2 + (j % 2), 1.3, 1.1, top, True)
        a = over(a, fin(dl.a))
    if stage >= 1:
        a = blend_over(a, glow(T, T, (16, CY), 10, hx('#ff6a3a'), 0.18))
    return a


# ------------------------------------------------------------------ ICE
def ice_frame(i, n=4):
    l = L()
    ground_ellipse(l, 13, 5.5, [hx('#3a6a9a'), hx('#7ab8e0'), hx('#c8ecff')])
    for p, q in (((7, 24), (12, 22)), ((18, 25), (24, 23)), ((13, 27), (16, 26))):
        l.line(p, q, hx('#e8f8ff'))
    a = fin(l.a)
    sx = 6 + i * 6
    sl = L()
    for k in range(4):
        sl.px(sx + k, 21 + k // 2, hx('#ffffff'))
    a = over(a, sl.a)
    # frost crystals on the rim
    fr = L()
    for x, y in ((6, 22), (25, 21), (10, 27), (22, 27)):
        fr.px(x, y, hx('#ffffff')); fr.px(x - 1, y + 1, hx('#c8ecff')); fr.px(x + 1, y + 1, hx('#c8ecff'))
    a = over(a, fr.a)
    if i == n // 2:
        g = L(); g.px(20, CY - 4, hx('#ffffff')); g.px(19, CY - 3, hx('#ffffff')); g.px(21, CY - 3, hx('#ffffff')); g.px(20, CY - 2, hx('#ffffff'))
        a = over(a, g.a)
    return a


# ------------------------------------------------------------------ STATUS ICONS 10×10
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
    d = os.path.join(outdir, 'terrain', 'hazards')
    os.makedirs(d, exist_ok=True)
    sheets = {
        'rock-meadow': [boulder(True, 0), boulder(True, 1), boulder(True, 2)] + rock_break(True),
        'rock-pillar': [boulder(False, 0, True), boulder(False, 1, True), boulder(False, 2, True)] + rock_break(False, True),
        'fire': [fire_frame(i) for i in range(6)],
        'fire-ignite': [fire_frame(0, strength=0.25), fire_frame(1, strength=0.55), fire_frame(2, strength=0.85)],
        'spikes': [spike_frame(0), spike_frame(1), spike_frame(2), spike_frame(3), spike_frame(4), spike_frame(4, True)],
        'bramble': [bramble_frame(i) for i in range(4)] + [bramble_frame(0, snare=s) for s in (0.35, 0.7, 1.0)],
        'fog': [fog_frame(i) for i in range(6)],
        'collapse-meadow': [collapse_frame(0), collapse_frame(1), collapse_frame(1, crumble=1), collapse_frame(1, crumble=2), collapse_frame(2)],
        'collapse-dungeon': [collapse_frame(0, True), collapse_frame(1, True), collapse_frame(1, True, 1), collapse_frame(1, True, 2), collapse_frame(2, True)],
        'ice': [ice_frame(i) for i in range(4)],
    }
    for k, fr in sheets.items():
        Image.fromarray(np.concatenate(fr, 1)).save(os.path.join(d, f'{k}.png'))
    sd = os.path.join(outdir, 'ui', 'status')
    os.makedirs(sd, exist_ok=True)
    icons = {}
    for k, art in STATUS.items():
        a = np.pad(sprite(art, SPAL), ((1, 1), (1, 1), (0, 0)))
        a = outline(a, OL)
        Image.fromarray(a).save(os.path.join(sd, f'{k}.png'))
        icons[k] = a
    return sheets, icons


if __name__ == '__main__':
    from pix import preview
    sheets, icons = build('out')
    rows = list(sheets.values())
    preview(rows, 'prev_hazards.png', scale=6, bg=(60, 70, 52, 255))
    pad = [np.pad(a, ((0, 32 - a.shape[0]), (0, 32 - a.shape[1]), (0, 0))) for a in icons.values()]
    preview([pad], 'prev_status.png', scale=6)
