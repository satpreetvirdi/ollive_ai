import type { LLMResult } from "@olliveai/inference-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ChatMessage, LLMProvider } from "./types.js";

function splitMessages(messages: ChatMessage[]) {
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content);
  const chatMessages = messages.filter((m) => m.role !== "system");
  return {
    systemInstruction: systemParts.length ? systemParts.join("\n") : undefined,
    chatMessages,
  };
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  readonly model: string;
  private client: GoogleGenerativeAI;

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async chat(
    messages: ChatMessage[],
    options?: { model?: string; signal?: AbortSignal }
  ): Promise<LLMResult<string>> {
    const modelName = options?.model ?? this.model;
    const { systemInstruction, chatMessages } = splitMessages(messages);
    const genModel = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction,
    });

    if (chatMessages.length === 0) {
      return { data: "", model: modelName, provider: this.name };
    }

    const last = chatMessages[chatMessages.length - 1];
    const history = chatMessages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const chat = genModel.startChat({ history });
    const result = await chat.sendMessage(last.content);
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const text = result.response.text();
    const usage = result.response.usageMetadata;
    return {
      data: text,
      model: modelName,
      provider: this.name,
      usage: {
        prompt_tokens: usage?.promptTokenCount,
        completion_tokens: usage?.candidatesTokenCount,
        total_tokens: usage?.totalTokenCount,
      },
    };
  }

  async *stream(
    messages: ChatMessage[],
    options?: { model?: string; signal?: AbortSignal }
  ): AsyncGenerator<string, LLMResult<string>, unknown> {
    const modelName = options?.model ?? this.model;
    const { systemInstruction, chatMessages } = splitMessages(messages);
    const genModel = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction,
    });

    const last = chatMessages[chatMessages.length - 1] ?? {
      role: "user" as const,
      content: "",
    };
    const history = chatMessages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const chat = genModel.startChat({ history });
    const streamResult = await chat.sendMessageStream(last.content);

    let fullContent = "";
    for await (const chunk of streamResult.stream) {
      if (options?.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const delta = chunk.text();
      if (delta) {
        fullContent += delta;
        yield delta;
      }
    }

    const response = await streamResult.response;
    const usage = response.usageMetadata;
    return {
      data: fullContent,
      model: modelName,
      provider: this.name,
      usage: {
        prompt_tokens: usage?.promptTokenCount,
        completion_tokens: usage?.candidatesTokenCount,
        total_tokens: usage?.totalTokenCount,
      },
    };
  }
}

export function createGeminiProvider(
  apiKey: string,
  model: string
): GeminiProvider {
  return new GeminiProvider(apiKey, model);
}
