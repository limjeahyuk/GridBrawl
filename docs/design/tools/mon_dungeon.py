"""Dungeon monsters: bat swarm, rune golem, bog witch."""
from brute import *

# ------------------------------------------------------------------ BAT
BW, BH = 64, 52
BAX, BGY = 26, 50
FUR = ramp('#24142e', '#4a2c60', '#7a52a0')
WING = ramp('#2a1030', '#5a2450', '#9a4a86')
EYE = hx('#ff4a4a')


def bat_frame(flap, cx=BAX, cy=26, tilt=0, mouth=False, flash=False, alpha=255, fx=None, dead=False):
    """flap: -1 (wings up) .. 1 (wings down)"""
    l = Layer(BW, BH)
    wl = Layer(BW, BH)
    # wings: far wing (darker) behind, near wing in front
    for side, lay, rmp in ((-1, wl, darker(WING, 0.7)), (1, l, WING)):
        sh_ = (cx + side * 1, cy - 2)
        S = 17 if side < 0 else 16
        a = math.radians(-flap * 55)
        def pt(base, ang, L):
            return (base[0] + side * L * math.cos(ang), base[1] - L * math.sin(ang))
        wrist = pt(sh_, a + math.radians(25), S * 0.5)
        tips = [pt(wrist, a + math.radians(5), S * 0.55), pt(wrist, a - math.radians(30), S * 0.5),
                pt(wrist, a - math.radians(70), S * 0.4)]
        body_pt = (cx + side * 1, cy + 4)
        pts = [sh_, wrist, tips[0]]
        chain = tips[1:] + [body_pt]
        prev = tips[0]
        for q in chain:
            mid = ((prev[0] + q[0]) / 2, (prev[1] + q[1]) / 2)
            mid = (mid[0] + (wrist[0] - mid[0]) * 0.25, mid[1] + (wrist[1] - mid[1]) * 0.25)
            pts += [mid, q]
            prev = q
        lay.poly(pts, rmp, True)
        bone = rmp[2]
        lay.line(sh_, wrist, bone)
        for tp in tips:
            lay.line(wrist, tp, bone)
    # body
    l.ellipse(cx, cy + 1, 4.5, 5.5, FUR, True)
    l.ellipse(cx + 1.5, cy + 2, 2, 3, [hx('#6a4a86'), hx('#8a6aa6'), hx('#a88ac0')], False)
    # head + ears
    hxp, hyp = cx + 3, cy - 4
    l.ellipse(hxp, hyp, 3.5, 3.2, FUR, True)
    l.poly([(hxp - 2, hyp - 2), (hxp - 4, hyp - 9), (hxp, hyp - 3)], FUR, True)
    l.poly([(hxp + 1, hyp - 2), (hxp + 2, hyp - 9), (hxp + 3, hyp - 2)], FUR, True)
    if not dead:
        l.px(hxp + 2, hyp, EYE); l.px(hxp + 1, hyp, hx('#ffb0a0'))
    else:
        l.px(hxp + 2, hyp, hx('#14101c'))
    if mouth:
        l.px(hxp + 3, hyp + 2, hx('#ffffff')); l.px(hxp + 2, hyp + 2, hx('#8a1a2a')); l.px(hxp + 1, hyp + 3, hx('#ffffff'))
    # feet
    l.px(cx - 1, cy + 7, hx('#2a1e38')); l.px(cx + 1, cy + 7, hx('#2a1e38'))
    a = outline(wl.a)
    a = over(a, outline(l.a))
    if tilt:
        img, pv = rotsprite(a, tilt, (cx, cy))
        L2 = Layer(BW, BH); L2.paste(img, cx - pv[0], cy - pv[1]); a = L2.a
    if flash:
        m = a[..., 3] > 0
        a[m, :3] = (a[m, :3] * 0.4 + 255 * 0.6).astype(np.uint8)
    if fx is not None:
        a = blend_over(a, fx)
    if alpha < 255:
        a[..., 3] = (a[..., 3].astype(float) * alpha / 255).astype(np.uint8)
    return a


