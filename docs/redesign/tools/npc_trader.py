"""상점 탭의 인간 여성 장사꾼 '마렌' — 상점 전용 NPC(전투 없음).
오른쪽(진열대)을 바라보는 3/4 측면. 등에 짐 틀(말린 카펫·냄비·등불)을 진다.
clips: idle · talk · offer(물약 내밀기 + 윙크) · bow(구매 감사)."""
import math
import numpy as np
from pix import *
from rig import glow

W, H = 64, 76
CX, GY = 30, 74

PAL = dict(
    O='#141018', s='#f2c49a', S='#d4946a', x='#9a5a3a', e='#2a1a24', w='#ffffff', l='#c94a5a', L='#e07a7a',
    h='#a8402a', H='#6a2418', i='#d8703a',   # hair (auburn)
    t='#2a5a5a', T='#16363a', u='#4a8a80',   # hat felt (teal)
    f='#f4d470', F='#c9952f', r='#e0485a', R='#8a2030',  # feather gold, red band
)
HEAD_ART = '''
.....HHhhhH.....
...HhhhhhhhhH...
..Hhhhhiiihhhh..
.Hhhhhsssssshh..
.HhhhsssssHHsH..
Hhhhssssssssss..
HhhsssssssweSs..
.hhssssssssessx.
.HhssssssssssSS.
.HhSsssssssLlsx.
..HhSssssssssS..
..HhhSSssssSS...
...HhH..SSS.....
....HH..ss......
'''
def _head(eye='open', mouth='close'):
    rows = HEAD_ART.strip('\n').split('\n')
    if eye == 'shut':
        rows[6] = rows[6].replace('weSs', 'SSSs'); rows[7] = rows[7].replace('sessx', 'sSssx')
    if mouth == 'open':
        rows[9] = rows[9].replace('Llsx', 'eLsx')
    if mouth == 'smile':
        rows[9] = rows[9].replace('sLlsx', 'Llllx')
    return sprite('\n'.join(rows), PAL)
HEAD = _head(); HEAD_BLINK = _head('shut'); HEAD_TALK = _head(mouth='open'); HEAD_WINK = _head('shut', 'smile')
HEAD_PV = (7, 13)

HAT = sprite('''
..............ff......
.............fFf......
........TTTTtfF.......
.......TttttuF........
.......TtuuuttT.......
......RRrrrrrrRRR.....
TTTTtttttttttttttttTT.
.TTTTTtttttttttTTTTT..
....TTTTTTTTTTTT......
''', PAL)
HAT_PV = (10, 7)

DRESS = ramp('#16363a', '#245a5a', '#3e8a80')
DRESS_D = ramp('#0e2428', '#16363a', '#245a5a')
APRON = ramp('#b8a888', '#e8dcc0', '#fff6e0')
SHAWL = ramp('#4a1420', '#8a2a3a', '#b84a5a')
SKIN = ramp('#9a5a3a', '#d4946a', '#f2c49a')
HAIR = ramp('#4a1810', '#a8402a', '#d8703a')
WOOD = ramp('#3a2616', '#6a4428', '#946038')
BELT = ramp('#2a1c10', '#5a3a20', '#8a5a30')
GOLD = ramp('#8a5a18', '#c9952f', '#ffd24a')
CARPET = ramp('#5a1a3a', '#a03a5a', '#e07a8a')
POT = ramp('#3a3a48', '#6a6a7a', '#a8a8b8')

POTION = sprite('''
.OO.
.ww.
OrrO
rLrr
rrrR
.RR.
''', dict(O='#c9952f', w='#fff6dc', r='#e0485a', L='#ffb0b0', R='#8a2030'))
LEDGER = sprite('''
FFFFFF
FwwwwF
FwHwwF
FwwwwF
FFFFFF
''', dict(F='#6a3418', w='#f4ecd0', H='#8a6a3a'))


