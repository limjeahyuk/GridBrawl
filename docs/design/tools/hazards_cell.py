"""One-cell hazard tiles — fitted to the real board cell (≈184×58 px on screen).
Frame 46×24 at ×4 = 184×96. Rows 9..23 (15 px → 60 px) are the cell itself; rows 0..8 are the
only head-room a standing object may use (≤ 36 px ≈ half a row above its own cell).
Every tile paints its own cell floor + a coloured rim so the affected cell is never ambiguous."""
import math, os
import numpy as np
from PIL import Image, ImageDraw
from pix import hx, ramp, Layer, outline, blend_over, over
from rig import glow

W, H = 46, 24
TOP = 9            # first row of the cell
CB = H - 1         # last row of the cell
CXc = W / 2 - 0.5
CYc = (TOP + CB) / 2
OL = hx('#141018')


def L():
    return Layer(W, H)


def cell_mask(inset=0):
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).rounded_rectangle([inset, TOP + inset, W - 1 - inset, CB - inset], radius=3, fill=255)
    return np.array(im) > 0


def floor(base, rim, inner=None, alpha_k=1.0):
    """cell floor with a 1px coloured rim."""
    a = np.zeros((H, W, 4), np.uint8)
    m = cell_mask(0)
    a[m] = hx(base)
    edge = m & ~cell_mask(1)
    a[edge] = hx(rim)
    if inner:
        e2 = cell_mask(1) & ~cell_mask(2)
        a[e2] = hx(inner)
    if alpha_k < 1:
        a[..., 3] = (a[..., 3] * alpha_k).astype(np.uint8)
    return a


def alpha(a, k):
    a = a.copy(); a[..., 3] = (a[..., 3].astype(float) * k).astype(np.uint8); return a


def clip_cell(a, head=False):
    """keep only the cell (and optionally the head-room) — nothing spills sideways."""
    a = a.copy()
    if not head:
        a[~cell_mask(0)] = 0
    return a


