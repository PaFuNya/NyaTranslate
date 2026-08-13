/**
 * Popup Script — NyaTranslate v4.2
 *
 * 功能：
 *   - Tab 切换（状态 / 翻译历史 / 生词本）
 *   - 展示 OpenAI 兼容协议 / Anthropic 协议的 Key 配置状态
 *   - 展示当前已启用的模型列表摘要（划词与截图共用）
 *   - 翻译历史：实时搜索（原文 / 译文）、点击复制译文、单条删除、一键清空
 *   - 生词本：词 / 释义摘要 / 时间列表，点击复制、单条删除、清空
 *   - 版本号取自 chrome.runtime.getManifest()，不再硬编码
 *
 * v4.2 变化：
 *   - 历史与生词本条目全部用 createElement + textContent 构建，
 *     杜绝存储型 HTML 注入（修复审计 #10 的 popup 历史渲染未转义问题）
 *   - background 尚未实现 nya-history-remove / nya-wordbook-* 动作，
 *     因此在 popup 内以「读-改-写」方式直操作 chrome.storage.local 作为回退
 *     （消息优先，回退兜底，未来 background 实现后无需改动即可切换）
 *   - 图标统一为 Feather 风格内联 SVG（stroke=2、16px、currentColor），移除 emoji
 */

'use strict';

// ─── 常量 ────────────────────────────────────────────────────────────────────

// 存储键（与 background 的 HistoryManager / 生词本 API 约定保持一致）
const HISTORY_KEY  = 'translationHistory';
const WORDBOOK_KEY = 'wordBook';

// 复制成功反馈的持续时长（按钮图标切换 / 条目高亮）
const COPY_FEEDBACK_MS = 1500;

// 内联图标（Feather 风格：stroke=2、16px、currentColor）。
// 下列 SVG 均为不含用户数据的静态常量，可安全用于 innerHTML。
const ICON_COPY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

const ICON_CHECK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<polyline points="20 6 9 17 4 12"/></svg>';

const ICON_DELETE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function formatTime(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000)         return '刚刚';
  if (diff < 3_600_000)      return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000)     return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? `${str.slice(0, maxLen)}…` : str;
}

/** 复制文本到剪贴板：优先 Clipboard API，不可用时回退隐藏 textarea + execCommand */
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity  = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  return ok ? Promise.resolve() : Promise.reject(new Error('复制失败'));
}

/**
 * 发送消息并等待响应。
 * background 未实现对应动作（chrome.runtime.lastError 或响应 success !== true）时
 * 返回 null，由调用方回退到直接读写 chrome.storage.local。
 */
function sendMessageOrNull(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError || !response || response.success !== true) {
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch (err) {
      resolve(null);
    }
  });
}

// ─── Tab 切换 ─────────────────────────────────────────────────────────────────

function initTabs() {
  const tabBtns  = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabBtns.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('tab-btn--active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      tabPanes.forEach((p) => p.classList.toggle('tab-pane--active', p.id === `tab-${target}`));
      if (target === 'history')  loadHistory();
      if (target === 'wordbook') loadWordbook();
    });
  });
}

// ─── 状态 Tab ─────────────────────────────────────────────────────────────────

function renderProtocolStatus(protocolId, hasKey) {
  const dot   = document.getElementById(`dot-${protocolId}`);
  const badge = document.getElementById(`badge-${protocolId}`);
  if (!dot || !badge) return;

  if (hasKey) {
    dot.className    = 'status-dot status-dot--ok';
    badge.className  = 'status-badge status-badge--ok';
    badge.textContent = '已配置';
  } else {
    dot.className    = 'status-dot status-dot--missing';
    badge.className  = 'status-badge status-badge--missing';
    badge.textContent = '未配置';
  }
}

