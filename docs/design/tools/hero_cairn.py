"""CAIRN — Oathbound Warden (warrior). v2 = matches the select illustration:
bare head with messy brown hair, silver plate, red cape, ornate longsword (no shield)."""
from rig import *

W, H = 96, 64
AX, GY = 34, 62

PAL = dict(
    O='#141018',
    S='#38435a', s='#6c7f99', l='#a8bacb', w='#eef4f8',
    T='#0f3540', t='#1d6670', u='#3c9c98', v='#7fd6c8',
    G='#7d5016', g='#cf9a34', y='#f6d978',
    B='#2e1d14', b='#5e3b24', n='#8a5a36',
    R='#5c1420', r='#a82c3a', p='#e05a66',
    e='#b9fff3', E='#2bb3a3',
    h='#4a2c18', H='#7a4c2a', j='#a8703e', k='#e6b08c', K='#b07a60', i='#4a8ad8', D='#1c1a24',
)

HELM = sprite('''
..jHHj....
.HHjHHHj..
HHHHjHHHj.
HHHHHHHHHj
hHHHkkkkH.
hHHkkkkik.
.hHkkkkkkK
.hHkkkKkk.
..hkkkKK..
...kkkK...
...rrrr...
''', PAL)
HELM_PV = (4, 10)

TORSO = sprite('''
..RrrrrR...
.RrSsllsR..
.RSsllllwS.
.SslllgllS.
.SsllgyglS.
.SsllgglsS.
.SSsllllsS.
..SSsssssS.
..BbgybbB..
..DDDDDDD..
..SsDDDsS..
..SsD.DsS..
..SsD.DsS..
..Ss...sS..
...S...S...
''', PAL)
TORSO_PV = (5, 12)

PAULDRON = sprite('''
.Sllw.
Sslllws
SssllsS
.SSssS.
''', PAL)
PAUL_PV = (3, 1)

SWORD = sprite('''
..w..
..wl.
.wlS.
.wlS.
.wlS.
.wlS.
.wlS.
.wlS.
.wlS.
.wlS.
.wlS.
.wlS.
.wlS.
.wlS.
Gyyyg
.GgG.
..b..
..n..
.gyg.
''', PAL)
SWORD_PV = (2, 16)

SHIELD = sprite('''
GgyyyyyG
gTttttug
gTtyytug
gTyyyyug
gTtyytug
gTtyytuG
.gTyytG.
.gTttuG.
..gTuG..
..gTuG..
...gG...
''', PAL)
SHIELD_PV = (4, 4)

CHAIN = ramp('#38435a', '#6c7f99', '#a8bacb')
CHAIN_F = ramp('#272f40', '#4b5a70', '#73869c')
STEEL = ramp('#38435a', '#6c7f99', '#a8bacb')
STEEL_F = ramp('#272f40', '#4b5a70', '#73869c')
BOOT = ramp('#1f2430', '#3d475a', '#66748a')
BOOT_F = ramp('#161a23', '#2c3442', '#4a5568')

CAPE = ramp('#4a0e18', '#8a1e2c', '#c8384a')
SLASH = [hx('#3c9c98'), hx('#bff5ec'), hx('#ffffff')]


class Cairn(Humanoid):
    def __init__(self):
        super().__init__(W, H, dict(torso=12, shdrop=2, ua=6, fa=6, th=8, sh=8, shx=1, hipx=1))

    def draw(self, pose):
        J = self.solve(pose)
        t = J['t']
        back, body, shield, front = self.L_(), self.L_(), self.L_(), self.L_()
        cape = self.L_()
        nk, hp = J['neck'], J['hip']
        wv = pose.get('wind', 1.0)
        ph = pose.get('cph', 0)
        hem = []
        n = 5
        for i in range(n + 1):
            u = i / n
            x = (hp[0] - 7 - 3 * wv) * (1 - u) + (hp[0] - 1) * u
            y = hp[1] + 8 + (1.5 if i % 2 else -0.5) + math.sin(ph + u * 3) * 0.8 * wv - (1 - u) * 2 * wv
            hem.append((x, y))
        pts = [(nk[0] - 1, nk[1] + 1), (nk[0] - 3, nk[1] + 1), (nk[0] - 5 - 1.5 * wv, nk[1] + 6)] + hem + [(hp[0] - 1, hp[1] + 2), (nk[0], nk[1] + 3)]
        cape.poly(pts, CAPE, True, light='left')
        # far leg + far arm
        leg(back, J, 'f', CHAIN_F, STEEL_F, BOOT_F, wt=4, ws=3, toe=pose.get('ftoe', 90))
        arm(back, J, 'f', CHAIN_F, STEEL_F, STEEL_F, wu=3, wf=3)
        # body
        leg(body, J, 'n', CHAIN, STEEL, BOOT, wt=4, ws=3, toe=pose.get('ntoe', 90))
        body.part(TORSO, TORSO_PV, J['hip'], deg=t)
        body.part(HELM, HELM_PV, add(J['neck'], (0, 0)), deg=t + pose.get('hd', 0))
        # shield on far hand (drawn in front of torso)
        if pose.get('shield', False):
            shield.part(SHIELD, SHIELD_PV, J['fhand'], deg=pose.get('sh', 0))
        # sword then near arm on top
        if pose.get('sword', True):
            front.part(SWORD, SWORD_PV, J['nhand'], deg=pose.get('sw', 30))
        arm(front, J, 'n', CHAIN, STEEL, STEEL, wu=3, wf=3)
        front.part(PAULDRON, PAUL_PV, J['nsho'], deg=t * 0.5 + pose.get('pd', 0))
        fxa = None
        for f in pose.get('fx', []):
            arr = f(J)
            fxa = arr if fxa is None else blend_over(fxa, arr)
        groups = [cape, back, body, shield, front]
        if pose.get('shield_front'):
            groups = [cape, back, body, front, shield]
        return self.compose(groups, fx=fxa)


