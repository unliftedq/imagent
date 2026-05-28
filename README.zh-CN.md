<p align="center">
  <img src="./assets/banner.png" alt="Imagent" width="100%">
</p>

<p align="center"><a href="./README.md">English</a> · 简体中文</p>

**Imagent** 取自 **Imagine agent**：它是一个本地优先的图像与视频生成工作台，面向独立创作者、高度自动化的创作流程，以及需要稳定调用生成能力的 AI Agent。

它同时提供桌面应用、命令行工具和可安装的 Agent Skill。不同入口共享同一个本地工作区：Provider 配置、素材库、生成结果、项目资产与历史记录都保存在一起，方便在桌面整理、在终端自动化，或交给 Agent 调用。

[文档](https://unliftedq.github.io/imagent/docs) · [桌面应用](./apps/desktop/README.md) · [CLI](./apps/cli/README.md) · [架构](./architecture.md)

## 为什么选择 imagent？

| 能力 | 价值 |
| --- | --- |
| **本地优先的工作区** | SQLite 状态、配置、素材和生成结果默认保存在 `~/.imagent/`，不依赖远程账号或后端服务。 |
| **多个入口，共用一个素材库** | 桌面应用、CLI 和 Agent 集成使用同一套图库、看板、收藏与可复用素材。 |
| **多 Provider 生成** | 可同时配置 OpenAI、Azure OpenAI、Google Imagen/Gemini、Flux/BFL、BytePlus / 火山引擎 Seedream/Seedance，以及 xAI Grok。 |
| **以素材驱动创作** | 角色、物体、背景、风格和参考图可以长期复用，帮助系列项目保持视觉一致性。 |
| **为 Agent 自动化准备** | 内置 Skill 让兼容的 Agent 直接调用 `imagent` CLI，而不是临时接入零散的图像或视频工具。 |

## 快速开始

安装 CLI：

```bash
npm install -g @imagent/cli
imagent doctor
```

安装桌面应用：

- 从 [latest release](https://github.com/unliftedq/imagent/releases/latest) 下载 macOS 或 Windows 安装包。
- 桌面应用目前尚未签名。macOS 首次打开前可能需要移除隔离属性：

  ```bash
  xattr -cr Imagent.app
  ```

- Windows 可能出现 SmartScreen 提示，可选择 **更多信息** → **仍要运行**。

使用默认配置生成内容：

```bash
imagent image generate "minimal product photo of a ceramic mug"
imagent video generate "a slow dolly shot through a rainy alley"
```

如果需要更完整的安装步骤、Provider 配置、桌面应用说明或故障排查，请查看文档站点：

<https://unliftedq.github.io/imagent/docs>

## Agent Skill 集成

仓库中包含可直接安装的 Skill：[`skills/imagent`](./skills/imagent)。把它安装到兼容的 Agent 运行时后，确保该环境的 `PATH` 中可以找到 `imagent` CLI。

```bash
npx skills add unliftedq/imagent
```

Claude Code、Codex、OpenClaw、Hermes 或其他兼容 Agent 都可以使用同样的安装方式。安装完成后，Agent 可以运行 `imagent doctor` 判断本地图库和 Provider 是否已配置；如果 imagent 不可用，Agent 也可以回退到其他生成工具。

## 典型工作流

- 为个人创作搭建本地 AI 视觉生成流程。
- 对比不同图像与视频生成 Provider 的输出效果。
- 长期维护可复用的角色、风格和参考图素材。
- 用终端自动化批量生成，再通过桌面应用审阅、整理和收藏结果。
- 让编程 Agent 通过同一套可审计的 CLI 流程生成创意资产。

## 项目结构

```text
imagent/
  apps/
    desktop/      # @imagent/studio，Electron 桌面应用
    cli/          # @imagent/cli，命令行工具
  packages/
    core/         # 领域类型、端口和任务运行逻辑
    providers/    # Provider 适配器与模型目录
    persistence/  # SQLite、迁移、仓储、文件和缩略图处理
    config/       # 配置与密钥管理
    ipc/          # 桌面端 IPC 契约
    ui/           # 共享 UI 组件
```

## 当前状态

imagent 仍处于早期阶段，数据结构、打包方式和部分功能仍可能调整。目前没有遥测、自动更新、云同步或账号系统。桌面安装包尚未签名，因此 macOS 可能需要移除隔离属性，Windows 首次运行时也可能出现 SmartScreen 提示。

## 许可证

向 imagent 贡献代码即表示你同意贡献内容以项目的 [Apache License 2.0](./LICENSE) 授权，并确认你有权按该许可证提交这些内容。

## 致谢

[Phosphor icons](https://phosphoricons.com/)、[Radix UI](https://www.radix-ui.com/)、[Tailwind CSS v4](https://tailwindcss.com/)、[Bun](https://bun.sh/)、[Turborepo](https://turborepo.com/)、[Vite](https://vite.dev/)、[Electron](https://www.electronjs.org/)、[Commander](https://github.com/tj/commander.js)、[zod](https://zod.dev/)、[zustand](https://zustand-demo.pmnd.rs/)、[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)、[sharp](https://sharp.pixelplumbing.com/)、[ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)、[@dnd-kit](https://dndkit.com/)。
