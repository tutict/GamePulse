import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bug,
  Database,
  FileText,
  Flame,
  Loader2,
  Play,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  UploadCloud
} from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Textarea, cn } from "@gamepulse/ui";
import { PLATFORM_LABELS, PLATFORMS, type IngestItem, type Project, type Report } from "@gamepulse/shared";
import {
  createProject,
  getHealth,
  getRun,
  importRows,
  listProjects,
  listReports,
  runAnalysis,
  searchComments,
  uploadImport
} from "./lib/api.js";

type ApiState = "checking" | "online" | "offline";
type SearchResult = Awaited<ReturnType<typeof searchComments>>["comments"][number];

const sampleRows: IngestItem[] = [
  {
    platform: "bilibili",
    body: "新版本剧情不差，但手机端活动掉帧明显，希望尽快优化。",
    sourceUrl: "https://www.bilibili.com/",
    upvotes: 42
  },
  {
    platform: "steam",
    body: "After the patch the game keeps crashing on launch. I might refund if this stays broken.",
    sourceUrl: "https://store.steampowered.com/",
    upvotes: 17
  },
  {
    platform: "taptap",
    body: "星见雅这次强度感觉被削过头了，抽了很难受。",
    sourceUrl: "https://www.taptap.cn/",
    upvotes: 28
  }
];

const navItems = [
  { href: "#project", label: "项目", icon: Settings2 },
  { href: "#import", label: "导入", icon: UploadCloud },
  { href: "#analysis", label: "分析", icon: Play },
  { href: "#reports", label: "报告", icon: FileText },
  { href: "#evidence", label: "证据", icon: Search }
];

