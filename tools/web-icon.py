#!/usr/bin/env python3
"""只生成网页图标（favicon + apple-touch-icon）。

用法：
  python3 tools/web-icon.py                      # 默认：放大 1.05、圆形
  python3 tools/web-icon.py --zoom 1.08          # 再放大一点
  python3 tools/web-icon.py --zoom 1.0 --no-circle

为什么单独一个脚本：安卓（res/mipmap-*）和桌面（desktop-tauri/icons）的图标
由 apk/tools/icons.py 从 apk/icon/icon-512.png 切，形状和留白要照顾启动器蒙版；
网页图标是"整张图直接显示"，可以自己裁圆、自己放大，两边不必互相迁就。

原图用 apk/icon/source-ai-1024.png（1024×1024，未加留白的那张）。
产出：
  web/favicon.png            32×32（浏览器标签）
  web/favicon.ico            16/24/32/48/64/128/256（Windows 快捷方式、老浏览器）
  web/apple-touch-icon.png   180×180（iOS 加到主屏；透明角会露黑底，所以用底色填满）
"""
import sys
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'apk', 'icon', 'source-ai-1024.png')
WEB = os.path.join(ROOT, 'web')
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def arg(args, name, default=None):
    if name not in args:
        return default
    i = args.index(name)
    return args[i + 1] if i + 1 < len(args) else default


def bg_color(im):
    """底色：取出现最多的不透明颜色。"""
    small = im.convert('RGB').resize((64, 64), Image.LANCZOS)
    counts = {}
    for px in small.getdata():
        counts[px] = counts.get(px, 0) + 1
    return max(counts.items(), key=lambda kv: kv[1])[0]


def zoomed(im, zoom):
    if abs(zoom - 1.0) < 1e-6:
        return im
    w, h = im.size
    big = im.resize((int(round(w * zoom)), int(round(h * zoom))), Image.LANCZOS)
    left = (big.width - w) // 2
    top = (big.height - h) // 2
    return big.crop((left, top, left + w, top + h))


def circle(im):
    """裁圆，四角透明；4 倍超采样掩膜，边缘不出锯齿。"""
    w, h = im.size
    ss = 4
    mask = Image.new('L', (w * ss, h * ss), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, w * ss - 1, h * ss - 1), fill=255)
    mask = mask.resize((w, h), Image.LANCZOS)
    out = im.convert('RGBA')
    out.putalpha(mask)
    return out


def main():
    args = sys.argv[1:]
    zoom = float(arg(args, '--zoom', 1.05))
    want_circle = '--no-circle' not in args

    art = Image.open(SRC).convert('RGB')
    if art.width != art.height:
        print('原图必须是正方形，实际 %dx%d' % art.size)
        return 1
    bg = bg_color(art)

    big = zoomed(art, zoom)
    flat = circle(big) if want_circle else big.convert('RGBA')

    # 256 足够喂 ico 的每一档，再大只是白占体积
    master = flat.resize((256, 256), Image.LANCZOS)
    master.resize((32, 32), Image.LANCZOS).save(os.path.join(WEB, 'favicon.png'))
    master.save(os.path.join(WEB, 'favicon.ico'), sizes=ICO_SIZES)

    # iOS 会把图标裁成圆角方，透明角会露黑底 → 用底色铺满
    art.resize((180, 180), Image.LANCZOS).save(os.path.join(WEB, 'apple-touch-icon.png'))

    print('· web/favicon.png（32）· favicon.ico（%d 档）· apple-touch-icon.png（180）'
          % len(ICO_SIZES))
    print('· 放大 %.2fx%s，底色 #%02X%02X%02X' % (zoom, '，圆形' if want_circle else '', *bg))
    return 0


if __name__ == '__main__':
    sys.exit(main())
