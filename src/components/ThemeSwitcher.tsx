"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getServerSystemThemeSnapshot,
  getServerThemeSnapshot,
  getSystemThemeSnapshot,
  getThemeSnapshot,
  parseThemePreference,
  resolveTheme,
  setThemePreference,
  subscribeSystemTheme,
  subscribeTheme,
} from "@/lib/theme";

export function ThemeSwitcher() {
  const preference = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);
  const systemDark = useSyncExternalStore(subscribeSystemTheme, getSystemThemeSnapshot, getServerSystemThemeSnapshot);
  const resolved = resolveTheme(preference, systemDark);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  return (
    <label className="theme-control">
      Theme
      <select
        className="theme-select"
        aria-label="Theme"
        value={preference}
        onChange={(event) => setThemePreference(parseThemePreference(event.target.value))}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
