/**
 * Background Service Worker — NyaTranslate v4.2
 *
 * 架构要点：
 *   - 零硬编码厂商信息：模型 ID / Base URL / API Key 全部动态读自 storage
 *   - 适配器模式保留（OpenAIAdapter / ClaudeAdapter），入口改为动态 cfg
 *   - 适配器层统一 30s 真超时（AbortController 中止底层 fetch），
 *     429/5xx/网络异常自动重试 1 次（800ms 退避），重试信息不污染用户文案
 *   - 错误统一脱敏（sk-xxx）并按状态码映射为友好文案，原始错误只进 console
 *   - 批级完成回执 nya-multi-done；HistoryManager 写入串行化 + 同原文同模型 1 分钟内去重
 *   - 单词结果 LRU 缓存 wordCache（上限 500）；生词本 wordBook；视觉模型独立开关 visionEnabled
 *   - 右键「翻译所选文字」走多引擎 dispatch；历史开关 historyEnabled
 *   - 截图调度权移交 background：keyboard shortcut + 右键菜单直接 captureVisibleTab
 *     并 push dataUrl 给 content（消除 popup 关闭导致的时序问题）
 */

'use strict';

// ─── 存储 Schema 默认值与常量 ───────────────────────────────────────────────

const DEFAULT_OPENAI_BASE_URL    = 'https://api.openai.com/v1';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

/** 适配器请求超时（真 abort 底层 fetch） */
const REQUEST_TIMEOUT_MS   = 30000;
/** 失败重试退避间隔 */
const RETRY_BACKOFF_MS     = 800;
/** 图片最大体积（8MB） */
const IMAGE_MAX_BYTES      = 8 * 1024 * 1024;
/** 图片拉取超时 */
const IMAGE_FETCH_TIMEOUT_MS = 15000;
/** 单词结果缓存（LRU） */
const WORD_CACHE_KEY       = 'wordCache';
const WORD_CACHE_MAX       = 500;
/** 生词本 */
const WORD_BOOK_KEY        = 'wordBook';

/**
 * @returns {string}
 */
function newModelRowId() {
  try {
    return crypto.randomUUID();
  } catch (_) {
    return `m-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}

/**
 * @returns {string}
 */
function newRequestId() {
  try {
    return crypto.randomUUID();
  } catch (_) {
    return `r-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * 统一解析 models：支持 v4 独立鉴权结构，并兼容旧版全局 Key + 旧 models 行。
 * 旧格式行（{id:'gpt-4o', provider:'openai'}）保留原始 id 作为行 id，
 * 与 content 侧 _normalizeModelRow 的卡片 key 同源，消除两端 id 不一致。
 * @typedef {{ id: string, modelId: string, displayName: string, protocol: 'openai'|'anthropic', baseUrl: string, apiKey: string, enabled: boolean, visionEnabled: boolean }} ModelRow
 * @param {Record<string, unknown>} stored
 * @returns {ModelRow[]}
 */
function ensureModelsArray(stored) {
  const globals = {
    openaiKey:       String(stored.openaiKey || ''),
    openaiBaseUrl:   String(stored.openaiBaseUrl || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, ''),
    anthropicKey:    String(stored.anthropicKey || ''),
    anthropicBaseUrl: String(stored.anthropicBaseUrl || DEFAULT_ANTHROPIC_BASE_URL).replace(/\/$/, ''),
  };

  const raw = Array.isArray(stored.models) ? stored.models : [];
  /** @type {ModelRow[]} */
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
    });
  };

  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;

    if (m.modelId != null && (m.protocol === 'openai' || m.protocol === 'anthropic')) {
      const proto = m.protocol === 'anthropic' ? 'anthropic' : 'openai';
      const defBase = proto === 'anthropic' ? DEFAULT_ANTHROPIC_BASE_URL : DEFAULT_OPENAI_BASE_URL;
      pushRow({
        id:            m.id,
        modelId:       m.modelId,
        displayName:   m.displayName != null ? m.displayName : m.modelId,
        protocol:      proto,
        baseUrl:       m.baseUrl != null && String(m.baseUrl).trim() ? m.baseUrl : defBase,
        apiKey:        m.apiKey != null ? m.apiKey : '',
        enabled:       m.enabled,
        visionEnabled: m.visionEnabled === true,
      });
      continue;
    }

    // 旧格式行：{id:'gpt-4o', provider:'openai'} —— 保留原始 id，不再生成随机 UUID
    const oldApiName = String(m.id || '').trim();
    if (!oldApiName) continue;
    const proto = m.provider === 'anthropic' ? 'anthropic' : 'openai';
    pushRow({
      id:            oldApiName,
      modelId:       oldApiName,
      displayName:   oldApiName,
      protocol:      proto,
      baseUrl:       proto === 'anthropic' ? globals.anthropicBaseUrl : globals.openaiBaseUrl,
      apiKey:        proto === 'anthropic' ? globals.anthropicKey : globals.openaiKey,
      enabled:       m.enabled !== false,
      visionEnabled: m.visionEnabled === true,
    });
  }

  const legacyText = (stored.textModelId && String(stored.textModelId).trim()) || '';
  const legacyProto = stored.textModelProtocol === 'anthropic' ? 'anthropic' : 'openai';
  if (legacyText && !out.some((r) => r.modelId === legacyText)) {
    pushRow({
      id:            legacyText,
      modelId:       legacyText,
      displayName:   legacyText,
      protocol:      legacyProto,
      baseUrl:       legacyProto === 'anthropic' ? globals.anthropicBaseUrl : globals.openaiBaseUrl,
      apiKey:        legacyProto === 'anthropic' ? globals.anthropicKey : globals.openaiKey,
      enabled:       true,
      visionEnabled: false,
    });
  }

  if (out.length === 0) {
    return [
      {
        id: 'gpt-4o',
        modelId: 'gpt-4o',
        displayName: 'GPT-4o',
        protocol: 'openai',
        baseUrl: DEFAULT_OPENAI_BASE_URL,
        apiKey: '',
        enabled: true,
        visionEnabled: false,
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        modelId: 'claude-3-5-sonnet-20241022',
        displayName: 'Claude 3.5 Sonnet',
        protocol: 'anthropic',
        baseUrl: DEFAULT_ANTHROPIC_BASE_URL,
        apiKey: '',
        enabled: true,
        visionEnabled: false,
      },
      {
        id: 'deepseek-chat',
        modelId: 'deepseek-chat',
        displayName: 'DeepSeek Chat',
        protocol: 'openai',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: '',
        enabled: true,
        visionEnabled: false,
      },
    ];
  }

  return out;
}

