const normalizedBasePath = (() => {
  const base = import.meta.env.BASE_URL || "/";
  const withLeadingSlash = base.startsWith("/") ? base : `/${base}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, "");

  return withoutTrailingSlash === "" ? "" : withoutTrailingSlash;
})();

export function toAppPath(pathname: string) {
  if (!normalizedBasePath || normalizedBasePath === "/") {
    return pathname;
  }

  if (pathname === normalizedBasePath) {
    return "/";
  }

  if (pathname.startsWith(`${normalizedBasePath}/`)) {
    return pathname.slice(normalizedBasePath.length) || "/";
  }

  return pathname;
}

export function toPublicPath(path: string) {
  if (!normalizedBasePath || normalizedBasePath === "/") {
    return path;
  }

  return path === "/" ? `${normalizedBasePath}/` : `${normalizedBasePath}${path}`;
}