R = Cairn()
HY = GY - 15  # idle hip height
BASE = dict(hip=(AX, HY), t=5, nf=(AX + 4, GY - 3), ff=(AX - 4, GY - 3),
            nh=(AX + 4, HY - 3), fh=(AX + 5, HY - 2), sw=50, sh=0, shield_front=True, wind=0.6)


def idle():
    fr = []
    for i in range(6):
        b = [0, 0, 1, 1, 1, 0][i]
        fr.append(P(BASE, hip=(AX, HY + b), nh=(AX + 4, HY - 3 + b), fh=(AX + 5, HY - 2 + b),
                    sw=50 + b * 2, sh=b, cph=i, wind=0.6))
    return fr


def run_cycle(n=8, A=6, lift=4, lean=12, bob=1.5, back=False):
    fr = []
    for i in range(n):
        ph = i / n * 2 * math.pi
        sgn = -1 if back else 1
        def foot(p):
            x = AX + A * math.cos(p)
            moving_fwd = -math.sin(p) * (1 if not back else -1)
            y = GY - 3 - max(0, moving_fwd) * lift
            return (x + (1 if not back else -1), y)
        hb = -abs(math.sin(ph)) * bob + bob * 0.5
        fr.append((ph, foot(ph), foot(ph + math.pi), hb))
    return fr


def run():
    fr = []
    for ph, nf, ff, hb in run_cycle(8, A=7, lift=5, bob=1.6):
        sway = math.sin(ph)
        fr.append(P(BASE, hip=(AX + 1, HY + 1 + hb), t=14, nf=nf, ff=ff,
                    ntoe=90 if nf[1] >= GY - 3.5 else 120, ftoe=90 if ff[1] >= GY - 3.5 else 120,
                    nh=(AX + 6 - sway * 3, HY - 2 + hb), sw=60 - sway * 10,
                    fh=(AX + 4 + sway * 3, HY - 1 + hb), sh=5, wind=2.0, cph=ph * 2))
    return fr


def backstep():
    fr = []
    for ph, nf, ff, hb in run_cycle(6, A=5, lift=3, bob=1.0, back=True):
        fr.append(P(BASE, hip=(AX - 1, HY + 1 + hb * 0.6), t=-2, nf=nf, ff=ff,
                    nh=(AX + 4, HY - 5 + hb), sw=20, fh=(AX + 7, HY - 9 + hb), sh=-4,
                    ntoe=90, ftoe=90, wind=-0.2, cph=ph))
    return fr


def slash_fx(c, r0, r1, a0, a1, alpha=255):
    return lambda J: arc_fx(W, H, c, r0, r1, a0, a1, SLASH, alpha=alpha)


