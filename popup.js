/**
 * Popup Script — NyaTranslate v3.1
 *
 * 功能：
 *   - Tab 切换（⚡ 状态 / 📜 翻译历史）
 *   - 展示 OpenAI 兼容协议 / Anthropic 协议的 Key 配置状态
 *   - 展示当前已启用的模型列表摘要（划词与截图共用）
 *   - 翻译历史列表展示（按时间倒序）与一键清空
 *   - 打开设置页
 *
 *  v3.1 变化：
 *   - 移除截图按钮（截图通过 Alt+Shift+S 快捷键或右键菜单触发）
 *   - 状态 Tab 改为展示协议 Key 状态 + 模型 ID
 */

'use strict';

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function formatTime(ts) {
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

// ─── Tab 切换 ─────────────────────────────────────────────────────────────────

function initTabs() {
  const tabBtns  = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabBtns.forEach((b) =>  b.classList.toggle('tab-btn--active',  b === btn));
      tabPanes.forEach((p) => p.classList.toggle('tab-pane--active', p.id === `tab-${target}`));
      if (target === 'history') loadHistory();
    });
  });
}

// ─── 状态 Tab ─────────────────────────────────────────────────────────────────

function renderProtocolStatus(protocolId, hasKey) {
  const dot   = document.getElementById(`dot-${protocolId}`);
  const badge = document.getElementById(`badge-${protocolId}`);
  if (!dot || !badge) return;

  if (hasKey) {
    dot.className   = 'status-dot status-dot--ok';
    badge.className = 'status-badge status-badge--ok';
    badge.textContent = '✓ 已配置';
  } else {
    dot.className   = 'status-dot status-dot--missing';
    badge.className = 'status-badge status-badge--missing';
    badge.textContent = '未配置';
  }
}

function renderModelsSummaryBadge(badgeId, enabledList) {
  const badge = document.getElementById(badgeId);
  if (!badge) return;

  if (!enabledList || enabledList.length === 0) {
    badge.className   = 'status-badge status-badge--missing';
    badge.textContent = '未启用';
    badge.title       = '';
    return;
  }

  const labels = enabledList.map((m) => {
    if (m.displayName) return m.displayName;
    if (m.modelId) return m.modelId;
    return m.id;
  });

  badge.className = 'status-badge status-badge--ok';
  badge.title     = labels.join(', ');
  if (enabledList.length === 1) {
    badge.textContent = labels[0];
  } else {
    badge.textContent = `${enabledList.length} 个 · ${labels[0]}…`;
  }
}

function modelRowHasCredentials(m) {
  if (!m) return false;
  const key = (m.apiKey && String(m.apiKey).trim()) || '';
  const base = (m.baseUrl && String(m.baseUrl).trim()) || '';
  return !!(key && base);
}

function rowProtocol(m) {
  if (m.protocol === 'anthropic' || m.provider === 'anthropic') return 'anthropic';
  return 'openai';
}

function initStatusTab() {
  chrome.storage.local.get(
    ['models'],
    (result) => {
      const models  = Array.isArray(result.models) ? result.models : [];
      const enabled = models.filter((m) => m && m.enabled);
      const withCreds = enabled.filter(modelRowHasCredentials);

      renderProtocolStatus('openai', withCreds.some((m) => rowProtocol(m) === 'openai'));
      renderProtocolStatus('anthropic', withCreds.some((m) => rowProtocol(m) === 'anthropic'));

      renderModelsSummaryBadge('badge-models-summary', enabled);

      const ready = enabled.length > 0 && withCreds.length === enabled.length;
      if (!ready) {
        document.getElementById('warning-banner')?.classList.add('visible');
      }
    }
  );

  document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
}

// ─── 历史 Tab ─────────────────────────────────────────────────────────────────

function loadHistory() {
  const listEl  = document.getElementById('history-list');
  const countEl = document.getElementById('history-count');

  listEl.innerHTML = '<div class="history-empty">加载中…</div>';

  chrome.runtime.sendMessage({ action: 'nya-history-get' }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      listEl.innerHTML = '<div class="history-empty">加载失败，请重试。</div>';
      return;
    }

    const list = response.list || [];
    countEl.textContent = list.length > 0 ? `共 ${list.length} 条记录` : '暂无记录';

    if (list.length === 0) {
      listEl.innerHTML = '<div class="history-empty">暂无翻译记录喵~<br>划词翻译后会自动保存至此</div>';
      return;
    }

    listEl.innerHTML = '';
    list.forEach((item) => listEl.appendChild(buildHistoryItem(item)));
  });
}

function buildHistoryItem(item) {
  const div = document.createElement('div');
  div.className = 'history-item';

  const modelLabel = item.model || '未知';
  const timeStr    = formatTime(item.timestamp);

  div.innerHTML = `
    <div class="history-item-meta">
      <span class="history-model-tag">${truncate(modelLabel, 20)}</span>
      <span class="history-time">${timeStr}</span>
    </div>
    <div class="history-original">${truncate(item.originalText, 60)}</div>
    <div class="history-result">${truncate(item.result, 80)}</div>
    ${item.pageTitle ? `<div class="history-page">📄 ${truncate(item.pageTitle, 50)}</div>` : ''}
  `;
  return div;
}

function initHistoryTab() {
  const clearBtn = document.getElementById('btn-clear-history');
  if (!clearBtn) return;

  clearBtn.addEventListener('click', () => {
    if (!confirm('确定要清空所有翻译历史吗喵~？')) return;
    chrome.runtime.sendMessage({ action: 'nya-history-clear' }, (response) => {
      if (chrome.runtime.lastError || !response?.success) return;
      loadHistory();
    });
  });
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
  initAppearance();
  initTabs();
  initStatusTab();
  initHistoryTab();
});
