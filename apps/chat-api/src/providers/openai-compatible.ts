import type { LLMResult } from "@olliveai/inference-sdk";
import OpenAI from "openai";
import type { ChatMessage, LLMProvider } from "./types.js";

/** OpenAI-compatible chat API (OpenAI, Groq, OpenRouter, etc.). */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly model: string;
  private client: OpenAI;

  constructor(
    providerName: string,
    apiKey: string,
    defaultModel: string,
    baseURL?: string
  ) {
    this.name = providerName;
    this.model = defaultModel;
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async chat(
    messages: ChatMessage[],
    options?: { model?: string; signal?: AbortSignal }
  ): Promise<LLMResult<string>> {
    const model = options?.model ?? this.model;
    const response = await this.client.chat.completions.create(
      {
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      },
      { signal: options?.signal }
    );

    const content = response.choices[0]?.message?.content ?? "";
    return {
      data: content,
      model: response.model,
      provider: this.name,
      usage: {
        prompt_tokens: response.usage?.prompt_tokens,
        completion_tokens: response.usage?.completion_tokens,
        total_tokens: response.usage?.total_tokens,
      },
    };
  }

  async *stream(
    messages: ChatMessage[],
    options?: { model?: string; signal?: AbortSignal }
  ): AsyncGenerator<string, LLMResult<string>, unknown> {
    const model = options?.model ?? this.model;
    const stream = await this.client.chat.completions.create(
      {
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: options?.signal }
    );

    let fullContent = "";
    let usage: LLMResult<string>["usage"];
    let resolvedModel: string = model;

    for await (const chunk of stream) {
      if (chunk.model) resolvedModel = chunk.model;
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullContent += delta;
        yield delta;
      }
      if (chunk.usage) {
        usage = {
          prompt_tokens: chunk.usage.prompt_tokens,
          completion_tokens: chunk.usage.completion_tokens,
          total_tokens: chunk.usage.total_tokens,
        };
      }
    }

    return {
      data: fullContent,
      model: resolvedModel,
      provider: this.name,
      usage,
    };
  }
}
