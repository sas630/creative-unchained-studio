/**
 * Modo local (Ollama / LM Studio / qualquer API compatível com OpenAI).
 *
 * Endereço localhost (http://localhost:11434): a chamada sai do navegador,
 * porque só o navegador alcança o PC do usuário — exige OLLAMA_ORIGINS=*.
 *
 * Endereço público (túnel ngrok etc.): a chamada passa pela ponte do
 * servidor (/api/local-proxy), que alcança o túnel sem CORS nem a página
 * de aviso do ngrok.
 */

export function normalizeLocalBaseUrl(raw: string) {
  let url = raw.trim();
  // Remove formatação de link colada por acidente: [https://x](https://x) ou <https://x>
  const md = url.match(/\[?(https?:\/\/[^\s\]\)<>]+)\]?(?:\(([^)]*)\))?/i);
  if (md) url = md[1];
  url = url.replace(/[\[\]\(\)<>]/g, "").replace(/\/+$/, "");
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  if (!/\/v\d+$/i.test(url)) url = `${url}/v1`;
  return url;
}

function isLoopback(url: string) {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

function headers(apiKey?: string | null) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey?.trim() || "local"}`,
    // ngrok grátis: sem este cabeçalho ele devolve uma página de aviso em vez da API
    "ngrok-skip-browser-warning": "true",
  };
}

async function requestLocal(opts: {
  baseUrl: string;
  apiKey?: string | null;
  path: "/models" | "/chat/completions";
  payload?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<Response> {
  const url = normalizeLocalBaseUrl(opts.baseUrl);
  if (isLoopback(url)) {
    return fetch(`${url}${opts.path}`, {
      method: opts.payload ? "POST" : "GET",
      headers: headers(opts.apiKey),
      signal: opts.signal,
      body: opts.payload ? JSON.stringify(opts.payload) : undefined,
    });
  }
  // Endereço público: passa pela ponte do servidor (sem CORS).
  return fetch("/api/local-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: opts.signal,
    body: JSON.stringify({
      baseUrl: url,
      apiKey: opts.apiKey ?? null,
      path: opts.path,
      payload: opts.payload,
    }),
  });
}

export async function listLocalModels(baseUrl: string, apiKey?: string | null) {
  const res = await requestLocal({ baseUrl, apiKey, path: "/models" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data?: { id?: string }[] | null };
  return (json.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
}

export type LocalChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function streamLocalChat(opts: {
  baseUrl: string;
  apiKey?: string | null;
  model: string;
  messages: LocalChatMessage[];
  temperature?: number;
  onDelta: (delta: string) => void;
  signal?: AbortSignal;
}) {
  const res = await requestLocal({
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    path: "/chat/completions",
    signal: opts.signal,
    payload: {
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.9,
      stream: true,
    },
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Modelo local respondeu HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          total += delta.length;
          opts.onDelta(delta);
        }
      } catch {
        // pedaço incompleto: ignora
      }
    }
  }

  if (total === 0) throw new Error("O modelo local respondeu vazio.");
  return total;
}