function renderModelsSummaryBadge(badgeId, dotId, enabledList) {
  const badge = document.getElementById(badgeId);
  const dot   = document.getElementById(dotId);
  if (!badge || !dot) return;

  if (!enabledList || enabledList.length === 0) {
    badge.className   = 'status-badge status-badge--models status-badge--missing';
    badge.textContent = '未启用';
    badge.title       = '';
    dot.className     = 'status-dot status-dot--missing';
    return;
  }

  const labels = enabledList.map((m) => {
    if (m.displayName) return m.displayName;
    if (m.modelId)     return m.modelId;
    return m.id;
  });

  badge.className   = 'status-badge status-badge--models status-badge--ok';
  badge.title       = labels.join(', ');
  dot.className     = 'status-dot status-dot--ok';
  if (enabledList.length === 1) {
    badge.textContent = labels[0];
  } else {
    badge.textContent = `${enabledList.length} 个 · ${labels[0]}…`;
  }
}

function modelRowHasCredentials(m) {
  if (!m) return false;
  const key  = (m.apiKey && String(m.apiKey).trim()) || '';
  const base = (m.baseUrl && String(m.baseUrl).trim()) || '';
  return !!(key && base);
}

function rowProtocol(m) {
  if (m.protocol === 'anthropic' || m.provider === 'anthropic') return 'anthropic';
  return 'openai';
}

function initStatusTab() {
  chrome.storage.local.get(['models'], (result) => {
    const models    = Array.isArray(result.models) ? result.models : [];
    const enabled   = models.filter((m) => m && m.enabled);
    const withCreds = enabled.filter(modelRowHasCredentials);

    renderProtocolStatus('openai', withCreds.some((m) => rowProtocol(m) === 'openai'));
    renderProtocolStatus('anthropic', withCreds.some((m) => rowProtocol(m) === 'anthropic'));
    renderModelsSummaryBadge('badge-models-summary', 'dot-models', enabled);

    const ready = enabled.length > 0 && withCreds.length === enabled.length;
    document.getElementById('warning-banner')?.classList.toggle('visible', !ready);
  });

  document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
}

// ─── 版本号 ───────────────────────────────────────────────────────────────────

function initVersion() {
  const el = document.getElementById('popup-version');
  if (!el) return;
  try {
    const v = chrome.runtime.getManifest().version;
    el.textContent = v ? `v${v}` : '';
  } catch (err) {
    el.textContent = '';
  }
}

// ─── 历史 Tab ─────────────────────────────────────────────────────────────────

let historyCache = [];   // 最近一次加载的完整历史列表（供搜索过滤）
let historyQuery = '';   // 当前搜索关键词（小写）

function loadHistory() {
  const listEl  = document.getElementById('history-list');
  const countEl = document.getElementById('history-count');
  if (!listEl || !countEl) return;

  countEl.textContent = '加载中…';
  listEl.textContent  = '';

  chrome.runtime.sendMessage({ action: 'nya-history-get' }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      countEl.textContent = '加载失败';
      listEl.appendChild(buildEmpty('加载失败，请重试。'));
      return;
    }
    historyCache = Array.isArray(response.list) ? response.list : [];
    applyHistoryFilter();
  });
}

/** 按当前关键词过滤缓存列表并渲染 */
function applyHistoryFilter() {
  if (!historyQuery) {
    renderHistoryList(historyCache);
    return;
  }
  const q        = historyQuery;
  const filtered = historyCache.filter((it) => {
    const text = `${it.originalText || ''} ${it.result || ''}`.toLowerCase();
    return text.includes(q);
  });
  renderHistoryList(filtered);
}

function renderHistoryList(list) {
  const listEl  = document.getElementById('history-list');
  const countEl = document.getElementById('history-count');
  if (!listEl || !countEl) return;

  listEl.textContent = '';   // 清空容器（textContent 赋值，杜绝 innerHTML 拼接）

  if (list.length === 0) {
    countEl.textContent = '暂无记录';
    const empty = document.createElement('div');
    empty.className = 'empty';
    if (historyQuery) {
      // 有搜索词时显示「无匹配」而不是空状态
      empty.textContent = '未找到匹配的记录';
    } else {
      empty.textContent = '暂无翻译记录喵~';
      const hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.textContent = '划词翻译后会自动保存至此';
      empty.appendChild(hint);
    }
    listEl.appendChild(empty);
    return;
  }

  countEl.textContent = `共 ${list.length} 条记录`;
  list.forEach((item) => listEl.appendChild(buildHistoryItem(item)));
}

