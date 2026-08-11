import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";

import {
  createLovableAiGatewayProvider,
  createOpenRouterProvider,
  getLovableAiGatewayResponseHeaders,
  getLovableAiGatewayRunId,
  normalizeUserApiKey,
  requireLovableApiKey,
  resolveModelId,
  resolveOpenRouterModelId,
} from "@/lib/ai-gateway.server";

type CharacterInfo = {
  name?: string;
  persona?: string;
  scenario?: string;
  tagline?: string;
};

type ChatBody = {
  messages?: unknown;
  character?: CharacterInfo | null;
  model?: string;
  creativity?: number;
  styleInstructions?: string | null;
  userName?: string | null;
  openrouterKey?: string | null;
  openrouterModel?: string | null;
};


function buildSystemPrompt(body: ChatBody) {
  const c = body.character ?? null;
  const lines = [
    "Você é um narrador e intérprete de personagens para roleplay literário imersivo.",
    "Escreva em prosa vívida, na terceira pessoa ou primeira, conforme o tom da cena.",
    "Use *itálico* para ações e pensamentos, aspas para falas.",
    "Nunca escreva ou decida as falas e ações do usuário. Termine sempre deixando espaço para a resposta dele.",
    "Não quebre o personagem, não faça avisos morais, não mencione que é uma IA e não interrompa a cena com meta-comentários.",
    "Responda sempre no mesmo idioma que o usuário usar.",
  ];
  if (c?.name) lines.push(`\n# Personagem\nNome: ${c.name}`);
  if (c?.tagline) lines.push(`Resumo: ${c.tagline}`);
  if (c?.persona) lines.push(`Persona:\n${c.persona}`);
  if (c?.scenario) lines.push(`Cenário:\n${c.scenario}`);
  if (body.userName) lines.push(`\nO usuário se chama ${body.userName}.`);
  if (body.styleInstructions) lines.push(`\nInstruções de estilo do usuário:\n${body.styleInstructions}`);
  return lines.join("\n");
}

export function describeAiError(error: unknown) {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const status = (error as { statusCode?: number } | null)?.statusCode;
  if (status === 402 || /payment required/i.test(raw)) {
    return "Os créditos de IA do projeto acabaram. Cole sua chave gratuita do OpenRouter em Ajustes para conversar sem limites.";
  }
  if (status === 429 || /rate limit/i.test(raw)) {
    return "Muitas mensagens em pouco tempo. Espere alguns segundos e tente de novo.";
  }
  return raw || "A IA não respondeu. Tente de novo.";
}


export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ChatBody;
        if (!Array.isArray(body.messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const userKey = normalizeUserApiKey(body.openrouterKey);
        let lovableKey: string | null = null;
        try {
          lovableKey = requireLovableApiKey();
        } catch {
          lovableKey = null;
        }
        if (!userKey && !lovableKey) {
          return new Response("Missing AI credentials", { status: 500 });
        }

        const initialRunId = getLovableAiGatewayRunId(request);
        const temperature =
          typeof body.creativity === "number" && body.creativity >= 0 && body.creativity <= 2
            ? body.creativity
            : 0.9;
        const system = buildSystemPrompt(body);
        const modelMessages = await convertToModelMessages(body.messages as UIMessage[]);

        // Ordem das tentativas: chave própria do usuário (OpenRouter, sem gastar
        // créditos do workspace) e, se falhar, o gateway da Lovable.
        type Attempt = { label: string; run: () => ReturnType<typeof streamText> };
        const attempts: Attempt[] = [];
        if (userKey) {
          attempts.push({
            label: "openrouter",
            run: () => {
              const provider = createOpenRouterProvider(userKey);
              return streamText({
                model: provider(resolveOpenRouterModelId(body.openrouterModel)),
                temperature,
                system,
                messages: modelMessages,
                onError: ({ error }) => console.error("[chat] openrouter error", error),
              });
            },
          });
        }
        if (lovableKey) {
          attempts.push({
            label: "lovable",
            run: () => {
              const gateway = createLovableAiGatewayProvider(lovableKey!, initialRunId);
              return streamText({
                model: gateway(resolveModelId(body.model)),
                temperature,
                system,
                messages: modelMessages,
                onError: ({ error }) => console.error("[chat] gateway error", error),
              });
            },
          });
        }

        // Fallback: se todas as tentativas falharem (402/429/etc), entregamos uma
        // resposta local em vez de quebrar o chat — o usuário pode reenviar depois.
        const stream = createUIMessageStream({
          originalMessages: body.messages as UIMessage[],
          execute: async ({ writer }) => {
            const textId = crypto.randomUUID();
            let started = false;
            const start = () => {
              if (!started) {
                writer.write({ type: "text-start", id: textId });
                started = true;
              }
            };

            let lastError: unknown = null;
            for (const attempt of attempts) {
              lastError = null;
              try {
                for await (const delta of attempt.run().textStream) {
                  start();
                  writer.write({ type: "text-delta", id: textId, delta });
                }
              } catch (error) {
                lastError = error;
                console.error(`[chat] ${attempt.label} falhou`, error);
              }
              if (!lastError) break;
              // se já streamou texto parcial, não tenta outro provedor
              if (started) break;
            }

            if (!lastError) {
              if (!started) {
                start();
                writer.write({ type: "text-delta", id: textId, delta: "…" });
              }
              writer.write({ type: "text-end", id: textId });
              return;
            }

            const reason = describeAiError(lastError);
            const hadText = started;
            start();
            writer.write({
              type: "text-delta",
              id: textId,
              delta: `${hadText ? "\n\n" : ""}⏸️ **A cena está pausada.** ${reason}\n\nNada foi perdido — use “Reenviar” para retomar de onde parou.`,
            });
            writer.write({ type: "text-end", id: textId });
            writer.write({
              type: "data-fallback",
              data: { reason, partial: hadText },
            });
          },
        });



        return createUIMessageStreamResponse({
          stream,
          headers: getLovableAiGatewayResponseHeaders(undefined, {}),
        });


      },
    },
  },
});
