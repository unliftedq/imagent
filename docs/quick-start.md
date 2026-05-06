# Quick Start

### 1. Install or run the CLI

Install globally:

```bash
npm install -g @imagent/cli
imagent doctor
```

Or run without installing:

```bash
npx -y @imagent/cli doctor
```

`imagent doctor` creates the local workspace if needed, initializes the SQLite database and default files, and prints the active database, config, and provider status.

### 2. Configure a provider

For OpenAI:

```bash
imagent config set openai.apiKey sk-...
imagent doctor
```

Environment variables can also supply secrets for one-off CLI runs:

```bash
OPENAI_API_KEY=sk-... imagent image "a cinematic portrait of a red fox"
```

### 3. Generate an image

```bash
imagent image "a cinematic portrait of a red fox" \
  --provider openai \
  --option size=1024x1024 \
  --option quality=medium
```

The CLI prints the generated file path when the job completes. Generated outputs are stored in the shared gallery by default.

### 4. Generate a video

```bash
imagent video "a slow camera move through a neon city" \
  --provider bytedance \
  --option duration=5 \
  --option resolution=720p \
  --wait
```

Video jobs are asynchronous. Use `--wait` to block until completion, or reattach later with `imagent job watch <jobId>`.

### 5. Use the desktop app

Open the desktop app, configure providers in **Providers**, choose defaults in **Settings**, create assets in **Assets**, generate in **Studio**, and curate results in **Gallery**. The desktop app and CLI read and write the same `~/.imagent/` workspace.