/**
 * @param {Record<string, unknown>} stored
 * @param {{ targetModelId?: string, modelId?: string }} [override]
 */
function buildCfgForModel(stored, override) {
  const models = ensureModelsArray(stored);
  const target = (override?.targetModelId || override?.modelId || '').trim();

  let row = target
    ? models.find((m) => m.id === target)
    : null;

  if (!row) {
    row = models.find((m) => m.enabled) || null;
  }

  if (!row) {
    return {
      protocol:    'openai',
      model:       '',
      baseUrl:     '',
      apiKey:      '',
      label:       '',
      hasRow:      false,
      missingKey:  false,
    };
  }

  const protocol = row.protocol === 'anthropic' ? 'anthropic' : 'openai';
  const base = (row.baseUrl || (protocol === 'anthropic' ? DEFAULT_ANTHROPIC_BASE_URL : DEFAULT_OPENAI_BASE_URL))
    .replace(/\/$/, '');
  const apiKey = (row.apiKey || '').trim();
  const model = (row.modelId || '').trim();
  const fullUrl = protocol === 'anthropic'
    ? `${base}/messages`
    : `${base}/chat/completions`;

  const label = (row.displayName || '').trim() || model || (protocol === 'anthropic' ? 'Claude' : 'AI');

  return {
    protocol,
    model,
    baseUrl: fullUrl,
    apiKey,
    label,
    hasRow:     true,
    missingKey: !apiKey,
  };
}

/**
 * 按请求类型差异化 max_tokens：dictionary-complex / combined 输出较长，放宽到 2048。
 * @param {string} type
 * @returns {number}
 */
function maxTokensForType(type) {
  switch (type) {
    case 'dictionary-complex':
    case 'combined':
    case 'vision':
      return 2048;
    case 'translate':
    case 'dictionary':
    default:
      return 1024;
  }
}

/**
 * 按需读取运行所需配置键，替代 get(null) 全量读库（storage 中可能含大量历史记录）。
 * @returns {Promise<Record<string, unknown>>}
 */
async function getSettings() {
  return chrome.storage.local.get([
    'models',
    'wordDetailEnabled',
    'exampleSentenceMode',
    'historyEnabled',
    'wordCache',
  ]);
}


// ─── 系统 Prompt 工厂 ───────────────────────────────────────────────────────

function buildSystemPrompt(type) {
  if (type === 'translate') {
    return (
      '你是一位专业翻译。请将用户发送的文本翻译成中文。' +
      '若原文已是中文，则翻译成英文。' +
      '只输出翻译结果，不要添加任何解释、前缀或引号。'
    );
  }
  if (type === 'explain') {
    return (
      '你是一位知识渊博的专家。请对用户发送的专业术语或概念给出简洁、清晰、专业的解释。' +
      '解释应包含：核心定义（1-2 句）、使用场景或领域背景（1-2 句）。' +
      '使用中文回答，语言简练，不要用 Markdown 格式。'
    );
  }
  if (type === 'combined') {
    return (
      '你是翻译与术语解释专家。请对用户发送的文本同时完成以下两项任务，' +
      '严格按照以下 Markdown 格式输出，不要添加任何额外说明：\n\n' +
      '### 翻译\n' +
      '（将文本翻译成中文；若原文已是中文则译为英文；只输出译文本身）\n\n' +
      '### 解释\n' +
      '（对文本中的核心术语或概念给出简洁专业解释：核心定义 1-2 句 + 使用场景或领域背景 1-2 句；用中文作答）'
    );
  }
  if (type === 'dictionary') {
    return (
      '你是一位专业的英语词典编纂者。用户会发送一个英语单词，请按以下格式输出：\n\n' +
      '### 词典\n' +
      '**音标**：用国际音标标注（英式和美式）\n' +
      '**词性**：列出所有主要词性及中文释义\n' +
      '**释义**：每个词性下列出 1-3 个常用中文释义\n' +
      '**例句**：给出 2-3 个地道的英文例句及中文翻译（例句应简洁自然，适合学习者理解）\n' +
      '**常见搭配**：列出 2-4 个常用搭配短语\n' +
      '**同义词**：列出 2-3 个同义词\n\n' +
      '使用 Markdown 格式，语言简洁专业。如果单词有多个词性，分别列出。'
    );
  }
  if (type === 'dictionary-complex') {
    return (
      '你是一位资深的英语语言学家和词典编纂者。用户会发送一个英语单词，请按以下格式输出：\n\n' +
      '### 词典\n' +
      '**音标**：用国际音标标注（英式和美式）\n' +
      '**词性**：列出所有主要词性\n' +
      '**词源**：简要说明词源历史（如有意思的词源故事）\n' +
      '**释义**：每个词性下列出 3-5 个详细释义，包含引申义和专业领域用法\n' +
      '**例句**：给出 3-5 个涵盖不同场景的英文例句及中文翻译（包括正式、口语、学术等语境）\n' +
      '**常见搭配**：列出 4-6 个常用搭配短语及例句\n' +
      '**同义词辨析**：列出 3-4 个同义词，并简要说明它们之间的细微差别\n' +
      '**词族**：列出相关的派生词（如名词→形容词→副词→动词形式）\n\n' +
      '使用 Markdown 格式，内容丰富专业。如果单词有多个词性，分别详细列出。'
    );
  }
  if (type === 'vision') {
    return '请识别图中文字，并在保持原有段落排版的情况下，将其翻译为流畅的中文。';
  }
  return '你是一个助手，请回答用户的问题。';
}

// ═══════════════════════════════════════════════════════════════════════════
//  网络层：真超时 + 自动重试 + 错误脱敏
// ═══════════════════════════════════════════════════════════════════════════

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 对 sk-xxx 形态的文本做脱敏（sk-***）。
 * @param {string} text
 * @returns {string}
 */
function sanitizeSk(text) {
  return String(text || '').replace(/\bsk-[A-Za-z0-9_-]+/g, 'sk-***');
}

