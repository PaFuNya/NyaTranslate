# 🐱 NyaTranslate-喵译

<p align="center">
  <a href="./README_EN.md">English</a>
</p>

<p align="center">
  <strong>AI 驱动的划词翻译与术语解释浏览器扩展 · 多模型并行 · 截图视觉翻译 · 生词本</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-green" alt="Manifest V3">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

## ✨ 简介

**NyaTranslate-喵译** 是一款现代化的 Chrome 浏览器扩展:在任意网页划选文字,即可通过你配置的任意 OpenAI 兼容或 Anthropic 协议模型获得即时翻译、术语解释与单词词典;支持区域截图与图片视觉翻译,内置翻译历史与生词本。

## 🎯 核心功能

- **划词翻译**:在任意网页划选文字,即刻获得翻译结果
- **多模型并行**:同时接入多家服务商(OpenAI / Anthropic / DeepSeek / 通义千问 / 任意兼容端点),结果分卡片对比
- **首选模型 + 按需加载**:面板打开只请求首选模型,其他卡片点击才查询,节省 API 额度
- **单词词典**:划选单个英文单词自动展示音标、词性、释义、例句、搭配与同义词,结果本地缓存
- **生词本**:词典卡片一键收藏,弹窗内复习与管理
- **视觉翻译**:区域截图(Alt+Shift+S 或右键菜单)与右键图片文字提取翻译
- **翻译历史**:自动保存,支持搜索、复制与单条删除

## 🚀 特性

- **多种触发方式**:图标点击、双击、组合键、直接搜索、悬停取词,按场景分别配置
- **语言匹配**:按源语言过滤触发(中/英/日/韩/法/西/德),严格模式可选
- **面板三态**:临时浮动 / 固定在屏幕(常驻翻译)/ 固定在页面(便利贴),支持拖拽与缩放
- **Material You 主题**:三套 Monet 调色板 × 亮/暗/跟随系统,全端即时同步
- **词典朗读**:一键朗读单词(speechSynthesis)
- **隐私优先**:API Key 仅存本机,绝不上传;翻译历史可选关闭

## 📦 安装

### 从源码加载(开发者模式)

1. 下载本仓库源码(或 `git clone https://github.com/PaFuNya/NyaTranslate.git`)
2. Chrome 打开 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」,选择仓库根目录
5. 点击扩展图标 → 打开设置 → 添加模型并填写 API Key 与 Base URL

### 系统要求

- Chrome 88+(支持 Manifest V3)

## 🎮 使用指南

### 基础使用

1. 在任意网页用鼠标划选文字(1–500 字符)
2. 触发方式(在「触发规则」中配置):
   - 划词后点击气泡图标
   - 划词后直接弹出面板
   - 双击划选文字
   - 按住 Ctrl/Alt/Shift 划词
   - 鼠标悬停自动取词
3. 面板中查看各模型结果,点击「复制」保存译文
4. 按 Esc、点击空白处或滚动关闭(滚动仅隐藏图标,面板保留)

### 配置模型

1. 点击扩展图标 → 「打开设置」
2. 在「API 配置」中点击「添加模型」,选择预设服务商或自定义
3. 填写显示名称、Model ID、Base URL 与 API Key
4. 用开关启用/禁用模型;标记「首选」模型优先查询;为视觉模型打开「视觉」开关

### 截图翻译

- 按 `Alt+Shift+S`(Mac: `Ctrl+Shift+S`),框选区域即可翻译
- 或右键 → 「区域截图翻译」
- 右键图片 → 「提取图片文字并翻译」
- 截图/图片翻译使用第一个启用的**视觉**模型

### 生词本与历史

- 词典卡片点击「收藏」加入生词本;弹窗「生词本」页可复习、复制、删除
- 弹窗「翻译历史」支持搜索、点击复制、单条删除与一键清空
- 可在设置中关闭历史保存

## ⚙️ 设置说明

| 分区 | 说明 |
|---|---|
| API 配置 | 模型列表:每模型独立 Base URL / API Key / 协议 / 视觉能力 / 首选标记 |
| 基础设置 | 输入框屏蔽、触摸模式 |
| 语言匹配 | 触发源语言过滤与严格模式 |
| 触发规则 | 普通划词 / 面板钉住后 / 面板内部 三种场景分别配置触发方式 |
| 偏好设置 | 默认操作、单词词典开关、例句难度、历史保存开关 |
| 个性化 | 亮/暗/跟随系统、三套 Monet 调色板、圆角与背景 |

## 🛠️ 项目结构

```
NyaTranslate/
├── manifest.json              # 扩展清单 (Manifest V3)
├── background.js              # Service Worker:API 适配器、并发调度、历史、生词本、截图
├── content_utils.js           # 配置管理、语言检测、触发引擎
├── content_drag.js            # 面板拖拽与缩放(Pointer Events)
├── content_panel.js           # 面板与卡片 UI
├── content_screenshot.js      # 截图框选与视觉结果面板
├── content_main.js            # 内容脚本入口与全局事件编排
├── appearance.js              # 全端外观配置分发
├── material-select.js         # 自定义下拉组件
├── popup.html/js/css          # 扩展弹窗(状态/历史/生词本)
├── options.html/js/css        # 设置页
├── theme.css                  # MD3 语义色与设计 token
├── style.css                  # 划词面板样式
├── icons/                     # 扩展图标
├── generate-icons.js          # 图标生成脚本(零依赖)
├── PRIVACY.md                 # 隐私政策
└── .github/workflows/         # 发布工作流
```

## 🔒 隐私

所有 API Key 仅通过 `chrome.storage.local` 保存在本机,绝不上传至任何第三方服务器;查询文本只发送至你配置的模型端点。详见 [PRIVACY.md](./PRIVACY.md)。

## 🤝 贡献

欢迎在 Issues 报告问题、提出功能建议,或提交 Pull Request。提交前请:

- 遵循现有代码风格与文件职责划分
- 使用清晰的提交信息
- 确保 `node --check` 语法检查通过
- 同步更新相关文档

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE)。

---

<p align="center">
  Made with ❤️ and 🐱 by NyaTranslate Team
</p>
