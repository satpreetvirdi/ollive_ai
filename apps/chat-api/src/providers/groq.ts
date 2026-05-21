import { OpenAICompatibleProvider } from "./openai-compatible.js";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export function createGroqProvider(
  apiKey: string,
  model: string
): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider("groq", apiKey, model, GROQ_BASE_URL);
}
