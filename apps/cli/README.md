# @imagent/cli

`@imagent/cli` 是 imagent 的命令行入口，适合在终端中执行生成、配置、资产管理、结果查询与自动化任务。CLI 与桌面应用共享 `~/.imagent/` 工作区，因此通过命令行创建或更新的内容会同步出现在桌面应用中。

## 快速开始

```bash
bun install
bun run --filter @imagent/cli dev doctor
```

配置至少一个供应商密钥：

```bash
bun run --filter @imagent/cli dev config set openai.apiKey sk-...
```

生成图像：

```bash
bun run --filter @imagent/cli dev image "a cinematic portrait of a red fox"
```

生成视频：

```bash
bun run --filter @imagent/cli dev video "a slow camera move through a neon city" --provider bytedance --wait
```

## 常用命令

```text
imagent doctor
imagent config {get|set|path}
imagent catalog {path|show|reset}
imagent image "<prompt>" [--provider <id>] [--model <id>] [--count <n>] [--out <dir>]
imagent video "<prompt>" [--provider <id>] [--model <id>] [--duration <sec>] [--wait]
imagent asset {add|list|show|rm}
imagent gallery {ls|show|remix|rm|favorite}
imagent job {ls|status|cancel|watch}
imagent mcp
```

## 配置

配置文件默认位于 `~/.imagent/`：

- `config.json`：偏好设置与非敏感配置。
- `secrets.json`：供应商密钥与端点信息，默认使用 `chmod 600` 权限。
- `catalog.json`：可用供应商、模型与能力目录。

查看实际路径：

```bash
bun run --filter @imagent/cli dev config path
bun run --filter @imagent/cli dev catalog path
```

环境变量可覆盖同名密钥，适合一次性执行任务，例如：

```bash
OPENAI_API_KEY=sk-... imagent image "minimal product photo"
```

## 图像生成

```bash
imagent image "prompt" \
  --provider openai \
  --model gpt-image-1 \
  --count 2 \
  --aspect 1:1 \
  --character hero \
  --style watercolor \
  --out ./outputs
```

常用参数：

- `--provider`、`--model`：指定供应商与模型。
- `--count`：输出数量。
- `--size`、`--aspect`、`--seed`、`--negative`：模型相关生成参数。
- `--ref`：添加参考图，可重复传入。
- `--character`、`--object`、`--background`、`--style`：附加已登记资产。
- `--out`：覆盖默认输出目录。

## 视频生成

```bash
imagent video "prompt" \
  --provider bytedance \
  --model seedance-1.0-pro \
  --duration 5 \
  --aspect 16:9 \
  --ref ./first-frame.png \
  --wait
```

`--wait` 会阻塞当前命令并输出任务进度；未使用时可通过 `imagent job watch <jobId>` 继续跟踪。

## 资产与结果管理

添加资产：

```bash
imagent asset add character --name "Nova" --description "main character" --ref ./nova.png
imagent asset add style --name "Soft watercolor" --prompt "soft watercolor, muted palette"
```

查询与复用结果：

```bash
imagent gallery ls --search "prompt:fox"
imagent gallery show <itemId>
imagent gallery remix <itemId> --prompt-suffix "at sunset"
imagent gallery favorite <itemId>
```

## 构建

```bash
bun run --filter @imagent/cli build
bun run --filter @imagent/cli test
bun run --filter @imagent/cli build:binary
```

单文件二进制构建结果位于 `apps/cli/dist/`。由于 `better-sqlite3`、`sharp` 等原生模块无法完全嵌入 Node SEA，分发时仍需随附必要的 `node_modules/` 原生依赖。
