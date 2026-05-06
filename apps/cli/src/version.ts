/**
 * Single source of truth for the CLI version string. We hardcode here rather
 * than reading package.json at runtime because the CLI ships as a
 * `bun build --compile` single binary at M8 and reading sibling files from
 * inside that binary would be awkward.
 */
export const CLI_VERSION = "0.0.4";
