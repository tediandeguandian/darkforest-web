#!/usr/bin/env python3
"""生成 macOS 风格（Big Sur 图标网格）的应用图标。

为什么单独一份：
  apk/icon/source-ai-1024.png 是「铺满整张画布」的母版——Android 的自适应图标
  和 Windows 的 ico 都需要这种满幅构图。但 macOS 的图标网格是
  「1024 画布 + 824 圆角方块居中」，四周留 100px 透明边距（圆角半径 185）。
  直接把满幅图当 icns 用，Dock 里就会比系统设置这类图标整整大一圈。

用法：
  python3 tools/mac-icon.py                # 生成 macos-1024.png + desktop-tauri 全套
  python3 tools/mac-icon.py --check        # 只检查现有产物，不写文件

产出：
  apk/icon/macos-1024.png                         1024 RGBA，Big Sur 网格
  desktop-tauri/src-tauri/icons/{16,32,64,128,256,512,1024}.png
  desktop-tauri/src-tauri/icons/128x128.png        128
  desktop-tauri/src-tauri/icons/128x128@2x.png     256
  desktop-tauri/src-tauri/icons/icon.png           512
  desktop-tauri/src-tauri/icons/icon.icns          多尺寸（CI 会用 iconutil 重生成，这里做本地兜底）
"""
import os
import struct
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'apk', 'icon', 'source-ai-1024.png')
OUT_1024 = os.path.join(ROOT, 'apk', 'icon', 'macos-1024.png')
ICON_DIR = os.path.join(ROOT, 'desktop-tauri', 'src-tauri', 'icons')

CANVAS = 1024      # 画布
BODY = 824         # 圆角方块的边长（Apple：1024 网格里留 100px 边距）
RADIUS = 185       # 圆角半径（824 的 22.4%）

# icns 里用 PNG 压缩的块类型 → 像素尺寸
ICNS_PNG_TYPES = [
    ('ic07', 128), ('ic08', 256), ('ic09', 512), ('ic10', 1024),
    ('ic11', 32), ('ic12', 64), ('ic13', 256), ('ic14', 512),
]


def rounded_mask(size, radius):
    """4 倍超采样画圆角矩形，缩放回来边缘不出台阶。"""
    ss = 4
    big = Image.new('L', (size * ss, size * ss), 0)
    ImageDraw.Draw(big).rounded_rectangle(
        (0, 0, size * ss - 1, size * ss - 1), radius=radius * ss, fill=255)
    return big.resize((size, size), Image.LANCZOS)


def build_master():
    """把满幅母版做成 Big Sur 网格：824 圆角方块 + 投影，居中放在 1024 透明画布上。"""
    art = Image.open(SRC).convert('RGB')
    if art.width != art.height:
        raise SystemExit('母版必须是正方形，实际 %dx%d' % art.size)

    body = art.resize((BODY, BODY), Image.LANCZOS).convert('RGBA')
    body.putalpha(rounded_mask(BODY, RADIUS))

    # 内侧一圈极淡的高光：深色图标和深色 Dock 不会糊在一起
    rim = Image.new('RGBA', (BODY, BODY), (0, 0, 0, 0))
    ImageDraw.Draw(rim).rounded_rectangle(
        (1, 1, BODY - 2, BODY - 2), radius=RADIUS - 1, outline=(255, 255, 255, 26), width=2)
    rim.putalpha(ImageChops.multiply(rim.getchannel('A'), rounded_mask(BODY, RADIUS)))
    body = Image.alpha_composite(body, rim)

    canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    pad = (CANVAS - BODY) // 2

    # 投影：Apple 模板是 offsetY 10 / blur 24 / 黑 30%，这里略收一点
    shadow = Image.new('L', (BODY + 160, BODY + 160), 0)
    ImageDraw.Draw(shadow).rounded_rectangle(
        (80, 80, 80 + BODY - 1, 80 + BODY - 1), radius=RADIUS, fill=90)
    shadow = shadow.filter(ImageFilter.GaussianBlur(13))
    shade = Image.new('RGBA', shadow.size, (0, 0, 0, 0))
    shade.putalpha(shadow)
    canvas.alpha_composite(shade, (pad - 80, pad - 80 + 10))

    canvas.alpha_composite(body, (pad, pad))
    return canvas


def write_icns(master, path):
    chunks = []
    for typ, px in ICNS_PNG_TYPES:
        buf = os.path.join('/tmp', '_icns_%d.png' % px)
        master.resize((px, px), Image.LANCZOS).save(buf, 'PNG', optimize=True)
        with open(buf, 'rb') as f:
            data = f.read()
        os.remove(buf)
        chunks.append(typ.encode('ascii') + struct.pack('>I', len(data) + 8) + data)
    blob = b'icns' + struct.pack('>I', 8 + sum(len(c) for c in chunks)) + b''.join(chunks)
    with open(path, 'wb') as f:
        f.write(blob)


def main():
    if '--check' in sys.argv:
        checks = [OUT_1024, os.path.join(ICON_DIR, 'icon.icns'),
                  os.path.join(ICON_DIR, '128x128@2x.png')]
        for p in checks:
            if not os.path.exists(p):
                print('✗ 缺 %s' % p)
                return 1
        im = Image.open(OUT_1024)
        bbox = im.getchannel('A').getbbox()
        print('macos-1024: %s bbox=%s' % (im.size, bbox))
        print('icns: %d bytes' % os.path.getsize(checks[1]))
        return 0

    master = build_master()

    os.makedirs(ICON_DIR, exist_ok=True)
    master.save(OUT_1024, 'PNG', optimize=True)

    for px in (16, 32, 64, 128, 256, 512, 1024):
        master.resize((px, px), Image.LANCZOS).save(
            os.path.join(ICON_DIR, '%d.png' % px), 'PNG', optimize=True)
    # Tauri 的 bundle.icon 里点名的这几个（Windows 走 icon.ico，这里是 Linux 与兜底用）
    master.resize((32, 32), Image.LANCZOS).save(os.path.join(ICON_DIR, '32x32.png'), 'PNG', optimize=True)
    master.resize((128, 128), Image.LANCZOS).save(os.path.join(ICON_DIR, '128x128.png'), 'PNG', optimize=True)
    master.resize((256, 256), Image.LANCZOS).save(os.path.join(ICON_DIR, '128x128@2x.png'), 'PNG', optimize=True)
    master.resize((512, 512), Image.LANCZOS).save(os.path.join(ICON_DIR, 'icon.png'), 'PNG', optimize=True)
    write_icns(master, os.path.join(ICON_DIR, 'icon.icns'))

    bbox = master.getchannel('A').getbbox()
    print('· %s  1024×1024  可见区域 %s（%.1f%% 画布）'
          % (os.path.relpath(OUT_1024, ROOT), bbox, (bbox[2] - bbox[0]) / 10.24))
    print('· desktop-tauri/src-tauri/icons: 7 档 png + icon.icns')
    return 0


if __name__ == '__main__':
    sys.exit(main())
