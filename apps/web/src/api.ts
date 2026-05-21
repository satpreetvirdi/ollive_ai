// "" = same-origin /api (K8s nginx proxy). Dev with no env uses Vite proxy.
const envApi = import.meta.env.VITE_API_URL as string | undefined;
const API_BASE =
  envApi === ""
    ? ""
    : envApi
      ? envApi
      : import.meta.env.DEV
        ? ""
        : "http://localhost:3001";

export interface Conversation {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export interface MetricsSummary {
  total_requests: number;
  success_count: number;
  error_count: number;
  cancelled_count: number;
  avg_latency_ms: number | null;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  total_tokens: number;
  requests_per_minute: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function listConversations(): Promise<Conversation[]> {
  const data = await request<{ items: Conversation[] }>("/api/conversations");
  return data.items;
}

export async function createConversation(): Promise<Conversation> {
  return request<Conversation>("/api/conversations", { method: "POST" });
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const data = await request<{ items: Message[] }>(
    `/api/conversations/${conversationId}/messages`
  );
  return data.items;
}

export async function sendMessage(
  conversationId: string,
  message: string,
  stream = true,
  signal?: AbortSignal
): Promise<{ user_message: Message; assistant_message: Message }> {
  return request(`/api/conversations/${conversationId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, stream: false }),
    signal,
  });
}

export interface ProviderInfo {
  id: string;
  label: string;
  defaultModel: string;
  configured: boolean;
}

export async function listProviders(): Promise<ProviderInfo[]> {
  const data = await request<{ items: ProviderInfo[] }>("/api/providers");
  return data.items;
}

export async function sendMessageStream(
  conversationId: string,
  message: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  options?: { provider?: string; model?: string }
): Promise<Message | null> {
  const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      stream: true,
      provider: options?.provider,
      model: options?.model,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let assistantMessage: Message | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = JSON.parse(line.slice(6)) as {
        type: string;
        content?: string;
        message?: Message;
      };
      if (payload.type === "chunk" && payload.content) {
        onChunk(payload.content);
      }
      if (payload.type === "done" && payload.message) {
        assistantMessage = payload.message;
      }
    }
  }

  return assistantMessage;
}

export async function cancelConversation(conversationId: string): Promise<void> {
  await request(`/api/conversations/${conversationId}/cancel`, {
    method: "POST",
  });
}

export async function getMetrics(): Promise<MetricsSummary> {
  return request<MetricsSummary>("/api/metrics/summary");
}
