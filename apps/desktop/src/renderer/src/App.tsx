import { useEffect, useState } from "react";
import { Activity, Brain, Database, FileText, Globe2, Loader2, Save, Search, Settings2, UploadCloud } from "lucide-react";

interface CollectorItem {
  body: string;
  platform: string;
  sourceUrl: string;
  sourceTitle: string;
  selector: string;
}

interface CollectorResult {
  url: string;
  title: string;
  platform: string;
  itemCount: number;
  items: CollectorItem[];
}

interface DatabaseStats {
  databasePath: string;
  projectCount: number;
  rawItemCount: number;
  latestCollectedAt?: string;
}

interface SaveCollectorResult {
  accepted: number;
  inserted: number;
  databasePath: string;
  totalItems: number;
}

interface RagEvidence {
  id: string;
  platform: string;
  sourceUrl?: string;
  sourceTitle?: string;
  body: string;
  excerpt: string;
  collectedAt: string;
  score: number;
}

interface RagQueryResult {
  query: string;
  answer: string;
  prompt: string;
  evidence: RagEvidence[];
  contextCharacterCount: number;
}

declare global {
  interface Window {
    gamepulse: {
      platform: NodeJS.Platform;
      versions: {
        chrome?: string;
        electron?: string;
        node?: string;
      };
      collector: {
        captureVisible(url: string): Promise<CollectorResult>;
      };
      database: {
        getStats(): Promise<DatabaseStats>;
        saveCollectorResult(result: CollectorResult): Promise<SaveCollectorResult>;
      };
      rag: {
        query(input: { query: string; limit?: number }): Promise<RagQueryResult>;
      };
    };
  }
}

