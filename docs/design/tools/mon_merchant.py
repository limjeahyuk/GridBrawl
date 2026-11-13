"""고블린 장사꾼 3단계 — 가난 / 중간 / 부자. 전투(idle·run·back·attack1·attack2·hurt·death)
+ 상점용 'haggle'(손 비비기) · 'cheer'(돈 받고 좋아하기).
같은 리그(Brute)에 머리·몸통·등짐·무기만 갈아 끼운다."""
from brute import *

W, H = 84, 58
AX, GY = 36, 56

PAL = dict(
    # skin
    D='#26401a', d='#4f8030', L='#8fc04a', y='#ffe14a', O='#141018', w='#f4f0dc',
    # poor: bandana / sack cloth / rope
    c='#8a3a2a', C='#5a2418', p='#c9a46a', r='#7a5a3a', R='#4e3420', n='#c9a46a', N='#8a6a3a',
    # mid: leather cap / vest / shirt
    h='#7a4a2a', H='#4e2c18', f='#e8e0c8', F='#c94a3a', v='#8a5a30', V='#5a3418', e='#6a8a9a', E='#3e5a6a',
    # rich: hat / velvet / gold
    t='#2a1e3a', T='#4a3a6a', q='#7a2a8a', Q='#4a1458', k='#b05ac0',
    g='#ffd24a', G='#c9952f', m='#fff1b8', z='#ff4a6a', Z='#6ae0ff',
    # wood / steel
    b='#6a4428', B='#3a2616', s='#c6ccd4', S='#7a8496',
)

# ------------------------------------------------------------------ heads (facing right)
HEAD = {
    'poor': '''
.....ccccc.....
....cCcpcccc...
...cCccccccCc..
DDD.dddddddd...
.DDdLLLLLyOdd..
..DdLLLLLLLLLLd
...DLLLLLLLLdd.
...DdLLwDwwDd..
....DddddddD...
.....DDDDDD....
''',
    'mid': '''
..........fF...
.....hhhhhfF...
....hHhhhhhf...
...hhhhhhhhhHH.
DDD.dddddddd...
.DDdLLLLLyOdd..
.gDdLLLLLLLLLLd
...DLLLLLLLLdd.
...DdLLwwwwDd..
....DddddddD...
.....DDDDDD....
''',
    'rich': '''
.....tttttt....
.....tTtttt....
.....tTtttt....
.....gggzgg....
...tttttttttt..
DDD.dddddddd...
.DDdLLLLgyOgd..
.gDdLLLLLggLLLd
...DLLLLLLLLdd.
...DdLLwgwwDd..
....DddddddD...
.....DDDDDD....
''',
}
HEAD_PV = {'poor': (6, 9), 'mid': (6, 10), 'rich': (6, 11)}

TORSO = {
    'poor': '''
...dLd...
..ddLdd..
.rrrrrrR.
.rRrprrR.
.rrrrrrR.
.nNnnNnn.
.rRrrprR.
.r.rR.rR.
.r..R..r.
''',
    'mid': '''
...dLd...
..vveVv..
.vVeeeVvV
.vVeEeVvV
.vVeeeVvV
.HHHgHHHH
.vVvhhvVv
.vV.hh.Vv
.v...v..V
''',
    'rich': '''
....dLd....
...qgmgqq..
..qQgmgQqq.
.qQQgggQQqk
.qQQgQgQQqk
qQQQQgQQQqk
qQQQgggQQqk
.qGGgzgGGq.
.qQqQqQqQq.
.qQ.qQ.qQq.
''',
}
TORSO_PV = {'poor': (4, 8), 'mid': (4, 8), 'rich': (5, 9)}

WEAPON = {
    # 국자 막대 — 냄비 국자를 휘두른다
    'poor': ('''
.SS.
SssS
SssS
.SS.
.b..
.b..
.b..
.B..
.b..
.B..
''', (1, 8)),
    # 굽은 언월도
    'mid': ('''
...s
..sS
..sS
.sS.
.sS.
sS..
sS..
gGg.
.b..
.B..
''', (1, 8)),
    # 보석 지팡이
    'rich': ('''
.gg.
gZZg
gZmg
.gg.
.G..
.g..
.G..
.g..
.G..
.g..
.G..
''', (1, 9)),
}

SKIN = ramp('#26401a', '#4f8030', '#8fc04a')
COST = {
    'poor': dict(thigh=ramp('#4e3420', '#7a5a3a', '#9a7a52'), boot=SKIN, ua=SKIN, fa=SKIN),
    'mid': dict(thigh=ramp('#2a3a44', '#3e5a6a', '#6a8a9a'), boot=ramp('#2a1c10', '#4e3420', '#6e4c30'), ua=ramp('#2a3a44', '#3e5a6a', '#6a8a9a'), fa=SKIN),
    'rich': dict(thigh=ramp('#2a0a34', '#4a1458', '#7a2a8a'), boot=ramp('#1a1018', '#2a1e3a', '#5a4a7a'), ua=ramp('#2a0a34', '#4a1458', '#7a2a8a'), fa=ramp('#c9952f', '#ffd24a', '#fff1b8')),
}


