export const MANAGER_BUTTON_NAME = '按钮管理';

export type ButtonKind = 'script' | 'qr' | 'dom';
export type ButtonFilter = 'all' | 'script' | 'qr' | 'hidden';

export type ManagerSettings = {
  version: 1;
  compactEnabled: boolean;
  hiddenKeys: string[];
  orderedKeys: string[];
};

export type ButtonItem = {
  key: string;
  kind: ButtonKind;
  label: string;
  source: string;
  detail: string;
  index: number;
  locked?: boolean;
  element?: HTMLElement;
};

export type LayoutResult = {
  compactApplied: boolean;
  managedCount: number;
  hiddenCount: number;
  qrAvailable: boolean;
};

export type PanelState = {
  items: ButtonItem[];
  settings: ManagerSettings;
  result: LayoutResult;
};
