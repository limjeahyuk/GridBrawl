"""? 이벤트 장면 그림 — 전부 1x로 그리고 화면에서 ×4 정수 배율로 쓴다.
forge(6f) · trader · hotspring(4f) · apothecary · jar · gacha(2f) · mole(4f) · surgery · lock · potions."""
import math, os
import numpy as np
from PIL import Image
from pix import *
from rig import glow

OUT = 'out/ui/events'
os.makedirs(OUT, exist_ok=True)
K = OUTLINE


def R(*h):
    return ramp(*h)


STONE = R('#2a2a38', '#4a4a5e', '#7a7a92')
STONE_D = R('#1e1e2a', '#34344a', '#52526a')
BRICK = R('#3a1e18', '#6a3428', '#9a5238')
IRON = R('#2a2e38', '#5a606e', '#9aa2b2')
WOOD = R('#3a2616', '#6a4428', '#946038')
CLAY = R('#5a2e18', '#9a5a32', '#c98a52')
GOLD = R('#8a5a18', '#c9952f', '#ffd24a')
CLOTH = R('#1e1a2e', '#3a3058', '#5a4e82')
FL = [hx('#8a1a10'), hx('#e0482a'), hx('#ff9a3a'), hx('#ffd24a'), hx('#fff6dc')]


def flame(W, H, cx, base, h, w, t, ph=0):
    yy, xx = np.mgrid[0:H, 0:W]
    a = np.zeros((H, W), float)
    for (dx, hh, ww, p) in [(0, h, w, 0), (-w * 0.6, h * 0.6, w * 0.6, 1.7), (w * 0.6, h * 0.65, w * 0.6, 3.1)]:
        sx = cx + dx + math.sin(t + p + ph) * 1.0
        top = base - hh - math.sin(t * 2 + p) * 1.2
        v = (yy - top) / max(1, base - top)
        half = ww * np.sqrt(np.clip(v, 0, 1)) * np.clip(1.25 - v * 0.6, 0, 1)
        m = (v >= 0) & (v <= 1) & (np.abs(xx + 0.5 - sx) <= half)
        a = np.maximum(a, np.where(m, 1 - np.abs(xx + 0.5 - sx) / np.maximum(half, .5) * .5 - (1 - v) * .5 + .2, 0))
    out = np.zeros((H, W, 4), np.uint8)
    lv = np.digitize(a, [0.05, 0.3, 0.5, 0.7, 0.9]) - 1
    for k in range(5):
        out[(lv == k) & (a > 0.05)] = FL[k]
    return out


def comp(*layers, glow_=None):
    H, W = layers[0].a.shape[:2]
    out = np.zeros((H, W, 4), np.uint8)
    if glow_ is not None:
        out = blend_over(out, glow_)
    for l in layers:
        if (l.a[..., 3] > 0).any():
            over(out, outline(l.a, K))
    return out


def save(name, frames):
    strip = np.concatenate(frames, 1)
    Image.fromarray(strip).save(f'{OUT}/{name}.png')
    return frames[0].shape


