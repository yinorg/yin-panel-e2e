# Yin-Panel 端到端验收测试

[English](../../README.md) | **简体中文** | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | [Deutsch](../de-DE/README.md) | [Français](../fr-FR/README.md) | [Español](../es-ES/README.md) | [Português (Brasil)](../pt-BR/README.md) | [Русский](../ru-RU/README.md) | [Bahasa Indonesia](../id-ID/README.md) | [Türkçe](../tr-TR/README.md) | [Polski](../pl-PL/README.md) | [Italiano](../it-IT/README.md) | [Nederlands](../nl-NL/README.md) | [हिन्दी](../hi-IN/README.md) | [ไทย](../th-TH/README.md)

针对运行中的 Yin-Panel 服务和未打包的浏览器扩展的 Playwright 验收测试。该套件驱动真实浏览器访问 Core 应用——以及扩展的新标签页覆盖——从而端到端验证跨仓库工作流：登录与账号、空间与权限、项目与书签迁移、主题系统以及 PWA 行为。单独的 k6 套件用于测量同一服务在负载下的表现。

## 环境要求

- Node.js 与 npm
- Playwright 浏览器（`npx playwright install`）
- 一个可供测试的运行中 Yin-Panel 实例，以及来自 Core 仓库的环境文件
- 未打包的扩展源码，用于扩展测试套件
- k6，用于 `perf/` 下的性能脚本

## 安装

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## 配置

所有配置都会加载由 `YIN_PANEL_ENV_FILE` 指定的环境文件，其默认值为 `./.env.local`。

- `YIN_PANEL_URL` — 运行中服务的基址 URL（PWA 套件要求 HTTPS 源）
- `YIN_PANEL_EXTENSION_DIR` — 新标签页测试加载的未打包扩展源码
- `YIN_PANEL_TEST_USER` 和 `YIN_PANEL_TEST_PASSWORD`，或 `YIN_PANEL_TEST_TOKEN` — 测试账号
- `YIN_PANEL_TEST_SPACE_ID` — 被测空间，默认 `1`
- `DISPLAY` — 有头（headed）扩展测试所需；在 CI 中使用 `xvfb-run -a`
- `YIN_PANEL_TEST_ADMIN_USER` 和 `YIN_PANEL_TEST_ADMIN_PASSWORD` — `npm run provision-member` 和主题套件使用的管理员账号
- 隔离的主题与视觉套件会基于 `YIN_PANEL_TEST_BINARY`、`YIN_PANEL_TEST_WEB_DIR` 和 `YIN_PANEL_TEST_LANG_DIR` 启动一个一次性实例

请保持 `.env.local` 不被跟踪；其中保存着测试凭据。

## 快速开始

```bash
# 在 Core 服务运行于 http://127.0.0.1:3002 且扩展已检出的情况下
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## 覆盖范围

- 登录、会话过期与账号生命周期
- 空间：分组、成员、公开访问码、配对空间、查看者权限与迁移
- 项目：创建、编辑、图标与书签导入/导出
- 主题系统：内置主页视图、v2 主题包安装与预览、Core 界面与视觉基线
- PWA 离线行为与扩展的新标签页覆盖
- `perf/` 下的负载、延迟与容量测量

## 命令

| 命令 | 用途 |
| --- | --- |
| `npm test` | 默认 Playwright 套件 |
| `npm run test:headed` | 用于本地调试的有头运行 |
| `npm run test:theme` | 主题架构与主题包套件 |
| `npm run test:theme:visual` | 主题视觉基线 |
| `npm run test:pwa` | PWA 套件，针对 HTTPS 源运行 |
| `npm run perf:smoke` / `npm run perf:load` | k6 冒烟与负载测试 |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | 容量扫描、混合负载矩阵与报告 |
| `npm run provision-member` | 创建或复用常规测试成员 |

## 文档

- [AGENTS.md](../../AGENTS.md) — 测试放置、归属与数据安全规则
- [perf/README.md](../../perf/README.md) — k6 脚本、容量扫描与测量注意事项
- [tests/theme-package-requirements.md](../../tests/theme-package-requirements.md) — 主题包需求到测试的映射
- Core：[yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel)；扩展：[yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs` 会从隔离实例重新生成 Core README 的截图

失败产物会写入 `test-results/` 和 `playwright-report/`，两者都保持不被跟踪。
