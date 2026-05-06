# Updates

### Update the CLI

If installed globally with npm:

```bash
npm update -g @imagent/cli
imagent doctor
```

Or reinstall the latest published version:

```bash
npm install -g @imagent/cli@latest
```

If using `npx`, each invocation can resolve the latest package version depending on your npm cache and command options:

```bash
npx -y @imagent/cli@latest doctor
```

If running from source:

```bash
git pull
bun install
bun run --filter @imagent/cli build
```

### Update the desktop app

The project does not currently include automatic updates. To update the desktop application, install a newer packaged release over the existing installation. User data remains under `~/.imagent/` and is not removed by the Windows uninstaller by default.

If running from source:

```bash
git pull
bun install
bun run --filter @imagent/studio rebuild
bun run --filter @imagent/studio build
```

Run `rebuild` again after dependency or Electron changes so native modules match the Electron runtime.

### Update the model catalog

The runtime model catalog is stored at `~/.imagent/catalog.json`. On first run, imagent seeds it from the bundled default catalog. After that, the user file is authoritative.

Show the active catalog path:

```bash
imagent catalog path
```

Inspect models and provider mappings:

```bash
imagent catalog show
imagent catalog show --provider openai
imagent catalog show --kind video
```

Reset the user catalog to the bundled default:

```bash
imagent catalog reset
```

Use `--force` to skip the confirmation prompt:

```bash
imagent catalog reset --force
```