def bat_clips():
    fl = [-1, -0.4, 0.4, 1, 0.4, -0.4]
    bob = [0, -1, -1, 0, 1, 1]
    idle = [bat_frame(f, cy=26 + b) for f, b in zip(fl, bob)]
    run = [bat_frame(f, cx=BAX + 1, cy=25 + b, tilt=14) for f, b in zip(fl, bob)]

    def bite(c):
        def g():
            l = Layer(BW, BH)
            for i in range(3):
                l.line((c[0] + i * 2, c[1] - 3), (c[0] + i * 2 + 2, c[1] + 3), hx('#ffffff'))
            return blend_over(glow(BW, BH, c, 6, hx('#ff6a6a'), 0.6), l.a)
        return g()
    atk = [bat_frame(-1, cx=BAX - 2, cy=22, tilt=-10), bat_frame(-1, cx=BAX - 3, cy=20, tilt=-18, mouth=True),
           bat_frame(0.6, cx=BAX + 12, cy=30, tilt=30, mouth=True),
           bat_frame(1, cx=BAX + 18, cy=32, tilt=34, mouth=True, fx=bite((BAX + 26, 31))),
           bat_frame(0, cx=BAX + 10, cy=27, tilt=10), bat_frame(-0.4, cx=BAX + 2, cy=26)]
    hurt = [bat_frame(-1, cx=BAX - 3, cy=24, tilt=-24, flash=True), bat_frame(0.4, cx=BAX - 2, cy=25, tilt=-10),
            bat_frame(0, cy=26)]
    death = [bat_frame(-1, cx=BAX - 3, cy=24, tilt=-30, dead=True), bat_frame(1, cx=BAX - 2, cy=30, tilt=-70, dead=True),
             bat_frame(0.6, cx=BAX - 1, cy=37, tilt=-120, dead=True), bat_frame(0.8, cx=BAX, cy=42, tilt=-160, dead=True),
             bat_frame(1, cx=BAX, cy=44, tilt=-180, dead=True), bat_frame(1, cx=BAX, cy=44, tilt=-180, dead=True, alpha=140)]
    return {'idle': (idle, 80, True, None), 'run': (run, 60, True, None), 'attack1': (atk, 65, False, 3),
            'hurt': (hurt, 90, False, None), 'death': (death, 95, False, None)}


# ------------------------------------------------------------------ GOLEM
STONE = ramp('#262a36', '#4a5264', '#7c8698')
STONE_L = ramp('#2e3342', '#5a6378', '#8e99ad')
RUNE = hx('#5ef0ff'); RUNE_D = hx('#1a8aa8'); RUNE_C = hx('#e0ffff')
GPAL = dict(O='#141018', S='#262a36', s='#4a5264', l='#7c8698', w='#a8b2c4', r='#5ef0ff', R='#1a8aa8', c='#e0ffff', m='#3a6a3a', M='#5a9a4a')
GHEAD = sprite('''
...MmMSs....
..SsssllsS..
.SsllllllsS.
SslllllllllS
SsSSSSSSrcSS
SslllllRrrlS
SsslllllllsS
.SSsssssssS.
..SSSSSSSS..
''', GPAL)
GHEAD_PV = (5, 8)


def golem_torso(l, J, p):
    hp, up, t = J['hip'], J['up'], J['t']
    r = math.radians(t)
    def T(x, y):  # local (x fwd, y down from neck) → world, origin at hip
        return (hp[0] + x * math.cos(r) - y * math.sin(r), hp[1] + x * math.sin(r) + y * math.cos(r))
    pts = [T(-9, -20), T(-3, -24), T(7, -23), T(12, -17), T(11, -8), T(6, -2), T(5, 2), T(-6, 2), T(-9, -4), T(-11, -13)]
    l.poly(pts, STONE_L, True, light='left')
    # slab seams
    for a, b in (((-8, -12), (10, -13)), ((-6, -5), (8, -6)), ((1, -24), (2, -13))):
        l.line(T(*a), T(*b), STONE[0])
    # moss
    for x, y in ((-7, -21), (-6, -21), (-5, -22), (-9, -14), (6, -3), (7, -3)):
        l.px(*T(x, y), c=hx('#5a9a4a'))
    l.px(*T(-6, -22), c=hx('#3a6a3a'))
    # rune core
    c = T(3, -17)
    l.ellipse(c[0], c[1], 3, 3, [RUNE_D, RUNE, RUNE_C], True)
    for d in ((-5, 0), (5, 0), (0, 5), (0, -5)):
        l.px(c[0] + d[0], c[1] + d[1], RUNE_D)