def attack1():
    hy = HY
    k0 = P(BASE, t=-4, hip=(AX - 1, hy), nh=(AX - 1, hy - 13), sw=-35, fh=(AX + 7, hy - 6))
    k1 = P(BASE, t=-8, hip=(AX - 2, hy + 1), nh=(AX - 4, hy - 12), sw=-70, fh=(AX + 7, hy - 5),
           nf=(AX + 5, GY - 3))
    k2 = P(BASE, t=16, hip=(AX + 4, hy + 2), nf=(AX + 12, GY - 3), ff=(AX - 4, GY - 3),
           nh=(AX + 15, hy - 4), sw=105, fh=(AX + 6, hy - 4), sh=10,
           fx=[slash_fx((AX + 8, hy - 6), 14, 22, 200, 95)])
    k3 = P(BASE, t=18, hip=(AX + 4, hy + 2), nf=(AX + 12, GY - 3), ff=(AX - 4, GY - 3),
           nh=(AX + 13, hy + 3), sw=150, fh=(AX + 6, hy - 4), sh=10,
           fx=[slash_fx((AX + 8, hy - 6), 16, 21, 150, 70, alpha=170)])
    k4 = P(BASE, t=10, hip=(AX + 2, hy + 1), nf=(AX + 9, GY - 3), nh=(AX + 9, hy), sw=110)
    k5 = P(BASE, t=6, hip=(AX + 1, hy), nf=(AX + 6, GY - 3), nh=(AX + 7, hy - 3), sw=55)
    return [k0, k1, k2, k3, k4, k5]


def burst_fx(c, r):
    def f(J):
        g = glow(W, H, c, r, hx('#bff5ec'), 0.8)
        l = Layer(W, H)
        spark(l, (int(c[0]), int(c[1])), 4, hx('#ffffff'), hx('#7fd6c8'))
        spark(l, (int(c[0]) + 3, int(c[1]) - 5), 2, hx('#ffffff'))
        spark(l, (int(c[0]) + 2, int(c[1]) + 5), 2, hx('#ffffff'))
        return blend_over(g, l.a)
    return f


def attack2():
    """gauntlet bash (v2: no shield) — far fist drives forward"""
    hy = HY
    k0 = P(BASE, t=-2, hip=(AX - 1, hy + 1), fh=(AX + 1, hy - 7), sh=-6, nh=(AX + 3, hy - 3), sw=20)
    k1 = P(BASE, t=-6, hip=(AX - 3, hy + 2), fh=(AX - 2, hy - 6), sh=-10, nh=(AX + 1, hy - 2), sw=10,
           nf=(AX + 3, GY - 3), ff=(AX - 6, GY - 3))
    k2 = P(BASE, t=20, hip=(AX + 6, hy + 2), nf=(AX + 13, GY - 3), ff=(AX - 2, GY - 3),
           fh=(AX + 17, hy - 6), sh=8, nh=(AX + 6, hy - 1), sw=60, shield_front=True,
           fx=[burst_fx((AX + 23, hy - 6), 9)])
    k3 = P(k2, fx=[burst_fx((AX + 24, hy - 6), 6)], fh=(AX + 16, hy - 6))
    k4 = P(BASE, t=10, hip=(AX + 3, hy + 1), nf=(AX + 9, GY - 3), fh=(AX + 10, hy - 7), shield_front=True)
    k5 = P(BASE, t=6, hip=(AX + 1, hy), nf=(AX + 6, GY - 3))
    return [k0, k1, k2, k3, k4, k5]


def shock_fx(x, y, w, alpha=255):
    def f(J):
        l = Layer(W, H)
        for i in range(-w, w + 1):
            hgt = max(0, int((w - abs(i)) / w * 6))
            for k in range(hgt):
                c = hx('#ffffff') if k < 2 else hx('#bff5ec') if k < 4 else hx('#3c9c98')
                l.px(x + i, y - k, c)
        g = glow(W, H, (x, y - 2), w * 0.9, hx('#7fd6c8'), 0.7)
        a = blend_over(g, l.a)
        a[..., 3] = (a[..., 3].astype(float) * alpha / 255).astype(np.uint8)
        return a
    return f


def attack3():
    """leaping overhead cleave"""
    hy = HY
    k0 = P(BASE, t=10, hip=(AX, hy + 4), nf=(AX + 5, GY - 3), ff=(AX - 4, GY - 3),
           nh=(AX + 3, hy + 2), sw=120, fh=(AX + 5, hy - 2))
    k1 = P(BASE, t=-6, hip=(AX + 2, hy - 7), nf=(AX + 6, GY - 8), ff=(AX - 3, GY - 6),
           nh=(AX, hy - 22), sw=-10, fh=(AX + 6, hy - 12), ntoe=110, ftoe=130)
    k2 = P(BASE, t=-12, hip=(AX + 5, hy - 10), nf=(AX + 10, GY - 12), ff=(AX + 0, GY - 10),
           nh=(AX + 1, hy - 25), sw=-40, fh=(AX + 8, hy - 15), ntoe=110, ftoe=130)
    k3 = P(BASE, t=8, hip=(AX + 8, hy - 6), nf=(AX + 14, GY - 7), ff=(AX + 2, GY - 6),
           nh=(AX + 14, hy - 18), sw=40, fh=(AX + 10, hy - 10),
           fx=[slash_fx((AX + 12, hy - 8), 15, 21, 190, 80)])
    k4 = P(BASE, t=24, hip=(AX + 9, hy + 3), nf=(AX + 17, GY - 3), ff=(AX + 1, GY - 3),
           nh=(AX + 20, hy + 6), sw=150, fh=(AX + 11, hy - 1),
           fx=[slash_fx((AX + 12, hy - 4), 16, 21, 150, 80, alpha=150), shock_fx(AX + 26, GY - 1, 10)])
    k5 = P(k4, fx=[shock_fx(AX + 26, GY - 1, 13, alpha=170)])
    k6 = P(BASE, t=14, hip=(AX + 6, hy + 2), nf=(AX + 13, GY - 3), ff=(AX, GY - 3),
           nh=(AX + 14, hy + 3), sw=120)
    k7 = P(BASE, t=7, hip=(AX + 2, hy), nf=(AX + 7, GY - 3), nh=(AX + 8, hy - 3), sw=60)
    return [k0, k1, k2, k3, k4, k5, k6, k7]


