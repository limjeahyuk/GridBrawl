"""SABLE — Ashen Fletcher (archer). v2 = matches the select illustration:
feathered green hat, green cowl + long cape, olive tunic, brown leather, longbow, quiver."""
from rig import *

W, H = 96, 64
AX, GY = 34, 62

PAL = dict(
    O='#141018',
    C='#24232c', c='#44434f', x='#6d6c7a', X='#9a98a6',
    B='#2e1f17', b='#5c3f2c', n='#8a6244',
    f='#c4501c', F='#7a2a10', y='#ffa24a',
    k='#e3aa86', K='#a8705a', H='#2a1a1e', e='#ffcf6a',
    g='#b8862e', w='#d8dde6', s='#6b7a8f',
    m='#16301f', M='#25472f', N='#3c6646', q='#efe2c0', Q='#c9b48a',
    a='#7a5a3a', A='#b08a5a', i='#d89a2a',
    t='#4a5a2a', T='#323d1b', u='#66783a', v='#8a9a50', d='#2a4a36', D='#3e6650',
)

HOOD = sprite('''
.......qQ....
......qQ.....
....mMMNN....
...mMMMMNM...
.mmmmmMMMMmm.
..aaAkkkk....
..aakkkikk...
..aAkkkkkK...
...akkKkK....
...dkkkK.....
..dDDDDd.....
''', PAL)
HOOD_PV = (5, 10)

TORSO = sprite('''
..dDDDd..
.dDDDDDd.
.TtbttuT.
.TttbtuT.
.TtttbuT.
.TttttbT.
.TttttuT.
..BbgbB..
..TttuuT.
..TttutT.
..Tt.tuT.
..T...uT.
..T....T.
''', PAL)
TORSO_PV = (4, 10)

QUIVER = sprite('''
q.q.q
Q.Q.Q
b.b.b
bnnbB
BbnbB
BbnbB
BbnbB
BbnbB
BbnbB
.BBB.
''', PAL)
QUIVER_PV = (2, 6)

SLEEVE = ramp('#323d1b', '#4a5a2a', '#6a7c3c')
SLEEVE_F = ramp('#232b13', '#36421e', '#4c5a2a')
BRACER = ramp('#2e1f17', '#5c3f2c', '#8a6244')
BRACER_F = ramp('#21160f', '#412d1f', '#63462f')
SKIN = ramp('#a8705a', '#e3aa86', '#f3c9a8')
SKIN_F = ramp('#7d5242', '#b08068', '#c99a80')
PANTS = ramp('#3a2416', '#5e3e26', '#86603c')
PANTS_F = ramp('#2a1a10', '#44301e', '#624630')
BOOT = ramp('#24170f', '#4d3324', '#76503a')
BOOT_F = ramp('#1a100a', '#382419', '#553a29')
WOOD = ramp('#3e2616', '#8a5a34', '#c08a52')
SCARF = ramp('#14261c', '#24402e', '#3a5e44')  # v2: long green cape
STRING = hx('#e8e2d0')
EMBER = [hx('#c4501c'), hx('#ffa24a'), hx('#fff2c0')]


def bow_points(grip, tilt, L=22, c=5):
    pts = []
    for i in range(-10, 11):
        s = i / 10
        lx = -c * s * s
        ly = s * L / 2
        r = math.radians(tilt)
        x = lx * math.cos(r) - ly * math.sin(r)
        y = lx * math.sin(r) + ly * math.cos(r)
        pts.append((grip[0] + x, grip[1] + y))
    return pts


