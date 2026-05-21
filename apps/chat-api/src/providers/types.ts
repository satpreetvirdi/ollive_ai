import type { LLMResult } from "@olliveai/inference-sdk";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  chat(
    messages: ChatMessage[],
    options?: { model?: string; signal?: AbortSignal }
  ): Promise<LLMResult<string>>;
  stream?(
    messages: ChatMessage[],
    options?: { model?: string; signal?: AbortSignal }
  ): AsyncGenerator<string, LLMResult<string>, unknown>;
}
