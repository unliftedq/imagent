/**
 * Small CLI utilities shared by M3 commands. Kept tiny — no fancy table
 * library, no spinner library by default. The `--wait` flow reaches for an
 * inline `\r`-based progress writer instead.
 */

export function collect(value: string, prev: string[]): string[] {
  return [...(prev ?? []), value];
}

export function parseKeyValueOptions(values: readonly string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const value of values) {
    const idx = value.indexOf("=");
    if (idx <= 0) {
      throw new Error(`expected option as key=value (got '${value}')`);
    }
    const key = value.slice(0, idx).trim();
    if (!key) throw new Error(`expected option as key=value (got '${value}')`);
    out[key] = value.slice(idx + 1);
  }
  return out;
}

export function coerceScalar(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

export function parsePositiveIntegerOption(command: string, key: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${command} option '${key}' must be a positive integer`);
  }
  return parsed;
}

export function parsePositiveNumberOption(command: string, key: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${command} option '${key}' must be a positive number`);
  }
  return parsed;
}

export function isTty(): boolean {
  return Boolean(process.stdout.isTTY);
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s.padEnd(n);
  return `${s.slice(0, n - 1)}…`;
}

/** "3h ago" / "12s ago" / "in 5m". Compact, accepting epoch ms. */
export function formatRelativeTime(epochMs: number, nowMs: number = Date.now()): string {
  const diff = nowMs - epochMs;
  const abs = Math.abs(diff);
  const future = diff < 0;
  const units: [number, string][] = [
    [1000, "s"],
    [60_000, "m"],
    [3_600_000, "h"],
    [86_400_000, "d"],
    [604_800_000, "w"],
    [2_629_800_000, "mo"],
    [31_557_600_000, "y"],
  ];
  let chosen: [number, string] = units[0] ?? [1000, "s"];
  for (const u of units) {
    if (abs >= u[0]) chosen = u;
  }
  const value = Math.max(1, Math.round(abs / chosen[0]));
  return future ? `in ${value}${chosen[1]}` : `${value}${chosen[1]} ago`;
}

/** Excerpt text to N chars with an ellipsis. Used in list / show views. */
export function excerpt(text: string, n: number): string {
  if (!text) return "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= n) return collapsed;
  return `${collapsed.slice(0, Math.max(1, n - 1))}…`;
}

export interface ParsedAttachment {
  /** Asset id. */
  id: string;
  /** Resolved kind. */
  role: "character" | "object" | "background" | "style";
}
