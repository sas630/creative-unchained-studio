/**
 * Modo local (Ollama / LM Studio / qualquer API compatível com OpenAI).
 *
 * IMPORTANTE: o endereço é o PC do próprio usuário (http://localhost:11434),
 * então a chamada tem de sair do navegador — o servidor do app não alcança
 * a máquina dele. Por isso este arquivo é client-side.
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

function headers(apiKey?: string | null) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey?.trim() || "local"}`,
    // ngrok grátis: sem este cabeçalho ele devolve uma página de aviso em vez da API
    "ngrok-skip-browser-warning": "true",
  };
}

export async function listLocalModels(baseUrl: string, apiKey?: string | null) {
  const url = normalizeLocalBaseUrl(baseUrl);
  const res = await fetch(`${url}/models`, { headers: headers(apiKey) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data?: { id?: string }[] };
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
  const url = normalizeLocalBaseUrl(opts.baseUrl);
  const res = await fetch(`${url}/chat/completions`, {
    method: "POST",
    headers: headers(opts.apiKey),
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.9,
      stream: true,
    }),
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
