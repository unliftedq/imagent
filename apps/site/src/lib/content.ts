import { marked } from "marked";
import changelogMarkdown from "../../../../CHANGELOG.md?raw";
import { docOrder } from "./constants";
import type { ChangelogEntry, DocPage, FrontMatter } from "./types";

const docModules = import.meta.glob("../../../../docs/*.md", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

function slugToTitle(slug: string) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractTitle(markdown: string, fallback: string) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? slugToTitle(fallback);
}

function extractDescription(markdown: string) {
  return (
    markdown
      .split("\n")
      .map((line) => line.trim())
      .find(
        (line) =>
          line.length > 0 &&
          !line.startsWith("#") &&
          !line.startsWith("`") &&
          !line.startsWith("-") &&
          !line.startsWith("|"),
      ) ?? "Source documentation from the IMAGENT repository."
  );
}

function parseFrontMatter(markdown: string) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);

  if (!match) {
    return { metadata: {}, body: markdown } satisfies { metadata: FrontMatter; body: string };
  }

  const metadata = (match[1] ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<FrontMatter>((values, line) => {
      const separatorIndex = line.indexOf(":");

      if (separatorIndex === -1) {
        return values;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");

      if (key === "title" || key === "description") {
        values[key] = value;
      }

      return values;
    }, {});

  return { metadata, body: markdown.slice(match[0].length) };
}

export function createDocs() {
  return Object.entries(docModules)
    .map(([path, markdown]) => {
      const slug = path.split("/").at(-1)?.replace(/\.md$/, "") ?? "doc";
      const { metadata, body } = parseFrontMatter(markdown);

      return {
        slug,
        title: metadata.title ?? extractTitle(body, slug),
        description: metadata.description ?? extractDescription(body),
        markdown: body,
      } satisfies DocPage;
    })
    .sort((first, second) => {
      const firstIndex = docOrder.indexOf(first.slug);
      const secondIndex = docOrder.indexOf(second.slug);

      return (firstIndex === -1 ? 999 : firstIndex) - (secondIndex === -1 ? 999 : secondIndex);
    });
}

export function createChangelogEntries() {
  const sections = changelogMarkdown.split(/^##\s+/m).slice(1);

  return sections.map((section) => {
    const [heading = "Unreleased", ...bodyLines] = section.trim().split("\n");
    const [version = heading, date = ""] = heading.split(" - ");
    const notes = bodyLines
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.replace(/^-\s+/, ""));

    return { version, date, notes } satisfies ChangelogEntry;
  });
}

export function renderMarkdown(markdown: string) {
  return { __html: marked.parse(markdown) as string };
}
