import { useEffect, useState } from "react";
import { toAppPath } from "./base-path";
import type { Route } from "./types";

function currentRoute(): Route {
  const path = toAppPath(window.location.pathname).replace(/\/$/, "") || "/";

  if (path === "/") {
    return { name: "home", path: "/" };
  }

  if (path === "/docs") {
    return { name: "docs", path: "/docs" };
  }

  if (path.startsWith("/docs/")) {
    return { name: "doc", path, slug: path.replace("/docs/", "") };
  }

  if (path === "/changelogs") {
    return { name: "changelogs", path: "/changelogs" };
  }

  return { name: "not-found", path };
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(() => currentRoute());

  useEffect(() => {
    const handlePopState = () => setRoute(currentRoute());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return { route };
}
