/**
 * 全端外观：默认值、解析、DOM 应用（options / popup / content 共用）
 */
'use strict';

(function (g) {
  const DEFAULT_APPEARANCE = {
    themeMode: 'system',
    palette: 'ocean',
    cornerRadius: 16,
    background: 'tonal',
  };

  function clampRadius(n) {
    const x = Number(n);
    if (Number.isNaN(x)) return DEFAULT_APPEARANCE.cornerRadius;
    return Math.min(28, Math.max(8, Math.round(x)));
  }

  function mergeAppearance(stored) {
    const raw = stored && typeof stored === 'object' ? stored.appearance : null;
    const o = raw && typeof raw === 'object' ? raw : {};
    return {
      themeMode: o.themeMode === 'light' || o.themeMode === 'dark' || o.themeMode === 'system'
        ? o.themeMode
        : DEFAULT_APPEARANCE.themeMode,
      palette: o.palette === 'mint' || o.palette === 'lilac' || o.palette === 'ocean'
        ? o.palette
        : DEFAULT_APPEARANCE.palette,
      cornerRadius: clampRadius(o.cornerRadius != null ? o.cornerRadius : DEFAULT_APPEARANCE.cornerRadius),
      background: o.background === 'pure' || o.background === 'tonal'
        ? o.background
        : DEFAULT_APPEARANCE.background,
    };
  }

  function isDarkScheme() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /** @returns {'light'|'dark'} */
  function effectiveTheme(appearance) {
    if (appearance.themeMode === 'light') return 'light';
    if (appearance.themeMode === 'dark') return 'dark';
    return isDarkScheme() ? 'dark' : 'light';
  }

  function applyDataAttrs(el, appearance) {
    if (!el) return;
    const et = effectiveTheme(appearance);
    el.dataset.theme = et;
    el.dataset.themeMode = appearance.themeMode;
    el.dataset.palette = appearance.palette;
    el.dataset.background = appearance.background;
    el.style.setProperty('--app-border-radius', `${appearance.cornerRadius}px`);
  }

  /** 扩展页：<html class="nya-extension-ui"> */
  function applyToExtensionPage(htmlEl, appearance) {
    applyDataAttrs(htmlEl, appearance);
  }

  /** 划词：面板或悬浮图标根节点 */
  function applyToContentRoot(el, appearance) {
    applyDataAttrs(el, appearance);
  }

  g.NyaAppearance = {
    DEFAULT: DEFAULT_APPEARANCE,
    mergeAppearance,
    effectiveTheme,
    clampRadius,
    applyToExtensionPage,
    applyToContentRoot,
    isDarkScheme,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