def golem_shoulder(l, J, p):
    s = J['nsho']
    l.ellipse(s[0], s[1] + 1, 5, 4, STONE_L, True)
    l.px(s[0], s[1], RUNE)


def golem_aura(rig, J, p):
    hp, up = J['hip'], J['up']
    c = add(hp, up, 17)
    return glow(rig.W, rig.H, (c[0] + 3, c[1]), 9 * p.get('glow', 1), hx('#5ef0ff'), 0.35)


def golem_rig():
    cos = dict(thigh=STONE, shin=STONE_L, boot=STONE, ua=STONE, fa=STONE_L, hand=STONE_L,
               wt=8, ws=8, wu=7, wf=8, hand_r=5, boot_len=7,
               torso=golem_torso, head=(GHEAD, GHEAD_PV), shoulder=golem_shoulder, aura=golem_aura)
    return Brute(120, 92, 46, 90, dict(torso=22, shdrop=4, ua=10, fa=10, th=9, sh=9, shx=3, hipx=2), cos)


def golem_clips():
    r = golem_rig()
    lib = Lib(r, r.GY - 19, stance=5, slash=[RUNE_D, RUNE, RUNE_C])
    lib.base.update(t=8, nh=lib.o(8, 1), fh=lib.o(6, 2), hd=0)
    o, g, b = lib.o, lib.g, lib.base

    def impact(c, rad, a=255):
        def f(J):
            gl = glow(r.W, r.H, c, rad, hx('#5ef0ff'), 0.7)
            l = Layer(r.W, r.H)
            for i in range(8):
                ang = i / 8 * 2 * math.pi
                l.line((c[0] + math.cos(ang) * rad * 0.4, c[1] + math.sin(ang) * rad * 0.4),
                       (c[0] + math.cos(ang) * rad * 0.9, c[1] + math.sin(ang) * rad * 0.9), RUNE_C if i % 2 else RUNE)
            arr = blend_over(gl, l.a)
            arr[..., 3] = (arr[..., 3].astype(float) * a / 255).astype(np.uint8)
            return arr
        return f
    a1 = lib.lunge(reach=18, fx=[impact((r.AX + 34, r.GY - 26), 9)])
    a1[2]['glow'] = 1.4

    def rocks(x, k, a=255):
        def f(J):
            l = Layer(r.W, r.H)
            for i in range(6):
                px_ = x - 14 + i * 6 + (i % 2) * 2
                py = r.GY - 2 - (k * (3 + (i * 7) % 5))
                l.ellipse(px_, py, 1.6, 1.4, STONE_L, True)
            for i in range(-16, 17):
                if abs(i) % 4 != 1:
                    l.px(x + i, r.GY - 1, RUNE if abs(i) < 8 else RUNE_D)
            arr = blend_over(glow(r.W, r.H, (x, r.GY - 2), 16, hx('#5ef0ff'), 0.45), outline(l.a))
            arr[..., 3] = (arr[..., 3].astype(float) * a / 255).astype(np.uint8)
            return arr
        return f
    a2 = [P(b, t=-4, hip=o(-1, -1), nh=o(3, -24), fh=o(5, -23), glow=1.2),
          P(b, t=-10, hip=o(-2, -2), nh=o(1, -26), fh=o(3, -25), glow=1.6),
          P(b, t=28, hip=o(5, 4), nf=g(11), ff=g(-3), nh=o(20, 8), fh=o(18, 8), fx=[rocks(r.AX + 36, 1)]),
          P(b, t=28, hip=o(5, 4), nf=g(11), ff=g(-3), nh=o(20, 8), fh=o(18, 8), fx=[rocks(r.AX + 36, 2.4, 200)]),
          P(b, t=14, hip=o(2, 2), nf=g(8), nh=o(12, 2), fx=[rocks(r.AX + 36, 3.4, 90)]), P(b)]
    R_ = r.draw
    death = lib.death(n_rot=(20, 45, 70, 85))
    # crumble into rubble
    last = death[-1]
    rub = Layer(r.W, r.H)
    for i in range(9):
        rub.ellipse(r.AX - 8 + i * 5, r.GY - 3 - (i % 3), 3 + (i % 2), 2.5, STONE_L, True)
    death += [blend_over(np.where(np.arange(r.H)[:, None, None] > r.GY - 12, last, 0).astype(np.uint8), outline(rub.a)),
              outline(rub.a)]
    return {'idle': ([R_(p) for p in lib.idle(6, amp=1)], 150, True, None),
            'run': ([R_(p) for p in lib.run(8, A=5, lift=3, lean=10)], 95, True, None),
            'attack1': ([R_(p) for p in a1], 80, False, 2), 'attack2': ([R_(p) for p in a2], 90, False, 2),
            'hurt': ([R_(p) for p in lib.hurt()], 100, False, None), 'death': (death, 110, False, None)}