class Sable(Humanoid):
    def __init__(self):
        super().__init__(W, H, dict(torso=11, shdrop=2, ua=6, fa=6, th=8, sh=8, shx=1, hipx=1))

    def draw(self, pose):
        J = self.solve(pose)
        t = J['t']
        scarf, back, body, bow, front = [self.L_() for _ in range(5)]
        nk, hp = J['neck'], J['hip']
        wv = pose.get('wind', 1.0); ph = pose.get('cph', 0)
        # v2: long green cape from the shoulders, flowing back
        tail = []
        for i in range(7):
            u = i / 6
            tail.append((nk[0] - 2 - u * (5 + 4 * wv), nk[1] + 2 + u * (16 - 3 * wv) + math.sin(ph + u * 4) * 1.0 * wv))
        top = [(nk[0] + 1 - u * 1.5, nk[1] + 1 + i * 2.6) for i, u in enumerate([k / 6 for k in range(7)])]
        scarf.poly(top + tail[::-1], SCARF, True, light='left')
        # quiver on the back
        qa = add(hp, J['up'], 7)
        back.part(QUIVER, QUIVER_PV, add(qa, (-3, 0)), deg=t - 28)
        leg(back, J, 'f', PANTS_F, BOOT_F, BOOT_F, wt=3, ws=3, toe=pose.get('ftoe', 90))
        arm(back, J, 'f', SLEEVE_F, BRACER_F, SKIN_F, wu=3, wf=2)
        leg(body, J, 'n', PANTS, BOOT, BOOT, wt=3, ws=3, toe=pose.get('ntoe', 90))
        body.part(TORSO, TORSO_PV, hp, deg=t)
        body.part(HOOD, HOOD_PV, nk, deg=t + pose.get('hd', 0))
        # bow in far hand
        if pose.get('bow', True):
            g = J['fhand']
            pts = bow_points(g, pose.get('bt', 0), L=pose.get('bl', 22), c=pose.get('bc', 5))
            for i in range(len(pts) - 1):
                w = 2 if 4 <= i <= 15 else 2
                bow.seg(pts[i], pts[i + 1], w, WOOD, shade=False)
            # grip wrap
            bow.seg(g, g, 2, BRACER, shade=False)
            tipA, tipB = pts[0], pts[-1]
            nock = J['nhand'] if pose.get('drawn') else None
            sl = Layer(W, H)
            if nock is not None:
                sl.line(tipA, nock, STRING); sl.line(nock, tipB, STRING)
            else:
                vib = pose.get('vib', 0)
                mid = ((tipA[0] + tipB[0]) / 2 - 1 + vib, (tipA[1] + tipB[1]) / 2)
                sl.line(tipA, mid, STRING); sl.line(mid, tipB, STRING)
            over(bow.a, sl.a)
            if pose.get('arrow') and nock is not None:
                dx, dy = g[0] - nock[0], g[1] - nock[1]
                d = math.hypot(dx, dy) or 1
                ux, uy = dx / d, dy / d
                tip = (g[0] + ux * 4, g[1] + uy * 4)
                al = Layer(W, H)
                al.line(nock, tip, hx('#8a6244'))
                al.px(tip[0], tip[1], hx('#d8dde6')); al.px(tip[0] - ux, tip[1] - uy, hx('#9aa6b8'))
                al.px(nock[0] - ux * 0, nock[1] - 1, hx('#ffa24a')); al.px(nock[0] + ux, nock[1] - 1, hx('#c4501c'))
                over(front.a, al.a)
        arm(front, J, 'n', SLEEVE, BRACER, SKIN, wu=3, wf=2)
        fxa = None
        for f in pose.get('fx', []):
            arr = f(J)
            fxa = arr if fxa is None else blend_over(fxa, arr)
        return self.compose([scarf, back, body, bow, front], fx=fxa)


R = Sable()
HY = GY - 15
BASE = dict(hip=(AX, HY), t=3, nf=(AX + 4, GY - 3), ff=(AX - 3, GY - 3),
            fh=(AX + 7, HY - 3), bt=-20, nh=(AX + 2, HY - 1), wind=0.6)


def run_cycle(n, A, lift, back=False):
    out = []
    for i in range(n):
        ph = i / n * 2 * math.pi
        def foot(p):
            x = AX + A * math.cos(p)
            mf = -math.sin(p) * (1 if not back else -1)
            return (x, GY - 3 - max(0, mf) * lift)
        out.append((ph, foot(ph), foot(ph + math.pi), -abs(math.sin(ph)) * 1.6 + 0.8))
    return out


def idle():
    fr = []
    for i in range(6):
        b = [0, 0, 1, 1, 1, 0][i]
        fr.append(P(BASE, hip=(AX, HY + b), fh=(AX + 7, HY - 3 + b), nh=(AX + 2, HY - 1 + b),
                    cph=i * 1.0, wind=0.6))
    return fr


def run():
    fr = []
    for ph, nf, ff, hb in run_cycle(8, 7, 5):
        sw = math.sin(ph)
        fr.append(P(BASE, hip=(AX + 1, HY + 1 + hb), t=16, nf=nf, ff=ff,
                    ntoe=90 if nf[1] >= GY - 3.5 else 125, ftoe=90 if ff[1] >= GY - 3.5 else 125,
                    fh=(AX + 6 + sw * 3, HY - 2 + hb), bt=-55 + sw * 8,
                    nh=(AX - 1 - sw * 4, HY + 1 + hb), wind=2.2, cph=ph * 2))
    return fr


