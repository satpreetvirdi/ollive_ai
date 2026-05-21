import { randomUUID } from "node:crypto";
import { InferenceLogClient } from "./client.js";
import { truncatePreview } from "./redact.js";
import type {
  InferenceLogPayload,
  InferenceSDKOptions,
  InferenceStatus,
  LLMResult,
} from "./types.js";

export interface WrapContext {
  conversationId?: string | null;
  messageId?: string | null;
  sessionId?: string | null;
  inputPreview?: string;
  provider: string;
  model: string;
  rawMetadata?: Record<string, unknown>;
}

export class InferenceLogger {
  private readonly client: InferenceLogClient;
  private readonly previewMaxChars: number;

  constructor(options: InferenceSDKOptions) {
    this.client = new InferenceLogClient(options);
    this.previewMaxChars = options.previewMaxChars ?? 500;
  }

  private buildPayload(
    partial: Omit<InferenceLogPayload, "log_id"> & { log_id?: string }
  ): InferenceLogPayload {
    return {
      log_id: partial.log_id ?? randomUUID(),
      ...partial,
    } as InferenceLogPayload;
  }

  logPending(ctx: WrapContext): string {
    const logId = randomUUID();
    const payload = this.buildPayload({
      log_id: logId,
      conversation_id: ctx.conversationId,
      message_id: ctx.messageId,
      session_id: ctx.sessionId,
      provider: ctx.provider,
      model: ctx.model,
      status: "pending",
      input_preview: ctx.inputPreview
        ? truncatePreview(ctx.inputPreview, this.previewMaxChars)
        : null,
      request_started_at: new Date().toISOString(),
      raw_metadata: ctx.rawMetadata ?? {},
    });
    this.client.sendAsync(payload);
    return logId;
  }

  logComplete(
    logId: string,
    ctx: WrapContext,
    status: InferenceStatus,
    opts: {
      outputPreview?: string;
      latencyMs: number;
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      errorCode?: string;
      errorMessage?: string;
      startedAt: Date;
    }
  ): void {
    const payload = this.buildPayload({
      log_id: logId,
      conversation_id: ctx.conversationId,
      message_id: ctx.messageId,
      session_id: ctx.sessionId,
      provider: ctx.provider,
      model: ctx.model,
      status,
      latency_ms: opts.latencyMs,
      prompt_tokens: opts.promptTokens ?? null,
      completion_tokens: opts.completionTokens ?? null,
      total_tokens: opts.totalTokens ?? null,
      error_code: opts.errorCode ?? null,
      error_message: opts.errorMessage ?? null,
      input_preview: ctx.inputPreview
        ? truncatePreview(ctx.inputPreview, this.previewMaxChars)
        : null,
      output_preview: opts.outputPreview
        ? truncatePreview(opts.outputPreview, this.previewMaxChars)
        : null,
      request_started_at: opts.startedAt.toISOString(),
      request_completed_at: new Date().toISOString(),
      raw_metadata: ctx.rawMetadata ?? {},
    });
    this.client.sendAsync(payload);
  }

  /**
   * Wrap an async LLM call: logs pending, then success/error/cancelled.
   */
  async wrap<T>(
    ctx: WrapContext,
    fn: () => Promise<LLMResult<T>>,
    signal?: AbortSignal
  ): Promise<T> {
    const startedAt = new Date();
    const logId = this.logPending(ctx);

    if (signal?.aborted) {
      this.logComplete(logId, ctx, "cancelled", {
        latencyMs: Date.now() - startedAt.getTime(),
        startedAt,
        errorCode: "aborted",
        errorMessage: "Request aborted before LLM call",
      });
      throw new DOMException("Aborted", "AbortError");
    }

    try {
      const result = await fn();
      const outputStr =
        typeof result.data === "string"
          ? result.data
          : JSON.stringify(result.data);

      this.logComplete(logId, ctx, "success", {
        outputPreview: outputStr,
        latencyMs: Date.now() - startedAt.getTime(),
        promptTokens: result.usage?.prompt_tokens,
        completionTokens: result.usage?.completion_tokens,
        totalTokens: result.usage?.total_tokens,
        startedAt,
      });

      return result.data;
    } catch (err) {
      const isAbort =
        (err instanceof Error && err.name === "AbortError") ||
        (err instanceof DOMException && err.name === "AbortError");

      this.logComplete(
        logId,
        ctx,
        isAbort ? "cancelled" : "error",
        {
          latencyMs: Date.now() - startedAt.getTime(),
          startedAt,
          errorCode: isAbort ? "aborted" : "llm_error",
          errorMessage: err instanceof Error ? err.message : String(err),
        }
      );
      throw err;
    }
  }
}
