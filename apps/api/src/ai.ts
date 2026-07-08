import { stableHash } from "@gamepulse/shared";
import { loadConfig } from "./config.js";
import { readCachedJson, readCachedText, writeCachedJson, writeCachedText } from "./modelCache.js";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface ModelGateway {
  complete(messages: ChatMessage[]): Promise<string | undefined>;
  embed(text: string): Promise<number[] | undefined>;
}

export function createModelGateway(): ModelGateway {
  const config = loadConfig();

  if (config.modelProvider === "openai") {
    return new OpenAICompatibleGateway();
  }

  if (config.modelProvider === "ollama") {
    return new OllamaGateway();
  }

  return {
    async complete() {
      return undefined;
    },
    async embed() {
      return undefined;
    }
  };
}

class OpenAICompatibleGateway implements ModelGateway {
  private readonly config = loadConfig();

  async complete(messages: ChatMessage[]): Promise<string | undefined> {
    const model = this.config.openaiChatModel;
    if (!this.config.openaiApiKey || !model) {
      return undefined;
    }

    const inputHash = stableHash(JSON.stringify(messages));
    const cached = await readCachedText("openai", model, "chat", inputHash);
    if (cached) {
      return cached;
    }

    const response = await fetch(`${this.config.openaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.openaiApiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (content) {
      await writeCachedText("openai", model, "chat", inputHash, content);
    }
    return content;
  }

  async embed(text: string): Promise<number[] | undefined> {
    const model = this.config.openaiEmbeddingModel;
    if (!this.config.openaiApiKey || !model) {
      return undefined;
    }

    const inputHash = stableHash(text);
    const cached = await readCachedJson<number[]>("openai", model, "embedding", inputHash);
    if (cached) {
      return cached;
    }

    const response = await fetch(`${this.config.openaiBaseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.openaiApiKey}`
      },
      body: JSON.stringify({
        model,
        input: text
      })
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    const embedding = payload.data?.[0]?.embedding;
    if (embedding) {
      await writeCachedJson("openai", model, "embedding", inputHash, embedding);
    }
    return embedding;
  }
}

class OllamaGateway implements ModelGateway {
  private readonly config = loadConfig();

  async complete(messages: ChatMessage[]): Promise<string | undefined> {
    const inputHash = stableHash(JSON.stringify(messages));
    const cached = await readCachedText("ollama", this.config.ollamaChatModel, "chat", inputHash);
    if (cached) {
      return cached;
    }

    const prompt = messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
    const response = await fetch(`${this.config.ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.config.ollamaChatModel,
        prompt,
        stream: false
      })
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as { response?: string };
    if (payload.response) {
      await writeCachedText("ollama", this.config.ollamaChatModel, "chat", inputHash, payload.response);
    }
    return payload.response;
  }

  async embed(text: string): Promise<number[] | undefined> {
    const inputHash = stableHash(text);
    const cached = await readCachedJson<number[]>("ollama", this.config.ollamaEmbeddingModel, "embedding", inputHash);
    if (cached) {
      return cached;
    }

    const response = await fetch(`${this.config.ollamaBaseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.config.ollamaEmbeddingModel,
        prompt: text
      })
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as { embedding?: number[] };
    if (payload.embedding) {
      await writeCachedJson("ollama", this.config.ollamaEmbeddingModel, "embedding", inputHash, payload.embedding);
    }
    return payload.embedding;
  }
}