def backstep():
    fr = []
    for ph, nf, ff, hb in run_cycle(6, 5, 3, back=True):
        fr.append(P(BASE, hip=(AX - 1, HY + 1 + hb * 0.5), t=-3, nf=nf, ff=ff,
                    fh=(AX + 9, HY - 6 + hb), bt=-5, nh=(AX + 3, HY - 4 + hb),
                    wind=-0.3, cph=ph))
    return fr


def streak_fx(y, x0, x1, cols=EMBER, thick=1):
    def f(J):
        l = Layer(W, H)
        for x in range(int(x0), int(x1)):
            u = (x - x0) / max(1, x1 - x0)
            c = cols[0] if u < 0.35 else cols[1] if u < 0.8 else cols[2]
            l.px(x, y, c)
            if thick > 1 and u > 0.3:
                l.px(x, y - 1, cols[0]); l.px(x, y + 1, cols[0])
        # arrow head
        l.px(x1, y, hx('#ffffff')); l.px(x1 + 1, y, hx('#ffffff'))
        return l.a
    return f


def attack1():
    hy = HY
    aim = hy - 7
    k0 = P(BASE, t=2, fh=(AX + 8, hy - 4), bt=-10, nh=(AX + 4, hy - 4))
    k1 = P(BASE, t=0, fh=(AX + 12, aim), bt=0, nh=(AX + 6, aim), drawn=True, arrow=True,
           nf=(AX + 5, GY - 3), ff=(AX - 4, GY - 3))
    k2 = P(k1, nh=(AX + 0, aim - 1), bc=6, t=-2, hd=2)
    k3 = P(k1, nh=(AX - 1, aim - 2), drawn=False, arrow=False, vib=2, t=-4,
           fx=[streak_fx(aim, AX + 14, AX + 58)])
    k4 = P(k3, vib=-1, fx=[streak_fx(aim, AX + 40, AX + 62)])
    k5 = P(BASE, t=2, fh=(AX + 10, hy - 5), bt=-8, nh=(AX + 2, hy - 2))
    k6 = P(BASE)
    return [k0, k1, k2, k3, k4, k5, k6]


def charge_fx(c, r, k):
    def f(J):
        g = glow(W, H, c, r, hx('#ff8a3a'), 0.75)
        l = Layer(W, H)
        for i in range(k):
            a = i * 2.4 + r
            p = (c[0] + math.cos(a) * (r + 2), c[1] + math.sin(a) * (r + 2) * 0.7)
            l.px(p[0], p[1], hx('#ffd27a'))
        return blend_over(g, l.a)
    return f


def attack2():
    """charged ember shot"""
    hy = HY
    aim = hy - 7
    k0 = P(BASE, t=4, hip=(AX, hy + 2), fh=(AX + 11, aim + 1), bt=0, nh=(AX + 6, aim + 1),
           drawn=True, arrow=True, nf=(AX + 6, GY - 3), ff=(AX - 5, GY - 3))
    k1 = P(k0, nh=(AX + 1, aim), bc=6, t=-2, fx=[charge_fx((AX + 16, aim), 3, 3)])
    k2 = P(k1, nh=(AX - 1, aim - 1), bc=7, t=-4, fx=[charge_fx((AX + 16, aim), 5, 5)])
    k3 = P(k2, fx=[charge_fx((AX + 16, aim), 6, 7)])
    k4 = P(k2, nh=(AX - 3, aim - 2), drawn=False, arrow=False, vib=3, t=-8, hip=(AX - 2, hy + 2),
           fx=[streak_fx(aim, AX + 14, AX + 62, thick=3), lambda J: glow(W, H, (AX + 15, aim), 8, hx('#ffd27a'), 0.8)])
    k5 = P(k4, vib=-2, fx=[streak_fx(aim, AX + 34, AX + 64, thick=3)])
    k6 = P(BASE, t=2, hip=(AX - 1, hy + 1), fh=(AX + 9, hy - 5), bt=-8)
    k7 = P(BASE)
    return [k0, k1, k2, k3, k4, k5, k6, k7]


def volley_fx(n, phase):
    def f(J):
        l = Layer(W, H)
        for i in range(n):
            x0 = AX + 18 + i * 5 + phase * 6
            y0 = HY - 14 - i * 3 - phase * 6
            for k in range(6):
                l.px(x0 + k, y0 - k, EMBER[1] if k < 4 else EMBER[2])
        return l.a
    return f


