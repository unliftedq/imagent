import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { NavRail, NAV_RAIL_ROWS, type NavRoute } from "./NavRail.js";

/**
 * Smoke tests for the NavRail composite. We're intentionally
 * lightweight here — full interaction tests would require jsdom + RTL which
 * aren't part of the workspace today. These cover:
 *   1. The five rows appear in the canonical order.
 *   2. The active row is rendered with `aria-current="page"`.
 *   3. The exported NAV_RAIL_ROWS list matches the spec.
 *   4. Settings is pinned to the bottom in its own `<ul>` after `mt-auto`.
 */

describe("NavRail", () => {
  it("exports the canonical rows in the exact order", () => {
    const ids = NAV_RAIL_ROWS.map((r) => r.id);
    expect(ids).toEqual(["studio", "gallery", "assets", "models", "providers", "settings"]);
    expect(ids).toHaveLength(6);
  });

  it("does NOT include a Video item in the nav", () => {
    const ids = NAV_RAIL_ROWS.map((r) => r.id) as string[];
    expect(ids).not.toContain("video");
  });

  it("renders all five labels in order", () => {
    const html = renderToStaticMarkup(
      createElement(NavRail, {
        activeRoute: "studio" as NavRoute,
        onNavigate: vi.fn(),
      }),
    );
    const labels = ["Studio", "Gallery", "Assets", "Models", "Providers", "Settings"];
    let lastIdx = -1;
    for (const label of labels) {
      const idx = html.indexOf(`>${label}<`);
      expect(idx, `expected to find ${label} in rendered output`).toBeGreaterThan(-1);
      expect(idx, `${label} should appear after the previous row`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it("renders route-provided icons when supplied", () => {
    const html = renderToStaticMarkup(
      createElement(NavRail, {
        activeRoute: "studio" as NavRoute,
        onNavigate: vi.fn(),
        routes: [
          {
            id: "studio" as NavRoute,
            label: "Studio",
            icon: createElement("span", { "data-route-icon": "studio" }),
          },
          {
            id: "settings" as NavRoute,
            label: "Settings",
            icon: createElement("span", { "data-route-icon": "settings" }),
          },
        ],
      }),
    );
    expect(html).toContain('data-route-icon="studio"');
    expect(html).toContain('data-route-icon="settings"');
  });

  it("marks the active row with aria-current=page", () => {
    const html = renderToStaticMarkup(
      createElement(NavRail, {
        activeRoute: "gallery" as NavRoute,
        onNavigate: vi.fn(),
      }),
    );
    // The aria-current attribute should appear exactly once, on the active row.
    const matches = html.match(/aria-current="page"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it("pins Settings to the bottom in its own <ul> with mt-auto", () => {
    const html = renderToStaticMarkup(
      createElement(NavRail, {
        activeRoute: "studio" as NavRoute,
        onNavigate: vi.fn(),
      }),
    );
    // Settings should sit inside an mt-auto bottom <ul>, not the top group.
    const settingsIdx = html.indexOf(">Settings<");
    expect(settingsIdx).toBeGreaterThan(-1);
    // The bottom group's <ul> opens with class containing `mt-auto`.
    const mtAutoUlIdx = html.search(/<ul[^>]*mt-auto/);
    expect(mtAutoUlIdx).toBeGreaterThan(-1);
    // Settings should appear AFTER the mt-auto <ul> opens.
    expect(settingsIdx).toBeGreaterThan(mtAutoUlIdx);
    // And the primary rows should appear BEFORE the mt-auto <ul>.
    for (const label of ["Studio", "Gallery", "Assets", "Models", "Providers"]) {
      const idx = html.indexOf(`>${label}<`);
      expect(idx, `${label} should render before the bottom mt-auto <ul>`).toBeLessThan(
        mtAutoUlIdx,
      );
    }
  });

  it("does not render any footer status indicator", () => {
    const html = renderToStaticMarkup(
      createElement(NavRail, {
        activeRoute: "studio" as NavRoute,
        onNavigate: vi.fn(),
      }),
    );
    // The status indicator (removed) used aria-label="Status: ...".
    expect(html).not.toContain('aria-label="Status:');
  });
});