/**
 * 构建历史条目（createElement + textContent，全部用户数据安全落位）。
 * 点击条目（或复制按钮）复制译文；右侧删除按钮单条删除。
 */
function buildHistoryItem(item) {
  const div = document.createElement('div');
  div.className = 'item item--clickable';
  div.dataset.id = String(item.id || '');
  div.title = '点击复制译文';

  // 第一行：模型标签 + 时间 + 操作按钮
  const meta = document.createElement('div');
  meta.className = 'item-meta';

  const tag = document.createElement('span');
  tag.className = 'item-tag';
  tag.textContent = truncate(item.model || '未知', 20);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const time = document.createElement('span');
  time.className = 'item-time';
  time.textContent = formatTime(item.timestamp);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn-icon btn-icon--copy';
  copyBtn.type = 'button';
  copyBtn.title = '复制译文';
  copyBtn.innerHTML = ICON_COPY;   // 静态图标常量，不含用户数据

  const delBtn = document.createElement('button');
  delBtn.className = 'btn-icon btn-icon--danger';
  delBtn.type = 'button';
  delBtn.dataset.id = String(item.id || '');
  delBtn.title = '删除该条记录';
  delBtn.innerHTML = ICON_DELETE;  // 静态图标常量，不含用户数据

  actions.appendChild(time);
  actions.appendChild(copyBtn);
  actions.appendChild(delBtn);
  meta.appendChild(tag);
  meta.appendChild(actions);

  // 正文：原文 / 译文 / 页面来源（textContent 渲染）
  const original = document.createElement('div');
  original.className = 'item-main';
  original.textContent = truncate(item.originalText, 60);

  const result = document.createElement('div');
  result.className = 'item-sub';
  result.textContent = truncate(item.result, 80);

  div.appendChild(meta);
  div.appendChild(original);
  div.appendChild(result);

  if (item.pageTitle) {
    const page = document.createElement('div');
    page.className = 'item-page';
    page.textContent = `来自 ${truncate(item.pageTitle, 50)}`;
    div.appendChild(page);
  }

  return div;
}

/** 复制译文并给出按钮态反馈（复制图标 → 对勾，1.5s 后还原） */
function copyHistoryResult(itemEl, item) {
  copyText(item.result || item.originalText || '')
    .then(() => flashCopied(itemEl))
    .catch(() => {});   // 剪贴板被拒绝等情况静默
}

function flashCopied(itemEl) {
  const btn = itemEl.querySelector('.btn-icon--copy');
  if (!btn) return;
  clearTimeout(btn._copiedTimer);
  btn.innerHTML = ICON_CHECK;   // 静态图标常量
  btn.classList.add('btn-icon--copied');
  btn.title = '已复制';
  btn._copiedTimer = setTimeout(() => {
    btn.innerHTML = ICON_COPY;
    btn.classList.remove('btn-icon--copied');
    btn.title = '复制译文';
  }, COPY_FEEDBACK_MS);
}

/**
 * 删除单条历史记录。
 * 优先发送 nya-history-remove 交由 background 处理；
 * background 尚未实现该动作（sendMessageOrNull 返回 null）时，
 * 回退为「读-改-写」直操作 chrome.storage.local（键与 HistoryManager 一致）。
 */
async function removeHistoryItem(id) {
  const resp = await sendMessageOrNull({ action: 'nya-history-remove', id });
  if (resp) return;
  const stored = await chrome.storage.local.get([HISTORY_KEY]);
  const list   = Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];
  await chrome.storage.local.set({
    [HISTORY_KEY]: list.filter((it) => String(it.id) !== String(id)),
  });
}

