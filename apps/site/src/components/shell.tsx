import { BookOpenText, GitBranch, GithubLogo, House } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { githubUrl } from "../lib/constants";
import { SiteLink } from "../lib/site-link";
import type { Route, Theme } from "../lib/types";
import { ThemeToggle } from "./theme-toggle";

export function Shell({
  route,
  theme,
  onToggleTheme,
  children,
}: {
  route: Route;
  theme: Theme;
  onToggleTheme: () => void;
  children: ReactNode;
}) {
  return (
    <div className="site-root">
      <a className="skip-link" href="#content">
        Skip to content
      </a>

      <header className="nav-wrap">
        <nav className="nav-shell" aria-label="Primary">
          <SiteLink className="brand" to="/" aria-label="IMAGENT home">
            IMAGENT
          </SiteLink>
          <div className="nav-links">
            <SiteLink
              aria-label="Home"
              className={route.name === "home" ? "active" : undefined}
              to="/"
            >
              <House size={16} weight="duotone" />
              <span>Home</span>
            </SiteLink>
            <SiteLink
              aria-label="Documentation"
              className={route.name === "docs" || route.name === "doc" ? "active" : undefined}
              to="/docs"
            >
              <BookOpenText size={16} weight="duotone" />
              <span>Docs</span>
            </SiteLink>
            <SiteLink
              aria-label="Changelogs"
              className={route.name === "changelogs" ? "active" : undefined}
              to="/changelogs"
            >
              <GitBranch size={16} weight="duotone" />
              <span>Changelogs</span>
            </SiteLink>
          </div>
          <div className="nav-actions">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <a
              aria-label="Open IMAGENT on GitHub"
              className="github-link"
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
            >
              <GithubLogo size={18} weight="duotone" />
              <span>GitHub</span>
            </a>
          </div>
        </nav>
      </header>

      <main className="site-main" id="content">
        {children}
      </main>

      <footer className="footer">
        <div>
          <strong>IMAGENT</strong>
          <p>Image, video, and speech generation for agents — one interface across every provider, with every asset kept for reuse.</p>
        </div>
        <nav aria-label="Footer">
          <SiteLink to="/">Home</SiteLink>
          <SiteLink to="/docs">Docs</SiteLink>
          <SiteLink to="/changelogs">Changelogs</SiteLink>
          <SiteLink to="/terms">Terms</SiteLink>
          <SiteLink to="/privacy">Privacy</SiteLink>
          <a href={githubUrl} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </footer>
    </div>
  );
}
