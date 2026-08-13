/**
 * content_main.js — 入口层
 *
 * 包含：SelectionManager（全局事件监听与编排）、
 *       ExtensionApp（根节点，组合所有模块）、启动入口
 *
 * 依赖：content_utils.js、content_drag.js、content_panel.js、content_screenshot.js
 */

(function () {
  'use strict';

  if (window.__nyaSelectionHelperV4__) return;
  window.__nyaSelectionHelperV4__ = true;

  // ═══════════════════════════════════════════════════════════════════════════
  //  SelectionManager — 全局事件监听、拦截器、触发器
  // ═══════════════════════════════════════════════════════════════════════════

  class SelectionManager {
    constructor(app) {
      this._app = app;
      this._downOnIcon = false;
      this._downOnPanel = false;
      this._downPanel = null;
      this._isDblClick = false;
      this._dblTimer = null;
      this._hoverTimer = null;
      this._spaObserver = null;
      // 键盘选区去重:记录上一次 keyup 时的选区文本,避免无变化时反复触发
      this._lastKeySelText = '';

      this._onDown = this._onDown.bind(this);
      this._onUp = this._onUp.bind(this);
      this._onClick = this._onClick.bind(this);
      this._onDbl = this._onDbl.bind(this);
      this._onKey = this._onKey.bind(this);
      this._onKeyUp = this._onKeyUp.bind(this);
      this._onScroll = this._onScroll.bind(this);
      this._onMove = this._onMove.bind(this);

      this._setup();
      this._setupSpaWatcher();
    }

    _setup() {
      // 捕获阶段注册，确保在目标页脚本调用 stopPropagation 前拿到事件
      document.addEventListener('mousedown', this._onDown,  true);
      document.addEventListener('mouseup',   this._onUp,    true);
      document.addEventListener('click',     this._onClick, true);
      document.addEventListener('dblclick',  this._onDbl,   true);
      document.addEventListener('keydown',   this._onKey,   true);
      document.addEventListener('keyup',     this._onKeyUp, true);
      document.addEventListener('mousemove', this._onMove, { passive: true });
      window.addEventListener('scroll', this._onScroll, { passive: true });
    }

    _teardown() {
      document.removeEventListener('mousedown', this._onDown,  true);
      document.removeEventListener('mouseup',   this._onUp,    true);
      document.removeEventListener('click',     this._onClick, true);
      document.removeEventListener('dblclick',  this._onDbl,   true);
      document.removeEventListener('keydown',   this._onKey,   true);
      document.removeEventListener('keyup',     this._onKeyUp, true);
      document.removeEventListener('mousemove', this._onMove);
      window.removeEventListener('scroll',      this._onScroll);
    }

    // SPA 路由存活：popstate（History API）+ MutationObserver（Turbo/Pjax 替换 body）
    _setupSpaWatcher() {
      window.addEventListener('popstate', () => this._reattach());

      // subtree:false 只看 body 直接子节点批量替换，避免过度触发
      this._spaObserver = new MutationObserver(() => this._reattach());
      this._spaObserver.observe(document.body, { childList: true, subtree: false });
    }

    _reattach() {
      this._teardown();
      this._setup();
      // SPA 导航替换 body 后,检查面板 DOM 是否已被移除;
      // 脱管面板立即从 PanelManager 清理,避免"幽灵面板"继续接收路由与 API 回执
      this._app.panels.sweepDetached();
    }

    // 取词：优先标准 API，穿透 Shadow DOM 兜底
    _getSelectionText() {
      const std = window.getSelection()?.toString().trim();
      if (std) return std;

      // 递归穿透持有焦点的 Shadow Root
      let root = document.activeElement?.shadowRoot;
      while (root) {
        const inner = root.getSelection?.()?.toString().trim();
        if (inner) return inner;
        root = root.activeElement?.shadowRoot ?? null;
      }
      return '';
    }

    _onDown(e) {
      this._downOnIcon = this._app.icon.contains(e.target);
      this._downOnPanel = this._app.panels.contains(e.target);
      // 记录按下时所在的具体面板实例,供"面板内二次划词"直接路由到该面板
      this._downPanel = this._app.panels.getPanelByElement(e.target);
      // 记录按下时的选区文本:mouseup 时仅当选区发生变化(面板内产生了新划词)
      // 才触发查询,避免点击面板按钮/折叠头时被残留页面选区误判为"二次划词"
      this._downSelText = this._getSelectionText();
    }

    _onUp(e) {
      if (this._downOnIcon) return;

      const capturedE = {
        pageX: e.pageX, pageY: e.pageY,
        ctrlKey: e.ctrlKey, altKey: e.altKey,
        shiftKey: e.shiftKey, metaKey: e.metaKey,
        target: e.target,
      };

      setTimeout(() => {
        const sel  = window.getSelection();
        const text = this._getSelectionText();

        // 面板内松开:仅当产生了"新的"选区(面板内二次划词)才继续;
        // 点击面板按钮/空白等无新选区或选区未变化(残留旧选区)的情况直接忽略
        const insidePanel = this._downOnPanel || !!e.target.closest(`.${NS}-panel`);
        if (insidePanel && (text === this._downSelText)) return;
        this._downSelText = '';

        if (text.length < 1) {
          if (!this._app.panels.activePanel?.isOpen) this._app.icon.hide();
          return;
        }

        if (text.length > 500) {
          // 超长选择:给出 toast 提示而非静默丢弃
          this._app.toast('所选文本过长(>500 字符)，请分段划选');
          this._app.icon.hide();
          return;
        }

        if (this._app.config.get('disableInInputs')) {
          const anchor = sel?.anchorNode?.parentElement;
          const target = capturedE.target;
          if (InputBoxDetector.isInside(anchor) || InputBoxDetector.isInside(target)) return;
        }

        const langCfg = this._app.config.get('languages');
        const strict = this._app.config.get('strictLanguageMatch');
        if (!LanguageDetector.matches(text, langCfg, strict)) return;

        this._app.selectedText = text;

        let scenario;
        if (this._downOnPanel) {
          scenario = 'insidePanel';
        } else if (this._app.panels.pagePinnedPanels.length > 0 || this._app.panels.hasScreenPinnedPanel()) {
          scenario = 'pinned';
        } else {
          scenario = 'normal';
        }

        const action = this._app.trigger.evaluate(scenario, capturedE, this._isDblClick);

        if (action === 'direct') {
          // 面板内二次划词:直接路由到用户正在操作的这张面板,更新其内容
          const targetPanel = this._downPanel;
          this._downPanel = null;
          if (targetPanel && targetPanel.isOpen && !targetPanel._closing) {
            this._app.icon.hide();
            targetPanel.updateContent(text);
            return;
          }
          this._routeDirect(text, { x: capturedE.pageX, y: capturedE.pageY });
        } else if (action === 'icon') {
          if (!this._app.panels.activePanel?.isOpen) {
            this._app.icon.show(capturedE.pageX, capturedE.pageY);
          }
        }
      }, 10);
    }

    /**
     * direct 场景的统一路由:
     *   screen-pinned(常驻翻译) → page-pinned(最近使用的便利贴) →
     *   当前打开的面板 updateContent → 新建浮动画板
     */
    _routeDirect(text, pos) {
      this._app.icon.hide();

      if (this._app.panels.hasScreenPinnedPanel()) {
        this._app.panels.routeToScreenPinned(text);
        return;
      }
      if (this._app.panels.pagePinnedPanels.length > 0) {
        this._app.panels.routeToPagePinned(text);
        return;
      }
      const activePanel = this._app.panels.activePanel;
      if (activePanel?.isOpen && !activePanel._closing) {
        activePanel.updateContent(text);
        return;
      }
      this._app.panels.createPanel(text, pos, 'unpinned');
    }

    _onClick(e) {
      const t = e.target;
      if (this._app.panels.contains(t)) return;
      // 与 _onUp 一致的 closest 兜底：防止 e.target 是已脱离 panel 树的 portal 元素
      if (t?.closest?.(`.${NS}-panel`)) return;
      // 任何 MaterialSelect 风格的 portal 菜单都不应触发面板销毁
      if (t?.closest?.('.nya-ms__menu')) return;
      this._app.panels.closeUnpinned();
      if (!this._app.icon.contains(t)) {
        this._app.icon.hide();
      }
    }

    _onDbl() {
      this._isDblClick = true;
      clearTimeout(this._dblTimer);
      this._dblTimer = setTimeout(() => { this._isDblClick = false; }, 400);
    }

    _onKey(e) {
      if (e.key === 'Escape') {
        this._app.icon.hide();
        this._app.panels.closeUnpinned();
      }
    }

    /**
     * 键盘选区(Shift+方向键等):mouseup 不会触发,这里在 keyup 上检测。
     * 判定规则:按键组合必须包含 Shift(键盘扩展选区的唯一来源),
     * 且无 Ctrl/Alt/Meta;选区非空且与上次键盘选区不同才触发。
     * 方向键/空格等无 Shift 的按键不会把残留鼠标选区误判为新选区。
     */
    _onKeyUp(e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === 'Tab') return;

      // 仅处理携带 Shift 的键盘选区(如 Shift+方向键);方向键/空格等
      // 无 Shift 的按键会把现有选区折叠或仅是页面滚动,不构成查询意图
      const isShiftKey = e.shiftKey;
      const isArrow = e.key.startsWith('Arrow');
      if (!isShiftKey || !isArrow) {
        // 无 Shift 的按键可能折叠选区,重置去重基线
        if (isArrow) this._lastKeySelText = this._getSelectionText();
        return;
      }

      const sel  = window.getSelection();
      const text = this._getSelectionText();
      if (!text || text === this._lastKeySelText) return;
      this._lastKeySelText = text;

      if (text.length > 500) {
        this._app.toast('所选文本过长(>500 字符)，请分段划选');
        this._app.icon.hide();
        return;
      }

      if (this._app.config.get('disableInInputs')) {
        if (InputBoxDetector.isInside(sel?.anchorNode?.parentElement)) return;
      }

      const langCfg = this._app.config.get('languages');
      const strict = this._app.config.get('strictLanguageMatch');
      if (!LanguageDetector.matches(text, langCfg, strict)) return;

      this._app.selectedText = text;

      // 键盘选区没有鼠标坐标,用选区矩形推算位置(面板/图标定位用页面坐标)
      const rect = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null;
      const pos = {
        x: rect ? rect.left + rect.width / 2 + window.scrollX : window.scrollX + 80,
        y: rect ? rect.bottom + window.scrollY + 8 : window.scrollY + 160,
      };

      const action = this._app.trigger.evaluate('normal', e, false);
      if (action === 'direct') {
        this._routeDirect(text, pos);
      } else if (action === 'icon') {
        if (!this._app.panels.activePanel?.isOpen) {
          this._app.icon.show(pos.x, pos.y);
        }
      }
    }

    _onScroll() {
      // 滚动只隐藏悬浮图标,不关闭面板——避免惯性滚动瞬间丢失翻译结果
      this._app.icon.hide();
    }

    _onMove(e) {
      if (!this._app.config.get('triggerRules.normal.hoverSelect')) return;
      if (this._app.panels.activePanel?.isOpen) return;

      clearTimeout(this._hoverTimer);
      this._hoverTimer = setTimeout(() => {
        const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
        if (!range) return;

        range.expand?.('word');
        const word = range.toString().trim();
        if (word.length < 1 || word.length > 100) return;

        if (this._app.config.get('disableInInputs')) {
          if (InputBoxDetector.isInside(range.startContainer?.parentElement)) return;
        }

        this._app.selectedText = word;
        this._app.icon.show(e.pageX, e.pageY);
      }, 600);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  轻量 toast — 内容脚本内提示(复用面板/图标样式 token,不依赖后台)
  // ═══════════════════════════════════════════════════════════════════════════

  let _toastTimer = null;

  function showToast(message) {
    let el = document.getElementById(`${NS}-toast`);
    if (!el) {
      el = document.createElement('div');
      el.id = `${NS}-toast`;
      el.className = `${NS}-toast`;
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add(`${NS}-toast--visible`);
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
      el.classList.remove(`${NS}-toast--visible`);
    }, 1800);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ExtensionApp — 根节点，组合所有模块
  // ═══════════════════════════════════════════════════════════════════════════

  class ExtensionApp {
    constructor() {
      this.selectedText = '';
      this.config   = new ConfigManager();
      this.icon     = new FloatingIcon();
      this.panels   = new PanelManager(this.config);
      this.vision   = new VisionResultPanel(() => this.config.data);   // 视觉结果面板（单例）
      this.trigger  = null;
      this.selection = null;
      this.toast    = showToast;

      Object.defineProperty(this, 'panel', {
        get() { return this.panels.activePanel; },
      });

      this.icon.onOpen = (pos) => {
        this.panels.createPanel(this.selectedText, pos, 'unpinned');
      };
    }

    _applyAppearanceToContentRoots() {
      const a = NyaAppearance.mergeAppearance({ appearance: this.config.get('appearance') });
      if (this.icon.el) {
        NyaAppearance.applyToContentRoot(this.icon.el, a);
      }
      this.panels.refreshAppearanceFromConfig();
    }

    async init() {
      await this.config.load();
      this.icon._getConfigData = () => this.config.data;
      this.trigger   = new TriggerEngine(this.config);
      this.selection = new SelectionManager(this);
      this._setupMessageListener();

      this._onAppearanceMedia = () => {
        const mode = NyaAppearance.mergeAppearance({ appearance: this.config.get('appearance') }).themeMode;
        if (mode === 'system') this._applyAppearanceToContentRoots();
      };
      this._appearanceMq = window.matchMedia('(prefers-color-scheme: dark)');
      this._appearanceMq.addEventListener('change', this._onAppearanceMedia);

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.models) {
          this.config.load().then(() => {
            this.panels.refreshCardsFromConfig();
          });
        }
        if (changes.wordCache) {
          // 单词缓存由 background 写入,reload 让 _consumeWordCache 读到最新值
          this.config.load();
        }
        if (changes.appearance) {
          this.config.load().then(() => {
            this._applyAppearanceToContentRoots();
          });
        }
      });
      console.debug('[NyaTranslate v4.2] 初始化完成 — 首选模型 + 按需加载卡片流。');
    }

    /**
     * 监听来自 background 的消息（视觉翻译结果、截图推送）
     *
     * v3.1 变化：截图现在由 background 主动 push（nya-screenshot-start），
     * 不再由 content.js 发起拉取（nya-start-screenshot），消除 popup 关闭时序问题。
     */
    _setupMessageListener() {
      chrome.runtime.onMessage.addListener((message, sender) => {
        // 纵深防御:只接受本扩展 background 推送的消息
        if (sender.id && sender.id !== chrome.runtime.id) return;
        const { action } = message;

        // background 通知：正在识别图片（右键菜单触发）
        if (action === 'nya-vision-loading') {
          this.vision.showLoading();
          return;
        }

        // background 通知：视觉翻译结果已就绪
        if (action === 'nya-vision-result') {
          const pos = (message.x != null && message.y != null)
            ? { x: message.x, y: message.y }
            : null;
          this.vision.show(message.result, message.label || message.model, pos);
          return;
        }

        // background 通知：视觉翻译失败
        if (action === 'nya-vision-error') {
          this.vision.showError(message.error || '视觉翻译失败，请重试。');
          return;
        }

        // background push：截图数据已就绪，直接挂载 ScreenshotOverlay
        // 触发来源：Alt+Shift+S 快捷键 或 右键「区域截图翻译」
        if (action === 'nya-screenshot-start') {
          if (message.dataUrl) {
            new ScreenshotOverlay(message.dataUrl).mount();
          }
          return;
        }

        // background push：右键「翻译所选文字」
        // 打开/复用面板并采纳 background 生成的 requestId，回执直接流入面板卡片
        if (action === 'nya-translate-selection') {
          if (message.text) {
            this.selectedText = String(message.text).trim();
            const panel = this.panels.screenPinnedPanel
              || this.panels.pagePinnedPanels[this.panels.pagePinnedPanels.length - 1]
              || this.panels.activePanel;
            if (panel && panel.isOpen && !panel._closing) {
              panel.adoptExternalRequest(this.selectedText, message.requestId || '');
            } else {
              const pos = { x: window.innerWidth / 2, y: window.innerHeight / 3 };
              // skipAutoQuery:external 批次已由 background 发起,避免重复请求浪费额度
              this.panels.createPanel(this.selectedText, pos, 'unpinned', { skipAutoQuery: true });
              const created = this.panels.activePanel;
              if (created) created.adoptExternalRequest(this.selectedText, message.requestId || '');
            }
          }
          return;
        }
      });
    }
  }

  // ── 启动 ──────────────────────────────────────────────────────────────────
  const app = new ExtensionApp();
  app.init();

})();
