import { useEffect, useState } from "react";
import { Activity, Brain, Database, FileText, Globe2, Loader2, Save, Search, Settings2, UploadCloud } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Textarea, cn } from "@gamepulse/ui";
import type { CollectorResult, DatabaseStats, RagQueryResult } from "./types.js";

const stages = [
  {
    title: "采集当前可见文本",
    body: "用 Electron 内置 Chromium 打开公开社区页面，抽取当前可见评论、帖子标题和上下文。"
  },
  {
    title: "本地证据入库",
    body: "把采集结果写入 SQLite，保留平台、来源链接、采集时间和原文，便于后续回溯。"
  },
  {
    title: "检索增强分析",
    body: "基于 SQLite FTS5 找到相关证据，生成带引用的模型提示词，降低幻觉风险。"
  }
];

const navItems = [
  { href: "#collector", label: "采集", icon: Globe2 },
  { href: "#rag", label: "RAG", icon: Brain },
  { href: "#database", label: "SQLite", icon: Database },
  { href: "#runtime", label: "运行时", icon: Settings2 },
  { href: "#workflow", label: "流程", icon: FileText }
];

export function App() {
  const [collectorUrl, setCollectorUrl] = useState("https://store.steampowered.com/appreviews/730?json=0");
  const [collectorResult, setCollectorResult] = useState<CollectorResult | undefined>();
  const [collectorError, setCollectorError] = useState("");
  const [isCollecting, setIsCollecting] = useState(false);
  const [databaseStats, setDatabaseStats] = useState<DatabaseStats | undefined>();
  const [saveStatus, setSaveStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [ragQuery, setRagQuery] = useState("玩家主要在抱怨什么问题？");
  const [ragResult, setRagResult] = useState<RagQueryResult | undefined>();
  const [ragError, setRagError] = useState("");
  const [isRunningRag, setIsRunningRag] = useState(false);

  useEffect(() => {
    void refreshDatabaseStats();
  }, []);

  async function refreshDatabaseStats() {
    const stats = await window.gamepulse.database.getStats();
    setDatabaseStats(stats);
  }

  async function handleCollect() {
    setIsCollecting(true);
    setCollectorError("");
    setSaveStatus("");

    try {
      const result = await window.gamepulse.collector.captureVisible(collectorUrl);
      setCollectorResult(result);
    } catch (error) {
      setCollectorResult(undefined);
      setCollectorError(error instanceof Error ? error.message : String(error));
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
      setSaveStatus(`已保存 ${result.inserted}/${result.accepted} 条新数据，本地总量 ${result.totalItems} 条。`);
      await refreshDatabaseStats();
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRunRag() {
    setIsRunningRag(true);
    setRagError("");

    try {
      const result = await window.gamepulse.rag.query({ query: ragQuery, limit: 8 });
      setRagResult(result);
    } catch (error) {
      setRagResult(undefined);
      setRagError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunningRag(false);
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
              <span className="mt-1 block text-xs text-primary-foreground/62">Desktop RC</span>
            </div>
          </div>

          <nav className="grid gap-1" aria-label="桌面端导航">
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
            <span className="text-xs font-semibold uppercase tracking-normal text-primary-foreground/56">本机运行时</span>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge className="border-white/10 bg-white/8 text-primary-foreground" variant="outline">{window.gamepulse.platform}</Badge>
              <Badge className="border-white/10 bg-white/8 text-primary-foreground" variant="outline">Electron {window.gamepulse.versions.electron ?? "unknown"}</Badge>
            </div>
          </div>
        </aside>

        <main className="min-w-0 px-8 py-8 max-sm:px-4" id="workspace">
          <header className="flex items-start justify-between gap-6 max-md:flex-col">
            <div className="max-w-4xl">
              <p className="mb-3 text-sm font-semibold text-muted-foreground">Electron Chromium + SQLite RAG</p>
              <h1 className="text-balance text-4xl font-semibold leading-tight text-foreground max-sm:text-3xl">
                本地采集公开页面文本，沉淀证据库，并生成可追溯的分析提示词。
              </h1>
            </div>
            <Badge className="h-9 gap-2 px-3" variant="secondary">
              <span className="size-2 rounded-full bg-current" />
              {window.gamepulse.platform}
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
                isRunningRag={isRunningRag}
                onRun={handleRunRag}
                ragError={ragError}
                ragQuery={ragQuery}
                ragResult={ragResult}
                setRagQuery={setRagQuery}
              />
            </section>

            <aside className="grid h-fit gap-6">
              <StatsSection databaseStats={databaseStats} />
              <RuntimeSection />
              <WorkflowSection />
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
      <SectionHeader icon={<Globe2 className="size-4" />} meta="无需浏览器插件" title="内置 Chromium 采集" />
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
          <EmptyState icon={<Globe2 className="size-5" />} text="输入公开社区页面 URL，采集当前可见文本。" />
        )}
      </CardContent>
    </Card>
  );
}

function RagSection(props: {
  isRunningRag: boolean;
  onRun: () => void;
  ragError: string;
  ragQuery: string;
  ragResult?: RagQueryResult;
  setRagQuery: (query: string) => void;
}) {
  return (
    <Card id="rag">
      <SectionHeader icon={<Brain className="size-4" />} meta="SQLite FTS5 检索 + grounded prompt" title="本地 RAG" />
      <CardContent>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 max-sm:grid-cols-1">
          <Textarea onChange={(event) => props.setRagQuery(event.target.value)} rows={3} value={props.ragQuery} />
          <Button className="h-auto min-h-10" disabled={props.isRunningRag || !props.ragQuery.trim()} onClick={props.onRun} type="button">
            {props.isRunningRag ? <Loader2 className="size-4 animate-spin" /> : <Brain className="size-4" />}
            询问本地 RAG
          </Button>
        </div>
        {props.ragError ? <AlertLine text={props.ragError} /> : null}
        {props.ragResult ? <RagPreview result={props.ragResult} /> : <EmptyState icon={<Brain className="size-5" />} text="先保存采集结果，再提问以检索证据并生成提示词。" />}
      </CardContent>
    </Card>
  );
}

function StatsSection({ databaseStats }: { databaseStats?: DatabaseStats }) {
  return (
    <Card id="database">
      <SectionHeader icon={<Database className="size-4" />} meta={databaseStats?.databasePath ?? "初始化本地数据库"} title="SQLite 证据库" />
      <CardContent className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        <Metric label="项目" value={databaseStats?.projectCount ?? 0} />
        <Metric label="原文" value={databaseStats?.rawItemCount ?? 0} />
        <Metric label="最近采集" value={databaseStats?.latestCollectedAt ? new Date(databaseStats.latestCollectedAt).toLocaleString() : "暂无"} />
      </CardContent>
    </Card>
  );
}

function RuntimeSection() {
  return (
    <Card id="runtime">
      <SectionHeader icon={<Settings2 className="size-4" />} meta="TypeScript 7.0 RC ready" title="运行时" />
      <CardContent className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        <Metric label="Electron" value={window.gamepulse.versions.electron ?? "unknown"} />
        <Metric label="Chromium" value={window.gamepulse.versions.chrome ?? "unknown"} />
        <Metric label="Node" value={window.gamepulse.versions.node ?? "unknown"} />
      </CardContent>
    </Card>
  );
}

function WorkflowSection() {
  return (
    <Card id="workflow">
      <SectionHeader icon={<FileText className="size-4" />} meta="测试调试路径" title="工作流" />
      <CardContent className="grid gap-3">
        {stages.map((stage, index) => (
          <article className="grid gap-2 rounded-md border border-border bg-background p-4" key={stage.title}>
            <span className="text-xs font-semibold text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
            <h3 className="m-0 text-base font-semibold text-foreground">{stage.title}</h3>
            <p className="m-0 text-sm leading-6 text-muted-foreground">{stage.body}</p>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}

function CollectorPreview({ result }: { result: CollectorResult }) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        <Metric label="平台" value={result.platform} />
        <Metric label="可见文本" value={result.itemCount} />
        <Metric label="页面标题" value={result.title || "未命名"} />
      </div>
      <div className="grid max-h-[460px] gap-3 overflow-auto pr-1">
        {result.items.slice(0, 12).map((item, index) => (
          <article className="rounded-md border border-border bg-background p-4" key={`${item.body}-${index}`}>
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
              <span>{item.platform}</span>
              <span className="truncate">{item.selector}</span>
            </div>
            <p className="m-0 text-sm leading-6 text-foreground">{item.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function RagPreview({ result }: { result: RagQueryResult }) {
  return (
    <div className="mt-4 grid gap-4">
      <article className="rounded-md bg-accent/45 p-4">
        <span className="text-xs font-semibold text-accent-foreground">Grounded draft</span>
        <p className="mt-2 text-sm leading-6 text-foreground">{result.answer}</p>
      </article>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)] gap-4 max-lg:grid-cols-1">
        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">证据</h3>
          <div className="grid max-h-[440px] gap-3 overflow-auto pr-1">
            {result.evidence.map((item, index) => (
              <article className="rounded-md border border-border bg-background p-4" key={item.id}>
                <span className="text-xs font-semibold text-muted-foreground">[E{index + 1}] {item.platform}</span>
                <p className="mt-2 text-sm leading-6 text-foreground">{item.excerpt}</p>
                <em className="mt-2 block truncate text-xs not-italic text-muted-foreground">
                  {item.sourceTitle || item.sourceUrl || new Date(item.collectedAt).toLocaleString()}
                </em>
              </article>
            ))}
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">模型提示词</h3>
          <Textarea className="min-h-80 font-mono text-xs leading-6" readOnly rows={14} value={result.prompt} />
        </section>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, meta }: { icon: React.ReactNode; title: string; meta: string }) {
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
      <strong className="mt-1 block truncate text-xl font-semibold text-foreground">{value}</strong>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
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