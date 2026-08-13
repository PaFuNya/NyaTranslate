/**
 * Options Page Script — 划词助手 v4
 *
 * 模块划分：
 *   NavController        — 侧边栏导航切换
 *   ToastManager         — 全局通知（SVG 图标 + textContent）
 *   ApiConfigSection     — 模型列表与每模型鉴权（Modal，含视觉开关与首选标记）
 *   BasicSettingsSection — 基础开关读写
 *   LangMatchSection     — 语言 Chip + 严格模式读写
 *   TriggerRulesSection  — 动态构建 3 大场景卡片，读写触发规则
 *   PrefsSection         — 偏好设置读写（含翻译历史开关）
 *   OptionsApp           — 根节点，组合并初始化
 */

'use strict';

// ─── 图标常量（Feather 风格：stroke 2 / 16px / currentColor） ─────────────────

const SVG_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const SVG_ALERT = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
const SVG_GLOBE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
const SVG_MOUSE_POINTER = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>`;
const SVG_PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/></svg>`;
const SVG_COPY = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const SVG_EDIT = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;
const SVG_TRASH = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
const SVG_STAR = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const SVG_STAR_FILLED = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const SVG_EYE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const SVG_EYE_OFF = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

// ─── 常量定义 ─────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: '英文' },
  { key: 'ja', label: '日文' },
  { key: 'ko', label: '韩文' },
  { key: 'fr', label: '法文' },
  { key: 'es', label: '西班牙文' },
  { key: 'de', label: '德文' },
];

const TRIGGER_SCENARIOS = [
  {
    key: 'normal',
    label: '普通划词',
    icon: SVG_MOUSE_POINTER,
    desc: '在普通页面上划选文字时的触发方式（面板未打开或未固定）。',
  },
  {
    key: 'pinned',
    label: '面板钉住后划词',
    icon: SVG_PIN,
    desc: '查词面板被固定时，在外部页面继续划选文字的触发方式。',
  },
  {
    key: 'insidePanel',
    label: '面板内部划词',
    icon: SVG_COPY,
    desc: '在已打开的查词面板内部选中文字时的触发方式（如划选翻译结果中的单词再查词）。',
  },
];

const MODIFIER_KEYS = [
  { key: 'ctrl', label: 'Ctrl' },
  { key: 'alt', label: 'Alt' },
  { key: 'shift', label: 'Shift' },
  { key: 'meta', label: '⌘ Meta' },
];

const DEFAULT_TRIGGER_RULE = {
  showIcon: true,
  directSearch: false,
  dblclickSearch: false,
  modifiers: [],
  hoverSelect: false,
};

// ═══════════════════════════════════════════════════════════════════════════
//  ToastManager
// ═══════════════════════════════════════════════════════════════════════════

class ToastManager {
  constructor(el) {
    this._el = el;
    this._timer = null;
  }

  show(type, message) {
    if (this._timer) clearTimeout(this._timer);

    // 图标与文案分离渲染：图标为静态 SVG 常量，文案走 textContent 防止注入
    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.innerHTML = type === 'success' ? SVG_CHECK : SVG_ALERT;
    const text = document.createElement('span');
    text.textContent = message;

    this._el.replaceChildren(icon, text);
    this._el.className = `toast toast--${type}`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this._el.classList.add('toast--show'));
    });
    this._timer = setTimeout(() => {
      this._el.classList.remove('toast--show');
      this._timer = setTimeout(() => {
        this._el.className = 'toast';
        this._el.innerHTML = '';
      }, 300);
    }, 2800);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  NavController
// ═══════════════════════════════════════════════════════════════════════════

class NavController {
  init() {
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sectionKey = btn.dataset.section;
        document.querySelectorAll('.nav-item').forEach((b) =>
          b.classList.toggle('nav-item--active', b === btn)
        );
        document.querySelectorAll('.section').forEach((sec) => {
          sec.classList.toggle('section--active', sec.id === `section-${sectionKey}`);
        });
      });
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  ApiConfigSection — 每模型独立鉴权（v4）
//  models: [{ id, modelId, displayName, protocol, baseUrl, apiKey, enabled, visionEnabled, preferred }]
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_OPENAI_BASE_URL    = 'https://api.openai.com/v1';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

