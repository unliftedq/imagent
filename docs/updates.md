---
description: Update the CLI, rebuild the desktop app, and refresh the model catalog.
---

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

The project does not currently include automatic updates. To update the desktop application, install a newer packaged release over the existing installation. User data remains in the local workspace and is not removed by the Windows uninstaller by default.

If running from source:

```bash
git pull
bun install
bun run --filter @imagent/studio rebuild
bun run --filter @imagent/studio build
```

Run `rebuild` again after dependency or Electron changes so native modules match the Electron runtime.

### Update the model catalog

The bundled model catalog ships with imagent. The optional local workspace `catalog.json` file is an overlay for additions or overrides; it is not created on first run.

Show the active catalog path (printed alongside config.json and secrets.json):

```bash
imagent config path
```

Inspect models and provider mappings:

```bash
imagent models
imagent models --provider openai
imagent models --kind video
imagent options --provider openai --model gpt-image-2
```

Remove the local overlay so only the bundled catalog applies:

```bash
imagent config reset catalog
```

Use `--force` to skip the confirmation prompt:

```bash
imagent config reset catalog --force
```
