export type InferenceStatus = "pending" | "success" | "error" | "cancelled";

export interface InferenceLogPayload {
  log_id: string;
  conversation_id?: string | null;
  message_id?: string | null;
  session_id?: string | null;
  provider: string;
  model: string;
  status: InferenceStatus;
  latency_ms?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  input_preview?: string | null;
  output_preview?: string | null;
  request_started_at: string;
  request_completed_at?: string | null;
  raw_metadata?: Record<string, unknown>;
}

export interface InferenceSDKOptions {
  ingestionUrl: string;
  previewMaxChars?: number;
  maxRetries?: number;
  timeoutMs?: number;
  onDeliveryError?: (error: Error, payload: InferenceLogPayload) => void;
}

export interface LLMUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface LLMResult<T> {
  data: T;
  usage?: LLMUsage;
  model: string;
  provider: string;
}
