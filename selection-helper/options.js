/**
 * Options Page Script — 划词助手 v2
 *
 * 功能：
 *   - 侧边栏导航切换（API 配置 / 偏好设置 / 关于）
 *   - 从 chrome.storage.local 读取 Key 并回填表单
 *   - 保存 API Key + 首选模型 + 默认操作到 storage
 *   - 全局 Toast 通知（带弹出动画）
 *   - 密码显示/隐藏切换（睁眼/闭眼图标）
 */

'use strict';

// ─── DOM 引用 ─────────────────────────────────────────────────────────────────

const deepseekInput    = document.getElementById('deepseek-key');
const qwenInput        = document.getElementById('qwen-key');
const preferredModel   = document.getElementById('preferred-model');
const preferredAction  = document.getElementById('preferred-action');
const btnSaveApi       = document.getElementById('btn-save-api');
const btnSavePrefs     = document.getElementById('btn-save-prefs');
const toastEl          = document.getElementById('toast');
const statusDeepseek   = document.getElementById('status-deepseek');
const statusQwen       = document.getElementById('status-qwen');

// ─── Toast 通知 ───────────────────────────────────────────────────────────────

let toastTimer = null;

/**
 * @param {'success'|'error'} type
 * @param {string} message
 */
function showToast(type, message) {
  if (toastTimer) clearTimeout(toastTimer);

  const icon = type === 'success' ? '✓' : '✕';
  toastEl.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
  toastEl.className = `toast toast--${type}`;

  // 触发入场动画（需要微任务以确保 class 变化生效）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toastEl.classList.add('toast--show'));
  });

  toastTimer = setTimeout(() => {
    toastEl.classList.remove('toast--show');
    toastTimer = setTimeout(() => {
      toastEl.className = 'toast';
      toastEl.innerHTML = '';
    }, 300);
  }, 2800);
}

// ─── 侧边栏导航 ───────────────────────────────────────────────────────────────

function initSidebarNav() {
  document.querySelectorAll('.nav-item').forEach((navBtn) => {
    navBtn.addEventListener('click', () => {
      const targetSection = navBtn.dataset.section;

      // 切换 nav 激活状态
      document.querySelectorAll('.nav-item').forEach((b) =>
        b.classList.toggle('nav-item--active', b === navBtn)
      );

      // 切换 section 显示
      document.querySelectorAll('.section').forEach((sec) => {
        const isTarget = sec.id === `section-${targetSection}`;
        sec.classList.toggle('section--active', isTarget);
      });
    });
  });
}

// ─── 眼睛图标（显示/隐藏密码）───────────────────────────────────────────────

const EYE_OPEN = `
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
  <circle cx="12" cy="12" r="3"/>`;

const EYE_CLOSED = `
  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
  <line x1="1" y1="1" x2="23" y2="23"/>`;

function initEyeToggles() {
  document.querySelectorAll('.eye-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input    = document.getElementById(targetId);
      if (!input) return;

      const showing    = input.type === 'text';
      input.type       = showing ? 'password' : 'text';

      const eyeIcon = btn.querySelector('svg');
      if (eyeIcon) eyeIcon.innerHTML = showing ? EYE_OPEN : EYE_CLOSED;

      btn.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
    });
  });
}

// ─── 配置状态标识更新 ─────────────────────────────────────────────────────────

/**
 * 根据 input 的值更新旁边的"已配置/未配置"徽章
 */
function updateKeyStatus(inputEl, statusEl) {
  if (!statusEl) return;
  const hasValue = inputEl.value.trim().length > 0;
  statusEl.className  = `key-status ${hasValue ? 'configured' : 'missing'}`;
  statusEl.textContent = hasValue ? '✓ 已配置' : '○ 未填写';
}

function initKeyStatusWatchers() {
  [
    [deepseekInput, statusDeepseek],
    [qwenInput,     statusQwen],
  ].forEach(([input, status]) => {
    input.addEventListener('input', () => updateKeyStatus(input, status));
  });
}

// ─── 初始化：从 Storage 读取数据并回填 ───────────────────────────────────────

function loadFromStorage() {
  chrome.storage.local.get(
    ['deepseekKey', 'qwenKey', 'preferredModel', 'preferredAction'],
    (result) => {
      if (result.deepseekKey)    deepseekInput.value  = result.deepseekKey;
      if (result.qwenKey)        qwenInput.value      = result.qwenKey;
      if (result.preferredModel) preferredModel.value = result.preferredModel;
      if (result.preferredAction) preferredAction.value = result.preferredAction;

      // 初始状态刷新
      updateKeyStatus(deepseekInput, statusDeepseek);
      updateKeyStatus(qwenInput,     statusQwen);
    }
  );
}

// ─── 保存 API 配置 ─────────────────────────────────────────────────────────

function validateAndSaveApiKeys() {
  const deepseekKey = deepseekInput.value.trim();
  const qwenKey     = qwenInput.value.trim();

  // 格式校验
  if (deepseekKey && !deepseekKey.startsWith('sk-')) {
    showToast('error', 'DeepSeek API Key 格式有误，应以 sk- 开头');
    deepseekInput.focus();
    return;
  }
  if (qwenKey && !qwenKey.startsWith('sk-')) {
    showToast('error', '通义千问 API Key 格式有误，应以 sk- 开头');
    qwenInput.focus();
    return;
  }
  if (!deepseekKey && !qwenKey) {
    showToast('error', '请至少填写一个 API Key');
    return;
  }

  btnSaveApi.disabled    = true;
  btnSaveApi.textContent = '保存中…';

  chrome.storage.local.set({ deepseekKey, qwenKey }, () => {
    btnSaveApi.disabled    = false;
    btnSaveApi.textContent = '保存 API 配置';

    if (chrome.runtime.lastError) {
      showToast('error', `保存失败：${chrome.runtime.lastError.message}`);
      return;
    }

    updateKeyStatus(deepseekInput, statusDeepseek);
    updateKeyStatus(qwenInput,     statusQwen);
    showToast('success', 'API 配置已保存，立即生效 ✓');
  });
}

// ─── 保存偏好设置 ─────────────────────────────────────────────────────────────

function savePreferences() {
  const modelVal  = preferredModel.value;
  const actionVal = preferredAction.value;

  btnSavePrefs.disabled    = true;
  btnSavePrefs.textContent = '保存中…';

  chrome.storage.local.set(
    { preferredModel: modelVal, preferredAction: actionVal },
    () => {
      btnSavePrefs.disabled    = false;
      btnSavePrefs.textContent = '保存偏好设置';

      if (chrome.runtime.lastError) {
        showToast('error', `保存失败：${chrome.runtime.lastError.message}`);
        return;
      }
      showToast('success', '偏好设置已保存 ✓');
    }
  );
}

// ─── 回车键快捷保存 ───────────────────────────────────────────────────────────

function initEnterSave() {
  [deepseekInput, qwenInput].forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnSaveApi.click();
    });
  });
}

// ─── 事件绑定 + 初始化入口 ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initSidebarNav();
  initEyeToggles();
  initKeyStatusWatchers();
  initEnterSave();
  loadFromStorage();

  btnSaveApi.addEventListener('click',   validateAndSaveApiKeys);
  btnSavePrefs.addEventListener('click', savePreferences);
});
