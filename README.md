# imagent

imagent 取自 **imagine agent**，目标是为个人创作者提供一个本地优先的图像与视频生成工作台。

项目同时提供桌面应用与命令行工具，共用同一套核心能力、配置、素材库与本地数据。用户可以集中管理角色、物体、背景、风格等可复用资产，连接多个生成服务，并围绕生成结果进行整理、检索与再创作。

## 核心特性

- **本地优先**：数据默认存放在 `~/.imagent/`，包含 SQLite 数据库、配置、素材与生成结果；不依赖远程后端。
- **多端一致**：桌面应用与 CLI 共享工作区，任一端生成或管理的内容都可被另一端继续使用。
- **多供应商接入**：支持 OpenAI、Azure OpenAI、Google Imagen/Gemini、Flux/BFL、ByteDance Seedream/Seedance、xAI Grok 等图像与视频生成能力。
- **资产化创作**：将角色、物体、背景与风格沉淀为可复用资产，提升系列化创作的一致性。
- **结果管理**：通过 Gallery、Boards、收藏、搜索与 lineage 关系管理生成结果，便于回溯与 remix。

## 适用场景

- 个人创作者搭建本地化 AI 视觉创作流程。
- 在多个生成供应商之间快速切换与比较输出。
- 管理长期复用的角色、风格与参考图资产。
- 将命令行自动化与桌面交互结合到同一工作区。

## 项目组成

```text
imagent/
  apps/
    desktop/      # @imagent/studio，Electron 桌面应用
    cli/          # @imagent/cli，命令行工具
  packages/
    core/         # 领域类型、端口与任务运行逻辑
    providers/    # 供应商适配与模型目录
    persistence/  # SQLite、迁移、仓储、文件与缩略图处理
    config/       # 配置与密钥管理
    ipc/          # 桌面端 IPC 协议
    ui/           # 共享 UI 组件
```

## 使用入口

- 桌面应用：见 [`apps/desktop/README.md`](./apps/desktop/README.md)
- CLI：见 [`apps/cli/README.md`](./apps/cli/README.md)
- 架构说明：见 [`architecture.md`](./architecture.md)

## 当前状态

imagent 仍处于早期阶段，数据结构、打包方式与部分功能可能继续调整。当前版本不包含遥测、自动更新、云同步或账号系统；Windows 安装包未签名，首次安装可能触发 SmartScreen 提示。

## License

TBD.

## Acknowledgements

[Phosphor icons](https://phosphoricons.com/), [Radix UI](https://www.radix-ui.com/), [Tailwind CSS v4](https://tailwindcss.com/), [Bun](https://bun.sh/), [Turborepo](https://turborepo.com/), [Vite](https://vite.dev/), [Electron](https://www.electronjs.org/), [Commander](https://github.com/tj/commander.js), [zod](https://zod.dev/), [zustand](https://zustand-demo.pmnd.rs/), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), [sharp](https://sharp.pixelplumbing.com/), [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static), [@dnd-kit](https://dndkit.com/).
