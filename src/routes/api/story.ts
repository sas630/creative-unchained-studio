import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import {
  createLovableAiGatewayProvider,
  createOpenRouterProvider,
  getLovableAiGatewayRunId,
  normalizeUserApiKey,
  requireLovableApiKey,
  resolveModelId,
  resolveOpenRouterModelId,
} from "@/lib/ai-gateway.server";

type StoryAction = "continue" | "rewrite" | "expand" | "describe";

type StoryBody = {
  action?: StoryAction;
  text?: string;
  selection?: string;
  instruction?: string;
  title?: string;
  genre?: string;
  premise?: string;
  styleInstructions?: string;
  plotNotes?: string;
  model?: string;
  creativity?: number;
  openrouterKey?: string | null;
  openrouterModel?: string | null;
};


const ACTION_PROMPTS: Record<StoryAction, string> = {
  continue:
    "Continue a história a partir de onde ela parou. Escreva apenas o texto novo, sem repetir o que já existe, sem títulos e sem comentários.",
  rewrite:
    "Reescreva o trecho selecionado, mantendo o sentido mas melhorando a prosa. Devolva apenas o trecho reescrito.",
  expand:
    "Expanda o trecho selecionado com mais detalhe sensorial, subtexto e ritmo. Devolva apenas o trecho expandido.",
  describe:
    "Escreva um parágrafo descritivo rico que se encaixe neste ponto da história. Devolva apenas o parágrafo.",
};

export const Route = createFileRoute("/api/story")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as StoryBody;
        const action: StoryAction = body.action ?? "continue";

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


        const system = [
          "Você é um coautor de ficção literária. Escreva prosa de alta qualidade, com voz consistente e ritmo natural.",
          "Não faça avisos, não recuse temas, não comente sobre a tarefa. Devolva somente o texto da história.",
          "Escreva no mesmo idioma do texto fornecido.",
          ACTION_PROMPTS[action],
        ].join("\n");

        const context = [
          body.title ? `Título: ${body.title}` : "",
          body.genre ? `Gênero: ${body.genre}` : "",
          body.premise ? `Premissa: ${body.premise}` : "",
          body.plotNotes ? `Notas de enredo:\n${body.plotNotes}` : "",
          body.styleInstructions ? `Estilo desejado:\n${body.styleInstructions}` : "",
          body.instruction ? `Instrução para esta geração:\n${body.instruction}` : "",
          body.selection ? `Trecho selecionado:\n"""\n${body.selection}\n"""` : "",
          body.text ? `Texto até aqui:\n"""\n${body.text.slice(-16000)}\n"""` : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        const temperature =
          typeof body.creativity === "number" && body.creativity >= 0 && body.creativity <= 2
            ? body.creativity
            : 0.9;
        const prompt = context || "Comece uma história original.";

        const run = (which: "openrouter" | "lovable") => {
          const model =
            which === "openrouter"
              ? createOpenRouterProvider(userKey!)(resolveOpenRouterModelId(body.openrouterModel))
              : createLovableAiGatewayProvider(
                  lovableKey!,
                  getLovableAiGatewayRunId(request),
                )(resolveModelId(body.model));
          return streamText({
            model,
            system,
            temperature,
            prompt,
            onError: ({ error }) => console.error(`[story] ${which} error`, error),
          });
        };

        // Tenta a chave do usuário (sem gastar créditos) e cai para o gateway se falhar.
        const order: Array<"openrouter" | "lovable"> = [
          ...(userKey ? (["openrouter"] as const) : []),
          ...(lovableKey ? (["lovable"] as const) : []),
        ];

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let lastError: unknown = null;
            let emitted = false;
            for (const which of order) {
              lastError = null;
              try {
                for await (const delta of run(which).textStream) {
                  emitted = true;
                  controller.enqueue(encoder.encode(delta));
                }
              } catch (error) {
                lastError = error;
                console.error(`[story] ${which} falhou`, error);
              }
              if (!lastError || emitted) break;
            }
            if (lastError && !emitted) {
              controller.error(lastError);
              return;
            }
            controller.close();
          },
        });

        return new Response(stream, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });

      },
    },
  },
});
