"""Grassland monsters: slime, goblin, ogre."""
from brute import *

# ------------------------------------------------------------------ SLIME
SW, SH = 64, 44
SAX, SGY = 26, 42
JELLY = ramp('#2c7a3a', '#5ec26a', '#a8f08a')
JELLY_IN = hx('#3e9a4c')


def slime_frame(sx=1.0, sy=1.0, dx=0, dy=0, face='norm', fx=None, alpha=255, leaf=True, flash=False):
    l = Layer(SW, SH)
    rx, ry = 11 * sx, 9 * sy
    cx, cy = SAX + dx, SGY - 1 - ry + dy
    # body: dome — ellipse with flattened bottom
    im = Image.new('L', (SW, SH), 0)
    d = ImageDraw.Draw(im)
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry * 1.0], fill=255)
    m = np.array(im) > 0
    m[int(SGY + dy):] = False
    l.mask_paint(m, JELLY, True)
    # inner core + bubbles + shine
    l.ellipse(cx - 2, cy + ry * 0.25, rx * 0.45, ry * 0.35, [JELLY_IN, JELLY_IN, JELLY_IN], shade=False)
    l.px(cx - 4, cy + 2, hx('#a8f08a')); l.px(cx + 3, cy + 4, hx('#a8f08a'))
    l.px(cx - rx * 0.55, cy - ry * 0.5, hx('#ffffff')); l.px(cx - rx * 0.55 + 1, cy - ry * 0.5, hx('#e8ffe0'))
    l.px(cx - rx * 0.55, cy - ry * 0.5 + 1, hx('#e8ffe0'))
    # face (facing right)
    ex = cx + rx * 0.35; ey = cy - ry * 0.05
    dark = hx('#10301a')
    if face == 'norm':
        for e in (ex - 3, ex + 2):
            l.px(e, ey, dark); l.px(e, ey + 1, dark); l.px(e, ey - 1, hx('#ffffff'))
        l.px(ex - 1, ey + 3, dark); l.px(ex, ey + 3, dark)
    elif face == 'angry':
        for e in (ex - 3, ex + 2):
            l.px(e, ey, dark); l.px(e, ey + 1, dark)
        l.line((ex - 4, ey - 2), (ex - 2, ey - 1), dark); l.line((ex + 3, ey - 2), (ex + 1, ey - 1), dark)
        for i in range(-1, 3):
            l.px(ex + i - 1, ey + 3, dark)
        l.px(ex, ey + 4, hx('#c0405a'))
    elif face == 'hurt':
        l.line((ex - 4, ey - 1), (ex - 2, ey + 1), dark); l.line((ex - 4, ey + 1), (ex - 2, ey - 1), dark)
        l.line((ex + 1, ey - 1), (ex + 3, ey + 1), dark); l.line((ex + 1, ey + 1), (ex + 3, ey - 1), dark)
        l.px(ex - 1, ey + 3, dark)
    # leaf sprout on top
    if leaf:
        tx, ty = cx - 1, cy - ry
        l.px(tx, ty - 1, hx('#4a3a20')); l.px(tx, ty - 2, hx('#4a3a20'))
        l.seg((tx, ty - 3), (tx + 3, ty - 5), 2, ramp('#2f6a22', '#6ab83a', '#b6ea6a'), True)
        l.seg((tx, ty - 3), (tx - 2, ty - 4), 2, ramp('#2f6a22', '#4f9a2e', '#8acb50'), True)
    a = outline(l.a, hx('#0f2a16'))
    if flash:
        m = a[..., 3] > 0
        a[m, :3] = (a[m, :3] * 0.4 + 255 * 0.6).astype(np.uint8)
    if fx is not None:
        a = blend_over(a, fx)
    if alpha < 255:
        a[..., 3] = (a[..., 3].astype(float) * alpha / 255).astype(np.uint8)
    return a


