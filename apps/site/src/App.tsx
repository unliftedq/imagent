import { useEffect, useMemo, useState } from "react";
import { Shell } from "./components/shell";
import { createChangelogEntries, createDocs } from "./lib/content";
import { useRouter } from "./lib/router";
import type { Theme } from "./lib/types";
import { ChangelogsPage } from "./pages/changelogs";
import { DocPageView } from "./pages/doc-detail";
import { DocsIndexPage } from "./pages/docs-index";
import { HomePage } from "./pages/home";
import { NotFoundPage } from "./pages/not-found";

export function App() {
  const { route } = useRouter();
  const docs = useMemo(() => createDocs(), []);
  const changelogEntries = useMemo(() => createChangelogEntries(), []);
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = window.localStorage.getItem("imagent-site-theme");
    return storedTheme === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("imagent-site-theme", theme);
  }, [theme]);

  const selectedDoc =
    route.name === "doc" ? docs.find((doc) => doc.slug === route.slug) : undefined;

  return (
    <Shell
      route={route}
      theme={theme}
      onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      {route.name === "home" ? <HomePage changelogEntries={changelogEntries} /> : null}
      {route.name === "docs" ? <DocsIndexPage docs={docs} /> : null}
      {route.name === "doc" && selectedDoc ? <DocPageView doc={selectedDoc} docs={docs} /> : null}
      {route.name === "doc" && !selectedDoc ? <NotFoundPage /> : null}
      {route.name === "changelogs" ? <ChangelogsPage entries={changelogEntries} /> : null}
      {route.name === "not-found" ? <NotFoundPage /> : null}
    </Shell>
  );
}
