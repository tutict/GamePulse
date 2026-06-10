import { stableHash } from "@gamepulse/shared";
import { loadConfig } from "./config.js";

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
    if (!this.config.openaiApiKey || !this.config.openaiChatModel) {
      return undefined;
    }

    const response = await fetch(`${this.config.openaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.openaiApiKey}`
      },
      body: JSON.stringify({
        model: this.config.openaiChatModel,
        messages,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return payload.choices?.[0]?.message?.content;
  }

  async embed(text: string): Promise<number[] | undefined> {
    if (!this.config.openaiApiKey || !this.config.openaiEmbeddingModel) {
      return undefined;
    }

    const response = await fetch(`${this.config.openaiBaseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.openaiApiKey}`
      },
      body: JSON.stringify({
        model: this.config.openaiEmbeddingModel,
        input: text
      })
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    return payload.data?.[0]?.embedding;
  }
}

class OllamaGateway implements ModelGateway {
  private readonly config = loadConfig();

  async complete(messages: ChatMessage[]): Promise<string | undefined> {
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
    return payload.response;
  }

  async embed(text: string): Promise<number[] | undefined> {
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
    return payload.embedding;
  }
}

export function embeddingCacheId(provider: string, model: string, input: string): string {
  return stableHash(`${provider}:${model}:${input}`);
}

