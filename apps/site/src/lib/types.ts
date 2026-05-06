export type Theme = "light" | "dark";

export type Route =
  | { name: "home"; path: "/" }
  | { name: "docs"; path: "/docs" }
  | { name: "doc"; path: string; slug: string }
  | { name: "changelogs"; path: "/changelogs" }
  | { name: "not-found"; path: string };

export type DocPage = {
  slug: string;
  title: string;
  description: string;
  markdown: string;
};

export type ChangelogEntry = {
  version: string;
  date: string;
  notes: string[];
};

export type FrontMatter = {
  title?: string;
  description?: string;
};
