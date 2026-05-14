import { createRequire } from "node:module";
import type { Database as DatabaseType } from "better-sqlite3";

const require = createRequire(import.meta.url);
const nodejieba = require("nodejieba") as {
  cutForSearch(input: string): string[];
};

const CJK_RE = /[\p{Script=Han}]+/gu;

function cjkNgrams(input: string): string[] {
  const tokens: string[] = [];
  for (const match of input.matchAll(CJK_RE)) {
    const chars = Array.from(match[0]);
    tokens.push(...chars);
    for (let i = 0; i < chars.length - 1; i += 1) {
      tokens.push(`${chars[i] ?? ""}${chars[i + 1] ?? ""}`);
    }
  }
  return tokens;
}

/**
 * SQLite's built-in unicode61 tokenizer does not segment Chinese. Index and
 * query text are expanded with nodejieba search tokens, plus short CJK n-grams
 * so Chinese substring searches remain intuitive.
 */
export function tokenizeFtsText(raw: string | null | undefined): string {
  const text = raw?.trim() ?? "";
  if (!text) return "";
  const tokens = new Set<string>([text]);
  for (const token of nodejieba.cutForSearch(text)) {
    const trimmed = token.trim();
    if (trimmed) tokens.add(trimmed);
  }
  for (const token of cjkNgrams(text)) {
    tokens.add(token);
  }
  return Array.from(tokens).join(" ");
}

/**
 * Wrap a raw user search string into an FTS5-safe query after applying the same
 * tokenizer used by FTS triggers. FTS5 MATCH inputs are parsed, so quote each
 * token and AND them to avoid punctuation/quote syntax errors.
 */
export function ftsMatchQuery(raw: string): string {
  const text = raw.trim();
  const tokens = new Set<string>();
  for (const token of text.split(/\s+/)) {
    const trimmed = token.trim();
    if (trimmed) tokens.add(trimmed);
  }
  for (const token of nodejieba.cutForSearch(text)) {
    const trimmed = token.trim();
    if (trimmed) tokens.add(trimmed);
  }
  for (const token of cjkNgrams(text)) {
    tokens.add(token);
  }
  const matchTokens = Array.from(tokens);
  if (matchTokens.length === 0) return '""';
  return matchTokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ");
}

export function registerFtsFunctions(db: DatabaseType): void {
  db.function("imagent_jieba", { deterministic: true }, (value: unknown) =>
    tokenizeFtsText(value == null ? null : String(value)),
  );
}
