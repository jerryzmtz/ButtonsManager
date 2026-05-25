import type { ManagerSettings } from './types';

const SettingsSchema = z
  .object({
    version: z.literal(1).default(1),
    compactEnabled: z.boolean().default(true),
    maxButtonRows: z.number().int().min(1).max(8).default(2),
    hiddenKeys: z.array(z.string()).default([]),
    orderedKeys: z.array(z.string()).default([]),
  })
  .prefault({});

const DEFAULT_SETTINGS: ManagerSettings = {
  version: 1,
  compactEnabled: true,
  maxButtonRows: 2,
  hiddenKeys: [],
  orderedKeys: [],
};

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(value => typeof value === 'string' && value.length > 0))];
}

export function normalizeSettings(value: unknown): ManagerSettings {
  try {
    const parsed = SettingsSchema.parse(value);
    return {
      version: 1,
      compactEnabled: parsed.compactEnabled,
      maxButtonRows: parsed.maxButtonRows,
      hiddenKeys: uniqueStrings(parsed.hiddenKeys),
      orderedKeys: uniqueStrings(parsed.orderedKeys),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function loadSettings(): ManagerSettings {
  return normalizeSettings(getVariables({ type: 'script', script_id: getScriptId() }));
}

export function saveSettings(settings: ManagerSettings): ManagerSettings {
  const normalized = normalizeSettings(settings);
  replaceVariables(normalized, { type: 'script', script_id: getScriptId() });
  return normalized;
}

export function resetSettings(): ManagerSettings {
  return saveSettings({ ...DEFAULT_SETTINGS });
}

export function buildOrderedKeys(settings: ManagerSettings, items: readonly { key: string }[]): string[] {
  const itemKeys = items.map(item => item.key);
  const known = new Set(itemKeys);
  const ordered = settings.orderedKeys.filter(key => known.has(key));
  return [...ordered, ...itemKeys.filter(key => !ordered.includes(key))];
}

export function sortItemsBySettings<T extends { key: string; index: number }>(
  items: readonly T[],
  settings: ManagerSettings,
): T[] {
  const orderedKeys = buildOrderedKeys(settings, items);
  const rank = new Map(orderedKeys.map((key, index) => [key, index]));
  return [...items].sort((lhs, rhs) => {
    const lhsRank = rank.get(lhs.key) ?? Number.MAX_SAFE_INTEGER;
    const rhsRank = rank.get(rhs.key) ?? Number.MAX_SAFE_INTEGER;
    return lhsRank === rhsRank ? lhs.index - rhs.index : lhsRank - rhsRank;
  });
}

export function withHiddenKey(settings: ManagerSettings, key: string, hidden: boolean): ManagerSettings {
  const hiddenKeys = new Set(settings.hiddenKeys);
  if (hidden) {
    hiddenKeys.add(key);
  } else {
    hiddenKeys.delete(key);
  }
  return normalizeSettings({ ...settings, hiddenKeys: [...hiddenKeys] });
}

export function withOrderedKeys(settings: ManagerSettings, orderedKeys: string[]): ManagerSettings {
  return normalizeSettings({ ...settings, orderedKeys });
}

export function withCompactEnabled(settings: ManagerSettings, compactEnabled: boolean): ManagerSettings {
  return normalizeSettings({ ...settings, compactEnabled });
}

export function withMaxButtonRows(settings: ManagerSettings, maxButtonRows: number): ManagerSettings {
  return normalizeSettings({ ...settings, maxButtonRows });
}
