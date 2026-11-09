"""DIRGE — Azure Witch (mage). v2 = matches the select illustration:
wide blue witch hat with a gold band, long black hair, blue robe with gold trim, brown corset,
wooden staff with a blue gem; arcane-blue magic."""
from rig import *

W, H = 96, 64
AX, GY = 34, 62

PAL = dict(
    O='#141018', Z='#06040b',
    V='#1d1230', v='#3a2560', q='#5f42a0', Q='#8d6fd0',
    g='#c9952f', G='#7a5418', y='#f4d470',
    e='#efe0ff', E='#b48cff',
    w='#e8e4f0', s='#8a8296', S='#4a4458',
    b='#4a3020', n='#7a5236',
    j='#3aa8ff', z='#1c1c30', k='#f2dce4', K='#c8a6b8', i='#b060ff', r='#d0203c',
    B='#141a46', u='#22307a', U='#3446a8', W='#5a70d0',
)

HOOD = sprite('''
....uu..........
...Buuu.........
....BuUU........
.....BUUU.......
.....BuUUU......
....BugyjygB....
...BuuUUUUUU....
BBBuuuuUUUUUWWUU
..zOOzzkkkkk....
..OOzzkkkkikk...
..OOzzkkkkkkK...
..OOzOkkkrkK....
..OOz..kkkK.....
..OO..ugyjgu....
''', PAL)
HOOD_PV = (8, 13)

TORSO = sprite('''
...gjg...
..uUgUUB.
.BuUUUUU.
.BuUUUUW.
.BuUUUWU.
.Bbbnnbb.
.BbnyynB.
.Bbbnnbb.
..BuUUUU.
''', PAL)
TORSO_PV = (4, 8)

STAFF = sprite('''
.g.g.
gy.yg
g...g
.gyg.
..y..
..n..
..b..
..n..
..b..
..n..
..b..
..n..
..b..
..n..
..b..
..n..
..b..
..n..
..b..
..n..
..b..
..n..
..b..
..n..
..b..
..n..
..g..
''', PAL)
STAFF_PV = (2, 14)
STAFF_ORB = (2, 2)  # local position of orb inside the crook

ROBE = ramp('#141a46', '#22307a', '#3446a8')
ROBE_F = ramp('#0e1232', '#18225a', '#26347e')
SLEEVE = ROBE
SLEEVE_F = ROBE_F
HAND = ramp('#a888a0', '#f2dce4', '#fff2f6')
HAND_F = ramp('#80687c', '#c4aab8', '#dcc8d2')
BOOT = ramp('#120c18', '#261a30', '#3c2c48')
SOUL = hx('#8fd8ff')
SOUL_CORE = hx('#ffffff')
SOUL_DARK = hx('#2f6ae0')


def orb_fx(c, r=3, k=1.0):
    def f(J):
        g = glow(W, H, c, r * 2.6 * k, hx('#5ab4ff'), 0.55)
        l = Layer(W, H)
        l.ellipse(c[0] - 0.5, c[1] - 0.5, r * 0.7 * k, r * 0.7 * k, [SOUL_DARK, SOUL, SOUL_CORE])
        l.px(c[0] - 1, c[1] - 1, SOUL_CORE)
        return blend_over(g, outline(l.a, hx('#0c1c48')))
    return f


