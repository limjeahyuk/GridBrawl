"""Bosses: Warden (수호기사), Pyrelord (화염군주), Overlord (오버로드)."""
from brute import *


def local(J):
    hp, t = J['hip'], math.radians(J['t'])
    def T(x, y):
        return (hp[0] + x * math.cos(t) - y * math.sin(t), hp[1] + x * math.sin(t) + y * math.cos(t))
    return T


def make_blade(length, pal_rows):
    """build a vertical blade sprite from a row template list (top→bottom)."""
    return pal_rows


# ================================================================== WARDEN
WP = dict(O='#141018', K='#120f18', k='#2a2636', j='#454057', J='#6e6886', L='#9a94b4',
          g='#c9952f', G='#7a5418', y='#f4d470', r='#ff4a3a', R='#8a1020', h='#e0d4b6', H='#8a7a5a')
WHEAD = sprite('''
hh..............
.hH.............
..hH............
..HhH...........
...HhkkkkJ......
...kkjjjjJJk....
..kkjjjjjjjJk...
.kkjjjjjjjjjJk..
.kjjjjgggggggk..
.kjjjjkKKKrrrK..
.kjjjjjkkkkkkk..
.kkjjjjjkRrkJk..
..kkjjjjjjjjk...
...kkgyyyyggk...
....KKkkkkkK....
''', WP)
WHEAD_PV = (7, 14)


def greatsword():
    rows = ['...L...', '..LJj..', '..LJj..']
    for i in range(30):
        rune = 'r' if i % 6 == 2 else 'J'
        rows.append('.LJ' + rune + 'jk.')
    rows += ['GgyyygG', 'gGggyGg', '..KkK..', '..kjk..', '..KkK..', '..kjk..', '..KkK..', '..gyg..', '..GgG..']
    return sprite('\n'.join(rows), WP), (3, len(rows) - 6)


WSWORD, WSWORD_PV = greatsword()
WSTEEL = ramp('#120f18', '#2a2636', '#454057')
WSTEEL_L = ramp('#1a1622', '#454057', '#6e6886')
WCAPE = ramp('#3a0a14', '#6a1424', '#9a2a3a')


def warden_torso(l, J, p):
    T = local(J)
    plate = [T(-10, -26), T(-4, -29), T(8, -28), T(13, -22), T(12, -12), T(8, -5), T(-8, -5), T(-11, -14)]
    l.poly(plate, WSTEEL_L, True, light='left')
    # gold trim + sigil
    for a, b in (((-3, -28), (10, -26)), ((-8, -6), (8, -6))):
        l.line(T(*a), T(*b), hx('#c9952f'))
    c = T(4, -18)
    l.line((c[0], c[1] - 4), (c[0], c[1] + 4), hx('#ff4a3a')); l.line((c[0] - 3, c[1] - 1), (c[0] + 3, c[1] - 1), hx('#ff4a3a'))
    l.px(c[0], c[1] - 1, hx('#ffd0a0'))
    # waist + tassets
    l.poly([T(-9, -6), T(9, -6), T(8, -1), T(-8, -1)], WSTEEL, True)
    for x0 in (-8, -2, 4):
        l.poly([T(x0, -1), T(x0 + 6, -1), T(x0 + 5, 7), T(x0 + 1, 7)], WSTEEL_L, True)
        l.line(T(x0 + 1, 6), T(x0 + 5, 6), hx('#c9952f'))


def warden_pauldron(l, J, p):
    s = J['nsho']
    l.ellipse(s[0], s[1] + 1, 7, 5, WSTEEL_L, True)
    l.line((s[0] - 6, s[1] + 4), (s[0] + 6, s[1] + 4), hx('#c9952f'))
    for i in range(3):  # spikes
        l.seg((s[0] - 3 + i * 3, s[1] - 3), (s[0] - 4 + i * 3, s[1] - 7 + (i == 1)), 2, ramp('#8a7a5a', '#c8bc9a', '#e0d4b6'), False)


