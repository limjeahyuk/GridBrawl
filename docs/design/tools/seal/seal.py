"""Seal overlays for locked card slots / sealed cards (native 48x53, shown x2 = 96x106).
stun = chains X + gold padlock · frozen = ice crust + ice padlock · bind = thorny vines X + vine padlock.
usage: python seal.py <outdir>  -> seal.png (144x53: stun | frozen | bind) · lock.png (42x16 padlocks) · _preview.png"""
import sys, os
import numpy as np
from PIL import Image

W, H = 48, 53
K = (10, 8, 16, 255)


def hx(h, a=255):
    h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def put(a, x, y, c):
    if 0 <= x < a.shape[1] and 0 <= y < a.shape[0]:
        a[y, x] = c


def outline(a, col=K):
    m = a[..., 3] > 0
    d = m.copy()
    d[1:] |= m[:-1]; d[:-1] |= m[1:]; d[:, 1:] |= m[:, :-1]; d[:, :-1] |= m[:, 1:]
    o = a.copy(); o[d & ~m] = col; return o


def over(dst, src, ox=0, oy=0):
    h, w = src.shape[:2]
    for y in range(h):
        for x in range(w):
            if src[y, x, 3] and 0 <= oy + y < dst.shape[0] and 0 <= ox + x < dst.shape[1]:
                dst[oy + y, ox + x] = src[y, x]
    return dst


LOCK = '''
....kkkkkk....
...kMMMMMMk...
..kMkkkkkkMk..
..kMk....kMk..
..kMk....kMk..
.kkkkkkkkkkkk.
.kHHHHHHHHHHk.
.kBLLLLLLLLBk.
.kBLLLkkLLLBk.
.kBLLLkkLLLBk.
.kBLLLLkLLLBk.
.kBLLLLkLLLBk.
.kBLLLLLLLLBk.
.kDDDDDDDDDDk.
.kkkkkkkkkkkk.
'''


def lock(body):
    H_, L, B, D = (hx(c) for c in body)
    pal = {'k': K, 'M': hx('#c6ccd4'), 'H': H_, 'L': L, 'B': B, 'D': D}
    rows = LOCK.strip('\n').split('\n')
    a = np.zeros((len(rows), 14, 4), np.uint8)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != '.':
                a[y, x] = pal[ch]
    return np.pad(a, ((0, 1), (0, 0), (0, 0)))   # 16 tall


def diag_path(n=60):
    """two diagonals corner to corner (with a 3px margin)"""
    pts = []
    for t in np.linspace(0, 1, n):
        pts.append((3 + t * (W - 7), 3 + t * (H - 7)))
    p2 = [(W - 1 - x, y) for (x, y) in pts]
    return pts, p2


def chains():
    a = np.zeros((H, W, 4), np.uint8)
    lite, mid, dark = hx('#dfe4ec'), hx('#9aa4b4'), hx('#5a6478')
    for path, (px, py) in zip(diag_path(400), ((0.7, -0.7), (0.7, 0.7))):
        L = len(path)
        for i, (x, y) in enumerate(path):
            seg = int(i / L * 14)          # 14 links along a diagonal
            ph = (i / L * 14) % 1
            if seg % 2 == 0:               # ring link: hollow 4-wide
                for d in (-2, 2):
                    put(a, int(round(x + d * px)), int(round(y + d * py)), lite if d < 0 else mid)
            else:                          # side link: solid bar
                for d in (-1, 0, 1):
                    put(a, int(round(x + d * px)), int(round(y + d * py)), mid if d else lite)
            if ph < 0.06:
                put(a, int(x), int(y), dark)
    return outline(a)


