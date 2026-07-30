import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquareHeart, Plus, Trash2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/chat/")({
  head: () => ({
    meta: [
      { title: "Suas conversas — Lumen" },
      { name: "description", content: "Todas as suas cenas de roleplay salvas, prontas para continuar." },
      { property: "og:title", content: "Suas conversas — Lumen" },
      { property: "og:description", content: "Todas as suas cenas de roleplay salvas." },
    ],
  }),
  component: ChatList,
});

function ChatList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["chats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chats")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function newBlankChat() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data, error } = await supabase
      .from("chats")
      .insert({ user_id: auth.user.id, title: "Nova cena" })
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/chat/$chatId", params: { chatId: data.id } });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("chats").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["chats"] });
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl tracking-tight">Suas conversas</h1>
            <p className="mt-2 text-muted-foreground">Continue de onde parou.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void newBlankChat()}>
              <Plus className="size-4" /> Cena livre
            </Button>
            <Button asChild>
              <Link to="/characters">
                <MessageSquareHeart className="size-4" /> Escolher personagem
              </Link>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="mt-10 text-sm text-muted-foreground">Carregando…</p>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">Nenhuma conversa ainda.</p>
            <Button asChild className="mt-5">
              <Link to="/characters">Escolher um personagem</Link>
            </Button>
          </div>
        ) : (
          <ul className="mt-8 divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70">
            {data!.map((chat) => (
              <li key={chat.id} className="flex items-center gap-3 bg-card/40 px-5 py-4">
                <Link
                  to="/chat/$chatId"
                  params={{ chatId: chat.id }}
                  className="min-w-0 flex-1"
                >
                  <p className="truncate">{chat.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(chat.updated_at).toLocaleString("pt-BR")}
                  </p>
                </Link>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Excluir conversa"
                  onClick={() => void remove(chat.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
