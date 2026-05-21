export const PROVIDER_IDS = ["groq", "openai", "gemini", "anthropic"] as const;
export type LLMProviderName = (typeof PROVIDER_IDS)[number];

export interface ProviderDefinition {
  id: LLMProviderName;
  label: string;
  defaultModel: string;
  apiKeyEnv: string;
  modelEnv: string;
}

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "groq",
    label: "Groq (Llama)",
    defaultModel: "llama-3.1-8b-instant",
    apiKeyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-2.0-flash",
    apiKeyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    defaultModel: "claude-3-5-haiku-20241022",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
  },
];

export function isProviderName(value: string): value is LLMProviderName {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

export function getDefinition(id: LLMProviderName): ProviderDefinition {
  const def = PROVIDER_DEFINITIONS.find((p) => p.id === id);
  if (!def) throw new Error(`Unknown provider: ${id}`);
  return def;
}

export function isProviderConfigured(id: LLMProviderName): boolean {
  const def = getDefinition(id);
  const key = process.env[def.apiKeyEnv];
  return Boolean(key?.trim());
}

export function resolveModel(id: LLMProviderName, override?: string): string {
  const def = getDefinition(id);
  return override?.trim() || process.env[def.modelEnv]?.trim() || def.defaultModel;
}