class Dirge(Humanoid):
    def __init__(self):
        super().__init__(W, H, dict(torso=10, shdrop=2, ua=6, fa=6, th=7, sh=8, shx=1, hipx=1))

    def draw(self, pose):
        J = self.solve(pose)
        t = J['t']
        back, body, front = self.L_(), self.L_(), self.L_()
        hp = J['hip']
        # feet (only boots visible under robe)
        for side, rmp in (('f', BOOT), ('n', BOOT)):
            lay = back if side == 'f' else body
            boot(lay, J[side + 'ank'], 90, rmp, 4, 2)
        arm(back, J, 'f', SLEEVE_F, SLEEVE_F, HAND_F, wu=3, wf=3, hand_r=1)
        # v2: long black hair down the back to the hips
        nk = J['neck']; hw = pose.get('wind', 0.5); hph = pose.get('cph', 0)
        hair = [(nk[0] - 2, nk[1] - 4), (nk[0] - 6, nk[1] - 3), (nk[0] - 7 - hw * 1.5, nk[1] + 4),
                (nk[0] - 6 - hw * 2.5 + math.sin(hph) * 0.6, hp[1] + 3), (nk[0] - 3 - hw * 1.5, hp[1] + 4),
                (nk[0] - 2, nk[1] + 3)]
        back.poly(hair, ramp('#06060c', '#14142a', '#2a2a48'), True, light='left')
        # robe skirt from waist to hem following the feet
        wv = pose.get('wind', 0.5); ph = pose.get('cph', 0)
        up = J['up']
        waist = add(hp, up, 1)
        fa, na = J['fank'], J['nank']
        bx = min(fa[0], na[0]) - 3 - wv * 2
        fx_ = max(fa[0], na[0]) + 3 + max(0, -wv) * 2
        hem_y = max(fa[1], na[1]) + 0.5
        pts = [(waist[0] - 4, waist[1]), (waist[0] + 4, waist[1])]
        n = 6
        for i in range(n + 1):
            u = i / n
            x = fx_ * (1 - u) + bx * u
            y = hem_y + (0.8 if i % 2 else 0) + math.sin(ph + u * 3) * 0.6 * abs(wv) - (u * 1.5 * wv)
            pts.append((x, y))
        body.poly(pts, ROBE, True, light='left')
        # gold hem trim
        trim = Layer(W, H)
        for i in range(len(pts) - 3):
            a, b2 = pts[2 + i], pts[3 + i]
            trim.line((a[0], a[1] - 1), (b2[0], b2[1] - 1), hx('#c9952f'))
        over(body.a, trim.a)
        body.part(TORSO, TORSO_PV, hp, deg=t)
        body.part(HOOD, HOOD_PV, J['neck'], deg=t + pose.get('hd', 0))
        # staff in near hand
        sa = pose.get('st', 8)
        if pose.get('staff', True):
            front.part(STAFF, STAFF_PV, J['nhand'], deg=sa)
        arm(front, J, 'n', SLEEVE, SLEEVE, HAND, wu=3, wf=3, hand_r=1)
        # sleeve cuff flare
        fxs = []
        if pose.get('staff', True) and pose.get('orb', True):
            r = math.radians(sa)
            ox, oy = STAFF_ORB[0] - STAFF_PV[0], STAFF_ORB[1] - STAFF_PV[1]
            c = (J['nhand'][0] + ox * math.cos(r) - oy * math.sin(r) + 0.5,
                 J['nhand'][1] + ox * math.sin(r) + oy * math.cos(r) + 0.5)
            fxs.append(orb_fx(c, 3, pose.get('ok', 1.0)))
        fxa = None
        for f in fxs + pose.get('fx', []):
            arr = f(J)
            fxa = arr if fxa is None else blend_over(fxa, arr)
        return self.compose([back, body, front], fx=fxa)


R = Dirge()
HY = GY - 14
BASE = dict(hip=(AX, HY), t=2, nf=(AX + 3, GY - 3), ff=(AX - 3, GY - 3),
            nh=(AX + 9, HY - 1), st=10, fh=(AX + 3, HY + 1), wind=0.5)


def idle():
    fr = []
    for i in range(8):
        b = math.sin(i / 8 * 2 * math.pi)
        fr.append(P(BASE, hip=(AX, HY + round(b * 0.6 + 0.4)), nh=(AX + 9, HY - 1 + round(b)),
                    ok=1.0 + 0.15 * b, cph=i * 0.8, fh=(AX + 3, HY + 1 + round(b * 0.6))))
    return fr


