import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import {
  createGeminiProvider,
  createLovableAiGatewayProvider,
  GEMINI_MODELS,
  parseApiKeyList,
  requireLovableApiKey,
  resolveGeminiModelId,
  resolveModelId,
} from "@/lib/ai-gateway.server";

const PersonaInput = z.object({
  name: z.string().min(1),
  idea: z.string().min(1),
  model: z.string().optional(),
  geminiKeys: z.string().optional(),
  geminiModel: z.string().optional(),
});

const PERSONA_SYSTEM =
  "Você escreve fichas de personagem para roleplay. Devolva apenas o texto da persona, sem títulos extras, sem avisos e sem comentários. Escreva de 120 a 220 palavras cobrindo aparência, temperamento, história, motivações, jeito de falar e limites emocionais.";

export const generatePersona = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PersonaInput.parse(input))
  .handler(async ({ data }) => {
    const prompt = `Nome do personagem: ${data.name}\nIdeia: ${data.idea}`;
    const keys = parseApiKeyList(data.geminiKeys);
    const chosen = resolveGeminiModelId(data.geminiModel);
    const models = [chosen, ...GEMINI_MODELS.filter((m) => m !== chosen)];

    let lastError: unknown = null;
    // 1) Chaves grátis do próprio usuário (Google AI Studio): chave × modelo.
    for (const modelId of models) {
      for (const key of keys) {
        try {
          const provider = createGeminiProvider(key);
          const { text } = await generateText({
            model: provider(modelId),
            maxRetries: 1,
            temperature: 1,
            system: PERSONA_SYSTEM,
            prompt,
          });
          if (text.trim()) return { persona: text.trim() };
        } catch (error) {
          lastError = error;
        }
      }
    }

    // 2) Último recurso: gateway do app.
    try {
      const gateway = createLovableAiGatewayProvider(requireLovableApiKey());
      const { text } = await generateText({
        model: gateway(resolveModelId(data.model)),
        temperature: 1,
        system: PERSONA_SYSTEM,
        prompt,
      });
      if (text.trim()) return { persona: text.trim() };
    } catch (error) {
      lastError = error;
    }

    throw new Error(
      keys.length === 0
        ? "Adicione uma chave grátis do Google Gemini em Ajustes (ou ligue o modelo do seu PC) para gerar personas."
        : lastError instanceof Error
          ? lastError.message
          : "Não foi possível gerar a persona agora.",
    );
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

// ---- Resumo contínuo para conversas longas ("infinitas") ----
// Em vez de reenviar todo o histórico ao modelo a cada mensagem (o que acaba
// estourando o limite de contexto em cenas muito longas), guardamos um
// resumo cumulativo da parte antiga da conversa e só enviamos ao modelo o
// resumo + as últimas mensagens. Esta função funde um trecho antigo com o
// resumo já existente.
const SummarizeChunkInput = z.object({
  existingSummary: z.string().optional(),
  chunk: z
    .array(
      z.object({
        role: z.string(),
        content: z.string(),
      }),
    )
    .min(1),
  geminiKeys: z.string().optional(),
  geminiModel: z.string().optional(),
});

export const summarizeChatChunk = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SummarizeChunkInput.parse(input))
  .handler(async ({ data }) => {
    const keys = parseApiKeyList(data.geminiKeys);
    if (keys.length === 0) {
      throw new Error("Adicione uma chave grátis do Google Gemini em Ajustes para resumir conversas longas.");
    }
    const modelId = resolveGeminiModelId(data.geminiModel);
    const transcript = data.chunk
      .map((m) => `${m.role === "user" ? "Usuário" : "Personagem"}: ${m.content}`)
      .join("\n\n");

    let lastError: unknown = null;
    for (const key of keys) {
      try {
        const provider = createGeminiProvider(key);
        const { text } = await generateText({
          model: provider(modelId),
          temperature: 0.3,
          system:
            "Você mantém a memória de uma cena de roleplay longa. Funda o resumo anterior (se houver) com o trecho novo em um único resumo coeso e cronológico, em terceira pessoa: eventos importantes, decisões, como o relacionamento entre os personagens evoluiu, e o estado emocional/situação atual de cada um. No máximo 300 palavras. Devolva apenas o resumo, sem título e sem comentários.",
          prompt: `${
            data.existingSummary ? `Resumo até agora:\n${data.existingSummary}\n\n` : ""
          }Trecho novo da cena:\n${transcript}`,
        });
        return { summary: text.trim() };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Falha ao resumir a conversa.");
  });
