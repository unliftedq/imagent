import { Moon, Sun } from "@phosphor-icons/react";
import type { Theme } from "../lib/types";

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const nextTheme = theme === "light" ? "dark" : "light";

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${nextTheme} theme`}
    >
      {theme === "light" ? <Moon size={18} weight="duotone" /> : <Sun size={18} weight="duotone" />}
      <span>{nextTheme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
