"""GLADIATOR — 막고라 이벤트의 검투사(2026-11-15). 몬스터 시트 크기 = 영웅과 같은 96×64(×3).
일러스트(macgora.png)에 맞춤: 쇠 투구 + 빨간 닭벼슬 깃 · 맨 가슴 · 양어깨 쇠 견갑 · 가슴을 가로지르는 가죽 끈 ·
징 박은 넓은 가죽 허리띠 · 가죽 샅가리개 · 가죽 팔목 보호대 · 넓은 단검(글라디우스). 방패 없음."""
from rig import *

W, H = 96, 64
AX, GY = 34, 62

PAL = dict(
    O='#141018',
    G='#6a3e12', g='#b07a2a', y='#e8b84a', Y='#fff0a8',          # 청동 · 금
    R='#5c1420', r='#a82c3a', p='#e05a66',                          # 깃 · 방패 빨강
    k='#d89a70', K='#a0644a', u='#f2c09a',                          # 피부
    B='#2e1d14', b='#5e3b24', n='#8a5a36',                          # 가죽
    S='#38435a', s='#6c7f99', l='#a8bacb', w='#eef4f8',             # 쇠
    D='#1c1a24', d='#3a3442',
)

HELM = sprite('''
...rrrr....
..rppprr...
...rrrr....
..SsllssS..
.SsllwlssS.
SsslllsssS.
SsDDDDDssS.
SsDkkkDssSS
.SDkDkDsS..
..SsssssS..
...kkkK....
''', PAL)
HELM_PV = (4, 10)

TORSO = sprite('''
..kkkkkkK...
.kuukkkkkK..
kuuukkkkbbK.
kuukKkkbbkK.
kkkkKkbbkkK.
.kkkkbbkkkK.
.KkkbbkKkK..
..KbbkkkK...
..BlBlBlBB..
..bBBBBBBb..
..bnnnnnnb..
...bnnnnb...
...bnnnnb...
....bnnb....
............''', PAL)
TORSO_PV = (5, 12)

PAULDRON = sprite('''
.Ssllw.
Sslllws
SsslllS
.SSsssS
..SSSS.
''', PAL)
PAUL_PV = (3, 1)
FPAUL = sprite('''
.SssS.
SsssSS
SSssSS
.SSSS.
''', PAL)

SWORD = sprite('''
..w..
.wlS.
.wlS.
.wlS.
.wlS.
.wlS.
.wlS.
.wlS.
SslsS
.DD..
.dD..
.sl..
''', PAL)
SWORD_PV = (2, 9)

SHIELD = sprite('''
GgggggggG.
gRrrrrrrRg
gRrprrrrRg
gRrrrrrrRg
gRrrGgGrRg
gyyyGYGyyg
gRrrGgGrRg
gRrrrrrrRg
gRrrrrrrRg
gRrrrrrrRg
.gRrrrrRg.
..ggggggg.
''', PAL)
SHIELD_PV = (4, 5)

SKIN = ramp('#a0644a', '#d89a70', '#f2c09a')
SKIN_F = ramp('#7a4836', '#a8705a', '#c89878')
MANICA = ramp('#38435a', '#6c7f99', '#a8bacb')
GREAVE = ramp('#2e1d14', '#5e3b24', '#8a5a36')
GREAVE_F = ramp('#1e140e', '#3e2818', '#5e3e26')
BRACER = ramp('#2e1d14', '#5e3b24', '#8a5a36')
BRACER_F = ramp('#1e140e', '#3e2818', '#5e3e26')
SANDAL = ramp('#2e1d14', '#5e3b24', '#8a5a36')
SANDAL_F = ramp('#1e140e', '#3e2818', '#5e3e26')
SLASH = [hx('#a82c3a'), hx('#ffb0a0'), hx('#ffffff')]


