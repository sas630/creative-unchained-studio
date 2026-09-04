import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const LOVABLE_AIG_RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export function createLovableAiGatewayRunIdFetch(initialRunId?: string) {
  let runId = initialRunId?.trim() || undefined;
  let resolveRunId: (value: string | undefined) => void = () => {};
  let runIdResolved = false;
  const runIdReady = new Promise<string | undefined>((resolve) => {
    resolveRunId = resolve;
  });

  const publishRunId = (value?: string) => {
    const nextRunId = value?.trim() || undefined;
    if (!runId && nextRunId) {
      runId = nextRunId;
    }
    if (!runIdResolved) {
      runIdResolved = true;
      resolveRunId(runId);
    }
  };
  if (runId) publishRunId(runId);

  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(LOVABLE_AIG_RUN_ID_HEADER)) {
        headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);
      }
      try {
        const response = await fetch(input, { ...init, headers });
        publishRunId(response.headers.get(LOVABLE_AIG_RUN_ID_HEADER) ?? undefined);
        return response;
      } catch (error) {
        publishRunId(undefined);
        throw error;
      }
    },
    getRunId: () => runId,
    waitForRunId: () => (runId ? Promise.resolve(runId) : runIdReady),
  };
}

export function createLovableAiGatewayProvider(
  lovableApiKey: string,
  initialRunId?: string,
  options?: { structuredOutputs?: boolean },
) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);

  const provider = createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    supportsStructuredOutputs: options?.structuredOutputs ?? false,
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: runIdFetch.fetch as typeof fetch,
  });

  return Object.assign(provider, {
    getRunId: runIdFetch.getRunId,
    waitForRunId: runIdFetch.waitForRunId,
  });
}

export function getLovableAiGatewayRunId(request: Request) {
  return request.headers.get(LOVABLE_AIG_RUN_ID_HEADER)?.trim() || undefined;
}

export function getLovableAiGatewayResponseHeaders(
  providerHeaders: HeadersInit | undefined,
  init?: HeadersInit,
) {
  const headers = new Headers(init);
  const exposedHeaders = new Set(
    (headers.get("Access-Control-Expose-Headers") ?? "")
      .split(",")
      .map((header) => header.trim())
      .filter(Boolean),
  );

  new Headers(providerHeaders).forEach((value, name) => {
    if (name.toLowerCase().startsWith("x-lovable-aig-")) {
      headers.set(name, value);
      exposedHeaders.add(name);
    }
  });

  headers.forEach((_, name) => {
    if (name.toLowerCase().startsWith("x-lovable-aig-")) {
      exposedHeaders.add(name);
    }
  });

  if (exposedHeaders.size > 0) {
    headers.set("Access-Control-Expose-Headers", Array.from(exposedHeaders).join(", "));
  }

  return headers;
}

export function requireLovableApiKey() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return key;
}

export const ALLOWED_MODELS = [
  "google/gemini-3.6-flash",
  "google/gemini-3.5-flash",
  "google/gemini-3.1-pro-preview",
  "google/gemini-2.5-pro",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.5",
] as const;

export function resolveModelId(candidate: unknown): string {
  return typeof candidate === "string" && (ALLOWED_MODELS as readonly string[]).includes(candidate)
    ? candidate
    : "google/gemini-3.6-flash";
}

// ---- OpenRouter (chave do próprio usuário: não consome créditos do workspace) ----

export const OPENROUTER_MODELS = [
  "deepseek/deepseek-chat-v3-0324:free",
  "deepseek/deepseek-r1:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-nemo:free",
  "google/gemma-3-27b-it:free",
] as const;

export function resolveOpenRouterModelId(candidate: unknown): string {
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : OPENROUTER_MODELS[0];
}

export function createOpenRouterProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Title": "Lumen",
    },
  });
}

export function normalizeUserApiKey(candidate: unknown): string | null {
  return typeof candidate === "string" && candidate.trim().length > 10 ? candidate.trim() : null;
}

// ---- Google AI Studio (Gemini) com chaves do próprio usuário: cota gratuita ----

export const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.5-pro",
] as const;

export function resolveGeminiModelId(candidate: unknown): string {
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : GEMINI_MODELS[0];
}

/** Aceita várias chaves separadas por linha, vírgula, ponto-e-vírgula ou espaço. */
export function parseApiKeyList(candidate: unknown): string[] {
  if (typeof candidate !== "string") return [];
  const seen = new Set<string>();
  for (const raw of candidate.split(/[\s,;]+/)) {
    const key = raw.trim();
    if (key.length > 10) seen.add(key);
  }
  return Array.from(seen);
}

export function createGeminiProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
}