/** 清空全部历史：同样消息优先、失败回退直操作存储 */
async function clearHistory() {
  const resp = await sendMessageOrNull({ action: 'nya-history-clear' });
  if (resp) return;
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}

function initHistoryTab() {
  const listEl   = document.getElementById('history-list');
  const searchEl = document.getElementById('history-search');
  const clearBtn = document.getElementById('btn-clear-history');
  if (!listEl || !clearBtn) return;

  // 搜索：对原文 / 译文实时过滤
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      historyQuery = searchEl.value.trim().toLowerCase();
      applyHistoryFilter();
    });
  }

  // 事件委托：复制译文 / 单条删除
  listEl.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.btn-icon--danger');
    if (delBtn) {
      e.stopPropagation();
      removeHistoryItem(delBtn.dataset.id).then(() => loadHistory());
      return;
    }
    const itemEl = e.target.closest('.item[data-id]');
    if (itemEl) {
      const item = historyCache.find((it) => String(it.id) === itemEl.dataset.id);
      if (item) copyHistoryResult(itemEl, item);
    }
  });

  clearBtn.addEventListener('click', () => {
    if (!confirm('确定要清空全部翻译历史吗？')) return;
    clearHistory().then(() => loadHistory());
  });
}

// ─── 生词本 Tab ───────────────────────────────────────────────────────────────

let wordbookCache = [];   // 最近一次加载的完整生词列表（供点击复制查找）

/**
 * 生词本数据约定：chrome.storage.local['wordBook'] 存数组，元素形如
 * { id, word, meaning, timestamp }。background 尚未实现 nya-wordbook-* 动作，
 * 以下三个函数均为「消息优先、直操作存储回退」，未来 background 实现后无需改动。
 */
async function wordbookGetAll() {
  const resp = await sendMessageOrNull({ action: 'nya-wordbook-get' });
  if (resp && Array.isArray(resp.list)) return resp.list;
  // 回退：直接读取本地存储
  try {
    const stored = await chrome.storage.local.get([WORDBOOK_KEY]);
    return Array.isArray(stored[WORDBOOK_KEY]) ? stored[WORDBOOK_KEY] : [];
  } catch (err) {
    return [];
  }
}

async function wordbookRemove(id) {
  const resp = await sendMessageOrNull({ action: 'nya-wordbook-remove', id });
  if (resp) return;
  // 回退：读-改-写
  const stored = await chrome.storage.local.get([WORDBOOK_KEY]);
  const list   = Array.isArray(stored[WORDBOOK_KEY]) ? stored[WORDBOOK_KEY] : [];
  await chrome.storage.local.set({
    [WORDBOOK_KEY]: list.filter((it) => String(it.id) !== String(id)),
  });
}

async function wordbookClear() {
  const resp = await sendMessageOrNull({ action: 'nya-wordbook-clear' });
  if (resp) return;
  // 回退：直接清空
  await chrome.storage.local.set({ [WORDBOOK_KEY]: [] });
}

function loadWordbook() {
  const listEl  = document.getElementById('wordbook-list');
  const countEl = document.getElementById('wordbook-count');
  if (!listEl || !countEl) return;

  countEl.textContent = '加载中…';
  listEl.textContent  = '';

  wordbookGetAll().then((list) => {
    wordbookCache = list;
    renderWordbookList(list);
  });
}

function renderWordbookList(list) {
  const listEl  = document.getElementById('wordbook-list');
  const countEl = document.getElementById('wordbook-count');
  if (!listEl || !countEl) return;

  listEl.textContent = '';   // 清空容器（textContent 赋值）

  if (list.length === 0) {
    countEl.textContent = '暂无生词';
    listEl.appendChild(buildEmpty('暂无生词'));
    return;
  }

  countEl.textContent = `共 ${list.length} 个生词`;
  list.forEach((item) => listEl.appendChild(buildWordbookItem(item)));
}

