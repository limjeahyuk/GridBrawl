"""GridBrawl pixel-art engine.

Rig-based side-view characters rendered at 1x:
  * limbs  = shaded thick segments (2-bone IK for legs/arms)
  * parts  = hand-drawn ASCII sprites (torso, heads, weapons) rotated with RotSprite (EPX x3)
  * groups = composited back-to-front, each with its own 1px dark outline
"""
import math, json, os
import numpy as np
from PIL import Image, ImageDraw

OUTLINE = (20, 14, 28, 255)


def hx(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def ramp(*hs):
    return [hx(h) for h in hs]


def mix(c1, c2, t):
    return tuple(int(round(c1[i] * (1 - t) + c2[i] * t)) for i in range(3)) + (255,)


# ---------------------------------------------------------------- sprites

def sprite(art, pal):
    """ASCII art -> RGBA array. '.' or ' ' = transparent."""
    rows = [r for r in art.strip('\n').split('\n')]
    rows = [r.rstrip() for r in rows]
    # remove common indentation
    ind = min(len(r) - len(r.lstrip(' ')) for r in rows if r.strip())
    rows = [r[ind:] for r in rows]
    h = len(rows); w = max(len(r) for r in rows)
    a = np.zeros((h, w, 4), np.uint8)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in '. ':
                continue
            a[y, x] = hx(pal[ch]) if isinstance(pal[ch], str) else pal[ch]
    return a


def flipx(a):
    return a[:, ::-1].copy()


def _pack(a):
    return (a[..., 0].astype(np.uint32) << 24) | (a[..., 1].astype(np.uint32) << 16) | \
           (a[..., 2].astype(np.uint32) << 8) | a[..., 3].astype(np.uint32)


def scale2x(a):
    p = _pack(a)
    pad = np.pad(p, 1)
    P = pad[1:-1, 1:-1]
    A = pad[:-2, 1:-1]; D = pad[2:, 1:-1]; C = pad[1:-1, :-2]; B = pad[1:-1, 2:]
    e0 = np.where((C == A) & (C != D) & (A != B), A, P)
    e1 = np.where((A == B) & (A != C) & (B != D), B, P)
    e2 = np.where((D == C) & (D != B) & (C != A), C, P)
    e3 = np.where((B == D) & (B != A) & (D != C), D, P)
    h, w = p.shape
    out = np.zeros((h * 2, w * 2), np.uint32)
    out[0::2, 0::2] = e0; out[0::2, 1::2] = e1; out[1::2, 0::2] = e2; out[1::2, 1::2] = e3
    res = np.zeros((h * 2, w * 2, 4), np.uint8)
    res[..., 0] = (out >> 24) & 255; res[..., 1] = (out >> 16) & 255
    res[..., 2] = (out >> 8) & 255; res[..., 3] = out & 255
    return res


def rotsprite(a, deg, pivot):
    """Rotate sprite `a` by deg (clockwise on screen) about pivot (px,py).
    Returns (img, (px,py)) where pivot is the new pivot pixel location."""
    if abs(deg) < 0.5:
        return a, pivot
    big = scale2x(scale2x(scale2x(a)))
    S = 8
    h, w = a.shape[:2]
    px, py = pivot
    r = math.radians(deg)
    c, s = math.cos(r), math.sin(r)
    # bounding box of rotated corners (relative to pivot) at 1x
    pts = [(-px, -py), (w - px, -py), (-px, h - py), (w - px, h - py)]
    xs = [x * c - y * s for x, y in pts]; ys = [x * s + y * c for x, y in pts]
    x0, x1 = math.floor(min(xs)) - 1, math.ceil(max(xs)) + 1
    y0, y1 = math.floor(min(ys)) - 1, math.ceil(max(ys)) + 1
    W, H = x1 - x0, y1 - y0
    u = np.arange(W) + x0 + 0.5
    v = np.arange(H) + y0 + 0.5
    U, V = np.meshgrid(u, v)
    # inverse rotate
    sx = U * c + V * s + px
    sy = -U * s + V * c + py
    bx = np.floor(sx * S).astype(int); by = np.floor(sy * S).astype(int)
    ok = (bx >= 0) & (by >= 0) & (bx < w * S) & (by < h * S)
    out = np.zeros((H, W, 4), np.uint8)
    out[ok] = big[by[ok], bx[ok]]
    return out, (-x0, -y0)


# ---------------------------------------------------------------- layers

class Layer:
    def __init__(self, W, H):
        self.W, self.H = W, H
        self.a = np.zeros((H, W, 4), np.uint8)

    def paste(self, spr, x, y):
        """paste spr with its top-left at (x,y) (ints)."""
        x = int(round(x)); y = int(round(y))
        h, w = spr.shape[:2]
        X0, Y0 = max(0, x), max(0, y)
        X1, Y1 = min(self.W, x + w), min(self.H, y + h)
        if X0 >= X1 or Y0 >= Y1:
            return
        sub = spr[Y0 - y:Y1 - y, X0 - x:X1 - x]
        m = sub[..., 3] > 0
        self.a[Y0:Y1, X0:X1][m] = sub[m]

    def part(self, spr, pivot, at, deg=0, flip=False):
        """place sprite so that its pivot lands on `at`, rotated by deg."""
        if flip:
            spr = flipx(spr); pivot = (spr.shape[1] - 1 - pivot[0], pivot[1])
        img, pv = rotsprite(spr, deg, (pivot[0] + 0.5, pivot[1] + 0.5))
        if abs(deg) < 0.5:
            pv = pivot
            self.paste(img, at[0] - pv[0], at[1] - pv[1])
        else:
            self.paste(img, at[0] - pv[0] + 0.5, at[1] - pv[1] + 0.5)

    def mask_paint(self, mask, rmp, shade=True, light='up'):
        """paint boolean mask with a ramp (dark, base, light[, spec])."""
        if not mask.any():
            return
        dark, base, lite = rmp[0], rmp[1], rmp[2]
        col = np.zeros((self.H, self.W, 4), np.uint8)
        col[mask] = base
        if shade:
            up = np.zeros_like(mask); up[1:] = mask[:-1]
            dn = np.zeros_like(mask); dn[:-1] = mask[1:]
            lf = np.zeros_like(mask); lf[:, 1:] = mask[:, :-1]
            rt = np.zeros_like(mask); rt[:, :-1] = mask[:, 1:]
            edge_dark = mask & (~dn | ~rt)
            edge_lite = mask & (~up)
            if light == 'left':
                edge_lite = mask & (~lf | ~up)
            col[edge_dark] = dark
            col[edge_lite] = lite
        self.a[mask] = col[mask]

    def seg_mask(self, p0, p1, w):
        m = np.zeros((self.H, self.W), bool)
        x0, y0 = p0; x1, y1 = p1
        n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
        r = w / 2.0
        for i in range(n + 1):
            t = i / n
            cx = x0 + (x1 - x0) * t; cy = y0 + (y1 - y0) * t
            xa, xb = int(math.floor(cx - r + 0.5)), int(math.floor(cx + r + 0.5))
            ya, yb = int(math.floor(cy - r + 0.5)), int(math.floor(cy + r + 0.5))
            for yy in range(ya, yb):
                for xx in range(xa, xb):
                    if 0 <= xx < self.W and 0 <= yy < self.H:
                        # round the corners for w>=4
                        if w >= 4 and (yy in (ya, yb - 1)) and (xx in (xa, xb - 1)):
                            continue
                        m[yy, xx] = True
        return m

    def seg(self, p0, p1, w, rmp, shade=True):
        self.mask_paint(self.seg_mask(p0, p1, w), rmp, shade)

    def poly(self, pts, rmp, shade=True, light='up'):
        im = Image.new('L', (self.W, self.H), 0)
        ImageDraw.Draw(im).polygon([(float(x), float(y)) for x, y in pts], fill=255)
        m = np.array(im) > 0
        self.mask_paint(m, rmp, shade, light)
        return m

    def ellipse(self, cx, cy, rx, ry, rmp, shade=True):
        im = Image.new('L', (self.W, self.H), 0)
        ImageDraw.Draw(im).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
        m = np.array(im) > 0
        self.mask_paint(m, rmp, shade)
        return m

    def px(self, x, y, c):
        x = int(round(x)); y = int(round(y))
        if 0 <= x < self.W and 0 <= y < self.H:
            self.a[y, x] = c

    def line(self, p0, p1, c):
        x0, y0 = p0; x1, y1 = p1
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / n
            self.px(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c)


def outline(a, col=OUTLINE, diag=False):
    m = a[..., 3] > 0
    d = m.copy()
    d[1:] |= m[:-1]; d[:-1] |= m[1:]; d[:, 1:] |= m[:, :-1]; d[:, :-1] |= m[:, 1:]
    if diag:
        d[1:, 1:] |= m[:-1, :-1]; d[:-1, :-1] |= m[1:, 1:]; d[1:, :-1] |= m[:-1, 1:]; d[:-1, 1:] |= m[1:, :-1]
    out = a.copy()
    o = d & ~m
    out[o] = col
    return out


def over(dst, src):
    m = src[..., 3] > 0
    dst[m] = src[m]
    return dst


def blend_over(dst, src):
    """true alpha blend (for glows)."""
    sa = src[..., 3:4].astype(float) / 255
    da = dst[..., 3:4].astype(float) / 255
    oa = sa + da * (1 - sa)
    oc = (src[..., :3] * sa + dst[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
    res = np.concatenate([oc, oa * 255], -1)
    return np.clip(res + 0.5, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------- kinematics

def vdir(deg):
    r = math.radians(deg)
    return (math.sin(r), math.cos(r))  # 0 = down, +90 = right(forward), 180 = up


def add(p, v, k=1.0):
    return (p[0] + v[0] * k, p[1] + v[1] * k)


def ik2(a, t, l1, l2, bend=1):
    """two-bone IK. returns middle joint. bend=+1 bends toward +x side relative to a->t."""
    dx, dy = t[0] - a[0], t[1] - a[1]
    d = math.hypot(dx, dy)
    d = max(min(d, l1 + l2 - 1e-3), abs(l1 - l2) + 1e-3)
    ca = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
    ang = math.acos(max(-1, min(1, ca)))
    base = math.atan2(dy, dx)
    # bend: +1 → rotate so the joint goes to the 'left' of direction vector in screen coords
    th = base - bend * ang
    return (a[0] + math.cos(th) * l1, a[1] + math.sin(th) * l1)


def clamp_reach(a, t, L):
    dx, dy = t[0] - a[0], t[1] - a[1]
    d = math.hypot(dx, dy)
    if d <= L:
        return t
    return (a[0] + dx / d * L, a[1] + dy / d * L)


# ---------------------------------------------------------------- output

class Clip:
    def __init__(self, name, frames, frameMs, loop, impact=None):
        self.name, self.frames, self.frameMs, self.loop, self.impact = name, frames, frameMs, loop, impact


def save_sheet(outdir, sid, W, H, clips, scale, extra=None):
    """clips: dict name -> (list of RGBA arrays, frameMs, loop, impact)"""
    d = os.path.join(outdir, 'sprites', sid)
    os.makedirs(d, exist_ok=True)
    meta = {'id': sid, 'frameW': W, 'frameH': H, 'scale': scale, 'facesRight': True, 'clips': {}}
    for name, (frames, ms, loop, impact) in clips.items():
        strip = np.concatenate(frames, axis=1)
        Image.fromarray(strip, 'RGBA').save(os.path.join(d, f'{name}.png'), optimize=True)
        c = {'frames': len(frames), 'frameMs': ms, 'loop': loop}
        if impact is not None:
            c['impactFrame'] = impact
        meta['clips'][name] = c
    idle = clips['idle'][0][0]
    m = idle[..., 3] > 0
    ys, xs = np.nonzero(m)
    meta['footY'] = int(ys.max()) + 1
    # body centre: median x of opaque pixels in the lower-middle body band
    meta['anchorX'] = int(round(np.median(xs)))
    if extra:
        meta.update(extra)
    with open(os.path.join(d, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    return meta


def preview(frames_rows, path, scale=4, bg=(46, 52, 64, 255), labels=None):
    """grid preview: list of rows (list of frames)."""
    H = frames_rows[0][0].shape[0]; W = frames_rows[0][0].shape[1]
    cols = max(len(r) for r in frames_rows)
    img = np.zeros((H * len(frames_rows), W * cols, 4), np.uint8)
    img[:] = bg
    for i, row in enumerate(frames_rows):
        for j, f in enumerate(row):
            blk = img[i * H:(i + 1) * H, j * W:(j + 1) * W]
            img[i * H:(i + 1) * H, j * W:(j + 1) * W] = blend_over(blk, f)
            img[i * H:(i + 1) * H, j * W] = (70, 78, 92, 255)
    Image.fromarray(img).resize((img.shape[1] * scale, img.shape[0] * scale), Image.NEAREST).save(path)
