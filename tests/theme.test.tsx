import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import {
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  saveThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme";

class FakeStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const unavailableStorage = {
  getItem(): string | null {
    throw new Error("Storage blocked");
  },
  setItem(): void {
    throw new Error("Storage blocked");
  },
  removeItem(): void {
    throw new Error("Storage blocked");
  },
};

describe("theme preferences", () => {
  it("defaults missing and invalid values to System", () => {
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference("blue")).toBe("system");
    expect(readThemePreference(null)).toBe("system");
    expect(readThemePreference(new FakeStorage())).toBe("system");
  });

  it("reads valid saved preferences", () => {
    for (const preference of ["light", "dark", "system"] satisfies ThemePreference[]) {
      const storage = new FakeStorage();
      storage.setItem(THEME_STORAGE_KEY, preference);
      expect(readThemePreference(storage)).toBe(preference);
    }
  });

  it("persists explicit Light and Dark choices, while System clears the override", () => {
    const storage = new FakeStorage();
    saveThemePreference(storage, "dark");
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    saveThemePreference(storage, "light");
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("light");
    saveThemePreference(storage, "system");
    expect(storage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("keeps working when browser storage is blocked", () => {
    expect(readThemePreference(unavailableStorage)).toBe("system");
    expect(() => saveThemePreference(unavailableStorage, "dark")).not.toThrow();
  });

  it("resolves System from the OS and lets explicit choices override it", () => {
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("renders a keyboard-accessible three-mode selector", () => {
    const html = renderToStaticMarkup(<ThemeSwitcher />);
    expect(html).toContain('aria-label="Theme"');
    expect(html).toContain('<option value="system"');
    expect(html).toContain('<option value="light"');
    expect(html).toContain('<option value="dark"');
    expect(html).toContain('selected=""');
  });
});
