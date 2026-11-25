// Theme preference and browser stores. The inline bootstrap in app/layout.tsx uses the same key.

export const THEME_STORAGE_KEY = "reader:theme:v1";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === "dark" || (preference === "system" && systemDark) ? "dark" : "light";
}

/** Invalid, missing, and unavailable storage all safely fall back to System. */
export function readThemePreference(storage: ThemeStorage | null): ThemePreference {
  try {
    return parseThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

/** System is the default, so it needs no stored value. Storage failures leave the session working. */
export function saveThemePreference(storage: ThemeStorage | null, preference: ThemePreference): void {
  try {
    if (preference === "system") storage?.removeItem(THEME_STORAGE_KEY);
    else storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The selected theme still applies for this session.
  }
}

export const THEME_BOOTSTRAP_SCRIPT = `(function () {
  var preference = "system";
  try {
    var saved = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (saved === "light" || saved === "dark" || saved === "system") preference = saved;
  } catch (_) {}
  var systemDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  var theme = preference === "dark" || (preference === "system" && systemDark) ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();`;

let snapshot: ThemePreference | null = null;
const listeners = new Set<() => void>();

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function publish(preference: ThemePreference): void {
  snapshot = preference;
  for (const listener of listeners) listener();
}

export function getThemeSnapshot(): ThemePreference {
  snapshot ??= readThemePreference(browserStorage());
  return snapshot;
}

export function getServerThemeSnapshot(): ThemePreference {
  return "system";
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) publish(parseThemePreference(event.newValue));
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setThemePreference(preference: ThemePreference): void {
  saveThemePreference(browserStorage(), preference);
  publish(preference);
}

export function getSystemThemeSnapshot(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getServerSystemThemeSnapshot(): boolean {
  return false;
}

export function subscribeSystemTheme(listener: () => void): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