def attack3():
    """arc volley — aims high and looses three arrows"""
    hy = HY
    k0 = P(BASE, t=-4, fh=(AX + 9, hy - 10), bt=-40, nh=(AX + 4, hy - 6))
    k1 = P(BASE, t=-12, hip=(AX - 1, hy + 2), fh=(AX + 9, hy - 16), bt=-45,
           nh=(AX + 1, hy - 8), drawn=True, arrow=True, hd=-10, nf=(AX + 6, GY - 3), ff=(AX - 5, GY - 3))
    k2 = P(k1, nh=(AX - 1, hy - 7), bc=6)
    k3 = P(k2, drawn=False, arrow=False, vib=2, fx=[volley_fx(3, 0)])
    k4 = P(k3, vib=-1, fx=[volley_fx(3, 1)])
    k5 = P(k3, vib=0, fx=[volley_fx(3, 2)])
    k6 = P(BASE)
    return [k0, k1, k2, k3, k4, k5, k6]


def hurt():
    hy = HY
    k0 = P(BASE, t=-16, hd=-12, hip=(AX - 3, hy), fh=(AX + 3, hy - 1), bt=-40, nh=(AX - 3, hy - 4),
           nf=(AX + 4, GY - 3), ff=(AX - 6, GY - 3), wind=1.5)
    k1 = P(k0, t=-10, hd=-6, hip=(AX - 2, hy + 1))
    k2 = P(BASE, hip=(AX - 1, hy + 1))
    return [k0, k1, k2]


def death():
    hy = HY
    k0 = P(BASE, t=-18, hd=-14, hip=(AX - 3, hy), fh=(AX + 2, hy), bt=-60, nh=(AX - 4, hy - 4),
           nf=(AX + 4, GY - 3), ff=(AX - 6, GY - 3), wind=1.5)
    k1 = P(BASE, t=-4, hd=10, hip=(AX - 1, hy + 4), fh=(AX + 6, hy + 5), bt=-80, nh=(AX + 3, hy + 6),
           nf=(AX + 6, GY - 3), ff=(AX - 4, GY - 3))
    k2 = P(BASE, t=16, hd=18, hip=(AX, hy + 7), fh=(AX + 9, hy + 8), bt=-90, nh=(AX + 6, hy + 9),
           nf=(AX + 7, GY - 3), ff=(AX - 7, GY - 3), wind=0.2)
    frames = [R.draw(p) for p in (k0, k1, k2)]
    kneel = frames[-1]
    for deg in (25, 55, 80, 90, 90):
        img, pv = rotsprite(kneel, deg, (AX + 4, GY))
        l = Layer(W, H); l.paste(img, AX + 4 - pv[0], GY - pv[1])
        out = l.a
        ys = np.nonzero(out[..., 3] > 0)[0]
        out = np.roll(out, GY - 1 - ys.max(), axis=0)
        frames.append(out)
    return frames


def projectile():
    """separate arrow projectile strips: normal + ember (charged)"""
    a = Layer(16, 5)
    a.line((1, 2), (12, 2), hx('#8a6244'))
    a.px(13, 2, hx('#d8dde6')); a.px(14, 2, hx('#ffffff')); a.px(13, 1, hx('#9aa6b8')); a.px(13, 3, hx('#9aa6b8'))
    a.px(0, 1, hx('#ffa24a')); a.px(1, 1, hx('#c4501c')); a.px(0, 3, hx('#ffa24a')); a.px(1, 3, hx('#c4501c'))
    normal = outline(a.a)
    frames = []
    for i in range(4):
        l = Layer(24, 9)
        for x in range(0, 14):
            y = 4 + (1 if (x + i) % 5 == 0 else 0) * (-1 if i % 2 else 1)
            c = EMBER[0] if x < 5 else EMBER[1] if x < 11 else EMBER[2]
            l.px(x, 4, c)
            if x > 4 and (x + i) % 3 == 0:
                l.px(x - 1, 3, EMBER[0]); l.px(x - 2, 5, EMBER[0])
        l.paste(normal, 8, 2)
        frames.append(blend_over(glow(24, 9, (17, 4), 6, hx('#ff8a3a'), 0.5), l.a))
    return normal, frames


def build(outdir):
    return {
        'idle': ([R.draw(p) for p in idle()], 125, True, None),
        'run': ([R.draw(p) for p in run()], 72, True, None),
        'back': ([R.draw(p) for p in backstep()], 95, True, None),
        'attack1': ([R.draw(p) for p in attack1()], 60, False, 3),
        'attack2': ([R.draw(p) for p in attack2()], 70, False, 4),
        'attack3': ([R.draw(p) for p in attack3()], 66, False, 3),
        'hurt': ([R.draw(p) for p in hurt()], 95, False, None),
        'death': (death(), 100, False, None),
    }


if __name__ == '__main__':
    clips = build('out')
    preview([c[0] for c in clips.values()], 'prev_sable.png', scale=3)
