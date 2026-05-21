import { OpenAICompatibleProvider } from "./openai-compatible.js";

export function createOpenAIProvider(
  apiKey: string,
  model: string
): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider("openai", apiKey, model);
}
