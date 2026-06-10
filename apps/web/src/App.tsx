import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bug,
  Database,
  FileText,
  Flame,
  Play,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  UploadCloud
} from "lucide-react";
import { PLATFORM_LABELS, PLATFORMS, type IngestItem, type Platform, type Project, type Report } from "@gamepulse/shared";
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

const sampleRows: IngestItem[] = [
  {
    platform: "bilibili",
    body: "新版本剧情不错，但手机端打活动掉帧太明显，希望尽快优化。",
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
    body: "镜流这次强度感觉被削过头了，抽了很难受。",
    sourceUrl: "https://www.taptap.cn/",
    upvotes: 28
  }
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Awaited<ReturnType<typeof searchComments>>["comments"]>([]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const activeReport = reports.find((report) => report.id === activeReportId) ?? reports[0];

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
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
        setRunStatus(`${run.status} · ${run.progress.stage} · ${run.progress.processed}/${run.progress.total}`);

        if (run.status === "completed" || run.status === "failed") {
          window.clearInterval(handle);
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
      setNotice(error instanceof Error ? error.message : "API offline");
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

    const result = await importRows(selectedProject.id, sampleRows);
    setNotice(`样例导入完成：解析 ${result.parsed}，新增 ${result.inserted}`);
  }

  async function handleFileImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !selectedProject) {
      return;
    }

    const result = await uploadImport(selectedProject.id, file);
    setNotice(`文件导入完成：解析 ${result.parsed}，新增 ${result.inserted}`);
  }

  async function handleRunAnalysis() {
    if (!selectedProject) {
      return;
    }

    const response = await runAnalysis({
      projectId: selectedProject.id,
      versionWindowId: selectedProject.versionWindows[0]?.id
    });
    setRunId(response.runId);
    setRunStatus(`${response.mode} · ${response.runId}`);
    setNotice("分析任务已启动");
  }

  async function handleSearch() {
    if (!selectedProject) {
      return;
    }

    const payload = await searchComments({ projectId: selectedProject.id, q: searchQuery });
    setSearchResults(payload.comments);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Activity size={28} />
          <div>
            <strong>GamePulse</strong>
            <span>本地舆情工作台</span>
          </div>
        </div>

        <nav className="nav">
          <a href="#project"><Settings2 size={18} />项目</a>
          <a href="#import"><UploadCloud size={18} />导入</a>
          <a href="#analysis"><Play size={18} />分析</a>
          <a href="#reports"><FileText size={18} />报告</a>
          <a href="#evidence"><Search size={18} />证据</a>
        </nav>

        <div className="source-list">
          <span>平台入口</span>
          {PLATFORMS.filter((platform) => platform !== "import").map((platform) => (
            <em key={platform}>{PLATFORM_LABELS[platform]}</em>
          ))}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p>运营+制作团队</p>
            <h1>版本舆情、BUG 聚类和流失风险</h1>
          </div>
          <StatusPill state={apiState} />
        </header>

        {notice ? <div className="notice">{notice}</div> : null}

        <div className="layout">
          <section className="primary">
            <ProjectSection projects={projects} selectedProjectId={selectedProjectId} onSelect={setSelectedProjectId} onCreate={handleCreateProject} />

            <section className="panel" id="import">
              <PanelTitle icon={<Database size={18} />} title="数据导入" meta="CSV/JSON、大文件导入、当前页脚本采集兜底" />
              <div className="action-row">
                <button type="button" onClick={handleSampleImport} disabled={!selectedProject}>
                  <UploadCloud size={17} />导入样例
                </button>
                <label className="file-button">
                  <UploadCloud size={17} />上传 CSV/JSON
                  <input type="file" accept=".csv,.json" onChange={handleFileImport} />
                </label>
              </div>
              <p className="hint">油猴脚本提交到 <code>/api/ingest/batch</code>；作者字段默认脱敏，原文和来源链接保留用于证据回溯。</p>
            </section>

            <section className="panel" id="analysis">
              <PanelTitle icon={<Play size={18} />} title="分析任务" meta="分块分类、SQL 聚合、代表样本总结" />
              <div className="action-row">
                <button type="button" onClick={handleRunAnalysis} disabled={!selectedProject}>
                  <Play size={17} />启动版本分析
                </button>
                <button type="button" onClick={() => selectedProject && void refreshReports(selectedProject.id)} disabled={!selectedProject}>
                  <RefreshCcw size={17} />刷新报告
                </button>
              </div>
              <div className="run-status">{runStatus || "等待任务"}</div>
            </section>

            <ReportsSection reports={reports} activeReportId={activeReport?.id ?? ""} onSelect={setActiveReportId} />
          </section>

          <aside className="secondary">
            <ReportPreview report={activeReport} />
            <EvidenceSearch query={searchQuery} setQuery={setSearchQuery} results={searchResults} onSearch={handleSearch} disabled={!selectedProject} />
          </aside>
        </div>
      </main>
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
  const metrics = useMemo(() => {
    return {
      versions: selectedProject?.versionWindows.length ?? 0,
      aliases: selectedProject?.entityAliases.length ?? 0,
      sources: selectedProject?.sourceLinks.length ?? 0
    };
  }, [selectedProject]);

  return (
    <section className="panel" id="project">
      <PanelTitle icon={<Settings2 size={18} />} title="项目配置" meta="版本窗口、Steam AppID、Reddit 关键词、角色词表" />
      <div className="project-grid">
        <form onSubmit={props.onCreate} className="project-form">
          <label>
            游戏名称
            <input name="name" placeholder="例如：星穹铁道" required />
          </label>
          <label>
            版本名称
            <input name="versionName" placeholder="例如：2.7 更新" />
          </label>
          <label>
            发布时间
            <input name="releasedAt" type="date" />
          </label>
          <label>
            Steam AppID
            <input name="steamAppId" placeholder="可选" />
          </label>
          <label>
            Reddit 子版
            <input name="redditSubreddits" placeholder="多个用逗号分隔" />
          </label>
          <label>
            Reddit 关键词
            <input name="redditKeywords" placeholder="多个用逗号分隔" />
          </label>
          <label className="wide">
            角色词表
            <textarea name="aliases" rows={4} placeholder="镜流: jl, 师傅&#10;卡芙卡: kafka" />
          </label>
          <label className="wide">
            说明
            <textarea name="description" rows={3} placeholder="项目背景、版本目标或观察重点" />
          </label>
          <button type="submit">
            <ShieldCheck size={17} />创建项目
          </button>
        </form>

        <div className="project-list">
          <select value={props.selectedProjectId} onChange={(event) => props.onSelect(event.target.value)}>
            <option value="">选择项目</option>
            {props.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <div className="metric-grid">
            <Metric label="版本窗口" value={metrics.versions} />
            <Metric label="实体词表" value={metrics.aliases} />
            <Metric label="来源链接" value={metrics.sources} />
          </div>
          {selectedProject ? <p className="hint">当前项目：{selectedProject.name}。版本前后窗口默认各 14 天。</p> : <p className="hint">先创建或选择项目，再导入评论和启动分析。</p>}
        </div>
      </div>
    </section>
  );
}

function ReportsSection(props: { reports: Report[]; activeReportId: string; onSelect: (reportId: string) => void }) {
  return (
    <section className="panel" id="reports">
      <PanelTitle icon={<FileText size={18} />} title="报告列表" meta="中文报告、原文证据、行动建议" />
      <div className="report-list">
        {props.reports.length === 0 ? (
          <p className="empty">暂无报告。</p>
        ) : (
          props.reports.map((report) => (
            <button
              type="button"
              className={report.id === props.activeReportId ? "report-row active" : "report-row"}
              key={report.id}
              onClick={() => props.onSelect(report.id)}
            >
              <span>{report.title}</span>
              <em>{new Date(report.createdAt).toLocaleString()}</em>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function ReportPreview({ report }: { report?: Report }) {
  if (!report) {
    return (
      <section className="panel report-preview">
        <PanelTitle icon={<FileText size={18} />} title="报告预览" meta="等待分析输出" />
        <p className="empty">启动分析后，这里会显示报告正文。</p>
      </section>
    );
  }

  return (
    <section className="panel report-preview">
      <PanelTitle icon={<Flame size={18} />} title={report.title} meta={`风险指数 ${report.summary.riskIndex}/100`} />
      <div className="kpi-strip">
        <Metric label="评论" value={report.summary.totalComments} />
        <Metric label="负面" value={`${Math.round(report.summary.negativeRate * 100)}%`} />
        <Metric label="BUG" value={`${Math.round(report.summary.bugRate * 100)}%`} />
      </div>
      <article className="markdown">{report.markdown}</article>
    </section>
  );
}

function EvidenceSearch(props: {
  query: string;
  setQuery: (query: string) => void;
  results: Awaited<ReturnType<typeof searchComments>>["comments"];
  onSearch: () => void;
  disabled: boolean;
}) {
  return (
    <section className="panel" id="evidence">
      <PanelTitle icon={<Search size={18} />} title="证据搜索" meta="按关键词回看原文和标签" />
      <div className="search-line">
        <input value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="闪退、退款、角色名..." />
        <button type="button" onClick={props.onSearch} disabled={props.disabled}>
          <Search size={17} />搜索
        </button>
      </div>
      <div className="evidence-list">
        {props.results.map((item) => (
          <div className="evidence-row" key={item.id}>
            <div>
              <strong>{PLATFORM_LABELS[item.platform]}</strong>
              {item.label?.isBug ? <Bug size={15} /> : null}
              {item.label?.isChurnRisk ? <Flame size={15} /> : null}
            </div>
            <p>{item.body}</p>
            <span>{item.label ? `${item.label.sentiment} · ${item.label.topic} · 严重度 ${item.label.severity}` : "未分析"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PanelTitle({ icon, title, meta }: { icon: React.ReactNode; title: string; meta: string }) {
  return (
    <div className="panel-title">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      <span>{meta}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusPill({ state }: { state: ApiState }) {
  return (
    <div className={`status ${state}`}>
      <span />
      {state === "online" ? "API online" : state === "offline" ? "API offline" : "checking"}
    </div>
  );
}

function splitList(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

