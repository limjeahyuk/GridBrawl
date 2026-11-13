"""Event background from a LANDSCAPE illustration (1216x832) for the 1280x720 screen.
  full : python build_wide.py full  <src.png> <out.png> [focusY 0..1]
         the picture simply fills the screen (cover), nothing invented
  shift: python build_wide.py shift <src.png> <out.png> <offsetX>
         the picture is fitted to screen height and slid left by offsetX px so the
         character stands on the left; where the picture ends, it melts into a blurred,
         dimmed copy of itself (plain colour and light) under the dialogue + choices
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

mode, src_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
src = Image.open(src_path).convert('RGB')
W, H = src.size
if mode == 'full':
    fy = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
    h = round(H * 1280 / W)
    im = src.resize((1280, h), Image.LANCZOS)
    top = round((h - 720) * fy)
    im.crop((0, top, 1280, top + 720)).save(out_path)
else:
    off = int(sys.argv[4])
    w = round(W * 720 / H)
    pic = src.resize((w, 720), Image.LANCZOS)
    end = w - off                                    # screen x where the picture ends
    back = src.crop((W // 2, 0, W, H)).resize((1280, 720), Image.BICUBIC).filter(ImageFilter.GaussianBlur(34))
    B = np.array(back).astype(np.float32)
    x = np.arange(1280)
    B *= (0.8 - 0.2 * np.clip((x - end + 200) / 500.0, 0, 1))[None, :, None]
    P = np.zeros((720, 1280, 3), np.float32)
    P[:, :min(1280, end)] = np.array(pic.crop((off, 0, off + min(1280, end), 720))).astype(np.float32)
    FE = 150
    a = np.clip((end - x) / FE, 0, 1); a = (a * a * (3 - 2 * a))[None, :, None]
    Image.fromarray(np.clip(P * a + B * (1 - a), 0, 255).astype(np.uint8)).save(out_path)
