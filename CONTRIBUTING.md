# Contributing to imagent

Thanks for your interest in improving imagent! This guide covers the basics of
working in the repository: how to set up your environment, where the code lives,
how to run checks, and how to send a pull request that's easy to review.

If anything below is unclear or out of date, please open an issue or a small PR
to fix it.

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Ways to contribute](#ways-to-contribute)
- [Before you start](#before-you-start)
- [Development setup](#development-setup)
- [Repository layout](#repository-layout)
- [Common workflows](#common-workflows)
- [Coding guidelines](#coding-guidelines)
- [Working with providers](#working-with-providers)
- [Working with persistence](#working-with-persistence)
- [Commit messages](#commit-messages)
- [Pull request process](#pull-request-process)
- [Security and secrets](#security-and-secrets)
- [License](#license)

## Code of conduct

Be respectful, assume good faith, and keep discussions focused on the work.
Harassment or discrimination of any kind is not tolerated. Project maintainers
reserve the right to remove comments or contributors that violate this norm.

## Ways to contribute

- **Report bugs** using the [Bug report](./.github/ISSUE_TEMPLATE/bug_report.yml) template.
- **Propose features** using the [Feature request](./.github/ISSUE_TEMPLATE/feature_request.yml) template.
- **Suggest a provider or model** using the [Provider or model request](./.github/ISSUE_TEMPLATE/provider_or_model_request.yml) template.
- **Improve documentation** — fixes to `README.md`, `docs/`, package READMEs, and code comments are always welcome.
- **Send a pull request** — see [Pull request process](#pull-request-process).

For larger changes (new providers, schema migrations, new top-level features),
please open an issue first so we can discuss the design before you invest time
in implementation.

## Before you start

imagent is intentionally local-first. The current scope is documented in
[`architecture.md`](./architecture.md#scope). Features outside that scope —
cloud sync, multi-user accounts, social feeds, fine-tuning workflows, graph
editors — are unlikely to be accepted without prior discussion.

## Development setup

### Prerequisites

- **Bun** `>=1.3.0` — package manager and task runner. See <https://bun.com>.
- **Node.js** 22 LTS or newer — used by some tools and for native module rebuilds.
- A C/C++ toolchain for native modules (`better-sqlite3`, `sharp`):
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: `build-essential`, `python3`
  - Windows: "Desktop development with C++" workload from Visual Studio Build Tools

### Clone and install

```bash
git clone https://github.com/unliftedq/imagent.git
cd imagent
bun install
```

### Run the desktop app

```bash
bun run --filter @imagent/studio rebuild   # rebuilds native modules for the Electron ABI
bun run --filter @imagent/studio dev
```

If you later run CLI tests or persistence tests, you may need to rebuild
`better-sqlite3` for the host Node ABI. See
[`apps/desktop/README.md`](./apps/desktop/README.md) for details.

### Run the CLI from source

```bash
bun run --filter @imagent/cli build
bun run --filter @imagent/cli start -- doctor
```

### Whole-monorepo checks

From the repo root, Turborepo runs the same task across all packages:

```bash
bun run lint        # Biome lint
bun run format      # Biome format (writes changes)
bun run typecheck   # TypeScript across all packages
bun run test        # Vitest across all packages
bun run build       # Production build for all packages and apps
```

You can scope a task to one workspace with the `--filter` flag, e.g.
`bun run --filter @imagent/providers test`.

## Repository layout

```text
apps/
  desktop/        @imagent/studio — Electron desktop app
  cli/            @imagent/cli — `imagent` command-line tool
  site/           Documentation website
packages/
  core/           Domain types, ports, and job orchestration (no I/O)
  providers/      Provider adapters and model catalog
  persistence/    SQLite, migrations, repositories, files, thumbnails
  config/         Configuration schema, secrets store
  ipc/            Typed desktop IPC contract
  ui/             Shared React UI primitives
skills/imagent/   Installable agent skill
docs/             Source markdown for the documentation site
```

`@imagent/core` is intentionally free of filesystem, database, and network I/O.
Runtime packages compose it with adapters from `@imagent/persistence`,
`@imagent/config`, and `@imagent/providers`. New cross-cutting features should
respect this separation.

## Common workflows

| Task | Command |
| --- | --- |
| Install dependencies | `bun install` |
| Lint | `bun run lint` |
| Format | `bun run format` |
| Typecheck everything | `bun run typecheck` |
| Run all tests | `bun run test` |
| Run tests for one package | `bun run --filter @imagent/<name> test` |
| Start the desktop app | `bun run --filter @imagent/studio dev` |
| Build the CLI | `bun run --filter @imagent/cli build` |
| Build everything | `bun run build` |
| Keep workspace versions in sync | `bun run version:sync` |

## Coding guidelines

- **Language**: TypeScript with `NodeNext` modules across all packages.
- **Style**: enforced by [Biome](https://biomejs.dev/). Run `bun run format`
  before committing. CI runs `bun run lint`.
- **Imports**: prefer relative imports inside a package and the workspace
  package name (`@imagent/core`, etc.) across packages.
- **Side effects**: keep `@imagent/core` free of I/O. Put filesystem, network,
  or database access behind ports implemented by other packages.
- **Errors**: throw `Error` (or a subclass) with actionable messages; do not
  swallow errors silently. CLI commands should map errors to non-zero exit codes.
- **Logging**: avoid leaking secrets, API keys, or full request bodies into logs.
- **Tests**: colocate `*.test.ts` files with the code they cover; use Vitest.
  New features should ship with tests, and bug fixes should include a regression
  test where practical.
- **No new top-level dependencies** without a clear reason. Prefer adding to the
  workspace catalog in the root `package.json` so versions stay aligned.

## Working with providers

Provider adapters live under [`packages/providers/src`](./packages/providers/src).
When adding a new provider:

1. Open an issue first using the
   [Provider or model request](./.github/ISSUE_TEMPLATE/provider_or_model_request.yml)
   template so the design can be discussed.
2. Add the adapter under its own directory (e.g. `packages/providers/src/<name>/`).
3. Register canonical models and offerings in
   `packages/providers/src/catalog.default.json` and the catalog loader.
4. Make sure `imagent doctor`, `imagent models`, and `imagent options` reflect
   the new provider correctly.
5. Add tests for the registry wiring and any non-trivial request/response logic.
6. Document configuration steps in `docs/providers.md` and the relevant
   package READMEs.

## Working with persistence

`@imagent/persistence` owns the SQLite schema. When changing the database:

- **Never edit an existing migration.** Add a new one under
  `packages/persistence/src/migrations/`.
- Update or add repositories under `packages/persistence/src/repositories/`.
- Add tests that exercise the new schema and any data movement.
- If your change affects the desktop renderer or the CLI directly, also update
  the relevant IPC contract or command surface.

## Commit messages

There is no strict commit format, but please:

- Use the imperative mood for the subject line ("Add", "Fix", not "Added"/"Fixes").
- Keep the subject under ~72 characters.
- Reference issues in the body where applicable (`Refs #123`, `Closes #123`).
- Group logically related changes into single commits where reasonable.

## Pull request process

1. Fork the repository and create a topic branch from `main`.
2. Make your changes, including tests and documentation updates.
3. Run `bun run lint`, `bun run typecheck`, and `bun run test` locally.
4. Push your branch and open a pull request against `main`. Fill out the
   [pull request template](./.github/PULL_REQUEST_TEMPLATE.md).
5. Expect review feedback — small follow-up commits are fine; we squash on merge
   when appropriate.
6. Be patient. imagent is maintained by a small group; review cadence varies.

PRs that are likely to land quickly tend to share these qualities:

- Focused scope and a clear motivation linked to an issue.
- Tests for new behavior and regressions.
- No unrelated formatting or refactoring noise.
- Updated documentation when user-visible behavior changes.

## Security and secrets

- **Do not commit API keys, tokens, or anything from `~/.imagent/secrets.json`.**
- If you discover a security issue, please **do not** open a public issue.
  Instead, contact the maintainers privately via the email or contact link
  listed on the project's GitHub profile, or open a
  [private security advisory](https://github.com/unliftedq/imagent/security/advisories/new).
- Redact provider responses and logs before pasting them into issues or PRs.

## License

By contributing to imagent, you agree that your contributions will be licensed
under the project's [Apache License 2.0](./LICENSE). You also confirm that you
have the right to submit the work under that license.
