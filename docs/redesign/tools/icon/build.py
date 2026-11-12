"""앱 아이콘 마스터(1024×1024) 굽기 — **? 칸 거래상 얼굴**.

    python3 docs/redesign/tools/icon/build.py        # master-1024.png 를 다시 굽는다

왜 파이썬인가: 일러스트에서 인물만 오려 내는 데 `rembg`(isnet-anime)를 쓴다.
구운 마스터는 **이 폴더에 같이 커밋**하므로, 아이콘을 다시 뽑을 때는
`npm run icon`(의존성 0)만 돌리면 된다 — 파이썬은 구도를 바꿀 때만 필요하다.
필요한 것: `pip install pillow rembg numpy`

구도 메모
- 원본은 가로 그림(1216×832)이라 그대로 쓰면 얼굴이 작다 → 후드째 정사각으로 자른다.
- 후드가 짙은 보라라 어두운 배경에 묻힌다. 그래서 **머리 뒤 빛무리**와 **실루엣
  바깥 테두리 빛**(등불 색)으로 띄운다 — 아이콘은 48px까지 줄어들고, 그 크기에서
  형태를 읽히게 하는 건 이 대비가 전부다.
- 배경은 위가 보랏빛 어둠, 아래가 등불의 따뜻한 빛 — 거래상이 든 등불과 이어진다.
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
SRC = os.path.join(ROOT, 'docs/redesign/2dImg/거래상.png')
OUT = os.path.join(os.path.dirname(__file__), 'master-1024.png')

BOX = (230, 20, 550, 340)   # 원본에서 잘라 낼 정사각 — 후드 꼭대기부터 망토 여밈까지
N = 1024                    # 마스터 한 변
HALO, RIM, BOOST, VIG = 0.9, 1.1, 1.16, 0.30


def lantern_bg(n):
    """위는 보랏빛 어둠, 아래는 등불의 따뜻한 빛."""
    yy, xx = np.mgrid[0:n, 0:n]
    top, warm = np.array([14, 11, 24], np.float32), np.array([92, 52, 18], np.float32)
    g = np.clip(1 - np.hypot(xx - (n - 1) / 2, (yy - n * 0.98) / 0.8) / (n * 0.95), 0, 1) ** 1.3
    out = top * (1 - g[..., None]) + warm * g[..., None]
    r = np.hypot(xx - (n - 1) / 2, yy - n * 0.42) / (n * 0.55)
    return out + np.clip(1 - r, 0, 1)[..., None] ** 2 * 26


def main():
    from rembg import remove, new_session
    src = Image.open(SRC).convert('RGB')
    mask = remove(src, session=new_session('isnet-anime'), only_mask=True)

    w = BOX[2] - BOX[0]
    sub = np.array(src.crop(BOX)).astype(np.float32)
    mc = mask.crop(BOX)
    al = (np.array(mc).astype(np.float32) / 255.0)[..., None]

    bg = np.array(Image.fromarray(np.clip(lantern_bg(64), 0, 255).astype(np.uint8))
                  .resize((w, w), Image.BICUBIC)).astype(np.float32)
    yy, xx = np.mgrid[0:w, 0:w]
    halo = np.clip(1 - np.hypot(xx - w * 0.5, yy - w * 0.42) / (w * 0.46), 0, 1) ** 1.8
    bg += (halo * HALO)[..., None] * np.array([150, 112, 56], np.float32)
    grown = mc.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(w / 70))
    ring = np.clip(np.array(grown).astype(np.float32) / 255.0 - al[..., 0], 0, 1)
    bg += (ring * RIM)[..., None] * np.array([196, 142, 70], np.float32)

    sub = np.clip((sub - 16) * BOOST + 16, 0, 255)
    im = Image.fromarray(np.clip(sub * al + bg * (1 - al), 0, 255).astype(np.uint8))
    im = im.resize((N, N), Image.LANCZOS)

    a = np.array(im).astype(np.float32)
    yy, xx = np.mgrid[0:N, 0:N]
    d = np.hypot(xx - (N - 1) / 2, yy - (N - 1) / 2) / (N * 0.70)
    a *= (1 - np.clip(d, 0, 1) ** 2 * VIG)[..., None]
    # png.mjs 디코더가 8bit RGBA · 팔레트만 읽는다 → RGBA로 저장한다
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA').save(OUT, optimize=True)
    print('구웠다: ' + OUT)


if __name__ == '__main__':
    main()
