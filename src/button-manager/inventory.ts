import { collectQuickReplyItems } from './quick-reply';
import { getHostDocument, getHostWindow } from './host-dom';
import { MANAGER_BUTTON_NAME, type ButtonItem } from './types';

const SCRIPT_SCOPE_LABELS: Record<ScriptTreesOptions['type'], string> = {
  global: '全局脚本',
  preset: '预设脚本',
  character: '角色脚本',
};

type ScriptMeta = {
  name: string;
  source: string;
};

function getCurrentScriptId(): string {
  try {
    return getScriptId();
  } catch {
    return '';
  }
}

function getText(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeComparableLabel(label: string): string {
  return label.replace(/[：:]+$/u, '').replace(/\s+/g, ' ').trim();
}

function flattenScriptTrees(trees: ScriptTree[], source: string, metas: Map<string, ScriptMeta>): void {
  for (const tree of trees) {
    if (tree.type === 'folder') {
      flattenScriptTrees(tree.scripts, source, metas);
      continue;
    }

    metas.set(tree.id, {
      name: tree.name,
      source,
    });
  }
}

function collectScriptMetas(): Map<string, ScriptMeta> {
  const metas = new Map<string, ScriptMeta>();
  for (const type of Object.keys(SCRIPT_SCOPE_LABELS) as ScriptTreesOptions['type'][]) {
    try {
      flattenScriptTrees(getScriptTrees({ type }), SCRIPT_SCOPE_LABELS[type], metas);
    } catch {
      // Some scopes are unavailable before the helper finishes initialization.
    }
  }
  return metas;
}

function collectScriptItems(startIndex: number): ButtonItem[] {
  let allButtons: ReturnType<typeof getAllEnabledScriptButtons> = {};
  try {
    allButtons = getAllEnabledScriptButtons();
  } catch {
    allButtons = getHostWindow().TavernHelper?.getAllEnabledScriptButtons?.() ?? {};
  }

  const currentScriptId = getCurrentScriptId();
  const metas = collectScriptMetas();
  const items: ButtonItem[] = [];
  let index = startIndex;

  for (const [scriptId, buttons] of Object.entries(allButtons)) {
    const meta = metas.get(scriptId);
    for (const button of buttons) {
      const locked = scriptId === currentScriptId && button.button_name === MANAGER_BUTTON_NAME;
      items.push({
        key: `script:${scriptId}:${button.button_name}`,
        kind: 'script',
        label: button.button_name,
        source: locked ? '按钮管理入口' : (meta?.source ?? '酒馆助手脚本'),
        detail: locked ? '本脚本' : (meta?.name ?? scriptId),
        index,
        locked,
      });
      index += 1;
    }
  }

  return items;
}

function attachScriptElements(items: ButtonItem[]): void {
  getHostDocument()
    .querySelectorAll<HTMLElement>('#qr--bar [id^="script_container_"] > .qr--button')
    .forEach(element => {
      const container = element.closest<HTMLElement>('[id^="script_container_"]');
      const scriptId = container?.id.replace(/^script_container_/, '') ?? '';
      const label = getButtonLabel(element);
      const item = items.find(candidate => candidate.key === `script:${scriptId}:${label}`);
      if (item) {
        item.element = element;
      }
    });
}

function attachQuickReplyElementsByLabel(items: ButtonItem[]): Set<HTMLElement> {
  const quickReplyItemsByLabel = new Map<string, ButtonItem[]>();
  for (const item of items) {
    if (item.kind !== 'qr') {
      continue;
    }

    const comparableLabel = normalizeComparableLabel(item.label);
    if (!comparableLabel) {
      continue;
    }

    const matchingItems = quickReplyItemsByLabel.get(comparableLabel) ?? [];
    matchingItems.push(item);
    quickReplyItemsByLabel.set(comparableLabel, matchingItems);
  }

  const matchedElements = new Set<HTMLElement>();
  getHostDocument()
    .querySelectorAll<HTMLElement>('#qr--bar .qr--button')
    .forEach(element => {
      if (element.closest('[id^="script_container_"]')) {
        return;
      }

      const comparableLabel = normalizeComparableLabel(getButtonLabel(element) || element.title || '');
      const matchingItems = comparableLabel ? quickReplyItemsByLabel.get(comparableLabel) : undefined;
      const item = matchingItems?.shift();
      if (!item) {
        return;
      }

      item.element = element;
      matchedElements.add(element);
    });

  return matchedElements;
}

function collectDomFallbackItems(startIndex: number, knownKeys: Set<string>, knownElements: Set<HTMLElement>): ButtonItem[] {
  const items: ButtonItem[] = [];
  let index = startIndex;
  const seenLabels = new Map<string, number>();

  getHostDocument()
    .querySelectorAll<HTMLElement>('#qr--bar .qr--button')
    .forEach(element => {
      if (element.closest('[id^="script_container_"]')) {
        return;
      }

      if (knownElements.has(element)) {
        return;
      }

      const apiManagedKey = element.dataset.bmKey;
      if (apiManagedKey && knownKeys.has(apiManagedKey)) {
        return;
      }

      const label = getText(element) || element.title || '未命名按钮';
      const labelCount = seenLabels.get(label) ?? 0;
      seenLabels.set(label, labelCount + 1);
      const key = `dom:${label}:${labelCount}`;
      if (knownKeys.has(key)) {
        return;
      }

      items.push({
        key,
        kind: 'dom',
        label,
        source: '快捷回复',
        detail: 'DOM 扫描',
        index,
        element,
      });
      index += 1;
    });

  return items;
}

function sortByCurrentBarOrder(items: ButtonItem[]): ButtonItem[] {
  const elementOrder = new Map<HTMLElement, number>();
  getHostDocument()
    .querySelectorAll<HTMLElement>('#qr--bar .qr--button')
    .forEach((element, index) => {
      elementOrder.set(element, index);
    });

  if (elementOrder.size === 0) {
    return items;
  }

  return [...items].sort((lhs, rhs) => {
    const lhsOrder = lhs.element ? (elementOrder.get(lhs.element) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    const rhsOrder = rhs.element ? (elementOrder.get(rhs.element) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    return lhsOrder === rhsOrder ? lhs.index - rhs.index : lhsOrder - rhsOrder;
  });
}

export function getButtonLabel(element: Element): string {
  const label = element.querySelector('.qr--button-label');
  return getText(label ?? element);
}

export function collectButtonItems(): ButtonItem[] {
  const scriptItems = collectScriptItems(0);
  const quickReplyItems = collectQuickReplyItems(100000);
  const matchedQuickReplyElements = attachQuickReplyElementsByLabel(quickReplyItems);
  const knownKeys = new Set([...scriptItems, ...quickReplyItems].map(item => item.key));
  const knownElements = new Set(
    [...scriptItems, ...quickReplyItems]
      .map(item => item.element)
      .filter((element): element is HTMLElement => Boolean(element)),
  );
  matchedQuickReplyElements.forEach(element => knownElements.add(element));
  const items = [...scriptItems, ...quickReplyItems, ...collectDomFallbackItems(200000, knownKeys, knownElements)];
  attachScriptElements(items);
  return sortByCurrentBarOrder(items);
}
