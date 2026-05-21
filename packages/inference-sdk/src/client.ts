import type { InferenceLogPayload, InferenceSDKOptions } from "./types.js";

export class InferenceLogClient {
  private readonly ingestionUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly onDeliveryError?: InferenceSDKOptions["onDeliveryError"];

  constructor(options: InferenceSDKOptions) {
    this.ingestionUrl = options.ingestionUrl.replace(/\/$/, "");
    this.maxRetries = options.maxRetries ?? 2;
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.onDeliveryError = options.onDeliveryError;
  }

  async send(payload: InferenceLogPayload): Promise<void> {
    const url = `${this.ingestionUrl}/v1/inference-logs`;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(`Ingestion failed (${response.status}): ${body}`);
        }
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
        }
      }
    }

    if (lastError) {
      this.onDeliveryError?.(lastError, payload);
      console.warn("[inference-sdk] log delivery failed:", lastError.message);
    }
  }

  /** Fire-and-forget: does not block the caller. */
  sendAsync(payload: InferenceLogPayload): void {
    void this.send(payload);
  }
}