const stages = [
  {
    title: "Chromium collection",
    body: "Open public pages with Electron's bundled Chromium and extract visible comments without a browser extension."
  },
  {
    title: "SQLite persistence",
    body: "Captured rows are stored in the desktop SQLite database with FTS5 ready for local search."
  },
  {
    title: "Local RAG",
    body: "Questions retrieve grounded evidence from SQLite and produce a model-ready prompt with citations."
  }
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
      setSaveStatus(`Saved ${result.inserted}/${result.accepted} new rows. Total local rows: ${result.totalItems}.`);
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
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Activity size={28} />
          <div>
            <strong>GamePulse</strong>
            <span>Desktop RC</span>
          </div>
        </div>
        <nav className="nav">
          <a href="#collector"><Globe2 size={18} />Collector</a>
          <a href="#database"><Database size={18} />SQLite</a>
          <a href="#rag"><Brain size={18} />RAG</a>
          <a href="#workspace"><Settings2 size={18} />Workspace</a>
          <a href="#imports"><UploadCloud size={18} />Imports</a>
          <a href="#reports"><FileText size={18} />Reports</a>
          <a href="#evidence"><Search size={18} />Evidence</a>
        </nav>
      </aside>

      <main className="workspace" id="workspace">
        <header className="topbar">
          <div>
            <p>Electron Chromium + SQLite RAG</p>
            <h1>Collect public page text, persist it locally, and retrieve grounded evidence.</h1>
          </div>
          <div className="status"><span />{window.gamepulse.platform}</div>
        </header>

        <section className="panel" id="collector">
          <div className="panel-title">
            <div><Globe2 size={18} /><h2>Bundled Chromium collector</h2></div>
            <span>No browser plugin required</span>
          </div>
          <div className="collector-form">
            <input
              value={collectorUrl}
              onChange={(event) => setCollectorUrl(event.target.value)}
              placeholder="https://store.steampowered.com/appreviews/..."
              spellCheck={false}
            />
            <button type="button" onClick={handleCollect} disabled={isCollecting}>
              {isCollecting ? <Loader2 className="spin" size={17} /> : <Globe2 size={17} />}
              Capture
            </button>
          </div>
          {collectorError ? <div className="error-line">{collectorError}</div> : null}
          {collectorResult ? (
            <>
              <div className="action-row">
                <button type="button" onClick={handleSaveCollectorResult} disabled={isSaving || collectorResult.itemCount === 0}>
                  {isSaving ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
                  Save to SQLite
                </button>
                {saveStatus ? <span>{saveStatus}</span> : null}
              </div>
              <CollectorPreview result={collectorResult} />
            </>
          ) : (
            <EmptyCollectorState />
          )}
        </section>

        <section className="panel" id="rag">
          <div className="panel-title">
            <div><Brain size={18} /><h2>Local RAG</h2></div>
            <span>SQLite FTS5 retrieval + grounded prompt</span>
          </div>
          <div className="rag-form">
            <textarea value={ragQuery} onChange={(event) => setRagQuery(event.target.value)} rows={3} />
            <button type="button" onClick={handleRunRag} disabled={isRunningRag || !ragQuery.trim()}>
              {isRunningRag ? <Loader2 className="spin" size={17} /> : <Brain size={17} />}
              Ask local RAG
            </button>
          </div>
          {ragError ? <div className="error-line">{ragError}</div> : null}
          {ragResult ? <RagPreview result={ragResult} /> : <EmptyRagState />}
        </section>

        <section className="panel" id="database">
          <div className="panel-title">
            <div><Database size={18} /><h2>SQLite store</h2></div>
            <span>{databaseStats?.databasePath ?? "Initializing local database"}</span>
          </div>
          <div className="runtime-grid">
            <Metric label="Projects" value={String(databaseStats?.projectCount ?? 0)} />
            <Metric label="Raw rows" value={String(databaseStats?.rawItemCount ?? 0)} />
            <Metric label="Latest capture" value={databaseStats?.latestCollectedAt ? new Date(databaseStats.latestCollectedAt).toLocaleString() : "none"} />
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <div><Database size={18} /><h2>Runtime</h2></div>
            <span>TypeScript 7.0 RC ready</span>
          </div>
          <div className="runtime-grid">
            <Metric label="Electron" value={window.gamepulse.versions.electron ?? "unknown"} />
            <Metric label="Chromium" value={window.gamepulse.versions.chrome ?? "unknown"} />
            <Metric label="Node" value={window.gamepulse.versions.node ?? "unknown"} />
          </div>
        </section>

        <section className="timeline">
          {stages.map((stage, index) => (
            <article key={stage.title} className="step">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><h2>{stage.title}</h2><p>{stage.body}</p></div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

function CollectorPreview({ result }: { result: CollectorResult }) {
  return (
    <div className="collector-preview">
      <div className="collector-summary">
        <Metric label="Platform" value={result.platform} />
        <Metric label="Visible rows" value={String(result.itemCount)} />
        <Metric label="Page title" value={result.title || "untitled"} />
      </div>
      <div className="collector-list">
        {result.items.slice(0, 12).map((item, index) => (
          <article key={`${item.body}-${index}`} className="collector-row">
            <span>{item.platform}</span>
            <p>{item.body}</p>
            <em>{item.selector}</em>
          </article>
        ))}
      </div>
    </div>
  );
}

function RagPreview({ result }: { result: RagQueryResult }) {
  return (
    <div className="rag-preview">
      <article className="rag-answer">
        <span>Grounded draft</span>
        <p>{result.answer}</p>
      </article>
      <div className="rag-grid">
        <section>
          <h3>Evidence</h3>
          <div className="rag-evidence-list">
            {result.evidence.map((item, index) => (
              <article key={item.id} className="rag-evidence-row">
                <span>[E{index + 1}] {item.platform}</span>
                <p>{item.excerpt}</p>
                <em>{item.sourceTitle || item.sourceUrl || new Date(item.collectedAt).toLocaleString()}</em>
              </article>
            ))}
          </div>
        </section>
        <section>
          <h3>Model prompt</h3>
          <textarea readOnly value={result.prompt} rows={14} />
        </section>
      </div>
    </div>
  );
}

function EmptyCollectorState() {
  return (
    <div className="empty-state">
      <Globe2 size={20} />
      <span>Enter a public community page URL and capture visible text with Electron's bundled Chromium.</span>
    </div>
  );
}

function EmptyRagState() {
  return (
    <div className="empty-state">
      <Brain size={20} />
      <span>Save captured rows to SQLite, then ask a question to retrieve grounded evidence.</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}
