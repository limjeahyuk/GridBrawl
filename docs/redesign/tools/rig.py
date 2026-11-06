"""Generic side-view humanoid rig used by heroes and humanoid monsters."""
import math
import numpy as np
from pix import *


def P(base, **kw):
    d = dict(base)
    d.update(kw)
    return d


def lerp(a, b, t):
    if isinstance(a, tuple):
        return tuple(lerp(x, y, t) for x, y in zip(a, b))
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a + (b - a) * t
    return a if t < 0.5 else b


def tween(p0, p1, t):
    keys = set(p0) | set(p1)
    out = {}
    for k in keys:
        if k in p0 and k in p1:
            out[k] = lerp(p0[k], p1[k], t)
        else:
            out[k] = p0.get(k, p1.get(k))
    return out


def rel(p, dx, dy):
    return (p[0] + dx, p[1] + dy)


class Humanoid:
    """Costume object must provide:
        W,H, L (lengths dict), and draw hooks.
    L keys: torso, shdrop, ua, fa, th, sh
    """

    def __init__(self, W, H, L, outline_col=OUTLINE):
        self.W, self.H, self.L = W, H, L
        self.oc = outline_col

    def solve(self, pose):
        L = self.L
        hip = pose['hip']
        t = pose.get('t', 0)
        up = (math.sin(math.radians(t)), -math.cos(math.radians(t)))
        neck = add(hip, up, L['torso'])
        sho = add(hip, up, L['torso'] - L['shdrop'])
        # near shoulder slightly forward, far shoulder slightly back
        nsho = add(sho, (1, 0), L.get('shx', 0))
        fsho = add(sho, (-1, 0), L.get('shx', 0))
        J = dict(hip=hip, neck=neck, sho=sho, nsho=nsho, fsho=fsho, up=up, t=t)
        nhip = add(hip, (1, 0), L.get('hipx', 0)); fhip = add(hip, (-1, 0), L.get('hipx', 0))
        for side, hp in (('n', nhip), ('f', fhip)):
            ft = pose[side + 'f']
            ft = clamp_reach(hp, ft, L['th'] + L['sh'] - 0.01)
            kn = ik2(hp, ft, L['th'], L['sh'], bend=1 if pose.get(side + 'kb', 1) > 0 else -1)
            J[side + 'hip'] = hp; J[side + 'knee'] = kn; J[side + 'ank'] = ft
            sp = nsho if side == 'n' else fsho
            if side + 'h' in pose:
                hd = clamp_reach(sp, pose[side + 'h'], L['ua'] + L['fa'] - 0.01)
                el = ik2(sp, hd, L['ua'], L['fa'], bend=pose.get(side + 'eb', -1))
            else:
                a1 = pose.get(side + 'sa', 0); a2 = a1 + pose.get(side + 'ea', 0)
                el = add(sp, vdir(a1), L['ua']); hd = add(el, vdir(a2), L['fa'])
            J[side + 'el'] = el; J[side + 'hand'] = hd
        return J

    # subclasses implement draw(pose) -> RGBA
    def compose(self, groups, fx=None, fx_under=None):
        out = np.zeros((self.H, self.W, 4), np.uint8)
        if fx_under is not None:
            out = blend_over(out, fx_under)
        for g in groups:
            if g is None:
                continue
            arr = g.a if isinstance(g, Layer) else g
            if not (arr[..., 3] > 0).any():
                continue
            over(out, outline(arr, self.oc))
        if fx is not None:
            out = blend_over(out, fx)
        return out

    def L_(self):
        return Layer(self.W, self.H)


def boot(layer, ank, toe_deg, rmp, length=4, h=2):
    """foot: a short wedge from the ankle pointing toward toe_deg (90 = forward)."""
    tip = add(ank, vdir(toe_deg), length - 1)
    m = layer.seg_mask(ank, tip, h)
    # heel block
    m |= layer.seg_mask(rel(ank, -0.5, 0), rel(ank, 0.5, 0.0), h + 0)
    layer.mask_paint(m, rmp, True)


def leg(layer, J, side, thigh_rmp, shin_rmp, boot_rmp, wt=4, ws=3, toe=None, boot_len=4):
    hp, kn, an = J[side + 'hip'], J[side + 'knee'], J[side + 'ank']
    layer.seg(hp, kn, wt, thigh_rmp)
    layer.seg(kn, an, ws, shin_rmp)
    if toe is None:
        toe = 90
    boot(layer, an, toe, boot_rmp, boot_len)


def arm(layer, J, side, ua_rmp, fa_rmp, hand_rmp, wu=3, wf=3, hand_r=2):
    sp = J[side + 'sho'] if side + 'sho' in J else J['sho']
    layer.seg(sp, J[side + 'el'], wu, ua_rmp)
    layer.seg(J[side + 'el'], J[side + 'hand'], wf, fa_rmp)
    if hand_r:
        h = J[side + 'hand']
        layer.seg(h, h, hand_r + 1, hand_rmp)


# ---------------------------------------------------------------- effects

def arc_fx(W, H, c, r0, r1, a0, a1, cols, taper=True, alpha=255):
    """crescent slash. angles in our convention (0 down, 90 forward, 180 up),
    swept from a0 to a1. cols = [outer, mid, inner] colours."""
    fx = np.zeros((H, W, 4), np.uint8)
    yy, xx = np.mgrid[0:H, 0:W]
    dx = xx + 0.5 - c[0]; dy = yy + 0.5 - c[1]
    r = np.hypot(dx, dy)
    ang = np.degrees(np.arctan2(dx, dy))  # 0 = down, 90 = right, 180/-180 = up
    lo, hi = min(a0, a1), max(a0, a1)
    # unwrap to range around lo
    angu = (ang - lo) % 360 + lo
    inside = (angu >= lo) & (angu <= hi)
    # progress along sweep 0 (start) .. 1 (end/leading edge)
    prog = (angu - a0) / (a1 - a0) if a1 != a0 else np.zeros_like(angu)
    prog = np.clip(prog, 0, 1)
    thick = (r1 - r0) * (prog ** 0.7 if taper else 1)
    ro = r0 + thick
    band = inside & (r >= r0) & (r <= ro)
    if not band.any():
        return fx
    q = (r - r0) / np.maximum(ro - r0, 1e-3)
    o, mcol, i = cols
    fx[band & (q > 0.66)] = o
    fx[band & (q <= 0.66) & (q > 0.3)] = mcol
    fx[band & (q <= 0.3)] = i
    fx[..., 3] = np.where(band, alpha, 0)
    return fx


def spark(fx_layer, c, rad, col, col2=None):
    x, y = c
    for d in range(-rad, rad + 1):
        fx_layer.px(x + d, y, col if abs(d) < rad else (col2 or col))
        fx_layer.px(x, y + d, col if abs(d) < rad else (col2 or col))
    if rad >= 3:
        for d in (-1, 1):
            fx_layer.px(x + d, y + d, col2 or col); fx_layer.px(x + d, y - d, col2 or col)


def glow(W, H, c, r, col, strength=0.6):
    fx = np.zeros((H, W, 4), np.uint8)
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.hypot(xx + 0.5 - c[0], yy + 0.5 - c[1]) / r
    a = np.clip(1 - d, 0, 1)
    # quantize to 3 levels for pixel feel
    a = np.where(a > 0.66, 1.0, np.where(a > 0.33, 0.6, np.where(a > 0, 0.28, 0)))
    fx[..., 0], fx[..., 1], fx[..., 2] = col[0], col[1], col[2]
    fx[..., 3] = (a * 255 * strength).astype(np.uint8)
    return fx
