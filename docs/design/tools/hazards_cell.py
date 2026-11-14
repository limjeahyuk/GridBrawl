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


def fire(i, n=6, s=1.0, only=False):
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
    if only:
        return l.a
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


# ================================================================== 2026-11-15 함정 재설계(HAZARDS.md)
# 용암 · 균열 3단계 → 구멍 · 빙판 깨짐 · 덩굴 → 화염 · 화염 꺼짐 · 위험 칸

LV = [hx('#2a0a06'), hx('#7a1a0a'), hx('#e0401a'), hx('#ff9a2a'), hx('#ffe08a')]


def lava(i, n=6):
    """용암 — 검게 굳은 껍질 사이로 끓는 용암. 사라지지 않는다."""
    a = floor('#3a120a', '#ff3a1a', '#5a1a0c')
    m = cell_mask(2)
    ph = i / n * 2 * math.pi
    yy, xx = np.mgrid[0:H, 0:W]
    # molten pool field
    f = (np.sin(xx * 0.45 + ph) + np.sin(yy * 0.9 - ph * 0.7 + xx * 0.15) + np.sin((xx + yy) * 0.3 + ph * 1.3)) / 3
    col = np.zeros((H, W, 4), np.uint8)
    col[f > 0.35] = LV[4]
    col[(f > 0.05) & (f <= 0.35)] = LV[3]
    col[(f > -0.3) & (f <= 0.05)] = LV[2]
    col[f <= -0.3] = LV[1]
    col[~m] = 0
    a = over(a, col)
    # crust plates (dark, fixed)
    cr = L()
    for (x, y, rx, ry) in ((9, 14, 4, 2), (31, 13, 5, 2), (20, 20, 4, 1.6), (39, 19, 3, 1.5), (5, 20, 2.5, 1.4)):
        cr.ellipse(x, y, rx, ry, [hx('#140806'), hx('#2a0f08'), hx('#4a1c10')], True)
    a = over(a, cr.a)
    # bubble
    bx = 14 + (i * 7) % 22
    k = i % 3
    if k < 2:
        a[min(CB - 2, 17 - k), bx] = LV[4]
        a[min(CB - 2, 17 - k), bx + 1] = LV[3]
    a = blend_over(a, clip_cell(glow(W, H, (23, 16), 16, hx('#ff6a1a'), 0.22), True))
    # heat shimmer above
    a = blend_over(a, glow(W, H, (23 + math.sin(ph) * 2, TOP - 2), 5, hx('#ff8a3a'), 0.18))
    return a


def crack(stage, dungeon=False, crumble=0):
    """붕괴 지형 — stage 1·2·3(밟을수록 커진다), crumble 1·2 = 무너지는 중."""
    base, rim = ('#33303f', '#6a6488') if dungeon else ('#7a5a32', '#c8905a')
    if stage >= 2:
        rim = '#ffa24a'
    if stage >= 3:
        rim = '#ff6a3a'
    a = floor(base, rim)
    l = L()
    dark = hx('#0a0810')
    segs = [((14, 15), (20, 16)), ((20, 16), (26, 14)), ((26, 14), (31, 16))]
    if stage >= 2:
        segs += [((6, 14), (14, 15)), ((31, 16), (39, 14)), ((20, 16), (19, 20)), ((26, 14), (27, 11))]
    if stage >= 3:
        segs += [((3, 17), (6, 14)), ((39, 14), (43, 17)), ((10, 15), (9, 21)), ((34, 15), (36, 21)), ((19, 20), (23, 22)), ((14, 15), (13, 11))]
    for p, q in segs:
        l.line(p, q, dark)
        if stage >= 2:
            l.line((p[0], p[1] + 1), (q[0], q[1] + 1), hx('#2a1a10') if not dungeon else hx('#1a1626'))
    a = over(a, l.a)
    if stage >= 3:
        for x, y in ((17, 16), (24, 15), (33, 16), (11, 17)):
            a[y, x] = hx('#ff6a3a')
        a = blend_over(a, clip_cell(glow(W, H, (23, 16), 14, hx('#ff6a3a'), 0.22)))
    # pebbles on stage 2+
    if stage >= 2:
        pl = L()
        light = '#a8805a' if not dungeon else '#6a6488'
        for (x, y) in ((8, 19), (37, 12), (29, 21)) if stage == 2 else ((8, 19), (37, 12), (29, 21), (15, 12), (41, 20)):
            pl.px(x, y, hx(light)); pl.px(x + 1, y, hx(light)); pl.px(x, y + 1, dark); pl.px(x + 1, y + 1, dark)
        a = over(a, pl.a)
    if crumble:
        pit = cell_mask(3 + (2 - crumble) * 3)
        a[pit] = hx('#0a0810')
        dl = L()
        chunk = [hx('#2a1a10' if not dungeon else '#1a1626'), hx(base), hx('#a8805a' if not dungeon else '#6a6488')]
        for j in range(5):
            x = 9 + j * 7 + (j % 2); y = 12 + crumble * 3 + (j % 2) * 2
            for dx, dy, c in ((0, 0, 2), (1, 0, 1), (0, 1, 1), (1, 1, 0), (2, 1, 0)):
                dl.px(x + dx, y + dy, chunk[c])
        a = over(a, dl.a)
    return a