class Gladiator(Humanoid):
    def __init__(self):
        super().__init__(W, H, dict(torso=12, shdrop=2, ua=6, fa=6, th=8, sh=8, shx=1, hipx=1))

    def draw(self, pose):
        J = self.solve(pose)
        t = J['t']
        back, body, shield, front = self.L_(), self.L_(), self.L_(), self.L_()
        leg(back, J, 'f', SKIN_F, GREAVE_F, SANDAL_F, wt=5, ws=4, toe=pose.get('ftoe', 90))
        arm(back, J, 'f', SKIN_F, SKIN_F, SKIN_F, wu=4, wf=3)
        back.seg(lerp(J['fel'], J['fhand'], 0.4), J['fhand'], 3, BRACER_F)
        back.part(FPAUL, (3, 1), J['fsho'] if 'fsho' in J else J['neck'], deg=t * 0.5)
        leg(body, J, 'n', SKIN, GREAVE, SANDAL, wt=5, ws=4, toe=pose.get('ntoe', 90))
        body.part(TORSO, TORSO_PV, J['hip'], deg=t)
        body.part(HELM, HELM_PV, J['neck'], deg=t + pose.get('hd', 0))
        if pose.get('shield', False):
            shield.part(SHIELD, SHIELD_PV, J['fhand'], deg=pose.get('sh', 0))
        if pose.get('sword', True):
            front.part(SWORD, SWORD_PV, J['nhand'], deg=pose.get('sw', 30))
        arm(front, J, 'n', SKIN, SKIN, SKIN, wu=4, wf=3)
        front.seg(lerp(J['nel'], J['nhand'], 0.4), J['nhand'], 3, BRACER)
        front.part(PAULDRON, PAUL_PV, J['nsho'], deg=t * 0.5)
        fxa = None
        for f in pose.get('fx', []):
            arr = f(J)
            fxa = arr if fxa is None else blend_over(fxa, arr)
        groups = [back, body, front, shield] if pose.get('shield_front', True) else [back, body, shield, front]
        return self.compose(groups, fx=fxa)


R = Gladiator()
HY = GY - 15
BASE = dict(hip=(AX, HY), t=6, nf=(AX + 5, GY - 3), ff=(AX - 4, GY - 3),
            nh=(AX + 2, HY + 3), fh=(AX + 6, HY - 2), sw=120, sh=0, shield_front=True)


def idle():
    fr = []
    for i in range(6):
        b = [0, 0, 1, 1, 1, 0][i]
        fr.append(P(BASE, hip=(AX, HY + b), nh=(AX + 2, HY + 3 + b), fh=(AX + 6, HY - 2 + b), sw=120 + b * 3, sh=b))
    return fr


def run():
    fr = []
    n = 8
    for i in range(n):
        ph = i / n * 2 * math.pi
        def foot(p):
            x = AX + 7 * math.cos(p) + 1
            y = GY - 3 - max(0, -math.sin(p)) * 5
            return (x, y)
        hb = -abs(math.sin(ph)) * 1.6 + 0.8
        nf, ff = foot(ph), foot(ph + math.pi)
        sway = math.sin(ph)
        fr.append(P(BASE, hip=(AX + 1, HY + 1 + hb), t=14, nf=nf, ff=ff,
                    ntoe=90 if nf[1] >= GY - 3.5 else 120, ftoe=90 if ff[1] >= GY - 3.5 else 120,
                    nh=(AX + 3 - sway * 3, HY + 2 + hb), sw=115 - sway * 10, fh=(AX + 8, HY - 3 + hb), sh=4))
    return fr


def slash_fx(c, r0, r1, a0, a1, alpha=255):
    return lambda J: arc_fx(W, H, c, r0, r1, a0, a1, SLASH, alpha=alpha)


def thrust_fx(x, y, L, alpha=255):
    def f(J):
        l = Layer(W, H)
        for i in range(L):
            c = hx('#ffffff') if i > L - 4 else hx('#fff0a8') if i > L // 2 else hx('#e8b84a')
            l.px(x + i, y, c)
            if i > 2 and i % 2 == 0:
                l.px(x + i, y - 1, hx('#e8b84a'))
                l.px(x + i, y + 1, hx('#e8b84a'))
        a = l.a
        a[..., 3] = (a[..., 3].astype(float) * alpha / 255).astype(np.uint8)
        return a
    return f


def attack1():
    """글라디우스 찌르기 — 방패 뒤에서 당겼다가 앞으로 쭉"""
    hy = HY
    k0 = P(BASE, t=-2, hip=(AX - 1, hy + 1), nh=(AX - 3, hy - 2), sw=95, fh=(AX + 7, hy - 4))
    k1 = P(BASE, t=-6, hip=(AX - 2, hy + 2), nh=(AX - 6, hy - 2), sw=95, fh=(AX + 6, hy - 4), nf=(AX + 3, GY - 3))
    k2 = P(BASE, t=18, hip=(AX + 5, hy + 2), nf=(AX + 13, GY - 3), ff=(AX - 3, GY - 3),
           nh=(AX + 18, hy - 5), sw=95, fh=(AX + 4, hy - 1),
           fx=[thrust_fx(AX + 30, hy - 6, 12)])
    k3 = P(k2, fx=[thrust_fx(AX + 31, hy - 6, 8, alpha=150)])
    k4 = P(BASE, t=10, hip=(AX + 2, hy + 1), nf=(AX + 9, GY - 3), nh=(AX + 9, hy - 2), sw=85)
    k5 = P(BASE, t=7, hip=(AX + 1, hy), nf=(AX + 6, GY - 3), nh=(AX + 5, hy - 1), sw=75)
    return [k0, k1, k2, k3, k4, k5]