# ------------------------------------------------------------------ WITCH (re-skinned Dirge rig)
def witch_module():
    src = open('hero_dirge.py').read()
    start = src.index("HOOD = sprite('''"); end = src.index("HOOD_PV = (4, 10)") + len("HOOD_PV = (4, 10)")
    hat = """HOOD = sprite('''
Hh.........
.HHh.......
..HHh......
..HHhh.....
...HHhh....
..HHHhhh...
.HHHHhhhh..
GgggyggggG.
..AAakkk...
..AakkKek..
..AAkkkkkk.
..AAakkkkkk
...AakkKk..
....AkkK...
....gyg....
''', PAL)
HOOD_PV = (5, 14)"""
    src = src[:start] + hat + src[end:]
    rep = {
        "PAL = dict(": "PAL = dict(H='#120e1a', h='#2c2240', A='#5a5a6a', a='#a8a8b8', k='#86a84e', K='#3e5a2a', ",
        "'#1d1230'": "'#101c14'", "'#3a2560'": "'#1f3a28'", "'#5f42a0'": "'#356040'", "'#8d6fd0'": "'#5f9060'",
        "'#140c22'": "'#0b140e'", "'#281a44'": "'#172a1d'", "'#402c6c'": "'#26442e'",
        "'#d6b4ff'": "'#b8ff6a'", "'#7a4fd0'": "'#3e9a2a'", "'#b48cff'": "'#8ef05a'", "'#efe0ff'": "'#ffe14a'",
        "'#2a1450'": "'#173a10'", "'#6e6a80'": "'#3e5a2a'", "'#b6b0c8'": "'#86a84e'", "'#e4e0f0'": "'#b0d070'",
        "'#4e4a5e'": "'#2c4220'", "'#7e7a92'": "'#5e7a3a'", "'#a09cb4'": "'#7c9a52'",
        "class Dirge(": "class Witch(", "R = Dirge()": "R = Witch()",
    }
    for a, b2 in rep.items():
        src = src.replace(a, b2)
    ns = {'__name__': 'witch'}
    exec(compile(src, 'witch', 'exec'), ns)
    return ns


def witch_clips():
    ns = witch_module()
    c = ns['build']('out')
    return {k: c[k] for k in ('idle', 'run', 'attack1', 'attack2', 'hurt', 'death')}


if __name__ == '__main__':
    for nm, fn in (('bat', bat_clips), ('golem', golem_clips), ('witch', witch_clips)):
        c = fn()
        preview([v[0] for v in c.values()], f'prev_{nm}.png', scale=3)
