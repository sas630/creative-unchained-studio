import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";

import {
  createGeminiProvider,
  getLovableAiGatewayResponseHeaders,
  parseApiKeyList,
  resolveGeminiModelId,
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
  creativity?: number;
  styleInstructions?: string | null;
  userName?: string | null;
  geminiKeys?: string | null;
  geminiModel?: string | null;
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
    return "A chave usada não tem cota. Adicione outra chave grátis do Google Gemini em Ajustes (aistudio.google.com/apikey).";
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

        const geminiKeys = parseApiKeyList(body.geminiKeys);
        const temperature =
          typeof body.creativity === "number" && body.creativity >= 0 && body.creativity <= 2
            ? body.creativity
            : 0.9;
        const system = buildSystemPrompt(body);
        const modelMessages = await convertToModelMessages(body.messages as UIMessage[]);

        // Só chaves grátis do Google Gemini: cada chave é uma tentativa.
        type Attempt = {
          label: string;
          provider: string;
          modelId: string;
          run: (onError: (error: unknown) => void) => ReturnType<typeof streamText>;
        };
        const attempts: Attempt[] = [];
        // Chaves grátis do Google Gemini: cada chave é uma tentativa, então se uma
        // bater no limite diário a próxima assume automaticamente.
        const geminiModelId = resolveGeminiModelId(body.geminiModel);
        geminiKeys.forEach((key, i) => {
          attempts.push({
            label: `gemini#${i + 1}`,
            provider: `Gemini grátis (chave ${i + 1}/${geminiKeys.length})`,
            modelId: geminiModelId,
            run: (onErr) => {
              const provider = createGeminiProvider(key);
              return streamText({
                model: provider(geminiModelId),
                temperature,
                system,
                messages: modelMessages,
                onError: ({ error }) => {
                  console.error("[chat] gemini error", error);
                  onErr(error);
                },
              });
            },
          });
        });
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

            const rawReason = (error: unknown) =>
              error instanceof Error ? error.message : typeof error === "string" ? error : String(error);

            let lastError: unknown = null;
            for (const [index, attempt] of attempts.entries()) {
              lastError = null;
              const t0 = Date.now();
              writer.write({
                type: "data-attempt",
                transient: true,
                data: {
                  phase: "start" as const,
                  provider: attempt.provider,
                  model: attempt.modelId,
                  index: index + 1,
                  total: attempts.length,
                  fallback: index > 0,
                },
              });
              // streamText não lança: erros de provedor chegam por onError.
              let streamError: unknown = null;
              let chars = 0;
              let firstByteMs: number | null = null;
              try {
                for await (const delta of attempt.run((e) => {
                  streamError = e;
                }).textStream) {
                  if (!delta) continue;
                  if (firstByteMs === null) {
                    firstByteMs = Date.now() - t0;
                    writer.write({
                      type: "data-attempt",
                      transient: true,
                      data: {
                        phase: "first-token" as const,
                        provider: attempt.provider,
                        model: attempt.modelId,
                        index: index + 1,
                        total: attempts.length,
                        fallback: index > 0,
                        ms: firstByteMs,
                      },
                    });
                  }
                  start();
                  chars += delta.length;
                  writer.write({ type: "text-delta", id: textId, delta });
                }
              } catch (error) {
                streamError = error;
              }
              if (streamError) {
                lastError = streamError;
                console.error(`[chat] ${attempt.label} falhou`, streamError);
              } else if (chars === 0) {
                lastError = new Error(
                  `O provedor (${attempt.label}) respondeu vazio. Tente outro modelo.`,
                );
                console.error(`[chat] ${attempt.label} respondeu vazio`);
              }
              writer.write({
                type: "data-attempt",
                transient: true,
                data: {
                  phase: lastError ? ("error" as const) : ("done" as const),
                  provider: attempt.provider,
                  model: attempt.modelId,
                  index: index + 1,
                  total: attempts.length,
                  fallback: index > 0,
                  ms: Date.now() - t0,
                  chars,
                  ...(lastError
                    ? {
                        error: rawReason(lastError),
                        status: (lastError as { statusCode?: number } | null)?.statusCode ?? null,
                        willFallback: chars === 0 && index < attempts.length - 1,
                      }
                    : {}),
                },
              });
              if (!lastError) break;
              // se já streamou texto parcial, não tenta outro provedor
              if (chars > 0) break;
            }


            if (!lastError) {
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
              data: { reason, partial: hadText, raw: rawReason(lastError) },
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
