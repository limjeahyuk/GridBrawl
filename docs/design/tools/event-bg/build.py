"""Event / NPC scene background (inn-style layout) for any 832x1216 illustration.
No invented scenery: the backdrop is the SAME picture, enlarged to fill the screen,
strongly blurred and dimmed (pure colour and light, no shapes to look wrong).
The sharp picture sits at full screen height on the left and its right edge melts
softly into that backdrop.

usage: python build.py <src.png> <out.png>
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src_path, out_path = sys.argv[1], sys.argv[2]
src = Image.open(src_path).convert('RGB')
W, H = src.size
PW = round(W * 720 / H)                                  # 493
# backdrop: right half of the picture stretched over the whole screen, then blurred hard
back = src.crop((W // 2, 0, W, H)).resize((1280, 720), Image.BICUBIC).filter(ImageFilter.GaussianBlur(34))
B = np.array(back).astype(np.float32)
x = np.arange(1280)
B *= (0.78 - 0.22 * np.clip((x - PW) / 500.0, 0, 1))[None, :, None]   # dim, a little more to the right
pic = np.zeros((720, 1280, 3), np.float32)
pic[:, :PW] = np.array(src.resize((PW, 720), Image.LANCZOS)).astype(np.float32)
FE = 130                                                  # width of the soft edge
alpha = np.clip((PW - x) / FE, 0, 1)
alpha = (alpha * alpha * (3 - 2 * alpha))[None, :, None]  # smoothstep
out = pic * alpha + B * (1 - alpha)
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(out_path)
