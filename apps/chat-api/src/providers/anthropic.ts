import Anthropic from "@anthropic-ai/sdk";
import type { LLMResult } from "@olliveai/inference-sdk";
import type { ChatMessage, LLMProvider } from "./types.js";

function toAnthropicMessages(messages: ChatMessage[]) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n");
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  return { system: system || undefined, messages: chatMessages };
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly model: string;
  private client: Anthropic;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat(
    messages: ChatMessage[],
    options?: { model?: string; signal?: AbortSignal }
  ): Promise<LLMResult<string>> {
    const modelName = options?.model ?? this.model;
    const { system, messages: anthropicMessages } = toAnthropicMessages(messages);

    const response = await this.client.messages.create(
      {
        model: modelName,
        max_tokens: 4096,
        system,
        messages: anthropicMessages,
      },
      { signal: options?.signal }
    );

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    return {
      data: text,
      model: modelName,
      provider: this.name,
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  async *stream(
    messages: ChatMessage[],
    options?: { model?: string; signal?: AbortSignal }
  ): AsyncGenerator<string, LLMResult<string>, unknown> {
    const modelName = options?.model ?? this.model;
    const { system, messages: anthropicMessages } = toAnthropicMessages(messages);

    const stream = await this.client.messages.stream(
      {
        model: modelName,
        max_tokens: 4096,
        system,
        messages: anthropicMessages,
      },
      { signal: options?.signal }
    );

    let fullContent = "";
    for await (const event of stream) {
      if (options?.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        fullContent += event.delta.text;
        yield event.delta.text;
      }
    }

    const finalMessage = await stream.finalMessage();
    return {
      data: fullContent,
      model: modelName,
      provider: this.name,
      usage: {
        prompt_tokens: finalMessage.usage.input_tokens,
        completion_tokens: finalMessage.usage.output_tokens,
        total_tokens:
          finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
      },
    };
  }
}

export function createAnthropicProvider(
  apiKey: string,
  model: string
): AnthropicProvider {
  return new AnthropicProvider(apiKey, model);
}