# ------------------------------------------------------------------ 1. forge (대장간, 꺼지지 않는 불)
def forge():
    W, H = 64, 52
    fr = []
    for i in range(6):
        t = i / 6 * 2 * math.pi
        back, mid, front = Layer(W, H), Layer(W, H), Layer(W, H)
        # 화덕: 벽돌 몸통 + 아치 + 굴뚝
        back.poly([(4, 50), (4, 18), (10, 12), (34, 12), (40, 18), (40, 50)], BRICK)
        back.poly([(16, 12), (16, 0), (28, 0), (28, 12)], BRICK)
        for y in range(16, 50, 5):
            for x in range(6 + (y // 5 % 2) * 4, 39, 8):
                back.px(x, y, hx('#3a1e18'))
        back.ellipse(22, 34, 10, 10, R('#1a0a08', '#2a1008', '#3a1a10'), shade=False)
        back.poly([(12, 50), (12, 36), (32, 36), (32, 50)], R('#1a0a08', '#2a1008', '#3a1a10'), shade=False)
        f = flame(W, H, 22, 46, 15, 7, t)
        # 모루 + 망치 + 집게
        front.poly([(40, 36), (62, 36), (60, 40), (54, 40), (55, 46), (58, 50), (44, 50), (47, 46), (48, 40), (42, 40)], IRON)
        front.seg((44, 34), (54, 24), 2, WOOD)
        front.poly([(52, 21), (58, 27), (56, 29), (50, 23)], IRON)
        mid.seg((38, 48), (46, 50), 1, IRON)
        # 바닥 숯·불똥
        g = glow(W, H, (22, 38), 22, hx('#ff8a3a'), 0.55)
        out = comp(back, mid, front, glow_=g)
        out = blend_over(out, f)
        for s in range(3):
            y = int(30 - (i * 5 + s * 9) % 26); x = int(22 + math.sin(s * 2.3 + i) * 6)
            if 0 <= y < H: out[y, x] = FL[3]
        fr.append(out)
    return save('forge', fr)


# ------------------------------------------------------------------ 2. trader (거래를 청하는 누군가)
def trader():
    W, H = 52, 60
    back, body, front = Layer(W, H), Layer(W, H), Layer(W, H)
    # 망토 몸
    body.poly([(14, 58), (18, 26), (26, 18), (36, 22), (40, 58)], CLOTH)
    body.poly([(18, 30), (26, 16), (34, 18), (38, 30), (34, 34), (22, 34)], R('#141024', '#2a2244', '#463a6a'))  # 두건
    body.ellipse(28, 27, 6, 5, R('#05040a', '#0a0812', '#141020'), shade=False)  # 얼굴 그늘
    # 금 장식 · 끈
    body.seg((22, 36), (34, 36), 1, GOLD)
    # 내민 손 + 반짝이는 동전
    front.seg((34, 38), (44, 40), 3, CLOTH)
    front.seg((45, 40), (46, 40), 3, R('#8a5a3a', '#c98a5a', '#e8b080'))
    # 등불 (먼 손)
    back.seg((18, 38), (10, 44), 2, CLOTH)
    back.seg((9, 44), (9, 47), 1, IRON)
    back.poly([(6, 47), (12, 47), (12, 54), (6, 54)], GOLD)
    g = glow(W, H, (9, 51), 12, hx('#ffd24a'), 0.5)
    out = comp(back, body, front, glow_=g)
    # 눈 두 점
    for x in (26, 30):
        out[27, x] = hx('#ffd24a')
    out[38, 47] = hx('#ffd24a'); out[37, 47] = hx('#fff6dc')
    out[51, 9] = hx('#fff6dc'); out[50, 9] = hx('#ffd24a')
    return save('trader', [out])


# ------------------------------------------------------------------ 3. hot spring (온천, 김)
def hotspring():
    W, H = 76, 48
    fr = []
    for i in range(4):
        t = i / 4 * 2 * math.pi
        rocks, water = Layer(W, H), Layer(W, H)
        water.ellipse(38, 36, 30, 9, R('#1e5a6a', '#3a9aa8', '#8ae0e0'))
        for k in range(5):
            x = 16 + k * 11 + int(math.sin(t + k) * 2)
            water.seg((x, 36 + (k % 2)), (x + 4, 36 + (k % 2)), 1, R('#8ae0e0', '#c6f4f0', '#ffffff'), shade=False)
        for (x, y, rx, ry) in [(8, 38, 6, 5), (16, 44, 6, 4), (30, 46, 7, 3), (46, 46, 7, 3), (60, 44, 6, 4), (69, 38, 6, 5), (64, 30, 5, 4), (12, 30, 5, 4), (38, 27, 6, 3), (24, 28, 5, 3), (52, 28, 5, 3)]:
            rocks.ellipse(x, y, rx, ry, STONE)
        # 대나무 국자 + 표지판
        rocks.seg((70, 30), (70, 12), 2, WOOD)
        rocks.poly([(62, 10), (76, 10), (76, 18), (62, 18)], WOOD)
        out = comp(water, rocks)
        out[13, 66] = hx('#e0485a'); out[14, 67] = hx('#e0485a'); out[13, 68] = hx('#e0485a')  # ♨ 점
        # 김: 반투명 물결 3줄
        steam = np.zeros((H, W, 4), np.uint8)
        for k, x0 in enumerate((24, 38, 52)):
            for y in range(4, 30):
                x = int(x0 + math.sin(y * 0.35 + t + k * 1.3) * 3)
                a = int(150 * (1 - abs(y - 17) / 14))
                if a > 0:
                    steam[y, x] = (240, 240, 250, a); steam[y, x + 1] = (240, 240, 250, a // 2)
        fr.append(blend_over(out, steam))
    return save('hotspring', fr)


# ------------------------------------------------------------------ 4. apothecary (약방 · 의문의 남자 · 약 3병)
POT_COL = [R('#6a1020', '#e0485a', '#ffb0b0'), R('#1e4a1a', '#6ab83a', '#c8f08a'), R('#2a1a5a', '#8a6ae0', '#d0c0ff')]


def potion(c, big=False):
    W, H = (12, 16)
    l = Layer(W, H)
    l.poly([(4, 1), (8, 1), (8, 3), (4, 3)], R('#5a3418', '#8a5a30', '#b07a44'))
    l.poly([(5, 3), (7, 3), (7, 6), (5, 6)], R('#8a8aa0', '#c6ccd4', '#ffffff'))
    l.ellipse(6, 10.5, 4.5, 4.5, c)
    l.px(4, 8, hx('#ffffff'))
    return outline(l.a, K)


def apothecary():
    W, H = 72, 60
    shelf, man, counter = Layer(W, H), Layer(W, H), Layer(W, H)
    shelf.poly([(2, 2), (70, 2), (70, 40), (2, 40)], R('#2a1a10', '#3a2416', '#4a3020'), shade=False)
    for y in (13, 26, 39):
        shelf.seg((2, y), (70, y), 2, WOOD)
    cols = ['#e0485a', '#6ab83a', '#8a6ae0', '#ffd24a', '#3a9aa8', '#c48aff', '#ff9a3a']
    k = 0
    for row, y in enumerate((12, 25, 38)):
        for x in range(5, 68, 5):
            if (x + row * 3) % 4 == 0: continue
            hgt = 4 + (x * 7 + row) % 4
            c = cols[k % len(cols)]; k += 1
            shelf.poly([(x, y - hgt), (x + 3, y - hgt), (x + 3, y), (x, y)], R(c, c, '#ffffff'), shade=True)
    # 의문의 남자 — 새부리 가면 + 챙 모자
    man.poly([(22, 48), (26, 26), (46, 26), (50, 48)], R('#14101a', '#241e30', '#3a3048'))
    man.ellipse(36, 22, 7, 7, R('#c9b890', '#e8dcc0', '#fff6e0'))
    man.poly([(40, 21), (52, 27), (40, 26)], R('#a89878', '#d8ccb0', '#f0e8d0'))  # 부리
    man.poly([(24, 16), (48, 16), (46, 13), (40, 12), (40, 6), (32, 6), (32, 12), (26, 13)], R('#0e0a14', '#1e1828', '#34284a'))
    # 계산대
    counter.poly([(0, 44), (72, 44), (72, 60), (0, 60)], WOOD)
    counter.seg((0, 45), (72, 45), 1, R('#946038', '#b07a44', '#d09a5a'), shade=False)
    out = comp(shelf, man, counter)
    out[21, 38] = hx('#3a9aa8'); out[21, 39] = hx('#8ae0e0')  # 가면 눈
    # 약 3병 (계산대 위)
    for j, x in enumerate((18, 30, 42)):
        p = potion(POT_COL[j])
        l = Layer(W, H); l.paste(p, x, 30); out = blend_over(out, l.a)
    for j in range(3):
        Image.fromarray(potion(POT_COL[j])).save(f'{OUT}/potion-{j}.png')
    return save('apothecary', [out])


# ------------------------------------------------------------------ 5. jar (습한 동굴의 항아리)
def jar():
    W, H = 48, 52
    floor, j = Layer(W, H), Layer(W, H)
    floor.ellipse(24, 47, 22, 4, R('#141a20', '#1e2a30', '#2e3e46'))
    floor.ellipse(10, 47, 6, 2, R('#1e3a4a', '#2e5a6a', '#5a9aa8'))  # 물웅덩이
    j.ellipse(24, 32, 15, 15, CLAY)
    j.poly([(16, 14), (32, 14), (30, 20), (18, 20)], CLAY)
    j.poly([(14, 10), (34, 10), (34, 14), (14, 14)], R('#3a1e10', '#6a3a1e', '#8a5230'))  # 뚜껑
    j.poly([(21, 6), (27, 6), (27, 10), (21, 10)], R('#3a1e10', '#6a3a1e', '#8a5230'))
    j.seg((10, 30), (38, 30), 1, R('#3a1e10', '#5a2e18', '#6a3a1e'), shade=False)
    for x, y in [(15, 36), (30, 38), (20, 42)]:
        j.px(x, y, hx('#3a6a3a'))  # 이끼
    out = comp(floor, j)
    # 뚜껑 틈의 초록 기운 (독)
    g = glow(W, H, (24, 14), 9, hx('#6ab83a'), 0.35)
    out = blend_over(out, g)
    for x in (18, 23, 29):
        out[15, x] = hx('#b6ea6a')
    return save('jar', [out])


# ------------------------------------------------------------------ 6. gacha (집게 기계)
def gacha():
    W, H = 52, 68
    fr = []
    for i in range(2):
        cab, glass, front = Layer(W, H), Layer(W, H), Layer(W, H)
        cab.poly([(4, 66), (4, 4), (48, 4), (48, 66)], R('#5a1a3a', '#a03a6a', '#e07aa8'))
        cab.poly([(8, 12), (44, 12), (44, 44), (8, 44)], R('#1a1424', '#241c34', '#2e2440'), shade=False)  # 유리 안
        # 상품: 하트 + 상자(유물) + 공들
        for (x, y, c) in [(14, 40, '#6ab8ff'), (20, 41, '#ffd24a'), (34, 40, '#b6ea6a'), (40, 41, '#c48aff'), (27, 41, '#ff9a3a')]:
            glass.ellipse(x, y, 3, 3, R(c, c, '#ffffff'))
        glass.poly([(30, 31), (38, 31), (38, 37), (30, 37)], GOLD)  # 유물 상자
        glass.seg((34, 31), (34, 37), 1, R('#e0485a', '#e0485a', '#ff9a9a'), shade=False)
        glass.ellipse(15, 33, 3, 3, R('#8a1020', '#e0485a', '#ffb0b0'))  # 하트 공
        # 집게
        cx = 22 + i * 2
        glass.seg((cx, 12), (cx, 22), 1, IRON)
        glass.poly([(cx - 4, 22), (cx + 4, 22), (cx + 3, 25), (cx - 3, 25)], IRON)
        glass.seg((cx - 3, 25), (cx - 5, 29), 1, IRON); glass.seg((cx + 3, 25), (cx + 5, 29), 1, IRON)
        # 조작판 · 동전 구멍 · 출구
        front.poly([(4, 46), (48, 46), (48, 56), (4, 56)], R('#3a0e24', '#6a2244', '#a03a6a'))
        front.ellipse(14, 51, 3, 3, R('#8a1020', '#e0485a', '#ffb0b0'))
        front.seg((14, 51), (14, 47), 2, IRON)
        front.poly([(30, 49), (34, 49), (34, 53), (30, 53)], GOLD)
        front.poly([(36, 58), (46, 58), (46, 64), (36, 64)], R('#0a0810', '#141018', '#1e1828'), shade=False)
        out = comp(cab, glass, front)
        # 지붕 전구
        for k, x in enumerate(range(7, 47, 4)):
            on = (k + i) % 2 == 0
            out[7, x] = hx('#fff1b8') if on else hx('#7a2a4a')
            out[7, x + 1] = hx('#ffd24a') if on else hx('#5a1a3a')
        # 유리 반사
        for y in range(14, 30):
            out[y, 10 + (y - 14) // 4] = (255, 255, 255, 90)
        fr.append(out)
    return save('gacha', fr)


# ------------------------------------------------------------------ 7. mole (반짝이를 든 두더지)
def mole():
    W, H = 64, 44
    fr = []
    for i in range(4):
        dirt, m, front = Layer(W, H), Layer(W, H), Layer(W, H)
        dirt.ellipse(32, 38, 30, 6, R('#3a2416', '#5a3a22', '#7a5230'))
        for (x, y) in [(12, 38), (52, 39)]:
            dirt.ellipse(x, y, 6, 2.5, R('#0a0604', '#140c08', '#1e140c'), shade=False)
        pop = [10, 4, 0, 6][i]  # 머리 높이
        if pop < 10:
            cy = 28 + pop
            m.ellipse(32, cy, 9, 8, R('#2a2030', '#4a3a52', '#6a5a74'))
            m.ellipse(38, cy + 1, 3, 2.5, R('#c96a7a', '#ff9aa8', '#ffd0d8'))  # 코
            # 앞발 + 반짝이
            m.seg((26, cy + 6), (24, cy + 8), 2, R('#c96a7a', '#ff9aa8', '#ffd0d8'))
        front.ellipse(32, 37, 11, 3.5, R('#2a1a10', '#3a2416', '#5a3a22'))  # 굴 입구
        front.ellipse(32, 37, 7, 2, R('#0a0604', '#140c08', '#1e140c'), shade=False)
        for (x, y) in [(20, 34), (44, 33), (16, 40), (48, 41)]:
            front.ellipse(x, y, 2.5, 1.5, R('#4a3020', '#6a4428', '#8a5a30'))
        out = comp(dirt, m, front)
        if pop < 10:
            cy = 28 + pop
            out[cy - 2, 35] = hx('#141018'); out[cy - 2, 30] = hx('#141018')
            gx, gy = 23, cy + 6
            out = blend_over(out, glow(W, H, (gx, gy), 6, hx('#6ae0ff'), 0.6))
            out[gy, gx] = hx('#ffffff'); out[gy - 1, gx] = hx('#6ae0ff'); out[gy + 1, gx] = hx('#6ae0ff'); out[gy, gx - 1] = hx('#6ae0ff'); out[gy, gx + 1] = hx('#6ae0ff')
        fr.append(out)
    return save('mole', fr)


# ------------------------------------------------------------------ 8. surgery (수술실)
def surgery():
    W, H = 72, 56
    lamp, table, tools = Layer(W, H), Layer(W, H), Layer(W, H)
    lamp.seg((36, 0), (36, 8), 1, IRON)
    lamp.poly([(26, 14), (46, 14), (42, 8), (30, 8)], IRON)
    table.poly([(8, 34), (58, 34), (58, 38), (8, 38)], R('#6a6a7a', '#a8b0c0', '#e0e8f0'))  # 침대
    table.poly([(8, 30), (58, 30), (58, 34), (8, 34)], R('#a8a898', '#e8e8d8', '#ffffff'))   # 시트
    table.ellipse(14, 29, 5, 2.5, R('#a8a898', '#e8e8d8', '#ffffff'))                      # 베개
    for x in (12, 54):
        table.seg((x, 38), (x, 52), 2, IRON)
    table.seg((10, 52), (56, 52), 1, IRON)
    # 도구 쟁반
    tools.seg((64, 36), (64, 54), 1, IRON)
    tools.poly([(58, 34), (70, 34), (70, 36), (58, 36)], IRON)
    # 진열 병 3개 (심장 · 손 · 발)
    jars = [(16, 'heart'), (30, 'hand'), (44, 'foot')]
    for x, _ in jars:
        tools.poly([(x, 46), (x + 8, 46), (x + 8, 54), (x, 54)], R('#2a4a5a', '#5a8a9a', '#a8d8e0'))
    out = comp(table, tools, lamp, glow_=glow(W, H, (36, 26), 26, hx('#fff6dc'), 0.35))
    # 조명 빛
    light = np.zeros((H, W, 4), np.uint8)
    for y in range(15, 31):
        hw = 6 + (y - 15) * 1.1
        for x in range(int(36 - hw), int(36 + hw)):
            if 0 <= x < W: light[y, x] = (255, 246, 220, 40)
    out = blend_over(out, light)
    # 칼 · 가위 반짝
    out[33, 60] = hx('#ffffff'); out[33, 61] = hx('#c6ccd4'); out[33, 62] = hx('#c6ccd4'); out[33, 66] = hx('#ffffff'); out[32, 67] = hx('#c6ccd4')
    # 병 안 실루엣 (빨강 심장 · 살색 손 · 살색 발)
    def put(pts, c):
        for (x, y) in pts:
            out[y, x] = hx(c)
    put([(19, 49), (21, 49), (18, 50), (19, 50), (20, 50), (21, 50), (22, 50), (19, 51), (20, 51), (21, 51), (20, 52)], '#e0485a')
    put([(33, 48), (35, 48), (37, 48), (33, 49), (34, 49), (35, 49), (36, 49), (37, 49), (34, 50), (35, 50), (36, 50), (34, 51), (35, 51), (36, 51), (35, 52)], '#e8b080')
    put([(47, 48), (47, 49), (47, 50), (47, 51), (48, 51), (49, 51), (50, 51), (48, 52), (49, 52), (50, 52), (51, 52)], '#e8b080')
    return save('surgery', [out])


# ------------------------------------------------------------------ lock (히든 선택지)
def lock():
    a = sprite('''
..SSSS..
.S....S.
.S....S.
gggggggg
gGGGGGGg
gGGkkGGg
gGGkkGGg
gGGGkGGg
gGGGGGGg
gggggggg
''', dict(S='#9aa2b2', g='#8a5a18', G='#c9952f', k='#2a1c10'))
    p = np.zeros((12, 10, 4), np.uint8); p[1:11, 1:9] = a
    Image.fromarray(outline(p, K)).save(f'{OUT}/lock.png')
    b = sprite('''
..SSSS...
.S....S..
.S.......
gggggggg.
gGGGGGGg.
gGGkkGGg.
gGGkkGGg.
gGGGkGGg.
gGGGGGGg.
gggggggg.
''', dict(S='#ffd24a', g='#8a5a18', G='#ffd24a', k='#2a1c10'))
    p = np.zeros((12, 11, 4), np.uint8); p[1:11, 1:10] = b
    Image.fromarray(outline(p, K)).save(f'{OUT}/unlock.png')


if __name__ == '__main__':
    for fn in (forge, trader, hotspring, apothecary, jar, gacha, mole, surgery):
        print(fn.__name__, fn())
    lock()
    # 미리보기
    names = ['forge', 'trader', 'hotspring', 'apothecary', 'jar', 'gacha', 'mole', 'surgery']
    tiles = []
    for n in names:
        im = Image.open(f'{OUT}/{n}.png').convert('RGBA')
        fw = {'forge': 64, 'hotspring': 76, 'gacha': 52, 'mole': 64}.get(n, im.width)
        im = im.crop((0, 0, fw, im.height))
        bg = Image.new('RGBA', (80, 72), (30, 24, 40, 255)); bg.alpha_composite(im, ((80 - im.width) // 2, 72 - im.height))
        tiles.append(bg)
    sheet = Image.new('RGBA', (80 * 4, 72 * 2))
    for k, t in enumerate(tiles):
        sheet.paste(t, ((k % 4) * 80, (k // 4) * 72))
    sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save('/tmp/claude-0/-home-claude/3af28667-8ee6-50ac-a1c0-241532dd7127/scratchpad/prev_events.png')
