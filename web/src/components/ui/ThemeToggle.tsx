"use client";

import { Moon, Sun } from "lucide-react";

/**
 * Flips .dark on <html> and persists the choice. The icon swap is pure CSS
 * (dark: variant), so there is no client state and no hydration mismatch.
 */
export function ThemeToggle() {
  return (
    <button
      type="button"
      aria-label="Toggle dark mode"
      onClick={() => {
        const dark = document.documentElement.classList.toggle("dark");
        try {
          localStorage.setItem("sellari_theme", dark ? "dark" : "light");
        } catch {
          /* private mode: the theme just won't persist */
        }
      }}
      className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-paper hover:text-ink"
    >
      <Sun aria-hidden size={18} strokeWidth={1.75} className="dark:hidden" />
      <Moon aria-hidden size={18} strokeWidth={1.75} className="hidden dark:block" />
    </button>
  );
}
