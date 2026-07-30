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

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages as UIMessage[],
          headers: getLovableAiGatewayResponseHeaders(undefined, {}),
        });
      },
    },
  },
});
