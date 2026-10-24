# 背景图来源

界面有两张背景，按场景切换：入口 / 大厅是「黑暗森林」，进了牌桌抬头换成「星空」。

| 用途 | 文件 | 出处 | 作者 |
|---|---|---|---|
| 入口 / 大厅 | `bg-forest.jpg` | [Pexels #13396066](https://www.pexels.com/photo/13396066/) | Felix Richter |
| 对局中 | `bg-space.jpg` | [Pexels #956981](https://www.pexels.com/photo/956981/) | Felix Mittermeier |

两张都是 [Pexels License](https://www.pexels.com/license/)：可免费商用、可修改，**不要求署名**（这里仍然署名）。

---

## bg-forest.jpg —— 雾中松林与穿过树隙的月光

```python
im  = Image.open('原图 2200px').convert('RGB')
out = ImageEnhance.Brightness(im).enhance(1.08)   # 照片本身均值只有 38，略提亮
out = ImageEnhance.Color(out).enhance(0.90)       # 压一点饱和，不抢界面的金色
out = ImageEnhance.Contrast(out).enhance(1.04)
out.resize((1600, 1067), LANCZOS).save('bg-forest.jpg', quality=80, optimize=True, progressive=True)
```

`web/style.css` 里 `body::after` 的渐变遮罩压到 .64–.90——顶部最重，让入口卡片下面安静；中段放开，让雾和光透出来。

## bg-space.jpg —— 银河（Mittermeier 那张经典横构图）

```python
im  = Image.open('原图 2400px').convert('RGB')
out = ImageEnhance.Brightness(im).enhance(0.62)   # 原图亮度 45，直接压到 27：当背景不能抢主体
out = ImageEnhance.Color(out).enhance(0.92)
out = ImageEnhance.Contrast(out).enhance(1.06)    # 补偿压暗损失掉的星点对比
out.resize((1440, 810), LANCZOS).save('bg-space.jpg', quality=74, optimize=True, progressive=True)
```

对局里星星要能看见，所以**压暗放在文件里、遮罩放在 CSS 里，各管一半**：

- 星空层是 `#app::before`，`filter: brightness(1.18)` 把压暗过的图提回来一点，`opacity` 0→1 做 0.55s 交叉淡入；
- 遮罩是 `body.in-game::after`，中心基本透明（让银河带透出来），四周收到 .82 做暗角；
- 大厅那套 `body::after` 是均匀遮罩，直接沿用会把星星压成纯色（实测整页只有 12/11/25 的底色）——**这两个状态必须各用一套遮罩**。

换图时：新图更亮就把 `brightness()` 往下调，暗角/主渐变里的 alpha 整体 ±0.1，别一次动太多。