# ------------------------------------------------------------------ rock / pillar
def rock(wear=0, pillar=False, moss=True):
    base = floor('#2a2a30', '#8a8c98', alpha_k=0.55)
    l = L()
    if pillar:
        st = ramp('#2c2a3a', '#545070', '#8a86a8')
        pts = [(15, 20), (14, 9), (16, 3), (20, 1), (26, 1), (30, 3), (32, 9), (31, 20)]
        l.poly(pts, st, True, light='left')
        for y in (7, 13):
            l.line((15, y), (31, y), hx('#2c2a3a')); l.line((15, y + 1), (31, y + 1), hx('#8a86a8'))
        l.px(22, 10, hx('#5ef0ff')); l.px(23, 10, hx('#5ef0ff'))
    else:
        st = ramp('#3a3a44', '#6a6c78', '#a2a6b2')
        pts = [(9, 20), (8, 14), (12, 7), (18, 3), (28, 3), (34, 7), (38, 14), (37, 20)]
        l.poly(pts, st, True, light='left')
        l.line((17, 7), (23, 6), hx('#c8ccd6')); l.line((27, 16), (33, 14), hx('#3a3a44'))
        if moss:
            for x in range(13, 22):
                l.px(x, 7 - (x - 13) // 3, hx('#5a9a3a'))
            l.px(15, 6, hx('#8acb50')); l.px(18, 5, hx('#8acb50'))
    c = hx('#141018')
    if wear >= 1:
        for p, q in (((23, 3), (21, 9)), ((21, 9), (25, 14)), ((25, 14), (23, 20))):
            l.line(p, q, c)
    if wear >= 2:
        for p, q in (((34, 8), (29, 11)), ((29, 11), (31, 17)), ((12, 12), (17, 15))):
            l.line(p, q, c)
    sh = L(); sh.ellipse(23, 20, 14, 2.5, [hx('#000000')] * 3, False)
    a = blend_over(base, alpha(sh.a, 0.4))
    a = blend_over(a, outline(l.a, OL))
    if wear >= 2:
        a = blend_over(glow(W, H, (23, 11), 16, hx('#ff6a3a'), 0.3), a)
    return a


def rock_break(pillar=False):
    out = []
    st = ramp('#2c2a3a', '#545070', '#8a86a8') if pillar else ramp('#3a3a44', '#6a6c78', '#a2a6b2')
    for k in range(1, 4):
        a = floor('#2a2a30', '#8a8c98', alpha_k=0.55 * (1 - k / 4))
        l = L()
        for i, dx in enumerate((-10, -5, 0, 5, 10, -2)):
            x = 23 + dx * (1 + k * 0.25); y = 12 + k * 2.5 + (i % 2) * 2
            if y < CB:
                l.ellipse(x, y, 2.2 - k * 0.4, 1.8 - k * 0.3, st, True)
        out.append(blend_over(a, outline(l.a, OL)))
    return out


# ------------------------------------------------------------------ fire
FL = [hx('#8a1a08'), hx('#ff5a1a'), hx('#ffc04a'), hx('#fff4c0')]


def fire(i, n=6, s=1.0):
    a = floor('#2a140e', '#ff7a2a', '#5a2414')
    l = L()
    for x, y in ((6, 20), (14, 21), (31, 20), (39, 21), (22, 22)):
        l.px(x, y, FL[1] if (x + i) % 3 else FL[0])
    ph = i / n * 2 * math.pi
    for j, bx in enumerate((8, 15, 23, 31, 38)):
        h = (9 if j in (1, 3) else 13 if j == 2 else 7) * s
        hh = h * (0.8 + 0.2 * math.sin(ph + j * 1.7))
        w0 = 3 if j == 2 else 2.5
        for k in range(int(hh)):
            u = k / hh
            w = max(0.5, w0 * (1 - u ** 1.3))
            sway = math.sin(ph + k * 0.5 + j) * u * 1.3
            for dx in np.arange(-w, w + 0.01, 1):
                d = abs(dx) / max(w, 0.5)
                c = FL[3] if (d < 0.35 and u < 0.5) else FL[2] if d < 0.7 and u < 0.8 else FL[1] if u < 0.93 else FL[0]
                l.px(bx + dx + sway, 19 - k, c)
    a = blend_over(a, glow(W, H, (23, 15), 14, hx('#ff8a3a'), 0.25 * s))
    return blend_over(a, l.a)


# ------------------------------------------------------------------ spikes
ST = [hx('#3a4252'), hx('#7a8496'), hx('#c6ccd4'), hx('#ffffff')]
HOLES = [(7, 13), (15, 13), (23, 13), (31, 13), (39, 13), (11, 19), (19, 19), (27, 19), (35, 19)]


def spikes(stage, glint=False):
    a = floor('#26242f', '#ff4a3a' if stage >= 1 else '#7a8496', '#3e3a4c')
    hl = L()
    for x, y in HOLES:
        c = hx('#ff3a2a') if stage == 1 else hx('#0a0810')
        hl.px(x, y, c); hl.px(x + 1, y, c)
    a = over(a, hl.a)
    if stage == 1:
        a = blend_over(a, alpha(glow(W, H, (23, 16), 18, hx('#ff3a2a'), 0.35), 1))
    if stage >= 2:
        hgt = {2: 2, 3: 4, 4: 6}[stage]
        sp = L()
        for x, y in HOLES:
            for k in range(hgt):
                sp.px(x, y - k, ST[3] if k == hgt - 1 else ST[2])
                if k < hgt - 1:
                    sp.px(x + 1, y - k, ST[1])
        a = over(a, outline(sp.a, OL))
        if glint:
            g = L(); gx, gy = 23, 13 - hgt
            for d in (-2, -1, 1, 2):
                g.px(gx + d, gy, hx('#ffffff')); g.px(gx, gy + d, hx('#ffffff'))
            a = over(a, g.a)
    return a


# ------------------------------------------------------------------ bramble
VN = ramp('#1e3a14', '#3a6a22', '#6aa83a')


def bramble(i, n=4, snare=0.0):
    a = floor('#24361a', '#6ab83a', '#30461e')
    l = L()
    ph = i / n * 2 * math.pi
    for j, x0 in enumerate((5, 11, 17, 23, 29, 35, 41)):
        y0 = 21 if j % 2 else 19
        hgt = 7 + (j % 3) * 1.5 + snare * 6
        d = -1 if j % 2 else 1
        pts = [(x0 + math.sin(k / hgt * 3 + ph + j) * (1.3 - snare) * d + snare * (23 - x0) * (k / hgt) * 0.35, y0 - k) for k in range(int(hgt))]
        for p, q in zip(pts[:-1], pts[1:]):
            l.seg(p, q, 2, VN, True)
        for k in range(2, len(pts), 3):
            x, y = pts[k]
            l.px(x + 1.5 * d, y, hx('#d8c890'))
        if j in (2, 5) and snare < 0.5:
            l.px(pts[-1][0], pts[-1][1] - 1, hx('#c8303a'))
    return blend_over(a, outline(l.a, OL))


# ------------------------------------------------------------------ fog
def fog(i, n=6):
    a = floor('#1a2a16', '#4aa83a', alpha_k=0.6)
    ph = i / n * 2 * math.pi
    g = np.zeros((H, W, 4), np.uint8)
    for j, (x, y, r) in enumerate(((9, 16, 7), (19, 14, 8), (29, 16, 8), (38, 15, 7), (15, 20, 6), (32, 20, 6))):
        g = blend_over(g, glow(W, H, (x + math.cos(ph + j) * 1.5, y + math.sin(ph + j) * 1), r, hx('#4aa83a'), 0.55))
    g = clip_cell(g)
    # a little wisp above the cell
    g = blend_over(g, glow(W, H, (23 + math.sin(ph) * 3, TOP - 1), 4, hx('#4aa83a'), 0.35))
    l = L()
    for j in range(5):
        l.px(6 + (j * 9 + i * 2) % 34, CB - 2 - ((i * 2 + j * 3) % 10), hx('#d8ffb0') if j % 2 else hx('#8af05a'))
    return blend_over(blend_over(a, g), l.a)


# ------------------------------------------------------------------ collapse
def collapse(stage, dungeon=False, crumble=0):
    base, rim = ('#33303f', '#ff6a3a') if dungeon else ('#7a5a32', '#ff6a3a')
    if stage == 0:
        rim = '#c8905a' if not dungeon else '#6a6488'
    a = floor(base, rim)
    l = L()
    segs = [((3, 15), (10, 14)), ((10, 14), (17, 17)), ((17, 17), (26, 13)), ((26, 13), (34, 16)), ((34, 16), (42, 14)), ((17, 17), (16, 21))]
    if stage >= 1:
        segs += [((10, 14), (9, 11)), ((26, 13), (28, 20)), ((34, 16), (36, 11)), ((22, 11), (26, 13))]
    for p, q in segs:
        l.line(p, q, hx('#0a0810'))
    if stage >= 1:
        for x, y in ((13, 15), (24, 15), (31, 15)):
            l.px(x, y, hx('#ff6a3a'))
    a = over(a, l.a)
    if crumble:
        dl = L()
        for j in range(7):
            dl.ellipse(7 + j * 5.2, 13 + crumble * 2 + (j % 2), 1.6, 1.2, ramp(base, base, rim if stage else base), True)
        a = over(a, outline(dl.a, OL))
    if stage == 2:
        pit = cell_mask(3)
        a[pit] = hx('#0a0810')
        a = blend_over(a, clip_cell(glow(W, H, (23, CB - 3), 12, hx('#ff4a2a'), 0.45)))
    elif stage == 1:
        a = blend_over(a, clip_cell(glow(W, H, (23, 16), 16, hx('#ff6a3a'), 0.2)))
    return a


# ------------------------------------------------------------------ ice
def ice(i, n=4):
    a = floor('#7ab8e0', '#e8f8ff', '#a8d8f8')
    l = L()
    for p, q in (((6, 15), (14, 13)), ((26, 19), (36, 16)), ((18, 21), (23, 19))):
        l.line(p, q, hx('#e8f8ff'))
    sx = 4 + i * 10
    for k in range(5):
        l.px(sx + k, 12 + k // 2, hx('#ffffff'))
    a = over(a, l.a)
    for x, y in ((5, 11), (40, 12), (9, 21), (37, 21)):
        a[y, x] = hx('#ffffff')
    return a


def sheets():
    return {
        'rock-meadow': [rock(0), rock(1), rock(2)] + rock_break(),
        'rock-pillar': [rock(0, True), rock(1, True), rock(2, True)] + rock_break(True),
        'fire': [fire(i) for i in range(6)],
        'spikes': [spikes(0), spikes(1), spikes(2), spikes(3), spikes(4), spikes(4, True)],
        'bramble': [bramble(i) for i in range(4)] + [bramble(0, snare=s) for s in (0.35, 0.7, 1.0)],
        'fog': [fog(i) for i in range(6)],
        'collapse-meadow': [collapse(0), collapse(1), collapse(1, crumble=1), collapse(1, crumble=2), collapse(2)],
        'collapse-dungeon': [collapse(0, True), collapse(1, True), collapse(1, True, 1), collapse(1, True, 2), collapse(2, True)],
        'ice': [ice(i) for i in range(4)],
    }


def build(outdir):
    d = os.path.join(outdir, 'terrain', 'hazards-cell')
    os.makedirs(d, exist_ok=True)
    s = sheets()
    for k, fr in s.items():
        Image.fromarray(np.concatenate(fr, 1)).save(os.path.join(d, f'{k}.png'))
    return s


if __name__ == '__main__':
    from pix import preview
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else 'out'   # -> <out>/terrain/hazards-cell/*.png
    s = build(out)
    preview(list(s.values()), os.path.join(out, 'prev_hzcell.png'), scale=5, bg=(52, 60, 46, 255))