def hole(dungeon=False, t=0):
    """구멍 — 멈추면 빠진다(피해 50). 가장자리 흙/판석 + 깊이."""
    base, rim = ('#33303f', '#8a86a8') if dungeon else ('#7a5a32', '#c8905a')
    a = floor(base, rim)
    for k, c in enumerate(('#2a1a10' if not dungeon else '#1a1626', '#140c08' if not dungeon else '#0e0c16', '#050306')):
        m = cell_mask(2 + k)
        a[m] = hx(c)
    # lip highlight on the far (top) edge, shadow on the near edge
    top = cell_mask(2) & ~cell_mask(3)
    ys, xs = np.nonzero(top)
    for y, x in zip(ys, xs):
        if y < CYc:
            a[y, x] = hx('#a8805a' if not dungeon else '#6a6488')
    # dust motes falling in
    for j in range(3):
        y = 12 + (t * 2 + j * 4) % 9
        a[y, 14 + j * 8] = hx('#c8a878' if not dungeon else '#8a86a8')
    return a


def ice_break(k):
    """빙판 넘어짐 — 금 → 산산조각 → 사라짐(k = 1..4)."""
    if k >= 4:
        return np.zeros((H, W, 4), np.uint8)
    a = ice(0)
    l = L()
    w = hx('#ffffff'); d = hx('#3a6a98')
    for p, q in (((23, 12), (18, 17)), ((18, 17), (12, 16)), ((23, 12), (30, 15)), ((30, 15), (35, 21)), ((18, 17), (21, 22))):
        l.line(p, q, d)
    a = over(a, l.a)
    if k >= 2:
        a = alpha(a, 0.75 if k == 2 else 0.35)
        sh = L()
        for j, (x, y) in enumerate(((12, 14), (19, 12), (27, 13), (34, 15), (16, 20), (30, 20))):
            dy = -(k - 1) * (2 + j % 2)
            sh.px(x + (j - 2.5) * (k - 1), y + dy, w); sh.px(x + 1 + (j - 2.5) * (k - 1), y + dy, hx('#bfefff'))
        a = blend_over(a, sh.a)
    return a


def vine_burn(k):
    """덩굴 → 화염(다음 라운드): 0 불씨 · 1 덩굴에 불 · 2 타오름 · 3 화염 지형."""
    if k == 3:
        return fire(0)
    v = bramble(0)
    if k >= 1:
        v = v.copy()
        dark = np.array([0.75, 0.5][k - 1])
        v[..., :3] = (v[..., :3] * dark).astype(np.uint8)
    e = L()
    for x, y in ((11, 13), (24, 11), (35, 12), (17, 15), (30, 14)):
        e.px(x, y, FL[2]); e.px(x, y - 1, FL[1]); e.px(x + 1, y, FL[1])
    out = blend_over(v, blend_over(clip_cell(glow(W, H, (23, 15), 14, hx('#ff8a3a'), 0.2 + 0.15 * k), True), e.a))
    if k >= 1:
        out = blend_over(out, fire(k, s=[0, 0.45, 0.8][k], only=True))
    return out