/**
 * 带 AbortController 的真超时 fetch：超时即中止底层请求并抛带标记的异常。
 * 网络异常抛出 { network: true } 的 Error，超时抛出 { timeout: true, timeoutMs } 的 Error。
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
      const err = new Error(`请求超时(${Math.round(timeoutMs / 1000)}s)`);
      err.timeout = true;
      err.timeoutMs = timeoutMs;
      throw err;
    }
    const err = new Error(e?.message || '网络请求失败');
    err.network = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 带自动重试的执行器：对 429/5xx/网络异常自动重试 1 次（退避 800ms），
 * 重试仍失败才抛错。重试过程仅 console.warn（已脱敏），不污染用户可见文案。
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ retries?: number, backoffMs?: number }} [opts]
 * @returns {Promise<T>}
 */
async function withRetry(fn, opts) {
  const retries  = opts?.retries ?? 1;
  const backoffMs = opts?.backoffMs ?? RETRY_BACKOFF_MS;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      const status = typeof e?.status === 'number' ? e.status : 0;
      const retryable = status === 429 || (status >= 500 && status <= 599) || e?.network === true;
      if (!retryable || attempt >= retries) break;
      console.warn(
        `[NyaTranslate] 请求失败（尝试 ${attempt + 1}/${retries + 1}），${backoffMs}ms 后自动重试：`,
        sanitizeSk(e?.message || String(e))
      );
      await sleep(backoffMs);
    }
  }
  throw lastErr;
}

/**
 * 统一把异常映射为面向用户的友好文案，并对任何 sk-xxx 形态原文做脱敏。
 * 原始错误信息只允许通过 console.error 输出，绝不进入用户可见消息。
 * @param {unknown} err
 * @returns {string}
 */
function friendlyError(err) {
  const status = typeof err?.status === 'number' ? err.status : 0;
  if (status === 401 || status === 403) return 'API Key 无效,请在设置中检查';
  if (status === 429) return '请求过于频繁,请稍后重试';
  if (status >= 500 && status <= 599) return '服务暂时不可用,请稍后重试';
  if (err?.timeout === true || err?.name === 'AbortError') {
    const sec = typeof err?.timeoutMs === 'number' ? Math.round(err.timeoutMs / 1000) : 30;
    return `请求超时(${sec}s)`;
  }
  if (err?.network === true) return '网络请求失败,请检查网络与 Base URL';

  const raw = err?.message || String(err || '未知错误');
  return sanitizeSk(raw) || '请求失败,请重试';
}

// ═══════════════════════════════════════════════════════════════════════════
//  适配器一：OpenAI 兼容协议
//  超时 / 重试 / 状态码映射统一收敛在 _request 层，所有视觉与文本路径共享
// ═══════════════════════════════════════════════════════════════════════════

class OpenAIAdapter {
  /**
   * @param {string} text
   * @param {string} systemPrompt
   * @param {string} apiKey
   * @param {{ model:string, baseUrl:string }} cfg
   * @param {number} [maxTokens]
   */
  static async fetchText(text, systemPrompt, apiKey, cfg, maxTokens) {
    const body = {
      model:       cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: text },
      ],
      stream:      false,
      max_tokens:  maxTokens ?? maxTokensForType('translate'),
      temperature: 0.3,
    };
    return OpenAIAdapter._request(cfg.baseUrl, apiKey, body);
  }

  /**
   * @param {string} base64
   * @param {string} mimeType
   * @param {string} systemPrompt
   * @param {string} apiKey
   * @param {{ model:string, baseUrl:string }} cfg
   * @param {number} [maxTokens]
   */
  static async fetchVision(base64, mimeType, systemPrompt, apiKey, cfg, maxTokens) {
    const body = {
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type:      'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
      stream:      false,
      max_tokens:  maxTokens ?? maxTokensForType('vision'),
      temperature: 0.3,
    };
    return OpenAIAdapter._request(cfg.baseUrl, apiKey, body);
  }

  /**
   * 底层请求：30s 真超时（AbortController）+ 429/5xx/网络异常自动重试 1 次。
   * 抛出的异常携带 status / network / timeout 标记，供重试判定与友好文案映射。
   * @param {string} url
   * @param {string} apiKey
   * @param {object} body
   * @returns {Promise<string>}
   */
  static async _request(url, apiKey, body) {
    return withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify(body),
      }, REQUEST_TIMEOUT_MS);

      if (!response.ok) {
        let errMsg = `API 请求失败 (HTTP ${response.status})`;
        try {
          const d = await response.json();
          if (d?.error?.message) errMsg = d.error.message;
        } catch (_) { /* 忽略 JSON 解析失败 */ }
        const err = new Error(errMsg);
        err.status = response.status;
        throw err;
      }

      const data    = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('模型返回了空内容，请重试。');
      return content.trim();
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  适配器二：Anthropic 协议（Claude）
// ═══════════════════════════════════════════════════════════════════════════

class ClaudeAdapter {
  /**
   * @param {string} text
   * @param {string} systemPrompt
   * @param {string} apiKey
   * @param {{ model:string, baseUrl:string }} cfg
   * @param {number} [maxTokens]
   */
  static async fetchText(text, systemPrompt, apiKey, cfg, maxTokens) {
    const body = {
      model:      cfg.model,
      max_tokens: maxTokens ?? maxTokensForType('translate'),
      system:     systemPrompt,
      messages: [
        { role: 'user', content: text },
      ],
    };
    return ClaudeAdapter._request(cfg.baseUrl, apiKey, body);
  }