def warden_cape(l, J, p):
    nk, hp = J['neck'], J['hip']
    wv = p.get('wind', 0.8); ph = p.get('ph', 0) * 6.28
    hem = []
    for i in range(8):
        u = i / 7
        x = (hp[0] - 14 - 5 * wv) * (1 - u) + (hp[0] - 2) * u
        y = hp[1] + 22 + (3 if i % 2 else 0) + math.sin(ph + u * 4) * 1.5 * wv - (1 - u) * 4 * wv
        hem.append((x, y))
    pts = [(nk[0] - 2, nk[1] + 2), (nk[0] - 6, nk[1] + 2), (nk[0] - 10 - 3 * wv, nk[1] + 12)] + hem + [(hp[0], hp[1] + 4), (nk[0] + 1, nk[1] + 5)]
    l.poly(pts, WCAPE, True, light='left')


def warden_rig():
    cos = dict(thigh=WSTEEL, shin=WSTEEL_L, boot=WSTEEL, ua=WSTEEL, fa=WSTEEL_L, hand=WSTEEL_L,
               wt=7, ws=6, wu=6, wf=6, hand_r=3, boot_len=8,
               torso=warden_torso, head=(WHEAD, WHEAD_PV), weapon=(WSWORD, WSWORD_PV),
               shoulder=warden_pauldron, behind=warden_cape)
    return Brute(160, 112, 60, 110, dict(torso=27, shdrop=4, ua=12, fa=11, th=13, sh=13, shx=2, hipx=2), cos)


def warden_clips():
    r = warden_rig()
    lib = Lib(r, r.GY - 24, stance=5, slash=[hx('#8a1020'), hx('#ff6a5a'), hx('#ffe0d0')])
    # two-handed guard: both hands on the hilt
    lib.base.update(t=4, nh=lib.o(7, -6), fh=lib.o(6, -5), wa=25)
    o, g, b = lib.o, lib.g, lib.base
    def two(p):
        p['fh'] = (p['nh'][0] - 1, p['nh'][1] + 2)
        return p
    idle = [two(p) for p in lib.idle(6, amp=1)]
    run = [two(P(p, wa=50)) for p in lib.run(8, A=6, lift=3, lean=12)]
    sw = [two(p) for p in lib.swing(reach=15)]
    # attack2: blood-oath thrust with red shockwave
    def wave(x, a=255):
        def f(J):
            gl = glow(r.W, r.H, (x, r.GY - 22), 14, hx('#ff4a3a'), 0.6)
            l = Layer(r.W, r.H)
            for i in range(5):
                l.line((x - 10 + i * 3, r.GY - 22 - 10 + i), (x + 6 + i * 3, r.GY - 22), hx('#ff8a6a') if i % 2 else hx('#ffffff'))
                l.line((x - 10 + i * 3, r.GY - 22 + 10 - i), (x + 6 + i * 3, r.GY - 22), hx('#ff8a6a') if i % 2 else hx('#ffffff'))
            arr = blend_over(gl, l.a)
            arr[..., 3] = (arr[..., 3].astype(float) * a / 255).astype(np.uint8)
            return arr
        return f
    a2 = [two(P(b, t=-6, hip=o(-2, 1), nh=o(-3, -5), wa=95, nf=g(4), ff=g(-6))),
          two(P(b, t=-10, hip=o(-3, 2), nh=o(-6, -5), wa=90, nf=g(3), ff=g(-7))),
          two(P(b, t=20, hip=o(6, 2), nf=g(13), ff=g(-2), nh=o(15, -6), wa=90, fx=[wave(r.AX + 66)])),
          two(P(b, t=20, hip=o(6, 2), nf=g(13), ff=g(-2), nh=o(15, -6), wa=90, fx=[wave(r.AX + 74, 150)])),
          two(P(b, t=10, hip=o(3, 1), nf=g(8), nh=o(10, -5), wa=60)), two(P(b))]
    R_ = r.draw
    hurt = [two(p) for p in lib.hurt()]
    death = lib.death()
    return {'idle': ([R_(p) for p in idle], 140, True, None), 'run': ([R_(p) for p in run], 85, True, None),
            'attack1': ([R_(p) for p in sw], 75, False, 2), 'attack2': ([R_(p) for p in a2], 80, False, 2),
            'hurt': ([R_(p) for p in hurt], 100, False, None), 'death': (fade(death, 2), 110, False, None)}


# ================================================================== PYRELORD
BAS = ramp('#16100e', '#2e2220', '#4a3a34')
BAS_L = ramp('#1e1614', '#3e2e2a', '#5e4a42')
LAVA = [hx('#8a1a08'), hx('#ff5a1a'), hx('#ffc04a'), hx('#fff4c0')]
FP = dict(O='#141018', B='#16100e', b='#2e2220', c='#4a3a34', C='#5e4a42',
          r='#8a1a08', o='#ff5a1a', y='#ffc04a', w='#fff4c0', h='#3a2a24', H='#6a5446')
