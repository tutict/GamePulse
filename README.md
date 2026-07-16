# GamePulse 游脉

GamePulse 是一个本地优先、报告优先的游戏舆论风评 RAG 应用。用户直接填写游戏名称和可选关注问题，应用自动发现公开来源、采集玩家评论、过滤无关内容，并生成带证据引用的风评报告；不需要先创建项目或导入数据。

## 使用流程

1. 在“开始研究”填写游戏名称，可选填写联机、更新、性能、商业化等关注问题。
2. Windows 端优先读取 Steam 近期公开玩家评测，再通过公开网页搜索和 Electron 内置 Chromium 补充 Reddit、论坛、媒体与社区页面。
3. 本地研究流水线清理 URL 中的令牌和追踪参数，排除附属内容与无关页面，规范化、去重并标记来源失败。
4. 报告给出总体判断、样本情绪概览、主要主题、优点、风险、争议、覆盖范围和稳定的 `[E#]` 证据引用。
5. 用户可以打开原始来源、排除错误证据、生成新报告版本，并只基于当前研究证据继续追问。

采集结果是非随机公开样本，不代表全部玩家。应用不绕过登录、验证码、付费墙、地区限制或平台反爬措施；无法访问的来源会进入覆盖说明，而不会被伪造成有效证据。

## 当前能力

### Windows

- Electron + SQLite 本地研究库，研究记录、证据、排除记录和报告版本默认只保存在本机。
- Steam 公开玩家评测接口作为稳定来源，公开搜索与隐藏 Chromium 页面采集作为补充。
- 游戏名称精确匹配、危险/会话 URL 参数清理、内容相关性过滤、去重和来源级失败恢复。
- 共享报告工作台：开始研究、历史报告、设置、研究进度、证据审计和响应式导航。
- Windows 与 Android 共用跟随系统、浅色和深色外观模式，偏好仅保存在本机。
- OpenAI-compatible 与 Ollama 模型配置使用 Electron `safeStorage` 保存凭据。
- 设置页自动读取 OpenAI-compatible `/models`；Windows 的 Ollama 同时读取 `/api/tags`，模型通过列表选择，不再手动填写名称。

### Android

- 独立 React + Capacitor 客户端，本地 SQLite、Keystore-backed 凭据和同一套研究报告界面。
- 支持本地研究历史、证据纠正、远程模型追问和高级项目包导入导出。
- Android 当前仍使用固定验证采集器验证端到端流程，公开来源实时采集尚未达到 Windows 能力；界面会明确显示该边界。

## RAG 与报告

- 追问默认最多使用 8 条证据、12,000 字符上下文、同一来源最多 2 条。
- 报告与追问共用同一套稳定 `[E#]` 编号，排除的证据不会进入当前上下文。
- 未配置模型时仍可生成本地规则报告和证据式追问摘要；配置模型后，Windows 通过 OpenAI-compatible 或 Ollama 流式生成，Android 使用原生 HTTPS 请求 OpenAI-compatible 服务以避开 WebView CORS。
- 当前首版使用 SQLite FTS5 和词法重排，不使用向量 embedding，也不运行端侧大模型。

## 架构

- `packages/shared`：研究领域类型、编排器、报告校验、RAG 检索/裁剪、存储/模型/项目包 contract。
- `packages/ui`：Windows 与 Android 共用的研究入口、进度、报告、历史、证据抽屉和设置组件。
- `apps/desktop`：Electron 主进程、Chromium/Steam 采集、SQLite、模型网关、IPC 与 Windows 发布。
- `apps/mobile`：Capacitor Android 客户端、本地存储、文件交换和安全凭据适配器。
- `packages/userscript`：将当前页可见评论下载为 NDJSON，不访问 localhost 服务。

桌面端和 Android 各自维护独立数据库，不做后台同步。跨设备交换使用显式的 `.gamepulse` 项目包。

## 开发

要求 Node.js 22 或更高版本。Windows 桌面首次开发启动还需要可用的 C++ 原生模块构建工具链。

```powershell
npm install
npm run test
npm run typecheck
npm run build
```

桌面开发：

```powershell
npm run desktop:dev
```

`desktop:dev` 会在 `apps/desktop/node_modules` 缓存一份仅供 Electron 使用的 `better-sqlite3` 原生构建，不会覆盖根目录供 Node/Vitest 使用的版本。

Android Web 预览：

```powershell
npm run mobile:dev
```

SQLite RAG 基准：

```powershell
npm run bench:sqlite-rag
```

## 发布

Windows 安装版与便携版：

```powershell
npm run desktop:dist:windows
npm run desktop:dist:windows:dir
```

Android 同步与构建：

```powershell
npm run mobile:sync:android
npm run mobile:android:assemble
npm run mobile:android:bundle
```

Android 构建需要 JDK 21 和 Android SDK。

## 兼容数据

旧评论项目、CSV/JSON/NDJSON 导入和 `.gamepulse` 项目包保留在设置的高级区域，不进入默认研究流程。

桌面端首次启动会把旧 `gamepulse-store.json` 事务迁移到 SQLite。成功后保留 `.legacy-backup.json`；失败时原文件不变。

旧 PostgreSQL 项目可通过已安装的 `psql` 客户端导出：

```powershell
npm run migrate:postgres -- --database-url "postgres://..." --project-id "PROJECT_ID" --out "project.gamepulse"
```

## 隐私

`.gamepulse` 是带 SHA-256 清单的未加密 ZIP，会包含评论原文、公开来源 URL 和报告。导出会递归清理 API Key、令牌、密钥、凭据、设备信息、缓存路径和数据库路径，但项目包仍应按敏感数据文件管理。详见 [PRIVACY.md](./PRIVACY.md)。

## 验证

截至 2026-07-16，根测试、全仓类型检查和 Windows/Android/Web 生产构建均通过；桌面端已完成 preload、独立原生 SQLite、Steam 评测、Chromium 页面采集、失败来源降级、引用一致性、原生主题同步、自动模型发现和 390px 窄屏布局的本机冒烟验证。