def frame(bob=0, sway=0, arm='rest', head='norm', bow=0, spark=0, mouth=False):
    pack, back, body, front = Layer(W, H), Layer(W, H), Layer(W, H), Layer(W, H)
    y0 = bob
    lean = bow  # degrees-ish forward bow (pixels shift for upper body)
    ux = lean * 0.35  # upper-body x shift
    uy = abs(lean) * 0.18
    # ---- pack frame behind (left)
    px = 13 + ux * 0.6; py = 22 + y0 + uy
    pack.seg((px, py), (px, py + 30), 2, WOOD)
    pack.seg((px + 8, py + 2), (px + 8, py + 26), 2, WOOD)
    pack.seg((px - 1, py + 6), (px + 9, py + 6), 2, WOOD)
    pack.seg((px - 1, py + 20), (px + 9, py + 20), 2, WOOD)
    pack.ellipse(px + 4, py - 1, 6, 3, CARPET)                        # rolled carpet on top
    pack.px(px + 1, py - 1, hx('#f4d470')); pack.px(px + 6, py - 1, hx('#f4d470'))
    pack.ellipse(px + 2, py + 12, 4, 4, POT)                          # pot
    pack.px(px + 1, py + 10, hx('#d8d8e8'))
    # lantern hanging
    lx = px - 3; ly = py + 22 + round(math.sin(sway) * 1)
    pack.seg((px - 1, py + 20), (lx, ly), 1, WOOD)
    pack.poly([(lx - 2, ly + 1), (lx + 2, ly + 1), (lx + 2, ly + 6), (lx - 2, ly + 6)], GOLD)
    # ---- braid behind
    nx, ny = CX + ux - 3, 17 + y0 + uy
    bx = nx - 2 + math.sin(sway) * 1.2
    back.seg((nx, ny), (bx, ny + 10), 3, HAIR)
    back.seg((bx, ny + 10), (bx + math.sin(sway) * 1.5, ny + 18), 2, HAIR)
    back.px(bx + math.sin(sway) * 1.5, ny + 19, hx('#e0485a'))
    # far arm (shadowed) holds ledger at hip
    fs = (CX - 4 + ux, 28 + y0 + uy)
    fe = (CX - 6 + ux * 0.5, 36 + y0)
    fh = (CX - 3, 42 + y0)
    back.seg(fs, fe, 3, darker_r(DRESS)); back.seg(fe, fh, 2, darker_r(SKIN))
    back.paste(LEDGER, fh[0] - 3, fh[1] - 2)
    # ---- skirt
    wy = 42 + y0
    body.poly([(CX - 7 + ux * 0.3, wy), (CX + 7 + ux * 0.3, wy), (CX + 11, wy + 14), (CX + 14, GY - 1), (CX - 15, GY - 1), (CX - 11, wy + 14)], DRESS)
    body.poly([(CX - 15, GY - 3), (CX + 14, GY - 3), (CX + 14, GY - 1), (CX - 15, GY - 1)], DRESS_D, shade=False)
    for fx0, fx1 in ((-3, -7), (1, -1)):
        body.line((CX + fx0 + ux * 0.3, wy + 4), (CX + fx1 + math.sin(sway) * 0.6, GY - 4), hx('#16363a'))
    # apron (front = right)
    body.poly([(CX + 2 + ux * 0.3, wy + 1), (CX + 7 + ux * 0.3, wy + 1), (CX + 11, GY - 6), (CX + 4, GY - 5)], APRON)
    body.seg((CX + 5, wy + 11), (CX + 9, wy + 11), 2, ramp('#a89878', '#d8ccb0', '#e8dcc0'))  # pocket
    # boots peeking
    body.seg((CX - 6, GY - 1), (CX - 2, GY - 1), 2, BELT); body.seg((CX + 4, GY - 1), (CX + 9, GY - 1), 2, BELT)
    # ---- bodice
    sy = 26 + y0 + uy
    body.poly([(CX - 6 + ux, sy), (CX + 6 + ux, sy), (CX + 7 + ux * 0.5, wy), (CX - 7 + ux * 0.5, wy)], DRESS)
    body.seg((CX - 3 + ux * 0.8, sy + 4), (CX + 3 + ux * 0.6, wy - 2), 1, ramp('#d8ccb0', '#e8dcc0', '#fff6e0'))  # lacing
    # belt + pouch
    body.seg((CX - 7 + ux * 0.4, wy), (CX + 7 + ux * 0.4, wy), 2, BELT)
    body.px(CX + 1 + ux * 0.4, wy, hx('#ffd24a'))
    body.ellipse(CX - 6, wy + 4, 2.5, 3, GOLD)
    # shawl
    body.poly([(CX - 8 + ux, sy - 1), (CX + 8 + ux, sy - 1), (CX + 7 + ux, sy + 3), (CX + 3 + ux, sy + 7), (CX - 1 + ux, sy + 9), (CX - 6 + ux, sy + 6), (CX - 8 + ux, sy + 2)], SHAWL)
    for fx_, fy_ in ((3, 7), (-1, 9), (-5, 6)):
        body.px(CX + fx_ + ux, sy + fy_ + 1, hx('#f4d470'))
    # ---- head + hat
    neck = (CX + ux + 1, 24 + y0 + uy)
    hd = {'norm': HEAD, 'blink': HEAD_BLINK, 'talk': HEAD_TALK, 'wink': HEAD_WINK}[head]
    body.part(hd, HEAD_PV, neck, deg=lean * 0.6)
    hat_at = (neck[0] + 1 + lean * 0.12, neck[1] - 11)
    body.part(HAT, HAT_PV, hat_at, deg=lean * 0.6 - 4)
    # ---- near arm
    ns = (CX + 4 + ux, 28 + y0 + uy)
    if arm == 'rest':
        ne = (CX + 8 + ux * 0.6, 35 + y0); nh = (CX + 5, 41 + y0)
    elif arm == 'talk1':
        ne = (CX + 9 + ux, 35 + y0); nh = (CX + 14, 30 + y0)
    elif arm == 'talk2':
        ne = (CX + 9 + ux, 35 + y0); nh = (CX + 15, 33 + y0)
    elif arm == 'offer1':
        ne = (CX + 10 + ux, 32 + y0); nh = (CX + 15, 28 + y0)
    elif arm == 'offer2':
        ne = (CX + 11 + ux, 30 + y0); nh = (CX + 18, 25 + y0)
    else:  # bow — hand over heart
        ne = (CX + 8 + ux, 34 + y0 + uy); nh = (CX + 3 + ux, 31 + y0 + uy)
    front.seg(ns, ne, 3, DRESS); front.seg(ne, nh, 2, SKIN)
    front.seg(nh, nh, 3, SKIN)
    if arm.startswith('offer'):
        front.paste(POTION, nh[0] - 1, nh[1] - 6)
    out = np.zeros((H, W, 4), np.uint8)
    for g in (pack, back, body, front):
        if (g.a[..., 3] > 0).any():
            over(out, outline(g.a))
    if spark:
        fx = glow(W, H, (nh[0] + 1, nh[1] - 4), 6 + spark, hx('#ffb0b0'), 0.55)
        l = Layer(W, H)
        sx, sy2 = nh[0] + 4, nh[1] - 9
        for d in range(-spark, spark + 1):
            l.px(sx + d, sy2, hx('#fff6dc')); l.px(sx, sy2 + d, hx('#fff6dc'))
        out = blend_over(blend_over(out, fx), l.a)
    return out


