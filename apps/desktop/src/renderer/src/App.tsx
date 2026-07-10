import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  Brain,
  Database,
  Download,
  FileArchive,
  Globe2,
  Loader2,
  Save,
  Settings2,
  UploadCloud,
  X
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Textarea
} from "@gamepulse/ui";
import type { Project } from "@gamepulse/shared";
import type {
  CollectorResult,
  DatabaseStats,
  ModelConfigInput,
  ModelConfigStatus,
  RagQueryResult
} from "./types.js";

const navItems = [
  { href: "#collector", label: "采集", icon: Globe2 },
  { href: "#rag", label: "RAG", icon: Brain },
  { href: "#projects", label: "项目包", icon: FileArchive },
  { href: "#models", label: "模型", icon: Settings2 },
  { href: "#database", label: "SQLite", icon: Database }
];

const defaultModelConfig: ModelConfigInput = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  apiKey: ""
};

export function App() {
  const [collectorUrl, setCollectorUrl] = useState("https://store.steampowered.com/appreviews/730?json=0");
  const [collectorResult, setCollectorResult] = useState<CollectorResult>();
  const [collectorError, setCollectorError] = useState("");
  const [isCollecting, setIsCollecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [databaseStats, setDatabaseStats] = useState<DatabaseStats>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [packageStatus, setPackageStatus] = useState("");
  const [isManagingPackage, setIsManagingPackage] = useState(false);
  const [ragQuery, setRagQuery] = useState("玩家最关注的负面问题是什么？");
  const [ragResult, setRagResult] = useState<RagQueryResult>();
  const [ragError, setRagError] = useState("");
  const [isRunningRag, setIsRunningRag] = useState(false);
  const [modelAnswer, setModelAnswer] = useState("");
  const [isRunningModel, setIsRunningModel] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelConfigStatus>();
  const [modelConfig, setModelConfig] = useState<ModelConfigInput>(defaultModelConfig);
  const [modelConfigMessage, setModelConfigMessage] = useState("");
  const [isSavingModel, setIsSavingModel] = useState(false);
  const activeModelRequest = useRef("");

  useEffect(() => {
    void refreshWorkspace();
    return window.gamepulse.models.onEvent(({ requestId, event }) => {
      if (requestId !== activeModelRequest.current) {
        return;
      }
      if (event.type === "delta") {
        setModelAnswer((current) => current + event.text);
      } else if (event.type === "error") {
        setRagError(event.message);
        setIsRunningModel(false);
      } else if (event.type === "done") {
        setIsRunningModel(false);
      }
    });
  }, []);

  async function refreshWorkspace(preferredProjectId?: string) {
    const [stats, loadedProjects, loadedModelStatus] = await Promise.all([
      window.gamepulse.database.getStats(),
      window.gamepulse.projects.list(),
      window.gamepulse.models.getStatus()
    ]);
    setDatabaseStats(stats);
    setProjects(loadedProjects);
    setSelectedProjectId((current) => {
      const candidate = preferredProjectId || current;
      return loadedProjects.some((project) => project.id === candidate)
        ? candidate
        : loadedProjects[0]?.id ?? "";
    });
    setModelStatus(loadedModelStatus);
    setModelConfig({
      provider: loadedModelStatus.provider,
      baseUrl: loadedModelStatus.baseUrl,
      model: loadedModelStatus.model,
      apiKey: ""
    });
  }

  async function handleCollect() {
    setIsCollecting(true);
    setCollectorError("");
    setSaveStatus("");
    try {
      setCollectorResult(await window.gamepulse.collector.captureVisible(collectorUrl));
    } catch (error) {
      setCollectorResult(undefined);
      setCollectorError(errorMessage(error));
    } finally {
      setIsCollecting(false);
    }
  }

  async function handleSaveCollectorResult() {
    if (!collectorResult) {
      return;
    }
    setIsSaving(true);
    setSaveStatus("");
    try {
      const result = await window.gamepulse.database.saveCollectorResult(collectorResult);
      setSaveStatus(`已保存 ${result.inserted}/${result.accepted} 条，数据库现有 ${result.totalItems} 条评论。`);
      await refreshWorkspace("desktop-collector");
    } catch (error) {
      setSaveStatus(errorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRunRag() {
    setIsRunningRag(true);
    setRagError("");
    setModelAnswer("");
    try {
      const result = await window.gamepulse.rag.query({
        query: ragQuery,
        limit: 8,
        projectId: selectedProjectId || undefined
      });
      setRagResult(result);
      if (result.evidence.length === 0) {
        return;
      }
      if (modelStatus?.provider === "openai" && !modelStatus.hasApiKey) {
        setRagError("已生成本地证据摘要；请先在模型设置中保存 API Key 以获取模型回答。");
        return;
      }
      const requestId = crypto.randomUUID();
      activeModelRequest.current = requestId;
      setIsRunningModel(true);
      await window.gamepulse.models.start({
        requestId,
        messages: [{ role: "user", content: result.prompt }],
        timeoutMs: 60_000,
        temperature: 0.1
      });
    } catch (error) {
      setRagResult(undefined);
      setRagError(errorMessage(error));
    } finally {
      setIsRunningRag(false);
    }
  }

  async function handleCancelModel() {
    const requestId = activeModelRequest.current;
    if (requestId) {
      await window.gamepulse.models.cancel(requestId);
    }
    setIsRunningModel(false);
  }

  async function handleImportPackage() {
    setIsManagingPackage(true);
    setPackageStatus("");
    try {
      const result = await window.gamepulse.projects.importPackage();
      if (!result.canceled) {
        setPackageStatus(`已导入 ${result.fileName}：新增 ${result.inserted} 条，更新 ${result.updated} 条。`);
        await refreshWorkspace(result.projectId);
      }
    } catch (error) {
      setPackageStatus(errorMessage(error));
    } finally {
      setIsManagingPackage(false);
    }
  }

  async function handleExportPackage() {
    if (!selectedProjectId) {
      return;
    }
    setIsManagingPackage(true);
    setPackageStatus("");
    try {
      const result = await window.gamepulse.projects.exportPackage(selectedProjectId);
      if (!result.canceled) {
        setPackageStatus(`已导出 ${result.fileName}，共 ${formatBytes(result.bytes)}。`);
      }
    } catch (error) {
      setPackageStatus(errorMessage(error));
    } finally {
      setIsManagingPackage(false);
    }
  }

  async function handleSaveModelConfig() {
    setIsSavingModel(true);
    setModelConfigMessage("");
    try {
      const status = await window.gamepulse.models.updateConfig({
        ...modelConfig,
        apiKey: modelConfig.apiKey?.trim() ? modelConfig.apiKey : undefined
      });
      setModelStatus(status);
      setModelConfig((current) => ({ ...current, apiKey: "" }));
      setModelConfigMessage(
        status.provider === "ollama"
          ? "Ollama 配置已保存。"
          : `远程模型配置已保存${status.apiKeyHint ? `，密钥 ${status.apiKeyHint}` : ""}。`
      );
    } catch (error) {
      setModelConfigMessage(errorMessage(error));
    } finally {
      setIsSavingModel(false);
    }
  }

  function handleProviderChange(provider: ModelConfigInput["provider"]) {
    setModelConfig({
      provider,
      baseUrl: provider === "ollama" ? "http://127.0.0.1:11434" : "https://api.openai.com/v1",
      model: provider === "ollama" ? "qwen2.5:7b" : "gpt-4.1-mini",
      apiKey: ""
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-[264px_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside className="sticky top-0 flex h-screen flex-col gap-8 border-r border-border bg-primary px-5 py-6 text-primary-foreground max-lg:static max-lg:h-auto">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-accent text-accent-foreground">
              <Activity className="size-5" />
            </div>
            <div>
              <strong className="block text-lg leading-none">游脉 GamePulse</strong>
              <span className="mt-1 block text-xs text-primary-foreground/62">Windows 本地工作台</span>
            </div>
          </div>
          <nav className="grid gap-1" aria-label="主菜单">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  className="inline-flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-primary-foreground/78 transition-colors hover:bg-white/8 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={item.href}
                  key={item.href}
                >
                  <Icon className="size-4" />
                  {item.label}
                </a>
              );
            })}
          </nav>
          <div className="mt-auto rounded-md border border-white/10 bg-white/6 p-4">
            <span className="text-xs font-semibold text-primary-foreground/56">本地运行时</span>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge className="border-white/10 bg-white/8 text-primary-foreground" variant="outline">
                {window.gamepulse.platform}
              </Badge>
              <Badge className="border-white/10 bg-white/8 text-primary-foreground" variant="outline">
                Electron {window.gamepulse.versions.electron ?? "unknown"}
              </Badge>
            </div>
          </div>
        </aside>

        <main className="min-w-0 px-8 py-8 max-sm:px-4">
          <header className="flex items-start justify-between gap-6 max-md:flex-col">
            <div className="max-w-4xl">
              <p className="mb-3 text-sm font-semibold text-muted-foreground">Chromium 采集 + SQLite FTS5 + 本地 RAG</p>
              <h1 className="text-balance text-4xl font-semibold leading-tight max-sm:text-3xl">
                把玩家评论保存在本机，用可追溯证据回答产品问题。
              </h1>
            </div>
            <Badge className="h-9 gap-2 px-3" variant="secondary">
              <span className="size-2 rounded-full bg-current" />
              {databaseStats ? "SQLite 已就绪" : "正在初始化"}
            </Badge>
          </header>

          <div className="mt-8 grid grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] gap-6 max-xl:grid-cols-1">
            <section className="grid min-w-0 gap-6">
              <CollectorSection
                collectorError={collectorError}
                collectorResult={collectorResult}
                collectorUrl={collectorUrl}
                isCollecting={isCollecting}
                isSaving={isSaving}
                onCollect={handleCollect}
                onSave={handleSaveCollectorResult}
                saveStatus={saveStatus}
                setCollectorUrl={setCollectorUrl}
              />
              <RagSection
                isRunningModel={isRunningModel}
                isRunningRag={isRunningRag}
                modelAnswer={modelAnswer}
                onCancel={handleCancelModel}
                onRun={handleRunRag}
                ragError={ragError}
                ragQuery={ragQuery}
                ragResult={ragResult}
                setRagQuery={setRagQuery}
              />
            </section>

            <aside className="grid h-fit gap-6">
              <StatsSection databaseStats={databaseStats} />
              <ProjectPackageSection
                busy={isManagingPackage}
                onExport={handleExportPackage}
                onImport={handleImportPackage}
                projects={projects}
                selectedProjectId={selectedProjectId}
                setSelectedProjectId={setSelectedProjectId}
                status={packageStatus}
              />
              <ModelSection
                config={modelConfig}
                message={modelConfigMessage}
                onProviderChange={handleProviderChange}
                onSave={handleSaveModelConfig}
                saving={isSavingModel}
                setConfig={setModelConfig}
                status={modelStatus}
              />
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

function CollectorSection(props: {
  collectorError: string;
  collectorResult?: CollectorResult;
  collectorUrl: string;
  isCollecting: boolean;
  isSaving: boolean;
  onCollect: () => void;
  onSave: () => void;
  saveStatus: string;
  setCollectorUrl: (url: string) => void;
}) {
  return (
    <Card id="collector">
      <SectionHeader icon={<Globe2 className="size-4" />} meta="只读取当前可见页面" title="Chromium 采集" />
      <CardContent>
        <div className="flex gap-2 max-sm:flex-col">
          <Input
            onChange={(event) => props.setCollectorUrl(event.target.value)}
            placeholder="https://store.steampowered.com/appreviews/..."
            spellCheck={false}
            value={props.collectorUrl}
          />
          <Button disabled={props.isCollecting || !props.collectorUrl.trim()} onClick={props.onCollect} type="button">
            {props.isCollecting ? <Loader2 className="size-4 animate-spin" /> : <Globe2 className="size-4" />}
            采集
          </Button>
        </div>
        {props.collectorError ? <AlertLine text={props.collectorError} /> : null}
        {props.collectorResult ? (
          <div className="mt-4 grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={props.isSaving || props.collectorResult.itemCount === 0} onClick={props.onSave} type="button" variant="secondary">
                {props.isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                保存到 SQLite
              </Button>
              {props.saveStatus ? <span className="text-sm text-muted-foreground">{props.saveStatus}</span> : null}
            </div>
            <CollectorPreview result={props.collectorResult} />
          </div>
        ) : (
          <EmptyState icon={<Globe2 className="size-5" />} text="输入公开页面 URL，采集当前可见评论。" />
        )}
      </CardContent>
    </Card>
  );
}

function RagSection(props: {
  isRunningModel: boolean;
  isRunningRag: boolean;
  modelAnswer: string;
  onCancel: () => void;
  onRun: () => void;
  ragError: string;
  ragQuery: string;
  ragResult?: RagQueryResult;
  setRagQuery: (query: string) => void;
}) {
  return (
    <Card id="rag">
      <SectionHeader icon={<Brain className="size-4" />} meta="最多 8 条证据，12,000 字符上下文" title="本地 RAG" />
      <CardContent>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 max-sm:grid-cols-1">
          <Textarea onChange={(event) => props.setRagQuery(event.target.value)} rows={3} value={props.ragQuery} />
          <div className="grid gap-2">
            <Button disabled={props.isRunningRag || props.isRunningModel || !props.ragQuery.trim()} onClick={props.onRun} type="button">
              {props.isRunningRag || props.isRunningModel ? <Loader2 className="size-4 animate-spin" /> : <Brain className="size-4" />}
              基于证据回答
            </Button>
            {props.isRunningModel ? (
              <Button onClick={props.onCancel} type="button" variant="outline">
                <X className="size-4" />
                取消
              </Button>
            ) : null}
          </div>
        </div>
        {props.ragError ? <AlertLine text={props.ragError} /> : null}
        {props.ragResult ? (
          <RagPreview modelAnswer={props.modelAnswer} result={props.ragResult} />
        ) : (
          <EmptyState icon={<Brain className="size-5" />} text="先采集或导入评论，再按项目检索证据并回答。" />
        )}
      </CardContent>
    </Card>
  );
}

function StatsSection({ databaseStats }: { databaseStats?: DatabaseStats }) {
  return (
    <Card id="database">
      <SectionHeader icon={<Database className="size-4" />} meta={databaseStats?.databasePath ?? "正在初始化数据库"} title="SQLite 证据库" />
      <CardContent className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        <Metric label="项目" value={databaseStats?.projectCount ?? 0} />
        <Metric label="评论" value={databaseStats?.rawItemCount ?? 0} />
        <Metric label="最近采集" value={databaseStats?.latestCollectedAt ? new Date(databaseStats.latestCollectedAt).toLocaleString() : "暂无"} />
      </CardContent>
    </Card>
  );
}

function ProjectPackageSection(props: {
  busy: boolean;
  onExport: () => void;
  onImport: () => void;
  projects: Project[];
  selectedProjectId: string;
  setSelectedProjectId: (value: string) => void;
  status: string;
}) {
  return (
    <Card id="projects">
      <SectionHeader icon={<FileArchive className="size-4" />} meta="Windows 与 Android 文件交换" title="项目包" />
      <CardContent className="grid gap-3">
        <label className="grid gap-1.5 text-sm font-semibold">
          当前项目
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            onChange={(event) => props.setSelectedProjectId(event.target.value)}
            value={props.selectedProjectId}
          >
            {props.projects.length === 0 ? <option value="">暂无项目</option> : null}
            {props.projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={props.busy} onClick={props.onImport} type="button" variant="outline">
            <UploadCloud className="size-4" />
            导入
          </Button>
          <Button disabled={props.busy || !props.selectedProjectId} onClick={props.onExport} type="button" variant="secondary">
            <Download className="size-4" />
            导出
          </Button>
        </div>
        {props.status ? <StatusLine text={props.status} /> : null}
      </CardContent>
    </Card>
  );
}

function ModelSection(props: {
  config: ModelConfigInput;
  message: string;
  onProviderChange: (provider: ModelConfigInput["provider"]) => void;
  onSave: () => void;
  saving: boolean;
  setConfig: (config: ModelConfigInput) => void;
  status?: ModelConfigStatus;
}) {
  return (
    <Card id="models">
      <SectionHeader
        icon={<Settings2 className="size-4" />}
        meta={props.status?.hasApiKey ? `已保存密钥 ${props.status.apiKeyHint ?? ""}` : "凭据由 safeStorage 保护"}
        title="模型设置"
      />
      <CardContent className="grid gap-3">
        <label className="grid gap-1.5 text-sm font-semibold">
          提供商
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            onChange={(event) => props.onProviderChange(event.target.value as ModelConfigInput["provider"])}
            value={props.config.provider}
          >
            <option value="openai">OpenAI-compatible</option>
            <option value="ollama">Ollama</option>
          </select>
        </label>
        <Input
          onChange={(event) => props.setConfig({ ...props.config, baseUrl: event.target.value })}
          placeholder="Base URL"
          value={props.config.baseUrl}
        />
        <Input
          onChange={(event) => props.setConfig({ ...props.config, model: event.target.value })}
          placeholder="模型"
          value={props.config.model}
        />
        {props.config.provider === "openai" ? (
          <Input
            onChange={(event) => props.setConfig({ ...props.config, apiKey: event.target.value })}
            placeholder={props.status?.hasApiKey ? "留空以保留现有 API Key" : "API Key"}
            type="password"
            value={props.config.apiKey ?? ""}
          />
        ) : null}
        <Button disabled={props.saving || !props.config.baseUrl.trim() || !props.config.model.trim()} onClick={props.onSave} type="button">
          {props.saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          安全保存
        </Button>
        {props.message ? <StatusLine text={props.message} /> : null}
      </CardContent>
    </Card>
  );
}

function CollectorPreview({ result }: { result: CollectorResult }) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        <Metric label="平台" value={result.platform} />
        <Metric label="可见评论" value={result.itemCount} />
        <Metric label="页面标题" value={result.title || "未命名"} />
      </div>
      <div className="grid max-h-[460px] gap-3 overflow-auto pr-1">
        {result.items.slice(0, 12).map((item, index) => (
          <article className="rounded-md border border-border bg-background p-4" key={`${item.body}-${index}`}>
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
              <span>{item.platform}</span>
              <span className="truncate">{item.selector}</span>
            </div>
            <p className="m-0 text-sm leading-6">{item.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function RagPreview({ modelAnswer, result }: { modelAnswer: string; result: RagQueryResult }) {
  return (
    <div className="mt-4 grid gap-4">
      <article className="rounded-md bg-accent/45 p-4">
        <span className="text-xs font-semibold text-accent-foreground">{modelAnswer ? "模型回答" : "本地证据摘要"}</span>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{modelAnswer || result.answer}</p>
      </article>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)] gap-4 max-lg:grid-cols-1">
        <section>
          <h3 className="mb-3 text-sm font-semibold">证据</h3>
          <div className="grid max-h-[440px] gap-3 overflow-auto pr-1">
            {result.evidence.map((item, index) => (
              <article className="rounded-md border border-border bg-background p-4" key={item.id}>
                <span className="text-xs font-semibold text-muted-foreground">[E{index + 1}] {item.platform}</span>
                <p className="mt-2 text-sm leading-6">{item.excerpt}</p>
                <em className="mt-2 block truncate text-xs not-italic text-muted-foreground">
                  {item.sourceTitle || item.sourceUrl || new Date(item.collectedAt).toLocaleString()}
                </em>
              </article>
            ))}
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-sm font-semibold">裁剪后的模型上下文</h3>
          <Textarea className="min-h-80 font-mono text-xs leading-6" readOnly rows={14} value={result.prompt} />
        </section>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, meta }: { icon: ReactNode; title: string; meta: string }) {
  return (
    <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">{icon}</div>
        <CardTitle className="truncate">{title}</CardTitle>
      </div>
      <CardDescription className="max-w-[48%] truncate text-right max-md:max-w-none">{meta}</CardDescription>
    </CardHeader>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-md bg-background p-3">
      <span className="block truncate text-xs font-semibold text-muted-foreground">{label}</span>
      <strong className="mt-1 block truncate text-xl font-semibold">{value}</strong>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-md border border-dashed border-border bg-muted/35 px-4 py-5 text-sm text-muted-foreground">
      {icon}
      <span>{text}</span>
    </div>
  );
}

function AlertLine({ text }: { text: string }) {
  return <div className="mt-4 rounded-md border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">{text}</div>;
}

function StatusLine({ text }: { text: string }) {
  return <div className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">{text}</div>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
