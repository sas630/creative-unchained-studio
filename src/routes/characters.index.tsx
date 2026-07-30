import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CharacterCard } from "@/components/CharacterCard";

export const Route = createFileRoute("/characters/")({
  head: () => ({
    meta: [
      { title: "Personagens — Lumen" },
      {
        name: "description",
        content: "Explore personagens públicos criados pela comunidade e comece um roleplay em um clique.",
      },
      { property: "og:title", content: "Personagens — Lumen" },
      { property: "og:description", content: "Explore personagens de roleplay e comece uma cena agora." },
    ],
  }),
  component: CharactersPage,
});

function CharactersPage() {
  const [query, setQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["public-characters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("characters")
        .select("*")
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.tagline ?? "").toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [data, query]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl tracking-tight">Personagens</h1>
            <p className="mt-2 text-muted-foreground">
              Escolha alguém para conversar ou crie o seu próprio.
            </p>
          </div>
          <Button asChild>
            <Link to="/characters/new">
              <Plus className="size-4" /> Criar personagem
            </Link>
          </Button>
        </div>

        <div className="relative mt-8 max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, resumo ou tag"
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <p className="mt-12 text-sm text-muted-foreground">Carregando personagens…</p>
        ) : filtered.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">Nenhum personagem público ainda.</p>
            <Button asChild className="mt-5">
              <Link to="/characters/new">Seja o primeiro a criar</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => (
              <CharacterCard key={c.id} character={c} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