def darker_r(rmp, k=0.75):
    return [tuple(int(c * k) for c in col[:3]) + (255,) for col in rmp]


def clips():
    n = 6
    idle = []
    for i in range(n):
        ph = i / n * 2 * math.pi
        idle.append(frame(bob=round((1 - math.cos(ph)) / 2), sway=ph, head='blink' if i == 4 else 'norm'))
    talk = [frame(bob=0, sway=0.5, arm='talk1', head='talk'), frame(bob=0, sway=1.0, arm='talk1', head='norm'),
            frame(bob=1, sway=1.5, arm='talk2', head='talk'), frame(bob=1, sway=2.0, arm='talk2', head='norm'),
            frame(bob=0, sway=2.5, arm='talk1', head='talk'), frame(bob=0, sway=3.0, arm='talk1', head='norm')]
    offer = [frame(arm='rest'), frame(arm='offer1', sway=0.6), frame(arm='offer2', sway=1.2, head='wink', spark=1),
             frame(arm='offer2', sway=1.8, head='wink', spark=2), frame(arm='offer2', sway=2.4, spark=1),
             frame(arm='offer1', sway=3.0)]
    bow = [frame(arm='bow', bow=6), frame(arm='bow', bow=14, head='blink'), frame(arm='bow', bow=18, head='blink'),
           frame(arm='bow', bow=14, head='blink'), frame(arm='bow', bow=6), frame()]
    return {'idle': (idle, 160, True, None), 'talk': (talk, 120, True, None),
            'offer': (offer, 110, False, 2), 'bow': (bow, 120, False, None)}


if __name__ == '__main__':
    c = clips()
    rows = [v[0] for v in c.values()]
    img = np.concatenate([np.concatenate(r, 1) for r in rows], 0)
    bg = np.zeros_like(img); bg[:] = (40, 34, 52, 255)
    img = blend_over(bg, img)
    Image.fromarray(img).resize((img.shape[1] * 4, img.shape[0] * 4), Image.NEAREST).save(
        '/tmp/claude-0/-home-claude/3af28667-8ee6-50ac-a1c0-241532dd7127/scratchpad/prev_trader.png')
