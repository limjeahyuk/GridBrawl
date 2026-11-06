"""모닥불(애니메이션 6프레임 40x36) + 강화 아이콘(모루+망치 16x16) + 룰렛 아이콘."""
import math, os, numpy as np
from PIL import Image
from pix import *
from rig import glow
OUT = 'out/ui/rest'; os.makedirs(OUT, exist_ok=True)
W, H = 40, 36
LOG = ramp('#3a2616', '#6a4428', '#946038'); STONE = ramp('#3a3a48', '#6a6a7a', '#9a9aaa')
FL = [hx('#8a1a10'), hx('#e0482a'), hx('#ff9a3a'), hx('#ffd24a'), hx('#fff6dc')]

def fire_frame(i):
    base = Layer(W, H); fl = Layer(W, H)
    # stones ring
    for k, x in enumerate([6, 11, 17, 23, 29, 34]):
        base.ellipse(x, 32 + (k % 2), 3, 2, STONE)
    base.seg((8, 30), (30, 25), 3, LOG); base.seg((10, 25), (32, 30), 3, LOG)
    base.px(30, 25, hx('#c9952f')); base.px(10, 25, hx('#c9952f'))
    # flames: stacked teardrops wobbling
    t = i / 6 * 2 * math.pi
    a = np.zeros((H, W), float)
    yy, xx = np.mgrid[0:H, 0:W]
    for (cx, h, w, ph) in [(20, 20, 7, 0), (15, 13, 4.5, 1.7), (25, 14, 4.5, 3.1), (20, 9, 3, 2.2)]:
        sx = cx + math.sin(t + ph) * 1.3
        top = 27 - h - math.sin(t * 2 + ph) * 1.5
        v = (yy - top) / max(1, (27 - top))
        half = w * np.sqrt(np.clip(v, 0, 1)) * np.clip(1.25 - v * 0.6, 0, 1)
        m = (v >= 0) & (v <= 1) & (np.abs(xx + 0.5 - sx) <= half)
        a = np.maximum(a, np.where(m, 1 - np.abs(xx + 0.5 - sx) / np.maximum(half, 0.5) * 0.5 - (1 - v) * 0.5 + 0.2, 0))
    out = outline(base.a)
    fa = np.zeros((H, W, 4), np.uint8)
    lv = np.digitize(a, [0.05, 0.3, 0.5, 0.7, 0.9]) - 1
    for k in range(5):
        fa[(lv == k) & (a > 0.05)] = FL[k]
    # sparks
    for s in range(3):
        y = int((30 - (i * 4 + s * 9) % 30)); x = int(20 + math.sin(s * 2.1 + i) * 8)
        if 0 <= y < H and 0 <= x < W and y < 14: fa[y, x] = FL[3]
    return blend_over(out, fa)

frames = [fire_frame(i) for i in range(6)]
Image.fromarray(np.concatenate(frames, 1)).save(f'{OUT}/campfire.png')
glow_ = glow(W * 3, H * 2, (W * 1.5, H * 1.3), 40, hx('#ff9a3a'), 0.45)
Image.fromarray(glow_).save(f'{OUT}/campfire-glow.png')

ANVIL = sprite('''
..........GG....
.........GggG...
........GgwgG...
.......GgggG....
......bbGgG.....
.....bnb.G......
....bnb.........
...bnb..........
SSSSSSSSSSSS....
SssssssssssSSS..
.SSSSssssSSS....
....SsssS.......
...SssssssS.....
..SSSSSSSSSS....
''', dict(G='#7a8496', g='#c6ccd4', w='#ffffff', b='#3a2616', n='#946038', S='#3a3a48', s='#6a6a7a'))
a = np.zeros((16, 18, 4), np.uint8); a[1:15, 1:17] = ANVIL
Image.fromarray(outline(a)).save(f'{OUT}/anvil.png')
prev = np.concatenate(frames, 1)
bg = np.zeros_like(prev); bg[:] = (30, 24, 40, 255)
Image.fromarray(blend_over(bg, prev)).resize((prev.shape[1] * 5, prev.shape[0] * 5), Image.NEAREST).save('/tmp/claude-0/-home-claude/3af28667-8ee6-50ac-a1c0-241532dd7127/scratchpad/prev_fire.png')
an = outline(a); bg2 = np.zeros_like(an); bg2[:] = (30, 24, 40, 255)
Image.fromarray(blend_over(bg2, an)).resize((18 * 10, 16 * 10), Image.NEAREST).save('/tmp/claude-0/-home-claude/3af28667-8ee6-50ac-a1c0-241532dd7127/scratchpad/prev_anvil.png')
