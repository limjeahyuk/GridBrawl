"""Build wide inn backgrounds from the user's 832x1216 inn image.
The original picture is kept untouched at the left; the room is continued to the
right with pieces of its own back wall (pillar + candle, bottle shelves, bar)."""
import numpy as np
from PIL import Image, ImageFilter
import sys

src = np.array(Image.open('src.png').convert('RGB')).astype(np.float32)
H, W = src.shape[:2]  # 1216, 832

# ---- tile: x 680..832 of the back wall ---------------------------------
X0, X1 = 680, 832
TW = X1 - X0
base = src[:, X0:X1].copy()
tile = base.copy()
# tray/mug band 515..750 is occluded -> second bottle shelf copied from 285..520
tile[515:750] = base[285:520]
# soften the two horizontal seams
for y0 in (515, 750):
    for k in range(-3, 4):
        a = 0.5 - abs(k) / 8
        y = y0 + k
        tile[y] = tile[y] * (1 - a * 0.6) + (tile[y - 1] + tile[y + 1]) / 2 * (a * 0.6)
# a dark shelf lip over the upper seam so it reads as a board edge
# (no lip)

# variant without the candle sconce (x 693..765, y 105..290 in source)
noc = tile.copy()
cx0, cx1 = 693 - X0, 757 - X0
patch = base[105:290, (768 - X0):(768 - X0) + (cx1 - cx0)].copy()
noc[105:290, cx0:cx1] = patch
# remove warm glow a bit around where candle was
glow = np.zeros((H, TW, 1), np.float32)
yy, xx = np.mgrid[0:H, 0:TW]
d = np.sqrt(((xx - (727 - X0)) / 70.0) ** 2 + ((yy - 170) / 120.0) ** 2)
glow[..., 0] = np.clip(1 - d, 0, 1) * 0.25
noc = noc * (1 - glow) + noc * np.array([0.75, 0.7, 0.7]) * glow
noc_m = noc[:, ::-1].copy()
tile_m = tile[:, ::-1].copy()

SEQ = [noc, tile, noc_m, noc, tile_m, noc_m, noc, tile, noc_m, noc, tile_m, noc_m, noc, tile, noc_m]


def scene(width_src, top_src=0):
    """original at x=0, extension tiles to width_src; top_src extra rows above."""
    out = np.zeros((H + top_src, width_src, 3), np.float32)
    body = np.zeros((H, width_src, 3), np.float32)
    body[:, :W] = src
    x = W
    i = 0
    while x < width_src:
        t = SEQ[i % len(SEQ)]
        n = min(TW, width_src - x)
        body[:, x:x + n] = t[:, :n]
        x += n
        i += 1
    # soften the vertical seam between the picture and the first tile (wall only)
    for k in range(-2, 3):
        a = 0.35 - abs(k) * 0.12
        c = W + k
        for rng in ((0, 515), (750, H)):
            body[rng[0]:rng[1], c] = body[rng[0]:rng[1], c] * (1 - a) + (body[rng[0]:rng[1], c - 1] + body[rng[0]:rng[1], c + 1]) / 2 * a
    # little rounded cap for the tray end (picture cuts it at x=832)
    for y in range(700, 737):
        t = (y - 718.5) / 18.5
        ext = int(round(7 * np.sqrt(max(0, 1 - t * t))))
        for dx in range(ext):
            body[y, W + dx] = src[y, W - 3]
        if ext:
            body[y, W + ext - 1] = [26, 12, 8]
    for dx in range(7):
        t = dx / 7
        hy = 18.5 * np.sqrt(max(0, 1 - t * t))
        body[int(718.5 - hy), W + dx] = [26, 12, 8]
        body[min(H - 1, int(718.5 + hy)), W + dx] = [26, 12, 8]
    out[top_src:] = body
    if top_src:
        band = body[0:88]
        rows = []
        while len(rows) < top_src:
            rows.extend(list(band[::-1]))
            rows.extend(list(band))
        ext = np.array(rows[:top_src])[::-1]
        fade = np.linspace(0.25, 0.85, top_src)[:, None, None]
        out[:top_src] = ext * fade
    return out


def save(arr, path, scale, resample=Image.LANCZOS):
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    im = im.resize((1280, 720), resample)
    im.save(path)
    return im


if __name__ == '__main__':
    # A: full-height (720) -> scale 720/1216
    sA = 720 / H
    a = scene(int(round(1280 / sA)) + 1)
    save(a, 'bgA.png', sA)
    # B: half scale (608 tall), room extended above
    b = scene(2560, top_src=1440 - H)
    save(b, 'bgB.png', 0.5, Image.BOX)
    # C: like A but the continued room is blurred + dimmed (depth of field)
    imA = Image.open('bgA.png').convert('RGB')
    blur = imA.filter(ImageFilter.GaussianBlur(6))
    arrA = np.array(imA).astype(np.float32)
    arrB = np.array(blur).astype(np.float32) * 0.72
    w = int(round(W * sA))
    m = np.zeros((720, 1280, 1), np.float32)
    m[:, :w] = 1
    # keep the tray end sharp
    m[:, w:w + 6] = 1
    ramp = np.clip((np.arange(1280) - w) / 40.0, 0, 1)[None, :, None]
    m = np.maximum(m, 0)
    outC = arrA * (1 - ramp) + arrB * ramp
    Image.fromarray(np.clip(outC, 0, 255).astype(np.uint8)).save('bgC.png')
    print('ok', a.shape, b.shape)
