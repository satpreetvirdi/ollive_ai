import "dotenv/config";
import cors from "cors";
import express from "express";
import { conversationsRouter } from "./routes/conversations.js";
import { chatRouter } from "./routes/chat.js";
import { metricsRouter } from "./routes/metrics.js";
import { providersRouter } from "./routes/providers.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "chat-api" });
});

app.use("/api/conversations", conversationsRouter);
app.use("/api/conversations", chatRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api/providers", providersRouter);

app.listen(port, () => {
  console.log(`chat-api listening on http://localhost:${port}`);
});
