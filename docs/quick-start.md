---
description: Create the local workspace, configure a provider, and run the first image, video, or audio job.
---

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
OPENAI_API_KEY=sk-... imagent image generate "a cinematic portrait of a red fox"
```

### 3. Generate an image

```bash
imagent image generate "a cinematic portrait of a red fox" \
  --provider openai \
  --option size=1024x1024 \
  --option quality=medium
```

The CLI prints the generated file path when the job completes. Generated outputs are stored in the shared gallery by default.

### 4. Generate a video

```bash
imagent video generate "a slow camera move through a neon city" \
  --provider volcengine \
  --option duration=5 \
  --option resolution=720p
```

By default the command exits after the provider accepts the job and prints the job id. Add `--wait` to poll until completion and download the video inline. To track a submitted job later, use `imagent video task get --id <jobId>` or `imagent video download <jobId>`.

### 5. Generate audio

```bash
imagent speech synthesize "Welcome to imagent" \
  --provider elevenlabs \
  --option voice=Rachel
```

Audio (text-to-speech) generation waits for completion and prints the result path. Use `imagent speech voices --provider <id>` to discover available voices.

### 6. Use the desktop app

Open the desktop app, configure providers in **Providers**, choose defaults in **Settings**, create assets in **Assets**, generate in **Studio**, and curate results in **Gallery**. The desktop app and CLI read and write the same local workspace.