  /**
   * @param {string} base64
   * @param {string} mimeType
   * @param {string} systemPrompt
   * @param {string} apiKey
   * @param {{ model:string, baseUrl:string }} cfg
   * @param {number} [maxTokens]
   */
  static async fetchVision(base64, mimeType, systemPrompt, apiKey, cfg, maxTokens) {
    const body = {
      model:      cfg.model,
      max_tokens: maxTokens ?? maxTokensForType('vision'),
      system:     systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type:   'image',
              source: {
                type:       'base64',
                media_type: mimeType,
                data:       base64,
              },
            },
          ],
        },
      ],
    };
    return ClaudeAdapter._request(cfg.baseUrl, apiKey, body);
  }

  /**
   * 底层请求：30s 真超时（AbortController）+ 429/5xx/网络异常自动重试 1 次。
   * @param {string} url
   * @param {string} apiKey
   * @param {object} body
   * @returns {Promise<string>}
   */
  static async _request(url, apiKey, body) {
    return withRetry(async () => {
      const response = await fetchWithTimeout(url, {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey.trim(),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      }, REQUEST_TIMEOUT_MS);

      if (!response.ok) {
        let errMsg = `API 请求失败 (HTTP ${response.status})`;
        try {
          const d = await response.json();
          if (d?.error?.message) errMsg = d.error.message;
        } catch (_) { /* 忽略 JSON 解析失败 */ }
        const err = new Error(errMsg);
        err.status = response.status;
        throw err;
      }

      const data    = await response.json();
      const content = data?.content?.[0]?.text;
      if (!content) throw new Error('模型返回了空内容，请重试。');
      return content.trim();
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  单词结果 LRU 缓存
//  storage key 'wordCache'，条目 { result, model, ts }，上限 500
// ═══════════════════════════════════════════════════════════════════════════

const WordCache = {
  /** @type {Map<string, {result:string, model:string, ts:number}>|null} */
  _map: null,
  /** 冷启动并发去重:加载中的 promise 单例,防止多实例同时建 Map 互相覆盖 */
  _loadPromise: null,

  /** 懒加载到内存（chrome.storage 无法存 Map，与 [word, entry] 数组互转） */
  _load() {
    if (this._map) return Promise.resolve(this._map);
    if (this._loadPromise) return this._loadPromise;
    this._loadPromise = chrome.storage.local.get(WORD_CACHE_KEY).then((stored) => {
      const arr = stored[WORD_CACHE_KEY];
      const map = new Map();
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (!Array.isArray(item) || item.length < 2) continue;
          const [word, entry] = item;
          if (typeof word === 'string' && entry && typeof entry.result === 'string') {
            map.set(word.toLowerCase(), {
              result: entry.result,
              model:  String(entry.model || ''),
              ts:     typeof entry.ts === 'number' ? entry.ts : 0,
            });
          }
        }
      }
      this._map = map;
      this._loadPromise = null;
      return map;
    }).catch((err) => {
      this._loadPromise = null;
      console.warn('[NyaTranslate][WordCache] 加载失败:', err);
      return new Map();
    });
  },

  /**
   * 查询缓存：命中时刷新 LRU 顺序并异步持久化。
   * @param {string} word
   * @returns {Promise<{result:string, model:string, ts:number}|null>}
   */
  async get(word) {
    const map = await this._load();
    const key = String(word || '').toLowerCase().trim();
    if (!key) return null;
    const entry = map.get(key);
    if (!entry) return null;
    // LRU：命中后重新 set，使其排到队尾（最近使用）
    map.delete(key);
    map.set(key, entry);
    this._persist();
    return entry;
  },

  /**
   * 写入缓存并触发 LRU 淘汰（超出上限时移除队首最久未用条目）。
   * @param {string} word
   * @param {{ result:string, model:string }} entry
   */
  async set(word, entry) {
    const map = await this._load();
    const key = String(word || '').toLowerCase().trim();
    if (!key) return;
    map.delete(key);
    map.set(key, { result: String(entry.result || ''), model: String(entry.model || ''), ts: Date.now() });
    while (map.size > WORD_CACHE_MAX) {
      const oldest = map.keys().next().value;
      map.delete(oldest);
    }
    this._persist();
  },

  /** 异步持久化,通过 promise 链串行化,失败仅告警,不影响主流程 */
  _persist() {
    if (!this._map) return;
    const arr = Array.from(this._map.entries());
    WordCache._persistQueue = (WordCache._persistQueue || Promise.resolve())
      .then(() => chrome.storage.local.set({ [WORD_CACHE_KEY]: arr }))
      .catch(() => {});
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//  请求分发器 — 文本翻译/解释
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 文本翻译/解释统一入口（v3 兼容编程接口，消息路径已移除但保留函数形态，
 * 与多引擎路径共享适配器层的超时 / 重试 / 脱敏）。
 * @param {string} text
 * @param {string} type  'translate' | 'explain' | 'combined'
 * @param {{ targetModelId?: string, modelId?: string }} [override] 面板所选模型配置行 id
 * @returns {Promise<string>}
 */
async function fetchLLM(text, type, override) {
  const s = await getSettings();
  const cfg = buildCfgForModel(s, override || {});

  if (!cfg.hasRow) {
    throw Object.assign(
      new Error('没有可用的已启用模型，请前往设置页添加并启用至少一个模型。'),
      { notConfigured: true }
    );
  }

  if (cfg.missingKey || !cfg.apiKey) {
    throw Object.assign(
      new Error('该模型的 API Key 未配置，请前往设置页填写'),
      { notConfigured: true }
    );
  }

  if (!cfg.model) {
    throw Object.assign(
      new Error('该模型的 Model ID 无效，请前往设置页检查。'),
      { notConfigured: true }
    );
  }

  const wordDetailEnabled = s.wordDetailEnabled !== false;
  const trimmedText = text.trim();
  const isSingleWord = wordDetailEnabled && trimmedText.split(/\s+/).length === 1 && /^[a-zA-Z'-]+$/.test(trimmedText);
  const complexity = s.exampleSentenceMode || 'simple';
  const dictType = complexity === 'complex' ? 'dictionary-complex' : 'dictionary';
  const systemPrompt = isSingleWord
    ? buildSystemPrompt(dictType)
    : buildSystemPrompt(type);
  const maxTokens = maxTokensForType(isSingleWord ? dictType : type);

  if (cfg.protocol === 'anthropic') {
    return ClaudeAdapter.fetchText(text, systemPrompt, cfg.apiKey, cfg, maxTokens);
  }
  return OpenAIAdapter.fetchText(text, systemPrompt, cfg.apiKey, cfg, maxTokens);
}

// ═══════════════════════════════════════════════════════════════════════════
//  请求分发器 — 视觉（图片/截图）翻译
//  使用第一个 enabled 且 visionEnabled 的模型；无视觉模型时给出明确报错
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 解析当前可用的视觉模型行（第一个 enabled 且 visionEnabled）。
 * @param {Record<string, unknown>} stored
 * @returns {ModelRow|null}
 */
function resolveVisionRow(stored) {
  const models = ensureModelsArray(stored);
  const vision = models.find((m) => m.enabled && m.visionEnabled);
  if (vision) return vision;
  // 兼容 v4.1 存量配置:没有任何模型显式开启"视觉"时,
  // 回退到第一个已启用模型(旧行为),避免升级后截图翻译立即失效
  return models.find((m) => m.enabled) || null;
}

/**
 * 视觉翻译统一入口（截图 / 右键图片共用）。
 * @param {string} base64
 * @param {string} mimeType
 * @returns {Promise<string>}
 */
async function fetchVision(base64, mimeType) {
  const s = await getSettings();
  const visionRow = resolveVisionRow(s);

  if (!visionRow) {
    throw new Error('尚未启用任何模型，请前往设置页启用至少一个模型');
  }

  const cfg = buildCfgForModel(s, { targetModelId: visionRow.id });

  if (cfg.missingKey || !cfg.apiKey) {
    throw Object.assign(
      new Error('该模型的 API Key 未配置，请前往设置页填写'),
      { notConfigured: true }
    );
  }

  if (!cfg.model) {
    throw Object.assign(
      new Error('该模型的 Model ID 无效，请前往设置页检查。'),
      { notConfigured: true }
    );
  }

  const systemPrompt = buildSystemPrompt('vision');

  if (cfg.protocol === 'anthropic') {
    return ClaudeAdapter.fetchVision(base64, mimeType, systemPrompt, cfg.apiKey, cfg, maxTokensForType('vision'));
  }
  return OpenAIAdapter.fetchVision(base64, mimeType, systemPrompt, cfg.apiKey, cfg, maxTokensForType('vision'));
}

// ═══════════════════════════════════════════════════════════════════════════
//  多引擎并发调度器
//  对标沙拉查词：一次性向所有已启用模型发起并行请求，
//  每个完成（或报错）后立即通过 chrome.tabs.sendMessage 单独推送回 content，
//  绝不等齐所有模型；批次结束后补发 nya-multi-done 完成回执。
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 单模型执行单元：负责校验、单词缓存命中检查、发起 API、推送结果或错误。
 * 任何异常都被自身吞下，不会冒泡导致 Promise.all 整体 reject。
 * @param {ModelRow} row
 * @param {Record<string, unknown>} stored
 * @param {{ text:string, requestId:string, tabId:number, pageTitle:string }} ctx
 * @returns {Promise<boolean>} 成功返回 true，失败返回 false
 */
async function runOneModel(row, stored, { text, requestId, tabId, pageTitle, type }) {
  const cfg   = buildCfgForModel(stored, { targetModelId: row.id });
  const label = cfg.label || row.displayName || row.modelId;

  const fail = (err, notConfigured = false) => {
    chrome.tabs.sendMessage(tabId, {
      action:        'nya-multi-result',
      requestId,
      modelRowId:    row.id,
      status:        'error',
      error:         friendlyError(err),
      notConfigured: !!notConfigured || !!err?.notConfigured,
      label,
    }).catch(() => {});
    return false;
  };

  const pushSuccess = (result, extra = {}) => {
    chrome.tabs.sendMessage(tabId, {
      action:     'nya-multi-result',
      requestId,
      modelRowId: row.id,
      status:     'success',
      result,
      label,
      ...extra,
    }).catch(() => {});
    return true;
  };

  if (!cfg.hasRow)    return fail(new Error('模型配置丢失'), true);
  if (cfg.missingKey) return fail(new Error('该模型的 API Key 未配置，请前往设置页填写'), true);
  if (!cfg.model)     return fail(new Error('该模型的 Model ID 无效，请前往设置页检查'), true);

  try {
    const wordDetailEnabled = stored.wordDetailEnabled !== false;
    const trimmedText = text.trim();
    const isSingleWord = wordDetailEnabled && trimmedText.split(/\s+/).length === 1 && /^[a-zA-Z'-]+$/.test(trimmedText);
    console.debug('[NyaTranslate] wordDetect:', { wordDetailEnabled, isSingleWord });
    const complexity = stored.exampleSentenceMode || 'simple';
    const dictType = complexity === 'complex' ? 'dictionary-complex' : 'dictionary';
    // per-request 意图:仅接受受控枚举,非法值回退 combined(兼容旧消息)
    const intent = (type === 'translate' || type === 'explain' || type === 'combined') ? type : 'combined';
    const sysPrompt = isSingleWord ? buildSystemPrompt(dictType) : buildSystemPrompt(intent);
    const maxTokens = maxTokensForType(isSingleWord ? dictType : intent);

    // 单词结果缓存：命中则直接推送成功（cached:true），不发 LLM 请求、不写历史
    if (isSingleWord) {
      const hit = await WordCache.get(trimmedText);
      if (hit) {
        // 日志不记录用户划选的单词原文(隐私)
        console.debug('[NyaTranslate] 单词缓存命中:', { length: trimmedText.length, model: hit.model });
        return pushSuccess(hit.result, { cached: true });
      }
    }

    const adapter = cfg.protocol === 'anthropic' ? ClaudeAdapter : OpenAIAdapter;
    const result  = await adapter.fetchText(text, sysPrompt, cfg.apiKey, cfg, maxTokens);

    // 单词词典结果写入 LRU 缓存
    if (isSingleWord) {
      await WordCache.set(trimmedText, { result, model: label });
    }

    await pushSuccess(result);

    HistoryManager.save({
      originalText: text,
      result,
      model: label,
      pageTitle,
      requestId,
    });

    return true;
  } catch (err) {
    return fail(err);
  }
}

/**
 * 多引擎并行入口：读取所有 enabled 模型，Promise.all 同时发车，
 * 每个 settle 立即通过 chrome.tabs.sendMessage 单独推送结果；
 * 批次结束后补发 nya-multi-done 完成回执（含成功/失败/跳过数量）。
 * @param {{ text:string, requestId:string, tabId:number, pageTitle:string, onlyModelId?:string, type?:string }} ctx
 */
async function dispatchMultiTranslate({ text, requestId, tabId, pageTitle, onlyModelId, type }) {
  const stored  = await getSettings();
  const all     = ensureModelsArray(stored).filter((m) => m.enabled);
  const onlyId  = String(onlyModelId || '').trim();

  // 首选模型：提供 onlyModelId 时仅请求该模型，其余 enabled 模型计入 skipped
  let enabled, skipped;
  if (onlyId) {
    enabled = all.filter((m) => m.id === onlyId);
    skipped = all.length - enabled.length;
    // 首选模型 id 失效（如设置页已删除该行）时回退为全部并发，保证有结果
    if (enabled.length === 0) {
      enabled = all;
      skipped = 0;
    }
  } else {
    enabled = all;
    skipped = 0;
  }

  if (enabled.length === 0) {
    chrome.tabs.sendMessage(tabId, {
      action: 'nya-multi-empty',
      requestId,
      error:  '尚未启用任何模型，请前往设置页配置。',
    }).catch(() => {});
    return;
  }

  let ok = 0;
  let failCount = 0;
  await Promise.all(enabled.map(async (row) => {
    const success = await runOneModel(row, stored, { text, requestId, tabId, pageTitle, type });
    if (success) ok += 1;
    else failCount += 1;
  }));

  // 批级完成回执：SW 终止或消息丢失时 content 侧可据此兜底，避免卡片永久 loading
  chrome.tabs.sendMessage(tabId, {
    action:   'nya-multi-done',
    requestId,
    ok,
    fail: failCount,
    skipped,
  }).catch(() => {});
}

/**
 * 单卡片重试入口：仅对一个 modelRowId 重新发起请求。
 * @param {{ text:string, requestId:string, modelRowId:string, tabId:number, pageTitle:string, type?:string }} ctx
 */
async function dispatchSingleTranslate({ text, requestId, modelRowId, tabId, pageTitle, type }) {
  const stored = await getSettings();
  const row    = ensureModelsArray(stored).find((m) => m.id === modelRowId && m.enabled);

  if (!row) {
    chrome.tabs.sendMessage(tabId, {
      action:     'nya-multi-result',
      requestId,
      modelRowId,
      status:     'error',
      error:      '该模型不存在或已禁用',
      label:      '',
    }).catch(() => {});
    return;
  }

  await runOneModel(row, stored, { text, requestId, tabId, pageTitle, type });
}

// ═══════════════════════════════════════════════════════════════════════════
//  HistoryManager — 本地翻译历史（chrome.storage.local）
//  写入通过模块级 promise 队列串行化，消除并发 lost-update；
//  同一原文 + 同一模型在 1 分钟内重复写入时去重（跳过）。
// ═══════════════════════════════════════════════════════════════════════════

/** 模块级串行队列：所有 save / clear 依次执行 */
let historySaveQueue = Promise.resolve();

class HistoryManager {
  static MAX_RECORDS = 200;
  static STORAGE_KEY = 'translationHistory';
  /** 批次去重键集合(仅存于 SW 内存):键 = requestId|原文|模型,值 = 时间戳 */
  static _recentKeys = new Map();

  static save({ originalText, result, model, pageTitle, requestId }) {
    const task = historySaveQueue.then(async () => {
      const stored = await chrome.storage.local.get(['historyEnabled', HistoryManager.STORAGE_KEY]);

      // 历史开关：默认开启；关闭时直接跳过
      if (stored.historyEnabled === false) return;

      const list = Array.isArray(stored[HistoryManager.STORAGE_KEY])
        ? stored[HistoryManager.STORAGE_KEY]
        : [];

      const normText  = (originalText || '').slice(0,500);
      const normModel = (model || 'unknown');
      const now       = Date.now();

      // 按"批次 + 原文 + 模型"去重:同批次内的重试/重复回执不重复写,
      // 而不同批次(用户 1 分钟内重译同一段)的正常记录不受影响
      const batchKey = `${String(requestId || '')}|${normText}|${normModel}`;
      const recent   = HistoryManager._recentKeys.get(batchKey) || 0;
      if (recent && now - recent < 600000) return;
      HistoryManager._recentKeys.set(batchKey, now);
      // 清理过期键,防止集合无限增长
      if (HistoryManager._recentKeys.size > 400) {
        for (const [k, ts] of HistoryManager._recentKeys) {
          if (now - ts >= 600000) HistoryManager._recentKeys.delete(k);
        }
      }

      const record = {
        id:           `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp:    now,
        originalText: normText,
        result:       (result || '').slice(0, 2000),
        model:        normModel,
        pageTitle:    (pageTitle || '').slice(0, 100),
      };

      list.unshift(record);
      if (list.length > HistoryManager.MAX_RECORDS) {
        list = list.slice(0, HistoryManager.MAX_RECORDS);
      }

      await chrome.storage.local.set({ [HistoryManager.STORAGE_KEY]: list });
    });

    // 队列吞掉单次失败，避免一个错误卡死后续写入
    historySaveQueue = task.catch((err) => {
      console.warn('[NyaTranslate][History] 存储历史失败:', err);
    });
    return historySaveQueue;
  }

  static async getAll() {
    return HistoryManager._load();
  }

  static async clear() {
    const task = historySaveQueue.then(() =>
      chrome.storage.local.set({ [HistoryManager.STORAGE_KEY]: [] })
    );
    historySaveQueue = task.catch((err) => {
      console.warn('[NyaTranslate][History] 清空历史失败:', err);
    });
    return historySaveQueue;
  }

  static async _load() {
    const stored = await chrome.storage.local.get([HistoryManager.STORAGE_KEY]);
    const list   = stored[HistoryManager.STORAGE_KEY];
    return Array.isArray(list) ? list : [];
  }

  /** 单条删除:入队串行执行,返回删除后的完整列表 */
  static async remove(id) {
    const task = historySaveQueue.then(async () => {
      const list = await HistoryManager._load();
      const next = list.filter((r) => r && String(r.id) !== String(id || ''));
      await chrome.storage.local.set({ [HistoryManager.STORAGE_KEY]: next });
      return next;
    });
    historySaveQueue = task.catch((err) => {
      console.warn('[NyaTranslate][History] 删除历史失败:', err);
    });
    return historySaveQueue;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  生词本 — storage key 'wordBook'
//  数组 [{ id, word, result, ts }]，支持追加/去重、查询、按 id 删除、清空
// ═══════════════════════════════════════════════════════════════════════════

async function wordbookGet() {
  const stored = await chrome.storage.local.get(WORD_BOOK_KEY);
  return Array.isArray(stored[WORD_BOOK_KEY]) ? stored[WORD_BOOK_KEY] : [];
}

/**
 * 追加或去重更新生词（同单词忽略大小写视为重复，去重时保留原 id、刷新内容）。
 * @param {{ word?:string, result?:string }} payload
 * @returns {Promise<object[]>}
 */
async function wordbookAdd(payload) {
  const word = String(payload?.word || '').trim();
  if (!word) return wordbookGet();
  const list = await wordbookGet();
  const key  = word.toLowerCase();
  const idx  = list.findIndex((it) => it && String(it.word || '').toLowerCase() === key);
  const entry = {
    id:     `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    word,
    result: String(payload?.result || '').slice(0, 2000),
    ts:     Date.now(),
  };
  if (idx >= 0) {
    list[idx] = { ...entry, id: list[idx].id };
  } else {
    list.unshift(entry);
  }
  await chrome.storage.local.set({ [WORD_BOOK_KEY]: list });
  return list;
}

/**
 * @param {string} id
 * @returns {Promise<object[]>}
 */
async function wordbookRemove(id) {
  const list = (await wordbookGet()).filter((it) => it && it.id !== id);
  await chrome.storage.local.set({ [WORD_BOOK_KEY]: list });
  return list;
}

/**
 * @returns {Promise<void>}
 */
async function wordbookClear() {
  await chrome.storage.local.set({ [WORD_BOOK_KEY]: [] });
}

// ═══════════════════════════════════════════════════════════════════════════
//  截图调度器
//  background 直接拥有 captureVisibleTab 控制权，push dataUrl 给 content
//  消除 popup 关闭导致的时序问题
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 对指定 tab 截取当前视口，并将 dataUrl push 给 content 的 ScreenshotOverlay
 * @param {{ id: number, windowId: number }} tab
 */
async function initiateScreenshot(tab) {
  let dataUrl;
  try {
    dataUrl = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, (url) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(url);
        }
      });
    });
  } catch (e) {
    console.error('[NyaTranslate][Screenshot] captureVisibleTab 失败:', e);
    chrome.tabs.sendMessage(tab.id, {
      action: 'nya-vision-error',
      error:  friendlyError(e),
    }).catch(() => {});
    return;
  }

  // 将截图 dataUrl 直接 push 给 content，由 ScreenshotOverlay 接管
  chrome.tabs.sendMessage(tab.id, {
    action:  'nya-screenshot-start',
    dataUrl,
  }).catch((e) => {
    console.error('[NyaTranslate][Screenshot] 无法发送消息到 content:', e);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  右键菜单注册
// ═══════════════════════════════════════════════════════════════════════════

chrome.contextMenus.removeAll(() => {
  // 图片取词
  chrome.contextMenus.create({
    id:       'nya-translate-image',
    title:    '提取图片文字并翻译 (NyaTranslate)',
    contexts: ['image'],
  });

  // 区域截图翻译（全页面右键均可触发）
  chrome.contextMenus.create({
    id:       'nya-screenshot-area',
    title:    '区域截图翻译 (NyaTranslate)',
    contexts: ['all'],
  });

  // 翻译所选文字（划词被屏蔽 / iframe 等场景的兜底入口）
  chrome.contextMenus.create({
    id:       'nya-translate-selection',
    title:    '翻译所选文字 (NyaTranslate)',
    contexts: ['selection'],
  });
});

// ─── 图片 URL → Base64 工具 ────────────────────────────────────────────────

/**
 * 图片 URL / data URL → Base64。超过 8MB 报错，拉取加 15s 超时。
 * @param {string} srcUrl
 * @returns {Promise<{ base64: string, mimeType: string }>}
 */
async function imageUrlToBase64(srcUrl) {
  if (srcUrl.startsWith('data:')) {
    const [header, data] = srcUrl.split(',');
    const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png';
    // base64 体积约为原始字节的 4/3，据此估算上限
    if (data.length * 3 / 4 > IMAGE_MAX_BYTES) {
      throw new Error('图片过大(>8MB),请缩小后重试');
    }
    return { base64: data, mimeType };
  }

  const response = await fetchWithTimeout(srcUrl, { method: 'GET' }, IMAGE_FETCH_TIMEOUT_MS);
  if (!response.ok) throw new Error(`图片加载失败 (HTTP ${response.status})`);

  const blob     = await response.blob();
  const mimeType = blob.type || 'image/png';

  if (blob.size > IMAGE_MAX_BYTES) {
    throw new Error('图片过大(>8MB),请缩小后重试');
  }

  const buffer = await blob.arrayBuffer();

  const bytes  = new Uint8Array(buffer);
  let   binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return { base64: btoa(binary), mimeType };
}

// ─── 右键菜单事件处理 ─────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // ── 区域截图翻译 ──
  if (info.menuItemId === 'nya-screenshot-area') {
    initiateScreenshot(tab);
    return;
  }

  // ── 翻译所选文字：走多引擎 dispatch，结果逐模型推送到所在 tab ──
  if (info.menuItemId === 'nya-translate-selection') {
    let text = (info.selectionText || '').trim();
    if (!text || !tab?.id) return;

    // 与划词路径一致的 500 字符上限,超长拒绝并提示(防绕过额度保护)
    if (text.length > 500) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'nya-vision-error',
        error:  '所选文本过长(>500 字符)，请分段划选。',
      }).catch(() => {});
      return;
    }

    // 读取偏好:右键路径同样遵守 preferredAction 的 per-request 意图
    const s = await getSettings();
    const pref = s.preferredAction;
    const type = (pref === 'translate' || pref === 'explain' || pref === 'combined') ? pref : 'combined';

    // 先告知 content 打开面板并采纳本批次 requestId，再按多引擎契约推送逐模型结果
    const requestId = newRequestId();
    chrome.tabs.sendMessage(tab.id, {
      action:    'nya-translate-selection',
      text,
      requestId,
    }).catch(() => {});

    dispatchMultiTranslate({
      text,
      requestId,
      type,
      tabId:     tab.id,
      pageTitle: tab.title || '',
    });
    return;
  }

  // ── 图片取词 ──
  if (info.menuItemId === 'nya-translate-image') {
    if (!info.srcUrl) return;

    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'nya-vision-loading' });
    } catch (_) { /* content 可能未就绪 */ }

    try {
      const { base64, mimeType } = await imageUrlToBase64(info.srcUrl);
      const result               = await fetchVision(base64, mimeType);
      const s                    = await getSettings();
      const vRow                 = resolveVisionRow(s);
      const label                = (vRow?.displayName || vRow?.modelId || '').trim() || '视觉';

      await chrome.tabs.sendMessage(tab.id, {
        action: 'nya-vision-result',
        result,
        label,
      });

      HistoryManager.save({
        originalText: `[图片] ${info.srcUrl.slice(0, 80)}`,
        result,
        model:     label,
        pageTitle: tab.title || '',
        requestId: `vision-img-${Date.now()}`,
      });
    } catch (err) {
      console.error('[NyaTranslate][Vision] 图片翻译失败:', sanitizeSk(err?.message || String(err)));
      chrome.tabs.sendMessage(tab.id, {
        action: 'nya-vision-error',
        error:  friendlyError(err),
      }).catch(() => {});
    }
  }
});