FHEAD = sprite('''
H.........H...
hH.......Hh...
.hH.....Hh....
..hbbbbbbh....
.bbcccccccb...
.bccccccccCb..
bbcBBBBBccCb..
bccooywBBcCb..
bcccBBBBBccb..
bccccccrcccb..
.bcccrorccb...
..bccccccb....
...bbbbbb.....
''', FP)
FHEAD_PV = (6, 12)


def flames(l, base, w, h, phase, seed=0):
    rng = np.random.default_rng(seed + int(phase * 10))
    for i in range(w):
        x = base[0] - w / 2 + i
        hh = h * (0.5 + 0.5 * math.sin(i * 1.3 + phase * 6.28)) + rng.random() * 2
        for k in range(int(hh)):
            u = k / max(1, hh)
            c = LAVA[3] if u < 0.2 else LAVA[2] if u < 0.45 else LAVA[1] if u < 0.8 else LAVA[0]
            l.px(x + math.sin(k * 0.6 + phase * 6) * 0.8, base[1] - k, c)


def pyre_torso(l, J, p):
    T = local(J)
    l.poly([T(-10, -24), T(-3, -28), T(9, -27), T(14, -20), T(12, -9), T(7, -2), T(-7, -2), T(-11, -12)], BAS_L, True, light='left')
    # lava cracks
    cracks = [((-6, -22), (0, -17), (3, -19), (8, -12)), ((-8, -10), (-3, -8), (2, -4)), ((5, -25), (6, -21), (10, -20))]
    for cr in cracks:
        for a, b in zip(cr[:-1], cr[1:]):
            l.line(T(*a), T(*b), LAVA[1])
    c = T(3, -16)
    l.ellipse(c[0], c[1], 3, 3, [LAVA[1], LAVA[2], LAVA[3]], True)
    # molten belt
    l.poly([T(-8, -3), T(8, -3), T(7, 2), T(-7, 2)], BAS, True)
    l.line(T(-7, 0), T(7, 0), LAVA[0])


def pyre_after_head(l, J, p):
    nk = J['neck']; up = J['up']
    top = add(nk, up, 12)
    flames(l, (top[0] - 1, top[1]), 9, 7, p.get('ph', 0))


def pyre_aura(rig, J, p):
    hp, up = J['hip'], J['up']
    a = glow(rig.W, rig.H, add(hp, up, 18), 26, hx('#ff5a1a'), 0.22)
    # fists burn
    l = Layer(rig.W, rig.H)
    for side in 'nf':
        hd = J[side + 'hand']
        flames(l, (hd[0], hd[1] - 2), 5, 5 * p.get('fist', 1), p.get('ph', 0) + (0.3 if side == 'f' else 0), 3)
    # embers rising
    rng = np.random.default_rng(int(p.get('ph', 0) * 100))
    for i in range(7):
        l.px(hp[0] - 14 + rng.integers(0, 30), hp[1] - 30 - rng.integers(0, 24), LAVA[2] if i % 2 else LAVA[1])
    return blend_over(a, l.a)


def pyre_rig():
    cos = dict(thigh=BAS, shin=BAS_L, boot=BAS, ua=BAS, fa=BAS_L, hand=[LAVA[0], LAVA[1], LAVA[2]],
               wt=8, ws=7, wu=7, wf=7, hand_r=4, boot_len=7,
               torso=pyre_torso, head=(FHEAD, FHEAD_PV), after_head=pyre_after_head, aura=pyre_aura)
    return Brute(160, 112, 60, 110, dict(torso=27, shdrop=5, ua=12, fa=12, th=13, sh=13, shx=3, hipx=2), cos)


def fireball(c, r):
    def f(J):
        W, H = 160, 112
        gl = glow(W, H, c, r * 2.2, hx('#ff5a1a'), 0.6)
        l = Layer(W, H)
        l.ellipse(c[0], c[1], r, r * 0.85, [LAVA[1], LAVA[2], LAVA[3]], True)
        for i in range(int(r * 3)):
            l.px(c[0] - r - i, c[1] + math.sin(i) * r * 0.5, LAVA[1] if i < r * 2 else LAVA[0])
        return blend_over(gl, l.a)
    return f


