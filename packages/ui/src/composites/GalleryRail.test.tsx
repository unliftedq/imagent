import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { GalleryRail, type GalleryRailItem } from "./GalleryRail.js";

/**
 * Smoke tests for the GalleryRail right-rail variant. React-dom/server only — a full interaction test (clicking a
 * thumbnail dispatches onItemClick) requires jsdom which isn't in the
 * workspace today.
 */

const fixtureItems: GalleryRailItem[] = [
  { id: "a", src: "file:///a.png", caption: "first", kind: "image" },
  { id: "b", src: "file:///b.png", caption: "second", kind: "image" },
  { id: "c", src: "file:///c.png", caption: "third", kind: "video" },
];

describe("GalleryRail", () => {
  it("renders the Gallery header and filter chips", () => {
    const html = renderToStaticMarkup(
      createElement(GalleryRail, {
        items: fixtureItems,
        onViewAll: vi.fn(),
      }),
    );
    expect(html).toContain("Gallery");
    expect(html).toContain(">All<");
    expect(html).toContain(">Newest<");
  });

  it("renders one button per item", () => {
    const html = renderToStaticMarkup(
      createElement(GalleryRail, {
        items: fixtureItems,
      }),
    );
    // Each thumbnail is a <button> with a title attribute matching the caption.
    expect(html).toContain('title="first"');
    expect(html).toContain('title="second"');
    expect(html).toContain('title="third"');
  });

  it("renders the empty state when items is empty", () => {
    const html = renderToStaticMarkup(
      createElement(GalleryRail, {
        items: [],
      }),
    );
    expect(html).toContain("No items yet");
  });

  it("shows the selected outline ring on the matching item", () => {
    const html = renderToStaticMarkup(
      createElement(GalleryRail, {
        items: fixtureItems,
        selectedId: "b",
      }),
    );
    // The selected item carries the accent outline class.
    expect(html).toContain("outline-(--accent)");
  });

  it("renders View all when handler is provided", () => {
    const onViewAll = vi.fn();
    const html = renderToStaticMarkup(
      createElement(GalleryRail, {
        items: fixtureItems,
        onViewAll,
      }),
    );
    expect(html).toContain(">View all<");
  });

  it("hides the View all button when no handler is provided", () => {
    const html = renderToStaticMarkup(
      createElement(GalleryRail, {
        items: fixtureItems,
      }),
    );
    expect(html).not.toContain(">View all<");
  });
});
