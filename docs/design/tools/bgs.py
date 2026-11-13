"""Tileable parallax backgrounds: grassland (초원) and dungeon (던전). 320×180 at 1x (×4 = 1280×720)."""
import math, os
import numpy as np
from PIL import Image
from pix import hx, Layer, outline, blend_over, over, ramp
from rig import glow

BW, BH = 320, 180


def band_sky(cols, y0, y1):
    a = np.zeros((BH, BW, 4), np.uint8)
    n = len(cols)
    for y in range(BH):
        u = (y - y0) / max(1, (y1 - y0))
        i = int(np.clip(u * n, 0, n - 1))
        # dithered band edges
        a[y, :] = hx(cols[i])
        f = u * n - i
        if 0.82 < f and i + 1 < n:
            a[y, (y % 2)::2] = hx(cols[i + 1])
    return a


def wrap_draw(fn, x, *args, **kw):
    for dx in (-BW, 0, BW):
        fn(x + dx, *args, **kw)


def ridge(lay, base_y, amp, periods, cols, seed=0, snow=None):
    rng = np.random.default_rng(seed)
    ph = rng.random(len(periods)) * 6.28
    hs = []
    for x in range(BW):
        h = base_y
        for k, (p, a) in enumerate(zip(periods, amp)):
            h -= a * math.sin(x / BW * 2 * math.pi * p + ph[k])
        hs.append(h)
    hs = np.array(hs)
    for x in range(BW):
        top = int(round(hs[x]))
        for y in range(max(0, top), BH):
            d = y - top
            c = cols[2] if d < 2 else cols[1] if d < 10 else cols[0]
            # vertical light/shadow facets from slope
            slope = hs[(x + 1) % BW] - hs[x - 1]
            if d >= 2 and slope > 0.6:
                c = cols[0]
            lay.a[y, x] = hx(c)
            if snow and d < snow[1] and top < snow[0]:
                lay.a[y, x] = hx('#f4f8ff') if slope <= 0.3 else hx('#c8d8ec')
    return hs


# ------------------------------------------------------------------ GRASSLAND
def cloud(lay, x, y, s):
    cols = [hx('#b8d8f0'), hx('#e8f4fc'), hx('#ffffff')]
    for dx, dy, r in ((0, 0, 7), (8, -3, 9), (17, 0, 7), (25, 1, 5), (-7, 2, 4)):
        lay.ellipse(x + dx * s, y + dy * s, r * s, r * s * 0.75, cols, True)
    # flat bottom
    lay.a[int(y + 4 * s):int(y + 8 * s), :] = np.where(
        lay.a[int(y + 4 * s):int(y + 8 * s), :, 3:4] > 0, hx('#b8d8f0'), lay.a[int(y + 4 * s):int(y + 8 * s), :])


def tree(lay, x, base, h, seed):
    rng = np.random.default_rng(seed)
    trunk = ramp('#3a2414', '#6a4428', '#8a5c36')
    lay.seg((x, base), (x, base - h * 0.45), 3, trunk, True)
    leaves = [hx('#1e5a2e'), hx('#2f7a3a'), hx('#58a840')]
    for i in range(5):
        cx = x + rng.integers(-5, 6); cy = base - h * 0.55 - rng.integers(0, int(h * 0.45))
        r = rng.integers(5, 8)
        lay.ellipse(cx, cy, r, r * 0.85, leaves, True)
    for i in range(6):
        lay.px(x + rng.integers(-7, 7), base - h * 0.6 - rng.integers(0, int(h * 0.4)), hx('#8ad05a'))