// ─── 键盘快捷键处理 ───────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'nya-screenshot') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) initiateScreenshot(tab);
});

// ═══════════════════════════════════════════════════════════════════════════
//  消息路由
//  v3 兼容消息路径（translate / explain / combined）已删除（仓库内无调用方）
// ═══════════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 来源校验：只接受来自本扩展上下文的消息（纵深防御）
  if (sender.id !== chrome.runtime.id) return false;

  const { action } = message;

  // ── 多引擎并行翻译（v4 主路径；支持 onlyModelId 首选模型） ────────────
  if (action === 'nya-multi-translate') {
    if (!sender.tab) return false;
    const { text, requestId, onlyModelId, type } = message;
    if (!text || typeof text !== 'string' || !text.trim()) {
      sendResponse({ success: false, error: '文本无效' });
      return true;
    }
    // 与 content 侧划词限制一致:单条文本上限 500 字符(纵深防御)
    if (text.trim().length > 500) {
      sendResponse({ success: false, error: '文本过长(>500 字符)' });
      return true;
    }
    dispatchMultiTranslate({
      text:        text.trim(),
      requestId:   String(requestId || ''),
      onlyModelId: typeof onlyModelId === 'string' ? onlyModelId.trim() : '',
      type:        typeof type === 'string' ? type : '',
      tabId:       sender.tab.id,
      pageTitle:   sender.tab.title || '',
    });
    sendResponse({ success: true, accepted: true });
    return false;
  }

  // ── 单卡片重试 ─────────────────────────────────────────────────────────
  if (action === 'nya-translate-single') {
    if (!sender.tab) return false;
    const { text, requestId, modelRowId, type } = message;
    if (!text || typeof text !== 'string' || !text.trim() || !modelRowId) {
      sendResponse({ success: false, error: '参数无效' });
      return true;
    }
    dispatchSingleTranslate({
      text:       text.trim(),
      requestId:  String(requestId || ''),
      modelRowId: String(modelRowId),
      type:       typeof type === 'string' ? type : '',
      tabId:      sender.tab.id,
      pageTitle:  sender.tab.title || '',
    });
    sendResponse({ success: true, accepted: true });
    return false;
  }

  // ── 框选完成：content 发来裁剪好的 Base64 ─────────────────────────────
  if (action === 'nya-vision-crop') {
    if (!sender.tab) return false;

    const { base64, mimeType, x, y } = message;

    fetchVision(base64, mimeType)
      .then(async (result) => {
        const s    = await getSettings();
        const vRow = resolveVisionRow(s);
        const label = (vRow?.displayName || vRow?.modelId || '').trim() || '视觉';
        await chrome.tabs.sendMessage(sender.tab.id, {
          action: 'nya-vision-result',
          result,
          label,
          x, y,
        });
        HistoryManager.save({
          originalText: '[截图区域]',
          result,
          model:     label,
          pageTitle: sender.tab?.title || '',
          requestId: `vision-crop-${Date.now()}`,
        });
      })
      .catch((err) => {
        console.error('[NyaTranslate][Vision] 截图翻译失败:', sanitizeSk(err?.message || String(err)));
        chrome.tabs.sendMessage(sender.tab.id, {
          action: 'nya-vision-error',
          error:  friendlyError(err),
        }).catch(() => {});
      });

    sendResponse({ success: true });
    return true;
  }

  // ── 历史记录操作 ──────────────────────────────────────────────────────
  if (action === 'nya-history-get') {
    HistoryManager.getAll()
      .then((list) => sendResponse({ success: true, list }))
      .catch((err) => sendResponse({ success: false, error: friendlyError(err) }));
    return true;
  }

  if (action === 'nya-history-clear') {
    HistoryManager.clear()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: friendlyError(err) }));
    return true;
  }

  // 单条删除:popup 历史 Tab 的删除按钮走此路径(串行队列防并发丢写)
  if (action === 'nya-history-remove') {
    HistoryManager.remove(String(message.id || ''))
      .then((list) => sendResponse({ success: true, list }))
      .catch((err) => sendResponse({ success: false, error: friendlyError(err) }));
    return true;
  }

  // ── 生词本操作 ────────────────────────────────────────────────────────
  if (action === 'nya-wordbook-add') {
    wordbookAdd(message)
      .then((list) => sendResponse({ success: true, list }))
      .catch((err) => sendResponse({ success: false, error: friendlyError(err) }));
    return true;
  }

  if (action === 'nya-wordbook-get') {
    wordbookGet()
      .then((list) => sendResponse({ success: true, list }))
      .catch((err) => sendResponse({ success: false, error: friendlyError(err) }));
    return true;
  }

  if (action === 'nya-wordbook-remove') {
    wordbookRemove(String(message.id || ''))
      .then((list) => sendResponse({ success: true, list }))
      .catch((err) => sendResponse({ success: false, error: friendlyError(err) }));
    return true;
  }

  if (action === 'nya-wordbook-clear') {
    wordbookClear()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: friendlyError(err) }));
    return true;
  }

  return false;
});

console.log('[NyaTranslate] Background Service Worker v4.2 已启动（多引擎并行 + 每模型独立鉴权 + 超时重试脱敏）。');
