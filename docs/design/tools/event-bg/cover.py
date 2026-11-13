"""가로 일러스트(1344×768 등)를 1280×720 화면 배경으로 맞춘다.
화면비가 거의 같아서 지어낼 배경이 없다 — 꽉 채우고(cover) 잘릴 만큼만 자른다.
  zoom: 1보다 크면 확대(그만큼 자리를 옮길 여유가 생긴다)
  px/py: 자르는 위치 0=왼쪽/위 · 0.5=가운데 · 1=오른쪽/아래
어둡게 하는 것은 화면(.dc.html)에서 한다 — 그림은 깨끗하게 둔다.
"""
from PIL import Image

W, H = 1280, 720


def cover(path, out, zoom=1.0, px=0.5, py=0.5):
    im = Image.open(path).convert('RGB')
    s = max(W / im.width, H / im.height) * zoom
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x = round((im.width - W) * px)
    y = round((im.height - H) * py)
    im.crop((x, y, x + W, y + H)).save(out, optimize=True)


if __name__ == '__main__':
    JOBS = [
        ('snake', 1.0, 0.5, 0.5), ('plague', 1.0, 0.45, 0.5), ('Gatcha', 1.0, 0.5, 0.5),
        ('mole', 1.0, 0.5, 0.5), ('doctor_soosool', 1.0, 0.4, 0.5), ('casino', 1.0, 0.4, 0.5),
        ('macgora', 1.18, 0.28, 0.42), ('dragon_magision', 1.0, 0.4, 0.5),
        ('goldbox', 1.0, 0.5, 0.5), ('goldbox_in', 1.0, 0.5, 0.5), ('mimic', 1.0, 0.5, 0.5),
        ('goblin_1_full', 1.0, 0.4, 0.5), ('goblin_2_full', 1.0, 0.4, 0.5), ('goblin_3_full', 1.0, 0.4, 0.5),
    ]
    for n, z, px, py in JOBS:
        cover(f'{n}.png', f'bg-{n}.png', z, px, py)
    print('ok', len(JOBS))
