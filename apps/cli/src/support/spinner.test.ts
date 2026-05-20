import { describe, expect, it } from "vitest";

import { createSpinner, formatElapsed } from "./spinner.js";

interface FakeStream {
  isTTY: boolean;
  writes: string[];
  write(chunk: string): boolean;
}

function makeStream(): FakeStream {
  return {
    isTTY: false,
    writes: [],
    write(chunk: string): boolean {
      this.writes.push(chunk);
      return true;
    },
  };
}

describe("formatElapsed", () => {
  it("renders seconds when under a minute", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(45_000)).toBe("45s");
  });
  it("renders minutes and seconds when over a minute", () => {
    expect(formatElapsed(65_000)).toBe("1m05s");
    expect(formatElapsed(3 * 60_000 + 9_000)).toBe("3m09s");
  });
});

describe("createSpinner", () => {
  // Passing a custom stream forces non-TTY mode because the spinner only animates
  // when `stream === process.stdout`. That keeps the test deterministic.
  it("emits plain text lines on non-TTY streams only when state changes", () => {
    const stream = makeStream();
    const spinner = createSpinner({
      label: "generating image",
      stream: stream as unknown as NodeJS.WriteStream,
    });
    spinner.start();
    spinner.update({ progress: 0.25, state: "running" });
    spinner.update({ progress: 0.25, state: "running" }); // duplicate suppressed
    spinner.update({ progress: 0.5, state: "running" });
    spinner.stop({ message: "done" });

    expect(stream.writes).toEqual([
      "generating image: — (running)\n",
      "generating image: 25% (running)\n",
      "generating image: 50% (running)\n",
      "done\n",
    ]);
  });

  it("stop is idempotent", () => {
    const stream = makeStream();
    const spinner = createSpinner({
      label: "test",
      stream: stream as unknown as NodeJS.WriteStream,
    });
    spinner.start();
    spinner.stop();
    spinner.stop();
    // No final message lines should appear; only the start line.
    expect(stream.writes).toEqual(["test: — (running)\n"]);
  });

  it("update before start does not emit lines", () => {
    const stream = makeStream();
    const spinner = createSpinner({
      label: "test",
      stream: stream as unknown as NodeJS.WriteStream,
    });
    spinner.update({ progress: 0.5, state: "running" });
    expect(stream.writes).toEqual([]);
  });
});
