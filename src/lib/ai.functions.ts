import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import {
  createLovableAiGatewayProvider,
  requireLovableApiKey,
  resolveModelId,
} from "@/lib/ai-gateway.server";

const PersonaInput = z.object({
  name: z.string().min(1),
  idea: z.string().min(1),
  model: z.string().optional(),
});

export const generatePersona = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PersonaInput.parse(input))
  .handler(async ({ data }) => {
    const gateway = createLovableAiGatewayProvider(requireLovableApiKey());
    const { text } = await generateText({
      model: gateway(resolveModelId(data.model)),
      temperature: 1,
      system:
        "Você escreve fichas de personagem para roleplay. Devolva apenas o texto da persona, sem títulos extras, sem avisos e sem comentários. Escreva de 120 a 220 palavras cobrindo aparência, temperamento, história, motivações, jeito de falar e limites emocionais.",
      prompt: `Nome do personagem: ${data.name}\nIdeia: ${data.idea}`,
    });
    return { persona: text.trim() };
  });

const TitleInput = z.object({
  firstMessage: z.string().min(1),
  model: z.string().optional(),
});

export const generateChatTitle = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TitleInput.parse(input))
  .handler(async ({ data }) => {
    const gateway = createLovableAiGatewayProvider(requireLovableApiKey());
    const { text } = await generateText({
      model: gateway(resolveModelId(data.model)),
      temperature: 0.6,
      system:
        "Crie um título curto (máximo 5 palavras) para esta conversa de roleplay. Devolva apenas o título, sem aspas e sem pontuação final.",
      prompt: data.firstMessage.slice(0, 800),
    });
    return { title: text.trim().slice(0, 60) };
  });
