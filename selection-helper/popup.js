/**
 * Popup Script — 划词助手
 *
 * 功能：
 *   - 读取 chrome.storage.local 展示 API Key 配置状态
 *   - 展示首选模型设置
 *   - 点击「打开设置」按钮，调用 chrome.runtime.openOptionsPage()
 */

'use strict';

const MODEL_LABELS = {
  deepseek: 'DeepSeek',
  qwen:     '通义千问',
  both:     '两者都展示',
};

document.addEventListener('DOMContentLoaded', () => {
  // ── 读取 Storage 并渲染状态 ──────────────────────────────────────────────
  chrome.storage.local.get(
    ['deepseekKey', 'qwenKey', 'preferredModel'],
    (result) => {
      renderKeyStatus('deepseek', !!result.deepseekKey);
      renderKeyStatus('qwen',     !!result.qwenKey);
      renderPreferredModel(result.preferredModel || 'both');

      // 如果两个 Key 都没填，显示警告条
      if (!result.deepseekKey && !result.qwenKey) {
        document.getElementById('warning-banner').classList.add('visible');
      }
    }
  );

  // ── 打开设置页面 ──────────────────────────────────────────────────────────
  document.getElementById('btn-open-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    // 关闭 popup（打开 options page 后 popup 通常自动关闭，但显式 window.close() 更可靠）
    window.close();
  });
});

/**
 * 渲染单个 Key 的状态（已配置 / 未配置）
 * @param {'deepseek'|'qwen'} model
 * @param {boolean} hasKey
 */
function renderKeyStatus(model, hasKey) {
  const dot   = document.getElementById(`dot-${model}`);
  const badge = document.getElementById(`badge-${model}`);

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

/**
 * 渲染首选模型
 * @param {string} value
 */
function renderPreferredModel(value) {
  const el = document.getElementById('pref-value');
  if (el) el.textContent = MODEL_LABELS[value] || value;
}