const PROVIDER_PRESETS = {
  custom:   { protocol: 'openai', baseUrl: '' },
  deepseek: { protocol: 'openai', baseUrl: 'https://api.deepseek.com/v1' },
  qwen:     { protocol: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  openai:   { protocol: 'openai', baseUrl: DEFAULT_OPENAI_BASE_URL },
  claude:   { protocol: 'anthropic', baseUrl: DEFAULT_ANTHROPIC_BASE_URL },
};

function newModelRowId() {
  try {
    return crypto.randomUUID();
  } catch (_) {
    return `m-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}

/**
 * 与 background.js 同源：解析 models 并兼容旧版全局 Key / 旧行结构。
 * 新字段：visionEnabled（视觉能力开关）、preferred（首选标记，全局唯一）。
 * @param {Record<string, unknown>} stored
 */
function ensureModelsArray(stored) {
  const globals = {
    openaiKey:        String(stored.openaiKey || ''),
    openaiBaseUrl:    String(stored.openaiBaseUrl || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, ''),
    anthropicKey:     String(stored.anthropicKey || ''),
    anthropicBaseUrl: String(stored.anthropicBaseUrl || DEFAULT_ANTHROPIC_BASE_URL).replace(/\/$/, ''),
  };

  const raw = Array.isArray(stored.models) ? stored.models : [];
  /** @type {{ id: string, modelId: string, displayName: string, protocol: 'openai'|'anthropic', baseUrl: string, apiKey: string, enabled: boolean, visionEnabled: boolean, preferred: boolean }[]} */
  const out = [];
  const seenIds = new Set();

  const pushRow = (row) => {
    const id = String(row.id || '').trim() || newModelRowId();
    if (seenIds.has(id)) return;
    seenIds.add(id);
    out.push({
      id,
      modelId:     String(row.modelId || '').trim(),
      displayName: String(row.displayName || row.modelId || '').trim() || String(row.modelId || '').trim(),
      protocol:    row.protocol === 'anthropic' ? 'anthropic' : 'openai',
      baseUrl:     String(row.baseUrl || '').trim().replace(/\/$/, ''),
      apiKey:      String(row.apiKey || ''),
      enabled:     row.enabled !== false,
      visionEnabled: row.visionEnabled === true,
      preferred:     row.preferred === true,
    });
  };

  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;

    if (m.modelId != null && (m.protocol === 'openai' || m.protocol === 'anthropic')) {
      const proto = m.protocol === 'anthropic' ? 'anthropic' : 'openai';
      const defBase = proto === 'anthropic' ? DEFAULT_ANTHROPIC_BASE_URL : DEFAULT_OPENAI_BASE_URL;
      pushRow({
        id:          m.id,
        modelId:     m.modelId,
        displayName: m.displayName != null ? m.displayName : m.modelId,
        protocol:    proto,
        baseUrl:     m.baseUrl != null && String(m.baseUrl).trim() ? m.baseUrl : defBase,
        apiKey:      m.apiKey != null ? m.apiKey : '',
        enabled:     m.enabled,
      });
      continue;
    }

    const oldApiName = String(m.id || '').trim();
    if (!oldApiName) continue;
    const proto = m.provider === 'anthropic' ? 'anthropic' : 'openai';
    // 旧格式行保留原始 id(与 background.js 同源):
    // 若生成随机 UUID,打开设置页会改写 storage 中的行 id,
    // 与 content 侧已打开面板的卡片 key 失配,导致在途批次结果被丢弃
    pushRow({
      id:          oldApiName,
      modelId:     oldApiName,
      displayName: oldApiName,
      protocol:    proto,
      baseUrl:     proto === 'anthropic' ? globals.anthropicBaseUrl : globals.openaiBaseUrl,
      apiKey:      proto === 'anthropic' ? globals.anthropicKey : globals.openaiKey,
      enabled:     m.enabled !== false,
    });
  }

  const legacyText = (stored.textModelId && String(stored.textModelId).trim()) || '';
  const legacyProto = stored.textModelProtocol === 'anthropic' ? 'anthropic' : 'openai';
  if (legacyText && !out.some((r) => r.modelId === legacyText)) {
    pushRow({
      id:          legacyText,
      modelId:     legacyText,
      displayName: legacyText,
      protocol:    legacyProto,
      baseUrl:     legacyProto === 'anthropic' ? globals.anthropicBaseUrl : globals.openaiBaseUrl,
      apiKey:      legacyProto === 'anthropic' ? globals.anthropicKey : globals.openaiKey,
      enabled:     true,
    });
  }

  if (out.length === 0) {
    return [
      {
        id: newModelRowId(),
        modelId: 'gpt-4o',
        displayName: 'GPT-4o',
        protocol: 'openai',
        baseUrl: DEFAULT_OPENAI_BASE_URL,
        apiKey: '',
        enabled: true,
        visionEnabled: false,
        preferred: false,
      },
      {
        id: newModelRowId(),
        modelId: 'claude-3-5-sonnet-20241022',
        displayName: 'Claude 3.5 Sonnet',
        protocol: 'anthropic',
        baseUrl: DEFAULT_ANTHROPIC_BASE_URL,
        apiKey: '',
        enabled: true,
        visionEnabled: false,
        preferred: false,
      },
      {
        id: newModelRowId(),
        modelId: 'deepseek-chat',
        displayName: 'DeepSeek Chat',
        protocol: 'openai',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: '',
        enabled: true,
        visionEnabled: false,
        preferred: false,
      },
    ];
  }

  return out;
}

function storageNeedsLegacyStrip(stored) {
  return !!(
    stored.openaiKey ||
    stored.openaiBaseUrl ||
    stored.anthropicKey ||
    stored.anthropicBaseUrl
  );
}

const LEGACY_KEYS_TO_REMOVE = [
  'openaiKey',
  'openaiBaseUrl',
  'anthropicKey',
  'anthropicBaseUrl',
];

class ApiConfigSection {
  constructor(toast) {
    this._toast = toast;

    this._modelsListEl = document.getElementById('models-list');
    this._btnOpenAdd   = document.getElementById('btn-open-add-model');
    this._btnSave      = document.getElementById('btn-save-api');

    this._backdrop = document.getElementById('model-modal-backdrop');
    this._modal    = document.getElementById('model-modal');
    this._modalTitle = document.getElementById('model-modal-title');
    this._btnModalClose = document.getElementById('model-modal-close');
    this._btnModalCancel = document.getElementById('model-modal-cancel');
    this._btnModalSave = document.getElementById('model-modal-save');

    this._presetSelect   = document.getElementById('modal-preset');
    this._protocolSelect = document.getElementById('modal-protocol');
    this._protocolField  = document.getElementById('modal-protocol-field');
    this._inpDisplayName = document.getElementById('modal-display-name');
    this._inpModelId     = document.getElementById('modal-model-id');
    this._inpBaseUrl     = document.getElementById('modal-base-url');
    this._inpApiKey      = document.getElementById('modal-api-key');
    this._chkVision      = document.getElementById('modal-vision-enabled');

    /** @type {{ id: string, modelId: string, displayName: string, protocol: 'openai'|'anthropic', baseUrl: string, apiKey: string, enabled: boolean, visionEnabled: boolean, preferred: boolean }[]} */
    this._models = [];
    /** @type {string | null} */
    this._editingId = null;
  }

  init() {
    this._initModalEye();
    this._btnOpenAdd.addEventListener('click', () => this._openModal(null));
    this._btnModalClose.addEventListener('click', () => this._closeModal());
    this._btnModalCancel.addEventListener('click', () => this._closeModal());
    this._btnModalSave.addEventListener('click', () => this._saveModal());
    this._backdrop.addEventListener('click', () => this._closeModal());

    this._presetSelect.addEventListener('change', () => this._onPresetChange());
    this._btnSave.addEventListener('click', () => this._save());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._modal.classList.contains('modal-sheet--open')) {
        this._closeModal();
      }
    });
  }

  load(stored) {
    const raw = stored || {};
    this._models = ensureModelsArray(raw);

    const stripLegacy = storageNeedsLegacyStrip(raw);
    const alsoCleanLegacyIds =
      raw.textModelId != null ||
      raw.textModelProtocol != null ||
      raw.visionModelId != null ||
      raw.visionModelProtocol != null;
    const needsModelShapePersist =
      Array.isArray(raw.models) &&
      raw.models.some((m) => m && m.modelId == null && m.id);

    if (stripLegacy || alsoCleanLegacyIds || needsModelShapePersist) {
      chrome.storage.local.set({ models: this._models }, () => {
        chrome.storage.local.remove([
          ...LEGACY_KEYS_TO_REMOVE,
          'textModelId',
          'textModelProtocol',
          'visionModelId',
          'visionModelProtocol',
        ]);
      });
    }

    this._renderModelList();
  }

  _initModalEye() {
    const EYE_OPEN   = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
    const EYE_CLOSED = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`;

    const btn = document.getElementById('modal-api-key-eye');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      const svg = btn.querySelector('svg');
      if (svg) svg.innerHTML = showing ? EYE_OPEN : EYE_CLOSED;
      btn.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
    });
  }

  _onPresetChange() {
    const key = this._presetSelect.value;
    const p = PROVIDER_PRESETS[key];
    if (!p) return;

    if (key === 'custom') {
      this._protocolSelect.disabled = false;
      this._inpBaseUrl.placeholder = 'https://api.example.com/v1';
    } else {
      this._protocolSelect.disabled = true;
      this._protocolSelect.value = p.protocol;
      if (p.baseUrl) {
        this._inpBaseUrl.value = p.baseUrl;
      }
    }
  }

  _guessPresetForRow(m) {
    const b = (m.baseUrl || '').replace(/\/$/, '');
    for (const [key, pr] of Object.entries(PROVIDER_PRESETS)) {
      if (key === 'custom') continue;
      if (pr.baseUrl && pr.baseUrl.replace(/\/$/, '') === b && pr.protocol === m.protocol) {
        return key;
      }
    }
    return 'custom';
  }

  /**
   * @param {string | null} editId
   */
  _openModal(editId) {
    this._editingId = editId;
    this._inpApiKey.value = '';

    if (!editId) {
      this._modalTitle.textContent = '添加模型';
      this._presetSelect.value = 'custom';
      this._inpDisplayName.value = '';
      this._inpModelId.value = '';
      this._inpBaseUrl.value = '';
      this._protocolSelect.value = 'openai';
      this._protocolSelect.disabled = false;
      if (this._chkVision) this._chkVision.checked = false;
      this._onPresetChange();
    } else {
      const m = this._models.find((x) => x.id === editId);
      if (!m) return;
      this._modalTitle.textContent = '编辑模型';
      const preset = this._guessPresetForRow(m);
      this._presetSelect.value = preset;
      this._inpDisplayName.value = m.displayName || '';
      this._inpModelId.value = m.modelId || '';
      this._inpBaseUrl.value = m.baseUrl || '';
      this._protocolSelect.value = m.protocol === 'anthropic' ? 'anthropic' : 'openai';
      this._inpApiKey.placeholder = m.apiKey ? '已保存 · 留空则不修改' : '填写 API Key';
      if (this._chkVision) this._chkVision.checked = m.visionEnabled === true;
      if (preset === 'custom') {
        this._protocolSelect.disabled = false;
      } else {
        this._protocolSelect.disabled = true;
      }
    }

    this._backdrop.classList.add('modal-backdrop--visible');
    this._backdrop.setAttribute('aria-hidden', 'false');
    this._modal.classList.add('modal-sheet--open');
    this._modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      this._inpDisplayName.focus();
    });
  }

  _closeModal() {
    this._backdrop.classList.remove('modal-backdrop--visible');
    this._backdrop.setAttribute('aria-hidden', 'true');
    this._modal.classList.remove('modal-sheet--open');
    this._modal.setAttribute('aria-hidden', 'true');
    this._editingId = null;
    this._inpApiKey.placeholder = '';
  }

  _saveModal() {
    const displayName = this._inpDisplayName.value.trim();
    const modelId = this._inpModelId.value.trim();
    let baseUrl = this._inpBaseUrl.value.trim().replace(/\/$/, '');
    const apiKeyInp = this._inpApiKey.value.trim();

    if (!displayName) {
      this._toast.show('error', '请填写显示名称');
      this._inpDisplayName.focus();
      return;
    }
    if (!modelId) {
      this._toast.show('error', '请填写 Model ID');
      this._inpModelId.focus();
      return;
    }

    const presetKey = this._presetSelect.value;
    const preset = PROVIDER_PRESETS[presetKey];
    const protocol = presetKey === 'custom'
      ? (this._protocolSelect.value === 'anthropic' ? 'anthropic' : 'openai')
      : (preset.protocol === 'anthropic' ? 'anthropic' : 'openai');

    if (!baseUrl) {
      const def = protocol === 'anthropic' ? DEFAULT_ANTHROPIC_BASE_URL : DEFAULT_OPENAI_BASE_URL;
      baseUrl = def;
      this._inpBaseUrl.value = baseUrl;
    }

    let id = this._editingId;
    let apiKey = '';

    if (id) {
      const prev = this._models.find((x) => x.id === id);
      if (!prev) return;
      apiKey = apiKeyInp || prev.apiKey || '';
    } else {
      id = newModelRowId();
      apiKey = apiKeyInp;
    }

    const row = {
      id,
      modelId,
      displayName,
      protocol,
      baseUrl,
      apiKey,
      enabled: true,
      visionEnabled: this._chkVision ? this._chkVision.checked : false,
      preferred: false,
    };

    if (!this._editingId) {
      this._models.push(row);
    } else {
      const idx = this._models.findIndex((x) => x.id === id);
      if (idx >= 0) {
        row.enabled = this._models[idx].enabled;
        row.preferred = this._models[idx].preferred === true;
        this._models[idx] = row;
      }
    }

    this._persistModels(() => {
      this._toast.show('success', this._editingId ? '已保存修改 ✓' : '已添加模型 ✓');
      this._closeModal();
      this._renderModelList();
    });
  }

  _persistModels(cb) {
    chrome.storage.local.set({ models: this._models }, () => {
      if (chrome.runtime.lastError) {
        this._toast.show('error', `保存失败：${chrome.runtime.lastError.message}`);
      } else if (cb) cb();
    });
  }

  _urlSummary(url) {
    const s = (url || '').replace(/\/$/, '');
    if (!s) return '—';
    try {
      const u = new URL(s);
      const tail = u.pathname.length > 18 ? `${u.pathname.slice(0, 16)}…` : u.pathname;
      return `${u.host}${tail}`;
    } catch (_) {
      return s.length > 36 ? `${s.slice(0, 34)}…` : s;
    }
  }

  /** 生成行内徽标（视觉 / 首选），icon 为静态 SVG 常量 */
  _makeBadge(extraClass, label, iconSvg) {
    const badge = document.createElement('span');
    badge.className = `model-badge ${extraClass}`.trim();
    const icon = document.createElement('span');
    icon.className = 'model-badge-icon';
    icon.innerHTML = iconSvg;
    badge.appendChild(icon);
    badge.appendChild(document.createTextNode(label));
    return badge;
  }

  _renderModelList() {
    if (!this._modelsListEl) return;
    this._modelsListEl.innerHTML = '';

    this._models.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'model-row';
      row.setAttribute('role', 'listitem');

      const main = document.createElement('div');
      main.className = 'model-row-main';

      const title = document.createElement('div');
      title.className = 'model-row-title';
      title.textContent = m.displayName || m.modelId;
      if (m.preferred) {
        title.appendChild(this._makeBadge('model-badge--preferred', '首选', SVG_STAR_FILLED));
      }
      if (m.visionEnabled) {
        title.appendChild(this._makeBadge('', '视觉', SVG_EYE));
      }

      const sub = document.createElement('div');
      sub.className = 'model-row-sub';
      sub.textContent = `${m.modelId} · ${this._urlSummary(m.baseUrl)}`;

      main.appendChild(title);
      main.appendChild(sub);

      const actions = document.createElement('div');
      actions.className = 'model-row-actions';

      // 首选标记（全局唯一）
      const star = document.createElement('button');
      star.type = 'button';
      star.className = `model-row-icon-btn${m.preferred ? ' model-row-icon-btn--on' : ''}`;
      star.title = m.preferred ? '取消首选' : '设为首选模型';
      star.setAttribute('aria-label', star.title);
      star.setAttribute('aria-pressed', m.preferred ? 'true' : 'false');
      star.innerHTML = m.preferred ? SVG_STAR_FILLED : SVG_STAR;
      star.addEventListener('click', () => this._togglePreferred(m.id));

      // 视觉能力开关
      const vision = document.createElement('button');
      vision.type = 'button';
      vision.className = `model-row-icon-btn${m.visionEnabled ? ' model-row-icon-btn--on' : ''}`;
      vision.title = m.visionEnabled ? '关闭视觉能力' : '开启视觉能力';
      vision.setAttribute('aria-label', vision.title);
      vision.setAttribute('aria-pressed', m.visionEnabled ? 'true' : 'false');
      vision.innerHTML = m.visionEnabled ? SVG_EYE : SVG_EYE_OFF;
      vision.addEventListener('click', () => this._toggleVision(m.id));

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'model-row-icon-btn';
      edit.title = '编辑';
      edit.setAttribute('aria-label', '编辑');
      edit.innerHTML = SVG_EDIT;
      edit.addEventListener('click', () => this._openModal(m.id));

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'model-row-icon-btn model-row-icon-btn--danger';
      del.title = '删除';
      del.setAttribute('aria-label', '删除');
      del.innerHTML = SVG_TRASH;
      del.addEventListener('click', () => this._deleteModel(m.id));

      const label = document.createElement('label');
      label.className = 'model-toggle';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = m.enabled;
      chk.addEventListener('change', () => {
        m.enabled = chk.checked;
        this._persistModels();
      });
      const slider = document.createElement('span');
      slider.className = 'model-toggle-slider';
      label.appendChild(chk);
      label.appendChild(slider);

      actions.appendChild(star);
      actions.appendChild(vision);
      actions.appendChild(edit);
      actions.appendChild(del);
      actions.appendChild(label);

      row.appendChild(main);
      row.appendChild(actions);
      this._modelsListEl.appendChild(row);
    });
  }

  /** 设置/取消首选：设为首选时清除其他行的首选标记 */
  _togglePreferred(id) {
    const target = this._models.find((x) => x.id === id);
    if (!target) return;
    const next = !target.preferred;
    this._models.forEach((m) => {
      m.preferred = false;
    });
    target.preferred = next;
    this._renderModelList();
    this._persistModels(() => {
      this._toast.show('success', next ? '已设为首选模型 ✓' : '已取消首选 ✓');
    });
  }

  /** 切换视觉能力开关 */
  _toggleVision(id) {
    const target = this._models.find((x) => x.id === id);
    if (!target) return;
    target.visionEnabled = !target.visionEnabled;
    this._renderModelList();
    this._persistModels();
  }

  _deleteModel(id) {
    if (!confirm('确定删除该模型配置？')) return;
    this._models = this._models.filter((x) => x.id !== id);
    this._renderModelList();
    this._persistModels(() => this._toast.show('success', '已删除 ✓'));
  }

  _save() {
    const enabled = this._models.filter((m) => m.enabled);
    if (enabled.length === 0) {
      this._toast.show('error', '请至少启用一个模型');
      return;
    }

    this._btnSave.disabled = true;
    this._btnSave.textContent = '保存中…';

    chrome.storage.local.set({ models: this._models }, () => {
      this._btnSave.disabled = false;
      this._btnSave.textContent = '保存 API 配置';

      if (chrome.runtime.lastError) {
        this._toast.show('error', `保存失败：${chrome.runtime.lastError.message}`);
        return;
      }

      chrome.storage.local.remove(LEGACY_KEYS_TO_REMOVE, () => {});
      this._toast.show('success', '已保存 ✓');
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  BasicSettingsSection
// ═══════════════════════════════════════════════════════════════════════════

class BasicSettingsSection {
  constructor(toast) {
    this._toast = toast;
    this._chkInputs = document.getElementById('toggle-disable-in-inputs');
    this._chkTouch = document.getElementById('toggle-touch-mode');
    this._btnSave = document.getElementById('btn-save-basic');
  }

  init() {
    this._btnSave.addEventListener('click', () => this._save());
  }

  load(stored) {
    this._chkInputs.checked = stored.disableInInputs !== false; // 默认 true
    this._chkTouch.checked = stored.touchMode === true;
  }

  _save() {
    this._btnSave.disabled = true;
    this._btnSave.textContent = '保存中…';

    chrome.storage.local.set({
      disableInInputs: this._chkInputs.checked,
      touchMode: this._chkTouch.checked,
    }, () => {
      this._btnSave.disabled = false;
      this._btnSave.textContent = '保存基础设置';
      if (chrome.runtime.lastError) {
        this._toast.show('error', `保存失败：${chrome.runtime.lastError.message}`);
        return;
      }
      this._toast.show('success', '已保存 ✓');
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  LangMatchSection
// ═══════════════════════════════════════════════════════════════════════════

class LangMatchSection {
  constructor(toast) {
    this._toast = toast;
    this._container = document.getElementById('lang-chips');
    this._chkStrict = document.getElementById('toggle-strict-lang');
    this._btnSave = document.getElementById('btn-save-lang');
    this._checkboxes = {}; // { zh: HTMLInputElement, ... }
  }

  init() {
    this._buildChips();
    this._btnSave.addEventListener('click', () => this._save());
  }

  load(stored) {
    const langs = stored.languages || {};
    for (const [key, chk] of Object.entries(this._checkboxes)) {
      // defaults: zh and en checked, rest unchecked
      const defaultVal = (key === 'zh' || key === 'en');
      chk.checked = langs[key] !== undefined ? langs[key] : defaultVal;
    }
    this._chkStrict.checked = stored.strictLanguageMatch === true;
  }

  _buildChips() {
    LANGUAGES.forEach(({ key, label }) => {
      const chip = document.createElement('label');
      chip.className = 'lang-chip';
      chip.htmlFor = `lang-${key}`;

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.id = `lang-${key}`;
      chk.value = key;

      // 统一 Feather 风格语言图标（静态 SVG 常量）
      const icon = document.createElement('span');
      icon.className = 'lang-chip-icon';
      icon.innerHTML = SVG_GLOBE;

      const span = document.createElement('span');
      span.textContent = label;

      chip.appendChild(chk);
      chip.appendChild(icon);
      chip.appendChild(span);
      this._container.appendChild(chip);
      this._checkboxes[key] = chk;

      // 视觉联动
      chk.addEventListener('change', () =>
        chip.classList.toggle('lang-chip--checked', chk.checked)
      );
    });
  }

  _save() {
    const languages = {};
    for (const [key, chk] of Object.entries(this._checkboxes)) {
      languages[key] = chk.checked;
    }
    this._btnSave.disabled = true;
    this._btnSave.textContent = '保存中…';

    chrome.storage.local.set({
      languages,
      strictLanguageMatch: this._chkStrict.checked,
    }, () => {
      this._btnSave.disabled = false;
      this._btnSave.textContent = '保存语言设置';
      if (chrome.runtime.lastError) {
        this._toast.show('error', `保存失败：${chrome.runtime.lastError.message}`);
        return;
      }
      this._toast.show('success', '已保存 ✓');
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  TriggerRulesSection — 动态构建 4 个场景卡片
// ═══════════════════════════════════════════════════════════════════════════

class TriggerRulesSection {
  constructor(toast) {
    this._toast = toast;
    this._container = document.getElementById('trigger-rules-container');
    this._btnSave = document.getElementById('btn-save-trigger');
    this._fields = {}; // { scenarioKey: { showIcon, directSearch, ... } }
  }

  init() {
    TRIGGER_SCENARIOS.forEach(({ key, label, icon, desc }) => {
      this._buildCard(key, label, icon, desc);
    });
    this._btnSave.addEventListener('click', () => this._save());
  }

  load(stored) {
    const rules = stored.triggerRules || {};
    for (const { key } of TRIGGER_SCENARIOS) {
      const rule = rules[key] || DEFAULT_TRIGGER_RULE;
      const fields = this._fields[key];
      if (!fields) continue;

      fields.showIcon.checked = rule.showIcon ?? DEFAULT_TRIGGER_RULE.showIcon;
      fields.directSearch.checked = rule.directSearch ?? DEFAULT_TRIGGER_RULE.directSearch;
      fields.dblclickSearch.checked = rule.dblclickSearch ?? DEFAULT_TRIGGER_RULE.dblclickSearch;
      fields.hoverSelect.checked = rule.hoverSelect ?? DEFAULT_TRIGGER_RULE.hoverSelect;

      // 组合键
      MODIFIER_KEYS.forEach(({ key: mk }) => {
        if (fields.modifiers[mk]) {
          fields.modifiers[mk].checked = (rule.modifiers || []).includes(mk);
        }
      });
    }
  }

  _buildCard(scenarioKey, label, icon, desc) {
    const card = document.createElement('div');
    card.className = 'card trigger-card';

    // 卡片标题
    const head = document.createElement('div');
    head.className = 'card-head';
    head.innerHTML = `
      <div class="card-brand trigger-card-brand">
        <span class="trigger-icon">${icon}</span>
        <span>${label}</span>
      </div>
    `;
    card.appendChild(head);

    // 描述
    const descEl = document.createElement('p');
    descEl.className = 'field-desc trigger-card-desc';
    descEl.textContent = desc;
    card.appendChild(descEl);

    // 选项列表
    const opts = document.createElement('div');
    opts.className = 'trigger-options';

    const showIconChk = this._makeCheckRow(opts, `${scenarioKey}-showIcon`, '显示图标', '划词后在光标附近出现小气泡图标，悬停或点击后展开面板。');
    const directSearchChk = this._makeCheckRow(opts, `${scenarioKey}-directSearch`, '直接搜索', '划词后直接弹出面板，同时向已启用模型发起请求，无需点击图标。');
    const dblclickSearchChk = this._makeCheckRow(opts, `${scenarioKey}-dblclickSearch`, '双击搜索', '仅双击选词时才直接弹出面板（优先级高于「直接搜索」）。');
    const hoverSelectChk = this._makeCheckRow(opts, `${scenarioKey}-hoverSelect`, '鼠标悬浮取词', '无需点击，鼠标悬停约 0.6 秒后自动选取光标周边单词并显示图标。');

    // 组合键
    const modRow = document.createElement('div');
    modRow.className = 'trigger-option-row';
    modRow.innerHTML = `
      <div class="trigger-option-label">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h0M10 10h0M14 10h0M18 10h0M8 14h8"/></svg>
        组合键触发
      </div>
      <div class="trigger-option-desc">按住以下任一修饰键划词时，强制触发直接搜索（优先级高于基础模式）。</div>
    `;
    const modKeys = document.createElement('div');
    modKeys.className = 'modifier-keys';

    const modCheckboxes = {};
    MODIFIER_KEYS.forEach(({ key: mk, label: ml }) => {
      const modLabel = document.createElement('label');
      modLabel.className = 'modifier-key';

      const modChk = document.createElement('input');
      modChk.type = 'checkbox';
      modChk.id = `${scenarioKey}-mod-${mk}`;
      modChk.value = mk;
      modChk.addEventListener('change', () =>
        modLabel.classList.toggle('modifier-key--checked', modChk.checked)
      );

      const modSpan = document.createElement('span');
      modSpan.textContent = ml;

      modLabel.appendChild(modChk);
      modLabel.appendChild(modSpan);
      modKeys.appendChild(modLabel);
      modCheckboxes[mk] = modChk;
    });

    modRow.appendChild(modKeys);
    opts.appendChild(modRow);

    card.appendChild(opts);
    this._container.appendChild(card);

    // 保存字段引用
    this._fields[scenarioKey] = {
      showIcon: showIconChk,
      directSearch: directSearchChk,
      dblclickSearch: dblclickSearchChk,
      hoverSelect: hoverSelectChk,
      modifiers: modCheckboxes,
    };
  }

  /** 生成单行复选框选项，返回 input 元素 */
  _makeCheckRow(container, id, label, description) {
    const row = document.createElement('div');
    row.className = 'trigger-option-row';

    const labelEl = document.createElement('label');
    labelEl.className = 'trigger-check-label';
    labelEl.htmlFor = id;

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.id = id;

    const checkMark = document.createElement('span');
    checkMark.className = 'trigger-checkmark';

    const textWrap = document.createElement('div');
    const titleSpan = document.createElement('span');
    titleSpan.className = 'trigger-option-label';
    titleSpan.textContent = label;
    const descSpan = document.createElement('span');
    descSpan.className = 'trigger-option-desc';
    descSpan.textContent = description;

    textWrap.appendChild(titleSpan);
    textWrap.appendChild(descSpan);

    labelEl.appendChild(chk);
    labelEl.appendChild(checkMark);
    labelEl.appendChild(textWrap);
    row.appendChild(labelEl);
    container.appendChild(row);

    return chk;
  }

  _save() {
    const triggerRules = {};
    for (const { key } of TRIGGER_SCENARIOS) {
      const fields = this._fields[key];
      if (!fields) continue;

      const modifiers = MODIFIER_KEYS
        .filter(({ key: mk }) => fields.modifiers[mk]?.checked)
        .map(({ key: mk }) => mk);

      triggerRules[key] = {
        showIcon: fields.showIcon.checked,
        directSearch: fields.directSearch.checked,
        dblclickSearch: fields.dblclickSearch.checked,
        hoverSelect: fields.hoverSelect.checked,
        modifiers,
      };
    }

    this._btnSave.disabled = true;
    this._btnSave.textContent = '保存中…';

    chrome.storage.local.set({ triggerRules }, () => {
      this._btnSave.disabled = false;
      this._btnSave.textContent = '保存触发规则';
      if (chrome.runtime.lastError) {
        this._toast.show('error', `保存失败：${chrome.runtime.lastError.message}`);
        return;
      }
      this._toast.show('success', '已保存 ✓');
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PrefsSection
// ═══════════════════════════════════════════════════════════════════════════

class PrefsSection {
  constructor(toast) {
    this._toast = toast;
    this._preferredAction = document.getElementById('preferred-action');
    this._btnSave = document.getElementById('btn-save-prefs');
    this._chkWordDetail = document.getElementById('toggle-word-detail');
    this._selComplexity = document.getElementById('sentence-complexity');
    this._chkHistory = document.getElementById('toggle-history-enabled');
  }

  init() {
    this._btnSave.addEventListener('click', () => this._save());
  }

  load(stored) {
    if (stored.preferredAction) {
      this._preferredAction.value = stored.preferredAction;
    }
    this._chkWordDetail.checked = stored.wordDetailEnabled !== false;
    this._selComplexity.value = stored.exampleSentenceMode || 'simple';
    this._chkHistory.checked = stored.historyEnabled !== false; // 默认开启
  }

  _save() {
    this._btnSave.disabled = true;
    this._btnSave.textContent = '保存中…';

    chrome.storage.local.set({
      preferredAction: this._preferredAction.value,
      wordDetailEnabled: this._chkWordDetail.checked,
      exampleSentenceMode: this._selComplexity.value,
      historyEnabled: this._chkHistory.checked,
    }, () => {
      this._btnSave.disabled = false;
      this._btnSave.textContent = '保存偏好设置';
      if (chrome.runtime.lastError) {
        this._toast.show('error', `保存失败：${chrome.runtime.lastError.message}`);
        return;
      }
      this._toast.show('success', '已保存 ✓');
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  AppearanceSection — Material You 个性化（即时写入 storage）
// ═══════════════════════════════════════════════════════════════════════════

class AppearanceSection {
  constructor() {
    this._appearance = { ...NyaAppearance.DEFAULT };
    this._radiusInput = /** @type {HTMLInputElement | null} */ (document.getElementById('appearance-radius'));
    this._radiusLabel = document.getElementById('appearance-radius-label');
    this._modeCards = () => document.querySelectorAll('.appearance-mode-card[data-theme-mode]');
    this._paletteDots = () => document.querySelectorAll('.appearance-palette-dot[data-palette]');
    this._bgCards = () => document.querySelectorAll('.appearance-bg-card[data-background]');
    this._onMedia = () => {
      if (this._appearance.themeMode === 'system') {
        NyaAppearance.applyToExtensionPage(document.documentElement, this._appearance);
      }
    };
    this._mq = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  }

  init() {
    this._modeCards().forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-theme-mode');
        if (!mode) return;
        this._appearance.themeMode = mode;
        this._syncModeUi();
        this._persist();
      });
    });

    this._paletteDots().forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-palette');
        if (!p) return;
        this._appearance.palette = p;
        this._syncPaletteUi();
        this._persist();
      });
    });

    this._bgCards().forEach((btn) => {
      btn.addEventListener('click', () => {
        const b = btn.getAttribute('data-background');
        if (!b) return;
        this._appearance.background = b;
        this._syncBgUi();
        this._persist();
      });
    });

    this._radiusInput?.addEventListener('input', () => {
      const v = Number(this._radiusInput?.value);
      this._appearance.cornerRadius = NyaAppearance.clampRadius(v);
      if (this._radiusLabel) this._radiusLabel.textContent = `${this._appearance.cornerRadius}px`;
      this._radiusInput?.setAttribute('aria-valuenow', String(this._appearance.cornerRadius));
      NyaAppearance.applyToExtensionPage(document.documentElement, this._appearance);
    });

    this._radiusInput?.addEventListener('change', () => this._persist());

    this._mq?.addEventListener('change', this._onMedia);
  }

  load(stored) {
    this._appearance = NyaAppearance.mergeAppearance(stored || {});
    if (this._radiusInput) {
      this._radiusInput.value = String(this._appearance.cornerRadius);
      this._radiusInput.setAttribute('aria-valuenow', String(this._appearance.cornerRadius));
    }
    if (this._radiusLabel) this._radiusLabel.textContent = `${this._appearance.cornerRadius}px`;
    NyaAppearance.applyToExtensionPage(document.documentElement, this._appearance);
    this._syncModeUi();
    this._syncPaletteUi();
    this._syncBgUi();
  }

  _syncModeUi() {
    const m = this._appearance.themeMode;
    this._modeCards().forEach((btn) => {
      const active = btn.getAttribute('data-theme-mode') === m;
      btn.classList.toggle('appearance-mode-card--active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  _syncPaletteUi() {
    const p = this._appearance.palette;
    this._paletteDots().forEach((btn) => {
      const active = btn.getAttribute('data-palette') === p;
      btn.classList.toggle('appearance-palette-dot--active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  _syncBgUi() {
    const b = this._appearance.background;
    this._bgCards().forEach((btn) => {
      const active = btn.getAttribute('data-background') === b;
      btn.classList.toggle('appearance-bg-card--active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  _persist() {
    NyaAppearance.applyToExtensionPage(document.documentElement, this._appearance);
    chrome.storage.local.set({ appearance: { ...this._appearance } }, () => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  OptionsApp — 根节点，组合并初始化所有模块
// ═══════════════════════════════════════════════════════════════════════════

class OptionsApp {
  constructor() {
    const toast = new ToastManager(document.getElementById('toast'));

    this._modules = [
      new NavController(),
      new ApiConfigSection(toast),
      new BasicSettingsSection(toast),
      new LangMatchSection(toast),
      new TriggerRulesSection(toast),
      new PrefsSection(toast),
      new AppearanceSection(),
    ];
  }

  init() {
    // 先让各模块完成 DOM 构建（TriggerRulesSection 动态生成卡片）
    this._modules.forEach((m) => m.init?.());

    // 版本号统一从 manifest 注入（侧栏与关于页单一数据源）
    const manifestVersion = chrome.runtime?.getManifest?.().version || '';
    const sidebarVersion = document.getElementById('sidebar-version');
    const aboutVersion = document.getElementById('about-version');
    if (sidebarVersion && manifestVersion) sidebarVersion.textContent = `v${manifestVersion}`;
    if (aboutVersion && manifestVersion) aboutVersion.textContent = `Version ${manifestVersion}`;

    // 从 storage 全量读取，回填所有表单
    chrome.storage.local.get(null, (stored) => {
      this._modules.forEach((m) => m.load?.(stored || {}));
      if (typeof MaterialSelect !== 'undefined') {
        MaterialSelect.enhanceFieldSelects(document);
      }
    });
  }
}

// ── 启动 ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  new OptionsApp().init();
});