export function App() {
  const [apiState, setApiState] = useState<ApiState>("checking");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [activeReportId, setActiveReportId] = useState("");
  const [runId, setRunId] = useState("");
  const [runStatus, setRunStatus] = useState("");
  const [notice, setNotice] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const activeReport = reports.find((report) => report.id === activeReportId) ?? reports[0];

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setReports([]);
      setActiveReportId("");
      return;
    }

    void refreshReports(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!runId) {
      return;
    }

    const handle = window.setInterval(() => {
      void getRun(runId).then((run) => {
        setRunStatus(`${formatRunStatus(run.status)} / ${run.progress.stage} / ${run.progress.processed}/${run.progress.total}`);

        if (run.status === "completed" || run.status === "failed") {
          window.clearInterval(handle);
          setIsRunningAnalysis(false);
          void refreshReports(run.projectId);
        }
      });
    }, 1500);

    return () => window.clearInterval(handle);
  }, [runId]);

  async function bootstrap() {
    try {
      await getHealth();
      setApiState("online");
      const nextProjects = await listProjects();
      setProjects(nextProjects);
      setSelectedProjectId(nextProjects[0]?.id ?? "");
    } catch (error) {
      setApiState("offline");
      setNotice(error instanceof Error ? error.message : "本地 API 未连接");
    }
  }

  async function refreshReports(projectId: string) {
    const nextReports = await listReports(projectId);
    setReports(nextReports);
    setActiveReportId(nextReports[0]?.id ?? "");
  }

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const releaseDate = String(form.get("releasedAt") || new Date().toISOString().slice(0, 10));
    const aliases = String(form.get("aliases") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [canonical = line, aliasText = ""] = line.split(":");
        return {
          kind: "character" as const,
          canonical: canonical.trim(),
          aliases: aliasText
            .split(",")
            .map((alias) => alias.trim())
            .filter(Boolean)
        };
      });

    const project = await createProject({
      name: String(form.get("name") || "未命名游戏"),
      description: String(form.get("description") || ""),
      steamAppId: String(form.get("steamAppId") || ""),
      redditSubreddits: splitList(String(form.get("redditSubreddits") || "")),
      redditKeywords: splitList(String(form.get("redditKeywords") || "")),
      versionWindows: [
        {
          id: crypto.randomUUID(),
          name: String(form.get("versionName") || "当前版本"),
          releasedAt: new Date(`${releaseDate}T00:00:00.000Z`).toISOString(),
          beforeDays: 14,
          afterDays: 14
        }
      ],
      entityAliases: aliases
    });

    const nextProjects = await listProjects();
    setProjects(nextProjects);
    setSelectedProjectId(project.id);
    setNotice(`已创建项目：${project.name}`);
  }

  async function handleSampleImport() {
    if (!selectedProject) {
      return;
    }

    setIsImporting(true);
    try {
      const result = await importRows(selectedProject.id, sampleRows);
      setNotice(`样例导入完成：解析 ${result.parsed} 条，新增 ${result.inserted} 条。`);
    } finally {
      setIsImporting(false);
    }
  }

  async function handleFileImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !selectedProject) {
      return;
    }

    setIsImporting(true);
    try {
      const result = await uploadImport(selectedProject.id, file);
      setNotice(`文件导入完成：解析 ${result.parsed} 条，新增 ${result.inserted} 条。`);
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  }

  async function handleRunAnalysis() {
    if (!selectedProject) {
      return;
    }

    setIsRunningAnalysis(true);
    const response = await runAnalysis({
      projectId: selectedProject.id,
      versionWindowId: selectedProject.versionWindows[0]?.id
    });
    setRunId(response.runId);
    setRunStatus(`${response.mode} / ${response.runId}`);
    setNotice("分析任务已启动，报告生成后会自动刷新。");
  }

  async function handleSearch() {
    if (!selectedProject) {
      return;
    }

    setIsSearching(true);
    try {
      const payload = await searchComments({ projectId: selectedProject.id, q: searchQuery });
      setSearchResults(payload.comments);
    } finally {
      setIsSearching(false);
    }
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
              <span className="mt-1 block text-xs text-primary-foreground/62">本地游戏舆情工作台</span>
            </div>
          </div>

          <nav className="grid gap-1" aria-label="主导航">
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
            <span className="text-xs font-semibold uppercase tracking-normal text-primary-foreground/56">平台入口</span>
            <div className="mt-3 flex flex-wrap gap-2">
              {PLATFORMS.filter((platform) => platform !== "import").map((platform) => (
                <Badge className="border-white/10 bg-white/8 text-primary-foreground hover:bg-white/12" key={platform} variant="outline">
                  {PLATFORM_LABELS[platform]}
                </Badge>
              ))}
            </div>
          </div>
        </aside>

        <main className="min-w-0 px-8 py-8 max-sm:px-4">
          <header className="flex items-start justify-between gap-6 max-md:flex-col">
            <div className="max-w-4xl">
              <p className="mb-3 text-sm font-semibold text-muted-foreground">运营与制作团队的版本舆情雷达</p>
              <h1 className="text-balance text-4xl font-semibold leading-tight text-foreground max-sm:text-3xl">
                跨平台收集玩家反馈，定位高频抱怨、BUG 聚类与流失风险。
              </h1>
            </div>
            <StatusPill state={apiState} />
          </header>

          {notice ? (
            <div className="mt-6 flex items-start gap-3 rounded-md border border-accent bg-accent/35 px-4 py-3 text-sm text-accent-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <span>{notice}</span>
            </div>
          ) : null}

          <div className="mt-8 grid grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)] gap-6 max-xl:grid-cols-1">
            <section className="grid min-w-0 gap-6">
              <ProjectSection projects={projects} selectedProjectId={selectedProjectId} onSelect={setSelectedProjectId} onCreate={handleCreateProject} />
              <ImportSection disabled={!selectedProject || isImporting} isImporting={isImporting} onFileImport={handleFileImport} onSampleImport={handleSampleImport} />
              <AnalysisSection
                disabled={!selectedProject || isRunningAnalysis}
                isRunning={isRunningAnalysis}
                onRefresh={() => selectedProject && void refreshReports(selectedProject.id)}
                onRun={handleRunAnalysis}
                runStatus={runStatus}
              />
              <ReportsSection reports={reports} activeReportId={activeReport?.id ?? ""} onSelect={setActiveReportId} />
            </section>

            <aside className="grid h-fit gap-6">
              <ReportPreview report={activeReport} />
              <EvidenceSearch
                disabled={!selectedProject || isSearching}
                isSearching={isSearching}
                onSearch={handleSearch}
                query={searchQuery}
                results={searchResults}
                setQuery={setSearchQuery}
              />
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

function ProjectSection(props: {
  projects: Project[];
  selectedProjectId: string;
  onSelect: (projectId: string) => void;
  onCreate: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const selectedProject = props.projects.find((project) => project.id === props.selectedProjectId);
  const metrics = useMemo(
    () => ({
      versions: selectedProject?.versionWindows.length ?? 0,
      aliases: selectedProject?.entityAliases.length ?? 0,
      sources: selectedProject?.sourceLinks.length ?? 0
    }),
    [selectedProject]
  );

  return (
    <Card id="project">
      <SectionHeader icon={<Settings2 className="size-4" />} meta="版本窗口 / Steam AppID / Reddit 关键词 / 角色词表" title="项目配置" />
      <CardContent className="grid grid-cols-[minmax(0,1fr)_300px] gap-5 max-lg:grid-cols-1">
        <form className="grid grid-cols-2 gap-4 max-md:grid-cols-1" onSubmit={props.onCreate}>
          <Field label="游戏名称">
            <Input name="name" placeholder="例如：绝区零" required />
          </Field>
          <Field label="版本名称">
            <Input name="versionName" placeholder="例如：1.7 更新" />
          </Field>
          <Field label="发布时间">
            <Input name="releasedAt" type="date" />
          </Field>
          <Field label="Steam AppID">
            <Input name="steamAppId" placeholder="可选" />
          </Field>
          <Field label="Reddit 子版">
            <Input name="redditSubreddits" placeholder="多个用逗号分隔" />
          </Field>
          <Field label="Reddit 关键词">
            <Input name="redditKeywords" placeholder="多个用逗号分隔" />
          </Field>
          <Field className="col-span-2 max-md:col-span-1" label="角色词表">
            <Textarea name="aliases" placeholder={"星见雅: Miyabi, 雅\n妮可: Nicole"} rows={4} />
          </Field>
          <Field className="col-span-2 max-md:col-span-1" label="说明">
            <Textarea name="description" placeholder="项目背景、版本目标或重点观察问题" rows={3} />
          </Field>
          <Button className="col-span-2 w-fit max-md:col-span-1" type="submit">
            <ShieldCheck className="size-4" />
            创建项目
          </Button>
        </form>

        <div className="grid content-start gap-4 rounded-md border border-border bg-muted/50 p-4">
          <label className="grid gap-2 text-sm font-semibold text-foreground">
            当前项目
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => props.onSelect(event.target.value)}
              value={props.selectedProjectId}
            >
              <option value="">选择项目</option>
              {props.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <Metric label="版本" value={metrics.versions} />
            <Metric label="词表" value={metrics.aliases} />
            <Metric label="来源" value={metrics.sources} />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {selectedProject ? `当前项目：${selectedProject.name}。版本前后窗口默认各 14 天。` : "先创建或选择项目，再导入评论并启动分析。"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ImportSection(props: {
  disabled: boolean;
  isImporting: boolean;
  onFileImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSampleImport: () => void;
}) {
  return (
    <Card id="import">
      <SectionHeader icon={<Database className="size-4" />} meta="CSV/JSON、大文件导入、当前页脚本采集兜底" title="数据导入" />
      <CardContent>
        <div className="flex flex-wrap gap-3">
          <Button disabled={props.disabled} onClick={props.onSampleImport} type="button">
            {props.isImporting ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            导入样例
          </Button>
          <label className={cn("inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-semibold transition-colors hover:bg-accent", props.disabled && "pointer-events-none opacity-50")}>
            <UploadCloud className="size-4" />
            上传 CSV/JSON
            <input className="sr-only" type="file" accept=".csv,.json" onChange={props.onFileImport} disabled={props.disabled} />
          </label>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          油猴脚本提交到 <code className="rounded bg-primary/8 px-1.5 py-0.5 text-primary">/api/ingest/batch</code>。作者字段默认脱敏，原文、平台、时间和来源链接保留用于证据回溯。
        </p>
      </CardContent>
    </Card>
  );
}

function AnalysisSection(props: {
  disabled: boolean;
  isRunning: boolean;
  onRefresh: () => void;
  onRun: () => void;
  runStatus: string;
}) {
  return (
    <Card id="analysis">
      <SectionHeader icon={<Play className="size-4" />} meta="分块分类 / SQL 聚合 / 代表样本总结" title="分析任务" />
      <CardContent>
        <div className="flex flex-wrap gap-3">
          <Button disabled={props.disabled} onClick={props.onRun} type="button">
            {props.isRunning ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            启动版本分析
          </Button>
          <Button disabled={props.disabled} onClick={props.onRefresh} type="button" variant="secondary">
            <RefreshCcw className="size-4" />
            刷新报告
          </Button>
        </div>
        <div className="mt-4 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {props.runStatus || "等待任务"}
        </div>
      </CardContent>
    </Card>
  );
}

function ReportsSection(props: { reports: Report[]; activeReportId: string; onSelect: (reportId: string) => void }) {
  return (
    <Card id="reports">
      <SectionHeader icon={<FileText className="size-4" />} meta="中文报告、原文证据、行动建议" title="报告列表" />
      <CardContent className="grid gap-2">
        {props.reports.length === 0 ? (
          <EmptyState icon={<FileText className="size-5" />} text="暂无报告。完成一次分析后会在这里显示。" />
        ) : (
          props.reports.map((report) => (
            <button
              className={cn(
                "grid w-full gap-1 rounded-md border px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                report.id === props.activeReportId ? "border-primary bg-accent" : "border-border bg-background"
              )}
              key={report.id}
              onClick={() => props.onSelect(report.id)}
              type="button"
            >
              <span className="font-semibold text-foreground">{report.title}</span>
              <span className="text-xs text-muted-foreground">{new Date(report.createdAt).toLocaleString()}</span>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ReportPreview({ report }: { report?: Report }) {
  if (!report) {
    return (
      <Card className="sticky top-6 max-xl:static">
        <SectionHeader icon={<FileText className="size-4" />} meta="等待分析输出" title="报告预览" />
        <CardContent>
          <EmptyState icon={<FileText className="size-5" />} text="启动分析后，这里会显示报告正文。" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="sticky top-6 max-xl:static">
      <SectionHeader icon={<Flame className="size-4" />} meta={`舆情风险指数 ${report.summary.riskIndex}/100`} title={report.title} />
      <CardContent>
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Metric label="评论" value={report.summary.totalComments} />
          <Metric label="负面" value={`${Math.round(report.summary.negativeRate * 100)}%`} />
          <Metric label="BUG" value={`${Math.round(report.summary.bugRate * 100)}%`} />
        </div>
        <article className="max-h-[520px] overflow-auto rounded-md border border-border bg-muted/35 p-4 text-sm leading-7 text-foreground whitespace-pre-wrap">
          {report.markdown}
        </article>
      </CardContent>
    </Card>
  );
}

function EvidenceSearch(props: {
  query: string;
  setQuery: (query: string) => void;
  results: SearchResult[];
  onSearch: () => void;
  disabled: boolean;
  isSearching: boolean;
}) {
  return (
    <Card id="evidence">
      <SectionHeader icon={<Search className="size-4" />} meta="按关键词回看原文和标签" title="证据搜索" />
      <CardContent>
        <div className="flex gap-2 max-sm:flex-col">
          <Input onChange={(event) => props.setQuery(event.target.value)} placeholder="退坑、退款、角色名、卡顿..." value={props.query} />
          <Button disabled={props.disabled} onClick={props.onSearch} type="button">
            {props.isSearching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            搜索
          </Button>
        </div>
        <div className="mt-4 grid gap-3">
          {props.results.length === 0 ? (
            <EmptyState icon={<Search className="size-5" />} text="搜索结果会显示平台、原文、情绪与风险标签。" />
          ) : (
            props.results.map((item) => (
              <article className="rounded-md border border-border bg-background p-4" key={item.id}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{PLATFORM_LABELS[item.platform]}</Badge>
                  {item.label?.isBug ? <Badge variant="destructive"><Bug className="mr-1 size-3" />BUG</Badge> : null}
                  {item.label?.isChurnRisk ? <Badge><Flame className="mr-1 size-3" />流失信号</Badge> : null}
                </div>
                <p className="text-sm leading-6 text-foreground">{item.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.label ? `${item.label.sentiment} / ${item.label.topic} / 严重度 ${item.label.severity}` : "未分析"}
                </p>
              </article>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ icon, title, meta }: { icon: React.ReactNode; title: string; meta: string }) {
  return (
    <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">{icon}</div>
        <CardTitle className="truncate">{title}</CardTitle>
      </div>
      <CardDescription className="max-w-[48%] text-right max-md:max-w-none">{meta}</CardDescription>
    </CardHeader>
  );
}

function Field({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  return (
    <label className={cn("grid gap-2 text-sm font-semibold text-foreground", className)}>
      {label}
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-md bg-background p-3">
      <span className="block truncate text-xs font-semibold text-muted-foreground">{label}</span>
      <strong className="mt-1 block truncate text-xl font-semibold text-foreground">{value}</strong>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-muted/35 px-4 py-5 text-sm text-muted-foreground">
      {icon}
      <span>{text}</span>
    </div>
  );
}

function StatusPill({ state }: { state: ApiState }) {
  const label = state === "online" ? "API 在线" : state === "offline" ? "API 离线" : "检查中";
  return (
    <Badge className="h-9 gap-2 px-3" variant={state === "offline" ? "destructive" : "secondary"}>
      {state === "checking" ? <Loader2 className="size-3.5 animate-spin" /> : <span className="size-2 rounded-full bg-current" />}
      {label}
    </Badge>
  );
}

function splitList(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatRunStatus(status: string) {
  if (status === "completed") {
    return "已完成";
  }
  if (status === "failed") {
    return "失败";
  }
  if (status === "running") {
    return "运行中";
  }
  return "排队中";
}