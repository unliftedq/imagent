<p align="center">
  <img src="./assets/banner.png" alt="Imagent" width="100%">
</p>

<p align="center"><a href="./README.md">English</a> · 简体中文</p>

**Imagent** 取自 **Imagine agent**：它让 AI Agent 在工作流中具备生成图像、视频与语音的能力，并用一套统一的接口抹平不同 Provider 和模型之间的差异——同时把每一份生成的资产有序地管理起来供后续复用，而不是用完即丢。

它同时提供命令行工具和桌面应用。不同入口共享同一个本地工作区：统一的 Provider 接口、素材库、生成结果、项目资产与历史记录都保存在一起，方便在桌面整理、在终端自动化，或交给 Agent 调用。

[文档](https://unliftedq.github.io/imagent/docs) · [桌面应用](./apps/desktop/README.md) · [CLI](./apps/cli/README.md) · [架构](./architecture.md)

<p align="center">
  <a href="https://youtu.be/qeZXnmGw_8s">
    <img src="./assets/youtube_thumbnail.png" alt="在 YouTube 上观看 Imagent" width="100%">
  </a>
</p>

## 为什么选择 imagent？

大多数 Agent 能推理、能写代码，却无法真正“创作”图像、视频或音频；而为此临时拼接的脚本往往用完即丢、绑定单一 Provider，且运行结束后就遗忘了所有产出。imagent 一次解决三个问题：

| | 价值 |
| --- | --- |
| **多媒体生成作为 Agent 的原生能力** | 内置 Skill 让任何兼容的 Agent 直接调用 `imagent` CLI，把生成图像、视频和语音作为工作流中的原生一步——无需为每个工具单独接入，也无需一次性的胶水代码。 |
| **一套接口，贯通所有 Provider 与模型** | OpenAI、Azure OpenAI、Google Imagen/Gemini、Flux/BFL、BytePlus / 火山引擎 Seedream/Seedance、xAI Grok、MiniMax TTS 和 ElevenLabs TTS 都隐藏在同一套一致的接口之后。用户和 Agent 切换 Provider 或模型时，无需重写提示词、参数或调用方式。 |
| **资产不随提示词消失** | 每一张生成的图像、视频和片段——以及可复用的角色、物体、背景、风格和参考图——都被纳入受管理的本地素材库。可以跨项目整理、检索和复用产出，而不是从头重新生成。 |

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
imagent speech synthesize "Welcome to imagent, your local creative workspace."
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

- 让编程或自动化 Agent 在任务过程中通过同一套可审计的 CLI 产出视觉与音频资产。
- 对同一个提示词在不同 Provider 和模型间切换，而无需改变调用方式。
- 逐步沉淀出可复用的角色、风格和参考素材库，在多个项目间持续复利。
- 随时整理和回顾 Agent 生成的一切，而不是在脚本退出后就丢失。
- 在共享的本地工作区上，把终端自动化与桌面端的审阅、整理结合起来。

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
