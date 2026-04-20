/**
 * Material You 风格自定义下拉：保留原生 <select> 同步 value，浮层 fixed 避免裁剪。
 */
'use strict';

(function (g) {
  class MaterialSelect {
    /**
     * @param {HTMLSelectElement} selectEl
     * @param {{ compact?: boolean, className?: string }} [opts]
     */
    constructor(selectEl, opts) {
      this.select = selectEl;
      this.opts = opts || {};
      this._open = false;
      this._highlightIdx = 0;
      this._opts = [];
      this._onDoc = this._onDoc.bind(this);
      this._onWin = this._onWin.bind(this);
      this._wrap = null;
      this._trigger = null;
      this._menu = null;
      this._labelSpan = null;
      this._build();
    }

    _build() {
      const parent = this.select.parentNode;
      if (!parent) return;

      this.wrap = document.createElement('div');
      this.wrap.className = 'nya-ms';
      if (this.opts.compact) this.wrap.classList.add('nya-ms--compact');
      if (this.opts.className) this.wrap.classList.add(this.opts.className);

      parent.insertBefore(this.wrap, this.select);
      this.wrap.appendChild(this.select);

      this.select.classList.add('nya-ms__native');
      this.select.setAttribute('tabindex', '-1');
      this.select.setAttribute('aria-hidden', 'true');

      this._trigger = document.createElement('button');
      this._trigger.type = 'button';
      this._trigger.className = 'nya-ms__trigger';
      this._trigger.setAttribute('aria-haspopup', 'listbox');
      this._trigger.setAttribute('aria-expanded', 'false');

      this._labelSpan = document.createElement('span');
      this._labelSpan.className = 'nya-ms__label';
      const icon = document.createElement('span');
      icon.className = 'nya-ms__trigger-icon';
      icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>';

      this._trigger.appendChild(this._labelSpan);
      this._trigger.appendChild(icon);
      this.wrap.appendChild(this._trigger);

      this._menu = document.createElement('ul');
      this._menu.className = 'nya-ms__menu';
      this._menu.setAttribute('role', 'listbox');
      this._menu.id = `nya-ms-menu-${Math.random().toString(36).slice(2, 9)}`;
      this._trigger.setAttribute('aria-controls', this._menu.id);

      document.body.appendChild(this._menu);

      this._trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      });

      this.select.addEventListener('change', () => this._syncLabel());

      // 业务代码常直接改 select.disabled，不会触发 change，须同步触发器与菜单状态
      this._attrObserver = new MutationObserver(() => {
        this._syncLabel();
        if (this._open) this._rebuildOptions();
      });
      this._attrObserver.observe(this.select, {
        attributes: true,
        attributeFilter: ['disabled'],
      });

      this._syncLabel();
      this._rebuildOptions();

      this._onKeyTrigger = (e) => {
        if (this.select.disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.toggle();
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!this._open) this.openMenu();
          else this._moveHighlight(e.key === 'ArrowDown' ? 1 : -1);
        }
        if (e.key === 'Escape' && this._open) {
          e.preventDefault();
          this.close();
        }
      };
      this._trigger.addEventListener('keydown', this._onKeyTrigger);
    }

    _syncLabel() {
      const opt = this.select.selectedOptions[0];
      this._labelSpan.textContent = opt ? opt.textContent : '';
      this._trigger.disabled = this.select.disabled;
    }

    _rebuildOptions() {
      this._opts = Array.from(this.select.options);
      this._menu.innerHTML = '';
      this._opts.forEach((opt, idx) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nya-ms__option';
        btn.setAttribute('role', 'option');
        btn.dataset.index = String(idx);
        btn.textContent = opt.textContent;
        if (opt.disabled) btn.disabled = true;
        if (this.select.selectedIndex === idx) {
          btn.classList.add('nya-ms__option--selected');
          btn.setAttribute('aria-selected', 'true');
        }
        // 勿对 button 的 mousedown 使用 preventDefault：Chromium 会抑制随后的 click，导致选不中、不触发 change。
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (opt.disabled) return;
          const optEl = this.select.options[idx];
          if (!optEl) return;
          this.select.value = optEl.value;
          optEl.selected = true;
          this.select.dispatchEvent(new Event('change', { bubbles: true }));
          this._syncLabel();
          this.close();
        });
        btn.addEventListener('mouseenter', () => {
          this._setHighlight(idx);
        });
        li.appendChild(btn);
        this._menu.appendChild(li);
      });
      this._highlightIdx = Math.max(0, this.select.selectedIndex);
    }

    _setHighlight(idx) {
      this._highlightIdx = Math.max(0, Math.min(this._opts.length - 1, idx));
      const buttons = this._menu.querySelectorAll('.nya-ms__option');
      buttons.forEach((b, i) => {
        b.classList.toggle('nya-ms__option--highlight', i === this._highlightIdx);
      });
    }

    _moveHighlight(delta) {
      this._setHighlight(this._highlightIdx + delta);
    }

    _positionMenu() {
      const r = this._trigger.getBoundingClientRect();
      const mw = Math.max(r.width, 160);
      this._menu.style.minWidth = `${mw}px`;
      this._menu.style.left = `${Math.min(r.left, window.innerWidth - mw - 8)}px`;
      let top = r.bottom + 4;
      this._menu.style.maxHeight = 'min(280px, calc(100vh - 24px))';
      const estH = Math.min(280, this._opts.length * 44);
      if (top + estH > window.innerHeight - 8) {
        top = Math.max(8, r.top - estH - 4);
      }
      this._menu.style.top = `${top}px`;
    }

    openMenu() {
      if (this.select.disabled || this._opts.length === 0) return;
      this._open = true;
      this.wrap.classList.add('nya-ms--open', 'active');
      // 菜单挂在 body 上，不是 .nya-ms 的后代，必须用本类单独控制展开态（否则 .nya-ms--open .nya-ms__menu 永不匹配）
      this._menu.classList.add('nya-ms__menu--open');
      this._trigger.setAttribute('aria-expanded', 'true');
      this._rebuildOptions();
      this._positionMenu();
      setTimeout(() => {
        document.addEventListener('mousedown', this._onDoc, true);
        window.addEventListener('scroll', this._onWin, true);
        window.addEventListener('resize', this._onWin);
      }, 0);
    }

    close() {
      if (!this._open) return;
      this._open = false;
      this.wrap.classList.remove('nya-ms--open', 'active');
      this._menu.classList.remove('nya-ms__menu--open');
      this._trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', this._onDoc, true);
      window.removeEventListener('scroll', this._onWin, true);
      window.removeEventListener('resize', this._onWin);
    }

    toggle() {
      if (this._open) this.close();
      else this.openMenu();
    }

    _onDoc(e) {
      if (this.wrap.contains(e.target) || this._menu.contains(e.target)) return;
      this.close();
    }

    _onWin() {
      if (this._open) this._positionMenu();
    }

    refresh() {
      this._syncLabel();
      this._rebuildOptions();
    }

    destroy() {
      this.close();
      this._attrObserver?.disconnect();
      this._attrObserver = null;
      document.removeEventListener('mousedown', this._onDoc, true);
      window.removeEventListener('scroll', this._onWin, true);
      window.removeEventListener('resize', this._onWin);
      this._menu?.remove();
      if (this.wrap && this.select) {
        const parent = this.wrap.parentNode;
        if (parent) {
          parent.insertBefore(this.select, this.wrap);
          this.wrap.remove();
        }
      }
      this.select.classList.remove('nya-ms__native');
      this.select.removeAttribute('aria-hidden');
      this.select.removeAttribute('tabindex');
    }

    static enhanceFieldSelects(root) {
      const scope = root || document;
      scope.querySelectorAll('select.field-select:not(.nya-ms__native)').forEach((sel) => {
        try {
          // eslint-disable-next-line no-new
          new MaterialSelect(sel, {});
        } catch (_) {}
      });
    }
  }

  g.MaterialSelect = MaterialSelect;
})(typeof globalThis !== 'undefined' ? globalThis : window);
