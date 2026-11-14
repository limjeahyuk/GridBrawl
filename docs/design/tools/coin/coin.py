"""카지노 동전 — 22×22 프레임 12장(앞면 → 옆 → 뒷면 → 옆 → 앞면). 0번 = 앞면(토끼 귀 — 딜러), 6번 = 뒷면(별 — 나).
usage: python coin.py <outdir>  -> coin.png (264x22) · _preview.png"""
import sys, os, math
import numpy as np
from PIL import Image

S = 22
C = (S - 1) / 2
R = 9.6


def hx(h, a=255):
    h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


K = hx('#1a1008'); D = hx('#7a4a10'); M = hx('#c98a20'); L = hx('#f4c84a'); W = hx('#fff4b0'); E = hx('#a06818')

EARS = ['..x...x..', '.xx...xx.', '.xx...xx.', '.xx...xx.', '..xxxxx..', '.xxxxxxx.', '.xx.x.xx.', '.xxxxxxx.', '..xxxxx..']
STAR = ['....x....', '....x....', '...xxx...', 'xxxxxxxxx', '.xxxxxxx.', '..xxxxx..', '..xx.xx..', '.xx...xx.', '.x.....x.']


def frame(sx, face):
    a = np.zeros((S, S, 4), np.uint8)
    rx = max(0.9, R * abs(sx))
    for y in range(S):
        for x in range(S):
            dx, dy = (x - C) / rx, (y - C) / R
            d = dx * dx + dy * dy
            if d <= 1:
                a[y, x] = M if d > 0.62 else L
                if d > 0.62 and (dx < 0 and dy < 0):
                    a[y, x] = W
                if d > 0.62 and (dx > 0 and dy > 0):
                    a[y, x] = D
    if abs(sx) < 0.2:                                   # edge: ribbed rim
        for y in range(S):
            if a[y, int(C)][3]:
                a[y, int(C)] = E if y % 2 else M
    elif abs(sx) > 0.3:
        art = EARS if face == 'h' else STAR
        for j, row in enumerate(art):
            for i, ch in enumerate(row):
                if ch == 'x':
                    x = int(math.floor(C + 0.5 + (i - 4) * abs(sx)))
                    y = int(C) - 4 + j
                    a[y, x] = D
    # outline
    m = a[..., 3] > 0
    d = m.copy(); d[1:] |= m[:-1]; d[:-1] |= m[1:]; d[:, 1:] |= m[:, :-1]; d[:, :-1] |= m[:, 1:]
    a[d & ~m] = K
    return a


SEQ = [(1, 'h'), (.7, 'h'), (.35, 'h'), (0, 'h'), (.35, 't'), (.7, 't'), (1, 't'), (.7, 't'), (.35, 't'), (0, 't'), (.35, 'h'), (.7, 'h')]

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'out'
    os.makedirs(out, exist_ok=True)
    sheet = np.concatenate([frame(s, f) for s, f in SEQ], 1)
    Image.fromarray(sheet).save(f'{out}/coin.png')
    P = np.zeros((S, sheet.shape[1], 4), np.uint8); P[:] = hx('#1a4a2a')
    m = sheet[..., 3:4] / 255
    P[..., :3] = (sheet[..., :3] * m + P[..., :3] * (1 - m)).astype(np.uint8)
    Image.fromarray(P).resize((P.shape[1] * 6, S * 6), Image.NEAREST).save(f'{out}/_preview.png')
