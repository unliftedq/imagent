import { Moon, Sun } from "@phosphor-icons/react";
import type { Theme } from "../lib/types";

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const nextTheme = theme === "light" ? "dark" : "light";

  return (
    <button
      className="icon-btn"
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${nextTheme} theme`}
    >
      {theme === "light" ? <Moon size={17} weight="bold" /> : <Sun size={17} weight="bold" />}
    </button>
  );
}
