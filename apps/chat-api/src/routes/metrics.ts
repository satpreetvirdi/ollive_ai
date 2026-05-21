import { Router } from "express";

export const metricsRouter = Router();

const ingestionUrl = () =>
  process.env.INGESTION_URL ?? "http://localhost:8001";

metricsRouter.get("/summary", async (req, res) => {
  try {
    const hours = req.query.hours ?? "24";
    const response = await fetch(
      `${ingestionUrl()}/v1/metrics/summary?hours=${hours}`
    );
    if (!response.ok) {
      res.status(response.status).json({ error: await response.text() });
      return;
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

metricsRouter.get("/logs", async (req, res) => {
  try {
    const conversationId = req.query.conversation_id;
    const url = new URL(`${ingestionUrl()}/v1/inference-logs`);
    if (conversationId) url.searchParams.set("conversation_id", String(conversationId));
    const response = await fetch(url.toString());
    if (!response.ok) {
      res.status(response.status).json({ error: await response.text() });
      return;
    }
    res.json(await response.json());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
