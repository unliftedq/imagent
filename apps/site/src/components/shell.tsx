import { GithubLogo } from "@phosphor-icons/react";
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
        <div className="nav-bar">
          <SiteLink className="brand" to="/" aria-label="IMAGENT home">
            IMAGENT
          </SiteLink>
          <nav className="nav-right" aria-label="Primary">
            <div className="nav-links">
              <SiteLink className={route.name === "home" ? "active" : undefined} to="/">
                Home
              </SiteLink>
              <SiteLink
                className={route.name === "docs" || route.name === "doc" ? "active" : undefined}
                to="/docs"
              >
                Docs
              </SiteLink>
              <SiteLink
                className={route.name === "changelogs" ? "active" : undefined}
                to="/changelogs"
              >
                Changelogs
              </SiteLink>
            </div>
            <a
              aria-label="Open IMAGENT on GitHub"
              className="icon-btn"
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
            >
              <GithubLogo size={17} weight="bold" />
            </a>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </nav>
        </div>
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