def slime_clips():
    idle = [slime_frame(1 + s * 0.06, 1 - s * 0.08) for s in (0, 0.5, 1, 1, 0.5, 0)]
    run = [slime_frame(1.1, 0.85, 0, 0), slime_frame(0.92, 1.12, 1, -3), slime_frame(0.9, 1.15, 3, -7),
           slime_frame(0.95, 1.08, 5, -6), slime_frame(1.12, 0.84, 6, 0), slime_frame(1.04, 0.95, 3, 0)]
    def splash(x, r, a=255):
        l = Layer(SW, SH)
        for i in range(7):
            ang = math.radians(-160 + i * 25)
            p = (x + math.cos(ang) * r, SGY - 3 + math.sin(ang) * r * 0.6)
            l.ellipse(p[0], p[1], 1.2, 1.2, JELLY, False)
        g = outline(l.a, hx('#0f2a16'))
        g[..., 3] = (g[..., 3].astype(float) * a / 255).astype(np.uint8)
        return g
    atk = [slime_frame(1.2, 0.75, -2, 0, 'angry'), slime_frame(0.85, 1.2, 2, -6, 'angry'),
           slime_frame(1.0, 1.0, 12, -8, 'angry'), slime_frame(1.3, 0.7, 18, 0, 'angry', fx=splash(SAX + 22, 10)),
           slime_frame(1.1, 0.88, 12, 0, 'angry', fx=splash(SAX + 22, 14, 140)), slime_frame(1.0, 1.0, 4, 0)]
    hurt = [slime_frame(1.25, 0.72, -3, 0, 'hurt', flash=True), slime_frame(0.9, 1.1, -2, 0, 'hurt'),
            slime_frame(1.0, 1.0, -1, 0)]
    death = [slime_frame(1.25, 0.72, -2, 0, 'hurt'), slime_frame(1.5, 0.5, -2, 0, 'hurt'),
             slime_frame(1.8, 0.32, -2, 0, 'hurt', leaf=False), slime_frame(2.0, 0.2, -2, 0, 'hurt', leaf=False, alpha=200),
             slime_frame(2.1, 0.14, -2, 0, 'hurt', leaf=False, alpha=130), slime_frame(2.15, 0.1, -2, 0, 'hurt', leaf=False, alpha=60)]
    return {'idle': (idle, 130, True, None), 'run': (run, 85, True, None), 'attack1': (atk, 70, False, 3),
            'hurt': (hurt, 95, False, None), 'death': (death, 100, False, None)}


# ------------------------------------------------------------------ GOBLIN
GPAL = dict(D='#26401a', d='#4f8030', L='#8fc04a', y='#ffe14a', w='#f4f0dc', O='#141018',
            r='#7a4a2a', R='#4e2c18', b='#3a2a1a', g='#b08a3a', s='#8a8f96', S='#4a4e56', l='#c6ccd4', t='#9a4a2a')
GHEAD = sprite('''
....dddd..
DD.dLLLLd.
.DDdLLyLd.
..DddLLLLd
...dDwwwD.
....DddD..
''', GPAL)
GHEAD_PV = (5, 5)
GTORSO = sprite('''
..dLd..
.ddLdd.
.rrrrrR
.rRrrrR
.bbgbbR
.rRrRr.
.r.R.r.
''', GPAL)
GTORSO_PV = (3, 6)
GDAGGER = sprite('''
.l.
.lS
lsS
lsS
lsS
ggg
.b.
.b.
''', GPAL)
GDAGGER_PV = (1, 6)
GSKIN = ramp('#26401a', '#4f8030', '#8fc04a')
GRAG = ramp('#4e2c18', '#7a4a2a', '#a86a3e')


def goblin_rig():
    cos = dict(
        thigh=GRAG, shin=GSKIN, boot=ramp('#2a1c10', '#4e3420', '#6e4c30'),
        ua=GSKIN, fa=GSKIN, hand=GSKIN, wt=3, ws=2, wu=2, wf=2, hand_r=1, boot_len=3,
        torso=lambda l, J, p: l.part(GTORSO, GTORSO_PV, J['hip'], deg=J['t']),
        head=(GHEAD, GHEAD_PV), weapon=(GDAGGER, GDAGGER_PV),
    )
    r = Brute(72, 48, 28, 46, dict(torso=7, shdrop=1, ua=4, fa=4, th=5, sh=5, shx=1, hipx=1), cos)
    return r


