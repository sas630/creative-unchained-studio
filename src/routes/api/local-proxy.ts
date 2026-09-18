import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Ponte para modelos "locais" expostos por um endereço público (ngrok etc.).
 *
 * Quando o usuário aponta o modo local para um túnel público, o navegador
 * esbarra em CORS/aviso do ngrok. O servidor do app alcança o túnel sem essa
 * restrição, então repassamos a chamada daqui e devolvemos o stream.
 */

const Body = z.object({
  baseUrl: z.string().min(1).max(300),
  apiKey: z.string().max(500).nullish(),
  path: z.enum(["/models", "/chat/completions"]),
  payload: z.record(z.string(), z.unknown()).optional(),
});

function normalizeBaseUrl(raw: string) {
  let url = raw.trim();
  const md = url.match(/\[?(https?:\/\/[^\s\]\)<>]+)\]?(?:\(([^)]*)\))?/i);
  if (md) url = md[1];
  url = url.replace(/[\[\]\(\)<>]/g, "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  if (!/\/v\d+$/i.test(url)) url = `${url}/v1`;
  return url;
}

export const Route = createFileRoute("/api/local-proxy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return Response.json({ error: "Pedido inválido." }, { status: 400 });
        }

        const target = `${normalizeBaseUrl(body.baseUrl)}${body.path}`;
        const method = body.path === "/models" && !body.payload ? "GET" : "POST";

        let upstream: Response;
        try {
          upstream = await fetch(target, {
            method,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${body.apiKey?.trim() || "local"}`,
              "ngrok-skip-browser-warning": "true",
            },
            body: method === "POST" ? JSON.stringify(body.payload ?? {}) : undefined,
          });
        } catch (error) {
          return Response.json(
            { error: `Não alcancei ${target}: ${error instanceof Error ? error.message : "falha de rede"}` },
            { status: 502 },
          );
        }

        return new Response(upstream.body, {
          status: upstream.status,
          headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
        });
      },
    },
  },
});
