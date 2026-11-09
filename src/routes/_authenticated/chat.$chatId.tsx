import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, FastForward, Flame, GitBranch, Pencil, RotateCcw, Send, Square, Trash2, Volume2, VolumeX, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { buildRoleplaySystemPrompt, INTENSE_RULES } from "@/lib/roleplay-prompt";
import { streamLocalChat } from "@/lib/local-ai";
import { CharacterAvatar } from "@/components/CharacterCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDelete } from "@/components/ConfirmDelete";

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

type AttemptEvent = {
  phase: "start" | "first-token" | "done" | "error";
  provider: string;
  model: string;
  index: number;
  total: number;
  fallback: boolean;
  ms?: number;
  chars?: number;
  error?: string;
  status?: number | null;
  willFallback?: boolean;
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
      initialAlts={Object.fromEntries(
        data.messages
          .filter((m) => Array.isArray(m.alternatives) && (m.alternatives as unknown[]).length > 1)
          .map((m) => [m.id, m.alternatives as string[]]),
      )}
      profile={data.profile}
    />
  );
}

function ChatSurface({
  chatId,
  title,
  snapshot,
  initialMessages,
  initialAlts,
  profile,
}: {
  initialAlts: Record<string, string[]>;
  chatId: string;
  title: string;
  snapshot: Snapshot | null;
  initialMessages: UIMessage[];
  profile: {
    display_name: string | null;
    user_persona?: string | null;
    default_model: string;
    creativity: number;
    style_instructions: string | null;
    gemini_api_keys?: string | null;
    gemini_model?: string | null;
    local_enabled?: boolean | null;
    local_base_url?: string | null;
    local_model?: string | null;
    local_api_key?: string | null;
  } | null;
}) {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const persistedIds = useRef(new Set(initialMessages.map((m) => m.id)));
  const localIds = useRef(new Set<string>());
  const [intense, setIntense] = useState(false);
  useEffect(() => {
    setIntense(localStorage.getItem(`lumen-intense-${chatId}`) === "1");
  }, [chatId]);
  function toggleIntense() {
    const next = !intense;
    setIntense(next);
    localStorage.setItem(`lumen-intense-${chatId}`, next ? "1" : "0");
    toast(next ? "Modo intenso ligado: o personagem não vai amolecer." : "Modo intenso desligado.");
  }
  const [spicy, setSpicy] = useState(false);
  useEffect(() => {
    setSpicy(localStorage.getItem(`lumen-spicy-${chatId}`) === "1");
  }, [chatId]);
  function toggleSpicy() {
    const next = !spicy;
    setSpicy(next);
    localStorage.setItem(`lumen-spicy-${chatId}`, next ? "1" : "0");
    toast(next ? "Modo picante ligado." : "Modo picante desligado.");
  }

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
          userPersona: profile?.user_persona,
          geminiKeys: profile?.gemini_api_keys,
          geminiModel: profile?.gemini_model,
          ...(typeof window !== "undefined"
            ? {
                openaiKeys: localStorage.getItem("lumen-openai-keys") ?? "",
                openaiModel: localStorage.getItem("lumen-openai-model") ?? "",
                kimiKeys: localStorage.getItem("lumen-kimi-keys") ?? "",
                kimiModel: localStorage.getItem("lumen-kimi-model") ?? "",
                openrouterKeys: localStorage.getItem("lumen-openrouter-keys") ?? "",
                openrouterModel: localStorage.getItem("lumen-openrouter-model") ?? "",
                hordeKey: localStorage.getItem("lumen-horde-enabled") === "1" ? (localStorage.getItem("lumen-horde-keys") || "0000000000") : "",
              }
            : {}),
          intense,
          spicy,
          chatId,
        },
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    [snapshot, profile, intense, spicy, chatId],
  );


  const [attempts, setAttempts] = useState<AttemptEvent[]>([]);

  const [alts, setAlts] = useState<Record<string, string[]>>(initialAlts);
  const pendingAlts = useRef<string[] | null>(null);
  const { messages, sendMessage, status, setMessages, regenerate: chatRegenerate } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    onData: (part) => {
      if (part.type !== "data-attempt") return;
      const data = part.data as AttemptEvent;
      setAttempts((prev) => {
        const next = prev.filter(
          (a) => !(a.index === data.index && (a.phase === "start" || data.phase !== "first-token")),
        );
        return [...next, data];
      });
    },
    onError: (error) => toast.error(error.message || "A IA não respondeu. Tente de novo."),
  });

  const [localBusy, setLocalBusy] = useState(false);
  const localMode = Boolean(
    profile?.local_enabled && profile?.local_base_url && profile?.local_model,
  );
  // Modelos minúsculos (dolphin-phi, phi, tinyllama, qwen 0.5b…) precisam de
  // instruções mais duras e contexto curto para não fugirem do assunto.
  const isSmallLocalModel = /phi|tiny|0\.5b|1\.1b|1b|mini|small|gemma:2b/i.test(
    profile?.local_model ?? "",
  );
  const isLoading = status === "submitted" || status === "streaming" || localBusy;

  // Mantém a tela acordada enquanto a resposta é gerada.
  useEffect(() => {
    if (!isLoading || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as unknown as { wakeLock: { request: (t: string) => Promise<typeof lock> } }).wakeLock
      .request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, [isLoading]);

  // Ao voltar para o app, recarrega do banco a resposta salva pelo servidor.
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== "visible" || isLoading) return;
      const last = messages[messages.length - 1];
      if (last && last.role === "assistant" && !isFallback(last)) return;
      const { data } = await supabase
        .from("chat_messages")
        .select("id, role, content")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });
      if (!data?.length || data[data.length - 1].role !== "assistant") return;
      const fresh: UIMessage[] = data.map((r) => ({
        id: r.id,
        role: r.role as UIMessage["role"],
        parts: [{ type: "text", text: r.content }],
      }));
      fresh.forEach((m) => persistedIds.current.add(m.id));
      setMessages(fresh);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [messages, isLoading, chatId, setMessages]);


  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    if (status !== "ready" || localBusy) return;
    inputRef.current?.focus();
    const unsaved = messages.filter(
      (m) => !persistedIds.current.has(m.id) && !isFallback(m),
    );
    if (unsaved.length === 0) return;
    unsaved.forEach((m) => persistedIds.current.add(m.id));
    // Respostas pela nuvem já são salvas pelo servidor; aqui só o modo local.
    const localOnly = unsaved.filter((m) => localIds.current.has(m.id));
    if (localOnly.length === 0) return;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const rows = localOnly.map((m) => ({
        chat_id: chatId,
        user_id: auth.user!.id,
        role: m.role,
        content: textOf(m),
      }));
      const { error } = await supabase.from("chat_messages").insert(rows);
      if (error) console.error("[chat] persist error", error);
      await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
    })();
  }, [messages, status, chatId, localBusy]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Swipes: quando a nova versão chega, junta com as anteriores.
  useEffect(() => {
    if (status !== "ready" || !pendingAlts.current) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const prev = pendingAlts.current;
    pendingAlts.current = null;
    if (isFallback(last)) return;
    setAlts((a) => ({ ...a, [last.id]: [...prev, textOf(last)] }));
  }, [status, messages]);

  async function pickAlt(m: UIMessage, idx: number) {
    const list = alts[m.id];
    if (!list || isLoading) return;
    const next = list[(idx + list.length) % list.length];
    const current = textOf(m);
    setMessages((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, parts: [{ type: "text", text: next }] } : x)),
    );
    await supabase
      .from("chat_messages")
      .update({ content: next, alternatives: list })
      .eq("chat_id", chatId)
      .eq("role", "assistant")
      .eq("content", current);
  }

  // ---- Continuar no mesmo balão / nova versão de qualquer fala ----
  const [workingId, setWorkingId] = useState<string | null>(null);
  async function streamRaw(history: UIMessage[], extra: Record<string, unknown>, onDelta: (d: string) => void) {
    const { data: s } = await supabase.auth.getSession();
    const token = s.session?.access_token;
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        character: snapshot,
        creativity: profile?.creativity,
        styleInstructions: profile?.style_instructions,
        userName: profile?.display_name,
        userPersona: profile?.user_persona,
        geminiKeys: profile?.gemini_api_keys,
        geminiModel: profile?.gemini_model,
        openaiKeys: localStorage.getItem("lumen-openai-keys") ?? "",
        openaiModel: localStorage.getItem("lumen-openai-model") ?? "",
        kimiKeys: localStorage.getItem("lumen-kimi-keys") ?? "",
        kimiModel: localStorage.getItem("lumen-kimi-model") ?? "",
        openrouterKeys: localStorage.getItem("lumen-openrouter-keys") ?? "",
        openrouterModel: localStorage.getItem("lumen-openrouter-model") ?? "",
        hordeKey: localStorage.getItem("lumen-horde-enabled") === "1" ? (localStorage.getItem("lumen-horde-keys") || "0000000000") : "",
        intense,
        spicy,
        chatId,
        raw: true,
        messages: history,
        ...extra,
      }),
    });
    if (!res.ok || !res.body) throw new Error(await res.text().catch(() => "Falhou"));
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let failed = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(line.slice(5).trim());
          if (ev.type === "data-fallback") failed = true;
          else if (ev.type === "text-delta" && !String(ev.delta).includes("⏸️")) onDelta(ev.delta);
        } catch {
          /* linha [DONE] */
        }
      }
    }
    if (failed) throw new Error("A IA não respondeu agora. Tente de novo em instantes.");
  }

  async function continueMsg(m: UIMessage) {
    if (isLoading || workingId) return;
    const idx = messages.findIndex((x) => x.id === m.id);
    const original = textOf(m);
    let text = original;
    setWorkingId(m.id);
    try {
      await streamRaw(messages.slice(0, idx + 1), { continueText: original }, (d) => {
        if (text === original && !/^[\s.,;:!?…)"”]/.test(d) && !/\s$/.test(text)) d = " " + d;
        text += d;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, parts: [{ type: "text", text }] } : x)));
      });
      const list = alts[m.id]?.map((a) => (a === original ? text : a));
      if (list) setAlts((a) => ({ ...a, [m.id]: list }));
      await supabase
        .from("chat_messages")
        .update({ content: text, ...(list ? { alternatives: list } : {}) })
        .eq("chat_id", chatId)
        .eq("role", "assistant")
        .eq("content", original);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para continuar.");
    } finally {
      setWorkingId(null);
    }
  }

  async function newVersion(m: UIMessage) {
    if (isLoading || workingId) return;
    const idx = messages.findIndex((x) => x.id === m.id);
    const original = textOf(m);
    const base = alts[m.id]?.length ? alts[m.id] : [original];
    let text = "";
    setWorkingId(m.id);
    try {
      await streamRaw(messages.slice(0, idx), {}, (d) => {
        text += d;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, parts: [{ type: "text", text }] } : x)));
      });
      if (!text.trim()) throw new Error("Resposta vazia.");
      const list = [...base, text];
      setAlts((a) => ({ ...a, [m.id]: list }));
      await supabase
        .from("chat_messages")
        .update({ content: text, alternatives: list })
        .eq("chat_id", chatId)
        .eq("role", "assistant")
        .eq("content", original);
    } catch (e) {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, parts: [{ type: "text", text: original }] } : x)));
      toast.error(e instanceof Error ? e.message : "Não deu para gerar outra versão.");
    } finally {
      setWorkingId(null);
    }
  }

  // ---- Leitura em voz alta (voz do navegador: grátis e sem limites) ----
  const [voiceOn, setVoiceOn] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const spokenIds = useRef(new Set(initialMessages.map((m) => m.id)));

  useEffect(() => {
    setVoiceOn(localStorage.getItem("lumen-voice") === "1");
    return () => window.speechSynthesis?.cancel();
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeakingId(null);
  }

  async function speakWithGemini(m: UIMessage, clean: string) {
    setSpeakingId(m.id);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, keys: profile?.gemini_api_keys ?? "" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      const done = () => {
        URL.revokeObjectURL(url);
        setSpeakingId((cur) => (cur === m.id ? null : cur));
      };
      audio.onended = done;
      audio.onerror = done;
      await audio.play();
    } catch (error) {
      setSpeakingId(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível ler em voz alta.");
    }
  }

  function speak(m: UIMessage) {
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    const clean = textOf(m).replace(/[*_#`>~]/g, "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    // Voz neural do Gemini (natural, não robótica) por padrão.
    if (profile?.gemini_api_keys?.trim()) {
      void speakWithGemini(m, clean);
      return;
    }
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    const voices = synth?.getVoices() ?? [];
    if (!synth || typeof SpeechSynthesisUtterance === "undefined" || voices.length === 0) {
      void speakWithGemini(m, clean);
      return;
    }
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = "pt-BR";
    const voice = voices.find((v) => v.lang?.toLowerCase().startsWith("pt"));
    if (voice) utter.voice = voice;
    utter.onend = () => setSpeakingId((cur) => (cur === m.id ? null : cur));
    utter.onerror = () => void speakWithGemini(m, clean);
    setSpeakingId(m.id);
    synth.speak(utter);
  }

  function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    localStorage.setItem("lumen-voice", next ? "1" : "0");
    if (!next) stopSpeaking();
  }

  useEffect(() => {
    if (status !== "ready" || localBusy) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || isFallback(last) || spokenIds.current.has(last.id)) return;
    spokenIds.current.add(last.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, status, localBusy, voiceOn]);

  /** Modo local: a chamada sai do navegador direto para o PC do usuário. */
  async function sendLocal(text: string) {
    const userMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text }],
    };
    const history = [...messages.filter((m) => !isFallback(m)), userMessage];
    const assistantId = crypto.randomUUID();
    localIds.current.add(userMessage.id);
    localIds.current.add(assistantId);
    setMessages([...history, { id: assistantId, role: "assistant", parts: [{ type: "text", text: "" }] }]);
    setLocalBusy(true);
    setAttempts([
      {
        phase: "start",
        provider: "Seu PC (modelo local)",
        model: profile?.local_model ?? "local",
        index: 1,
        total: 1,
        fallback: false,
      },
    ]);
    const started = Date.now();
    try {
      let acc = "";
      const chars = await streamLocalChat({
        baseUrl: profile!.local_base_url!,
        apiKey: profile?.local_api_key ?? null,
        model: profile!.local_model!,
        // Modelos pequenos ficam incoerentes com temperatura alta.
        temperature: Math.min(profile?.creativity ?? 0.9, isSmallLocalModel ? 0.75 : 1.2),
        messages: [
          {
            role: "system",
            content: buildRoleplaySystemPrompt({
              character: snapshot,
              userName: profile?.display_name ?? null,
              styleInstructions:
                [profile?.style_instructions, intense ? INTENSE_RULES(snapshot?.name) : ""]
                  .filter(Boolean)
                  .join("\n") || null,
              smallModel: isSmallLocalModel,
            }),
          },
          // Modelo pequeno = contexto curto: só as últimas trocas, senão ele se perde.
          ...history
            .slice(isSmallLocalModel ? -10 : -40)
            .map((m) => ({
              role: m.role === "user" ? ("user" as const) : ("assistant" as const),
              content: textOf(m),
            })),
        ],
        onDelta: (delta) => {
          acc += delta;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, parts: [{ type: "text", text: acc }] } : m,
            ),
          );
        },
      });
      setAttempts([
        {
          phase: "done",
          provider: "Seu PC (modelo local)",
          model: profile?.local_model ?? "local",
          index: 1,
          total: 1,
          fallback: false,
          ms: Date.now() - started,
          chars,
        },
      ]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setAttempts([
        {
          phase: "error",
          provider: "Seu PC (modelo local)",
          model: profile?.local_model ?? "local",
          index: 1,
          total: 1,
          fallback: false,
          ms: Date.now() - started,
          error: reason,
        },
      ]);
      toast.error(
        `O modelo no seu PC não respondeu (${reason}). Confira se o programa está aberto e se ele aceita conexões do navegador.`,
      );
    } finally {
      setLocalBusy(false);
    }
  }

  // Grava a fala no banco ANTES de chamar a IA: nunca se perde.
  async function saveUserFirst(text: string) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return false;
    const { error } = await supabase
      .from("chat_messages")
      .insert({ chat_id: chatId, user_id: auth.user.id, role: "user", content: text });
    if (error) {
      toast.error("Não consegui salvar sua fala: " + error.message);
      return false;
    }
    await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
    return true;
  }

  async function sendCloud(text: string) {
    const saved = await saveUserFirst(text);
    await sendMessage({ text }, { body: { userSaved: saved } });
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    setAttempts([]);
    if (localMode) {
      await sendLocal(text);
      return;
    }
    await sendCloud(text);
  }

  const fallbackMessage = messages.length > 0 && isFallback(messages[messages.length - 1])
    ? messages[messages.length - 1]
    : null;

  const fallbackData = (fallbackMessage?.parts.find((p) => p.type === "data-fallback") as
    | { data?: { reason?: string; raw?: string } }
    | undefined)?.data;
  const fallbackReason = fallbackData?.reason ?? "A IA não respondeu.";
  const fallbackRaw = fallbackData?.raw;


  async function resend() {
    if (isLoading || !fallbackMessage) return;
    const withoutFallback = messages.filter((m) => m.id !== fallbackMessage.id);
    const lastUser = [...withoutFallback].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // a fala do usuário fica salva; só pedimos a resposta de novo
    setMessages(withoutFallback);
    setAttempts([]);
    await chatRegenerate({ body: { userSaved: true } });
  }

  async function regenerate() {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser || isLoading) return;
    if (localMode) {
      await removeRows(lastAssistant ? [lastAssistant, lastUser] : [lastUser]);
      setMessages(messages.filter((m) => m.id !== lastAssistant?.id && m.id !== lastUser.id));
      await sendLocal(textOf(lastUser));
      return;
    }
    let previous: string[] = [];
    let trimmed = messages;
    if (lastAssistant && messages[messages.length - 1]?.id === lastAssistant.id) {
      if (!isFallback(lastAssistant)) {
        previous = alts[lastAssistant.id] ?? [textOf(lastAssistant)];
        await removeRows([lastAssistant]);
      }
      trimmed = messages.slice(0, -1);
    }
    pendingAlts.current = previous.length ? previous : null;
    setMessages(trimmed);
    setAttempts([]);
    await chatRegenerate({ body: { userSaved: true, alternatives: previous } });
  }

  async function removeRows(list: UIMessage[]) {
    for (const m of list) {
      persistedIds.current.delete(m.id);
      const text = textOf(m);
      if (!text) continue;
      await supabase
        .from("chat_messages")
        .delete()
        .eq("chat_id", chatId)
        .eq("role", m.role)
        .eq("content", text);
    }
  }

  async function deleteMessage(target: UIMessage) {
    if (isLoading) return;
    const index = messages.findIndex((m) => m.id === target.id);
    const text = textOf(target);
    const { data: backup } = text
      ? await supabase
          .from("chat_messages")
          .select("*")
          .eq("chat_id", chatId)
          .eq("role", target.role)
          .eq("content", text)
      : { data: [] };
    setMessages((prev) => prev.filter((m) => m.id !== target.id));
    await removeRows([target]);
    toast("Mensagem apagada", {
      duration: 10000,
      action: {
        label: "Recuperar",
        onClick: async () => {
          if (backup?.length) {
            const { error } = await supabase.from("chat_messages").insert(backup);
            if (error) {
              toast.error(error.message);
              return;
            }
          }
          persistedIds.current.add(target.id);
          setMessages((prev) => {
            const next = [...prev];
            next.splice(Math.min(index, next.length), 0, target);
            return next;
          });
          toast.success("Mensagem recuperada");
        },
      },
    });
  }

  async function saveEdit(target: UIMessage, draft?: string) {
    const text = (draft ?? editText).trim();
    if (!text || isLoading) return;
    if (target.role === "assistant") {
      const oldText = textOf(target);
      setEditingId(null);
      setEditText("");
      setMessages(
        messages.map((m) =>
          m.id === target.id ? { ...m, parts: [{ type: "text", text }] } : m,
        ),
      );
      const { error } = await supabase
        .from("chat_messages")
        .update({ content: text })
        .eq("chat_id", chatId)
        .eq("role", "assistant")
        .eq("content", oldText);
      if (error) toast.error(error.message);
      return;
    }
    const index = messages.findIndex((m) => m.id === target.id);
    if (index < 0) return;
    const tail = messages.slice(index);
    setEditingId(null);
    setEditText("");
    setMessages(messages.slice(0, index));
    setAttempts([]);
    await removeRows(tail);
    if (localMode) await sendLocal(text);
    else await sendCloud(text);
  }

  async function branchFrom(target: UIMessage) {
    if (isLoading) return;
    const index = messages.findIndex((m) => m.id === target.id);
    if (index < 0) return;
    const kept = messages.slice(0, index + 1).filter((m) => !isFallback(m) && textOf(m));
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data: chat, error } = await supabase
      .from("chats")
      .insert({
        user_id: auth.user.id,
        title: `${title} (ramificação)`,
        character_snapshot: snapshot as never,
      })
      .select("id")
      .single();
    if (error || !chat) {
      toast.error(error?.message ?? "Não foi possível ramificar.");
      return;
    }
    if (kept.length > 0) {
      const { error: msgError } = await supabase.from("chat_messages").insert(
        kept.map((m) => ({
          chat_id: chat.id,
          user_id: auth.user!.id,
          role: m.role,
          content: textOf(m),
        })),
      );
      if (msgError) {
        toast.error(msgError.message);
        return;
      }
    }
    toast.success("Ramificação criada. Continue a cena daqui.");
    void navigate({ to: "/chat/$chatId", params: { chatId: chat.id } });
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b border-border/60 bg-background/95 px-2 py-2 backdrop-blur-xl sm:gap-3 sm:px-4 sm:py-3">
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
        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant={spicy ? "destructive" : "ghost"}
            onClick={toggleSpicy}
            title="Modo picante: cenas românticas e sensuais mais quentes"
          >
            🌶️ Picante
          </Button>
          <Button
            size="sm"
            variant={intense ? "destructive" : "ghost"}
            onClick={toggleIntense}
            title="Modo super intenso: o personagem nunca amolece"
          >
            <Flame className="size-4" /> Intenso
          </Button>
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
            {/* Memoizado: digitar não re-renderiza o histórico inteiro */}
            {useMemo(() => messages.map((m) => (
              <div
                key={m.id}
                className={`group flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                {editingId === m.id ? (
                  <EditMessageForm
                    initial={editText}
                    isUser={m.role === "user"}
                    onCancel={() => setEditingId(null)}
                    onSave={(t) => void saveEdit(m, t)}
                  />
                ) : (
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
                )}

                {m.role === "assistant" && !isFallback(m) && editingId !== m.id && (() => {
                  const list = alts[m.id]?.length ? alts[m.id] : [textOf(m)];
                  const cur = Math.max(0, list.indexOf(textOf(m)));
                  const busy = isLoading || !!workingId;
                  return (
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      <Button size="icon" variant="ghost" className="size-7" aria-label="Versão anterior"
                        disabled={busy || list.length < 2} onClick={() => void pickAlt(m, cur - 1)}>
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span className="tabular-nums">{cur + 1} / {list.length}</span>
                      <Button size="icon" variant="ghost" className="size-7" aria-label="Próxima versão"
                        disabled={busy || list.length < 2} onClick={() => void pickAlt(m, cur + 1)}>
                        <ChevronRight className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy}
                        onClick={() => void newVersion(m)}>
                        <RotateCcw className="size-3.5" /> Nova versão
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy}
                        onClick={() => void continueMsg(m)}>
                        <FastForward className="size-3.5" /> {workingId === m.id ? "Escrevendo…" : "Continuar"}
                      </Button>
                    </div>
                  );
                })()}

                {editingId !== m.id && (
                  <div className="flex gap-1 opacity-80 transition-opacity hover:opacity-100">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-muted-foreground"
                      title="Ramificar a partir daqui"
                      aria-label="Ramificar a partir daqui"
                      disabled={isLoading}
                      onClick={() => void branchFrom(m)}
                    >
                      <GitBranch className="size-3.5" />
                    </Button>
                    {!isFallback(m) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-muted-foreground"
                        title={m.role === "user" ? "Editar e reenviar" : "Editar resposta"}
                        aria-label={m.role === "user" ? "Editar e reenviar" : "Editar resposta"}
                        disabled={isLoading}
                        onClick={() => {
                          setEditingId(m.id);
                          setEditText(textOf(m));
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    )}
                    {m.role === "assistant" && !isFallback(m) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-muted-foreground"
                        title={speakingId === m.id ? "Parar áudio" : "Ouvir"}
                        aria-label={speakingId === m.id ? "Parar áudio" : "Ouvir"}
                        onClick={() => (speakingId === m.id ? stopSpeaking() : speak(m))}
                      >
                        {speakingId === m.id ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                      </Button>
                    )}
                    <ConfirmDelete
                      title="Tem certeza que deseja apagar esta mensagem?"
                      onConfirm={() => void deleteMessage(m)}
                    >
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        title="Apagar mensagem"
                        aria-label="Apagar mensagem"
                        disabled={isLoading}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </ConfirmDelete>
                  </div>
                )}
              </div>
            // eslint-disable-next-line react-hooks/exhaustive-deps
            )), [messages, editingId, isLoading, speakingId, alts, workingId])}

            {(status === "submitted" || attempts.length > 0) && (
              <div className="flex justify-start">
                <div className="max-w-[92%] rounded-2xl bg-card/60 px-5 py-4 text-sm text-muted-foreground">
                  {status === "submitted" && (
                    <span className="inline-flex gap-1">
                      <span className="animate-pulse">●</span>
                      <span className="animate-pulse [animation-delay:150ms]">●</span>
                      <span className="animate-pulse [animation-delay:300ms]">●</span>
                    </span>
                  )}
                  {attempts.length > 0 && (
                    <ul className="mt-2 space-y-1 font-mono text-[11px] leading-relaxed">
                      {attempts.map((a, i) => (
                        <li
                          key={`${a.index}-${a.phase}-${i}`}
                          className={a.phase === "error" ? "text-amber-300" : ""}
                        >
                          <span className="text-foreground/70">
                            {a.fallback ? "↪ " : ""}{a.provider} · {a.model}
                          </span>{" "}
                          {a.phase === "start" && "conectando…"}
                          {a.phase === "first-token" && `1º token em ${a.ms} ms`}
                          {a.phase === "done" && `ok · ${a.chars} chars · ${a.ms} ms`}
                          {a.phase === "error" &&
                            `falhou${a.status ? ` (HTTP ${a.status})` : ""} em ${a.ms} ms — ${a.error}${
                              a.willFallback ? " · tentando o próximo provedor…" : ""
                            }`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      {fallbackMessage && (
        <div className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{fallbackReason}</p>
              {fallbackRaw && fallbackRaw !== fallbackReason && (
                <p className="mt-1 break-words font-mono text-[11px] text-amber-300/80">
                  {fallbackRaw}
                </p>
              )}
            </div>
            <Button size="sm" variant="secondary" disabled={isLoading} onClick={() => void resend()}>
              <RotateCcw className="size-4" /> Reenviar
            </Button>
          </div>
        </div>
      )}


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

function isFallback(message: UIMessage) {
  return message.parts.some((part) => part.type === "data-fallback");
}

function textOf(message: UIMessage) {

  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

function EditMessageForm({
  initial,
  isUser,
  onCancel,
  onSave,
}: {
  initial: string;
  isUser: boolean;
  onCancel: () => void;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <div className="w-full max-w-[92%] space-y-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="resize-none" autoFocus />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="size-4" /> Cancelar
        </Button>
        <Button size="sm" onClick={() => onSave(text)}>
          <Check className="size-4" /> {isUser ? "Salvar e reenviar" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