def goblin_clips():
    r = goblin_rig()
    lib = Lib(r, r.GY - 11, stance=4, slash=[hx('#7a8f40'), hx('#d8f0a0'), hx('#ffffff')])
    lib.base.update(t=14, hd=-6, wa=60)
    idle = lib.idle(6, amp=1)
    run = lib.run(8, A=6, lift=4, lean=22)
    a1 = lib.lunge(reach=12, fx=[lambda J: arc_fx(72, 48, (r.AX + 8, r.GY - 16), 9, 14, 160, 70,
                                                  lib.slash, alpha=230)], wa=95)
    # attack2: leaping double stab
    b = lib.base; o = lib.o; g = lib.g
    a2 = [P(b, hip=o(-1, 3), t=20, nf=g(3), ff=g(-5), nh=o(2, 1)),
          P(b, hip=o(4, -8), t=10, nf=g(6, 6), ff=g(-1, 8), nh=o(8, -10), wa=150, ntoe=120, ftoe=130),
          P(b, hip=o(10, -5), t=30, nf=g(14, 4), ff=g(4, 5), nh=o(18, -2), wa=130,
            fx=[lib.slash_fx((r.AX + 16, r.GY - 14), 6, 11, 200, 110)]),
          P(b, hip=o(10, 0), t=24, nf=g(15), ff=g(5), nh=o(19, 2), wa=150,
            fx=[lib.slash_fx((r.AX + 16, r.GY - 12), 7, 11, 140, 70, 170)]),
          P(b, hip=o(5, 0), t=16, nf=g(10), ff=g(0)), P(b)]
    hurt = lib.hurt()
    death = lib.death()
    R_ = r.draw
    return {'idle': ([R_(p) for p in idle], 110, True, None), 'run': ([R_(p) for p in run], 65, True, None),
            'attack1': ([R_(p) for p in a1], 60, False, 2), 'attack2': ([R_(p) for p in a2], 65, False, 2),
            'hurt': ([R_(p) for p in hurt], 90, False, None), 'death': (death, 100, False, None)}


# ------------------------------------------------------------------ OGRE
OPAL = dict(O='#141018', D='#5a2a1c', d='#9a5236', L='#d4835c', l='#e0cc8e', y='#ffd84a', R='#6a1a1a',
            w='#f0ead0', W='#b8b090', b='#3a2616', n='#6a4428', N='#94653e', h='#2a1c14', m='#5a4a2c')
OHEAD = sprite('''
.....hhhhh......
...hhDDDDDhh....
..DDdddddddDD...
.DddLLLLLLLLdD..
.DdLLLLLLLLLLd..
DddLLDDDDDLLLd..
DdLLLLLLLyDLLLd.
DddLLLLLLLLLLLLd
DddLLLLLLLLLLDDd
.DdLLLLLLDDDDDd.
.DddLLLLwRRRwDd.
..DDdddddwddDD..
...DDddddddDD...
.....DDDDDD.....
''', OPAL)
OHEAD_PV = (6, 13)
OCLUB = sprite('''
..bnNNb..
.bnNNNNb.
bnNwNNnNb
bnNNNNNwb
bnNNnNNNb
bnwNNNNnb
.bnNNNnb.
.bnNNwnb.
..bnNnb..
..bnNnb..
...bnb...
...bnb...
...bnb...
...bnb...
...bnb...
...bnb...
...bmb...
''', OPAL)
OCLUB_PV = (4, 14)
OSKIN = ramp('#5a2a1c', '#9a5236', '#d4835c')
OHIDE = ramp('#3a2616', '#6a4428', '#94653e')


