import { Router } from "express";
import {
  createConversation,
  getConversation,
  getMessages,
  listConversations,
  updateConversationStatus,
} from "../db.js";
import { cancelRequest } from "../abort-registry.js";

export const conversationsRouter = Router();

conversationsRouter.post("/", async (_req, res) => {
  try {
    const conversation = await createConversation();
    res.status(201).json(conversation);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

conversationsRouter.get("/", async (_req, res) => {
  try {
    const conversations = await listConversations();
    res.json({ items: conversations });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

conversationsRouter.get("/:id", async (req, res) => {
  try {
    const conversation = await getConversation(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

conversationsRouter.get("/:id/messages", async (req, res) => {
  try {
    const conversation = await getConversation(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const messages = await getMessages(req.params.id);
    res.json({ items: messages });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

conversationsRouter.post("/:id/cancel", async (req, res) => {
  try {
    const conversation = await getConversation(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const cancelled = cancelRequest(req.params.id);
    await updateConversationStatus(req.params.id, "cancelled");
    res.json({ cancelled, conversation_id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