def block():
    hy = HY
    k = P(BASE, t=2, hip=(AX - 1, hy + 2), nf=(AX + 5, GY - 3), ff=(AX - 5, GY - 3),
          fh=(AX + 6, hy - 5), nh=(AX + 7, hy - 6), sw=4)
    k0 = P(BASE, fh=(AX + 6, hy - 4), nh=(AX + 6, hy - 4), sw=20)
    k2 = P(k, fx=[lambda J: glow(W, H, (AX + 9, hy - 14), 9, hx('#bff5ec'), 0.5)])
    k3 = P(k, hip=(AX - 2, hy + 2), nh=(AX + 6, hy - 6), fh=(AX + 5, hy - 5))
    return [k0, k, k2, k3]


def hurt():
    hy = HY
    k0 = P(BASE, t=-14, hd=-10, hip=(AX - 3, hy), nh=(AX - 2, hy - 2), sw=-20, fh=(AX + 2, hy - 4),
           sh=-12, nf=(AX + 5, GY - 3), ff=(AX - 6, GY - 3))
    k1 = P(k0, t=-10, hd=-6, hip=(AX - 2, hy + 1))
    k2 = P(BASE, t=0, hip=(AX - 1, hy + 1))
    return [k0, k1, k2]


def death():
    hy = HY
    k0 = P(BASE, t=-16, hd=-12, hip=(AX - 3, hy), nh=(AX - 2, hy - 1), sw=-30, fh=(AX + 1, hy - 3),
           sh=-15, nf=(AX + 5, GY - 3), ff=(AX - 6, GY - 3))
    k1 = P(BASE, t=-6, hd=8, hip=(AX - 1, hy + 4), nh=(AX + 4, hy + 6), sw=150, fh=(AX + 4, hy + 2),
           sh=20, nf=(AX + 6, GY - 3), ff=(AX - 4, GY - 3))
    k2 = P(BASE, t=14, hd=16, hip=(AX, hy + 7), nh=(AX + 8, hy + 9), sw=170, fh=(AX + 6, hy + 5),
           sh=40, nf=(AX + 7, GY - 3), ff=(AX - 7, GY - 3), ntoe=90, fkb=1)
    poses = [k0, k1, k2]
    frames = [R.draw(p) for p in poses]
    kneel = frames[-1]
    for deg in (25, 55, 80, 90, 90):
        img, pv = rotsprite(kneel, deg, (AX + 4, GY))
        out = np.zeros((H, W, 4), np.uint8)
        l = Layer(W, H); l.paste(img, AX + 4 - pv[0], GY - pv[1]); out = l.a
        ys = np.nonzero(out[..., 3] > 0)[0]
        if len(ys):
            sh = GY - 1 - ys.max()
            out = np.roll(out, sh, axis=0)
        frames.append(out)
    return frames


def build(outdir):
    clips = {
        'idle': ([R.draw(p) for p in idle()], 120, True, None),
        'run': ([R.draw(p) for p in run()], 75, True, None),
        'back': ([R.draw(p) for p in backstep()], 95, True, None),
        'attack1': ([R.draw(p) for p in attack1()], 62, False, 2),
        'attack2': ([R.draw(p) for p in attack2()], 64, False, 2),
        'attack3': ([R.draw(p) for p in attack3()], 66, False, 4),
        'block': ([R.draw(p) for p in block()], 80, False, None),
        'hurt': ([R.draw(p) for p in hurt()], 95, False, None),
        'death': (death(), 100, False, None),
    }
    return clips


if __name__ == '__main__':
    import sys
    clips = build('out')
    preview([c[0] for c in clips.values()], 'prev_cairn.png', scale=3)
