/**
 * Tiny Logger interface used throughout core / providers / job-runner. The
 * library never reaches for `console.*`. Concrete implementations live in
 * apps/* (CLI uses chalk + stderr; desktop main writes to logs/main.log).
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** No-op logger used as a safe default when none is injected. */
export const NoopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** Console-backed logger handy for one-off scripts and quick CLI work. */
export function createConsoleLogger(prefix?: string): Logger {
  const tag = prefix ? `[${prefix}] ` : "";
  return {
    debug(msg, meta) {
      // biome-ignore lint/suspicious/noConsole: explicit logger sink
      console.debug(`${tag}${msg}`, meta ?? "");
    },
    info(msg, meta) {
      // biome-ignore lint/suspicious/noConsole: explicit logger sink
      console.info(`${tag}${msg}`, meta ?? "");
    },
    warn(msg, meta) {
      // biome-ignore lint/suspicious/noConsole: explicit logger sink
      console.warn(`${tag}${msg}`, meta ?? "");
    },
    error(msg, meta) {
      // biome-ignore lint/suspicious/noConsole: explicit logger sink
      console.error(`${tag}${msg}`, meta ?? "");
    },
  };
}