def vines():
    a = np.zeros((H, W, 4), np.uint8)
    g1, g2, g3, th, lf = hx('#9ad85a'), hx('#4f9a2a'), hx('#2e5e1a'), hx('#efe2c0'), hx('#6ac04a')
    rng = np.random.default_rng(4)
    for k, (path, (px, py)) in enumerate(zip(diag_path(300), ((0.7, -0.7), (0.7, 0.7)))):
        for i, (x, y) in enumerate(path):
            w = np.sin(i / 300 * np.pi * 7 + k) * 1.6          # wavy vine
            cx, cy = x + w * px, y + w * py
            put(a, int(round(cx)), int(round(cy)), g2)
            put(a, int(round(cx - px)), int(round(cy - py)), g3)
            put(a, int(round(cx + px)), int(round(cy + py)), g1)
        for t in np.linspace(0.08, 0.92, 9):                     # thorns
            x, y = path[int(t * 299)]
            s = 1 if rng.random() < 0.5 else -1
            for d in (2, 3):
                put(a, int(round(x + s * d * px)), int(round(y + s * d * py)), th)
        for t in (0.2, 0.55, 0.8):                               # leaves
            x, y = path[int(t * 299)]
            for dx, dy in [(2, 2), (3, 2), (2, 3), (3, 3), (4, 3)]:
                put(a, int(x + dx), int(y + dy - 4), lf)
    return outline(a)


def ice():
    a = np.zeros((H, W, 4), np.uint8)
    rng = np.random.default_rng(7)
    a[2:H - 2, 2:W - 2] = hx('#8ad8ff', 92)                     # translucent crust
    for y in range(2, H - 2):                                   # lighter top-left gradient
        for x in range(2, W - 2):
            if x + y < 30:
                a[y, x] = hx('#c8f0ff', 120)
    # jagged frost rim
    for x in range(2, W - 2):
        for yy in (2, H - 3):
            if rng.random() < 0.55:
                a[yy, x] = hx('#e8faff', 220)
    for y in range(2, H - 2):
        for xx in (2, W - 3):
            if rng.random() < 0.55:
                a[y, xx] = hx('#e8faff', 220)
    # cracks: a few random walks from centre
    c = hx('#ffffff', 230)
    for ang in (0.4, 1.9, 3.3, 4.6, 5.6):
        x, y = W / 2, H / 2
        for _ in range(26):
            ang += rng.normal(0, 0.35)
            x += np.cos(ang); y += np.sin(ang)
            put(a, int(x), int(y), c)
    # shards / sparkles
    for (x, y) in [(8, 9), (38, 14), (12, 40), (36, 44), (24, 6)]:
        for dx, dy in [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)]:
            put(a, x + dx, y + dy, hx('#ffffff', 240))
    return a


LOCKS = {
    'stun': ('#fff1a8', '#ffd84a', '#c9952f', '#8a5a10'),
    'frozen': ('#ffffff', '#bfefff', '#5ab8f0', '#2a6aa8'),
    'bind': ('#c8f08a', '#8ad04a', '#4f9a2a', '#2e5e1a'),
}


def build(out):
    os.makedirs(out, exist_ok=True)
    tiles, locks = [], []
    for kind, base in (('stun', chains()), ('frozen', ice()), ('bind', vines())):
        lk = lock(LOCKS[kind])
        locks.append(lk)
        t = base.copy()
        over(t, outline(np.pad(lk, ((1, 1), (1, 1), (0, 0)))), (W - 16) // 2, (H - 18) // 2)
        if kind == 'stun':      # two dizzy stars on the lock
            for (x, y) in [(13, 17), (34, 34)]:
                for dx, dy in [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)]:
                    put(t, x + dx, y + dy, hx('#ffd84a'))
                put(t, x, y, hx('#ffffff'))
        tiles.append(t)
    sheet = np.concatenate(tiles, 1)
    Image.fromarray(sheet).save(f'{out}/seal.png')
    Image.fromarray(np.concatenate(locks, 1)).save(f'{out}/lock.png')
    P = np.zeros((H + 8, sheet.shape[1] + 16, 4), np.uint8); P[:] = hx('#1e2a46')
    al = sheet[..., 3:4] / 255.0
    P[4:4 + H, 8:8 + sheet.shape[1], :3] = (sheet[..., :3] * al + P[4:4 + H, 8:8 + sheet.shape[1], :3] * (1 - al)).astype(np.uint8)
    Image.fromarray(P).resize((P.shape[1] * 5, P.shape[0] * 5), Image.NEAREST).save(f'{out}/_preview.png')


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'out')