def _pack_fn(tier):
    """등짐 — far side, 몸통 뒤. 부자일수록 짐이 커진다."""
    sack = {
        'poor': ('''
....nNn....
...pnNnp...
..pppNppp..
.pppppppp..
pppNpppppp.
pppppprrpp.
.ppppprrpN.
..pNppppN..
...NNNNN...
''', (9, 3)),
        'mid': ('''
...SSS....
..SsssS...
hhhhhhhhH.
hfFhhhhhHH
hhhhhhhhHH
hhvvvvhhHH
hhhhhhhhHH
hHhhhhhhH.
.HHHHHHH..
''', (8, 2)),
        'rich': ('''
.....GgG......
....GgggG.....
...gggGggg....
..ggggggggG...
.gggGmmGgggG..
.ggGmGGmGggG..
.ggggmmGgggGG.
.gggGGmmgggGG.
.ggGmmmmGggGG.
..ggggggggGG..
...GGGGGGGG...
''', (9, 2)),
    }[tier]
    spr = sprite(sack[0], PAL)
    pv = sack[1]

    def behind(layer, J, pose):
        at = (J['sho'][0] - 1, J['sho'][1] + (1 if tier != 'rich' else 2))
        layer.part(spr, pv, at, deg=J['t'] * 0.6 + pose.get('pk', 0))
        if tier == 'poor':
            # 어깨에 걸친 막대
            a = (J['sho'][0] + 2, J['sho'][1] - 1)
            bk = (at[0] - 5, at[1] - 1)
            layer.seg(a, bk, 1, ramp('#3a2616', '#6a4428', '#8a6040'))
    return behind


def _extras(tier):
    def after(layer, J, pose):
        if tier == 'rich':
            # 금사슬 — 목에서 배까지 늘어진다
            n = J['neck']
            for i, (dx, dy) in enumerate([(0, 2), (1, 3), (2, 4), (2, 5), (3, 6)]):
                layer.px(n[0] + dx, n[1] + dy, hx('#ffd24a') if i % 2 == 0 else hx('#c9952f'))
    return after


def merchant_rig(tier):
    cc = COST[tier]
    tor = sprite(TORSO[tier], PAL)
    cos = dict(
        thigh=cc['thigh'], shin=SKIN if tier == 'poor' else cc['thigh'], boot=cc['boot'],
        ua=cc['ua'], fa=cc['fa'], hand=SKIN, wt=4 if tier == 'rich' else 3, ws=2, wu=2, wf=2, hand_r=1, boot_len=3,
        torso=lambda l, J, p: l.part(tor, TORSO_PV[tier], J['hip'], deg=J['t']),
        head=(sprite(HEAD[tier], PAL), HEAD_PV[tier]),
        weapon=(sprite(WEAPON[tier][0], PAL), WEAPON[tier][1]),
        behind=_pack_fn(tier),
        after_head=_extras(tier),
    )
    L = dict(torso=8 if tier != 'rich' else 9, shdrop=1, ua=4, fa=4, th=5, sh=5, shx=1, hipx=1)
    return Brute(W, H, AX, GY, L, cos)


def coin_fx(pts, big=False):
    def f(J):
        l = Layer(W, H)
        for (x, y) in pts:
            l.px(x, y, hx('#ffd24a')); l.px(x + 1, y, hx('#c9952f'))
            if big:
                l.px(x, y - 1, hx('#fff1b8')); l.px(x + 1, y - 1, hx('#ffd24a'))
        return l.a
    return f


def pebble_fx(x, y):
    def f(J):
        l = Layer(W, H)
        l.px(x, y, hx('#9a9aa0')); l.px(x + 1, y, hx('#6a6a70')); l.px(x, y + 1, hx('#6a6a70'))
        for k in range(1, 4):
            l.px(x - k * 2, y + (k > 1), hx('#c6ccd4', 140))
        return l.a
    return f


