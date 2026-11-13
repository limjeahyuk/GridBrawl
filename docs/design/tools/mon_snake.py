"""동굴 뱀 — 항아리 이벤트 전투용. 72x40, 오른쪽을 본다.
idle(6) · run(6) · back(6) · attack1 물기(6, 2) · attack2 독침 뱉기(6, 3) · hurt(3) · death(7)."""
import math
import numpy as np
from pix import *
from rig import glow

W, H = 72, 40
GY = 38
BODY = ramp('#1e3a1a', '#4a8a2e', '#8ac84a')
BELLY = ramp('#8a8a3a', '#c8c86a', '#f0f0a8')
BAND = ramp('#2a1a3a', '#5a2a7a', '#8a4ab0')


def snake(head_x=50, head_y=16, sway=0.0, coil=1.0, mouth=0, tongue=0, tint=None, flat=0.0):
    """몸은 꼬리(왼쪽 바닥)에서 머리까지 이어진 원의 사슬."""
    l = Layer(W, H)
    pts = []
    n = 26
    for i in range(n + 1):
        t = i / n
        # 바닥을 따라 S자로 기다가 끝 1/3에서 머리를 든다
        x = 8 + t * (head_x - 8) * (0.9 + 0.1 * coil)
        base_y = GY - 3
        lift = max(0, (t - 0.55) / 0.45) ** 1.6 * (base_y - head_y) * (1 - flat)
        y = base_y - lift + math.sin(t * 9 + sway) * 2.2 * (1 - t) * coil
        x += math.sin(t * 6 + sway) * 1.5 * (1 - t)
        pts.append((x, y))
    for i, (x, y) in enumerate(pts[:-1]):
        r = 1.6 + 2.6 * math.sin(min(1, i / n * 1.4) * math.pi * 0.9) + (0.6 if i > n * 0.75 else 0)
        rmp = BAND if i % 5 == 2 else BODY
        l.ellipse(x, y, r, r, rmp)
    hx_, hy = pts[-1]
    # 머리 — 쐐기형, 입 벌림
    l.poly([(hx_ - 4, hy - 3), (hx_ + 3, hy - 4), (hx_ + 8, hy - 1 - mouth), (hx_ + 3, hy + 1 - mouth * .3), (hx_ - 4, hy + 2)], BODY)
    if mouth:
        l.poly([(hx_ - 2, hy + 2), (hx_ + 3, hy + 1), (hx_ + 8, hy + 1 + mouth), (hx_ - 2, hy + 4)], BODY)
    a = outline(l.a)
    # 배 비늘 · 눈 · 이빨
    ex, ey = int(hx_ + 2), int(hy - 2)
    a[ey, ex] = hx('#ffe14a'); a[ey, ex + 1] = hx('#141018')
    if mouth:
        a[int(hy + 0), int(hx_ + 6)] = hx('#ffffff'); a[int(hy + 1 + mouth), int(hx_ + 6)] = hx('#ffffff')
        for k in range(1, mouth + 1):
            a[int(hy + k * .6), int(hx_ + 3 + k)] = hx('#c94a5a')
    if tongue:
        for k in range(tongue):
            x = int(hx_ + 9 + k); y = int(hy - mouth * .2)
            if x < W: a[y, x] = hx('#e0485a')
        if hx_ + 9 + tongue < W - 1:
            a[int(hy - 1), int(hx_ + 9 + tongue)] = hx('#e0485a'); a[int(hy + 1), int(hx_ + 9 + tongue)] = hx('#e0485a')
    if tint is not None:
        m = a[..., 3] > 0
        a[m, 0] = np.minimum(255, a[m, 0] * 0.5 + tint[0] * 0.5).astype(np.uint8)
        a[m, 1] = (a[m, 1] * 0.5 + tint[1] * 0.5).astype(np.uint8)
        a[m, 2] = (a[m, 2] * 0.5 + tint[2] * 0.5).astype(np.uint8)
    return a, (hx_, hy)


def glob(x, y, r=2):
    l = Layer(W, H)
    l.ellipse(x, y, r, r, ramp('#2a5a1a', '#6ab83a', '#c8f08a'))
    out = outline(l.a)
    for k in range(1, 4):
        if x - k * 3 >= 0:
            out[int(y), int(x - k * 3)] = (182, 234, 106, 160 - k * 40)
    return out


def clips():
    idle = [snake(sway=i / 6 * 2 * math.pi, head_y=15 + round(math.sin(i / 6 * 2 * math.pi)), tongue=3 if i in (2, 3) else 0)[0] for i in range(6)]
    run = [snake(head_x=52, head_y=24, sway=i / 6 * 2 * math.pi * 1.0, coil=1.6)[0] for i in range(6)]
    back = [snake(head_x=46, head_y=18, sway=-i / 6 * 2 * math.pi, coil=1.4)[0] for i in range(6)]
    a1 = []
    for hxx, hy, m in [(46, 13, 1), (42, 11, 2), (62, 18, 3), (63, 18, 1), (56, 16, 0), (50, 16, 0)]:
        f, _ = snake(head_x=hxx, head_y=hy, mouth=m, coil=0.8)
        a1.append(f)
    a2 = []
    for k, (hy, m, g) in enumerate([(14, 0, None), (12, 2, None), (13, 3, (62, 13)), (14, 2, (69, 13)), (15, 1, None), (15, 0, None)]):
        f, _ = snake(head_x=50, head_y=hy, mouth=m)
        if g:
            f = blend_over(f, glob(*g))
        a2.append(f)
    hurt = [snake(head_x=46, head_y=18, tint=(255, 255, 255))[0], snake(head_x=47, head_y=17, mouth=1)[0], snake()[0]]
    death = []
    for k, fl in enumerate([0.2, 0.45, 0.7, 0.9, 1.0, 1.0, 1.0]):
        f, _ = snake(head_x=50 - k, head_y=16 + k * 2, flat=fl, mouth=1 if k < 3 else 0, coil=1 - fl * 0.6)
        if k >= 5:
            f = f.copy(); f[..., 3] = (f[..., 3] * (0.6 if k == 5 else 0.3)).astype(np.uint8)
        death.append(f)
    return {'idle': (idle, 120, True, None), 'run': (run, 80, True, None), 'back': (back, 90, True, None),
            'attack1': (a1, 65, False, 2), 'attack2': (a2, 75, False, 3),
            'hurt': (hurt, 90, False, None), 'death': (death, 100, False, None)}


if __name__ == '__main__':
    c = clips()
    preview([v[0] for v in c.values()], '/tmp/claude-0/-home-claude/3af28667-8ee6-50ac-a1c0-241532dd7127/scratchpad/prev_snake.png', scale=4, bg=(46, 64, 60, 255))
