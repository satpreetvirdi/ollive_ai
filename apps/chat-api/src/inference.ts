import { InferenceLogger } from "@olliveai/inference-sdk";

export const inferenceLogger = new InferenceLogger({
  ingestionUrl: process.env.INGESTION_URL ?? "http://localhost:8001",
  previewMaxChars: Number(process.env.PREVIEW_MAX_CHARS ?? 500),
  onDeliveryError: (err) => {
    console.warn("[inference-sdk]", err.message);
  },
});