/** 构建生词条目：词 + 释义摘要 + 时间；点击复制单词，右侧按钮单条删除 */
function buildWordbookItem(item) {
  const div = document.createElement('div');
  div.className = 'item item--clickable';
  div.dataset.id = String(item.id || '');
  div.title = '点击复制单词';

  const meta = document.createElement('div');
  meta.className = 'item-meta';

  const word = document.createElement('span');
  word.className = 'item-main wordbook-word';
  word.textContent = truncate(item.word || '未知', 40);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const time = document.createElement('span');
  time.className = 'item-time';
  time.textContent = formatTime(item.timestamp != null ? item.timestamp : item.ts);

  const delBtn = document.createElement('button');
  delBtn.className = 'btn-icon btn-icon--danger';
  delBtn.type = 'button';
  delBtn.dataset.id = String(item.id || '');
  delBtn.title = '删除该生词';
  delBtn.innerHTML = ICON_DELETE;   // 静态图标常量，不含用户数据

  actions.appendChild(time);
  actions.appendChild(delBtn);
  meta.appendChild(word);
  meta.appendChild(actions);

  const meaning = document.createElement('div');
  meaning.className = 'item-sub';
  meaning.textContent = truncate(item.meaning != null ? item.meaning : item.result, 80) || '—';

  div.appendChild(meta);
  div.appendChild(meaning);
  return div;
}

function initWordbookTab() {
  const listEl   = document.getElementById('wordbook-list');
  const clearBtn = document.getElementById('btn-clear-wordbook');
  if (!listEl || !clearBtn) return;

  // 事件委托：点击复制单词 / 单条删除
  listEl.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.btn-icon--danger');
    if (delBtn) {
      e.stopPropagation();
      wordbookRemove(delBtn.dataset.id).then(() => loadWordbook());
      return;
    }
    const itemEl = e.target.closest('.item[data-id]');
    if (itemEl) {
      const item = wordbookCache.find((it) => String(it.id) === itemEl.dataset.id);
      if (item) {
        copyText(item.word || '')
          .then(() => flashItemCopied(itemEl))
          .catch(() => {});
      }
    }
  });

  clearBtn.addEventListener('click', () => {
    if (!confirm('确定要清空全部生词吗？')) return;
    wordbookClear().then(() => loadWordbook());
  });
}

/** 生词复制成功的条目高亮反馈（短暂切换为成功底色） */
function flashItemCopied(itemEl) {
  clearTimeout(itemEl._copiedTimer);
  itemEl.classList.add('item--copied');
  itemEl._copiedTimer = setTimeout(() => {
    itemEl.classList.remove('item--copied');
  }, COPY_FEEDBACK_MS);
}

// ─── 通用 DOM 辅助 ───────────────────────────────────────────────────────────

/** 构建空状态占位（textContent，无用户数据参与） */
function buildEmpty(text) {
  const el = document.createElement('div');
  el.className = 'empty';
  el.textContent = text;
  return el;
}

// ─── 外观（与设置页同步） ───────────────────────────────────────────────────

function applyPopupAppearance() {
  chrome.storage.local.get(['appearance'], (r) => {
    const a = NyaAppearance.mergeAppearance(r || {});
    NyaAppearance.applyToExtensionPage(document.documentElement, a);
  });
}

function initAppearance() {
  applyPopupAppearance();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.appearance) return;
    const nv = changes.appearance.newValue;
    if (nv && typeof nv === 'object') {
      NyaAppearance.applyToExtensionPage(
        document.documentElement,
        NyaAppearance.mergeAppearance({ appearance: nv })
      );
    }
  });
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => {
    chrome.storage.local.get(['appearance'], (r) => {
      const a = NyaAppearance.mergeAppearance(r || {});
      if (a.themeMode === 'system') {
        NyaAppearance.applyToExtensionPage(document.documentElement, a);
      }
    });
  });
}

// ─── 启动 ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initVersion();
  initAppearance();
  initTabs();
  initStatusTab();
  initHistoryTab();
  initWordbookTab();
});
