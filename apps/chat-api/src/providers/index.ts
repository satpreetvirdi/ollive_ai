import { createAnthropicProvider } from "./anthropic.js";
import { createGeminiProvider } from "./gemini.js";
import { createGroqProvider } from "./groq.js";
import { createOpenAIProvider } from "./openai.js";
import {
  getDefinition,
  isProviderConfigured,
  isProviderName,
  resolveModel,
  type LLMProviderName,
  PROVIDER_DEFINITIONS,
} from "./registry.js";
import type { LLMProvider } from "./types.js";

export interface ProviderInfo {
  id: LLMProviderName;
  label: string;
  defaultModel: string;
  configured: boolean;
}

export function listProviders(): ProviderInfo[] {
  return PROVIDER_DEFINITIONS.map((def) => ({
    id: def.id,
    label: def.label,
    defaultModel: resolveModel(def.id),
    configured: isProviderConfigured(def.id),
  }));
}

export function createProvider(
  providerName?: string,
  modelOverride?: string
): LLMProvider {
  const envDefault = (process.env.LLM_PROVIDER ?? "groq").toLowerCase();
  const name = (
    providerName?.toLowerCase() ?? envDefault
  ) as LLMProviderName;

  if (!isProviderName(name)) {
    throw new Error(
      `Invalid provider "${providerName}". Use: groq, openai, gemini, anthropic`
    );
  }

  if (!isProviderConfigured(name)) {
    const def = getDefinition(name);
    throw new Error(
      `${def.apiKeyEnv} is required for provider "${name}". ` +
        `Configure the key in .env or pick another provider.`
    );
  }

  const model = resolveModel(name, modelOverride);
  const def = getDefinition(name);

  switch (name) {
    case "openai":
      return createOpenAIProvider(process.env[def.apiKeyEnv]!, model);
    case "gemini":
      return createGeminiProvider(process.env[def.apiKeyEnv]!, model);
    case "anthropic":
      return createAnthropicProvider(process.env[def.apiKeyEnv]!, model);
    case "groq":
    default:
      return createGroqProvider(process.env[def.apiKeyEnv]!, model);
  }
}

/** @deprecated Use provider.model from createProvider() */
export function getActiveModelName(): string {
  const name = (process.env.LLM_PROVIDER ?? "groq").toLowerCase();
  if (isProviderName(name)) {
    return resolveModel(name);
  }
  return resolveModel("groq");
}

export type { ChatMessage, LLMProvider } from "./types.js";
export type { LLMProviderName } from "./registry.js";