def pyre_clips():
    r = pyre_rig()
    lib = Lib(r, r.GY - 24, stance=6, slash=[LAVA[0], LAVA[2], LAVA[3]])
    lib.base.update(t=8, nh=lib.o(8, -2), fh=lib.o(4, 0))
    o, g, b = lib.o, lib.g, lib.base

    def erupt(x, hgt, a=255):
        def f(J):
            l = Layer(r.W, r.H)
            for i in range(-12, 13):
                hh = hgt * (1 - abs(i) / 13) * (0.7 + 0.3 * math.sin(i * 1.7))
                for k in range(int(hh)):
                    u = k / max(1, hh)
                    l.px(x + i + math.sin(k * 0.5) * 1, r.GY - 1 - k,
                         LAVA[3] if u < 0.25 else LAVA[2] if u < 0.5 else LAVA[1] if u < 0.85 else LAVA[0])
            arr = blend_over(glow(r.W, r.H, (x, r.GY - hgt / 2), hgt * 0.7 + 4, hx('#ff5a1a'), 0.5), l.a)
            arr[..., 3] = (arr[..., 3].astype(float) * a / 255).astype(np.uint8)
            return arr
        return f
    a1 = [P(b, t=-4, hip=o(-1, -1), nh=o(2, -24), fh=o(4, -22), fist=1.6),
          P(b, t=-10, hip=o(-2, -2), nh=o(0, -27), fh=o(2, -25), fist=2),
          P(b, t=28, hip=o(5, 4), nf=g(11), ff=g(-3), nh=o(20, 8), fh=o(18, 8), fx=[erupt(r.AX + 60, 18)]),
          P(b, t=28, hip=o(5, 4), nf=g(11), ff=g(-3), nh=o(20, 8), fh=o(18, 8), fx=[erupt(r.AX + 60, 34)]),
          P(b, t=14, hip=o(2, 2), nf=g(8), nh=o(12, 2), fx=[erupt(r.AX + 60, 26, 150)]), P(b)]
    a2 = [P(b, t=-8, hip=o(-2, 0), nh=o(-6, -10), fist=2.2, nf=g(4), ff=g(-6)),
          P(b, t=-14, hip=o(-3, 1), nh=o(-8, -14), fist=2.8, nf=g(3), ff=g(-7)),
          P(b, t=18, hip=o(5, 1), nf=g(12), ff=g(-2), nh=o(16, -10), fist=0.6, fx=[fireball((r.AX + 50, r.GY - 50), 5)]),
          P(b, t=16, hip=o(5, 1), nf=g(12), ff=g(-2), nh=o(15, -8), fist=0.6, fx=[fireball((r.AX + 76, r.GY - 48), 6)]),
          P(b, t=10, hip=o(3, 1), nf=g(8), nh=o(10, -4)), P(b)]
    def ph_(lst):
        for i, p in enumerate(lst):
            p['ph'] = i / len(lst)
        return lst
    R_ = r.draw
    death = lib.death()
    return {'idle': ([R_(p) for p in lib.idle(8, amp=1)], 110, True, None),
            'run': ([R_(p) for p in lib.run(8, A=6, lift=3, lean=12)], 85, True, None),
            'attack1': ([R_(p) for p in ph_(a1)], 80, False, 2), 'attack2': ([R_(p) for p in ph_(a2)], 80, False, 2),
            'hurt': ([R_(p) for p in ph_(lib.hurt())], 100, False, None), 'death': (fade(death, 2), 110, False, None)}


# ================================================================== OVERLORD
DSKIN = ramp('#2a0e22', '#5a1e44', '#8a3a6a')
DSKIN_L = ramp('#34122a', '#6e2852', '#a04a7e')
DWING = ramp('#1a0818', '#3a1030', '#6a2250')
DP = dict(O='#141018', D='#2a0e22', d='#5a1e44', L='#8a3a6a', l='#b45a92', h='#e8dcc0', H='#8a7a5a',
          y='#ffe04a', Y='#ff8a1a', k='#0a0610', g='#c9952f', G='#7a5418', w='#ffffff')
