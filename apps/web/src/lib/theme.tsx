import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMediaQuery } from "./useMediaQuery";

/* Light and dark theme. With no saved choice the theme follows the system setting
   (prefers-color-scheme). A choice is saved in localStorage under "volume.theme"; storage can be
   blocked, so every read and write is wrapped. index.html applies the same rule before first paint. */

export type Theme = "light" | "dark";
const STORAGE_KEY = "volume.theme";

function readPreference(): Theme | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function writePreference(v: Theme | null): void {
  try {
    if (v === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // Storage blocked (private window, previews). The choice lasts for this visit only.
  }
}

interface ThemeContextValue {
  /** The theme on screen now. */
  theme: Theme;
  /** The saved choice, or null when following the system. */
  preference: Theme | null;
  setTheme: (theme: Theme) => void;
  followSystem: () => void;
  toggle: () => void;
}

/** Paints the browser bar with the canvas token of the theme on screen. index.html starts it from the
    system setting; this keeps it right after a saved choice or a system change. */
function syncThemeColour(): void {
  const canvas = getComputedStyle(document.documentElement).getPropertyValue("--vol-canvas").trim();
  if (!canvas) return;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = canvas;
  });
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Theme | null>(() => readPreference());
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const theme: Theme = preference ?? (systemDark ? "dark" : "light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    syncThemeColour();
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setPreference(t);
    writePreference(t);
  }, []);
  const followSystem = useCallback(() => {
    setPreference(null);
    writePreference(null);
  }, []);
  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  const value = useMemo(() => ({ theme, preference, setTheme, followSystem, toggle }), [theme, preference, setTheme, followSystem, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
