import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Feather, Plus, Trash2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/stories/")({
  head: () => ({
    meta: [
      { title: "Suas histórias — Lumen" },
      { name: "description", content: "Seus romances, contos e capítulos escritos com apoio da IA." },
      { property: "og:title", content: "Suas histórias — Lumen" },
      { property: "og:description", content: "Seus romances e contos escritos com apoio da IA." },
    ],
  }),
  component: StoriesPage,
});

function StoriesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [premise, setPremise] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["stories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stories")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function create() {
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada");
      const { data: story, error } = await supabase
        .from("stories")
        .insert({
          user_id: auth.user.id,
          title: title.trim() || "História sem título",
          genre: genre.trim() || null,
          premise: premise.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: chapterError } = await supabase.from("story_chapters").insert({
        story_id: story.id,
        user_id: auth.user.id,
        title: "Capítulo 1",
        position: 1,
      });
      if (chapterError) throw chapterError;
      setOpen(false);
      navigate({ to: "/stories/$storyId", params: { storyId: story.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("stories").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["stories"] });
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl tracking-tight">Suas histórias</h1>
            <p className="mt-2 text-muted-foreground">
              Escreva capítulos longos com a IA como copiloto.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> Nova história
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova história</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Título</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="genre">Gênero</Label>
                  <Input
                    id="genre"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    placeholder="Fantasia sombria, romance, noir…"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="premise">Premissa</Label>
                  <Textarea
                    id="premise"
                    rows={4}
                    value={premise}
                    onChange={(e) => setPremise(e.target.value)}
                    placeholder="Do que trata a história"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button disabled={busy} onClick={() => void create()}>
                  {busy ? "Criando…" : "Criar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <p className="mt-10 text-sm text-muted-foreground">Carregando…</p>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center">
            <Feather className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-muted-foreground">Nenhuma história ainda.</p>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {data!.map((story) => (
              <li
                key={story.id}
                className="flex flex-col rounded-2xl border border-border/70 bg-card/50 p-5"
              >
                <Link to="/stories/$storyId" params={{ storyId: story.id }} className="flex-1">
                  <h2 className="font-serif text-xl">{story.title}</h2>
                  {story.genre && <p className="mt-1 text-xs text-primary/80">{story.genre}</p>}
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                    {story.premise || "Sem premissa definida."}
                  </p>
                </Link>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(story.updated_at).toLocaleDateString("pt-BR")}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Excluir história"
                    onClick={() => void remove(story.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
