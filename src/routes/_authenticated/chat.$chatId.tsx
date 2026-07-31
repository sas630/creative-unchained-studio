import { createFileRoute, Link } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, RotateCcw, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { CharacterAvatar } from "@/components/CharacterCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/chat/$chatId")({
  head: () => ({
    meta: [
      { title: "Roleplay — Lumen" },
      { name: "description", content: "Cena de roleplay em tempo real com seu personagem." },
      { property: "og:title", content: "Roleplay — Lumen" },
      { property: "og:description", content: "Cena de roleplay em tempo real com seu personagem." },
    ],
  }),
  component: ChatRoom,
});

type Snapshot = {
  name?: string;
  persona?: string;
  scenario?: string;
  tagline?: string;
  avatar_url?: string | null;
  accent?: string | null;
};

function ChatRoom() {
  const { chatId } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["chat", chatId],
    queryFn: async () => {
      const [{ data: chat, error: chatError }, { data: messages, error: msgError }, { data: profile }] =
        await Promise.all([
          supabase.from("chats").select("*").eq("id", chatId).maybeSingle(),
          supabase
            .from("chat_messages")
            .select("*")
            .eq("chat_id", chatId)
            .order("created_at", { ascending: true }),
          supabase.from("profiles").select("*").maybeSingle(),
        ]);
      if (chatError) throw chatError;
      if (msgError) throw msgError;
      return { chat, messages: messages ?? [], profile };
    },
  });

  if (isLoading) {
    return <p className="p-10 text-sm text-muted-foreground">Carregando cena…</p>;
  }
  if (!data?.chat) {
    return (
      <div className="p-10">
        <p className="text-muted-foreground">Conversa não encontrada.</p>
        <Link to="/chat" className="mt-3 inline-block text-primary hover:underline">
          Voltar
        </Link>
      </div>
    );
  }

  const initial: UIMessage[] = data.messages.map((m) => ({
    id: m.id,
    role: m.role === "user" ? "user" : "assistant",
    parts: [{ type: "text", text: m.content }],
  }));

  return (
    <ChatSurface
      key={chatId}
      chatId={chatId}
      title={data.chat.title}
      snapshot={(data.chat.character_snapshot as Snapshot | null) ?? null}
      initialMessages={initial}
      profile={data.profile}
    />
  );
}

function ChatSurface({
  chatId,
  title,
  snapshot,
  initialMessages,
  profile,
}: {
  chatId: string;
  title: string;
  snapshot: Snapshot | null;
  initialMessages: UIMessage[];
  profile: { display_name: string | null; default_model: string; creativity: number; style_instructions: string | null } | null;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const persistedIds = useRef(new Set(initialMessages.map((m) => m.id)));

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: {
          character: snapshot,
          model: profile?.default_model,
          creativity: profile?.creativity,
          styleInstructions: profile?.style_instructions,
          userName: profile?.display_name,
        },
      }),
    [snapshot, profile],
  );

  const { messages, sendMessage, status, setMessages } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    onError: (error) => toast.error(error.message || "A IA não respondeu. Tente de novo."),
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    if (status !== "ready") return;
    inputRef.current?.focus();
    const unsaved = messages.filter(
      (m) => !persistedIds.current.has(m.id) && !isFallback(m),
    );
    if (unsaved.length === 0) return;
    unsaved.forEach((m) => persistedIds.current.add(m.id));
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const rows = unsaved.map((m) => ({
        chat_id: chatId,
        user_id: auth.user!.id,
        role: m.role,
        content: textOf(m),
      }));
      const { error } = await supabase.from("chat_messages").insert(rows);
      if (error) console.error("[chat] persist error", error);
      await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
    })();
  }, [messages, status, chatId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage({ text });
  }

  const fallbackMessage = messages.length > 0 && isFallback(messages[messages.length - 1])
    ? messages[messages.length - 1]
    : null;

  const fallbackReason =
    (fallbackMessage?.parts.find((p) => p.type === "data-fallback") as
      | { data?: { reason?: string } }
      | undefined)?.data?.reason ?? "A IA não respondeu.";

  async function resend() {
    if (isLoading || !fallbackMessage) return;
    const withoutFallback = messages.filter((m) => m.id !== fallbackMessage.id);
    const lastUser = [...withoutFallback].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // remove também a última fala do usuário: sendMessage a reinsere
    setMessages(withoutFallback.filter((m) => m.id !== lastUser.id));
    persistedIds.current.delete(lastUser.id);
    await supabase.from("chat_messages").delete().eq("id", lastUser.id);
    await sendMessage({ text: textOf(lastUser) });
  }

  async function regenerate() {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    if (lastAssistant) {
      await supabase.from("chat_messages").delete().eq("id", lastAssistant.id);
      persistedIds.current.delete(lastAssistant.id);
    }
    const trimmed = messages.filter((m) => m.id !== lastAssistant?.id && m.id !== lastUser.id);
    setMessages(trimmed);
    await sendMessage({ text: textOf(lastUser) });
  }


  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-xl">
        <Button asChild size="icon" variant="ghost" aria-label="Voltar">
          <Link to="/chat">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        {snapshot?.name && (
          <CharacterAvatar
            size="sm"
            character={{
              name: snapshot.name,
              avatar_url: snapshot.avatar_url ?? null,
              accent: snapshot.accent ?? null,
            }}
          />
        )}
        <div className="min-w-0">
          <p className="truncate font-serif text-lg leading-tight">{snapshot?.name ?? title}</p>
          {snapshot?.tagline && (
            <p className="truncate text-xs text-muted-foreground">{snapshot.tagline}</p>
          )}
        </div>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="ghost"
            disabled={isLoading || messages.length === 0}
            onClick={() => void regenerate()}
          >
            <RotateCcw className="size-4" /> Regenerar
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          {snapshot?.scenario && messages.length <= 1 && (
            <p className="mb-8 rounded-xl border border-border/60 bg-card/40 p-4 text-sm italic text-muted-foreground">
              {snapshot.scenario}
            </p>
          )}

          <div className="space-y-6">
            {messages.map((m) => (
              <div
                key={m.id}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 px-4 py-3 text-foreground"
                      : isFallback(m)
                        ? "prose-story max-w-[92%] rounded-2xl rounded-bl-sm border border-amber-500/30 bg-amber-500/10 px-5 py-4"
                        : "prose-story max-w-[92%] rounded-2xl rounded-bl-sm bg-card/60 px-5 py-4"
                  }
                >
                  <ReactMarkdown>{textOf(m)}</ReactMarkdown>
                </div>

              </div>
            ))}

            {status === "submitted" && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-card/60 px-5 py-4 text-sm text-muted-foreground">
                  <span className="inline-flex gap-1">
                    <span className="animate-pulse">●</span>
                    <span className="animate-pulse [animation-delay:150ms]">●</span>
                    <span className="animate-pulse [animation-delay:300ms]">●</span>
                  </span>
                </div>
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      <form
        onSubmit={submit}
        className="border-t border-border/60 bg-background/85 px-4 py-4 backdrop-blur-xl"
      >
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <Textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Escreva sua ação ou fala…"
            className="max-h-48 min-h-11 resize-none"
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()} aria-label="Enviar">
            <Send className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function textOf(message: UIMessage) {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}
