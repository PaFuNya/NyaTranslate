/**
 * content_panel.js — UI 渲染层
 *
 * 包含：AccordionCard（单模型折叠卡片）、FloatingIcon（悬浮气泡）、
 *       PanelInstance（单面板实例）、PanelManager（面板生命周期管理器）
 *
 * 依赖：NS、SVG_*、DEFAULT_CONFIG（content_utils.js）；
 *       DragController、ResizeController（content_drag.js）；
 *       NyaAppearance（appearance.js）
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  AccordionCard — 单个模型的折叠卡片（combined-only：翻译+解释一并呈现）
//
//  状态模型简化：每张卡只有一个聚合状态机。
//    idle    — 占位，刚渲染骨架时
//    loading — 等后台返回
//    result  — 已收到 Markdown 结果
//    error   — 失败（含 notConfigured / timeout / API err）
// ═══════════════════════════════════════════════════════════════════════════

class AccordionCard {
  /**
   * @param {string} modelRowId 模型行 id
   * @param {string} modelLabel 模型显示名
   * @param {{ word?: string }} [options] word 为当前划词原文(供收藏/朗读使用)
   */
  constructor(modelRowId, modelLabel, options = {}) {
    this.modelRowId = modelRowId;
    this.label = modelLabel;
    /** @type {string} 划词原文(词典卡片收藏/朗读用) */
    this._word = options.word || '';
    /** @type {{ status: 'idle'|'loading'|'result'|'error', content: string }} */
    this.state = { status: 'idle', content: '' };
    /** @type {((modelRowId: string) => void) | null} */
    this.onFetch = null;

    this._open = true;
    this._body = null;
    this._dot = null;
    this._chevron = null;
    this._badgeEl = null;
    this._cacheBadge = null;
    this.el = null;

    this._build();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = `${NS}-accordion`;

    const hdr = document.createElement('div');
    hdr.className = `${NS}-accordion-header`;

    const titleWrap = document.createElement('div');
    titleWrap.className = `${NS}-accordion-title`;

    const badge = document.createElement('span');
    badge.className = `${NS}-accordion-badge`;
    badge.textContent = this.label;
    this._badgeEl = badge;

    this._dot = document.createElement('span');
    this._dot.className = `${NS}-accordion-dot`;

    // "已缓存"小标签:仅当结果来自本地单词缓存/后台标记 cached 时显示
    this._cacheBadge = document.createElement('span');
    this._cacheBadge.className = `${NS}-cache-badge`;
    this._cacheBadge.textContent = '已缓存';
    this._cacheBadge.style.display = 'none';

    titleWrap.appendChild(badge);
    titleWrap.appendChild(this._dot);
    titleWrap.appendChild(this._cacheBadge);

    this._chevron = document.createElement('span');
    this._chevron.className = `${NS}-accordion-chevron ${NS}-accordion-chevron--up`;
    this._chevron.innerHTML = SVG_CHEVRON;

    hdr.appendChild(titleWrap);
    hdr.appendChild(this._chevron);
    hdr.addEventListener('click', () => this._toggle());

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

  setLabel(label) {
    if (!label) return;
    this.label = label;
    if (this._badgeEl) this._badgeEl.textContent = label;
  }

  setLoading() {
    this.state = { status: 'loading', content: '' };
    this._updateDot();
    this.forceOpen();
    this._renderBody();
  }

  setResult(content) {
    this.state = { status: 'result', content: content || '' };
    this._updateDot();
    this._renderBody();
  }

  setError(message) {
    this.state = { status: 'error', content: message || '请求失败' };
    this._updateDot();
    this._renderBody();
  }

  /** 控制"已缓存"小标签显隐(本地单词缓存或后台 cached 回执) */
  setCached(isCached) {
    if (this._cacheBadge) {
      this._cacheBadge.style.display = isCached ? '' : 'none';
    }
  }

  _updateDot() {
    const cls = `${NS}-accordion-dot`;
    switch (this.state.status) {
      case 'loading':
        this._dot.className = `${cls} ${cls}--loading`;
        break;
      case 'error':
        this._dot.className = `${cls} ${cls}--error`;
        break;
      case 'result':
        this._dot.className = `${cls} ${cls}--success`;
        break;
      default:
        this._dot.className = cls;
    }
  }

  _renderBody() {
    this._body.innerHTML = '';
    const { status, content } = this.state;

    if (status === 'idle') {
      // 按需加载:idle 卡显示"点击查询"文案与查询按钮,点击后走单卡请求
      const hint = document.createElement('p');
      hint.className = `${NS}-hint`;
      hint.textContent = '点击查询';
      this._body.appendChild(hint);

      const queryBtn = this._btn('查询', () => {
        this.onFetch?.(this.modelRowId);
      }, true);
      queryBtn.classList.add(`${NS}-btn--sm`, `${NS}-btn--query`);
      queryBtn.style.cssText = 'margin:0 10px 12px; display:inline-flex;';
      this._body.appendChild(queryBtn);
      return;
    }
    if (status === 'loading') {
      this._body.appendChild(this._buildLoader());
      return;
    }

    if (status === 'error') {
      const err = document.createElement('div');
      err.className = `${NS}-error`;
      err.style.cssText = 'margin:10px;';
      err.textContent = content;
      this._body.appendChild(err);

      const retryBtn = this._btn('重试', () => {
        this.onFetch?.(this.modelRowId);
      }, true);
      retryBtn.classList.add(`${NS}-btn--sm`);
      retryBtn.style.cssText = 'margin:0 10px 12px; display:inline-flex;';
      this._body.appendChild(retryBtn);
      return;
    }

    if (status === 'result') {
      this._renderDictionarySections(content);
    }
  }

  _renderCombinedSections(content) {
    const sectionRe = /^###\s+(.+)$/m;
    const parts = content.split(/(?=^###\s+)/m).filter((s) => s.trim());

    if (parts.length === 0) {
      const section = document.createElement('div');
      section.className = `${NS}-combined-section`;
      const body = document.createElement('div');
      body.className = `${NS}-result-body`;
      body.textContent = content;
      const footer = document.createElement('div');
      footer.className = `${NS}-result-footer`;
      footer.style.cssText = 'padding:0 10px 10px;';
      footer.appendChild(this._copyBtn(content));
      section.appendChild(body);
      section.appendChild(footer);
      this._body.appendChild(section);
      return;
    }

    parts.forEach((part, idx) => {
      const match = part.match(sectionRe);
      const rawTitle = match ? match[1].trim() : '';
      const bodyText = part.replace(sectionRe, '').trim();

      if (idx > 0) {
        const divider = document.createElement('div');
        divider.className = `${NS}-combined-divider`;
        this._body.appendChild(divider);
      }

      const section = document.createElement('div');
      section.className = `${NS}-combined-section`;

      if (rawTitle) {
        const label = document.createElement('div');
        label.className = `${NS}-combined-label`;
        label.textContent = rawTitle;
        section.appendChild(label);
      }

      const body = document.createElement('div');
      body.className = `${NS}-result-body`;
      body.textContent = bodyText;
      section.appendChild(body);

      const footer = document.createElement('div');
      footer.className = `${NS}-result-footer`;
      footer.style.cssText = 'padding:0 0 6px;';
      footer.appendChild(this._copyBtn(bodyText));
      section.appendChild(footer);

      this._body.appendChild(section);
    });
  }

  _renderDictionarySections(content) {
    const sectionRe = /^###\s+(.+)$/m;
    const parts = content.split(/(?=^###\s+)/m).filter((s) => s.trim());

    if (parts.length === 0) {
      this._renderCombinedSections(content);
      return;
    }

    parts.forEach((part, idx) => {
      const match = part.match(sectionRe);
      const rawTitle = match ? match[1].trim() : '';
      const bodyText = part.replace(sectionRe, '').trim();

      if (idx > 0) {
        const divider = document.createElement('div');
        divider.className = `${NS}-combined-divider`;
        this._body.appendChild(divider);
      }

      const section = document.createElement('div');
      section.className = `${NS}-combined-section`;

      if (rawTitle) {
        const label = document.createElement('div');
        label.className = `${NS}-combined-label`;
        label.textContent = rawTitle;
        section.appendChild(label);
      }

      const body = document.createElement('div');
      body.className = `${NS}-result-body ${NS}-dict-body`;
      body.innerHTML = this._formatDictionaryContent(bodyText);
      section.appendChild(body);

      const footer = document.createElement('div');
      footer.className = `${NS}-result-footer`;
      footer.style.cssText = 'padding:0 0 6px;';
      footer.appendChild(this._favoriteBtn(bodyText));
      footer.appendChild(this._speakBtn());
      footer.appendChild(this._copyBtn(bodyText));
      section.appendChild(footer);

      this._body.appendChild(section);
    });
  }

  /**
   * 词典内容格式化(安全版):
   * 先归一化 CRLF 并做 HTML 转义,再执行受控的 **加粗** 与换行替换——
   * 任何 LLM 输出中的原始 HTML 都会被转义为纯文本,不可能注入面板 DOM
   */
  _formatDictionaryContent(text) {
    const escaped = this._escapeHtml(text.replace(/\r\n|\r/g, '\n'));
    return escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong class="dict-label">$1</strong>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  _escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 收藏按钮:发消息给后台写入生词本,成功后文案变为"已收藏" */
  _favoriteBtn(result) {
    const btn = this._btn('收藏', null, true);
    btn.classList.add(`${NS}-btn--sm`);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.dataset.saved) return;
      chrome.runtime.sendMessage(
        { action: 'nya-wordbook-add', word: this._word, result },
        (resp) => {
          if (chrome.runtime.lastError || !resp || resp.success !== true) return;
          btn.dataset.saved = '1';
          btn.textContent = '已收藏';
        }
      );
    });
    return btn;
  }

  /** 朗读按钮:用 speechSynthesis 朗读原文单词,失败静默 */
  _speakBtn() {
    const btn = this._btn('朗读', null, true);
    btn.classList.add(`${NS}-btn--sm`);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        const word = this._word;
        if (!word || typeof speechSynthesis === 'undefined') return;
        const u = new SpeechSynthesisUtterance(word);
        u.lang = 'en-US';
        speechSynthesis.speak(u);
      } catch (err) {
        /* 无语音可用时静默失败 */
      }
    });
    return btn;
  }

  _buildLoader() {
    const loader = document.createElement('div');
    loader.className = `${NS}-loading`;

    const spinner = document.createElement('div');
    spinner.className = `${NS}-spinner`;

    const txt = document.createElement('span');
    txt.className = `${NS}-loading-text`;
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
    return loader;
  }

  _btn(label, onClick, ghost = false) {
    const btn = document.createElement('button');
    btn.className = `${NS}-btn${ghost ? ` ${NS}-btn--ghost` : ''}`;
    btn.textContent = label;
    if (onClick) btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }

  _copyBtn(text) {
    const btn = this._btn('复制', null, true);
    btn.classList.add(`${NS}-btn--sm`);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text)
        .then(() => { btn.textContent = '已复制'; setTimeout(() => { btn.textContent = '复制'; }, 1500); })
        .catch(() => { btn.textContent = '复制失败'; setTimeout(() => { btn.textContent = '复制'; }, 1500); });
    });
    return btn;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  FloatingIcon — 划词后出现的悬浮小气泡图标
