/**
 * Tiny no-dependency spinner used while the CLI waits for image/video jobs to
 * finish. On a TTY it paints a rotating braille frame, a label, optional
 * progress/state, and elapsed time. On a non-TTY it falls back to plain text
 * lines emitted only when the displayed values change (so logs stay quiet).
 *
 * Kept intentionally small — we want a generating affordance, not an ora-style
 * framework.
 */
import chalk from "chalk";

import { isTty } from "./util.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_INTERVAL_MS = 80;
const HIDE_CURSOR = "\u001b[?25l";
const SHOW_CURSOR = "\u001b[?25h";
const CLEAR_LINE = "\r\u001b[2K";

export interface SpinnerOptions {
  /** Short verb phrase shown next to the spinner (e.g. "generating image"). */
  label: string;
  /** Stream the spinner paints to. Defaults to stdout. */
  stream?: NodeJS.WriteStream;
}

export interface SpinnerUpdate {
  label?: string;
  /** 0..1, or null to indicate "no progress available". */
  progress?: number | null;
  /** Provider/job state shown as a small dim suffix. */
  state?: string | null;
}

export interface SpinnerFinalLine {
  /** Optional symbol prepended to the final line (e.g. `chalk.green("ok:")`). */
  symbol?: string;
  message: string;
}

export interface Spinner {
  start(): void;
  update(patch: SpinnerUpdate): void;
  /** Stop animation and optionally emit a final line in place of the spinner. */
  stop(finalLine?: SpinnerFinalLine): void;
}

interface SpinnerState {
  label: string;
  progress: number | null;
  state: string | null;
  frameIdx: number;
  startedAt: number;
  started: boolean;
  stopped: boolean;
  timer?: NodeJS.Timeout;
  exitHandler?: () => void;
  lastNonTtyLine: string;
}

export function createSpinner(opts: SpinnerOptions): Spinner {
  const stream = opts.stream ?? process.stdout;
  const tty = isTty() && stream === process.stdout;
  const s: SpinnerState = {
    label: opts.label,
    progress: null,
    state: null,
    frameIdx: 0,
    startedAt: 0,
    started: false,
    stopped: false,
    lastNonTtyLine: "",
  };

  const render = (): void => {
    if (!tty) return;
    const line = formatTtyLine(s);
    stream.write(`${CLEAR_LINE}${line}`);
    s.frameIdx += 1;
  };

  const emitNonTty = (): void => {
    const line = formatNonTtyLine(s);
    if (line !== s.lastNonTtyLine) {
      stream.write(`${line}\n`);
      s.lastNonTtyLine = line;
    }
  };

  return {
    start(): void {
      if (s.started || s.stopped) return;
      s.started = true;
      s.startedAt = Date.now();
      if (tty) {
        stream.write(HIDE_CURSOR);
        render();
        s.timer = setInterval(render, FRAME_INTERVAL_MS);
        // Don't keep the event loop alive just for the spinner.
        s.timer.unref?.();
        s.exitHandler = (): void => {
          if (!s.stopped) stream.write(SHOW_CURSOR);
        };
        process.once("exit", s.exitHandler);
      } else {
        emitNonTty();
      }
    },
    update(patch: SpinnerUpdate): void {
      if (patch.label !== undefined) s.label = patch.label;
      if (patch.progress !== undefined) s.progress = patch.progress;
      if (patch.state !== undefined) s.state = patch.state;
      if (tty) {
        if (s.started) render();
      } else if (s.started) {
        emitNonTty();
      }
    },
    stop(finalLine?: SpinnerFinalLine): void {
      if (s.stopped) return;
      s.stopped = true;
      if (s.timer) clearInterval(s.timer);
      s.timer = undefined;
      if (tty) {
        stream.write(CLEAR_LINE);
        stream.write(SHOW_CURSOR);
      }
      if (s.exitHandler) {
        process.off("exit", s.exitHandler);
        s.exitHandler = undefined;
      }
      if (finalLine) {
        const prefix = finalLine.symbol ? `${finalLine.symbol} ` : "";
        stream.write(`${prefix}${finalLine.message}\n`);
      }
    },
  };
}

function formatTtyLine(s: SpinnerState): string {
  const frame = FRAMES[s.frameIdx % FRAMES.length] ?? "";
  const pct =
    s.progress === null ? "" : ` ${chalk.dim(`${Math.round(s.progress * 100)}%`)}`;
  const state = s.state ? ` ${chalk.dim(`(${s.state})`)}` : "";
  const elapsed = chalk.dim(formatElapsed(Date.now() - s.startedAt));
  return `${chalk.cyan(frame)} ${s.label}${pct}${state} ${elapsed}`;
}

function formatNonTtyLine(s: SpinnerState): string {
  const pct = s.progress === null ? "—" : `${Math.round(s.progress * 100)}%`;
  const state = s.state ?? "running";
  return `${s.label}: ${pct} (${state})`;
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${minutes}m${rem.toString().padStart(2, "0")}s`;
}
