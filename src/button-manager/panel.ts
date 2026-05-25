import {
  buildOrderedKeys,
  resetSettings,
  saveSettings,
  sortItemsBySettings,
  withCompactEnabled,
  withHiddenKey,
  withMaxButtonRows,
  withOrderedKeys,
} from './settings';
import { getHostDocument, getHostWindow } from './host-dom';
import type { ButtonFilter, ButtonItem, ManagerSettings, PanelState } from './types';

type PanelOptions = {
  root: HTMLElement;
  onSettingsChange: (settings: ManagerSettings) => void;
};

const FILTER_LABELS: Record<ButtonFilter, string> = {
  all: '全部',
  script: '助手',
  qr: 'QR',
};

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  textContent?: string,
): HTMLElementTagNameMap[K] {
  const element = getHostDocument().createElement(tag);
  if (className) {
    element.className = className;
  }
  if (textContent !== undefined) {
    element.textContent = textContent;
  }
  return element;
}

function button(className: string, icon: string, title: string): HTMLButtonElement {
  const element = createElement('button', className) as HTMLButtonElement;
  element.type = 'button';
  element.title = title;
  element.setAttribute('aria-label', title);
  const iconElement = createElement('i', `fa-solid ${icon}`);
  element.append(iconElement);
  return element;
}

function kindLabel(item: ButtonItem): string {
  if (item.locked) {
    return '入口';
  }
  return item.kind === 'script' ? '助手' : 'QR';
}

export class ButtonManagerPanel {
  private readonly root: HTMLElement;
  private readonly onSettingsChange: (settings: ManagerSettings) => void;
  private state: PanelState | undefined;
  private filter: ButtonFilter = 'all';
  private search = '';
  private draggingKey: string | undefined;
  private dropTargetKey: string | undefined;
  private dropPosition: 'before' | 'after' = 'before';
  private pointerDrag:
    | {
        pointerId: number;
        row: HTMLElement;
        sourceKey: string;
      }
    | undefined;
  private touchDrag:
    | {
        touchId: number;
        row: HTMLElement;
        sourceKey: string;
      }
    | undefined;

  constructor(options: PanelOptions) {
    this.root = options.root;
    this.onSettingsChange = options.onSettingsChange;
  }

  update(state: PanelState): void {
    this.state = state;
    if (this.isOpen()) {
      this.render();
    }
  }

  open(): void {
    this.root.classList.add('bm-root-open');
    this.render();
    getHostWindow().setTimeout(() => this.root.querySelector<HTMLInputElement>('.bm-search')?.focus(), 0);
  }

  close(): void {
    this.root.classList.remove('bm-root-open');
    this.root.replaceChildren();
  }

  destroy(): void {
    this.close();
  }

  isOpen(): boolean {
    return this.root.classList.contains('bm-root-open');
  }

  private commit(settings: ManagerSettings): void {
    const saved = saveSettings(settings);
    this.onSettingsChange(saved);
    this.update({ ...this.state!, settings: saved });
  }

  private getOrderedItems(): ButtonItem[] {
    if (!this.state) {
      return [];
    }
    return sortItemsBySettings(this.state.items, this.state.settings);
  }

  private getVisibleItems(): ButtonItem[] {
    const hiddenKeys = new Set(this.state?.settings.hiddenKeys ?? []);
    const search = this.search.trim().toLowerCase();
    return this.getOrderedItems().filter(item => {
      const hidden = hiddenKeys.has(item.key);
      const filterMatched =
        this.filter === 'all' ||
        (this.filter === 'script' && item.kind === 'script') ||
        (this.filter === 'qr' && item.kind !== 'script');
      const searchMatched =
        !search ||
        item.label.toLowerCase().includes(search) ||
        item.source.toLowerCase().includes(search) ||
        item.detail.toLowerCase().includes(search);
      return filterMatched && searchMatched;
    });
  }

  private resetToDefaults(): void {
    if (!this.state) {
      return;
    }

    if (!getHostWindow().confirm('恢复默认显示与排序？')) {
      return;
    }

    const settings = resetSettings();
    this.onSettingsChange(settings);
    this.update({ ...this.state, settings });
  }