DHEAD = sprite('''
......g.g.g.......
.....gGgGgGg......
..hH.gggggggg.....
.hhHDDdddddddD....
hhH.DdLLLLLLdD....
hH.DddLLLLLLLd....
h..DdLLkkkLLLLd...
...DdLLLLLkyyLd...
...DddLLLLLLLLLd..
...DDdLLLLLLLLld..
....DdLLLwkwkLd...
....DDddLLkkkd....
.....DDddddddD....
.......DDDDDD.....
''', DP)
DHEAD_PV = (9, 13)


def scythe():
    rows = []
    blade = ['....kkkkk.......', '..kHhhhhhkk.....', '.kHhhwwhhhhkk...', 'kHhhkkkkkhhhhk..', 'kHk.....kkkhhhk.',
             'kk.........kkhhk', 'k............kkk']
    for rr in blade:
        rows.append(rr)
    for i in range(34):
        rows.append('.....GgG' + '.' * 8 if i % 9 == 0 else '.....dLd' + '.' * 8)
    rows.append('.....ygy' + '.' * 8)
    return sprite('\n'.join(rows), DP), (6, 26)


DSCYTHE, DSCYTHE_PV = scythe()


def over_torso(l, J, p):
    T = local(J)
    l.poly([T(-11, -30), T(-4, -34), T(10, -33), T(16, -26), T(14, -14), T(8, -4), T(-8, -4), T(-12, -16)], DSKIN_L, True, light='left')
    # muscle lines
    for a, b in (((2, -31), (3, -18)), ((-6, -16), (10, -16)), ((-4, -10), (8, -10))):
        l.line(T(*a), T(*b), DSKIN[0])
    # gold chest chain + loincloth
    l.line(T(-9, -30), T(12, -22), hx('#c9952f'))
    l.poly([T(-9, -4), T(9, -4), T(10, 12), T(3, 10), T(-2, 13), T(-8, 9)], ramp('#0a0610', '#1e1424', '#34283e'), True)
    l.line(T(-9, -3), T(9, -3), hx('#c9952f'))


def over_wings(l, J, p):
    nk = J['neck']; ph = p.get('ph', 0)
    flap = p.get('flap', math.sin(ph * 6.28) * 0.5)
    for side, rmp, off in ((-1, darker(DWING, 0.75), (-4, 6)), (-1, DWING, (2, 4))):
        sh_ = (nk[0] + off[0], nk[1] + off[1])
        S = 46 if off[0] < 0 else 42
        a = math.radians(-flap * 30 + 20)
        def pt(base, ang, L):
            return (base[0] + side * L * math.cos(ang), base[1] - L * math.sin(ang))
        wrist = pt(sh_, a + math.radians(40), S * 0.45)
        tips = [pt(wrist, a + math.radians(15), S * 0.55), pt(wrist, a - math.radians(15), S * 0.55),
                pt(wrist, a - math.radians(45), S * 0.5), pt(wrist, a - math.radians(75), S * 0.42)]
        body_pt = (sh_[0] + side * 2, sh_[1] + 22)
        pts = [sh_, wrist, tips[0]]
        prev = tips[0]
        for q in tips[1:] + [body_pt]:
            mid = ((prev[0] + q[0]) / 2, (prev[1] + q[1]) / 2)
            mid = (mid[0] + (wrist[0] - mid[0]) * 0.22, mid[1] + (wrist[1] - mid[1]) * 0.22)
            pts += [mid, q]; prev = q
        lay = Layer(l.W, l.H)
        lay.poly(pts, rmp, True)
        lay.seg(sh_, wrist, 3, DSKIN, True)
        for tp in tips:
            lay.line(wrist, tp, rmp[2])
        over(l.a, outline(lay.a))


def over_aura(rig, J, p):
    hp, up = J['hip'], J['up']
    return glow(rig.W, rig.H, add(hp, up, 22), 34, hx('#a03ad0'), 0.16 * p.get('aur', 1))


def over_rig():
    cos = dict(thigh=DSKIN, shin=DSKIN_L, boot=ramp('#0a0610', '#1e1424', '#34283e'), ua=DSKIN, fa=DSKIN_L, hand=DSKIN_L,
               wt=8, ws=7, wu=7, wf=6, hand_r=3, boot_len=8,
               torso=over_torso, head=(DHEAD, DHEAD_PV), weapon=(DSCYTHE, DSCYTHE_PV),
               behind=over_wings, aura=over_aura)
    return Brute(176, 128, 72, 126, dict(torso=33, shdrop=5, ua=13, fa=13, th=14, sh=14, shx=3, hipx=2), cos)