// ═══════════════════════════════════════════════════════════════════════════

class FloatingIcon {
  constructor() {
    this.el = null;
    this.onOpen = null;
    /** @type {() => Record<string, unknown>} */
    this._getConfigData = null;
  }

  show(x, y) {
    this.hide();
    this.el = document.createElement('div');
    this.el.id = `${NS}-icon`;
    this.el.className = `${NS}-icon`;
    this.el.title = '点击查询（翻译 / 解释）';
    this.el.innerHTML = SVG_CHAT;

    const pos = this._clamp(x + 12, y + 12);
    this.el.style.left = `${pos.left}px`;
    this.el.style.top = `${pos.top}px`;

    if (typeof this._getConfigData === 'function') {
      NyaAppearance.applyToContentRoot(
        this.el,
        NyaAppearance.mergeAppearance({ appearance: this._getConfigData().appearance })
      );
    }

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
      top: Math.min(Math.max(y, sy + 8), sy + vh - h - 8),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PanelInstance — 单个面板实例
//  三种状态：
//    'unpinned'     — 默认态，点击空白处销毁
//    'screen-pinned' — 屏幕固定（单例），position: fixed，不随滚动
//    'page-pinned'   — 便利贴固定（多例），position: absolute，随滚动
// ═══════════════════════════════════════════════════════════════════════════

class PanelInstance {
  constructor(panelManager, config, id = `panel-${Date.now()}-${Math.random().toString(36).slice(2)}`) {
    this._panelManager = panelManager;
    this._config = config;
    this.id = id;
    this.el = null;
    this.pinMode = 'unpinned';
    this._drag = null;
    this._resize = null;
    /** @type {Map<string, AccordionCard>} key: modelRowId */
    this._cards = new Map();
    this._wrapEl = null;
    this._preview = null;
    this._pinDropdown = null;
    this._pinDropdownAbort = null;
    this._selectedText = '';
    this._currentRequestId = '';
    this._msgListener = null;
    /** 关闭竞态标记:close() 立即置位,路由/contains 跳过该面板,cleanup 时清除 */
    this._closing = false;
    /** 批级超时兜底计时器(发请求 45s 后仍未收齐回执则置错误态) */
    this._batchTimer = null;
    /** 当前批次 + 单卡重试的 requestId 集合,回执只匹配集合内的请求 */
    this._activeRequestIds = new Set();
    /** 在途单卡重试的 modelRowId 集合:批级 done 回执不得误伤这些卡的 loading 态 */
    this._pendingSingleCards = new Set();
  }

  get isPinned() { return this.pinMode !== 'unpinned'; }
  get isOpen() { return !!this.el && !!this.el.isConnected; }

  open(text, pos, opts = {}) {
    if (this.isOpen) {
      this.updateContent(text);
      return;
    }
    if (this._closing) return;

    this._selectedText = text;
    this.el = this._build(text);
    const clamped = this._clamp(pos.x, pos.y);
    this.el.style.left = `${clamped.left}px`;
    this.el.style.top = `${clamped.top}px`;

    document.body.appendChild(this.el);
    this._attachMessageListener();
    requestAnimationFrame(() => this.el?.classList.add(`${NS}-panel--visible`));

    // 外部批次(如右键翻译)已接管请求,跳过自动派发
    if (opts.skipAutoQuery) return;

    // 单词缓存命中:直接以缓存结果渲染,不发请求
    if (this._consumeWordCache(text)) return;

    const pref = this._config.get('preferredAction');
    if (pref && pref !== 'none') {
      this._dispatchMulti();
    }
  }

  close() {
    if (this._closing) return;
    this._closing = true;
    if (!this.el) return;

    if (this._msgListener) {
      chrome.runtime.onMessage.removeListener(this._msgListener);
      this._msgListener = null;
    }

    clearTimeout(this._batchTimer);
    this._batchTimer = null;
    this._activeRequestIds.clear();

    const el = this.el;
    this.el = null;

    this._pinDropdownAbort?.abort();
    this._pinDropdownAbort = null;

    if (this._drag) {
      this._drag.destroy();
      this._drag = null;
    }
    if (this._resize) {
      this._resize.destroy();
      this._resize = null;
    }

    el.classList.remove(`${NS}-panel--visible`);

    const cleanup = () => {
      el.remove();
      // 淡出动画结束,解除关闭标记并通知管理器注销
      this._closing = false;
      this._panelManager?.onPanelClosed(this.id);
    };

    const timer = setTimeout(cleanup, 220);
    el.addEventListener('transitionend', () => {
      clearTimeout(timer);
      cleanup();
    }, { once: true });
  }

  contains(target) {
    return !!this.el?.contains(target);
  }

  updateContent(text) {
    if (this._closing) return;
    // 内容已切换:旧批次回执与超时兜底全部作废,防止迟到结果污染新卡片
    this._activeRequestIds.clear();
    clearTimeout(this._batchTimer);
    this._batchTimer = null;
    this._currentRequestId = '';

    this._selectedText = text;
    if (this._preview) this._preview.textContent = `"${this._truncate(text)}"`;
    this._renderSkeletonCards();

    if (this.el) {
      this.el.classList.add(`${NS}-panel--flash`);
      setTimeout(() => this.el?.classList.remove(`${NS}-panel--flash`), 600);
    }

    // 单词缓存命中:直接以缓存结果渲染,不发请求
    if (this._consumeWordCache(text)) return;

    const pref = this._config.get('preferredAction');
    if (pref && pref !== 'none') {
      this._dispatchMulti();
    }
  }

  _build(text) {
    const panel = document.createElement('div');
    panel.id = `${NS}-panel-${this.id}`;
    panel.className = `${NS}-panel`;
    panel.dataset.status = this.pinMode;

    panel.appendChild(this._buildHeader(text));
    panel.appendChild(this._buildActionBar());
    panel.appendChild(this._buildAccordionWrap());
    panel.appendChild(this._buildResizeHandle());

    NyaAppearance.applyToContentRoot(
      panel,
      NyaAppearance.mergeAppearance({ appearance: this._config.get('appearance') })
    );

    // 防御式事件拦截：面板内任何点击都不得冒泡到 document，
    // 避免 SelectionManager 的 closeUnpinned 把面板误销毁；
    // 仅 stopPropagation，不 preventDefault，否则按钮、文本选择全瘫。
    ['mousedown', 'mouseup', 'click'].forEach((evt) => {
      panel.addEventListener(evt, (e) => { e.stopPropagation(); }, false);
    });

    this._drag = new DragController(panel, panel.querySelector(`.${NS}-panel-header`), () => this._onDragEnd());
    this._resize = new ResizeController(panel, panel.querySelector(`.${NS}-resize-handle`), {
      minWidth: 300,
      minHeight: 200,
    });

    return panel;
  }

  _buildHeader(text) {
    const header = document.createElement('div');
    header.className = `${NS}-panel-header`;

    const logo = document.createElement('div');
    logo.className = `${NS}-panel-logo`;
    logo.innerHTML = SVG_CHAT;

    const title = document.createElement('span');
    title.className = `${NS}-panel-title`;
    title.textContent = 'NyaTranslate';

    const spacer = document.createElement('div');
    spacer.className = `${NS}-panel-spacer`;

    this._preview = document.createElement('span');
    this._preview.className = `${NS}-preview`;
    this._preview.textContent = `"${this._truncate(text)}"`;

    const pinContainer = document.createElement('div');
    pinContainer.className = `${NS}-pin-container`;

    const btnPin = document.createElement('button');
    btnPin.className = `${NS}-header-btn`;
    btnPin.title = '固定面板';
    btnPin.innerHTML = SVG_PIN;

    const dropdown = document.createElement('div');
    dropdown.className = `${NS}-pin-dropdown`;
    dropdown.style.display = 'none';

    const optionUnpin = document.createElement('button');
    optionUnpin.className = `${NS}-pin-option ${NS}-pin-option--danger`;
    optionUnpin.innerHTML = `${SVG_CLOSE.replace('width="13" height="13"', 'width="12" height="12"')}<span class="${NS}-pin-option-label">取消固定</span>`;
    optionUnpin.addEventListener('click', (e) => {
      e.stopPropagation();
      this._setPinMode('unpinned');
      dropdown.style.display = 'none';
    });

    const optionScreen = document.createElement('button');
    optionScreen.className = `${NS}-pin-option`;
    optionScreen.innerHTML = `${SVG_SCREEN}<span class="${NS}-pin-option-label">固定在屏幕（常驻翻译）</span>`;
    optionScreen.addEventListener('click', (e) => {
      e.stopPropagation();
      this._setPinMode('screen-pinned');
      dropdown.style.display = 'none';
    });

    const optionPage = document.createElement('button');
    optionPage.className = `${NS}-pin-option`;
    optionPage.innerHTML = `${SVG_NOTE}<span class="${NS}-pin-option-label">固定在页面（便利贴）</span>`;
    optionPage.addEventListener('click', (e) => {
      e.stopPropagation();
      this._setPinMode('page-pinned');
      dropdown.style.display = 'none';
    });

    dropdown.appendChild(optionUnpin);
    dropdown.appendChild(optionScreen);
    dropdown.appendChild(optionPage);

    btnPin.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });

    const ac = new AbortController();
    this._pinDropdownAbort = ac;
    // 捕获阶段注册:面板内点击会 stopPropagation(冒泡阶段),普通监听收不到面板内
    // 的点击,捕获阶段先于面板拦截执行,保证"点击面板内任意位置也关闭下拉"
    document.addEventListener('click', (e) => {
      if (!pinContainer.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    }, { signal: ac.signal, capture: true });

    pinContainer.appendChild(btnPin);
    pinContainer.appendChild(dropdown);
    this._pinDropdown = dropdown;

    const btnClose = document.createElement('button');
    btnClose.className = `${NS}-header-btn`;
    btnClose.title = '关闭';
    btnClose.innerHTML = SVG_CLOSE;
    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });

