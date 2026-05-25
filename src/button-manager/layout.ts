import { buildOrderedKeys } from './settings';
import { getHostDocument } from './host-dom';
import { getButtonLabel } from './inventory';
import { hasQuickReplyApi, syncQuickReplyCombined } from './quick-reply';
import { MANAGER_BUTTON_NAME, type ButtonItem, type LayoutResult, type ManagerSettings } from './types';

const BUTTON_HIDDEN_CLASS = 'bm-button-hidden';
const BAR_COMPACT_CLASS = 'bm-compact';

function findScriptItem(items: ButtonItem[], scriptId: string, label: string): ButtonItem | undefined {
  return items.find(item => item.key === `script:${scriptId}:${label}`);
}

function ensureScriptDomItems(items: ButtonItem[]): void {
  getHostDocument()
    .querySelectorAll<HTMLElement>('#qr--bar [id^="script_container_"] > .qr--button')
    .forEach(element => {
      const container = element.closest<HTMLElement>('[id^="script_container_"]');
      const scriptId = container?.id.replace(/^script_container_/, '') ?? '';
      const label = getButtonLabel(element);
      if (!scriptId || !label) {
        return;
      }

      const item = findScriptItem(items, scriptId, label);
      if (item) {
        item.element = element;
        item.locked = item.locked || label === MANAGER_BUTTON_NAME;
      } else {
        items.push({
          key: `script:${scriptId}:${label}`,
          kind: 'script',
          label,
          source: label === MANAGER_BUTTON_NAME ? '按钮管理入口' : '酒馆助手脚本',
          detail: scriptId,
          index: items.length + 300000,
          locked: label === MANAGER_BUTTON_NAME,
          element,
        });
      }
    });
}

function applyBarClass(compactEnabled: boolean): void {
  getHostDocument()
    .querySelectorAll<HTMLElement>('#qr--bar')
    .forEach(bar => {
      bar.classList.toggle(BAR_COMPACT_CLASS, compactEnabled);
    });
}

export function applyButtonLayout(rawItems: ButtonItem[], settings: ManagerSettings): LayoutResult {
  syncQuickReplyCombined(settings.compactEnabled);

  applyBarClass(settings.compactEnabled);
  const items = [...rawItems];
  ensureScriptDomItems(items);

  const hiddenKeys = new Set(settings.hiddenKeys);
  const orderedKeys = buildOrderedKeys(settings, items);
  const orderRank = new Map(orderedKeys.map((key, index) => [key, index]));
  let managedCount = 0;
  let hiddenCount = 0;

  for (const item of items) {
    const element = item.element;
    if (!element?.isConnected) {
      continue;
    }

    const hidden = hiddenKeys.has(item.key) && !item.locked;
    element.dataset.bmKey = item.key;
    element.classList.toggle(BUTTON_HIDDEN_CLASS, hidden);
    element.style.order = String(orderRank.get(item.key) ?? item.index);
    managedCount += 1;
    if (hidden) {
      hiddenCount += 1;
    }
  }

  return {
    compactApplied: settings.compactEnabled,
    managedCount,
    hiddenCount,
    qrAvailable: hasQuickReplyApi(),
  };
}
