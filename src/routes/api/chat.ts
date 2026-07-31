import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import {
  createLovableAiGatewayProvider,
  getLovableAiGatewayResponseHeaders,
  getLovableAiGatewayRunId,
  requireLovableApiKey,
  resolveModelId,
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
    return "Os créditos de IA do projeto acabaram. Adicione créditos no workspace para continuar a cena.";
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

        let key: string;
        try {
          key = requireLovableApiKey();
        } catch {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        const initialRunId = getLovableAiGatewayRunId(request);
        const gateway = createLovableAiGatewayProvider(key, initialRunId);
        const model = gateway(resolveModelId(body.model));

        const temperature =
          typeof body.creativity === "number" && body.creativity >= 0 && body.creativity <= 2
            ? body.creativity
            : 0.9;

        const result = streamText({
          model,
          temperature,
          system: buildSystemPrompt(body),
          messages: await convertToModelMessages(body.messages as UIMessage[]),
          onError: ({ error }) => console.error("[chat] stream error", error),
        });

        // Fallback: se o gateway falhar (402/429/etc), entregamos uma resposta
        // local em vez de quebrar o chat — o usuário pode reenviar depois.
        const stream = createUIMessageStream({
          originalMessages: body.messages as UIMessage[],
          execute: async ({ writer }) => {
            const textId = crypto.randomUUID();
            let started = false;
            try {
              for await (const delta of result.textStream) {
                if (!started) {
                  writer.write({ type: "text-start", id: textId });
                  started = true;
                }
                writer.write({ type: "text-delta", id: textId, delta });
              }
              if (started) writer.write({ type: "text-end", id: textId });
            } catch (error) {
              const reason = describeAiError(error);
              if (!started) writer.write({ type: "text-start", id: textId });
              writer.write({
                type: "text-delta",
                id: textId,
                delta: `${started ? "\n\n" : ""}⏸️ **A cena está pausada.** ${reason}\n\nNada foi perdido: use “Reenviar” para tentar de novo quando quiser.`,
              });
              writer.write({ type: "text-end", id: textId });
              writer.write({
                type: "data-fallback",
                data: { reason, partial: started },
              });
            }
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