def grassland():
    layers = {}
    sky = band_sky(['#5fb4ec', '#76c2f0', '#8ccdf2', '#a6daf6', '#c2e8fa', '#dcf3fc'], 0, 110)
    sun = glow(BW, BH, (250, 34), 26, hx('#fff6d0'), 0.55)
    sky = blend_over(sky, sun)
    s = Layer(BW, BH); s.ellipse(250, 34, 7, 7, [hx('#ffe9a0'), hx('#fff4c8'), hx('#ffffff')], False)
    sky = over(sky, s.a)
    layers['sky'] = sky
    cl = Layer(BW, BH)
    for x, y, sc in ((30, 30, 1.0), (140, 18, 0.8), (210, 52, 0.7), (290, 26, 1.1)):
        wrap_draw(lambda xx: cloud(cl, xx, y, sc), x)
    layers['clouds'] = cl.a
    mt = Layer(BW, BH)
    ridge(mt, 96, [16, 7, 3], [2, 5, 11], ['#5a7fa8', '#7a9cc4', '#9ab8d8'], seed=1, snow=(84, 4))
    layers['mountains'] = mt.a
    hills = Layer(BW, BH)
    hs = ridge(hills, 120, [6, 4, 2], [3, 7, 13], ['#2f7a3a', '#4a9a44', '#6cbc52'], seed=4)
    # tree line on the hills
    rng = np.random.default_rng(9)
    for i in range(16):
        x = int(i * 20 + rng.integers(0, 10))
        wrap_draw(lambda xx: tree(hills, xx, int(hs[x % BW]) + 6, 22 + rng.integers(0, 10), i), x)
    layers['hills'] = hills.a
    near = Layer(BW, BH)
    hs2 = ridge(near, 146, [3, 2], [4, 9], ['#2e8a34', '#46a83e', '#72c850'], seed=7)
    # grass tufts + flowers
    rng = np.random.default_rng(11)
    for i in range(120):
        x = rng.integers(0, BW); y = int(hs2[x]) + rng.integers(0, 30)
        if y >= BH:
            continue
        near.px(x, y - 1, hx('#8ad860')); near.px(x + 1, y - 2, hx('#8ad860'))
    for i in range(36):
        x = rng.integers(0, BW); y = int(hs2[x]) + rng.integers(3, 26)
        c = [hx('#ffffff'), hx('#ffd84a'), hx('#ff7aa0'), hx('#b48aff')][i % 4]
        near.px(x, y, c); near.px(x + 1, y, c); near.px(x, y - 1, c); near.px(x + 1, y - 1, hx('#ffe9a0'))
    layers['meadow'] = near.a
    return layers


def grass_tile():
    """32×32 board cell for grassland (seamless)."""
    T = 32
    a = np.zeros((T, T, 4), np.uint8)
    rng = np.random.default_rng(5)
    base = [hx('#3e9a3a'), hx('#4aa842'), hx('#56b44a')]
    for y in range(T):
        for x in range(T):
            n = (math.sin(x / T * 2 * math.pi * 2) + math.cos(y / T * 2 * math.pi * 3) + rng.random() * 1.2)
            a[y, x] = base[0] if n < -0.4 else base[2] if n > 1.1 else base[1]
    for i in range(26):
        x, y = rng.integers(0, T), rng.integers(1, T)
        a[y, x] = hx('#7acc5a'); a[(y - 1) % T, (x + 1) % T] = hx('#7acc5a')
    for i in range(6):
        x, y = rng.integers(0, T), rng.integers(0, T)
        a[y, x] = hx('#2e7a30')
    for i in range(3):
        x, y = rng.integers(0, T), rng.integers(0, T)
        a[y, x] = [hx('#ffffff'), hx('#ffd84a'), hx('#ff9ab8')][i]
    return a


def grass_tile_alt():
    """dirt path cell variant."""
    T = 32
    a = np.zeros((T, T, 4), np.uint8)
    rng = np.random.default_rng(6)
    for y in range(T):
        for x in range(T):
            n = math.sin(x * 0.7) * 0.3 + rng.random()
            a[y, x] = hx('#9a7044') if n < 0.45 else hx('#b0844e') if n < 0.95 else hx('#c69a62')
    for i in range(5):
        x, y = rng.integers(2, T - 3), rng.integers(2, T - 3)
        l = Layer(T, T); l.ellipse(x, y, 1.6, 1.2, [hx('#6a6a6a'), hx('#8e8e8a'), hx('#b8b6ae')], True)
        a = over(a, l.a)
    return a


# ------------------------------------------------------------------ DUNGEON
STONES = [hx('#1a1824'), hx('#26243a'), hx('#323048'), hx('#403c5a')]


