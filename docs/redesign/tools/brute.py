"""Generic humanoid monster rig + reusable pose library."""
from rig import *


def darker(rmp, k=0.72):
    return [tuple(int(c * k) for c in col[:3]) + (255,) for col in rmp]


class Brute(Humanoid):
    def __init__(self, W, H, AX, GY, L, costume, oc=OUTLINE):
        super().__init__(W, H, L, oc)
        self.AX, self.GY = AX, GY
        self.c = costume

    def draw(self, pose):
        c = self.c
        J = self.solve(pose)
        t = J['t']
        g_back2, back, body, front = self.L_(), self.L_(), self.L_(), self.L_()
        if 'behind' in c:
            c['behind'](g_back2, J, pose)
        if c.get('far_weapon') and pose.get('fw', True):
            spr, pv = c['far_weapon']
            back.part(spr, pv, J['fhand'], deg=pose.get('fwa', 0))
        leg(back, J, 'f', darker(c['thigh']), darker(c['shin']), darker(c['boot']),
            wt=c['wt'], ws=c['ws'], toe=pose.get('ftoe', 90), boot_len=c.get('boot_len', 4))
        arm(back, J, 'f', darker(c['ua']), darker(c['fa']), darker(c['hand']),
            wu=c['wu'], wf=c['wf'], hand_r=c.get('hand_r', 2))
        leg(body, J, 'n', c['thigh'], c['shin'], c['boot'], wt=c['wt'], ws=c['ws'],
            toe=pose.get('ntoe', 90), boot_len=c.get('boot_len', 4))
        c['torso'](body, J, pose)
        if 'head' in c:
            spr, pv = c['head']
            body.part(spr, pv, J['neck'], deg=t + pose.get('hd', 0))
        if 'after_head' in c:
            c['after_head'](body, J, pose)
        if c.get('weapon') and pose.get('wp', True):
            spr, pv = c['weapon']
            front.part(spr, pv, J['nhand'], deg=pose.get('wa', 30))
        arm(front, J, 'n', c['ua'], c['fa'], c['hand'], wu=c['wu'], wf=c['wf'], hand_r=c.get('hand_r', 2))
        if 'shoulder' in c:
            c['shoulder'](front, J, pose)
        groups = [g_back2, back, body, front]
        fxa = None
        fxs = list(pose.get('fx', []))
        if 'aura' in c:
            fxs = [lambda JJ: c['aura'](self, JJ, pose)] + fxs
        for f in fxs:
            arr = f(J)
            fxa = arr if fxa is None else blend_over(fxa, arr)
        under = None
        if 'under' in c:
            under = c['under'](self, J, pose)
        return self.compose(groups, fx=fxa, fx_under=under)