  private moveKeyTo(sourceKey: string, targetKey: string, position: 'before' | 'after'): void {
    if (!this.state || sourceKey === targetKey) {
      return;
    }

    const orderedKeys = buildOrderedKeys(this.state.settings, this.state.items);
    const next = orderedKeys.filter(key => key !== sourceKey);
    const targetIndex = next.indexOf(targetKey);
    if (targetIndex < 0) {
      return;
    }
    next.splice(position === 'before' ? targetIndex : targetIndex + 1, 0, sourceKey);
    this.commit(withOrderedKeys(this.state.settings, next));
  }

  private clearDropIndicator(): void {
    this.root
      .querySelectorAll('.bm-row-drop-before, .bm-row-drop-after')
      .forEach(row => row.classList.remove('bm-row-drop-before', 'bm-row-drop-after'));
    this.dropTargetKey = undefined;
  }

  private getDropPosition(row: HTMLElement, clientY: number): 'before' | 'after' {
    const rect = row.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  }

  private updateDropIndicator(row: HTMLElement, clientY: number): void {
    const targetKey = row.dataset.key;
    if (!targetKey || targetKey === this.draggingKey) {
      this.clearDropIndicator();
      return;
    }

    this.dropTargetKey = targetKey;
    this.dropPosition = this.getDropPosition(row, clientY);
    this.clearDropIndicator();
    this.dropTargetKey = targetKey;
    row.classList.add(this.dropPosition === 'before' ? 'bm-row-drop-before' : 'bm-row-drop-after');
  }

  private findRowFromPoint(clientX: number, clientY: number): HTMLElement | undefined {
    const element = getHostDocument().elementFromPoint(clientX, clientY);
    const row = element?.closest<HTMLElement>('.bm-row');
    return row && this.root.contains(row) ? row : undefined;
  }

  private getTouch(touchList: TouchList, touchId: number): Touch | undefined {
    return Array.from(touchList).find(touch => touch.identifier === touchId);
  }

  private finishDrag(sourceKey: string, targetKey: string | undefined, position: 'before' | 'after'): void {
    this.clearDropIndicator();
    this.draggingKey = undefined;
    if (targetKey && targetKey !== sourceKey) {
      this.moveKeyTo(sourceKey, targetKey, position);
    }
  }