def ogre_torso(l, J, p):
    hp, up, t = J['hip'], J['up'], J['t']
    # belly: big shaded ellipse along the torso axis
    c = add(hp, up, 10)
    im_pts = []
    for i in range(24):
        a = i / 24 * 2 * math.pi
        x, y = math.cos(a) * 11, math.sin(a) * 12
        if x > 0:
            x *= 1.15  # belly bulges forward
        r = math.radians(t)
        im_pts.append((c[0] + x * math.cos(r) - y * math.sin(r), c[1] + x * math.sin(r) + y * math.cos(r)))
    l.poly(im_pts, OSKIN, True, light='left')
    # chest/belly crease + navel
    l.line(add(c, up, 3), add(add(c, up, 3), (1, 0), 6), hx('#9a5236'))
    l.px(*add(add(c, up, -3), (1, 0), 6), c=hx('#5a2a1c'))
    # hide loincloth
    belt = add(hp, up, 1)
    l.poly([add(belt, (-1, 0), 8), add(belt, (1, 0), 9), add(add(belt, (1, 0), 6), (0, 1), 8),
            add(add(belt, (1, 0), 2), (0, 1), 6), add(add(belt, (-1, 0), 3), (0, 1), 8), add(add(belt, (-1, 0), 8), (0, 1), 5)],
           OHIDE, True)
    l.line(add(belt, (-1, 0), 8), add(belt, (1, 0), 9), hx('#2a1c14'))
    # bone necklace
    nk = J['neck']
    for i in range(-2, 3):
        l.px(nk[0] + i * 2 + 2, nk[1] + 3 + abs(i) * 0.5, hx('#f0ead0'))


def ogre_rig():
    cos = dict(thigh=OSKIN, shin=OSKIN, boot=ramp('#3a2616', '#5a3c22', '#7c5432'),
               ua=OSKIN, fa=OSKIN, hand=OSKIN, wt=8, ws=7, wu=7, wf=6, hand_r=4, boot_len=7,
               torso=ogre_torso, head=(OHEAD, OHEAD_PV), weapon=(OCLUB, OCLUB_PV))
    return Brute(120, 92, 46, 90, dict(torso=21, shdrop=5, ua=11, fa=10, th=11, sh=10, shx=3, hipx=2), cos)


def ogre_clips():
    r = ogre_rig()
    lib = Lib(r, r.GY - 22, stance=5, slash=[hx('#8a5a2a'), hx('#f0c890'), hx('#ffffff')])
    lib.base.update(t=6, wa=-35, nh=lib.o(3, -9), fh=lib.o(5, 0))
    idle = lib.idle(6, amp=1)
    run = lib.run(8, A=6, lift=3, lean=12, wa=-10)
    a1 = lib.swing(reach=14)

    def quake(x, w, a=255):
        def f(J):
            l = Layer(r.W, r.H)
            for i in range(-w, w + 1):
                h = int((w - abs(i)) / w * 5) + 1
                for kk in range(h):
                    l.px(x + i, r.GY - 1 - kk - (1 if (i % 3 == 0) else 0), hx('#8a6a3a') if kk > 1 else hx('#c8a46a'))
            for kk in range(5):
                l.px(x - w + kk * w // 2, r.GY - 8 - kk % 2 * 3, hx('#6a4a2a'))
            arr = l.a
            arr[..., 3] = (arr[..., 3].astype(float) * a / 255).astype(np.uint8)
            return arr
        return f
    b = lib.base; o = lib.o; g = lib.g
    a2 = [P(b, t=-6, hip=o(-2, -1), nh=o(-1, -18), fh=o(1, -16), wa=-15),
          P(b, t=-12, hip=o(-3, -2), nh=o(-4, -19), fh=o(-2, -17), wa=-40),
          P(b, t=26, hip=o(5, 4), nf=g(11), ff=g(-3), nh=o(16, 6), fh=o(14, 6), wa=160,
            fx=[quake(r.AX + 40, 14)]),
          P(b, t=26, hip=o(5, 4), nf=g(11), ff=g(-3), nh=o(16, 7), fh=o(14, 7), wa=165,
            fx=[quake(r.AX + 40, 18, 160)]),
          P(b, t=14, hip=o(2, 2), nf=g(8), nh=o(10, 2), wa=90), P(b)]
    R_ = r.draw
    return {'idle': ([R_(p) for p in idle], 140, True, None), 'run': ([R_(p) for p in run], 90, True, None),
            'attack1': ([R_(p) for p in a1], 75, False, 2), 'attack2': ([R_(p) for p in a2], 85, False, 2),
            'hurt': ([R_(p) for p in lib.hurt()], 100, False, None), 'death': (lib.death(), 110, False, None)}


if __name__ == '__main__':
    for nm, fn in (('slime', slime_clips), ('goblin', goblin_clips), ('ogre', ogre_clips)):
        c = fn()
        preview([v[0] for v in c.values()], f'prev_{nm}.png', scale=3)
