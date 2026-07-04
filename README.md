# 游脉 GamePulse

**游脉 GamePulse** 是一个本地优先的游戏社区评论分析 Agent，面向游戏运营、发行和制作团队，用来把跨平台玩家反馈沉淀成可追溯、可行动的中文舆情报告。

它可以采集和导入来自 B站、Steam、NGA、Reddit、TapTap、小黑盒以及 CSV/JSON 文件中的评论、评测和帖子标题，围绕版本窗口分析玩家情绪、高频抱怨、BUG 聚类、角色热度、版本评价和舆情风险变化。

项目正在整体改建为 Electron 桌面应用。当前桌面端已经使用 React 19、Vite、Electron 和 TypeScript `7.0.1-rc`；原有 Fastify/Postgres/Redis 本地栈仍保留，用于开发调试、数据验证和后续迁移对照。

## 核心能力

- **多平台入口**：支持 Steam、Reddit、B站、NGA、TapTap、小黑盒，以及 CSV/JSON 批量导入。
- **玩家情绪分析**：识别正面、负面、中性反馈，并按平台、时间和版本窗口聚合。
- **高频抱怨发现**：聚类玩家集中提到的玩法、数值、活动、剧情、付费、优化等问题。
- **版本评价对比**：围绕版本发布时间，对比发布前后情绪、主题、BUG 和角色热度变化。
- **角色热度追踪**：结合用户词表和文本识别，发现角色相关讨论热度与情绪倾向。
- **BUG 聚类**：识别闪退、卡顿、无法登录、任务异常、显示错误等问题，并保留原文证据。
- **舆情风险指数**：基于退坑、退款、弃坑、劝退等信号和负面趋势，输出风险判断。
- **证据回溯**：每个重要结论都保留评论原文、平台、时间、链接和互动数据。

## 一键调试

Windows 本地开发可以直接运行：

```powershell
npm.cmd run debug:start
```

该命令会自动：

1. 启动 Postgres/pgvector 和 Redis。
2. 检查并安装 npm 依赖。
3. 执行数据库迁移。
4. 启动 API、Worker 和 Web Dashboard。
5. 等待服务健康检查通过。
6. 自动打开调试页面 `http://127.0.0.1:5173`。

也可以双击运行：

```text
scripts/start-debug.bat
```

Electron 桌面端调试：

```powershell
npm.cmd run debug:start:desktop
```

常用跳过参数：

```powershell
.\scripts\start-debug.ps1 -SkipDocker
.\scripts\start-debug.ps1 -SkipMigrate
.\scripts\start-debug.ps1 -Mode desktop
```

## 快速开始

安装依赖：

```powershell
npm.cmd install
```

构建 Electron 桌面应用：

```powershell
npm.cmd run desktop:build
```

启动 Electron 桌面开发模式：

```powershell
npm.cmd run desktop:dev
```

构建桌面安装包：

```powershell
npm.cmd run desktop:dist
```

## 本地 Web/API 栈

原有本地 Web/API 栈仍保留，用于开发、对照和数据层迁移期间的验证。

启动 Postgres/pgvector 和 Redis：

```powershell
docker compose up postgres redis
```

执行数据库迁移：

```powershell
npm.cmd run db:migrate
```

启动 API、Worker 和 Web Dashboard：

```powershell
npm.cmd run dev
```

打开看板：

```text
http://127.0.0.1:5173
```

API 默认运行在：

```text
http://127.0.0.1:4317
```

油猴脚本位置：

```text
packages/userscript/src/gamepulse.user.js
```

## 已实现内容

- TypeScript monorepo，并固定到 `typescript@7.0.1-rc`。
- Electron 桌面工作区，包含 main、preload 和 React renderer。
- React/Vite Dashboard 基础界面：项目配置、数据导入、分析任务、报告查看和评论检索。
- Fastify 本地 API，使用 Postgres 持久化和 Redis/BullMQ 分析队列。
- Docker Compose 启动 Postgres/pgvector、Redis、API、Worker 和 Web。
- CSV/JSON 导入、批量入库、评论搜索、项目创建、报告读取和分析任务启动。
- 启发式分析管线：情绪标签、主题聚类、BUG 聚类、证据引用、版本窗口对比和舆情风险指数。
- 可配置模型接口，预留 OpenAI-compatible API 和 Ollama。
- Tampermonkey/Violentmonkey 油猴脚本，只采集用户当前页面可见内容，不保存 cookies。

## 桌面化方向

目标架构是：

```text
Electron + React Renderer + Preload IPC + 本地数据服务
```

当前桌面应用已经可以启动、构建，并通过 preload 暴露本地运行能力。后续迁移重点：

- 将 Web Dashboard 完整迁入桌面 renderer。
- 将 HTTP 调用逐步替换为 IPC。
- 将 Postgres/Redis 数据层迁移为更轻的本地存储方案。
- 将油猴采集流程升级为桌面内置浏览/采集器。
- 保留百万级历史库分析能力，避免逐条全量调用大模型。

## 分析原则

- 中文报告优先，原文证据保留。
- 英文评论可以展示机器翻译，但不覆盖原文。
- 每条文本至少标注情绪、主题、意图、严重度、BUG 信号、流失风险和关联对象。
- 每个重要结论必须有数量依据和原文证据。
- 舆情风险指数只表示社区反馈风险，不宣称真实留存预测。
- 作者信息默认脱敏，只保留平台、时间、链接、互动数和原文。

## 验证命令

提交前建议运行：

```powershell
npm.cmd run typecheck
npm.cmd run test:unit
npm.cmd run desktop:build
```

## 规模设计

游脉 GamePulse 面向百万级本地历史评论库设计。分析流程采用分层策略：先对全量数据做规则、轻模型、embedding、聚类和 SQL 聚合，再让大模型总结高影响簇和代表样本，避免对每条评论进行昂贵的深度调用。