def burst_fx(c, r):
    def f(J):
        g = glow(W, H, c, r, hx('#fff0a8'), 0.8)
        l = Layer(W, H)
        spark(l, (int(c[0]), int(c[1])), 4, hx('#ffffff'), hx('#e8b84a'))
        spark(l, (int(c[0]) + 3, int(c[1]) - 5), 2, hx('#ffffff'))
        return blend_over(g, l.a)
    return f


def attack2():
    """머리 위로 치켜든 검 내려찍기(일러스트 포즈)"""
    hy = HY
    k0 = P(BASE, t=-6, hip=(AX - 1, hy), nh=(AX - 2, hy - 15), sw=-30, fh=(AX + 6, hy - 2))
    k1 = P(BASE, t=-10, hip=(AX - 2, hy + 1), nh=(AX - 4, hy - 14), sw=-70, fh=(AX + 6, hy - 1), nf=(AX + 5, GY - 3))
    k2 = P(BASE, t=18, hip=(AX + 5, hy + 2), nf=(AX + 13, GY - 3), ff=(AX - 4, GY - 3),
           nh=(AX + 15, hy - 3), sw=110, fh=(AX + 5, hy - 1), fx=[slash_fx((AX + 9, hy - 6), 14, 22, 200, 95)])
    k3 = P(k2, nh=(AX + 13, hy + 4), sw=150, fx=[slash_fx((AX + 9, hy - 6), 16, 21, 150, 70, alpha=170)])
    k4 = P(BASE, t=10, hip=(AX + 2, hy + 1), nf=(AX + 9, GY - 3), nh=(AX + 9, hy + 2), sw=125)
    k5 = P(BASE, t=7, hip=(AX + 1, hy), nf=(AX + 6, GY - 3))
    return [k0, k1, k2, k3, k4, k5]


def hurt():
    hy = HY
    k0 = P(BASE, t=-14, hd=-10, hip=(AX - 3, hy), nh=(AX - 2, hy - 1), sw=40, fh=(AX + 3, hy - 3),
           sh=-12, nf=(AX + 5, GY - 3), ff=(AX - 6, GY - 3))
    k1 = P(k0, t=-10, hd=-6, hip=(AX - 2, hy + 1))
    k2 = P(BASE, t=0, hip=(AX - 1, hy + 1))
    return [k0, k1, k2]


def death():
    hy = HY
    k0 = P(BASE, t=-16, hd=-12, hip=(AX - 3, hy), nh=(AX - 2, hy), sw=20, fh=(AX + 2, hy - 2),
           sh=-15, nf=(AX + 5, GY - 3), ff=(AX - 6, GY - 3))
    k1 = P(BASE, t=-6, hd=8, hip=(AX - 1, hy + 4), nh=(AX + 4, hy + 6), sw=150, fh=(AX + 4, hy + 3),
           sh=20, nf=(AX + 6, GY - 3), ff=(AX - 4, GY - 3))
    k2 = P(BASE, t=14, hd=16, hip=(AX, hy + 7), nh=(AX + 8, hy + 9), sw=170, fh=(AX + 6, hy + 6),
           sh=40, nf=(AX + 7, GY - 3), ff=(AX - 7, GY - 3))
    frames = [R.draw(p) for p in (k0, k1, k2)]
    kneel = frames[-1]
    for deg in (25, 55, 80, 90, 90):
        img, pv = rotsprite(kneel, deg, (AX + 4, GY))
        l = Layer(W, H); l.paste(img, AX + 4 - pv[0], GY - pv[1]); out = l.a
        ys = np.nonzero(out[..., 3] > 0)[0]
        if len(ys):
            out = np.roll(out, GY - 1 - ys.max(), axis=0)
        frames.append(out)
    return frames


def gladiator_clips():
    return {
        'idle': ([R.draw(p) for p in idle()], 120, True, None),
        'run': ([R.draw(p) for p in run()], 75, True, None),
        'attack1': ([R.draw(p) for p in attack1()], 62, False, 2),
        'attack2': ([R.draw(p) for p in attack2()], 64, False, 2),
        'hurt': ([R.draw(p) for p in hurt()], 95, False, None),
        'death': (death(), 100, False, None),
    }


if __name__ == '__main__':
    clips = gladiator_clips()
    preview([c[0] for c in clips.values()], 'prev_gladiator.png', scale=3)
