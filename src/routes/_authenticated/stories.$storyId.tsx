import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Settings2, Sparkles, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/stories/$storyId")({
  head: () => ({
    meta: [
      { title: "Editor de história — Lumen" },
      { name: "description", content: "Escreva capítulos longos com continuar, reescrever e expandir." },
      { property: "og:title", content: "Editor de história — Lumen" },
      { property: "og:description", content: "Escreva capítulos longos com apoio da IA." },
    ],
  }),
  component: StoryEditor,
});

type Action = "continue" | "rewrite" | "expand" | "describe";

function StoryEditor() {
  const { storyId } = Route.useParams();
  const queryClient = useQueryClient();
  const [activeChapter, setActiveChapter] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [instruction, setInstruction] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["story", storyId],
    queryFn: async () => {
      const [{ data: story, error }, { data: chapters, error: chError }, { data: profile }] =
        await Promise.all([
          supabase.from("stories").select("*").eq("id", storyId).maybeSingle(),
          supabase
            .from("story_chapters")
            .select("*")
            .eq("story_id", storyId)
            .order("position", { ascending: true }),
          supabase.from("profiles").select("*").maybeSingle(),
        ]);
      if (error) throw error;
      if (chError) throw chError;
      return { story, chapters: chapters ?? [], profile };
    },
  });

  useEffect(() => {
    if (!data?.chapters.length) return;
    const current = data.chapters.find((c) => c.id === activeChapter) ?? data.chapters[0];
    if (current.id !== activeChapter) {
      setActiveChapter(current.id);
      setContent(current.content);
    }
  }, [data, activeChapter]);

  function scheduleSave(chapterId: string, value: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void supabase
        .from("story_chapters")
        .update({ content: value, updated_at: new Date().toISOString() })
        .eq("id", chapterId);
      void supabase
        .from("stories")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", storyId);
    }, 700);
  }

  function updateContent(value: string) {
    setContent(value);
    if (activeChapter) scheduleSave(activeChapter, value);
  }

  async function addChapter() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user || !data) return;
    const position = (data.chapters.at(-1)?.position ?? 0) + 1;
    const { data: chapter, error } = await supabase
      .from("story_chapters")
      .insert({
        story_id: storyId,
        user_id: auth.user.id,
        title: `Capítulo ${position}`,
        position,
      })
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["story", storyId] });
    setActiveChapter(chapter.id);
    setContent("");
  }

  async function run(action: Action) {
    if (!data?.story) return;
    const area = areaRef.current;
    const selection =
      area && area.selectionStart !== area.selectionEnd
        ? content.slice(area.selectionStart, area.selectionEnd)
        : "";
    if ((action === "rewrite" || action === "expand") && !selection) {
      toast.error("Selecione um trecho do texto primeiro");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);

    const insertAt = action === "continue" || action === "describe" ? content.length : null;
    const selStart = area?.selectionStart ?? 0;
    const selEnd = area?.selectionEnd ?? 0;

    try {
      const response = await fetch("/api/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          action,
          text: content,
          selection,
          instruction,
          title: data.story.title,
          genre: data.story.genre,
          premise: data.story.premise,
          plotNotes: data.story.plot_notes,
          styleInstructions: data.story.style_instructions ?? data.profile?.style_instructions,
          model: data.profile?.default_model,
          creativity: data.profile?.creativity,
          openrouterKey: data.profile?.openrouter_api_key,
          openrouterModel: data.profile?.openrouter_model,

        }),
      });
      if (!response.ok || !response.body) {
        throw new Error(response.status === 429 ? "Muitas requisições, tente em instantes." : "A IA não respondeu.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      const base = content;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const next =
          insertAt !== null
            ? `${base}${base.trim() && !base.endsWith("\n") ? "\n\n" : ""}${acc}`
            : `${base.slice(0, selStart)}${acc}${base.slice(selEnd)}`;
        setContent(next);
      }
      if (activeChapter) scheduleSave(activeChapter, areaRef.current?.value ?? content);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast.error(error instanceof Error ? error.message : "Erro ao gerar");
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  if (isLoading) return <p className="p-10 text-sm text-muted-foreground">Carregando…</p>;
  if (!data?.story) {
    return (
      <div className="p-10">
        <p className="text-muted-foreground">História não encontrada.</p>
        <Link to="/stories" className="mt-3 inline-block text-primary hover:underline">
          Voltar
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-xl">
        <Button asChild size="icon" variant="ghost" aria-label="Voltar">
          <Link to="/stories">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <p className="truncate font-serif text-lg leading-tight">{data.story.title}</p>
          <p className="text-xs text-muted-foreground">
            {content.trim() ? content.trim().split(/\s+/).length : 0} palavras
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StorySettings storyId={storyId} story={data.story} />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Capítulos</p>
            <Button size="icon" variant="ghost" aria-label="Novo capítulo" onClick={() => void addChapter()}>
              <Plus className="size-4" />
            </Button>
          </div>
          <ul className="mt-3 space-y-1">
            {data.chapters.map((chapter) => (
              <li key={chapter.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveChapter(chapter.id);
                    setContent(chapter.content);
                  }}
                  className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    chapter.id === activeChapter
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60"
                  }`}
                >
                  {chapter.title}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-w-0 flex-1">
          <Textarea
            ref={areaRef}
            value={content}
            onChange={(e) => updateContent(e.target.value)}
            placeholder="Comece a escrever… ou clique em Continuar e deixe a IA abrir a cena."
            className="prose-story min-h-[60vh] resize-none border-border/60 bg-card/30 p-6 text-base leading-8"
          />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button disabled={generating} onClick={() => void run("continue")}>
              <Sparkles className="size-4" /> Continuar
            </Button>
            <Button variant="secondary" disabled={generating} onClick={() => void run("rewrite")}>
              Reescrever seleção
            </Button>
            <Button variant="secondary" disabled={generating} onClick={() => void run("expand")}>
              Expandir seleção
            </Button>
            <Button variant="secondary" disabled={generating} onClick={() => void run("describe")}>
              Descrever
            </Button>
            {generating && (
              <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
                <Square className="size-4" /> Parar
              </Button>
            )}
            {generating && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>

          <div className="mt-4">
            <Label htmlFor="instruction" className="text-xs uppercase tracking-widest text-muted-foreground">
              Instrução para a próxima geração
            </Label>
            <Input
              id="instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Ex.: aumente a tensão, termine com uma revelação"
              className="mt-2"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StorySettings({
  storyId,
  story,
}: {
  storyId: string;
  story: { title: string; genre: string | null; premise: string | null; plot_notes: string | null; style_instructions: string | null };
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(story);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("stories")
      .update({
        title: form.title,
        genre: form.genre,
        premise: form.premise,
        plot_notes: form.plot_notes,
        style_instructions: form.style_instructions,
      })
      .eq("id", storyId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Salvo");
    void queryClient.invalidateQueries({ queryKey: ["story", storyId] });
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant="secondary">
          <Settings2 className="size-4" /> Contexto
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Contexto da história</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-8">
          <div className="space-y-2">
            <Label htmlFor="s-title">Título</Label>
            <Input
              id="s-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-genre">Gênero</Label>
            <Input
              id="s-genre"
              value={form.genre ?? ""}
              onChange={(e) => setForm({ ...form, genre: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-premise">Premissa</Label>
            <Textarea
              id="s-premise"
              rows={4}
              value={form.premise ?? ""}
              onChange={(e) => setForm({ ...form, premise: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-notes">Notas de enredo</Label>
            <Textarea
              id="s-notes"
              rows={5}
              value={form.plot_notes ?? ""}
              onChange={(e) => setForm({ ...form, plot_notes: e.target.value })}
              placeholder="Personagens, reviravoltas planejadas, regras do mundo…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-style">Estilo</Label>
            <Textarea
              id="s-style"
              rows={3}
              value={form.style_instructions ?? ""}
              onChange={(e) => setForm({ ...form, style_instructions: e.target.value })}
              placeholder="Frases curtas, narração em primeira pessoa, tom melancólico…"
            />
          </div>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? "Salvando…" : "Salvar contexto"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
