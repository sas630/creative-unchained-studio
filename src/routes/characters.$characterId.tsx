import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MessageSquareHeart } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { CharacterAvatar, startChatWithCharacter } from "@/components/CharacterCard";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/characters/$characterId")({
  head: () => ({
    meta: [
      { title: "Personagem — Lumen" },
      { name: "description", content: "Veja a ficha completa do personagem e comece um roleplay." },
      { property: "og:title", content: "Personagem — Lumen" },
      { property: "og:description", content: "Veja a ficha completa do personagem e comece um roleplay." },
    ],
  }),
  component: CharacterDetail,
});

function CharacterDetail() {
  const { characterId } = Route.useParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["character", characterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("characters")
        .select("*")
        .eq("id", characterId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function start() {
    if (!data) return;
    setBusy(true);
    try {
      const result = await startChatWithCharacter(data);
      if ("redirectToAuth" in result) {
        navigate({ to: "/auth" });
        return;
      }
      navigate({ to: "/chat/$chatId", params: { chatId: result.chatId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir a conversa");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-12">
        <Link to="/characters" className="text-sm text-muted-foreground hover:text-foreground">
          ← Personagens
        </Link>

        {isLoading ? (
          <p className="mt-8 text-sm text-muted-foreground">Carregando…</p>
        ) : !data ? (
          <p className="mt-8 text-muted-foreground">Personagem não encontrado ou privado.</p>
        ) : (
          <>
            <div className="mt-6 flex items-start gap-4">
              <CharacterAvatar character={data} size="lg" />
              <div>
                <h1 className="font-serif text-4xl tracking-tight">{data.name}</h1>
                {data.tagline && <p className="mt-1 text-muted-foreground">{data.tagline}</p>}
              </div>
            </div>

            {data.tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {data.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border/70 px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <Button className="mt-7" size="lg" disabled={busy} onClick={() => void start()}>
              <MessageSquareHeart className="size-4" /> Começar conversa
            </Button>

            <section className="mt-10 space-y-8">
              <div>
                <h2 className="text-sm uppercase tracking-widest text-muted-foreground">Persona</h2>
                <p className="mt-2 whitespace-pre-wrap leading-relaxed">{data.persona}</p>
              </div>
              {data.scenario && (
                <div>
                  <h2 className="text-sm uppercase tracking-widest text-muted-foreground">Cenário</h2>
                  <p className="mt-2 whitespace-pre-wrap leading-relaxed">{data.scenario}</p>
                </div>
              )}
              {data.greeting && (
                <div>
                  <h2 className="text-sm uppercase tracking-widest text-muted-foreground">
                    Primeira mensagem
                  </h2>
                  <p className="mt-2 whitespace-pre-wrap leading-relaxed">{data.greeting}</p>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