def clips(tier):
    r = merchant_rig(tier)
    SL = {'poor': [hx('#8a6a3a'), hx('#e8d0a0'), hx('#ffffff')],
          'mid': [hx('#7a8f40'), hx('#d8f0a0'), hx('#ffffff')],
          'rich': [hx('#c9952f'), hx('#ffd24a'), hx('#fff1b8')]}[tier]
    lib = Lib(r, r.GY - 11, stance=4, slash=SL)
    lib.base.update(t={'poor': 18, 'mid': 12, 'rich': 2}[tier], hd={'poor': -4, 'mid': -6, 'rich': -10}[tier], wa=60)
    b, o, g = lib.base, lib.o, lib.g
    idle = lib.idle(6, amp=1)
    run = lib.run(8, A=6, lift=4, lean={'poor': 24, 'mid': 20, 'rich': 10}[tier])
    back = lib.run(6, A=4, lift=3, lean=-4, back=True, pk=-6)
    hurt = lib.hurt()

    if tier == 'poor':
        a1 = lib.swing(reach=11)  # 국자 내려치기
        a2 = [P(b, t=-6, hip=o(-2, 1), nh=o(-6, -9), wp=False, nf=g(3), ff=g(-6)),
              P(b, t=-10, hip=o(-3, 1), nh=o(-7, -11), wp=False),
              P(b, t=24, hip=o(5, 2), nf=g(12), ff=g(-2), nh=o(12, -6), wp=False,
                fx=[pebble_fx(AX + 24, GY - 22)]),
              P(b, t=20, hip=o(4, 2), nf=g(12), ff=g(-2), nh=o(11, -2), wp=False,
                fx=[pebble_fx(AX + 36, GY - 21)]),
              P(b, t=12, hip=o(2, 1), nh=o(7, 0), wp=False), P(b)]
    elif tier == 'mid':
        a1 = lib.swing(reach=13)  # 언월도 베기
        a2 = lib.lunge(reach=14, wa=95, fx=[lib.slash_fx((AX + 12, GY - 16), 9, 14, 160, 70, 230)])
    else:
        a1 = lib.swing(reach=12)  # 지팡이 후려치기 — 금빛 궤적
        coins = [(AX + 18, GY - 24), (AX + 24, GY - 28), (AX + 22, GY - 20)]
        coins2 = [(AX + 30, GY - 26), (AX + 38, GY - 30), (AX + 36, GY - 20), (AX + 44, GY - 24)]
        a2 = [P(b, t=-4, hip=o(-2, 1), fh=o(-4, -2), nh=o(-3, -4)),
              P(b, t=-8, hip=o(-3, 2), fh=o(-6, -6), nh=o(-4, -5)),
              P(b, t=14, hip=o(4, 2), nf=g(10), fh=o(12, -8), nh=o(6, -4), fx=[coin_fx(coins, True)]),
              P(b, t=12, hip=o(4, 2), nf=g(10), fh=o(13, -6), nh=o(6, -4), fx=[coin_fx(coins2, True)]),
              P(b, t=6, hip=o(2, 1), fh=o(6, -2)), P(b)]

    # 상점: 손 비비기 (양손을 배 앞에서 교차)
    hag = []
    for i in range(6):
        s = math.sin(i / 6 * 2 * math.pi)
        bob = round((1 - math.cos(i / 6 * 2 * math.pi)) / 2)
        hag.append(P(b, hip=o(0, bob * 0.25), t=b['t'] + 2, hd=b['hd'] + (4 if i in (2, 3) else 0),
                     nh=o(5 + s * 1.5, -4 + bob * 0.25), fh=o(5 - s * 1.5, -3 + bob * 0.25), wp=False))
    # 돈 받고 좋아하기: 펄쩍 + 금화
    cheer = [P(b, hip=o(0, 1), nh=o(4, -3), fh=o(3, -3), wp=False),
             P(b, hip=o(0, -3), nf=g(4, 3), ff=g(-4, 3), nh=o(5, -14), fh=o(-1, -14), hd=-14, wp=False,
               fx=[coin_fx([(AX + 8, GY - 40), (AX + 2, GY - 42)], True)]),
             P(b, hip=o(0, -4), nf=g(4, 4), ff=g(-4, 4), nh=o(6, -15), fh=o(-2, -15), hd=-16, wp=False,
               fx=[coin_fx([(AX + 9, GY - 44), (AX + 1, GY - 46), (AX + 5, GY - 48)], True)]),
             P(b, hip=o(0, -1), nh=o(5, -12), fh=o(-1, -12), hd=-10, wp=False,
               fx=[coin_fx([(AX + 6, GY - 36)], True)]),
             P(b, hip=o(0, 1), nh=o(4, -3), fh=o(3, -3), wp=False), P(b, wp=False)]
    for p in cheer + hag:
        p.setdefault('ph', 0)

    R_ = r.draw
    impact = 2
    return {
        'idle': ([R_(p) for p in idle], 110 if tier != 'rich' else 130, True, None),
        'run': ([R_(p) for p in run], 65 if tier != 'rich' else 80, True, None),
        'back': ([R_(p) for p in back], 80, True, None),
        'attack1': ([R_(p) for p in a1], 60 if tier != 'rich' else 70, False, impact),
        'attack2': ([R_(p) for p in a2], 70, False, impact),
        'hurt': ([R_(p) for p in hurt], 90, False, None),
        'death': (fade(lib.death(), 1), 100, False, None),
        'haggle': ([R_(p) for p in hag], 120, True, None),
        'cheer': ([R_(p) for p in cheer], 110, False, None),
    }


def poor_clips():
    return clips('poor')


def mid_clips():
    return clips('mid')


def rich_clips():
    return clips('rich')


if __name__ == '__main__':
    import sys
    for t in ('poor', 'mid', 'rich'):
        c = clips(t)
        preview([v[0] for v in c.values()], f'/tmp/claude-0/-home-claude/3af28667-8ee6-50ac-a1c0-241532dd7127/scratchpad/prev_gm_{t}.png', scale=3)
        print(t, {k: len(v[0]) for k, v in c.items()})