def dark_orb(c, r, a=255):
    def f(J):
        gl = glow(176, 128, c, r * 2.4, hx('#c04aff'), 0.6)
        l = Layer(176, 128)
        l.ellipse(c[0], c[1], r, r, [hx('#3a0a5a'), hx('#8a2ad0'), hx('#e0a0ff')], True)
        l.ellipse(c[0] - 1, c[1] - 1, r * 0.4, r * 0.4, [hx('#ffffff')] * 3, False)
        arr = blend_over(gl, outline(l.a, hx('#1a0428')))
        arr[..., 3] = (arr[..., 3].astype(float) * a / 255).astype(np.uint8)
        return arr
    return f


def over_clips():
    r = over_rig()
    lib = Lib(r, r.GY - 26, stance=6, slash=[hx('#5a1aa0'), hx('#c48aff'), hx('#ffffff')])
    lib.base.update(t=4, nh=lib.o(6, -4), fh=lib.o(9, -8), wa=10)
    o, g, b = lib.o, lib.g, lib.base
    def ph_(lst, flap=True):
        for i, p in enumerate(lst):
            p['ph'] = i / len(lst)
        return lst
    sw = ph_(lib.swing(reach=14))
    a2 = ph_([P(b, t=-6, nh=o(2, -6), fh=o(8, -20), aur=1.5, fx=[dark_orb((r.AX + 20, r.GY - 64), 3)]),
              P(b, t=-10, nh=o(1, -6), fh=o(8, -24), aur=2, fx=[dark_orb((r.AX + 20, r.GY - 70), 6)]),
              P(b, t=-12, nh=o(1, -6), fh=o(9, -25), aur=2.4, fx=[dark_orb((r.AX + 21, r.GY - 72), 8)]),
              P(b, t=16, hip=o(4, 1), nf=g(10), nh=o(6, -2), fh=o(18, -12), fx=[dark_orb((r.AX + 60, r.GY - 50), 8)]),
              P(b, t=12, hip=o(3, 1), nf=g(9), fh=o(16, -10), fx=[dark_orb((r.AX + 90, r.GY - 34), 9, 200)]),
              P(b, t=6)])
    R_ = r.draw
    # death: sink + ash dissolve
    hurt = ph_(lib.hurt())
    d0 = ph_([P(b, t=-14, hd=-12, hip=o(-2, 0), flap=-1, nh=o(0, -2), fh=o(2, -16), wa=-10),
              P(b, t=8, hd=14, hip=o(0, 6), flap=0.8, nh=o(6, 6), fh=o(8, 4), wa=120, nf=g(6), ff=g(-5)),
              P(b, t=16, hd=20, hip=o(1, 9), flap=1, nh=o(9, 9), fh=o(10, 8), wa=150, nf=g(7), ff=g(-7))])
    frames = [R_(p) for p in d0]
    base = frames[-1]
    rng = np.random.default_rng(7)
    for k in range(1, 6):
        fr = base.copy()
        noise = rng.random(base.shape[:2])
        ys = np.arange(r.H)[:, None]
        thresh = (k / 5) * 1.3 - (ys / r.H) * 0.3
        fr[noise < thresh] = 0
        l = Layer(r.W, r.H)
        for i in range(26):
            l.px(r.AX - 20 + rng.integers(0, 50), r.GY - 30 - k * 6 - rng.integers(0, 40), hx('#c48aff') if i % 3 else hx('#5a4a66'))
        frames.append(blend_over(fr, l.a))
    return {'idle': ([R_(p) for p in ph_(lib.idle(8, amp=1))], 120, True, None),
            'run': ([R_(p) for p in ph_(lib.run(8, A=6, lift=3, lean=10))], 90, True, None),
            'attack1': ([R_(p) for p in sw], 75, False, 2), 'attack2': ([R_(p) for p in a2], 85, False, 3),
            'hurt': ([R_(p) for p in hurt], 100, False, None), 'death': (frames, 115, False, None)}


if __name__ == '__main__':
    import sys
    for nm, fn in (('warden', warden_clips), ('pyrelord', pyre_clips), ('overlord', over_clips)):
        if len(sys.argv) > 1 and nm not in sys.argv[1:]:
            continue
        c = fn()
        preview([v[0] for v in c.values()], f'prev_{nm}.png', scale=2)
