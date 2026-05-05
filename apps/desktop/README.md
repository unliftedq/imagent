# @imagent/studio

`@imagent/studio` 是 imagent 的 Electron 桌面应用，面向需要可视化创作、资产管理与结果整理的个人工作流。桌面端与 CLI 共享 `~/.imagent/` 工作区。

## 快速开始

```bash
bun install
bun run --filter @imagent/studio rebuild
bun run --filter @imagent/studio dev
```

首次启动桌面应用前需要执行 `rebuild`，以便将 `better-sqlite3` 与 `sharp` 重建到 Electron ABI。

如果之后需要回到 CLI 或持久化测试，可将 `better-sqlite3` 重建回当前 Node ABI：

```bash
( cd node_modules/.bun/better-sqlite3@*/node_modules/better-sqlite3 && npm rebuild better-sqlite3 )
```

## 页面说明

- **Studio**：图像与视频创作入口，支持 prompt、供应商/模型选择、参数设置、参考图与资产插槽。
- **Gallery**：查看生成结果，支持搜索、收藏、Boards 整理、lineage 查看与 remix。
- **Assets**：管理 Characters、Objects、Backgrounds、Styles，并支持归档与恢复。
- **Models**：查看和管理模型目录。
- **Providers**：配置 OpenAI、Azure OpenAI、Google、Flux/BFL、ByteDance、xAI 等供应商密钥与端点。
- **Settings**：设置主题、默认供应商、输出目录、并发数与 prompt history 等偏好。

## 基本流程

1. 在 **Providers** 中配置至少一个供应商。
2. 在 **Assets** 中登记常用角色、物体、背景或风格。
3. 在 **Studio** 中选择生成模式、模型、参数与资产插槽后发起生成。
4. 在 **Gallery** 中整理、收藏、搜索或 remix 结果。
5. 在 **Settings** 中调整默认输出目录、并发数与界面偏好。

## 数据位置

桌面应用使用 `~/.imagent/` 作为默认工作区：

- `studio.db`：本地 SQLite 数据库。
- `config.json`：偏好与非敏感配置。
- `secrets.json`：供应商密钥与端点。
- `catalog.json`：模型目录。
- `assets/`：素材文件。
- `gallery/`：生成结果。

## 构建与打包

```bash
bun run --filter @imagent/studio typecheck
bun run --filter @imagent/studio build
bun run --filter @imagent/studio package
```

`package` 会先执行原生模块重建与前端构建，再生成 Windows NSIS 安装包。当前安装包未签名，首次安装可能触发 SmartScreen 提示。macOS 与 Linux 打包配置存在，但尚未作为主要发布目标验证。