class Lib:
    """pose library scaled to a rig. k = size factor relative to an 8px thigh."""

    def __init__(self, rig, hy, stance=4, slash=None):
        self.r = rig
        self.AX, self.GY = rig.AX, rig.GY
        self.k = rig.L['th'] / 8.0
        self.HY = hy
        self.st = stance
        self.slash = slash or [hx('#c94a3a'), hx('#ffb27a'), hx('#ffffff')]
        AX, GY, k = self.AX, self.GY, self.k
        self.base = dict(hip=(AX, hy), t=6, nf=(AX + stance * k, GY - 3), ff=(AX - stance * k, GY - 3),
                         nh=(AX + 6 * k, hy - 2 * k), fh=(AX + 3 * k, hy - 1 * k), wa=40, fwa=20)

    def o(self, dx, dy):
        return (self.AX + dx * self.k, self.HY + dy * self.k)

    def g(self, dx, up=0):
        return (self.AX + dx * self.k, self.GY - 3 - up * self.k)

    def idle(self, n=6, amp=1, **kw):
        out = []
        for i in range(n):
            b = round((math.sin(i / n * 2 * math.pi - math.pi / 2) + 1) / 2 * amp)
            p = P(self.base, **kw)
            p['hip'] = (p['hip'][0], p['hip'][1] + b)
            p['nh'] = (p['nh'][0], p['nh'][1] + b)
            p['fh'] = (p['fh'][0], p['fh'][1] + b)
            p['ph'] = i / n
            out.append(p)
        return out

    def run(self, n=8, A=6, lift=4, lean=12, back=False, **kw):
        out = []
        k = self.k
        for i in range(n):
            ph = i / n * 2 * math.pi
            def foot(q):
                mf = -math.sin(q) * (1 if not back else -1)
                return (self.AX + A * k * math.cos(q), self.GY - 3 - max(0, mf) * lift * k)
            hb = (-abs(math.sin(ph)) * 1.4 + 0.7) * k
            sw = math.sin(ph)
            p = P(self.base, t=lean if not back else -3, hip=(self.AX + k, self.HY + hb + k * 0.5),
                  nf=foot(ph), ff=foot(ph + math.pi),
                  nh=self.o(4 - sw * 4, -1 + hb / k), fh=self.o(2 + sw * 4, 0 + hb / k), ph=i / n)
            p['ntoe'] = 90 if p['nf'][1] >= self.GY - 3.5 else 125
            p['ftoe'] = 90 if p['ff'][1] >= self.GY - 3.5 else 125
            p.update(kw)
            out.append(p)
        return out

    def slash_fx(self, c, r0, r1, a0, a1, alpha=255):
        W, H = self.r.W, self.r.H
        cols = self.slash
        return lambda J: arc_fx(W, H, c, r0, r1, a0, a1, cols, alpha=alpha)

    def swing(self, reach=14, **kw):
        """overhead → forward-down weapon swing (6 frames, impact 2)."""
        b = self.base; o = self.o; g = self.g; k = self.k
        c = o(6, -8)
        k0 = P(b, t=-4, hip=o(-1, 0), nh=o(-1, -14), wa=-30)
        k1 = P(b, t=-10, hip=o(-2, 1), nh=o(-4, -13), wa=-70, nf=g(5))
        k2 = P(b, t=18, hip=o(4, 2), nf=g(11), ff=g(-4), nh=o(reach, -3), wa=105,
               fx=[self.slash_fx(c, 13 * k, 20 * k, 200, 95)])
        k3 = P(b, t=20, hip=o(4, 2), nf=g(11), ff=g(-4), nh=o(reach - 2, 3), wa=150,
               fx=[self.slash_fx(c, 15 * k, 19 * k, 150, 70, 160)])
        k4 = P(b, t=10, hip=o(2, 1), nf=g(8), nh=o(8, 0), wa=110)
        k5 = P(b, t=6)
        out = [k0, k1, k2, k3, k4, k5]
        return [P(x, **kw) for x in out]

    def lunge(self, reach=16, fx=None, **kw):
        """thrust / punch forward (6 frames, impact 2)."""
        b = self.base; o = self.o; g = self.g
        k0 = P(b, t=-6, hip=o(-2, 1), nh=o(-2, -3), wa=70, nf=g(3), ff=g(-6))
        k1 = P(b, t=-10, hip=o(-3, 2), nh=o(-4, -2), wa=80, nf=g(2), ff=g(-7))
        k2 = P(b, t=22, hip=o(6, 2), nf=g(13), ff=g(-2), nh=o(reach, -5), wa=90, fx=fx or [])
        k3 = P(k2, nh=o(reach - 1, -5))
        k4 = P(b, t=10, hip=o(3, 1), nf=g(8), nh=o(9, -3), wa=70)
        k5 = P(b)
        return [P(x, **kw) for x in [k0, k1, k2, k3, k4, k5]]

    def hurt(self, **kw):
        b = self.base; o = self.o
        k0 = P(b, t=-16, hd=-12, hip=o(-3, 0), nh=o(-1, -4), fh=o(0, -5), wa=-10)
        k1 = P(k0, t=-10, hd=-6, hip=o(-2, 1))
        k2 = P(b, hip=o(-1, 1))
        return [P(x, **kw) for x in [k0, k1, k2]]

    def death(self, n_rot=(25, 55, 80, 90, 90), **kw):
        b = self.base; o = self.o; g = self.g
        k0 = P(b, t=-16, hd=-12, hip=o(-3, 0), nh=o(-1, -3), fh=o(0, -4), wa=-20)
        k1 = P(b, t=-4, hd=10, hip=o(-1, 4), nh=o(4, 6), fh=o(4, 5), wa=150, nf=g(6), ff=g(-4))
        k2 = P(b, t=16, hd=18, hip=o(0, 7), nh=o(8, 9), fh=o(6, 8), wa=170, nf=g(7), ff=g(-7))
        poses = [P(x, **kw) for x in [k0, k1, k2]]
        frames = [self.r.draw(p) for p in poses]
        return frames + fall(frames[-1], (self.AX + 4 * self.k, self.GY), n_rot)


def fall(img0, pivot, degs):
    H, W = img0.shape[:2]
    out = []
    for deg in degs:
        img, pv = rotsprite(img0, deg, pivot)
        l = Layer(W, H); l.paste(img, pivot[0] - pv[0], pivot[1] - pv[1])
        a = l.a
        ys = np.nonzero(a[..., 3] > 0)[0]
        if len(ys):
            a = np.roll(a, int(pivot[1]) - 1 - ys.max(), axis=0)
        out.append(a)
    return out


def fade(frames, n=2):
    """append n fading copies of the last frame"""
    last = frames[-1]
    for i in range(n):
        f = last.copy()
        f[..., 3] = (f[..., 3] * (1 - (i + 1) / (n + 1))).astype(np.uint8)
        frames.append(f)
    return frames
