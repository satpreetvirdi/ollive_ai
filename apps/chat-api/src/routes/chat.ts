import type { LLMResult } from "@olliveai/inference-sdk";
import { Router } from "express";
import {
  getConversation,
  getMessages,
  insertMessage,
  updateConversationStatus,
  updateConversationTitle,
} from "../db.js";
import { registerAbort, clearAbort } from "../abort-registry.js";
import { inferenceLogger } from "../inference.js";
import { createProvider } from "../providers/index.js";
import type { ChatMessage } from "../providers/types.js";

export const chatRouter = Router();

const maxContext = Number(process.env.MAX_CONTEXT_MESSAGES ?? 10);

function buildContext(messages: { role: string; content: string }[]): ChatMessage[] {
  const recent = messages.slice(-maxContext * 2);
  return recent.map((m) => ({
    role: m.role as ChatMessage["role"],
    content: m.content,
  }));
}

chatRouter.post("/:id/chat", async (req, res) => {
  const conversationId = req.params.id;
  const { message, stream: useStream, provider: providerId, model } = req.body as {
    message?: string;
    stream?: boolean;
    provider?: string;
    model?: string;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const conversation = await getConversation(conversationId);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  if (conversation.status === "cancelled") {
    await updateConversationStatus(conversationId, "active");
  }

  const userMessage = await insertMessage(conversationId, "user", message.trim());

  if (!conversation.title) {
    const title =
      message.trim().slice(0, 60) + (message.length > 60 ? "…" : "");
    await updateConversationTitle(conversationId, title);
  }

  const history = await getMessages(conversationId);
  const contextMessages = buildContext(history);

  let provider;
  try {
    provider = createProvider(providerId, model);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const signal = registerAbort(conversationId);
  const sessionId = conversationId;

  const inputPreview = contextMessages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const wrapCtx = {
    conversationId,
    messageId: userMessage.id,
    sessionId,
    inputPreview,
    provider: provider.name,
    model: provider.model,
    rawMetadata: { requested_provider: providerId ?? null },
  };

  try {
    if (useStream && provider.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const startedAt = new Date();
      const logId = inferenceLogger.logPending(wrapCtx);

      const gen = provider.stream(contextMessages, { signal });
      let result = await gen.next();
      let fullContent = "";

      while (!result.done) {
        if (signal.aborted) break;
        const chunk = result.value as string;
        fullContent += chunk;
        res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
        result = await gen.next();
      }

      if (signal.aborted) {
        inferenceLogger.logComplete(logId, wrapCtx, "cancelled", {
          latencyMs: Date.now() - startedAt.getTime(),
          startedAt,
          errorCode: "aborted",
        });
        res.write(`data: ${JSON.stringify({ type: "cancelled" })}\n\n`);
        res.end();
        return;
      }

      const returnValue = result.value;
      if (typeof returnValue === "string") {
        throw new Error("Stream ended without LLM metadata");
      }
      const final: LLMResult<string> = returnValue;
      const assistantMessage = await insertMessage(
        conversationId,
        "assistant",
        final.data
      );

      inferenceLogger.logComplete(logId, wrapCtx, "success", {
        outputPreview: final.data,
        latencyMs: Date.now() - startedAt.getTime(),
        promptTokens: final.usage?.prompt_tokens,
        completionTokens: final.usage?.completion_tokens,
        totalTokens: final.usage?.total_tokens,
        startedAt,
      });

      res.write(
        `data: ${JSON.stringify({
          type: "done",
          message: assistantMessage,
          usage: final.usage,
        })}\n\n`
      );
      res.end();
      return;
    }

    const reply = await inferenceLogger.wrap(wrapCtx, () =>
      provider.chat(contextMessages, { signal })
    );

    const assistantMessage = await insertMessage(
      conversationId,
      "assistant",
      reply
    );

    res.json({
      user_message: userMessage,
      assistant_message: assistantMessage,
    });
  } catch (err) {
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("aborted"));

    if (isAbort) {
      res.status(499).json({ error: "Request cancelled" });
      return;
    }
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearAbort(conversationId);
  }
});