def brick_wall(lay, y0, y1, bw=16, bh=8, seed=0, cols=STONES):
    rng = np.random.default_rng(seed)
    rows = (y1 - y0) // bh + 1
    for r in range(rows):
        off = (bw // 2) * (r % 2)
        for c in range(-1, BW // bw + 1):
            x0 = c * bw + off; yy = y0 + r * bh
            shade = rng.integers(1, 3)
            for y in range(yy, min(yy + bh, y1)):
                for x in range(x0, x0 + bw):
                    X = x % BW
                    if y < 0 or y >= BH:
                        continue
                    if y == yy or x == x0:
                        lay.a[y, X] = cols[0]
                    elif y == yy + 1 or x == x0 + 1:
                        lay.a[y, X] = cols[shade + 1] if shade + 1 < len(cols) else cols[-1]
                    else:
                        lay.a[y, X] = cols[shade]
            # cracks / moss
            if rng.random() < 0.18:
                cx = x0 + rng.integers(3, bw - 3)
                for k in range(rng.integers(2, bh - 1)):
                    if 0 <= yy + 2 + k < BH:
                        lay.a[yy + 2 + k, (cx + (k % 2)) % BW] = cols[0]
            if rng.random() < 0.12:
                for k in range(rng.integers(2, 6)):
                    if 0 <= yy + bh - 1 < BH:
                        lay.a[yy + bh - 1, (x0 + 2 + k) % BW] = hx('#2e4a36')


def torch_frames(n=4):
    """16×28 torch strip: sconce + animated flame."""
    out = []
    for i in range(n):
        l = Layer(16, 28)
        l.seg((8, 27), (8, 17), 3, ramp('#2a1c12', '#5a3a22', '#7a5232'), True)
        l.poly([(4, 15), (12, 15), (11, 18), (5, 18)], ramp('#3a3a44', '#6a6a78', '#9a9aa8'), True)
        flame = Layer(16, 28)
        h = 9 + (i % 2) * 2 - (i == 3)
        sway = [0, 1, 0, -1][i]
        for k in range(h):
            u = k / h
            w = max(1, int(round(3.5 * (1 - u ** 1.3))))
            for dx in range(-w, w + 1):
                c = hx('#fff4c0') if abs(dx) < w * 0.4 and u < 0.6 else hx('#ffc04a') if abs(dx) < w * 0.75 else hx('#ff5a1a')
                flame.px(8 + dx + round(sway * u), 14 - k, c)
        g = glow(16, 28, (8, 10), 9, hx('#ffb04a'), 0.5)
        out.append(blend_over(blend_over(g, outline(l.a)), flame.a))
    return out


def dungeon():
    layers = {}
    back = Layer(BW, BH)
    back.a[:] = hx('#0c0a12')
    brick_wall(back, 0, 150, 16, 8, seed=1, cols=[hx('#110f18'), hx('#1a1826'), hx('#221f32'), hx('#2c2840')])
    # arches (dark recesses) + pillars
    for ax in (40, 200):
        def arch(x):
            for y in range(28, 150):
                for dx in range(-26, 27):
                    r = math.hypot(dx, max(0, 58 - y) * 0.95)
                    if y >= 58 and abs(dx) <= 26 or (y < 58 and r <= 26):
                        X = (x + dx) % BW
                        inner = abs(dx) < 22 and (y >= 58 or r < 22)
                        back.a[y, X] = hx('#06050a') if inner else hx('#3a3652')
        wrap_draw(arch, ax)
        # bars in arch
        for bx in range(-16, 17, 8):
            for y in range(40, 150):
                back.a[y, (ax + bx) % BW] = hx('#2a2838')
                back.a[y, (ax + bx + 1) % BW] = hx('#14121c')
    for px_ in (120, 280):
        for y in range(0, 150):
            for dx in range(-10, 11):
                X = (px_ + dx) % BW
                c = hx('#3a3652') if dx < -6 else hx('#4a4566') if dx < 2 else hx('#2c2840') if dx < 8 else hx('#1a1826')
                if y % 22 == 0:
                    c = hx('#110f18')
                back.a[y, X] = c
        # banner
        for y in range(16, 70):
            w = 7 if y < 64 else 7 - (y - 64)
            for dx in range(-w, w + 1):
                X = (px_ + dx) % BW
                back.a[y, X] = hx('#5a1424') if abs(dx) > w - 2 else hx('#8a2a3a')
        for y in range(30, 44):
            back.a[y, px_ % BW] = hx('#c9952f')
        for dx in range(-3, 4):
            back.a[36, (px_ + dx) % BW] = hx('#c9952f')
    layers['wall'] = back.a
    # warm torch light on the wall (separate additive-ish layer)
    light = np.zeros((BH, BW, 4), np.uint8)
    for tx in (120 - 18, 120 + 18, 280 - 18, 280 + 18):
        for dx in (-BW, 0, BW):
            light = blend_over(light, glow(BW, BH, (tx + dx, 70), 44, hx('#ff9a3a'), 0.22))
    layers['torchlight'] = light
    tf = torch_frames()[0]
    wl = Layer(BW, BH); wl.a = layers['wall']
    for tx in (120 - 18, 120 + 18, 280 - 18, 280 + 18):
        wl.paste(tf, tx - 8, 56)
    layers['wall'] = wl.a
    floor = Layer(BW, BH)
    # flagstone floor in perspective strip
    for y in range(146, BH):
        depth = (y - 146) / (BH - 146)
        tile_w = int(18 + depth * 22)
        row = int((y - 146) / (4 + depth * 6))
        for x in range(BW):
            xx = (x + row * tile_w // 2) % tile_w
            edge = xx == 0 or (y - 146) % int(4 + depth * 6 + 1) == 0
            n = ((x // max(1, tile_w)) * 7 + row * 3) % 3
            c = [hx('#24222e'), hx('#2c2a38'), hx('#33303f')][n]
            floor.a[y, x] = hx('#15131c') if edge else c
    for x in range(BW):
        floor.a[146, x] = hx('#4a4566'); floor.a[147, x] = hx('#15131c')
    layers['floor'] = floor.a
    fg = Layer(BW, BH)
    rng = np.random.default_rng(3)
    for i in range(9):
        x = int(i * 36 + rng.integers(0, 14)); L = rng.integers(8, 22)
        def stal(xx):
            for k in range(L):
                w = max(0, int((1 - k / L) * 4))
                for dx in range(-w, w + 1):
                    fg.px(xx + dx, k, hx('#0a0810') if dx > -w else hx('#2a2838'))
        wrap_draw(stal, x)
    # chains
    for cx in (70, 236):
        for y in range(0, 50, 3):
            wrap_draw(lambda xx: (fg.px(xx, y, hx('#4a4858')), fg.px(xx, y + 1, hx('#2a2838')), fg.px(xx + 1, y + 1, hx('#6a6878'))), cx)
    layers['foreground'] = fg.a
    return layers


def dungeon_tile():
    T = 32
    a = np.zeros((T, T, 4), np.uint8)
    rng = np.random.default_rng(8)
    a[:] = hx('#2a2836')
    # 2×2 flagstones
    for (x0, y0, w, h) in ((0, 0, 16, 16), (16, 0, 16, 16), (0, 16, 16, 16), (16, 16, 16, 16)):
        c = [hx('#2a2836'), hx('#302d3e'), hx('#26242f')][rng.integers(0, 3)]
        a[y0:y0 + h, x0:x0 + w] = c
        a[y0, x0:x0 + w] = hx('#15131c'); a[y0:y0 + h, x0] = hx('#15131c')
        a[y0 + 1, x0 + 1:x0 + w] = hx('#3a3748')
    for i in range(10):
        x, y = rng.integers(1, T), rng.integers(1, T)
        a[y, x] = hx('#1c1a24')
    for i in range(4):
        x, y = rng.integers(1, T), rng.integers(1, T)
        a[y, x] = hx('#2e4a36')
    return a


def compose(layers, order):
    out = np.zeros((BH, BW, 4), np.uint8)
    for k in order:
        out = blend_over(out, layers[k])
    return out


def save_all(outdir):
    d = {}
    for name, fn, order in (('grassland', grassland, ['sky', 'clouds', 'mountains', 'hills', 'meadow']),
                            ('dungeon', dungeon, ['wall', 'torchlight', 'floor', 'foreground'])):
        L = fn()
        p = os.path.join(outdir, 'bg', name)
        os.makedirs(p, exist_ok=True)
        for k, a in L.items():
            Image.fromarray(a).save(os.path.join(p, f'{k}.png'), optimize=True)
        comp = compose(L, order)
        Image.fromarray(comp).save(os.path.join(p, 'preview.png'))
        d[name] = (L, comp)
    os.makedirs(os.path.join(outdir, 'terrain'), exist_ok=True)
    Image.fromarray(grass_tile()).save(os.path.join(outdir, 'terrain', 'grass-tile.png'))
    Image.fromarray(grass_tile_alt()).save(os.path.join(outdir, 'terrain', 'dirt-tile.png'))
    Image.fromarray(dungeon_tile()).save(os.path.join(outdir, 'terrain', 'dungeon-tile.png'))
    tf = torch_frames()
    os.makedirs(os.path.join(outdir, 'bg', 'dungeon'), exist_ok=True)
    Image.fromarray(np.concatenate(tf, 1)).save(os.path.join(outdir, 'bg', 'dungeon', 'torch.png'))
    return d


if __name__ == '__main__':
    d = save_all('out')
    for k, (L, comp) in d.items():
        Image.fromarray(comp).resize((BW * 3, BH * 3), Image.NEAREST).save(f'prev_bg_{k}.png')