def fire_out(k):
    """화염 꺼짐(9턴 뒤) — 작아지다 연기 · 그을음만 남고 사라짐(k = 0..3)."""
    if k >= 3:
        a = floor('#2a140e', '#5a2414', alpha_k=0.35)
        l = L()
        for x, y in ((12, 17), (22, 19), (33, 16)):
            l.px(x, y, hx('#1a0a06'))
        return over(a, l.a)
    a = fire(k, s=[0.6, 0.3, 0.1][k])
    sm = glow(W, H, (23 + k * 2, TOP - 1 - k * 2), 4 + k, hx('#6a6478'), 0.25)
    return blend_over(alpha(a, [1, 0.8, 0.55][k]), sm)


def danger(i):
    """위험 칸(추후 카드용) — 반투명 빨강 + 깜빡이는 테두리. 실제 게임은 CSS로도 된다."""
    a = floor('#ff2a2a', '#ff4a3a' if i == 0 else '#ffd0c0', alpha_k=0.42)
    l = L()
    for k in range(-H, W, 6):
        for t in range(H):
            x = k + t
            if 0 <= x < W and cell_mask(2)[t, x]:
                l.px(x, t, hx('#ff6a5a'))
    a = blend_over(a, alpha(l.a, 0.35 if i == 0 else 0.55))
    # ! mark
    mk = L()
    for y in range(12, 18):
        mk.px(22, y, hx('#ffffff')); mk.px(23, y, hx('#ffffff'))
    mk.px(22, 20, hx('#ffffff')); mk.px(23, 20, hx('#ffffff'))
    return blend_over(a, outline(mk.a, hx('#7a0a10')))


def sheets_v2():
    """2026-11-15 재설계 세트 — 가시덫 · 가장자리 붕괴는 뺐다."""
    return {
        'rock-meadow': [rock(0), rock(1), rock(2)] + rock_break(),
        'rock-pillar': [rock(0, True), rock(1, True), rock(2, True)] + rock_break(True),
        'bramble': [bramble(i) for i in range(4)] + [bramble(0, snare=s) for s in (0.35, 0.7, 1.0)],
        'vine-burn': [vine_burn(k) for k in range(4)],
        'fire': [fire(i) for i in range(6)],
        'fire-ignite': [fire(0, s=0.25), fire(1, s=0.55), fire(2, s=0.85)],
        'fire-out': [fire_out(k) for k in range(4)],
        'lava': [lava(i) for i in range(6)],
        'crack-meadow': [crack(1), crack(2), crack(3), crack(3, crumble=1), crack(3, crumble=2), hole()],
        'crack-dungeon': [crack(1, True), crack(2, True), crack(3, True), crack(3, True, 1), crack(3, True, 2), hole(True)],
        'hole-meadow': [hole(False, t) for t in range(4)],
        'hole-dungeon': [hole(True, t) for t in range(4)],
        'ice': [ice(i) for i in range(4)],
        'ice-break': [ice_break(k) for k in range(1, 5)],
        'fog': [fog(i) for i in range(6)],
        'danger': [danger(0), danger(1)],
    }


def build(outdir, v2=True):
    d = os.path.join(outdir, 'terrain', 'hazards-cell')
    os.makedirs(d, exist_ok=True)
    s = sheets_v2() if v2 else sheets()
    for k, fr in s.items():
        Image.fromarray(np.concatenate(fr, 1)).save(os.path.join(d, f'{k}.png'))
    return s


if __name__ == '__main__':
    from pix import preview
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else 'out'   # -> <out>/terrain/hazards-cell/*.png
    s = build(out)
    preview(list(s.values()), os.path.join(out, 'prev_hzcell.png'), scale=5, bg=(52, 60, 46, 255))
