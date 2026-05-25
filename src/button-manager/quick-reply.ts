import { getHostDocument, getHostWindow } from './host-dom';
import type { ButtonItem } from './types';

type QuickReply = {
  id?: string | number;
  label?: string;
  title?: string;
  message?: string;
  isHidden?: boolean;
  dom?: HTMLElement | null;
};

type QuickReplySet = {
  name?: string;
  scope?: 'global' | 'chat' | 'character' | string;
  qrList?: QuickReply[];
};

type QuickReplySetLink = {
  isVisible?: boolean;
  set?: QuickReplySet;
};

type QuickReplyConfig = {
  setList?: QuickReplySetLink[];
};

type QuickReplySettings = {
  isEnabled?: boolean;
  isCombined?: boolean;
  config?: QuickReplyConfig;
  chatConfig?: QuickReplyConfig;
  charConfig?: QuickReplyConfig;
  save?: () => void;
};

type QuickReplyApi = {
  settings?: QuickReplySettings;
};

declare global {
  interface Window {
    quickReplyApi?: QuickReplyApi;
  }
}

const QR_SCOPE_LABELS: Record<string, string> = {
  global: '全局 QR',
  chat: '聊天 QR',
  character: '角色 QR',
};

function getQuickReplyApi(): QuickReplyApi | undefined {
  return getHostWindow().quickReplyApi ?? window.quickReplyApi;
}

function qrKey(setName: string, qr: QuickReply, index: number): string {
  return `qr:${setName}:${String(qr.id ?? `${qr.label ?? '未命名'}:${index}`)}`;
}

function isRenderedInButtonBar(element: HTMLElement | null | undefined): element is HTMLElement {
  const buttonBar = getHostDocument().querySelector('#qr--bar');
  return Boolean(element?.isConnected && buttonBar?.contains(element));
}

function collectConfigItems(
  config: QuickReplyConfig | undefined,
  scopeFallback: string,
  startIndex: number,
): ButtonItem[] {
  let index = startIndex;
  const items: ButtonItem[] = [];
  const links = config?.setList ?? [];

  for (const link of links) {
    if (link.isVisible === false || !link.set) {
      continue;
    }

    const setName = link.set.name ?? '未命名集合';
    const scope = link.set.scope ?? scopeFallback;
    const source = QR_SCOPE_LABELS[scope] ?? '快捷回复';

    (link.set.qrList ?? []).forEach((qr, qrIndex) => {
      const element = qr.dom ?? undefined;
      if (qr.isHidden || !isRenderedInButtonBar(element)) {
        return;
      }

      const label = qr.label?.trim() || qr.title?.trim() || qr.message?.trim() || '未命名 QR';
      items.push({
        key: qrKey(setName, qr, qrIndex),
        kind: 'qr',
        label,
        source,
        detail: setName,
        index,
        element,
      });
      index += 1;
    });
  }

  return items;
}

export function collectQuickReplyItems(startIndex: number): ButtonItem[] {
  const settings = getQuickReplyApi()?.settings;
  if (!settings) {
    return [];
  }

  return [
    ...collectConfigItems(settings.config, 'global', startIndex),
    ...collectConfigItems(settings.chatConfig, 'chat', startIndex + 10000),
    ...collectConfigItems(settings.charConfig, 'character', startIndex + 20000),
  ];
}

export function hasQuickReplyApi(): boolean {
  return Boolean(getQuickReplyApi()?.settings);
}

export function syncQuickReplyCombined(compactEnabled: boolean): boolean {
  const settings = getQuickReplyApi()?.settings;
  if (!settings || typeof settings.isCombined !== 'boolean') {
    return false;
  }

  if (settings.isCombined !== compactEnabled) {
    settings.isCombined = compactEnabled;
    settings.save?.();
  }

  const checkbox = getHostDocument().querySelector<HTMLInputElement>('#qr--isCombined');
  if (checkbox) {
    checkbox.checked = compactEnabled;
  }

  return true;
}
