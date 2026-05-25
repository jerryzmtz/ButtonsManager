import { createScriptIdDiv, teleportStyle } from '@util/script';

import './styles.css';
import { getHostBody, getHostDocument, getHostWindow } from './host-dom';
import { collectButtonItems } from './inventory';
import { applyButtonLayout } from './layout';
import { loadSettings, saveSettings } from './settings';
import { ButtonManagerPanel } from './panel';
import { MANAGER_BUTTON_NAME, type ManagerSettings, type PanelState } from './types';

const APPLY_DELAY_MS = 80;
const REGISTER_RETRY_LIMIT = 20;
const REGISTER_RETRY_DELAY_MS = 250;

let panel: ButtonManagerPanel | undefined;
let settings: ManagerSettings = loadSettings();
let root: JQuery<HTMLDivElement> | undefined;
let destroyTeleportedStyle: (() => void) | undefined;
let observers: MutationObserver[] = [];
let applyTimer: number | undefined;
let observeRetryTimer: number | undefined;
const cleanupCallbacks: Array<() => void> = [];

function getCurrentScriptIdSafe(): string {
  try {
    return getScriptId();
  } catch {
    return '';
  }
}

function escapeCssIdentifier(value: string): string {
  return getHostWindow().CSS?.escape?.(value) ?? value.replace(/["\\]/g, '\\$&');
}

function ensureManagerButton(): boolean {
  try {
    updateScriptButtonsWith(buttons => {
      const next = buttons.filter(button => button.name !== MANAGER_BUTTON_NAME);
      return [...next, { name: MANAGER_BUTTON_NAME, visible: true }];
    });
    return true;
  } catch (error) {
    console.warn('[button-manager] 注册入口按钮失败，稍后重试。', error);
    return false;
  }
}

function registerManagerButtonWithRetry(attempt = 1): void {
  if (ensureManagerButton() || attempt >= REGISTER_RETRY_LIMIT) {
    return;
  }
  const timer = getHostWindow().setTimeout(() => registerManagerButtonWithRetry(attempt + 1), REGISTER_RETRY_DELAY_MS);
  cleanupCallbacks.push(() => getHostWindow().clearTimeout(timer));
}

function createPanelState(): PanelState {
  const items = collectButtonItems();
  const result = applyButtonLayout(items, settings);
  return { items, settings, result };
}

function refreshPanelState(): void {
  const state = createPanelState();
  panel?.update(state);
}

function applyNow(): void {
  settings = loadSettings();
  refreshPanelState();
}

function scheduleApply(): void {
  if (applyTimer !== undefined) {
    getHostWindow().clearTimeout(applyTimer);
  }
  applyTimer = getHostWindow().setTimeout(() => {
    applyTimer = undefined;
    applyNow();
  }, APPLY_DELAY_MS);
}

function onSettingsChange(nextSettings: ManagerSettings): void {
  settings = saveSettings(nextSettings);
  scheduleApply();
}

function openPanel(): void {
  applyNow();
  panel?.open();
}

function bindButtonEvent(): void {
  const buttonEvent = eventOn(getButtonEvent(MANAGER_BUTTON_NAME), openPanel);
  cleanupCallbacks.push(buttonEvent.stop);

  const currentScriptId = getCurrentScriptIdSafe();
  const selector = currentScriptId
    ? `#script_container_${escapeCssIdentifier(currentScriptId)} > .qr--button`
    : '#qr--bar [id^="script_container_"] > .qr--button';

  $(getHostDocument()).on('click.buttonManager', selector, event => {
    const label = ($(event.currentTarget).text() ?? '').replace(/\s+/g, ' ').trim();
    if (label === MANAGER_BUTTON_NAME) {
      event.preventDefault();
      event.stopPropagation();
      openPanel();
    }
  });
  cleanupCallbacks.push(() => $(getHostDocument()).off('.buttonManager'));
}

function bindTavernEvents(): void {
  [
    tavern_events.APP_READY,
    tavern_events.EXTENSION_SETTINGS_LOADED,
    tavern_events.SETTINGS_UPDATED,
    tavern_events.CHAT_CHANGED,
  ].forEach(eventType => {
    const listener = eventOn(eventType, () => {
      observeButtonBar();
      scheduleApply();
    });
    cleanupCallbacks.push(listener.stop);
  });
}

function disconnectObservers(): void {
  observers.forEach(activeObserver => activeObserver.disconnect());
  observers = [];

  if (observeRetryTimer !== undefined) {
    getHostWindow().clearTimeout(observeRetryTimer);
    observeRetryTimer = undefined;
  }
}

function mutationsOnlyTouchManager(mutations: MutationRecord[]): boolean {
  return mutations.every(mutation => {
    const target = mutation.target;
    if (target.nodeType !== 1) {
      return false;
    }

    return Boolean((target as Element).closest('[data-button-manager-root="true"]'));
  });
}

function createButtonBarObserver(target: Element): void {
  const activeObserver = new MutationObserver(mutations => {
    if (!mutationsOnlyTouchManager(mutations)) {
      scheduleApply();
    }
  });

  activeObserver.observe(target, {
    childList: true,
    subtree: true,
  });
  observers.push(activeObserver);
}

function observeButtonBar(): void {
  disconnectObservers();

  const hostDocument = getHostDocument();
  const sendForm = hostDocument.querySelector('#send_form');
  const buttonBar = hostDocument.querySelector('#qr--bar');

  if (sendForm) {
    createButtonBarObserver(sendForm);
    return;
  }

  if (buttonBar?.parentElement) {
    createButtonBarObserver(buttonBar.parentElement);
    return;
  }

  const discoveryObserver = new MutationObserver(mutations => {
    if (mutationsOnlyTouchManager(mutations)) {
      return;
    }

    if (getHostDocument().querySelector('#send_form, #qr--bar')) {
      observeButtonBar();
      scheduleApply();
    }
  });

  discoveryObserver.observe(getHostBody(), {
    childList: true,
  });
  observers.push(discoveryObserver);
  observeRetryTimer = getHostWindow().setTimeout(() => observeButtonBar(), 1000);
}

function mount(): void {
  const scriptId = getCurrentScriptIdSafe();
  if (scriptId) {
    $(`[script_id="${scriptId}"][data-button-manager-root="true"]`).remove();
  }

  destroyTeleportedStyle = teleportStyle().destroy;
  root = createScriptIdDiv().attr('data-button-manager-root', 'true').appendTo('body');
  panel = new ButtonManagerPanel({
    root: root[0],
    onSettingsChange,
  });

  registerManagerButtonWithRetry();
  bindButtonEvent();
  bindTavernEvents();
  observeButtonBar();
  scheduleApply();
}

function cleanup(): void {
  if (applyTimer !== undefined) {
    getHostWindow().clearTimeout(applyTimer);
  }
  disconnectObservers();
  panel?.destroy();
  root?.remove();
  destroyTeleportedStyle?.();
  cleanupCallbacks.splice(0).forEach(callback => callback());
}

$(() => {
  mount();
  $(window).on('pagehide.buttonManager', cleanup);
});
