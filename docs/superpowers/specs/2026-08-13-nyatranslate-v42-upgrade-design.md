# NyaTranslate v4.2 产品升级设计

日期:2026-08-13 · 基于 27 智能体审计(70 条发现,15 条 critical/high 确认)

## 一、用户视角的不足(审计确认)

**交互逻辑断层**
1. 面板内二次划词永远无响应(insidePanel 场景被 `content_main.js:98` 提前 return 杀死)
2. SPA 页面导航后固定面板变"幽灵面板":DOM 被移除但状态残留,每次划词继续烧 API 额度
3. 滚动即关面板:惯性滚动瞬间丢失翻译结果
4. preferredAction 设置无效:后台恒用 combined prompt,选 none 则面板永久空转无任何按钮
5. page-pinned(便利贴)不参与划词路由,固定后仍不断弹新面板
6. 键盘选区(Shift+方向键)不触发;>500 字符选择被静默丢弃
7. 旧版模型行在 content/background 两端 id 不一致,结果被静默丢弃(老用户必现)
8. 无批级完成回执,SW 终止时卡片永久 loading

**安全(上架阻断级)**
9. XSS:LLM 输出经 `innerHTML` 注入 content script 隔离世界 → prompt injection 可窃取全部 API Key
10. popup 历史渲染未转义(存储型 HTML 注入);API 错误原文透传会泄漏 API Key(sk-xxx)
11. 视觉路径无超时上限,错误 baseUrl 导致永久 loading

**UI 的"AI 感"**
12. "喵~"后缀泛滥:97 处 UI 文案,按钮/错误信息/版本号全覆盖
13. emoji 与 SVG 三轨图标混用,9 种尺寸、3 种粗细
14. 圆角 token 分数相乘(4.8/5.6/8.8px)、Tailwind 默认色板硬编码、彩色光晕阴影泛滥
15. 全元素 hover 位移 + 无限循环装饰动画,无运动层级、无 reduced-motion
16. 三表面各写一套字号刻度,中文上套 uppercase+letter-spacing

**产品缺口**
17. 每次划词向所有启用模型并发请求,额度浪费严重
18. 单词查询每次打 LLM(慢+贵);历史只读无搜索/回填;无生词本;无朗读;无右键翻译
19. 截图翻译使用"第一个启用模型",无视觉能力静默失败
20. 版本号三处不一致;README 过时;无隐私政策;content.js 死代码随包发布

## 二、升级范围(用户已决策)

| 决策 | 结论 |
|---|---|
| 目标语言 | 维持现状(中↔英) |
| 单词词典 | 仅本地缓存(LLM 结果 LRU 缓存) |
| 划词操作条 | 不加 |
| 模型并发 | **首选模型先跑,其他卡片按需加载** |
| 生词本/朗读/历史增强/右键翻译 | 采纳审计建议(低成本高价值) |

## 三、实现工作包

### A. background.js 全面加固
- 适配器层 AbortController 超时(30s 真 abort);429/5xx 自动重试 1 次(指数退避)
- 错误脱敏(sk-xxx→sk-***)+ 状态码→友好文案(401/403/429/5xx)
- 批级回执 `nya-multi-done`;HistoryManager 写入队列串行化 + 按 requestId 合并去重
- 模型 id 归一化两端同源(旧行保留稳定 id)
- `nya-multi-translate` 支持 `onlyModelId`(首选模型);单词缓存 `wordCache`(LRU 500)
- 生词本 API(nya-wordbook-*);右键"翻译所选文字"菜单;视觉模型选择(vision 标记,无视觉模型时明确报错)
- 图片大小上限 8MB;max_tokens 按类型差异化;历史开关(historyEnabled)

### B. content 层交互修复
- 面板内二次划词生效(路由到当前面板);SPA 幽灵面板检测清理(isConnected)
- 滚动只隐藏图标不关面板;键盘选区触发;>500 字提示而非静默
- page-pinned 路由到便利贴;preferredAction 全链路生效(none 时卡片显示"查询"按钮)
- XSS 修复:转义后渲染(保留 **粗体** 与换行格式);CRLF 归一化
- 首选模型+按需加载交互:非首选卡片 idle 态显示"点击查询";批级超时兜底(45s)
- clamp 数学修复(小视口);关闭竞态(closing 标记);拖拽 destroy 恢复 transition/cursor
- 下拉菜单面板内点击关闭;重试独立 requestId;单词缓存角标;词典卡片加"收藏"与"朗读"

### C. popup 重构
- XSS 修复(createElement+textContent);历史搜索+点击复制+单条删除
- 新增"生词本"Tab;状态区合并为单卡;去内联样式;版本号从 manifest 读取

### D. options 重构
- 文案去萌化(功能文案中性,空状态/成功 toast 保留"喵~"品牌触点)
- 图标统一:Feather 风格 SVG(stroke 2,16px 网格),删 emoji
- 砍 standalone 死选项;新增:首选模型标记、视觉模型开关、历史开关
- 设计 token 收敛:离散圆角档、elevation 阴影、动画分层 + reduced-motion、字号 4 档刻度
- 颜色全走 MD3 token,删 Tailwind 兜底色与 Google Sans 假声明
- 无障碍:focus-visible、放开 user-select

### E. 品牌与产品落地
- 猫元素品牌 logo(猫耳圆角方块)+ 重新生成 icons PNG
- manifest:v4.2.0、删 scripting 权限、显式 CSP
- 删除 content.js 死代码;PRIVACY.md;README 重写(真实功能、无竞品提及)
- CHANGELOG v4.2;release.yml 打包清单补全

## 四、测试策略
1. `node --check` 全量语法检查
2. 多智能体对抗式代码审查 → 修复
3. Playwright 加载扩展做 E2E:设置页/弹窗加载、配置保存、无 console 错误

## 五、提交
v4.2.0 单一 commit(或按工作包拆分)→ push origin/main
