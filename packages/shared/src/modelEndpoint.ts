const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function normalizeModelBaseUrl(value: string): string {
  const url = parseModelBaseUrl(value);
  url.hash = "";
  return url.href.replace(/\/+$/, "");
}

export function assertSecureModelBaseUrl(value: string): string {
  const url = parseModelBaseUrl(value);
  const secure = url.protocol === "https:";
  const localHttp = url.protocol === "http:" && loopbackHosts.has(url.hostname);
  if (!secure && !localHttp) {
    throw new Error("Model base URL must use HTTPS or a loopback address");
  }
  url.hash = "";
  return url.href.replace(/\/+$/, "");
}

function parseModelBaseUrl(value: string): URL {
  const normalized = value.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Model base URL is invalid");
  }
  if (url.username || url.password) {
    throw new Error("Model base URL must not contain credentials");
  }
  return url;
}
