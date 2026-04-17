/**
 * Content Script — 划词助手 v3
 *
 * 架构：ES6 Class 模块化
 *   ConfigManager     — 从 storage 加载全量配置
 *   LanguageDetector  — 文本语种检测
 *   InputBoxDetector  — 输入框/编辑器检测
 *   TriggerEngine     — 根据场景+事件决策触发方式
 *   DragController    — 面板拖拽
 *   AccordionCard     — 单个模型折叠卡片
 *   FloatingIcon      — 悬浮小图标
 *   PanelManager      — 面板生命周期（Pin / 拖拽 / 堆叠卡片）
 *   SelectionManager  — 全局事件监听与编排
 *   ExtensionApp      — 根节点，组合所有模块
 */

(function () {
  'use strict';

  // 防止重复注入
  if (window.__nyaSelectionHelperV3__) return;
  window.__nyaSelectionHelperV3__ = true;

  const NS = 'my-ext';

  // ─── SVG 图标常量 ─────────────────────────────────────────────────────────

  const SVG_PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/></svg>`;
  const SVG_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const SVG_CHAT = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  const SVG_CHEVRON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

  // ─── 默认配置 ─────────────────────────────────────────────────────────────

  const DEFAULT_CONFIG = {
    disableInInputs:     true,
    touchMode:           false,
    languages: {
      zh: true, en: true, ja: false,
      ko: false, fr: false, es: false, de: false,
    },
    strictLanguageMatch: false,
    triggerRules: {
      normal: {
        showIcon:       true,
        directSearch:   false,
        dblclickSearch: false,
        modifiers:      [],
        hoverSelect:    false,
      },
      pinned: {
        showIcon:       false,
        directSearch:   true,
        dblclickSearch: false,
        modifiers:      [],
        hoverSelect:    false,
      },
      insidePanel: {
        showIcon:       false,
        directSearch:   true,
        dblclickSearch: false,
        modifiers:      [],
        hoverSelect:    false,
      },
      standalone: {
        showIcon:       false,
        directSearch:   true,
        dblclickSearch: false,
        modifiers:      [],
        hoverSelect:    false,
      },
    },
    preferredAction: 'none',
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  ConfigManager — 全量读取 storage，深度合并默认值
  // ═══════════════════════════════════════════════════════════════════════════

  class ConfigManager {
    constructor() {
      this.data = this._clone(DEFAULT_CONFIG);
    }

    load() {
      return new Promise((resolve) => {
        chrome.storage.local.get(null, (stored) => {
          this.data = this._deepMerge(DEFAULT_CONFIG, stored || {});
          resolve(this.data);
        });
      });
    }

    /** 读取嵌套路径，如 'triggerRules.normal.showIcon' */
    get(path) {
      return path.split('.').reduce((o, k) => o?.[k], this.data);
    }

    _deepMerge(defaults, overrides) {
      const out = { ...defaults };
      for (const k of Object.keys(overrides)) {
        if (
          k in defaults &&
          defaults[k] !== null &&
          typeof defaults[k] === 'object' &&
          !Array.isArray(defaults[k])
        ) {
          out[k] = this._deepMerge(defaults[k], overrides[k] ?? {});
        } else {
          out[k] = overrides[k];
        }
      }
      return out;
    }

    _clone(obj) {
      return JSON.parse(JSON.stringify(obj));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  LanguageDetector — 通过正则匹配判断文本语种
  // ═══════════════════════════════════════════════════════════════════════════

  class LanguageDetector {
    static PATTERNS = {
      zh: /[\u4e00-\u9fff\u3400-\u4dbf]/,
      en: /[a-zA-Z]/,
      ja: /[\u3040-\u30ff\u31f0-\u31ff\uff65-\uff9f]/,
      ko: /[\uac00-\ud7af\u1100-\u11ff]/,
      fr: /[àâäéèêëîïôùûüÿæœç]/i,
      es: /[áéíóúüñ¿¡]/i,
      de: /[äöüß]/i,
    };

    static detect(text) {
      return Object.entries(this.PATTERNS)
        .filter(([, re]) => re.test(text))
        .map(([lang]) => lang);
    }

    /**
     * @param {string}  text
     * @param {object}  langConfig  { zh: true, en: true, ... }
     * @param {boolean} strict      true = 所有检测到的语种都必须在启用列表中
     */
    static matches(text, langConfig, strict) {
      const enabled = Object.keys(langConfig).filter((k) => langConfig[k]);
      if (enabled.length === 0) return true;          // 无过滤规则，放行

      const detected = this.detect(text);
      if (detected.length === 0) return true;          // 未知字符集，放行

      return strict
        ? detected.every((l) => enabled.includes(l))  // 严格：全部匹配
        : detected.some((l) => enabled.includes(l));   // 宽松：任一匹配
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  InputBoxDetector — 检测目标元素是否处于输入框/代码编辑器内
  // ═══════════════════════════════════════════════════════════════════════════

  class InputBoxDetector {
    static EDITOR_CLASSES = [
      'CodeMirror', 'ace_editor', 'monaco-editor',
      'cm-editor', 'ProseMirror', 'ql-editor', 'tox-edit-area',
    ];

    static isInside(element) {
      if (!element) return false;
      const tag = element.tagName?.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return true;
      if (element.isContentEditable) return true;

      let el = element;
      while (el && el !== document.body) {
        if (el.classList) {
          for (const cls of this.EDITOR_CLASSES) {
            if (el.classList.contains(cls)) return true;
          }
        }
        el = el.parentElement;
      }
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TriggerEngine — 根据场景和事件决定触发方式
  // ═══════════════════════════════════════════════════════════════════════════

  class TriggerEngine {
    constructor(config) {
      this.config = config;
    }

    /**
     * @param {'normal'|'pinned'|'insidePanel'|'standalone'} scenario
     * @param {MouseEvent} event
     * @param {boolean}    isDblClick
     * @returns {'icon'|'direct'|'off'}
     */
    evaluate(scenario, event, isDblClick = false) {
      const rules = this.config.get(`triggerRules.${scenario}`);
      if (!rules) return 'off';

      // 优先级 1：双击搜索
      if (isDblClick && rules.dblclickSearch) return 'direct';

      // 优先级 2：组合键触发 → 强制 direct
      if (rules.modifiers?.length > 0) {
        const hit = rules.modifiers.some((mod) => {
          if (mod === 'ctrl')  return event.ctrlKey;
          if (mod === 'alt')   return event.altKey;
          if (mod === 'shift') return event.shiftKey;
          if (mod === 'meta')  return event.metaKey;
          return false;
        });
        if (hit) return 'direct';
      }

      // 优先级 3：基础模式
      if (rules.directSearch) return 'direct';
      if (rules.showIcon)     return 'icon';
      return 'off';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  DragController — 鼠标拖拽面板
  // ═══════════════════════════════════════════════════════════════════════════

  class DragController {
    constructor(panelEl, handleEl) {
      this._panel  = panelEl;
      this._handle = handleEl;
      this._active = false;
      this._ox = 0; this._oy = 0;
      this._pl = 0; this._pt = 0;

      this._down = this._down.bind(this);
      this._move = this._move.bind(this);
      this._up   = this._up.bind(this);

      handleEl.addEventListener('mousedown', this._down);
      handleEl.style.cursor = 'grab';
    }

    _down(e) {
      if (e.button !== 0) return;
      if (e.target.closest('button')) return; // 点击按钮不触发拖拽
      e.preventDefault();
      e.stopPropagation();

      this._active = true;
      this._ox = e.clientX;
      this._oy = e.clientY;
      this._pl = parseInt(this._panel.style.left, 10) || 0;
      this._pt = parseInt(this._panel.style.top,  10) || 0;

      document.addEventListener('mousemove', this._move);
      document.addEventListener('mouseup',   this._up);
      this._handle.style.cursor = 'grabbing';
      this._panel.style.transition = 'none'; // 拖拽时禁用入场动画
    }

    _move(e) {
      if (!this._active) return;
      const dx  = e.clientX - this._ox;
      const dy  = e.clientY - this._oy;
      const pw  = this._panel.offsetWidth;
      const ph  = this._panel.offsetHeight;
      const sx  = window.scrollX, sy = window.scrollY;
      const vw  = window.innerWidth, vh = window.innerHeight;

      const left = Math.max(sx + 8, Math.min(this._pl + dx, sx + vw - pw - 8));
      const top  = Math.max(sy + 8, Math.min(this._pt + dy, sy + vh - ph - 8));

      this._panel.style.left = `${left}px`;
      this._panel.style.top  = `${top}px`;
    }

    _up() {
      if (!this._active) return;
      this._active = false;
      document.removeEventListener('mousemove', this._move);
      document.removeEventListener('mouseup',   this._up);
      this._handle.style.cursor = 'grab';
      this._panel.style.transition = '';
    }

    destroy() {
      this._handle.removeEventListener('mousedown', this._down);
      document.removeEventListener('mousemove', this._move);
      document.removeEventListener('mouseup',   this._up);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  AccordionCard — 单个模型的折叠展示卡片
  // ═══════════════════════════════════════════════════════════════════════════

  class AccordionCard {
    /**
     * @param {string} modelId    'deepseek' | 'qwen'
     * @param {string} modelLabel 显示名称
     */
    constructor(modelId, modelLabel) {
      this.modelId = modelId;
      this.label   = modelLabel;
      this.state   = { status: 'idle', action: null, content: '' };
      this.onFetch = null; // (modelId, action) => void  —— 由 PanelManager 注入

      this._open    = true;
      this._body    = null;
      this._dot     = null;
      this._chevron = null;
      this.el       = null;

      this._build();
    }

    // ── 构建 DOM ──────────────────────────────────────────────────────────

    _build() {
      this.el = document.createElement('div');
      this.el.className = `${NS}-accordion`;

      // 卡片头部（点击折叠/展开）
      const hdr = document.createElement('div');
      hdr.className = `${NS}-accordion-header`;

      const titleWrap = document.createElement('div');
      titleWrap.className = `${NS}-accordion-title`;

      const badge = document.createElement('span');
      badge.className = `${NS}-accordion-badge ${NS}-accordion-badge--${this.modelId}`;
      badge.textContent = this.label;

      this._dot = document.createElement('span');
      this._dot.className = `${NS}-accordion-dot`;

      titleWrap.appendChild(badge);
      titleWrap.appendChild(this._dot);

      this._chevron = document.createElement('span');
      this._chevron.className = `${NS}-accordion-chevron ${NS}-accordion-chevron--up`;
      this._chevron.innerHTML = SVG_CHEVRON;

      hdr.appendChild(titleWrap);
      hdr.appendChild(this._chevron);
      hdr.addEventListener('click', () => this._toggle());

      // 卡片主体（动画展开/折叠）
      this._body = document.createElement('div');
      this._body.className = `${NS}-accordion-body ${NS}-accordion-body--open`;

      this.el.appendChild(hdr);
      this.el.appendChild(this._body);

      this._renderBody();
    }

    _toggle() {
      this._open = !this._open;
      this._body.classList.toggle(`${NS}-accordion-body--open`, this._open);
      this._chevron.classList.toggle(`${NS}-accordion-chevron--up`, this._open);
    }

    forceOpen() {
      this._open = true;
      this._body.classList.add(`${NS}-accordion-body--open`);
      this._chevron.classList.add(`${NS}-accordion-chevron--up`);
    }

    // ── 状态更新 ──────────────────────────────────────────────────────────

    setLoading(action) {
      this.state = { status: 'loading', action, content: '' };
      this._setDot('loading');
      this.forceOpen();
      this._renderBody();
    }

    setResult(action, content) {
      this.state = { status: 'result', action, content };
      this._setDot('success');
      this._renderBody();
    }

    setError(action, error) {
      this.state = { status: 'error', action, content: error };
      this._setDot('error');
      this._renderBody();
    }

    reset() {
      this.state = { status: 'idle', action: null, content: '' };
      this._setDot('');
      this._renderBody();
    }

    _setDot(variant) {
      this._dot.className = `${NS}-accordion-dot${variant ? ` ${NS}-accordion-dot--${variant}` : ''}`;
    }

    // ── 内容区状态机渲染 ──────────────────────────────────────────────────

    _renderBody() {
      this._body.innerHTML = '';
      const { status, action, content } = this.state;

      if (status === 'idle') {
        const hint = document.createElement('p');
        hint.className   = `${NS}-hint`;
        hint.textContent = `点击上方按钮，由 ${this.label} 为你解答`;
        this._body.appendChild(hint);

      } else if (status === 'loading') {
        const loader  = document.createElement('div');
        loader.className = `${NS}-loading`;

        const spinner = document.createElement('div');
        spinner.className = `${NS}-spinner`;

        const txt = document.createElement('span');
        txt.className   = `${NS}-loading-text`;
        txt.textContent = `${this.label} 正在思考中…`;

        const dots = document.createElement('div');
        dots.className = `${NS}-dots`;
        for (let i = 0; i < 3; i++) {
          const d = document.createElement('span');
          d.className = `${NS}-dot`;
          dots.appendChild(d);
        }

        loader.appendChild(spinner);
        loader.appendChild(txt);
        loader.appendChild(dots);
        this._body.appendChild(loader);

      } else if (status === 'result') {
        const rHdr = document.createElement('div');
        rHdr.className   = `${NS}-result-header`;
        rHdr.textContent = action === 'translate' ? '🌐 翻译结果' : '📖 术语解释';

        const rBody = document.createElement('div');
        rBody.className   = `${NS}-result-body`;
        rBody.textContent = content;

        const rFoot  = document.createElement('div');
        rFoot.className = `${NS}-result-footer`;

        const otherAction = action === 'translate' ? 'explain' : 'translate';
        const otherLabel  = otherAction === 'translate' ? '🌐 翻译' : '📖 解释';

        rFoot.appendChild(this._btn(otherLabel, () => this.onFetch?.(this.modelId, otherAction), true));
        rFoot.appendChild(this._copyBtn(content));

        this._body.appendChild(rHdr);
        this._body.appendChild(rBody);
        this._body.appendChild(rFoot);

      } else if (status === 'error') {
        const errEl = document.createElement('div');
        errEl.className   = `${NS}-error`;
        errEl.textContent = `⚠️ ${content}`;

        const retryBtn = this._btn('🔄 重试', () => this.onFetch?.(this.modelId, action || 'translate'), true);
        retryBtn.style.cssText = 'margin-top:8px; display:inline-flex;';

        this._body.appendChild(errEl);
        this._body.appendChild(retryBtn);
      }
    }

    _btn(label, onClick, ghost = false) {
      const btn = document.createElement('button');
      btn.className = `${NS}-btn${ghost ? ` ${NS}-btn--ghost` : ''}`;
      btn.textContent = label;
      if (onClick) btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      return btn;
    }

    _copyBtn(text) {
      const btn = this._btn('📋 复制', null, true);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text)
          .then(() => { btn.textContent = '✅ 已复制'; setTimeout(() => { btn.textContent = '📋 复制'; }, 1500); })
          .catch(() => { btn.textContent = '❌ 失败';  setTimeout(() => { btn.textContent = '📋 复制'; }, 1500); });
      });
      return btn;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  FloatingIcon — 划词后出现的悬浮小气泡图标
  // ═══════════════════════════════════════════════════════════════════════════

  class FloatingIcon {
    constructor() {
      this.el     = null;
      this.onOpen = null; // (pos: {x, y}) => void
    }

    show(x, y) {
      this.hide();
      this.el = document.createElement('div');
      this.el.id        = `${NS}-icon`;
      this.el.className = `${NS}-icon`;
      this.el.title     = '点击查询（翻译 / 解释）';
      this.el.innerHTML = SVG_CHAT;

      const pos = this._clamp(x + 12, y + 12);
      this.el.style.left = `${pos.left}px`;
      this.el.style.top  = `${pos.top}px`;

      this.el.addEventListener('click', (e) => {
        e.stopPropagation();
        const iconPos = { x, y };
        this.hide();
        this.onOpen?.(iconPos);
      });

      document.body.appendChild(this.el);
      requestAnimationFrame(() => this.el?.classList.add(`${NS}-icon--visible`));
    }

    hide() {
      this.el?.remove();
      this.el = null;
    }

    contains(target) {
      return !!this.el?.contains(target);
    }

    _clamp(x, y, w = 36, h = 36) {
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const sx = window.scrollX, sy = window.scrollY;
      return {
        left: Math.min(Math.max(x, sx + 8), sx + vw - w - 8),
        top:  Math.min(Math.max(y, sy + 8), sy + vh - h - 8),
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PanelManager — 面板完整生命周期（拖拽、Pin、堆叠卡片、API请求）
  // ═══════════════════════════════════════════════════════════════════════════

  class PanelManager {
    constructor(app) {
      this._app     = app;
      this.el       = null;
      this.isPinned = false;
      this._drag    = null;
      this._cards   = {};    // { deepseek: AccordionCard, qwen: AccordionCard }
      this._preview = null;
    }

    get isOpen() { return !!this.el; }

    /**
     * 打开面板。若面板已打开，更新文本并重新查询。
     * @param {string} text  选中文本
     * @param {{x:number,y:number}} pos  页面坐标
     */
    open(text, pos) {
      if (this.isOpen) {
        this._updateText(text);
        return;
      }

      this.el = this._build(text);
      const clamped = this._clamp(pos.x, pos.y);
      this.el.style.left = `${clamped.left}px`;
      this.el.style.top  = `${clamped.top}px`;

      document.body.appendChild(this.el);
      requestAnimationFrame(() => this.el?.classList.add(`${NS}-panel--visible`));

      // 根据偏好设置决定自动触发哪种操作
      const pref = this._app.config.get('preferredAction');
      this._fetchAll(pref && pref !== 'none' ? pref : 'translate');
    }

    close() {
      if (!this.el) return;
      this._drag?.destroy();
      this._drag    = null;
      this._cards   = {};
      this._preview = null;
      this.el.remove();
      this.el       = null;
      this.isPinned = false;
    }

    contains(target) {
      return !!this.el?.contains(target);
    }

    // ── DOM 构建 ────────────────────────────────────────────────────────────

    _build(text) {
      const panel = document.createElement('div');
      panel.id        = `${NS}-panel`;
      panel.className = `${NS}-panel`;

      panel.appendChild(this._buildHeader(text));
      panel.appendChild(this._buildActionBar());
      panel.appendChild(this._buildAccordionWrap());

      this._drag = new DragController(panel, panel.querySelector(`.${NS}-panel-header`));
      return panel;
    }

    _buildHeader(text) {
      const header = document.createElement('div');
      header.className = `${NS}-panel-header`;

      // Logo
      const logo = document.createElement('div');
      logo.className = `${NS}-panel-logo`;
      logo.innerHTML = SVG_CHAT;

      // 标题
      const title = document.createElement('span');
      title.className   = `${NS}-panel-title`;
      title.textContent = '划词助手';

      // 弹性间距
      const spacer = document.createElement('div');
      spacer.className = `${NS}-panel-spacer`;

      // 选中文本预览
      this._preview = document.createElement('span');
      this._preview.className   = `${NS}-preview`;
      this._preview.textContent = `"${this._truncate(text)}"`;

      // 📌 固定按钮
      const btnPin = document.createElement('button');
      btnPin.className = `${NS}-header-btn`;
      btnPin.title     = '固定面板（固定后点击外部不会关闭）';
      btnPin.innerHTML = SVG_PIN;
      btnPin.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isPinned = !this.isPinned;
        btnPin.classList.toggle(`${NS}-header-btn--active`, this.isPinned);
        btnPin.title = this.isPinned ? '已固定（再次点击取消）' : '固定面板';
      });

      // ❌ 关闭按钮
      const btnClose = document.createElement('button');
      btnClose.className = `${NS}-header-btn`;
      btnClose.title     = '关闭';
      btnClose.innerHTML = SVG_CLOSE;
      btnClose.addEventListener('click', (e) => { e.stopPropagation(); this.close(); });

      header.appendChild(logo);
      header.appendChild(title);
      header.appendChild(spacer);
      header.appendChild(this._preview);
      header.appendChild(btnPin);
      header.appendChild(btnClose);

      return header;
    }

    _buildActionBar() {
      const bar = document.createElement('div');
      bar.className = `${NS}-action-bar`;

      const btnTr = document.createElement('button');
      btnTr.className   = `${NS}-btn ${NS}-btn--sm`;
      btnTr.textContent = '🌐 翻译';
      btnTr.addEventListener('click', (e) => { e.stopPropagation(); this._fetchAll('translate'); });

      const btnEx = document.createElement('button');
      btnEx.className   = `${NS}-btn ${NS}-btn--sm ${NS}-btn--ghost`;
      btnEx.textContent = '📖 解释术语';
      btnEx.addEventListener('click', (e) => { e.stopPropagation(); this._fetchAll('explain'); });

      bar.appendChild(btnTr);
      bar.appendChild(btnEx);
      return bar;
    }

    _buildAccordionWrap() {
      const wrap = document.createElement('div');
      wrap.className = `${NS}-accordion-wrap`;

      const MODELS = [
        { id: 'deepseek', label: 'DeepSeek' },
        { id: 'qwen',     label: '通义千问' },
      ];

      MODELS.forEach(({ id, label }) => {
        const card      = new AccordionCard(id, label);
        card.onFetch    = (modelId, action) => this._fetchModel(modelId, action);
        this._cards[id] = card;
        wrap.appendChild(card.el);
      });

      return wrap;
    }

    // ── API 请求 ────────────────────────────────────────────────────────────

    _fetchAll(action) {
      Object.keys(this._cards).forEach((id) => this._fetchModel(id, action));
    }

    _fetchModel(modelId, action) {
      const card = this._cards[modelId];
      if (!card) return;

      card.setLoading(action);
      chrome.runtime.sendMessage(
        { action, text: this._app.selectedText, model: modelId },
        (response) => {
          if (!this.isOpen) return; // 面板已关闭，丢弃响应
          if (chrome.runtime.lastError) {
            card.setError(action, '无法连接扩展后台，请在 chrome://extensions 页面重新加载扩展。');
          } else if (response?.success) {
            card.setResult(action, response.result);
          } else {
            card.setError(action, response?.error ?? '请求失败，请稍后重试。');
          }
        }
      );
    }

    // ── 工具方法 ─────────────────────────────────────────────────────────────

    _updateText(text) {
      this._app.selectedText = text;
      if (this._preview) this._preview.textContent = `"${this._truncate(text)}"`;
      Object.values(this._cards).forEach((c) => c.reset());
      this._fetchAll('translate');
    }

    _clamp(x, y, w = 360, h = 420) {
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const sx = window.scrollX, sy = window.scrollY;
      let left = x, top = y + 8;
      if (left + w > sx + vw - 8) left = sx + vw - w - 8;
      if (left < sx + 8)          left = sx + 8;
      if (top  + h > sy + vh - 8) top  = y - h - 8;
      if (top  < sy + 8)          top  = sy + 8;
      return { left, top };
    }

    _truncate(text, len = 38) {
      return text.length > len ? `${text.slice(0, len)}…` : text;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SelectionManager — 全局事件监听、拦截器、触发器
  // ═══════════════════════════════════════════════════════════════════════════

  class SelectionManager {
    constructor(app) {
      this._app           = app;
      this._downOnIcon    = false;
      this._downOnPanel   = false;
      this._isDblClick    = false;
      this._dblTimer      = null;
      this._hoverTimer    = null;

      this._onDown   = this._onDown.bind(this);
      this._onUp     = this._onUp.bind(this);
      this._onClick  = this._onClick.bind(this);
      this._onDbl    = this._onDbl.bind(this);
      this._onKey    = this._onKey.bind(this);
      this._onScroll = this._onScroll.bind(this);
      this._onMove   = this._onMove.bind(this);

      document.addEventListener('mousedown', this._onDown);
      document.addEventListener('mouseup',   this._onUp);
      document.addEventListener('click',     this._onClick);
      document.addEventListener('dblclick',  this._onDbl);
      document.addEventListener('keydown',   this._onKey);
      document.addEventListener('mousemove', this._onMove, { passive: true });
      window.addEventListener('scroll',      this._onScroll, { passive: true });
    }

    // ── mousedown：记录 mousedown 是否落在 widget 上 ──────────────────────

    _onDown(e) {
      this._downOnIcon  = this._app.icon.contains(e.target);
      this._downOnPanel = this._app.panel.contains(e.target);
    }

    // ── mouseup：核心拦截器 + 触发器 ──────────────────────────────────────

    _onUp(e) {
      // 若 mousedown 落在小图标上，由图标自身的 click 处理，此处忽略
      if (this._downOnIcon) return;

      // 用 10ms 延迟等待浏览器更新 selection 对象
      const capturedE = {
        pageX: e.pageX, pageY: e.pageY,
        ctrlKey: e.ctrlKey, altKey: e.altKey,
        shiftKey: e.shiftKey, metaKey: e.metaKey,
      };

      setTimeout(() => {
        const sel  = window.getSelection();
        const text = sel?.toString().trim() ?? '';

        if (text.length < 1 || text.length > 500) {
          // 没有有效选中文本
          if (!this._app.panel.isOpen) this._app.icon.hide();
          return;
        }

        // ── 拦截器 1：输入框/代码编辑器检测 ──
        if (this._app.config.get('disableInInputs')) {
          const anchor = sel.anchorNode?.parentElement;
          if (InputBoxDetector.isInside(anchor)) return;
        }

        // ── 拦截器 2：语言匹配检测 ──
        const langCfg = this._app.config.get('languages');
        const strict  = this._app.config.get('strictLanguageMatch');
        if (!LanguageDetector.matches(text, langCfg, strict)) return;

        this._app.selectedText = text;

        // ── 判断场景 ──
        let scenario;
        if (this._downOnPanel) {
          scenario = 'insidePanel';
        } else if (this._app.panel.isOpen && this._app.panel.isPinned) {
          scenario = 'pinned';
        } else {
          scenario = 'normal';
        }

        // ── 触发器：根据场景+规则决策 ──
        const action = this._app.trigger.evaluate(scenario, capturedE, this._isDblClick);

        if (action === 'direct') {
          this._app.icon.hide();
          this._app.panel.open(text, { x: capturedE.pageX, y: capturedE.pageY });
        } else if (action === 'icon') {
          if (!this._app.panel.isOpen) {
            this._app.icon.show(capturedE.pageX, capturedE.pageY);
          }
        }
        // action === 'off' → 什么都不做
      }, 10);
    }

    // ── click：点击空白处关闭 ──────────────────────────────────────────────

    _onClick(e) {
      // 如果 mousedown 落在 widget 上（按钮点击），不关闭
      if (this._downOnIcon || this._downOnPanel) return;

      if (this._app.panel.isOpen && !this._app.panel.isPinned) {
        if (!this._app.panel.contains(e.target)) this._app.panel.close();
      }
      if (!this._app.icon.contains(e.target)) {
        this._app.icon.hide();
      }
    }

    // ── dblclick：标记双击状态 ────────────────────────────────────────────

    _onDbl() {
      this._isDblClick = true;
      clearTimeout(this._dblTimer);
      this._dblTimer = setTimeout(() => { this._isDblClick = false; }, 400);
    }

    // ── keydown：Esc 关闭 ─────────────────────────────────────────────────

    _onKey(e) {
      if (e.key === 'Escape') {
        this._app.icon.hide();
        this._app.panel.close();
      }
    }

    // ── scroll：滚动时关闭（不影响已钉住的面板）────────────────────────────

    _onScroll() {
      this._app.icon.hide();
      if (!this._app.panel.isPinned) this._app.panel.close();
    }

    // ── mousemove：悬浮取词（hover select） ──────────────────────────────

    _onMove(e) {
      if (!this._app.config.get('triggerRules.normal.hoverSelect')) return;
      if (this._app.panel.isOpen) return;

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
  //  ExtensionApp — 根节点，组合所有模块
  // ═══════════════════════════════════════════════════════════════════════════

  class ExtensionApp {
    constructor() {
      this.selectedText = '';
      this.config       = new ConfigManager();
      this.icon         = new FloatingIcon();
      this.panel        = new PanelManager(this);
      this.trigger      = null;
      this.selection    = null;

      this.icon.onOpen = (pos) => {
        this.panel.open(this.selectedText, pos);
      };
    }

    async init() {
      await this.config.load();
      this.trigger   = new TriggerEngine(this.config);
      this.selection = new SelectionManager(this);
      console.debug('[划词助手 v3] 初始化完成。');
    }
  }

  // ── 启动 ──────────────────────────────────────────────────────────────────
  const app = new ExtensionApp();
  app.init();

})();
