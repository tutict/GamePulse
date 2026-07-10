# GamePulse 游脉

GamePulse 是面向 Windows 与 Android 的本地优先玩家评论分析工具。评论、项目、标签和报告默认保存在设备上的 SQLite 数据库中；两端不共享服务，只通过 `.gamepulse` 文件交换项目。

## 功能

- SQLite FTS5 本地检索，包含中文词项回退、去重、证据重排和引用。
- 本地 RAG：最多使用 8 条证据、12,000 字符上下文、同一来源最多 2 条。
- Windows 支持 OpenAI-compatible 与 Ollama；Android 仅支持远程 OpenAI-compatible 模型。
- CSV、JSON、NDJSON 和 `.gamepulse` 导入；项目包可在 Windows 与 Android 间往返。
- 油猴脚本将当前页可见评论下载为 NDJSON，不访问本地 API。

## 架构

- `packages/shared`：领域类型、RAG 检索与裁剪、存储/模型/项目包接口、隐私清理和 `.gamepulse` 编解码。
- `apps/desktop`：Electron + SQLite，负责 Chromium 采集、OpenAI-compatible/Ollama 调用和 Windows 发布。
- `apps/mobile`：独立 React + Capacitor Android 客户端，使用设备 SQLite 与 Keystore-backed 凭据存储。
- `packages/userscript`：只生成 NDJSON 下载文件，不依赖 localhost 服务。

桌面端和 Android 各自维护独立数据库，不做后台同步。跨设备协作以显式导入、导出项目包为边界。

## 开发

要求 Node.js 22 或更高版本。

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

Android Web 预览：

```powershell
npm run mobile:dev
```

SQLite RAG 基准测试：

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

Android 构建需要 JDK 21 和 Android SDK。首次同步会安装 Capacitor 插件并复制 `apps/mobile/dist`，不再依赖旧 Web 应用。

## 数据迁移

桌面端首次启动会把旧 `gamepulse-store.json` 事务迁移到 SQLite。成功后保留 `.legacy-backup.json`；失败时原文件不变。

旧 PostgreSQL 项目可通过已安装的 `psql` 客户端导出：

```powershell
npm run migrate:postgres -- --database-url "postgres://..." --project-id "PROJECT_ID" --out "project.gamepulse"
```

该工具只读取项目、评论、标签和报告，不导出 API Key、embedding、模型缓存或设备路径。

## 项目包与隐私

`.gamepulse` 是未加密 ZIP，包含 SHA-256 清单、项目元数据和 NDJSON 数据。导入时逐个 ZIP 条目解压，评论、标签和报告按 NDJSON 行流式解析，并在完成后校验每个载荷的字节数和增量 SHA-256。

导出会递归清理 API Key、令牌、密钥、凭据、设备信息以及缓存/数据库/用户数据路径；这些字段即使嵌套在对象或数组中也不会进入项目包。项目包仍会包含评论原文和来源信息，请按敏感数据文件管理。详细说明见 [PRIVACY.md](./PRIVACY.md)。

## 验证基线

截至 2026-07-11：

- `npm test`：18 个测试文件、27 个测试用例通过。
- `npm run typecheck`：共享包、桌面端、Android 和油猴脚本全部通过。
- `npm run build`：共享包、桌面端、Android 和油猴脚本生产构建通过。
- SQLite FTS5 在 100,000 条评论基准下的检索 P95 为 63.89 ms，低于 300 ms 目标。