def run_cycle(n, A, lift, back=False):
    out = []
    for i in range(n):
        ph = i / n * 2 * math.pi
        def foot(p):
            mf = -math.sin(p) * (1 if not back else -1)
            return (AX + A * math.cos(p), GY - 3 - max(0, mf) * lift)
        out.append((ph, foot(ph), foot(ph + math.pi), -abs(math.sin(ph)) * 1.2 + 0.6))
    return out


def run():
    fr = []
    for ph, nf, ff, hb in run_cycle(8, 5, 3):
        sw = math.sin(ph)
        fr.append(P(BASE, hip=(AX + 1, HY + 1 + hb), t=12, nf=nf, ff=ff, nh=(AX + 7, HY - 1 + hb),
                    st=30, fh=(AX - 2 - sw * 2, HY + 1 + hb), wind=1.8, cph=ph * 2))
    return fr


def backstep():
    fr = []
    for ph, nf, ff, hb in run_cycle(6, 4, 2, back=True):
        fr.append(P(BASE, hip=(AX - 1, HY + hb * 0.5), t=-4, nf=nf, ff=ff, nh=(AX + 6, HY - 3 + hb),
                    st=-4, fh=(AX + 7, HY - 5), wind=-0.6, cph=ph))
    return fr


def bolt_fx(x, y, length, k=1.0):
    def f(J):
        l = Layer(W, H)
        for i in range(length):
            u = i / max(1, length - 1)
            c = SOUL_DARK if u < 0.4 else SOUL if u < 0.85 else SOUL_CORE
            yy = y + round(math.sin(i * 0.9) * (1 - u) * 1.5)
            l.px(x + i, yy, c)
            if u > 0.5:
                l.px(x + i, yy - 1, SOUL_DARK); l.px(x + i, yy + 1, SOUL_DARK)
        hx_ = x + length
        g = glow(W, H, (hx_, y), 6 * k, hx('#5ab4ff'), 0.7)
        h = Layer(W, H); h.ellipse(hx_, y, 2 * k, 2 * k, [SOUL_DARK, SOUL, SOUL_CORE])
        return blend_over(blend_over(g, l.a), h.a)
    return f


def rune_fx(c, r, prog, alpha=1.0):
    """ground spell circle in perspective (flattened ellipse) with rotating runes."""
    def f(J):
        l = Layer(W, H)
        n = 40
        for i in range(n):
            if i / n > prog:
                break
            a = i / n * 2 * math.pi
            l.px(c[0] + math.cos(a) * r, c[1] + math.sin(a) * r * 0.3, SOUL)
            l.px(c[0] + math.cos(a) * (r - 3), c[1] + math.sin(a) * (r - 3) * 0.3, SOUL_DARK)
        for k in range(6):
            a = k / 6 * 2 * math.pi + prog * 2
            p = (c[0] + math.cos(a) * (r - 1.5), c[1] + math.sin(a) * (r - 1.5) * 0.3)
            l.px(p[0], p[1], SOUL_CORE)
        g = glow(W, H, c, r * 0.9, hx('#5ab4ff'), 0.35 * alpha)
        a = blend_over(g, l.a)
        a[..., 3] = (a[..., 3] * alpha).astype(np.uint8)
        return a
    return f


def pillar_fx(x, y0, hgt, w):
    def f(J):
        l = Layer(W, H)
        for yy in range(int(y0 - hgt), int(y0)):
            ww = w * (0.6 + 0.4 * ((y0 - yy) / max(1, hgt)))
            for xx in range(int(x - ww), int(x + ww) + 1):
                d = abs(xx - x) / max(1, ww)
                c = SOUL_CORE if d < 0.35 else SOUL if d < 0.75 else SOUL_DARK
                if (xx + yy) % 7 == 0 and d > 0.5:
                    continue
                l.px(xx, yy, c)
        g = glow(W, H, (x, y0 - hgt / 2), hgt * 0.6, hx('#5ab4ff'), 0.45)
        return blend_over(g, l.a)
    return f


