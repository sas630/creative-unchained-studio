import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import {
  createLovableAiGatewayProvider,
  getLovableAiGatewayRunId,
  requireLovableApiKey,
  resolveModelId,
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

        let key: string;
        try {
          key = requireLovableApiKey();
        } catch {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        const gateway = createLovableAiGatewayProvider(key, getLovableAiGatewayRunId(request));
        const model = gateway(resolveModelId(body.model));

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

        const result = streamText({
          model,
          system,
          temperature:
            typeof body.creativity === "number" && body.creativity >= 0 && body.creativity <= 2
              ? body.creativity
              : 0.9,
          prompt: context || "Comece uma história original.",
          onError: ({ error }) => console.error("[story] stream error", error),
        });

        return result.toTextStreamResponse();
      },
    },
  },
});
