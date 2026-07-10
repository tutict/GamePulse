# GamePulse 隐私说明

## 本地数据

GamePulse 默认在当前设备的 SQLite 数据库中保存项目、评论、标签、报告和检索索引。Windows 与 Android 之间没有后台同步服务。

## 模型请求

执行 RAG 问答时，应用先在本地检索并裁剪证据，只向已配置的模型端点发送问题和证据上下文。Windows 可使用本机 Ollama；Android 只支持用户配置的远程 OpenAI-compatible 端点。

Windows 使用 Electron `safeStorage` 保存 API Key。Android 使用由 Android Keystore 保护的密钥加密远程模型凭据。API Key 不会发送到渲染界面，也不会写入项目包。

## 导入与导出

CSV、JSON、NDJSON 和 `.gamepulse` 文件由用户主动选择。`.gamepulse` 是未加密 ZIP，会包含评论原文、来源链接、标签和报告；导出前应确认接收方和存储位置。

项目包不会包含 API Key、模型缓存、embedding、设备路径或本地数据库路径。包内文件带 SHA-256 清单，导入时会验证大小和哈希。

## 浏览器采集脚本

油猴脚本只读取当前页面可见文本并下载 NDJSON。它不读取 Cookie、不保存账号凭据、不在后台抓取，也不连接本地服务。
