import { Activity, Database, FileText, Search, Settings2, UploadCloud } from "lucide-react";

declare global {
  interface Window {
    gamepulse: {
      platform: NodeJS.Platform;
      versions: {
        chrome?: string;
        electron?: string;
        node?: string;
      };
    };
  }
}

const stages = [
  {
    title: "本地数据层",
    body: "下一步把 Postgres 和 Redis 替换为 SQLite、FTS5 和桌面后台任务。"
  },
  {
    title: "桌面桥接",
    body: "内置浏览器采集会替代 userscript，把当前可见评论直接写入本地库。"
  },
  {
    title: "功能等价",
    body: "项目、导入、分析、报告和证据搜索会按现有行为逐步接回桌面 IPC。"
  }
];

export function App() {
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
          <a href="#workspace">
            <Settings2 size={18} />
            Workspace
          </a>
          <a href="#imports">
            <UploadCloud size={18} />
            Imports
          </a>
          <a href="#reports">
            <FileText size={18} />
            Reports
          </a>
          <a href="#evidence">
            <Search size={18} />
            Evidence
          </a>
        </nav>
      </aside>

      <main className="workspace" id="workspace">
        <header className="topbar">
          <div>
            <p>Electron migration foundation</p>
            <h1>GamePulse is now bootstrapped as a desktop workspace.</h1>
          </div>
          <div className="status">
            <span />
            {window.gamepulse.platform}
          </div>
        </header>

        <section className="panel">
          <div className="panel-title">
            <div>
              <Database size={18} />
              <h2>Runtime</h2>
            </div>
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
              <div>
                <h2>{stage.title}</h2>
                <p>{stage.body}</p>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
