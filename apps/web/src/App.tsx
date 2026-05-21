import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelConversation,
  createConversation,
  getMessages,
  getMetrics,
  listConversations,
  listProviders,
  sendMessageStream,
  type Conversation,
  type Message,
  type MetricsSummary,
  type ProviderInfo,
} from "./api";

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [view, setView] = useState<"chat" | "dashboard">("chat");
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("groq");
  const abortRef = useRef<AbortController | null>(null);

  const activeProviderMeta = providers.find((p) => p.id === selectedProvider);

  const refreshConversations = useCallback(async () => {
    const items = await listConversations();
    setConversations(items);
  }, []);

  useEffect(() => {
    void refreshConversations();
    void getMetrics().then(setMetrics).catch(() => {});
    void listProviders().then((items) => {
      setProviders(items);
      const first = items.find((p) => p.configured);
      if (first) setSelectedProvider(first.id);
    });
  }, [refreshConversations]);

  const loadConversation = async (id: string) => {
    setActiveId(id);
    setStreamingText("");
    const msgs = await getMessages(id);
    setMessages(msgs);
  };

  const handleNewChat = async () => {
    const conv = await createConversation();
    await refreshConversations();
    setActiveId(conv.id);
    setMessages([]);
    setStreamingText("");
  };

  const handleSend = async () => {
    if (!activeId || !input.trim() || loading) return;

    const text = input.trim();
    setInput("");
    setLoading(true);
    setStreamingText("");

    const optimisticUser: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: activeId,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    abortRef.current = new AbortController();

    try {
      let accumulated = "";
      const assistant = await sendMessageStream(
        activeId,
        text,
        (chunk) => {
          accumulated += chunk;
          setStreamingText(accumulated);
        },
        abortRef.current.signal,
        { provider: selectedProvider }
      );

      setStreamingText("");
      const fresh = await getMessages(activeId);
      setMessages(fresh);
      if (!assistant) {
        void fresh;
      }
      await refreshConversations();
      void getMetrics().then(setMetrics).catch(() => {});
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setStreamingText("");
      } else {
        alert(err instanceof Error ? err.message : "Send failed");
      }
      const fresh = await getMessages(activeId);
      setMessages(fresh);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleCancel = async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    if (activeId) {
      await cancelConversation(activeId);
      setLoading(false);
      setStreamingText("");
    }
  };

  const activeConversation = conversations.find((c) => c.id === activeId);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Ollive AI</h1>
          <p className="subtitle">Inference logging demo</p>
        </div>
        <button className="btn primary" onClick={() => void handleNewChat()}>
          + New chat
        </button>
        <nav className="nav-tabs">
          <button
            className={view === "chat" ? "active" : ""}
            onClick={() => setView("chat")}
          >
            Chats
          </button>
          <button
            className={view === "dashboard" ? "active" : ""}
            onClick={() => {
              setView("dashboard");
              void getMetrics().then(setMetrics);
            }}
          >
            Dashboard
          </button>
        </nav>
        {view === "chat" && (
          <ul className="conversation-list">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  className={c.id === activeId ? "active" : ""}
                  onClick={() => void loadConversation(c.id)}
                >
                  <span className="conv-title">
                    {c.title ?? "Untitled chat"}
                  </span>
                  <span className="conv-meta">{c.status}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <main className="main">
        {view === "dashboard" ? (
          <Dashboard metrics={metrics} onRefresh={() => getMetrics().then(setMetrics)} />
        ) : !activeId ? (
          <div className="empty-state">
            <h2>Start a conversation</h2>
            <p>Create a new chat or select one from the sidebar.</p>
            <button className="btn primary" onClick={() => void handleNewChat()}>
              New chat
            </button>
          </div>
        ) : (
          <>
            <header className="chat-header">
              <div className="chat-header-left">
                <h2>{activeConversation?.title ?? "Chat"}</h2>
                <div className="provider-row">
                  <label htmlFor="provider-select">Model</label>
                  <select
                    id="provider-select"
                    className="provider-select"
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    disabled={loading}
                  >
                    {providers.map((p) => (
                      <option
                        key={p.id}
                        value={p.id}
                        disabled={!p.configured}
                      >
                        {p.label}
                        {!p.configured ? " (no API key)" : ""}
                      </option>
                    ))}
                  </select>
                  {activeProviderMeta?.configured && (
                    <span className="model-hint">{activeProviderMeta.defaultModel}</span>
                  )}
                </div>
              </div>
              {loading && (
                <button className="btn danger" onClick={() => void handleCancel()}>
                  Cancel
                </button>
              )}
            </header>
            <div className="messages">
              {messages.map((m) => (
                <div key={m.id} className={`message ${m.role}`}>
                  <span className="role">{m.role}</span>
                  <p>{m.content}</p>
                </div>
              ))}
              {streamingText && (
                <div className="message assistant streaming">
                  <span className="role">assistant</span>
                  <p>{streamingText}</p>
                </div>
              )}
            </div>
            <footer className="composer">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Message… (Enter to send)"
                rows={2}
                disabled={loading}
              />
              <button
                className="btn primary"
                disabled={loading || !input.trim()}
                onClick={() => void handleSend()}
              >
                {loading ? "…" : "Send"}
              </button>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function Dashboard({
  metrics,
  onRefresh,
}: {
  metrics: MetricsSummary | null;
  onRefresh: () => void;
}) {
  if (!metrics) {
    return (
      <div className="dashboard">
        <p>Loading metrics…</p>
      </div>
    );
  }

  const errorRate =
    metrics.total_requests > 0
      ? ((metrics.error_count / metrics.total_requests) * 100).toFixed(1)
      : "0";

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h2>Inference metrics (24h)</h2>
        <button className="btn" onClick={onRefresh}>
          Refresh
        </button>
      </header>
      <div className="metric-grid">
        <MetricCard label="Total requests" value={String(metrics.total_requests)} />
        <MetricCard label="Success" value={String(metrics.success_count)} />
        <MetricCard label="Errors" value={String(metrics.error_count)} />
        <MetricCard label="Cancelled" value={String(metrics.cancelled_count)} />
        <MetricCard
          label="Error rate"
          value={`${errorRate}%`}
        />
        <MetricCard
          label="Avg latency"
          value={
            metrics.avg_latency_ms != null
              ? `${Math.round(metrics.avg_latency_ms)} ms`
              : "—"
          }
        />
        <MetricCard
          label="p50 latency"
          value={
            metrics.p50_latency_ms != null
              ? `${Math.round(metrics.p50_latency_ms)} ms`
              : "—"
          }
        />
        <MetricCard
          label="p95 latency"
          value={
            metrics.p95_latency_ms != null
              ? `${Math.round(metrics.p95_latency_ms)} ms`
              : "—"
          }
        />
        <MetricCard label="Total tokens" value={String(metrics.total_tokens)} />
        <MetricCard
          label="Throughput"
          value={`${metrics.requests_per_minute.toFixed(2)} req/min`}
        />
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}
