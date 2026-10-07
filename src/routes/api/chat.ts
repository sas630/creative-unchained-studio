import { createFileRoute } from "@tanstack/react-router";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";

import {
  geminiFallbackModels,
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
  openaiKeys?: string | null;
  openaiModel?: string | null;
  kimiKeys?: string | null;
  kimiModel?: string | null;
  openrouterKeys?: string | null;
  openrouterModel?: string | null;
  chatId?: string | null;
  intense?: boolean;
  fast?: boolean;
};

// Auto-regulagem: lembra o último provedor que funcionou (por instância).
const lastGood = new Map<string, number>();

import { INTENSE_RULES } from "@/lib/roleplay-prompt";
import { createClient } from "@supabase/supabase-js";




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
  if (body.intense) lines.push(`\n${INTENSE_RULES(c?.name)}`);
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
        const openaiKeys = parseApiKeyList(body.openaiKeys);
        const kimiKeys = parseApiKeyList(body.kimiKeys);
        const openrouterKeys = parseApiKeyList(body.openrouterKeys);
        if (geminiKeys.length + openaiKeys.length + kimiKeys.length + openrouterKeys.length === 0) {
          return new Response(
            "Adicione uma chave do OpenRouter, Gemini, OpenAI ou Kimi em Ajustes.",
            { status: 400 },
          );
        }

        const temperature =
          typeof body.creativity === "number" && body.creativity >= 0 && body.creativity <= 2
            ? body.creativity
            : 0.9;
        const system = buildSystemPrompt(body) +
          (body.fast ? "\n\nMODO RÁPIDO: responda em 1 a 3 parágrafos curtos, direto ao ponto." : "");
        // Histórico completo vai para a IA (modo rápido usa só o recente).
        const allMessages = (body.messages as UIMessage[]).filter((m) =>
          m.parts?.some((p) => p.type === "text" && (p as { text?: string }).text?.trim()),
        );
        const modelMessages = await convertToModelMessages(
          body.fast ? allMessages.slice(-20) : allMessages,
        );

        // Salvamento pelo servidor: a resposta é gravada mesmo se a tela apagar.
        const authHeader = request.headers.get("authorization");
        const chatId = typeof body.chatId === "string" ? body.chatId : null;
        let db: ReturnType<typeof createClient> | null = null;
        let userId: string | null = null;
        if (authHeader?.startsWith("Bearer ") && chatId) {
          const supaKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
          db = createClient(process.env.SUPABASE_URL!, supaKey, {
            auth: { persistSession: false },
            global: { headers: { Authorization: authHeader } },
          });
          const { data } = await db.auth.getUser(authHeader.slice(7));
          userId = data.user?.id ?? null;
          if (!userId) db = null;
        }
        const lastUser = [...allMessages].reverse().find((m) => m.role === "user");
        const lastUserText = lastUser
          ? lastUser.parts.map((p) => (p.type === "text" ? p.text : "")).join("")
          : "";
        if (db && userId && lastUserText) {
          const { error } = await db
            .from("chat_messages")
            .insert({ chat_id: chatId, user_id: userId, role: "user", content: lastUserText } as never);
          if (error) console.error("[chat] save user error", error);
        }

        type Attempt = {
          label: string;
          provider: string;
          modelId: string;
          key: string;
          run: (onError: (error: unknown) => void, signal?: AbortSignal) => ReturnType<typeof streamText>;
        };
        const attempts: Attempt[] = [];
        const add = (
          label: string,
          providerName: string,
          modelId: string,
          baseURL: string,
          key: string,
          temp: number | undefined,
        ) =>
          attempts.push({
            label,
            provider: providerName,
            modelId,
            key,
            run: (onErr, signal) => {
              const provider = createOpenAICompatible({
                name: label.split("#")[0],
                baseURL,
                headers: { Authorization: `Bearer ${key}` },
              });
              return streamText({
                model: provider(modelId),
                maxRetries: 0,
                temperature: temp,
                system,
                messages: modelMessages,
                abortSignal: signal,
                onError: ({ error }) => {
                  console.error(`[chat] ${label} error`, error);
                  onErr(error);
                },
              });
            },
          });

        const geminiModelId = resolveGeminiModelId(body.geminiModel);
        const [firstGemini, ...otherGemini] = [geminiModelId, ...geminiFallbackModels(geminiModelId)];
        const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
        const addGemini = (modelId: string) =>
          geminiKeys.forEach((key, i) =>
            add(`gemini#${i + 1}:${modelId}`, `Gemini (chave ${i + 1}/${geminiKeys.length})`, modelId, GEMINI_URL, key, temperature),
          );
        // Ordem anti-falha: OpenRouter → Gemini preferido → Kimi → OpenAI → outros Gemini.
        // Só modelos gratuitos: modelo escolhido (se for :free) + roteador grátis oficial.
        const chosenOr = (body.openrouterModel || "").trim();
        const orModels = Array.from(new Set([
          ...(chosenOr.endsWith(":free") || chosenOr === "openrouter/free" ? [chosenOr] : []),
          "openrouter/free",
          "google/gemma-4-31b-it:free",
          "nvidia/nemotron-3.5-lightning:free",
        ])).filter((m) => m !== "meta-llama/llama-3.3-70b-instruct:free");
        orModels.forEach((orModel) =>
          openrouterKeys.forEach((key, i) =>
            add(`openrouter#${i + 1}:${orModel}`, `OpenRouter (chave ${i + 1}/${openrouterKeys.length})`, orModel, "https://openrouter.ai/api/v1", key, temperature),
          ),
        );
        addGemini(firstGemini);
        const kimiModel = (body.kimiModel || "kimi-k2-0905-preview").trim();
        kimiKeys.forEach((key, i) =>
          add(`kimi#${i + 1}:${kimiModel}`, `Kimi (chave ${i + 1}/${kimiKeys.length})`, kimiModel, "https://api.moonshot.ai/v1", key, Math.min(temperature, 1)),
        );
        const openaiModel = (body.openaiModel || "gpt-4o-mini").trim();
        const openaiTemp = /^(gpt-5|o\d)/.test(openaiModel) ? undefined : temperature;
        openaiKeys.forEach((key, i) =>
          add(`openai#${i + 1}:${openaiModel}`, `OpenAI (chave ${i + 1}/${openaiKeys.length})`, openaiModel, "https://api.openai.com/v1", key, openaiTemp),
        );
        otherGemini.forEach(addGemini);
        // Fallback: se todas as tentativas falharem (402/429/etc), entregamos uma
        // resposta local em vez de quebrar o chat — o usuário pode reenviar depois.
        const stream = createUIMessageStream({
          originalMessages: body.messages as UIMessage[],
          execute: async ({ writer: rawWriter }) => {
            // Se o celular desconectar, continuamos gerando e salvamos no banco.
            const writer = {
              write: (part: Parameters<typeof rawWriter.write>[0]) => {
                try {
                  rawWriter.write(part);
                } catch {
                  /* cliente saiu — segue gerando */
                }
              },
            };
            const badKeys = new Set<string>();
            let fullText = "";
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
              if (badKeys.has(attempt.key)) continue;
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
                  fullText += delta;
                  writer.write({ type: "text-delta", id: textId, delta });
                }
              } catch (error) {
                streamError = error;
              }
              if (streamError) {
                lastError = streamError;
                const st = (streamError as { statusCode?: number } | null)?.statusCode;
                // chave inválida/bloqueada: não tenta de novo com outros modelos
                if (st === 400 || st === 401 || st === 403) badKeys.add(attempt.key);
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


            if (fullText.trim() && db && userId) {
              const { error } = await db
                .from("chat_messages")
                .insert({ chat_id: chatId, user_id: userId, role: "assistant", content: fullText } as never);
              if (error) console.error("[chat] save assistant error", error);
              await db.from("chats").update({ updated_at: new Date().toISOString() } as never).eq("id", chatId!);
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