def attack1():
    """soul bolt"""
    hy = HY
    k0 = P(BASE, t=-4, nh=(AX + 3, hy - 4), st=-14, fh=(AX + 1, hy - 2), ok=1.2)
    k1 = P(BASE, t=-8, nh=(AX + 1, hy - 6), st=-26, fh=(AX + 0, hy - 3), ok=1.5, wind=-0.2)
    k2 = P(BASE, t=12, hip=(AX + 2, hy + 1), nf=(AX + 7, GY - 3), nh=(AX + 12, hy - 7), st=70, ok=1.0,
           fh=(AX + 2, hy + 1), wind=1.2, fx=[bolt_fx(AX + 25, hy - 13, 14)])
    k3 = P(k2, fx=[bolt_fx(AX + 36, hy - 13, 20, 1.2)], ok=0.8)
    k4 = P(BASE, t=8, hip=(AX + 1, hy), nf=(AX + 5, GY - 3), nh=(AX + 10, hy - 4), st=45)
    k5 = P(BASE)
    return [k0, k1, k2, k3, k4, k5]


def attack2():
    """ground sigil → soul pillar"""
    hy = HY
    cx = AX + 34
    k0 = P(BASE, t=-2, nh=(AX + 6, hy - 6), st=0, fh=(AX + 8, hy - 4), ok=1.2)
    k1 = P(BASE, t=-6, nh=(AX + 6, hy - 12), st=-4, fh=(AX + 10, hy - 6), ok=1.5,
           fx=[rune_fx((cx, GY - 2), 11, 0.5)])
    k2 = P(k1, nh=(AX + 6, hy - 14), ok=1.7, fx=[rune_fx((cx, GY - 2), 11, 1.0)])
    k3 = P(BASE, t=10, hip=(AX + 1, hy + 1), nh=(AX + 9, hy - 2), st=10, fh=(AX + 11, hy - 5), ok=1.0,
           fx=[rune_fx((cx, GY - 2), 11, 1.0), pillar_fx(cx, GY - 2, 30, 5)])
    k4 = P(k3, fx=[rune_fx((cx, GY - 2), 11, 1.0, 0.7), pillar_fx(cx, GY - 2, 44, 6)])
    k5 = P(k3, fx=[rune_fx((cx, GY - 2), 11, 1.0, 0.4), pillar_fx(cx, GY - 2, 46, 3)])
    k6 = P(BASE, t=4, nh=(AX + 7, hy - 2), fx=[rune_fx((cx, GY - 2), 11, 1.0, 0.2)])
    k7 = P(BASE)
    return [k0, k1, k2, k3, k4, k5, k6, k7]


def wave_fx(x0, x1, y, alpha=1.0, phase=0):
    def f(J):
        l = Layer(W, H)
        for x in range(int(x0), int(x1)):
            u = (x - x0) / max(1, x1 - x0)
            hgt = int(3 + 6 * math.sin(u * math.pi) + 2 * math.sin(x * 0.8 + phase))
            for k in range(hgt):
                c = SOUL_CORE if k < 2 else SOUL if k < hgt * 0.6 else SOUL_DARK
                if (x * 3 + k + int(phase * 3)) % 5 == 0 and k > 2:
                    continue
                l.px(x, y - k, c)
        a = blend_over(glow(W, H, ((x0 + x1) / 2, y - 4), (x1 - x0) / 2, hx('#5ab4ff'), 0.35), l.a)
        a[..., 3] = (a[..., 3] * alpha).astype(np.uint8)
        return a
    return f


