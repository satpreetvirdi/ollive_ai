import { Router } from "express";
import { listProviders } from "../providers/index.js";

export const providersRouter = Router();

providersRouter.get("/", (_req, res) => {
  res.json({ items: listProviders() });
});
