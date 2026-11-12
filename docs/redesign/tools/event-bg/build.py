"""Event / NPC scene background (inn recipe, draft C) for any 832x1216 illustration.
The picture is kept untouched at full screen height on the left; the scene is continued
to the right by ping-pong mirroring a strip of its right edge, then blurred progressively
(depth of field) and dimmed so the dialogue box and choices on the right read well.

usage: python build.py <src.png> <stripStartX> <out.png>
  stripStartX: where the clean right-edge strip starts (768~808 works for most pictures;
               pick a spot where no part of the character is inside the strip)
goblin shop:  goblin_2.png -> bg-poor.png, goblin_1.png -> bg-mid.png, goblin_3.png -> bg-rich.png
              (the shipped three came from the design canvas as-is, 2026-11-12)
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src_path, x0, out_path = sys.argv[1], int(sys.argv[2]), sys.argv[3]
a = np.array(Image.open(src_path).convert('RGB'))
H, W = a.shape[:2]
S = 720 / H
PW = round(W * S)
strip = a[:, x0:]
seg = np.concatenate([strip[:, ::-1], strip], axis=1)
need = round((1280 - PW) / S) + 8
ext = np.concatenate([seg] * (need // seg.shape[1] + 2), axis=1)[:, :need]
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
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(out_path)