def attack3():
    """dirge wave — staff slammed down, a rolling tide of soul-fire"""
    hy = HY
    k0 = P(BASE, t=-6, nh=(AX + 4, hy - 13), st=-10, fh=(AX + 6, hy - 10), ok=1.4, hip=(AX, hy - 1))
    k1 = P(k0, nh=(AX + 3, hy - 15), ok=1.8, hip=(AX, hy - 2), nf=(AX + 3, GY - 4), ff=(AX - 3, GY - 4))
    k2 = P(BASE, t=16, hip=(AX + 2, hy + 3), nf=(AX + 8, GY - 3), nh=(AX + 14, hy + 4), st=40, ok=0.9,
           fh=(AX + 4, hy + 2), fx=[wave_fx(AX + 14, AX + 30, GY - 1)])
    k3 = P(k2, fx=[wave_fx(AX + 18, AX + 44, GY - 1, phase=1)])
    k4 = P(k2, fx=[wave_fx(AX + 26, AX + 58, GY - 1, phase=2)])
    k5 = P(BASE, t=8, nh=(AX + 10, hy), st=30, fx=[wave_fx(AX + 36, AX + 62, GY - 1, 0.5, phase=3)])
    k6 = P(BASE)
    return [k0, k1, k2, k3, k4, k5, k6]


def hurt():
    hy = HY
    k0 = P(BASE, t=-16, hd=-12, hip=(AX - 3, hy), nh=(AX + 1, hy - 3), st=-30, fh=(AX - 1, hy - 5),
           ok=0.6, wind=1.6)
    k1 = P(k0, t=-10, hd=-6, hip=(AX - 2, hy + 1), ok=0.8)
    k2 = P(BASE, hip=(AX - 1, hy + 1))
    return [k0, k1, k2]


def death():
    """v2: staggers, kneels, falls; a few arcane motes drift off"""
    hy = HY
    k0 = P(BASE, t=-16, hd=-12, hip=(AX - 3, hy), nh=(AX + 1, hy - 3), st=-30, ok=0.6, wind=1.6)
    k1 = P(BASE, t=10, hd=14, hip=(AX, hy + 4), nh=(AX + 8, hy + 6), st=60, ok=0.4,
           nf=(AX + 4, GY - 3), ff=(AX - 4, GY - 3))
    k2 = P(BASE, t=24, hd=24, hip=(AX + 1, hy + 7), nh=(AX + 10, hy + 9), st=80, ok=0.2, orb=False)
    frames = [R.draw(p) for p in (k0, k1, k2)]
    kneel = frames[-1]
    rng = np.random.default_rng(3)
    for n, deg in enumerate((25, 55, 80, 90, 90)):
        img, pv = rotsprite(kneel, deg, (AX + 4, GY))
        l = Layer(W, H); l.paste(img, AX + 4 - pv[0], GY - pv[1])
        out = l.a
        ys = np.nonzero(out[..., 3] > 0)[0]
        out = np.roll(out, GY - 1 - ys.max(), axis=0)
        m = Layer(W, H)
        for i in range(6 - n):
            m.px(AX + rng.integers(-4, 14), GY - 8 - n * 4 - rng.integers(0, 10), SOUL if i % 2 else SOUL_CORE)
        frames.append(blend_over(out, m.a))
    return frames


def build(outdir):
    return {
        'idle': ([R.draw(p) for p in idle()], 120, True, None),
        'run': ([R.draw(p) for p in run()], 78, True, None),
        'back': ([R.draw(p) for p in backstep()], 100, True, None),
        'attack1': ([R.draw(p) for p in attack1()], 70, False, 2),
        'attack2': ([R.draw(p) for p in attack2()], 75, False, 3),
        'attack3': ([R.draw(p) for p in attack3()], 70, False, 3),
        'hurt': ([R.draw(p) for p in hurt()], 95, False, None),
        'death': (death(), 105, False, None),
    }


if __name__ == '__main__':
    clips = build('out')
    preview([c[0] for c in clips.values()], 'prev_dirge.png', scale=3)
