#!/usr/bin/env python3
"""把一张方形图标母版切成 Android 需要的全部尺寸。

用法：
  python3 apk/tools/icons.py <母版.png> [--fg-scale 0.84]

母版要求：正方形、无透明、主体居中。AI 出的图要先裁掉水印角（见 apk/icon/PROMPT.md）。
--fg-scale：自适应图标前景里母版占 108dp 画布的比例。母版主体若占 79% 宽，
            取 66/79≈0.84 就能让主体正好落在 72dp 安全区内（启动器只显示中间 66.7%）。
产出（覆盖写入）：
  res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png          旧版图标 48/72/96/144/192
  res/mipmap-*/ic_launcher_foreground.png                              自适应前景 108/162/216/324/432
  res/mipmap-anydpi-v26/ic_launcher.xml                                自适应图标描述
  res/values/colors.xml                                                ic_launcher_background
"""
import sys
import os
from PIL import Image

SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}


def main():
    args = [a for a in sys.argv[1:]]
    if not args:
        print(__doc__)
        return 1
    src = args[0]
    fg_scale = 1.0
    if '--fg-scale' in args:
        fg_scale = float(args[args.index('--fg-scale') + 1])

    res = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'res')
    im = Image.open(src).convert('RGB')
    if im.width != im.height:
        print('母版必须是正方形，实际 %dx%d' % im.size)
        return 1

    # 背景色取左上角（AI 图的背景是纯色，前景主体都在中间）
    bg = im.getpixel((4, 4))
    hexbg = '#%02X%02X%02X' % bg

    for dpi, px in SIZES.items():
        d = os.path.join(res, 'mipmap-' + dpi)
        os.makedirs(d, exist_ok=True)
        im.resize((px, px), Image.LANCZOS).save(os.path.join(d, 'ic_launcher.png'))

        # 自适应图标前景：108dp 画布，母版按 fg-scale 缩放居中，四周用底色补齐
        fg = int(px * 108 / 48)
        canvas = Image.new('RGB', (fg, fg), bg)
        inner = int(round(fg * fg_scale))
        canvas.paste(im.resize((inner, inner), Image.LANCZOS), ((fg - inner) // 2, (fg - inner) // 2))
        canvas.save(os.path.join(d, 'ic_launcher_foreground.png'))

    anydpi = os.path.join(res, 'mipmap-anydpi-v26')
    os.makedirs(anydpi, exist_ok=True)
    with open(os.path.join(anydpi, 'ic_launcher.xml'), 'w', encoding='utf-8') as f:
        f.write('''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
''')

    values = os.path.join(res, 'values')
    os.makedirs(values, exist_ok=True)
    with open(os.path.join(values, 'colors.xml'), 'w', encoding='utf-8') as f:
        f.write('''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- 与图标母版的底色一致，自适应图标做视差位移时不会露边 -->
    <color name="ic_launcher_background">%s</color>
</resources>
''' % hexbg)

    print('已生成 %d 档图标，背景色 %s' % (len(SIZES), hexbg))
    return 0


if __name__ == '__main__':
    sys.exit(main())
