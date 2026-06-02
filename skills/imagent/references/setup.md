# imagent — Installation & Configuration

Walk a user through this only when `imagent doctor` reports the CLI is missing or has zero configured providers. If they don't want to set it up, fall back to a different image/video-generation skill instead.

## Installation

`imagent` is published as `@imagent/cli` on npm and requires Node.js >= 22.

Preferred — global install:
```bash
npm install -g @imagent/cli
imagent doctor
```

One-off run without installing:
```bash
npx -y @imagent/cli doctor
npx -y @imagent/cli image "<prompt>"
```

Build from source (Bun >= 1.3 required):
```bash
git clone https://github.com/unliftedq/imagent.git
cd imagent
bun install
bun run --filter @imagent/cli build
node apps/cli/dist/cli.js doctor
```

Standalone binary from source:
```bash
bun run --filter @imagent/cli build:binary
```

`imagent doctor` initializes the local workspace under `~/.imagent/` (SQLite DB, config files) on first run. It is idempotent and makes no network calls.

## Configuring a provider

Providers without credentials are silently skipped at runtime. Pick the provider the user has access to (ask if unclear) and set the secret. Required fields per provider:

| Provider ID | Required secrets        | Images | Videos |
| ----------- | ----------------------- | ------ | ------ |
| `openai`    | `apiKey`                | Yes    | No     |
| `azure`     | `endpoint`, `apiKey`    | Yes    | No     |
| `google`    | `apiKey`                | Yes    | Yes    |
| `flux-bfl`  | `apiKey`                | Yes    | No     |
| `byteplus`  | `endpoint`, `apiKey`    | Yes    | Yes    |
| `volcengine`| `endpoint`, `apiKey`    | Yes    | Yes    |
| `xai`       | `apiKey`                | Yes    | Yes    |
| `minimax`   | `apiKey`                | Yes    | Yes    |

```bash
imagent config set openai.apiKey sk-...
imagent config set google.apiKey <google-api-key>
imagent config set azure.endpoint https://my-resource.services.ai.azure.com
imagent config set azure.apiKey <azure-key>
imagent config set volcengine.endpoint https://ark.cn-beijing.volces.com/api/v3
imagent config set volcengine.apiKey <volcengine-key>
imagent config set flux-bfl.apiKey <bfl-key>
imagent config set xai.apiKey <xai-key>
imagent config set minimax.apiKey <minimax-key>
```

Optional advanced fields for OpenAI-compatible proxies / alternate endpoints:
```bash
imagent config set openai.baseUrl https://your-openai-compatible-proxy/v1
imagent config set google.baseUrl https://your-google-compatible-endpoint
imagent config set flux-bfl.baseUrl https://api.bfl.ai
imagent config set xai.baseUrl https://api.x.ai/v1
imagent config set minimax.baseUrl https://api.minimax.io/v1
```

Verify:
```bash
imagent doctor                  # prints which providers are configured
imagent models --configured     # lists only providers with credentials
```

## One-off runs via environment variable

For ephemeral runs that should NOT persist a key to disk:

```bash
OPENAI_API_KEY=sk-...                 imagent image generate "<prompt>" --provider openai
GOOGLE_API_KEY=<key>                  imagent image generate "<prompt>" --provider google
AZURE_ENDPOINT=https://... AZURE_API_KEY=<key> \
                                      imagent image generate "<prompt>" --provider azure
VOLCENGINE_ENDPOINT=https://... VOLCENGINE_API_KEY=<key> \
                                      imagent video generate "<prompt>" --provider volcengine
FLUX_BFL_API_KEY=<key>                imagent image generate "<prompt>" --provider flux-bfl
XAI_API_KEY=<key>                     imagent image generate "<prompt>" --provider xai
MINIMAX_API_KEY=<key>                 imagent image generate "<prompt>" --provider minimax
```

Env values override `secrets.json` for that single CLI invocation.

## Where state lives

- Workspace root: `~/.imagent/`
- `config.json` — non-sensitive preferences, provider routing, deployment mappings
- `secrets.json` — API keys (mode `0600` on POSIX systems)
- SQLite DB and generated outputs also live under the workspace

`imagent config path` prints the active paths. `imagent config reset {catalog|secrets|config}` restores defaults (use `--force` to skip the y/N prompt).

## Azure deployment mapping

`azure` covers Azure OpenAI image, Microsoft MAI-Image, and Azure-hosted Flux families behind one endpoint+key. After setting the endpoint and key, map each Azure deployment ID to a canonical model:

```bash
imagent config provider add --provider azure \
  --kind image --id my-prod-gpt-image-2 --model-id gpt-image-2

imagent config provider list
```

Then use the deployment ID as `--model`:
```bash
imagent image generate "render" --provider azure --model my-prod-gpt-image-2
```

MAI-Image constraint: `width >= 768`, `height >= 768`, `width * height <= 1,048,576`.

## Custom OpenAI-compatible providers

The desktop **Providers** page (or `imagent config provider add`) can register custom OpenAI Images API-compatible providers. Provider ID must match `^[a-z0-9][a-z0-9_-]*$`. Stored under `customOpenAI` in `secrets.json` and `providers.customOpenAI.<id>` in `config.json`.

## Security rules

- **Never paste a secret into a script or commit it.** `imagent config set` writes to local `secrets.json` (mode `0600` on POSIX); env var works for one shell session only.
- Key values printed by `imagent config get` are masked.
- The desktop app and CLI share the same workspace, so a key set via the CLI is also visible to the desktop app on the same machine, and vice versa.
