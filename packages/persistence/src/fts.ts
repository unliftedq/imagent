import { createRequire } from "node:module";
import type { Database as DatabaseType } from "better-sqlite3";

const require = createRequire(import.meta.url);
const { Jieba } = require("@node-rs/jieba") as typeof import("@node-rs/jieba");
const { dict } = require("@node-rs/jieba/dict") as { dict: Uint8Array };

const CJK_RE = /[\p{Script=Han}]+/gu;
const HAS_CJK_RE = /[\p{Script=Han}]/u;
const JIEBA = Jieba.withDict(dict);

function cjkNgrams(input: string): string[] {
  const tokens: string[] = [];
  for (const match of input.matchAll(CJK_RE)) {
    const chars = Array.from(match[0]);
    tokens.push(...chars);
    for (let i = 0; i < chars.length - 1; i += 1) {
      const current = chars[i];
      const next = chars[i + 1];
      if (current && next) tokens.push(`${current}${next}`);
    }
  }
  return tokens;
}

function shouldKeepUntokenizedToken(token: string): boolean {
  // Keep normal whitespace tokens for English/model/path searches; keep single
  // CJK characters so one-character searches work.
  return !HAS_CJK_RE.test(token) || Array.from(token).length === 1;
}

/**
 * SQLite's built-in unicode61 tokenizer does not segment Chinese. Index and
 * query text are expanded with jieba search tokens, plus short CJK n-grams
 * so Chinese substring searches remain intuitive.
 */
export function tokenizeFtsText(raw: string | null | undefined): string {
  const text = raw?.trim() ?? "";
  if (!text) return "";
  const tokens = new Set<string>();
  for (const token of text.split(/\s+/)) {
    const trimmed = token.trim();
    if (trimmed && shouldKeepUntokenizedToken(trimmed)) {
      tokens.add(trimmed);
    }
  }
  for (const token of JIEBA.cutForSearch(text, true)) {
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
  // Keep normal whitespace tokens for English/model/path searches and add
  // jieba/CJK grams for Chinese search.
  for (const token of text.split(/\s+/)) {
    const trimmed = token.trim();
    if (trimmed && shouldKeepUntokenizedToken(trimmed)) {
      tokens.add(trimmed);
    }
  }
  for (const token of JIEBA.cutForSearch(text, true)) {
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