    header.appendChild(logo);
    header.appendChild(title);
    header.appendChild(spacer);
    header.appendChild(this._preview);
    header.appendChild(pinContainer);
    header.appendChild(btnClose);

    return header;
  }

  _buildActionBar() {
    const bar = document.createElement('div');
    bar.className = `${NS}-action-bar`;
    return bar;
  }

  _buildAccordionWrap() {
    const wrap = document.createElement('div');
    wrap.className = `${NS}-accordion-wrap`;
    this._wrapEl = wrap;
    this._renderSkeletonCards();
    return wrap;
  }

  /**
   * 按当前 enabled 模型列表为面板生成 N 张骨架卡（一卡一模型）。
   * 每次划新词或配置变更时整体重建，确保卡片列表与 enabled 模型严格一致。
   */
  _renderSkeletonCards() {
    if (!this._wrapEl) return;
    this._wrapEl.innerHTML = '';
    this._cards.clear();

    const enabled = this._getEnabledModels();
    if (enabled.length === 0) {
      const hint = document.createElement('div');
      hint.className = `${NS}-hint`;
      hint.style.cssText = 'padding:18px 14px;text-align:center;line-height:1.7;';
      hint.textContent = '尚未启用任何模型，请前往设置页配置后再试 ~';
      this._wrapEl.appendChild(hint);
      return;
    }

    enabled.forEach((m) => {
      const label = m.displayName || m.modelId || m.id;
      const card = new AccordionCard(m.id, label, { word: this._selectedText });
      card.onFetch = (modelRowId) => this._retryOne(modelRowId);
      this._cards.set(m.id, card);
      this._wrapEl.appendChild(card.el);
    });
  }

  _buildResizeHandle() {
    const handle = document.createElement('div');
    handle.className = `${NS}-resize-handle`;
    handle.innerHTML = SVG_RESIZE;
    handle.title = '拖拽缩放面板';
    return handle;
  }

  _setPinMode(mode) {
    const oldMode = this.pinMode;
    this.pinMode = mode;

    if (this.el) {
      this.el.dataset.status = mode;
    }

    const btnPin = this.el?.querySelector(`.${NS}-header-btn`);
    if (btnPin) {
      btnPin.classList.toggle(`${NS}-header-btn--active`, mode !== 'unpinned');
      if (mode === 'screen-pinned') {
        btnPin.title = '固定在屏幕（常驻翻译）';
      } else if (mode === 'page-pinned') {
        btnPin.title = '固定在页面（便利贴）';
      } else {
        btnPin.title = '固定面板';
      }
    }

    if (mode === 'screen-pinned') {
      this._applyScreenPinned();
    } else if (mode === 'page-pinned') {
      this._applyPagePinned();
    } else {
      this._applyUnpinned(oldMode);
    }

    if (this._panelManager) {
      if (mode !== 'unpinned' && oldMode === 'unpinned') {
        this._panelManager.onPanelPinned(this.id, mode);
      } else if (mode === 'unpinned' && oldMode !== 'unpinned') {
        this._panelManager.onPanelUnpinned(this.id);
      } else if (oldMode !== 'unpinned' && mode !== 'unpinned' && oldMode !== mode) {
        this._panelManager.onPinModeChanged(this.id, oldMode, mode);
      }
    }
  }

  _applyScreenPinned() {
    if (!this.el) return;
    const rect = this.el.getBoundingClientRect();
    this.el.style.position = 'fixed';
    this.el.style.top = `${rect.top}px`;
    this.el.style.left = `${rect.left}px`;
  }

  _applyPagePinned() {
    if (!this.el) return;
    const rect = this.el.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    this.el.style.position = 'absolute';
    this.el.style.left = `${rect.left + scrollX}px`;
    this.el.style.top = `${rect.top + scrollY}px`;
  }

  _applyUnpinned(oldMode) {
    if (!this.el) return;
    const rect = this.el.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    this.el.style.position = 'absolute';
    this.el.style.left = `${rect.left + scrollX}px`;
    this.el.style.top = `${rect.top + scrollY}px`;
  }

  _onDragEnd() {
    // 拖拽结束后无需特殊处理，位置已由 DragController 更新
  }

  _normalizeModelRow(m) {
    if (!m) return null;
    if (m.modelId != null && (m.protocol === 'openai' || m.protocol === 'anthropic')) {
      return {
        ...m,
        displayName: m.displayName || m.modelId,
        modelId: m.modelId,
        protocol: m.protocol,
        preferred: m.preferred === true,
      };
    }
    const pid = String(m.id || '').trim();
    if (!pid) return null;
    return {
      id: pid,
      modelId: pid,
      displayName: pid,
      protocol: m.provider === 'anthropic' ? 'anthropic' : 'openai',
      enabled: m.enabled !== false,
      preferred: false,
    };
  }

  _getEnabledModels() {
    const models = this._config.get('models');
    if (!Array.isArray(models)) return [];
    const rows = models
      .map((m) => this._normalizeModelRow(m))
      .filter((m) => m && m.enabled);
    // 首选模型排到最前:面板打开时自动请求的"第一个 enabled 模型"即首选
    rows.sort((a, b) => (b.preferred === true ? 1 : 0) - (a.preferred === true ? 1 : 0));
    return rows;
  }

  /**
   * 多引擎调度入口(首选模型 + 按需加载):
   *   1. 生成新 requestId,替换当前活跃请求集合(旧批次回执一律丢弃)
   *   2. 仅对第一个 enabled 模型自动发请求(nya-multi-translate 带 onlyModelId),
   *      其余卡片保持 idle 态"点击查询",点击后走单卡请求
   *   3. 附带 per-request 意图 type(preferredAction 映射),后台按 type 构建 prompt
   *   4. 批级超时兜底:45s 后仍未收到回执的 loading 卡置为"响应超时"错误态
   */
  _dispatchMulti() {
    const text = this._selectedText;
    if (!text) return;
    if (this._cards.size === 0) return;

    const enabled = this._getEnabledModels();
    const first = enabled[0];
    if (!first) return;

    const requestId = this._genRequestId();
    this._currentRequestId = requestId;
    this._activeRequestIds = new Set([requestId]);

    const firstCard = this._cards.get(first.id);
    if (firstCard) firstCard.setLoading();

    chrome.runtime.sendMessage(
      {
        action: 'nya-multi-translate',
        text,
        requestId,
        type: this._preferredType(),
        onlyModelId: first.id,
      },
      () => {
        if (!this.isOpen || this._closing) return;
        if (chrome.runtime.lastError) {
          this._cards.forEach((c) => c.setError(
            '无法连接扩展后台，请在 chrome://extensions 页面重新加载扩展。'
          ));
        }
      }
    );

    // 批级超时兜底:45s 未收齐回执时,把仍 loading 的卡置为可重试错误态
    clearTimeout(this._batchTimer);
    this._batchTimer = setTimeout(() => {
      this._batchTimer = null;
      if (this._closing || !this.isOpen) return;
      this._cards.forEach((c) => {
        if (c.state.status === 'loading') c.setError('响应超时，请点击重试');
      });
    }, 45000);
  }

  /** preferredAction → 请求意图 type(后台按此构建 prompt) */
  _preferredType() {
    const pref = this._config.get('preferredAction');
    return pref === 'translate' || pref === 'explain' || pref === 'combined' ? pref : 'combined';
  }

  /**
   * 单卡片请求(重试 / idle 卡"查询"按钮共用):
   * 使用独立的新 requestId 发送 nya-translate-single,
   * 与批次 requestId 彻底分离,回执按 modelRowId + requestId 精确匹配。
   */
  _retryOne(modelRowId) {
    const card = this._cards.get(modelRowId);
    if (!card) return;
    const text = this._selectedText;
    if (!text) return;

    const requestId = this._genRequestId();
    this._activeRequestIds.add(requestId);
    this._pendingSingleCards.add(modelRowId);

    card.setLoading();
    chrome.runtime.sendMessage(
      { action: 'nya-translate-single', text, requestId, modelRowId, type: this._preferredType() },
      () => {
        if (!this.isOpen || this._closing) return;
        if (chrome.runtime.lastError) {
          this._pendingSingleCards.delete(modelRowId);
          card.setError('无法连接扩展后台，请在 chrome://extensions 重新加载扩展。');
        }
      }
    );

    // 单卡请求同样有 45s 兜底:后台 30s 超时 + 1 次重试的最坏约 61s,
    // 但 SW 终止等场景可能永久无回执,这里兜底后卡片可重试
    const tid = setTimeout(() => {
      this._pendingSingleCards.delete(modelRowId);
      if (this._closing || !this.isOpen) return;
      if (card.state.status === 'loading') card.setError('响应超时，请点击重试');
    }, 45000);
    // 单卡计时器与卡片绑定:卡片收到结果/错误时由 setResult/setError 之外统一清理太复杂,
    // 这里仅保证最坏情况有兜底;正常回执到达后该计时器最迟 45s 后空转一次,无副作用
    card._singleTimeoutId = tid;
  }

  /**
   * 右键「翻译所选文字」路径:background 已发起批次,面板只需采纳其 requestId
   * 并把所有卡片置为 loading,让回执直接流入(不再重复发请求)。
   */
  adoptExternalRequest(text, requestId) {
    if (this._closing || !this.isOpen) return;
    this._selectedText = text;
    if (this._preview) this._preview.textContent = `"${this._truncate(text)}"`;

    // 重建骨架卡:让每张卡的 _word 指向右键选中的原文(收藏/朗读用),
    // 否则卡片持有上一轮划词的旧词,收藏会保存错误内容
    this._renderSkeletonCards();

    this._currentRequestId = String(requestId || this._genRequestId());
    this._activeRequestIds = new Set([this._currentRequestId]);
    this._cards.forEach((card) => card.setLoading());

    // 批级超时兜底与自派发批次一致
    clearTimeout(this._batchTimer);
    this._batchTimer = setTimeout(() => {
      this._batchTimer = null;
      if (this._closing || !this.isOpen) return;
      this._cards.forEach((c) => {
        if (c.state.status === 'loading') c.setError('响应超时，请点击重试');
      });
    }, 45000);
  }

  /**
   * 监听后台精准回执:
   *   - 只接受 requestId 在活跃集合内的消息(旧批次/旧重试的迟到结果被丢弃)
   *   - nya-multi-result:成功结果(cached:true 时显示"已缓存"标签)或错误
   *   - nya-multi-done:批级完成回执,仍 loading 的卡置"未返回结果"错误态
   *   - nya-multi-empty:无 enabled 模型兜底
   */
  _attachMessageListener() {
    if (this._msgListener) return;

    this._msgListener = (msg) => {
      if (!this.isOpen || this._closing) return;
      if (!msg || typeof msg !== 'object') return;

      if (msg.action === 'nya-multi-result' && this._activeRequestIds.has(msg.requestId)) {
        const card = this._cards.get(msg.modelRowId);
        if (!card) return;
        // 单卡重试回执到达:清理在途标记与兜底计时器
        if (this._pendingSingleCards.has(msg.modelRowId)) {
          this._pendingSingleCards.delete(msg.modelRowId);
          if (card._singleTimeoutId) {
            clearTimeout(card._singleTimeoutId);
            card._singleTimeoutId = null;
          }
        }
        if (msg.label) card.setLabel(msg.label);
        if (msg.status === 'success') {
          card.setResult(msg.result || '');
          card.setCached(!!msg.cached);
        } else {
          card.setError(msg.error || '请求失败');
        }
        return;
      }

      if (msg.action === 'nya-multi-done' && this._activeRequestIds.has(msg.requestId)) {
        // 批级完成:仅把"本批次"仍未收到结果的 loading 卡置为可重试错误;
        // 跳过有在途单卡重试(_pendingSingleCards)的卡,避免误伤其 loading 态
        clearTimeout(this._batchTimer);
        this._batchTimer = null;
        this._cards.forEach((c) => {
          if (c.state.status === 'loading' && !this._pendingSingleCards.has(c.modelRowId)) {
            c.setError('未返回结果，点击重试');
          }
        });
        return;
      }

      if (msg.action === 'nya-multi-empty' && this._activeRequestIds.has(msg.requestId)) {
        // 后台告知没有 enabled 模型——卡片已为空，但为冗余兜底
        this._cards.forEach((c) => c.setError(msg.error || '没有启用的模型'));
      }
    };

    chrome.runtime.onMessage.addListener(this._msgListener);
  }

  /**
   * 单词缓存消费:单英文词划词且本地 wordCache 命中(同词)时,
   * 所有卡片直接以缓存结果渲染(带"已缓存"标签),不发任何请求。
   * @returns {boolean} 是否命中缓存并渲染
   */
  _consumeWordCache(text) {
    if (!/^[a-zA-Z'-]+$/.test(text)) return false;
    if (!this._config.get('wordDetailEnabled')) return false;
    const cached = this._getCachedWordResult(text);
    if (cached == null) return false;

    const content = typeof cached === 'string' ? cached : (cached?.result || '');
    if (!content) return false;

    this._cards.forEach((card) => {
      card.setResult(content);
      card.setCached(true);
    });
    return true;
  }

  /**
   * 从 wordCache 中按小写单词取缓存条目。
   * background 持久化为 [[word, entry], ...] 数组(MV3 storage 不能存 Map),
   * 同时兼容对象形态(历史版本 / 手动写入)。
   */
  _getCachedWordResult(text) {
    const wc = this._config.get('wordCache');
    if (!wc || typeof wc !== 'object') return null;
    const key = text.toLowerCase();

    if (Array.isArray(wc)) {
      const pair = wc.find((item) =>
        Array.isArray(item) && item.length >= 2 &&
        String(item[0]).toLowerCase() === key && item[1]);
      return pair ? pair[1] : null;
    }

    const entry = wc[key];
    return entry == null ? null : entry;
  }

  _genRequestId() {
    return (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `r-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  _clamp(x, y, w = 360, h = 420) {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const sx = window.scrollX, sy = window.scrollY;
    // 视口小于面板尺寸时先收窄面板(高度 cap 到 vh-16),保证面板不超出视口、
    // 内容由内部 accordion-wrap 滚动兜底
    if (w > vw - 16) w = vw - 16;
    if (h > vh - 16) h = vh - 16;
    let left = x, top = y + 8;
    if (left + w > sx + vw - 8) left = sx + vw - w - 8;
    if (left < sx + 8) left = sx + 8;
    if (top + h > sy + vh - 8) top = y - h - 8;
    if (top < sy + 8) top = sy + 8;
    return { left, top };
  }

  _truncate(text, len = 38) {
    return text.length > len ? `${text.slice(0, len)}…` : text;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PanelManager — 面板实例管理器（单例）
//  职责：
//    1. 管理所有面板实例的生命周期
//    2. 保证 screen-pinned 模式全局单例
//    3. 提供路由查询接口：getScreenPinnedPanel()
// ═══════════════════════════════════════════════════════════════════════════

class PanelManager {
  constructor(config) {
    this._config = config;
    this._panels = new Map();
    this._activePanel = null;
    this._screenPinnedPanelId = null;
    this._pagePinnedPanelIds = new Set();
  }

  get activePanel() {
    return this._activePanel;
  }

  get screenPinnedPanel() {
    if (!this._screenPinnedPanelId) return null;
    const panel = this._panels.get(this._screenPinnedPanelId);
    // 关闭中(含已脱管)的面板不参与路由
    return panel && !panel._closing ? panel : null;
  }

  get pagePinnedPanels() {
    return Array.from(this._pagePinnedPanelIds)
      .map(id => this._panels.get(id))
      .filter((p) => p && !p._closing);
  }

  get allPanels() {
    return Array.from(this._panels.values());
  }

  hasScreenPinnedPanel() {
    return !!this.screenPinnedPanel;
  }

  createPanel(text, position, mode = 'unpinned', opts = {}) {
    if (mode === 'screen-pinned' && this.hasScreenPinnedPanel()) {
      console.warn('[PanelManager] screen-pinned 已存在，拒绝创建新实例');
      return this.screenPinnedPanel;
    }

    if (mode === 'unpinned' && this._activePanel) {
      this._activePanel.close();
    }

    const panel = new PanelInstance(this, this._config);
    panel._selectedText = text;
    this._panels.set(panel.id, panel);

    if (mode === 'unpinned') {
      this._activePanel = panel;
    } else if (mode === 'screen-pinned') {
      this._screenPinnedPanelId = panel.id;
    } else if (mode === 'page-pinned') {
      this._pagePinnedPanelIds.add(panel.id);
    }

    panel.open(text, position, opts);
    return panel;
  }

  routeToScreenPinned(text) {
    const panel = this.screenPinnedPanel;
    if (!panel) return null;
    panel.updateContent(text);
    return panel;
  }

  /** 路由到最近使用的 page-pinned(便利贴)面板并更新其内容;无则返回 null */
  routeToPagePinned(text) {
    const panels = this.pagePinnedPanels;
    if (panels.length === 0) return null;
    // Set 顺序即"最近使用"顺序:取最后一个,并把它移到末尾刷新最近性
    const panel = panels[panels.length - 1];
    this._pagePinnedPanelIds.delete(panel.id);
    this._pagePinnedPanelIds.add(panel.id);
    panel.updateContent(text);
    return panel;
  }

  /**
   * SPA 幽灵面板清理:检查所有面板 el 是否仍在文档中,
   * 脱管(DOM 被 Turbo/Pjax 式 body 替换移除)的面板直接从管理器注销;
   * 全部脱管时重置整体状态,避免后续路由继续向不可见 DOM 发请求。
   */
  sweepDetached() {
    for (const [id, panel] of Array.from(this._panels.entries())) {
      if (!panel.el || !panel.el.isConnected) {
        this._removePanel(id);
      }
    }
    if (this._panels.size === 0) {
      this._activePanel = null;
      this._screenPinnedPanelId = null;
      this._pagePinnedPanelIds.clear();
    }
  }

  /** 从管理器直接注销面板(不做淡出动画,元素已被外部移除),并释放其监听 */
  _removePanel(id) {
    const panel = this._panels.get(id);
    if (!panel) return;

    if (panel._msgListener) {
      chrome.runtime.onMessage.removeListener(panel._msgListener);
      panel._msgListener = null;
    }
    clearTimeout(panel._batchTimer);
    panel._batchTimer = null;
    // 释放 document 级 pin 下拉关闭监听与拖拽/缩放控制器(镜像 close() 的销毁序列)
    panel._pinDropdownAbort?.abort();
    panel._pinDropdownAbort = null;
    if (panel._drag) {
      panel._drag.destroy();
      panel._drag = null;
    }
    if (panel._resize) {
      panel._resize.destroy();
      panel._resize = null;
    }
    panel._closing = false;

    this._panels.delete(id);
    if (this._screenPinnedPanelId === id) this._screenPinnedPanelId = null;
    this._pagePinnedPanelIds.delete(id);
    if (this._activePanel?.id === id) this._activePanel = null;
  }

  /** 通过 DOM 元素反查所在面板实例(面板内二次划词路由用);无则 null */
  getPanelByElement(element) {
    if (!element) return null;
    for (const panel of this._panels.values()) {
      if (panel._closing) continue;
      if (panel.el && panel.el.contains(element)) return panel;
    }
    return null;
  }

  onPanelPinned(panelId, mode) {
    const panel = this._panels.get(panelId);
    if (!panel) return;

    if (this._activePanel?.id === panelId) {
      this._activePanel = null;
    }

    if (mode === 'screen-pinned') {
      if (this._screenPinnedPanelId && this._screenPinnedPanelId !== panelId) {
        const oldPanel = this._panels.get(this._screenPinnedPanelId);
        if (oldPanel) {
          oldPanel._setPinMode('unpinned');
        }
      }
      this._screenPinnedPanelId = panelId;
    } else if (mode === 'page-pinned') {
      this._pagePinnedPanelIds.add(panelId);
    }
  }

  onPanelUnpinned(panelId) {
    const panel = this._panels.get(panelId);
    if (!panel) return;

    if (this._screenPinnedPanelId === panelId) {
      this._screenPinnedPanelId = null;
    }
    this._pagePinnedPanelIds.delete(panelId);

    if (!this._activePanel) {
      this._activePanel = panel;
    } else {
      panel.close();
    }

    panel.pinMode = 'unpinned';
  }

  onPinModeChanged(panelId, oldMode, newMode) {
    if (oldMode === 'screen-pinned') {
      this._screenPinnedPanelId = null;
    }
    if (newMode === 'screen-pinned') {
      if (this._screenPinnedPanelId && this._screenPinnedPanelId !== panelId) {
        const oldPanel = this._panels.get(this._screenPinnedPanelId);
        if (oldPanel) {
          oldPanel._setPinMode('unpinned');
        }
      }
      this._screenPinnedPanelId = panelId;
    }

    if (oldMode === 'page-pinned') {
      this._pagePinnedPanelIds.delete(panelId);
    }
    if (newMode === 'page-pinned') {
      this._pagePinnedPanelIds.add(panelId);
    }
  }

  onPanelClosed(panelId) {
    const panel = this._panels.get(panelId);
    if (!panel) return;

    this._panels.delete(panelId);

    if (this._screenPinnedPanelId === panelId) {
      this._screenPinnedPanelId = null;
    }
    this._pagePinnedPanelIds.delete(panelId);

    if (this._activePanel?.id === panelId) {
      this._activePanel = null;
    }
  }

  contains(element) {
    if (!element) return false;
    for (const panel of this._panels.values()) {
      // 关闭中的面板不参与命中判定,避免对正在淡出的旧 DOM 误操作
      if (panel._closing) continue;
      if (panel.el && panel.el.contains(element)) {
        return true;
      }
    }
    return false;
  }

  closeAll() {
    for (const panel of this._panels.values()) {
      panel.close();
    }
  }

  closeUnpinned() {
    for (const panel of this._panels.values()) {
      if (panel.pinMode === 'unpinned') {
        panel.close();
      }
    }
  }

  /**
   * 配置（enabled 模型集合）变更时实时刷新所有打开面板的卡片骨架。
   * 不自动重发请求，避免用户在设置页改动时无意触发 API 调用。
   */
  refreshCardsFromConfig() {
    for (const panel of this._panels.values()) {
      if (panel.isOpen) panel._renderSkeletonCards?.();
    }
  }

  refreshAppearanceFromConfig() {
    const a = NyaAppearance.mergeAppearance({ appearance: this._config.get('appearance') });
    for (const panel of this._panels.values()) {
      if (panel.el) {
        NyaAppearance.applyToContentRoot(panel.el, a);
      }
    }
  }
}
