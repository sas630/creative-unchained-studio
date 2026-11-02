import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { norm, parseDateQuery } from "@/lib/search-date";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({
    meta: [
      { title: "Buscar — Lumen" },
      { name: "description", content: "Procure palavras e datas em todas as suas conversas." },
      { property: "og:title", content: "Buscar — Lumen" },
      { property: "og:description", content: "Busca em todas as suas conversas." },
    ],
  }),
  component: SearchPage,
});

type Row = { id: string; chat_id: string; role: string; content: string; created_at: string };

function SearchPage() {
  const [q, setQ] = useState("");
  const chats = useQuery({
    queryKey: ["search-chats"],
    queryFn: async () => {
      const { data, error } = await supabase.from("chats").select("id,title");
      if (error) throw error;
      return new Map(data.map((c) => [c.id, c.title as string]));
    },
  });
  const msgs = useQuery({
    queryKey: ["search-msgs"],
    queryFn: async () => {
      const all: Row[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("chat_messages")
          .select("id,chat_id,role,content,created_at")
          .order("created_at", { ascending: false })
          .range(from, from + 999);
        if (error) throw error;
        all.push(...(data as Row[]));
        if (data.length < 1000) break;
      }
      return all.map((m) => ({ ...m, n: norm(m.content) }));
    },
  });

  const results = useMemo(() => {
    if (!q.trim() || !msgs.data) return [];
    const date = parseDateQuery(q);
    const words = norm(date ? date.rest : q).split(" ").filter(Boolean);
    return msgs.data
      .filter((m) => {
        if (date) {
          const t = new Date(m.created_at);
          if (t < date.from || t >= date.to) return false;
        }
        return words.every((w) => m.n.includes(w));
      })
      .slice(0, 200);
  }, [q, msgs.data]);

  const snippet = (m: { content: string; n: string }) => {
    const w = norm(q).split(" ").find((x) => x && m.n.includes(x));
    const i = w ? m.n.indexOf(w) : 0;
    return (i > 60 ? "…" : "") + m.content.slice(Math.max(0, i - 60), i + 140) + "…";
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Ex.: "beijo", "ontem", "sábado passado", "15/10 matsumi"'
            className="pl-9"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {msgs.isLoading ? "Carregando mensagens…" : q.trim() ? `${results.length} resultado(s)` : `${msgs.data?.length ?? 0} mensagens prontas para busca`}
        </p>
        <ul className="mt-4 space-y-2">
          {results.map((m) => (
            <li key={m.id}>
              <Link
                to="/chat/$chatId"
                params={{ chatId: m.chat_id }}
                className="block rounded-lg border border-border bg-card p-3 hover:bg-secondary"
              >
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{chats.data?.get(m.chat_id) ?? "Conversa"} · {m.role === "user" ? "Você" : "Personagem"}</span>
                  <span>{new Date(m.created_at).toLocaleString("pt-BR")}</span>
                </div>
                <p className="mt-1 line-clamp-3 text-sm">{snippet(m)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
