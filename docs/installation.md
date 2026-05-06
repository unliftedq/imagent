---
description: Install the CLI, run from source, and prepare the desktop app for local use.
---

# Installation

### Prerequisites

- CLI package: Node.js `>=22`.
- Source development: Bun `>=1.3`.
- Desktop development and packaging: Bun plus native module rebuild support for Electron.

### Install the CLI

Preferred global installation:

```bash
npm install -g @imagent/cli
imagent doctor
```

Run without installing:

```bash
npx -y @imagent/cli doctor
```

Build from source:

```bash
git clone https://github.com/unliftedq/imagent.git
cd imagent
bun install
bun run --filter @imagent/cli build
node apps/cli/dist/cli.js doctor
```

Build a standalone CLI binary from source:

```bash
bun run --filter @imagent/cli build:binary
```

### Install the desktop application

If a packaged release is available for your platform, download the installer or app image from the project releases and install it normally. The current desktop packaging configuration targets:

- Windows: NSIS installer, x64.
- macOS: DMG, x64 and arm64.
- Linux: AppImage, x64.

Windows installers are currently unsigned and may trigger a SmartScreen warning on first launch.

Build and run the desktop app from source:

```bash
git clone https://github.com/unliftedq/imagent.git
cd imagent
bun install
bun run --filter @imagent/studio rebuild
bun run --filter @imagent/studio dev
```

`rebuild` is required before the first desktop launch so `better-sqlite3` and `sharp` are rebuilt for the Electron ABI.

Package the desktop app from source:

```bash
bun run --filter @imagent/studio package
```

The default package script builds the Windows NSIS installer. Platform-specific package scripts are also available:

```bash
bun run --filter @imagent/studio package:win
bun run --filter @imagent/studio package:mac
bun run --filter @imagent/studio package:linux
```

Packaged desktop builds keep the local workspace in place across reinstalls and upgrades, so your gallery, assets, boards, config, and provider secrets remain available.