  private render(): void {
    if (!this.state) {
      return;
    }

    this.root.replaceChildren();
    const overlay = createElement('div', 'bm-overlay');
    const panel = createElement('section', 'bm-panel');
    panel.setAttribute('aria-label', '按钮管理');
    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        this.close();
      }
    });

    panel.append(this.renderHeader(), this.renderToolbar(), this.renderList());
    overlay.append(panel);
    this.root.append(overlay);
  }

  private renderHeader(): HTMLElement {
    const header = createElement('header', 'bm-header');
    const titleGroup = createElement('div', 'bm-title-group');
    titleGroup.append(createElement('h2', 'bm-title', '按钮管理'));

    const itemKeys = new Set(this.state!.items.map(item => item.key));
    const hiddenCount = this.state!.settings.hiddenKeys.filter(key => itemKeys.has(key)).length;
    const visibleCount = this.state!.items.length - hiddenCount;
    const summary = createElement(
      'div',
      'bm-summary',
      `${this.state!.items.length} 项 · ${Math.max(visibleCount, 0)} 项显示 · ${this.state!.result.hiddenCount} 项隐藏`,
    );
    titleGroup.append(summary);

    const actions = createElement('div', 'bm-header-actions');
    const reset = button('bm-icon-button', 'fa-arrow-rotate-left', '恢复默认');
    reset.addEventListener('click', () => this.resetToDefaults());
    const close = button('bm-icon-button', 'fa-xmark', '关闭');
    close.addEventListener('click', () => this.close());
    actions.append(reset, close);
    header.append(titleGroup, actions);
    return header;
  }

  private renderToolbar(): HTMLElement {
    const toolbar = createElement('div', 'bm-toolbar');
    const searchWrap = createElement('label', 'bm-search-wrap');
    searchWrap.append(createElement('i', 'fa-solid fa-magnifying-glass'));
    const searchInput = createElement('input', 'bm-search') as HTMLInputElement;
    searchInput.type = 'search';
    searchInput.placeholder = '搜索按钮';
    searchInput.value = this.search;
    searchInput.addEventListener('input', () => {
      this.search = searchInput.value;
      this.render();
    });
    searchWrap.append(searchInput);

    const filters = createElement('div', 'bm-filters');
    (Object.keys(FILTER_LABELS) as ButtonFilter[]).forEach(filter => {
      const item = createElement(
        'button',
        `bm-filter${this.filter === filter ? ' bm-filter-active' : ''}`,
        FILTER_LABELS[filter],
      );
      item.type = 'button';
      item.addEventListener('click', () => {
        this.filter = filter;
        this.render();
      });
      filters.append(item);
    });

    const compact = createElement('label', 'bm-switch');
    const compactInput = createElement('input') as HTMLInputElement;
    compactInput.type = 'checkbox';
    compactInput.checked = this.state!.settings.compactEnabled;
    compactInput.addEventListener('change', () => {
      this.commit(withCompactEnabled(this.state!.settings, compactInput.checked));
    });
    compact.append(
      compactInput,
      createElement('span', 'bm-switch-track'),
      createElement('span', 'bm-switch-label', '紧凑排布'),
    );
    filters.append(compact);

    const maxRows = createElement('label', 'bm-row-limit');
    maxRows.append(createElement('span', 'bm-row-limit-label', '最大行数'));
    const maxRowsSelect = createElement('select', 'bm-row-limit-select') as HTMLSelectElement;
    [1, 2, 3, 4, 5, 6, 8].forEach(value => {
      const option = createElement('option') as HTMLOptionElement;
      option.value = String(value);
      option.textContent = `${value}`;
      option.selected = value === this.state!.settings.maxButtonRows;
      maxRowsSelect.append(option);
    });
    maxRowsSelect.addEventListener('change', () => {
      this.commit(withMaxButtonRows(this.state!.settings, Number(maxRowsSelect.value)));
    });
    maxRows.append(maxRowsSelect);
    filters.append(maxRows);

    toolbar.append(searchWrap, filters);
    return toolbar;
  }

  private renderList(): HTMLElement {
    const list = createElement('div', 'bm-list');
    const items = this.getVisibleItems();
    if (items.length === 0) {
      const empty = createElement('div', 'bm-empty', this.search ? '没有匹配的按钮' : '当前没有可管理按钮');
      list.append(empty);
      return list;
    }

    items.forEach(item => list.append(this.renderRow(item)));
    return list;
  }

  private renderRow(item: ButtonItem): HTMLElement {
    const hidden = this.state!.settings.hiddenKeys.includes(item.key);
    const row = createElement('div', `bm-row${hidden ? ' bm-row-muted' : ''}`);
    row.draggable = true;
    row.dataset.key = item.key;
    row.addEventListener('dragstart', event => {
      this.draggingKey = item.key;
      event.dataTransfer?.setData('text/plain', item.key);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
      }
      row.classList.add('bm-row-dragging');
    });
    row.addEventListener('dragend', () => {
      this.draggingKey = undefined;
      this.clearDropIndicator();
      row.classList.remove('bm-row-dragging');
    });
    row.addEventListener('dragover', event => {
      if (this.draggingKey && this.draggingKey !== item.key) {
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'move';
        this.updateDropIndicator(row, event.clientY);
      }
    });
    row.addEventListener('drop', event => {
      event.preventDefault();
      const sourceKey = event.dataTransfer?.getData('text/plain') || this.draggingKey;
      if (sourceKey) {
        this.finishDrag(sourceKey, this.dropTargetKey ?? item.key, this.dropPosition);
      }
    });

    const drag = button('bm-row-handle', 'fa-grip-lines', '拖动排序');
    drag.tabIndex = -1;
    drag.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' || event.button !== 0) {
        return;
      }

      this.pointerDrag = {
        pointerId: event.pointerId,
        row,
        sourceKey: item.key,
      };
      this.draggingKey = item.key;
      row.classList.add('bm-row-dragging');
      drag.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    drag.addEventListener('pointermove', event => {
      if (!this.pointerDrag || this.pointerDrag.pointerId !== event.pointerId) {
        return;
      }

      const targetRow = this.findRowFromPoint(event.clientX, event.clientY);
      if (targetRow) {
        this.updateDropIndicator(targetRow, event.clientY);
      }
      event.preventDefault();
    });
    drag.addEventListener('pointerup', event => {
      if (!this.pointerDrag || this.pointerDrag.pointerId !== event.pointerId) {
        return;
      }

      const { sourceKey } = this.pointerDrag;
      this.pointerDrag.row.classList.remove('bm-row-dragging');
      this.pointerDrag = undefined;
      drag.releasePointerCapture(event.pointerId);
      this.finishDrag(sourceKey, this.dropTargetKey, this.dropPosition);
      event.preventDefault();
    });
    drag.addEventListener('pointercancel', event => {
      if (!this.pointerDrag || this.pointerDrag.pointerId !== event.pointerId) {
        return;
      }

      this.pointerDrag.row.classList.remove('bm-row-dragging');
      this.pointerDrag = undefined;
      this.draggingKey = undefined;
      this.clearDropIndicator();
    });
    drag.addEventListener(
      'touchstart',
      event => {
        if (event.touches.length !== 1) {
          return;
        }

        const touch = event.touches[0];
        this.touchDrag = {
          touchId: touch.identifier,
          row,
          sourceKey: item.key,
        };
        this.draggingKey = item.key;
        row.classList.add('bm-row-dragging');
        event.preventDefault();
      },
      { passive: false },
    );
    drag.addEventListener(
      'touchmove',
      event => {
        if (!this.touchDrag) {
          return;
        }

        const touch = this.getTouch(event.touches, this.touchDrag.touchId);
        if (!touch) {
          return;
        }

        const targetRow = this.findRowFromPoint(touch.clientX, touch.clientY);
        if (targetRow) {
          this.updateDropIndicator(targetRow, touch.clientY);
        }
        event.preventDefault();
      },
      { passive: false },
    );
    drag.addEventListener(
      'touchend',
      event => {
        if (!this.touchDrag) {
          return;
        }

        const touch = this.getTouch(event.changedTouches, this.touchDrag.touchId);
        const { sourceKey } = this.touchDrag;
        if (touch) {
          const targetRow = this.findRowFromPoint(touch.clientX, touch.clientY);
          if (targetRow) {
            this.updateDropIndicator(targetRow, touch.clientY);
          }
        }

        this.touchDrag.row.classList.remove('bm-row-dragging');
        this.touchDrag = undefined;
        this.finishDrag(sourceKey, this.dropTargetKey, this.dropPosition);
        event.preventDefault();
      },
      { passive: false },
    );
    drag.addEventListener('touchcancel', () => {
      if (!this.touchDrag) {
        return;
      }

      this.touchDrag.row.classList.remove('bm-row-dragging');
      this.touchDrag = undefined;
      this.draggingKey = undefined;
      this.clearDropIndicator();
    });

    const main = createElement('div', 'bm-row-main');
    main.append(createElement('div', 'bm-row-label', item.label));
    const meta = createElement('div', 'bm-row-meta', item.detail ? `${item.source} · ${item.detail}` : item.source);
    main.append(meta);

    const controls = createElement('div', 'bm-row-controls');
    const kind = createElement('span', `bm-kind bm-kind-${item.locked ? 'locked' : item.kind}`, kindLabel(item));
    const actions = createElement('div', 'bm-row-actions');

    const toggle = button('bm-icon-button', hidden ? 'fa-eye-slash' : 'fa-eye', hidden ? '显示' : '隐藏');
    toggle.disabled = Boolean(item.locked);
    if (item.locked) {
      toggle.title = '入口按钮不能隐藏';
    }
    toggle.addEventListener('click', () => {
      if (!item.locked) {
        this.commit(withHiddenKey(this.state!.settings, item.key, !hidden));
      }
    });

    actions.append(toggle);
    controls.append(kind, actions);
    row.append(drag, main, controls);
    return row;
  }
}
