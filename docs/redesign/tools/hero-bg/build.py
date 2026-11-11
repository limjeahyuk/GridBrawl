"""Hero select backgrounds — same recipe as the inn (draft C).
The illustration is kept untouched at full screen height on the left. The scene is
continued to the right by ping-pong mirroring a clean strip from the picture's right
edge, then blurred progressively (depth of field) and dimmed for the UI.
usage: python build.py   (expects cairn.png, sable.png, magision.png, all 832x1216 — docs/redesign/2dImg)
The mage is drawn from magision.png (2026-11-11) but still saved as bg-dirge.png, the name the game loads."""
import numpy as np
import cv2
from PIL import Image, ImageFilter

W, H = 832, 1216
S = 720 / H
PW = round(W * S)  # 493 px on screen


def load(n):
    return np.array(Image.open(n + '.png').convert('RGB'))


def strip_simple(a, x0, holes=()):
    st = a[:, x0:].copy()
    if holes:
        m = np.zeros(st.shape[:2], np.uint8)
        for (y0, y1, hx0, hx1) in holes:
            m[y0:y1, max(0, hx0 - x0):hx1 - x0] = 255
        st = cv2.inpaint(st, m, 5, cv2.INPAINT_TELEA)
    return st


def strip_knight(a):
    """the red cape runs off the right edge: rebuild sky / horizon / field behind it."""
    x0 = 700
    st = a[:, x0:].copy()
    w = st.shape[1]
    sky_top = a[580:600, x0:].mean(axis=0)            # sky just above the cape
    hz = a[845:905, 814:832]                         # distant blue tree line + field (visible under the cape)
    for y in range(600, 840):                         # sky fading toward the horizon haze
        t = (y - 600) / 240
        st[y] = (sky_top * (1 - t) + hz[0].mean(axis=0) * t).astype(np.uint8)
    for y in range(840, 900):
        row = hz[y - 840]
        st[y] = np.tile(row, (w // row.shape[0] + 1, 1))[:w]
    fld = a[960:980, 790:832]                        # light field before the golden grass
    for y in range(900, 980):
        row = fld[(y - 900) % fld.shape[0]]
        st[y] = np.tile(row, (w // row.shape[0] + 1, 1))[:w]
    st[600:980] = cv2.GaussianBlur(st[600:980], (0, 0), 2)
    return st


def strip_witch(a, x0=796, y0=870, y1=1165):
    """the staff and the candles run off the right edge: refill those rows with the shelf rows
    above them, re-lit with the hole's own (inpainted) low-frequency colour so the candle glow stays."""
    st = strip_simple(a, x0, holes=[(y0, y1, x0, W)]).astype(np.float32)
    src = a[y0 - (y1 - y0):y0, x0:].astype(np.float32)
    lo = lambda m: cv2.GaussianBlur(m, (0, 0), 12)
    st[y0:y1] = np.clip(src * lo(st[y0:y1]) / np.maximum(lo(src), 1), 0, 255)
    return st.astype(np.uint8)


def build(name, strip, keep_first=None, src=None):
    a = load(src or name)
    seg = np.concatenate([strip[:, ::-1], strip], axis=1)
    need = round((1280 - PW) / S) + 8
    ext = np.concatenate([seg] * (need // seg.shape[1] + 2), axis=1)[:, :need]
    if keep_first is not None:
        # let the original continue a little past the edge (mirrored), with a ragged end
        k, rows = keep_first
        orig = a[:, W - k:][:, ::-1]
        rng = np.random.default_rng(3)
        n = np.convolve(rng.random(H), np.ones(9) / 9, 'same')
        for y in range(rows[0], rows[1]):
            taper = np.sin(np.pi * (y - rows[0]) / (rows[1] - rows[0]))
            L = int(k * taper * (0.45 + 0.55 * n[y]))
            ext[y, :L] = orig[y, :L]
    ext = Image.fromarray(ext).resize((round(need * S), 720), Image.LANCZOS)
    canvas = Image.new('RGB', (1280, 720))
    canvas.paste(ext, (PW - 1, 0))
    canvas.paste(Image.fromarray(a).resize((PW, 720), Image.LANCZOS), (0, 0))
    A = np.array(canvas).astype(np.float32)
    lv = [A] + [np.array(canvas.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) for r in (1.5, 3, 5, 7)]
    x = np.arange(1280)
    t = np.clip((x - (PW + 7)) / 260.0, 0, 1) * 4
    out = sum(lv[i] * np.clip(1 - np.abs(t - i), 0, 1)[None, :, None] for i in range(4))
    out += lv[4] * np.clip(t - 3, 0, 1)[None, :, None]
    out *= (1 - 0.3 * np.clip((x - (PW + 7)) / 400.0, 0, 1))[None, :, None]
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(f'bg-{name}.png')


if __name__ == '__main__':
    build('dirge', strip_witch(load('magision')), src='magision')
    build('sable', strip_simple(load('sable'), 795, holes=[(650, 700, 795, 832)]))
    build('cairn', strip_knight(load('cairn')), keep_first=(44, (600, 960)))
    im = Image.new('RGB', (1280, 2160))
    for i, n in enumerate(['cairn', 'sable', 'dirge']):
        im.paste(Image.open(f'bg-{n}.png'), (0, 720 * i))
    im.resize((960, 1620)).save('all.png')
