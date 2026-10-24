# 图标：设计说明与提示词

## 长什么样

一个**打击准星环**里，装着**三颗橙色太阳**（三日凌空）和**一线深色松林**。

三层意思叠在一个符号里：

- **三颗太阳** = 三体问题 / 三体世界，一眼认出这不是随便一个科幻游戏
- **准星** = 黑暗森林打击，"清理"
- **松林** = 黑暗森林本身

全部元素收在圆环内、整体只占画布 79%，所以圆形蒙版怎么裁都不掉东西——这是它能上自适应图标的前提。

| 项 | 值 |
|---|---|
| 底色 | `#141613`（自适应背景色同值，视差位移不露边） |
| 太阳 | 琥珀橙 `#F0A03C` / `#E8943A` |
| 准星环 | 暗青 `#2E4A4A` |
| 松林 | 深绿 `#1B3A22` |
| 母版 | `icon-512.png`（512×512，无透明，徽标占 79%） |
| AI 原图 | `source-ai-1024.png`（1024×1024，水印已抹掉） |
| 蒙版预览 | `mask-preview.png`（圆形 / 圆角方 / 自适应 72dp 裁切） |

## 提示词（英文，直接可用）

> Android app icon, square, flat vector, minimal, bold. Near-black background (#0B0F14),
> completely empty outside the central emblem. Center: one circular targeting reticle
> (four thick muted teal arc segments with gaps, plus four short radial tick marks at the gaps),
> diameter about 60 percent of the canvas. INSIDE the reticle only: three amber orange sun discs
> in a tight triangle in the upper half (one slightly larger, all three close together, none
> touching the reticle), and along the lower inner edge a black-green pine forest silhouette of
> flat triangles forming a horizon line. Nothing at the corners, nothing outside the reticle.
> Absolutely no text, no letters, no numbers, no signature, no logo, no watermark, no border
> frame, no glow, no rays. Flat solid colors only, no gradients, no noise, no texture, no 3D.
> High contrast, simple strong geometry, readable at 48 by 48 pixels.

中文版：

> 方形应用图标，扁平矢量，极简，图形粗壮。近黑背景（#0B0F14），**徽标以外必须是空的**。
> 正中一个圆形打击准星：四段粗的暗青色圆弧，弧段之间留缺口，缺口处各放一个短刻度，直径约占画布 60%。
> **准星内部只放两样东西**：上半部三颗橙色太阳，紧凑排成三角形（其中一颗略大，彼此靠近，都不要碰到准星），
> 下半部内缘是一排深绿近黑的松林剪影，用扁平三角形做成地平线。四角不要有任何东西，准星外不要有任何东西。
> 绝对不要文字、字母、数字、签名、标志、水印、边框、发光、光芒。只用纯色块，不要渐变、噪点、纹理、3D。
> 高对比，形状简单有力，缩到 48×48 仍然清晰。

## 反向提示词

```
text, lettering, chinese characters, numbers, watermark, signature, logo, border frame,
multiple icons, icon grid, mockup, phone frame, drop shadow, bevel, 3d render, glossy,
gradient mesh, lens flare, noise, grain, photograph, realistic texture, thin hairline strokes,
busy detail, cluttered corners, subject outside the circle, off-center, cropped edges
```

## 尺寸与参数

- `1024×1024`，`quality=high`，`style=flat vector icon`，`background=opaque`
- 别用 `transparent`：暗色边缘羽化会在深色桌面上露白边
- 出图后**先缩到 48 px 看**：`sips -z 48 48 x.png --out t.png`，认不出就重出

## 落地的三个手艺活

### 1. 抹掉模型水印

`ImageGen` 每张图右下角都带「AI生成 WORKBUDDY」，`footnote` 参数去不掉。这次不是裁切，而是**按饱和度擦除**——
水印是灰白的（`max-min < 16`），准星/松林/太阳都有明显饱和度，所以只替换低饱和像素，图形一根线都不会伤：

```python
px = im.load(); bg = px[5,5]
for y in range(880, h):
    for x in range(760, w):
        r, g, b = px[x, y]
        if (max(r, g, b) - min(r, g, b)) < 16:
            px[x, y] = bg
```

### 2. 把徽标缩到 79%

原图徽标占了 89%，圆形蒙版会切到准星。四周补底色扩到 1150 再缩到 512，徽标正好 79%：

```python
canvas = Image.new('RGB', (1150, 1150), bg)
canvas.paste(im, (63, 63)); canvas.resize((512, 512), Image.LANCZOS).save('apk/icon/icon-512.png')
```

### 3. 切资源

```bash
python3 apk/tools/icons.py apk/icon/icon-512.png --fg-scale 0.84
cd apk && ./build.sh
```

`--fg-scale 0.84` 是给自适应图标的：启动器只显示 108dp 的中间 72dp，0.84×79% ≈ 66%，
徽标正好落在安全区里、边缘留一指宽。不传这个参数就是整版铺满，圆环会被切。

`tools/icons.py` 还会写 `res/values/colors.xml` 的 `ic_launcher_background`（取母版左上角像素），
换配色只换母版、重跑脚本即可。
