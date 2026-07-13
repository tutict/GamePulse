import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Bot,
  Database,
  FileDown,
  FileSearch,
  FolderKanban,
  Import,
  Loader2,
  Plus,
  Save,
  Search,
  Settings2,
  Share2
} from "lucide-react";
import {
  AppShell,
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
import {
  rerankEvidence,
  type LocalStore,
  type LocalStoreStats,
  type Project,
  type RankedRagEvidence
} from "@gamepulse/shared";
import {
  exportAndShareProject,
  pickAndImportFile,
  type ImportFileResult
} from "./files/projectFiles.js";
import {
  getRemoteModelStatus,
  saveRemoteModelConfig,
  type RemoteModelConfigStatus
} from "./models/secureModelConfig.js";
import { runMobileRag, type MobileRagResult } from "./rag/mobileRag.js";
import { getLocalStore } from "./storage/index.js";

type ViewId = "projects" | "import" | "search" | "rag" | "evidence" | "settings";

const navigation = [
  { id: "projects", label: "项目", icon: <FolderKanban className="size-5" /> },
  { id: "import", label: "导入", icon: <Import className="size-5" /> },
  { id: "search", label: "搜索", icon: <Search className="size-5" /> },
  { id: "rag", label: "问答", icon: <Bot className="size-5" /> },
  { id: "evidence", label: "证据", icon: <FileSearch className="size-5" /> },
  { id: "settings", label: "设置", icon: <Settings2 className="size-5" /> }
] satisfies Array<{ id: ViewId; label: string; icon: ReactNode }>;

export function App() {
  const [view, setView] = useState<ViewId>("projects");
  const [store, setStore] = useState<LocalStore>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [stats, setStats] = useState<LocalStoreStats>();
  const [status, setStatus] = useState("正在初始化本地数据库...");
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportFileResult>();
  const [searchQuery, setSearchQuery] = useState("性能 卡顿");
  const [evidence, setEvidence] = useState<RankedRagEvidence[]>([]);
  const [ragQuery, setRagQuery] = useState("玩家最关注的负面问题是什么？");
  const [ragResult, setRagResult] = useState<MobileRagResult>();
  const [modelStatus, setModelStatus] = useState<RemoteModelConfigStatus>();

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const localStore = await getLocalStore();
        let loadedProjects = await localStore.listProjects();
        if (loadedProjects.length === 0) {
          const initial = createProject("我的游戏项目", "Android 本地评论分析项目", "android-default-project");
          await localStore.saveProject(initial);
          loadedProjects = [initial];
        }
        const [loadedStats, loadedModelStatus] = await Promise.all([
          localStore.getStats(),
          getRemoteModelStatus()
        ]);
        if (!active) {
          return;
        }
        setStore(localStore);
        setProjects(loadedProjects);
        setSelectedProjectId(loadedProjects[0]?.id ?? "");
        setStats(loadedStats);
        setModelStatus(loadedModelStatus);
        setStatus("本地 SQLite 已就绪");
      } catch (error) {
        if (active) {
          setStatus(errorMessage(error));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function refresh(projectId = selectedProjectId) {
    if (!store) {
      return;
    }
    const [loadedProjects, loadedStats] = await Promise.all([
      store.listProjects(),
      store.getStats(projectId || undefined)
    ]);
    setProjects(loadedProjects);
    setStats(loadedStats);
  }

  async function handleCreateProject(name: string) {
    if (!store || !name.trim()) {
      return;
    }
    const project = createProject(name.trim(), "Android 本地评论分析项目");
    await store.saveProject(project);
    setSelectedProjectId(project.id);
    setStatus(`已创建项目：${project.name}`);
    await refresh(project.id);
  }

  async function handleImport() {
    if (!store) {
      return;
    }
    setBusy(true);
    try {
      const result = await pickAndImportFile(store, selectedProjectId || undefined);
      if (!result) {
        return;
      }
      setImportResult(result);
      setSelectedProjectId(result.projectId);
      setStatus(`已导入 ${result.inserted}/${result.accepted} 条新评论`);
      await refresh(result.projectId);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    if (!store || !selectedProjectId) {
      return;
    }
    setBusy(true);
    try {
      const fileName = await exportAndShareProject(store, selectedProjectId);
      setStatus(`已生成 ${fileName}`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSearch() {
    if (!store || !selectedProjectId || !searchQuery.trim()) {
      return;
    }
    setBusy(true);
    try {
      const candidates = await store.searchEvidence({
        projectId: selectedProjectId,
        query: searchQuery,
        limit: 32
      });
      const ranked = rerankEvidence(searchQuery, candidates, { limit: 20 });
      setEvidence(ranked);
      setStatus(`找到 ${ranked.length} 条证据`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRag() {
    if (!store || !selectedProjectId || !ragQuery.trim()) {
      return;
    }
    setBusy(true);
    try {
      const result = await runMobileRag(store, selectedProjectId, ragQuery);
      setRagResult(result);
      setEvidence(result.evidence);
      setStatus(`回答完成，引用 ${result.evidence.length} 条证据`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveModel(input: {
    baseUrl: string;
    model: string;
    apiKey?: string;
  }) {
    setBusy(true);
    try {
      const nextStatus = await saveRemoteModelConfig(input);
      setModelStatus(nextStatus);
      setStatus("远程模型配置已安全保存");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      actions={<Badge variant="secondary">{stats?.commentCount ?? 0} 条</Badge>}
      activeNavigationId={view}
      brand={<div className="grid size-10 place-items-center rounded-md bg-accent text-accent-foreground"><Activity className="size-5" /></div>}
      navigation={navigation}
      onNavigate={(id) => setView(id as ViewId)}
      subtitle={selectedProject?.name ?? status}
      title="游脉 GamePulse"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="m-0 min-w-0 truncate text-sm text-muted-foreground">{status}</p>
        {busy ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" /> : null}
      </div>

      {view === "projects" ? (
        <ProjectsScreen
          busy={busy}
          onCreate={handleCreateProject}
          onExport={handleExport}
          onSelect={setSelectedProjectId}
          projects={projects}
          selectedProjectId={selectedProjectId}
          stats={stats}
        />
      ) : null}
      {view === "import" ? (
        <ImportScreen busy={busy} onImport={handleImport} result={importResult} />
      ) : null}
      {view === "search" ? (
        <SearchScreen
          busy={busy}
          evidence={evidence}
          onImport={() => setView("import")}
          onQueryChange={setSearchQuery}
          onSearch={handleSearch}
          query={searchQuery}
        />
      ) : null}
      {view === "rag" ? (
        <RagScreen
          busy={busy}
          configured={modelStatus?.hasApiKey ?? false}
          onConfigure={() => setView("settings")}
          onQueryChange={setRagQuery}
          onRun={handleRag}
          query={ragQuery}
          result={ragResult}
        />
      ) : null}
      {view === "evidence" ? (
        <EvidenceScreen
          evidence={evidence}
          onImport={() => setView("import")}
          onSearch={() => setView("search")}
        />
      ) : null}
      {view === "settings" ? (
        <SettingsScreen
          busy={busy}
          onSave={handleSaveModel}
          status={modelStatus}
        />
      ) : null}
    </AppShell>
  );
}

function ProjectsScreen(props: {
  busy: boolean;
  projects: Project[];
  selectedProjectId: string;
  stats?: LocalStoreStats;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onExport: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  return (
    <div className="grid gap-4">
      <ScreenHeading title="项目" description="每个项目拥有独立 SQLite 数据和可交换的 .gamepulse 包。" />
      <div className="grid grid-cols-2 gap-3">
        <Metric label="项目" value={props.projects.length} />
        <Metric label="评论" value={props.stats?.commentCount ?? 0} />
      </div>
      <div className="grid gap-2">
        {props.projects.map((project) => (
          <button
            className={`w-full rounded-md border p-4 text-left ${project.id === props.selectedProjectId ? "border-ring bg-accent/45" : "border-border bg-card"}`}
            key={project.id}
            onClick={() => props.onSelect(project.id)}
            type="button"
          >
            <strong className="block truncate text-sm">{project.name}</strong>
            <span className="mt-1 block truncate text-xs text-muted-foreground">{project.description || "无描述"}</span>
          </button>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>新建项目</CardTitle>
          <CardDescription>项目数据仅保存在本机。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input onChange={(event) => setName(event.target.value)} placeholder="项目名称" value={name} />
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={!name.trim()} onClick={() => void props.onCreate(name)} type="button">
              <Plus className="size-4" />新建
            </Button>
            <Button disabled={props.busy || !props.selectedProjectId} onClick={() => void props.onExport()} type="button" variant="secondary">
              <Share2 className="size-4" />导出
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ImportScreen(props: {
  busy: boolean;
  result?: ImportFileResult;
  onImport: () => Promise<void>;
}) {
  return (
    <div className="grid gap-4">
      <ScreenHeading title="导入" description="支持 .gamepulse、CSV、JSON 与 NDJSON；重复评论自动去重。" />
      <Card>
        <CardContent className="grid gap-4 pt-6">
          <Button disabled={props.busy} onClick={() => void props.onImport()} type="button">
            {props.busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            选择文件
          </Button>
          {props.result ? (
            <div className="rounded-md bg-accent/45 p-4 text-sm">
              <strong className="block truncate">{props.result.fileName}</strong>
              <span className="mt-1 block text-muted-foreground">
                新增 {props.result.inserted} / 接受 {props.result.accepted}
              </span>
            </div>
          ) : (
            <EmptyState text="选择项目包或评论数据文件开始导入。" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SearchScreen(props: {
  busy: boolean;
  query: string;
  evidence: RankedRagEvidence[];
  onImport: () => void;
  onQueryChange: (value: string) => void;
  onSearch: () => Promise<void>;
}) {
  return (
    <div className="grid gap-4">
      <ScreenHeading title="搜索" description="SQLite FTS5 与中英文词项回退共同检索本地证据。" />
      <Card>
        <CardContent className="grid gap-3 pt-6">
          <Input onChange={(event) => props.onQueryChange(event.target.value)} placeholder="输入检索词" value={props.query} />
          <Button disabled={props.busy || !props.query.trim()} onClick={() => void props.onSearch()} type="button">
            <Search className="size-4" />搜索本地证据
          </Button>
        </CardContent>
      </Card>
      <EvidenceList
        action={<Button onClick={props.onImport} type="button" variant="secondary"><Import className="size-4" />导入评论</Button>}
        evidence={props.evidence}
        text="还没有可展示的证据。先导入评论数据，再执行搜索。"
      />
    </div>
  );
}

function RagScreen(props: {
  busy: boolean;
  configured: boolean;
  query: string;
  result?: MobileRagResult;
  onConfigure: () => void;
  onQueryChange: (value: string) => void;
  onRun: () => Promise<void>;
}) {
  return (
    <div className="grid gap-4">
      <ScreenHeading title="RAG 问答" description="本地检索证据，远程模型只接收裁剪后的证据上下文。" />
      {!props.configured ? (
        <div className="flex flex-col gap-3 rounded-md border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>请先在设置中保存远程模型 API Key。</span>
          <Button onClick={props.onConfigure} type="button" variant="outline">
            <Settings2 className="size-4" />去设置
          </Button>
        </div>
      ) : null}
      <Card>
        <CardContent className="grid gap-3 pt-6">
          <Textarea onChange={(event) => props.onQueryChange(event.target.value)} rows={4} value={props.query} />
          <Button disabled={props.busy || !props.configured || !props.query.trim()} onClick={() => void props.onRun()} type="button">
            {props.busy ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
            基于证据回答
          </Button>
        </CardContent>
      </Card>
      {props.result ? (
        <Card>
          <CardHeader>
            <CardTitle>回答</CardTitle>
            <CardDescription>{props.result.evidence.length} 条引用 · {props.result.contextCharacterCount} 字符上下文</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="m-0 whitespace-pre-wrap text-sm leading-7">{props.result.answer}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function EvidenceScreen(props: {
  evidence: RankedRagEvidence[];
  onImport: () => void;
  onSearch: () => void;
}) {
  return (
    <div className="grid gap-4">
      <ScreenHeading title="证据" description="展示最近一次搜索或问答使用的排序、来源与原文摘录。" />
      <EvidenceList
        action={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={props.onImport} type="button" variant="secondary"><Import className="size-4" />导入评论</Button>
            <Button onClick={props.onSearch} type="button"><Search className="size-4" />去搜索</Button>
          </div>
        }
        evidence={props.evidence}
        text="尚无证据。导入评论后，可以先搜索关键词或运行问答生成引用证据。"
      />
    </div>
  );
}

function SettingsScreen(props: {
  busy: boolean;
  status?: RemoteModelConfigStatus;
  onSave: (input: { baseUrl: string; model: string; apiKey?: string }) => Promise<void>;
}) {
  const [baseUrl, setBaseUrl] = useState(props.status?.baseUrl ?? "https://api.openai.com/v1");
  const [model, setModel] = useState(props.status?.model ?? "gpt-4.1-mini");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (props.status) {
      setBaseUrl(props.status.baseUrl);
      setModel(props.status.model);
    }
  }, [props.status]);

  return (
    <div className="grid gap-4">
      <ScreenHeading title="设置" description="Android 使用 Keystore 生成密钥，并以 AES-GCM 加密模型凭据。" />
      <Card>
        <CardContent className="grid gap-4 pt-6">
          <label className="grid gap-1.5 text-sm font-semibold">
            Base URL
            <Input onChange={(event) => setBaseUrl(event.target.value)} value={baseUrl} />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            模型
            <Input onChange={(event) => setModel(event.target.value)} value={model} />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            API Key
            <Input
              autoComplete="off"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={props.status?.apiKeyHint ?? "sk-..."}
              type="password"
              value={apiKey}
            />
          </label>
          <Button
            disabled={props.busy || !baseUrl.trim() || !model.trim()}
            onClick={() => void props.onSave({
              baseUrl,
              model,
              apiKey: apiKey || undefined
            })}
            type="button"
          >
            <Save className="size-4" />安全保存
          </Button>
          <p className="m-0 text-xs leading-5 text-muted-foreground">
            项目包不会包含 API Key、设备路径或模型缓存。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function EvidenceList(props: { evidence: RankedRagEvidence[]; text?: string; action?: ReactNode }) {
  if (props.evidence.length === 0) {
    return <EmptyState action={props.action} text={props.text ?? "尚无证据。先导入数据并执行搜索或问答。"} />;
  }
  return (
    <div className="grid gap-3">
      {props.evidence.map((item, index) => (
        <article className="rounded-md border border-border bg-card p-4" key={item.id}>
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
            <span>[E{index + 1}] {item.platform}</span>
            <span>{item.score.toFixed(1)}</span>
          </div>
          <p className="mt-2 text-sm leading-6">{item.excerpt}</p>
          <span className="mt-2 block truncate text-xs text-muted-foreground">
            {item.sourceTitle || item.sourceUrl || new Date(item.collectedAt).toLocaleString()}
          </span>
        </article>
      ))}
    </div>
  );
}

function ScreenHeading(props: { title: string; description: string }) {
  return (
    <header>
      <h2 className="m-0 text-2xl font-semibold">{props.title}</h2>
      <p className="mb-0 mt-2 text-sm leading-6 text-muted-foreground">{props.description}</p>
    </header>
  );
}

function Metric(props: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <span className="block text-xs font-semibold text-muted-foreground">{props.label}</span>
      <strong className="mt-1 block text-2xl">{props.value}</strong>
    </div>
  );
}

function EmptyState(props: { text: string; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/35 p-5 text-center text-sm text-muted-foreground">
      <Database className="mx-auto mb-2 size-5" />
      <p className="mx-auto mb-0 mt-0 max-w-md leading-6">{props.text}</p>
      {props.action ? <div className="mt-4">{props.action}</div> : null}
    </div>
  );
}

function createProject(name: string, description: string, id: string = globalThis.crypto.randomUUID()): Project {
  const now = new Date().toISOString();
  return {
    id,
    name,
    description,
    redditSubreddits: [],
    redditKeywords: [],
    sourceLinks: [],
    versionWindows: [],
    entityAliases: [],
    createdAt: now,
    updatedAt: now
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}