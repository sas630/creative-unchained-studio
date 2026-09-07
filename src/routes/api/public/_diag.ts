import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/_diag")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("profiles")
          .select("gemini_api_keys, gemini_model")
          .limit(5);
        const out: unknown[] = [];
        for (const row of data ?? []) {
          const keys = String(row.gemini_api_keys ?? "")
            .split(/[\s,;]+/)
            .map((k) => k.trim())
            .filter((k) => k.length > 10);
          for (const [i, key] of keys.entries()) {
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
            );
            const body = (await res.json()) as {
              models?: { name: string; supportedGenerationMethods?: string[] }[];
              error?: { message?: string };
            };
            out.push({
              key: `#${i + 1}`,
              status: res.status,
              error: body.error?.message ?? null,
              models: (body.models ?? [])
                .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
                .map((m) => m.name.replace("models/", ""))
                .filter((n) => n.includes("flash") || n.includes("pro")),
            });
          }
        }
        return Response.json({ savedModel: data?.[0]?.gemini_model ?? null, out });
      },
    },
  },
});
