import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { generatePersona } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/characters/new")({
  head: () => ({
    meta: [
      { title: "Criar personagem — Lumen" },
      { name: "description", content: "Monte uma persona completa para roleplay, do zero ou com ajuda da IA." },
      { property: "og:title", content: "Criar personagem — Lumen" },
      { property: "og:description", content: "Monte uma persona completa para roleplay com IA." },
    ],
  }),
  component: NewCharacter,
});

const ACCENTS = [
  "linear-gradient(135deg, oklch(0.45 0.15 300), oklch(0.35 0.12 260))",
  "linear-gradient(135deg, oklch(0.5 0.14 40), oklch(0.35 0.1 20))",
  "linear-gradient(135deg, oklch(0.45 0.12 180), oklch(0.32 0.1 220))",
  "linear-gradient(135deg, oklch(0.42 0.14 350), oklch(0.3 0.1 320))",
];

function NewCharacter() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [persona, setPersona] = useState("");
  const [scenario, setScenario] = useState("");
  const [greeting, setGreeting] = useState("");
  const [tags, setTags] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function autoPersona() {
    if (!name.trim()) {
      toast.error("Dê um nome ao personagem primeiro");
      return;
    }
    setGenerating(true);
    try {
      const { persona: text } = await generatePersona({
        data: { name: name.trim(), idea: tagline.trim() || persona.trim() || name.trim() },
      });
      setPersona(text);
    } catch {
      toast.error("Não foi possível gerar a persona agora");
    } finally {
      setGenerating(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada");
      const { data, error } = await supabase
        .from("characters")
        .insert({
          user_id: auth.user.id,
          name: name.trim(),
          tagline: tagline.trim() || null,
          persona: persona.trim(),
          scenario: scenario.trim() || null,
          greeting: greeting.trim() || null,
          avatar_url: avatarUrl.trim() || null,
          accent,
          is_public: isPublic,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Personagem criado");
      navigate({ to: "/characters/$characterId", params: { characterId: data.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar");
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
        <h1 className="mt-4 font-serif text-4xl tracking-tight">Novo personagem</h1>

        <form onSubmit={save} className="mt-8 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tagline">Resumo curto</Label>
              <Input
                id="tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Caçadora de relíquias com passado obscuro"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="persona">Persona</Label>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={generating}
                onClick={() => void autoPersona()}
              >
                <Sparkles className="size-4" />
                {generating ? "Gerando…" : "Gerar com IA"}
              </Button>
            </div>
            <Textarea
              id="persona"
              rows={8}
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="Aparência, temperamento, história, motivações, jeito de falar…"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="scenario">Cenário</Label>
            <Textarea
              id="scenario"
              rows={4}
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="Onde a cena começa e qual é a situação inicial"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="greeting">Primeira mensagem</Label>
            <Textarea
              id="greeting"
              rows={4}
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="Como o personagem abre a cena"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
              <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avatar">URL do avatar (opcional)</Label>
              <Input id="avatar" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex gap-2">
              {ACCENTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAccent(a)}
                  aria-label="Escolher cor"
                  className={`size-9 rounded-lg border-2 ${accent === a ? "border-primary" : "border-transparent"}`}
                  style={{ background: a }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/70 p-4">
            <div>
              <p className="text-sm">Público</p>
              <p className="text-sm text-muted-foreground">
                Deixa o personagem visível para todo mundo na galeria.
              </p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>

          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Salvando…" : "Criar personagem"}
          </Button>
        </form>
      </main>
    </div>
  );
}
