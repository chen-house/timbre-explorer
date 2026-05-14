# 声音设计学习站

一个关于声音设计的中文学习资料站，每个主题都配有可交互的音频演示。

## 在线预览

部署到 GitHub Pages 后访问 `https://<your-username>.github.io/<repo-name>/`

## 本地预览

任何静态服务器都可以。最简单的方式：

```bash
# Python 3
python3 -m http.server 8000

# 或用 Node
npx serve .
```

然后浏览器打开 `http://localhost:8000`。

> ⚠️ 不要直接双击 `index.html` 打开 — Web Audio API 在 `file://` 协议下可能受限。

## 目录结构

```
.
├── index.html              # 首页：导航 + 三个板块入口
├── effects/                # 效果器板块
│   ├── index.html         # 效果器总览
│   ├── eq.html            # ✅ EQ 完整内容
│   ├── filter.html        # 占位
│   ├── reverb.html        # 占位
│   ├── delay.html         # 占位
│   └── saturator.html     # 占位
├── timbre/
│   └── index.html         # 音色板块占位
├── atmosphere/
│   └── index.html         # 氛围色板块占位
└── assets/
    ├── css/
    │   ├── main.css       # 共享样式（导航、卡片、排版）
    │   └── eq.css         # EQ 专属样式
    └── js/
        └── eq.js          # EQ 互动逻辑（Web Audio API）
```

## 部署到 GitHub Pages

1. 把整个项目 push 到 GitHub 仓库
2. Settings → Pages
3. Source: Deploy from a branch
4. Branch: `main` (root)
5. 等几分钟 → 网站上线

## 已完成 / 待完成

| 板块 | 文章 | 状态 | 备注 |
|------|------|------|------|
| 效果器 | EQ 均衡器 | ✅ 完整深度 | 14 章：心理模型 / 修正 vs 创意 / 思考流程图 / 频段速查（含试听） / 互动 EQ（含响度匹配） / 电话声案例 / 六种形状 / 斜率演示 / 生活场景 / 响 ≠ 好 / 实操准则 / EQ 类型对比 / 术语表 / 自测题 |
| 效果器 | Filter 滤波器 | ⬜ 占位 | 下一篇 |
| 效果器 | Reverb 混响 | ⬜ 占位 | |
| 效果器 | Delay 延迟 | ⬜ 占位 | |
| 效果器 | Saturator 饱和器 | ⬜ 占位 | |
| 音色 | 总览 | ✅ 完整 | 7 章：什么是音色 / 五维度构成 / 四种基础波形（实时合成）/ 谐波频谱柱状图 / 五种感知分类（瞬态/持续/谐鸣/质感/调制，每类含真实音频试听）/ 时间包络对比 / 核心洞见。素材改写自 chen-house/timbre-explorer。 |
| 氛围色 | 总览 | ✅ 完整 | 25 个 Web Audio 实时合成示例，6 大类 + 5 类合成器术语横向对比。素材改写自 chen-house/timbre-explorer。 |

## 设计系统

- **强调色**：暖橙 `#D85A30` — 不警报、不疲劳，引导注意力
- **次强调**：青绿 `#1D9E75` — 自然态、原声
- **辅助**：紫色 `#7B5EA7` — 空间/氛围
- **底色**：米白 `#F7F3EC` — 纸面感
- **字体**：思源黑体（Noto Sans SC）
- **手绘感**：通过简单几何 + 圆角端点 + 不规则曲线表达，不用纸张纹理拟物

## 后续扩展

新增一篇效果器文章的步骤：

1. 在 `effects/` 下新建 `<name>.html`，参考 `eq.html` 结构
2. 如需独立样式，新建 `assets/css/<name>.css`
3. 如需独立交互，新建 `assets/js/<name>.js`
4. 更新 `effects/index.html` 中对应卡片的状态标签
5. 更新 `index.html` 首页的"已收录 N 篇"计数

新增板块（比如"信号链"）：

1. 新建 `signalchain/` 目录
2. 在所有页面的 `<nav>` 中加链接
3. 在 `index.html` 首页加第 4 张入口卡片

## 给 Claude Code 的提示

如果用 Claude Code 继续开发：

- 内容写作时遵循"先核实再下结论"的原则，理论依据 / 数据 / 物理逻辑必须明确标出
- 视觉风格保持极简手绘 — 不加 emoji（除非作为内容本身）、不加 box-shadow 拟物效果
- 每个主张要给出依据：物理规律？心理声学？经验法则？要明确
- 音频演示尽量用 Web Audio API 实时合成，不依赖音频文件 — 这样可以反映真实的参数变化
- 字体大小不低于 11px，颜色对比度足够
- 每篇新文章添加后，记得在 `effects/index.html` 和首页更新进度
