---
description: Keep assets organized, manage secrets carefully, and preserve reproducible generation history.
---

# Best Practices

### Protect secrets

- Prefer `imagent config set` or the desktop **Providers** page over manual secret file edits.
- Use environment variables for one-off shell sessions and automation.
- Never commit local workspace secrets files or screenshots containing full API keys.
- Rotate provider keys if they are accidentally exposed.

### Keep the workspace backed up

The project is local-first. Your creative history lives in the local workspace, especially:

- `studio.db`
- `config.json`
- `catalog.json`
- `secrets.json`
- `assets/`
- `gallery/`

Back up the entire directory before large catalog edits, system migrations, or manual cleanup.

### Use the catalog as the source of truth for models

- Do not add model arrays to `config.json`.
- Put Azure deployment names in `catalog.json` provider offerings.
- Use `imagent models --provider <id>` to verify the model IDs you plan to pass with `--model`, and `imagent options --provider <id> --model <id>` to confirm capabilities.
- Run `imagent config reset catalog` if local edits cause validation or model resolution errors.

### Start with `doctor`

Run `imagent doctor` after installation, updates, and provider changes. It confirms the workspace can be opened and shows provider configuration count.

### Use assets for repeatable visual identity

- Create character assets for recurring people or personas.
- Create object assets for important props.
- Create background assets for recurring locations.
- Create style assets for reusable prompt snippets and visual references.
- Use short, memorable asset names so generated slugs are easy to pass to CLI commands.

### Match options to model capabilities

Not every provider supports the same options. For example:

- Some image models use `size`; others use `aspectRatio`.
- Some models support `seed`; others do not.
- Some providers cap reference image counts more tightly than others.
- Some video models support first and last frames; others support text-only generation.

Use `imagent options --provider <id> --model <id>` to inspect a model's exact request options and allowed values before building repeatable scripts.

### Be deliberate with async video jobs

- Use `--wait` when you want the CLI process to stream progress until completion.
- Save the submitted job ID if you do not wait.
- Use `imagent job watch <jobId>` to reattach to queued or running video jobs.
- Use `imagent job ls --state running` to find active jobs.

### Keep desktop and CLI workflows consistent

Because the desktop and CLI share one workspace, use the CLI for repeatable automation and the desktop app for visual review, provider setup, model mapping, assets, boards, and gallery curation.

### Avoid destructive cleanup outside imagent

Prefer `imagent asset rm`, `imagent gallery rm`, and desktop delete/archive flows over manually deleting files from the local workspace. Manual deletion can leave database rows pointing at missing files.

### Rebuild native modules when switching desktop development contexts

When running the desktop app from source, run:

```bash
bun run --filter @imagent/studio rebuild
```

before launching Electron after a fresh install or Electron dependency change. If you switch back to host Node-based CLI or persistence tests after rebuilding for Electron, rebuild `better-sqlite3` for the host Node ABI as described in `../apps/desktop/README.md`.
