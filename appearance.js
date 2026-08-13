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

  /**
   * 用户圆角滑块(8~28px)→ 离散圆角档(6/10/14/20px):
   * 滑块值落到哪个档位区间,四个 --radius-* token 就映射到该档位,
   * 让设置页滑块真正驱动全部组件的圆角(而非失效)。
   */
  function discreteRadiusScale(value) {
    const v = clampRadius(value);
    if (v <= 10) return { xs: 4, sm: 6, md: 8, lg: 10 };
    if (v <= 14) return { xs: 6, sm: 10, md: 14, lg: 18 };
    if (v <= 20) return { xs: 8, sm: 12, md: 16, lg: 20 };
    return { xs: 10, sm: 14, md: 18, lg: 24 };
  }

  function applyDataAttrs(el, appearance) {
    if (!el) return;
    const et = effectiveTheme(appearance);
    el.dataset.theme = et;
    el.dataset.themeMode = appearance.themeMode;
    el.dataset.palette = appearance.palette;
    el.dataset.background = appearance.background;
    el.style.setProperty('--app-border-radius', `${appearance.cornerRadius}px`);
    // 圆角滑块驱动离散 token:面板/按钮/徽标/下拉全部随档位变化
    const scale = discreteRadiusScale(appearance.cornerRadius);
    el.style.setProperty('--radius-xs', `${scale.xs}px`);
    el.style.setProperty('--radius-sm', `${scale.sm}px`);
    el.style.setProperty('--radius-md', `${scale.md}px`);
    el.style.setProperty('--radius-lg', `${scale.lg}px`);
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
