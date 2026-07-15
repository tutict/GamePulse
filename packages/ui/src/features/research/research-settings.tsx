import {
  ChevronDown,
  Database,
  Download,
  FlaskConical,
  KeyRound,
  Monitor,
  Moon,
  Palette,
  Save,
  ShieldCheck,
  Sun,
  Upload
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "../../components/badge.js";
import { Button } from "../../components/button.js";
import { Input } from "../../components/input.js";
import type {
  ResearchSettingsInput,
  ResearchSettingsView
} from "./types.js";
import type { ThemePreference } from "../theme/use-theme.js";

export function ResearchSettings(props: {
  settings: ResearchSettingsView;
  onSaveSettings?: (settings: ResearchSettingsInput) => void;
  onImportData?: () => void;
  onExportData?: () => void;
  themePreference: ThemePreference;
  onThemePreferenceChange: (theme: ThemePreference) => void;
}) {
  const [provider, setProvider] = useState(props.settings.provider);
  const [baseUrl, setBaseUrl] = useState(props.settings.baseUrl);
  const [model, setModel] = useState(props.settings.model);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    setProvider(props.settings.provider);
    setBaseUrl(props.settings.baseUrl);
    setModel(props.settings.model);
    setApiKey("");
  }, [
    props.settings.baseUrl,
    props.settings.model,
    props.settings.provider
  ]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedBaseUrl = baseUrl.trim();
    const normalizedModel = model.trim();
    if (!normalizedBaseUrl || !normalizedModel) {
      return;
    }
    props.onSaveSettings?.({
      provider,
      baseUrl: normalizedBaseUrl,
      model: normalizedModel,
      apiKey: apiKey.trim() || undefined
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <h2 className="m-0 text-2xl font-semibold sm:text-3xl">设置</h2>
          <p className="mb-0 mt-2 text-sm text-muted-foreground">
            {props.settings.platform === "windows" ? "Windows" : "Android"} · 本机安全存储
          </p>
        </div>
        <Badge className="gap-1.5" variant={props.settings.credentialsReady ? "secondary" : "outline"}>
          {props.settings.credentialsReady ? (
            <ShieldCheck aria-hidden="true" className="size-3.5" />
          ) : (
            <KeyRound aria-hidden="true" className="size-3.5" />
          )}
          {props.settings.credentialsReady ? "模型已就绪" : "模型未配置"}
        </Badge>
      </header>

      <section className="border-b border-border py-6" aria-labelledby="research-mode-heading">
        <h3 className="m-0 text-base font-semibold" id="research-mode-heading">研究模式</h3>
        <div className="mt-3 flex items-start gap-3 rounded-md border border-border bg-muted/40 p-4">
          <FlaskConical aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <strong className="block text-sm">
              {props.settings.mode === "fixture" ? "固定验证样本" : "公开来源采集"}
            </strong>
            <p className="mb-0 mt-1 text-sm leading-6 text-muted-foreground">
              {props.settings.mode === "fixture"
                ? "当前版本用固定样本验证完整研究、纠正和报告流程，不执行实时网络请求。"
                : "研究会访问已配置的公开来源，并在报告中列出实际覆盖范围。"}
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-border py-6" aria-labelledby="appearance-heading">
        <h3 className="m-0 flex items-center gap-2 text-base font-semibold" id="appearance-heading">
          <Palette aria-hidden="true" className="size-5 text-muted-foreground" />
          外观
        </h3>
        <div
          aria-label="颜色模式"
          className="mt-4 grid grid-cols-3 rounded-md border border-input bg-muted/40 p-1"
          role="radiogroup"
        >
          {([
            { id: "system", label: "跟随系统", icon: Monitor },
            { id: "light", label: "浅色", icon: Sun },
            { id: "dark", label: "深色", icon: Moon }
          ] as const).map((item) => {
            const Icon = item.icon;
            const selected = props.themePreference === item.id;
            return (
              <label
                className={`relative flex min-h-14 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-sm px-2 py-2 text-xs font-semibold transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background ${
                  selected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
                key={item.id}
              >
                <input
                  checked={selected}
                  className="sr-only"
                  name="theme-preference"
                  onChange={() => props.onThemePreferenceChange(item.id)}
                  type="radio"
                  value={item.id}
                />
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="max-w-full truncate">{item.label}</span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="border-b border-border py-6" aria-labelledby="model-settings-heading">
        <h3 className="m-0 text-base font-semibold" id="model-settings-heading">远程模型</h3>
        <form className="mt-4 grid gap-4" onSubmit={handleSubmit}>
          {props.settings.supportsOllama ? (
            <div>
              <span className="mb-2 block text-sm font-semibold">提供方</span>
              <div className="grid grid-cols-2 rounded-md border border-input p-1" role="group" aria-label="模型提供方">
                {(["openai", "ollama"] as const).map((item) => (
                  <button
                    aria-pressed={provider === item}
                    className={`min-h-11 rounded-sm px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      provider === item
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                    key={item}
                    onClick={() => setProvider(item)}
                    type="button"
                  >
                    {item === "openai" ? "OpenAI-compatible" : "Ollama"}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <label className="grid gap-2 text-sm font-semibold" htmlFor="research-model-base-url">
            Base URL
            <Input
              className="h-11 bg-card text-base"
              id="research-model-base-url"
              onChange={(event) => setBaseUrl(event.target.value)}
              value={baseUrl}
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold" htmlFor="research-model-name">
            模型
            <Input
              className="h-11 bg-card text-base"
              id="research-model-name"
              onChange={(event) => setModel(event.target.value)}
              value={model}
            />
          </label>
          {provider === "openai" ? (
            <label className="grid gap-2 text-sm font-semibold" htmlFor="research-model-api-key">
              API Key
              <Input
                autoComplete="off"
                className="h-11 bg-card text-base"
                id="research-model-api-key"
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={props.settings.apiKeyHint ?? "sk-..."}
                type="password"
                value={apiKey}
              />
            </label>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-muted-foreground" role="status">
              {props.settings.message ?? "API Key 不会进入研究导出文件。"}
            </span>
            <Button
              className="h-11 w-full sm:w-auto"
              disabled={props.settings.busy || !baseUrl.trim() || !model.trim()}
              type="submit"
            >
              <Save aria-hidden="true" />
              保存模型设置
            </Button>
          </div>
        </form>
      </section>

      {props.settings.advancedData ? (
        <details className="group border-b border-border py-6">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Database aria-hidden="true" className="size-5 text-muted-foreground" />
            <span className="flex-1">高级数据</span>
            <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button
              className="h-11"
              disabled={!props.settings.advancedData.importEnabled}
              onClick={props.onImportData}
              type="button"
              variant="outline"
            >
              <Upload aria-hidden="true" />
              导入数据或项目包
            </Button>
            <Button
              className="h-11"
              disabled={!props.settings.advancedData.exportEnabled}
              onClick={props.onExportData}
              type="button"
              variant="outline"
            >
              <Download aria-hidden="true" />
              导出旧项目包
            </Button>
          </div>
          {props.settings.advancedData.status ? (
            <p className="mb-0 mt-3 break-words text-sm text-muted-foreground" role="status">
              {props.settings.advancedData.status}
            </p>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}
