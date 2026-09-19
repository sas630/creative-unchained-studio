import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { generatePersona } from "@/lib/ai.functions";
import { streamLocalChat } from "@/lib/local-ai";
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
  { label: "Violeta", value: "linear-gradient(135deg, oklch(0.62 0.2 300), oklch(0.42 0.16 265))" },
  { label: "Âmbar", value: "linear-gradient(135deg, oklch(0.75 0.17 70), oklch(0.5 0.15 35))" },
  { label: "Turquesa", value: "linear-gradient(135deg, oklch(0.7 0.14 190), oklch(0.45 0.13 225))" },
  { label: "Rosa", value: "linear-gradient(135deg, oklch(0.68 0.2 350), oklch(0.44 0.17 320))" },
  { label: "Verde", value: "linear-gradient(135deg, oklch(0.72 0.17 145), oklch(0.45 0.14 165))" },
  { label: "Rubro", value: "linear-gradient(135deg, oklch(0.62 0.22 25), oklch(0.38 0.17 10))" },
  { label: "Azul", value: "linear-gradient(135deg, oklch(0.65 0.18 255), oklch(0.4 0.15 275))" },
  { label: "Grafite", value: "linear-gradient(135deg, oklch(0.55 0.02 280), oklch(0.3 0.02 280))" },
];

type ProfileAi = {
  gemini_api_keys: string | null;
  gemini_model: string | null;
  local_base_url: string | null;
  local_model: string | null;
  local_api_key: string | null;
  local_enabled: boolean | null;
};

const PERSONA_SYSTEM =
  "Você escreve fichas de personagem para roleplay. Devolva apenas o texto da persona, sem títulos, sem avisos e sem comentários. De 120 a 220 palavras cobrindo aparência, temperamento, história, motivações, jeito de falar e limites emocionais.";

function NewCharacter() {
  const navigate = useNavigate();
  const [ai, setAi] = useState<ProfileAi | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("gemini_api_keys, gemini_model, local_base_url, local_model, local_api_key, local_enabled")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (active && data) setAi(data as ProfileAi);
    })();
    return () => {
      active = false;
    };
  }, []);
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [persona, setPersona] = useState("");
  const [scenario, setScenario] = useState("");
  const [greeting, setGreeting] = useState("");
  const [tags, setTags] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [accent, setAccent] = useState<string>(ACCENTS[0].value);
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function autoPersona() {
    if (!name.trim()) {
      toast.error("Dê um nome ao personagem primeiro");
      return;
    }
    const idea = tagline.trim() || persona.trim() || name.trim();
    setGenerating(true);
    setPersona("");
    try {
      // 1) Modelo no PC do usuário, quando ligado nos Ajustes.
      if (ai?.local_enabled && ai.local_base_url?.trim() && ai.local_model?.trim()) {
        let acc = "";
        await streamLocalChat({
          baseUrl: ai.local_base_url,
          apiKey: ai.local_api_key,
          model: ai.local_model,
          temperature: 0.9,
          messages: [
            { role: "system", content: PERSONA_SYSTEM },
            { role: "user", content: `Nome do personagem: ${name.trim()}\nIdeia: ${idea}` },
          ],
          onDelta: (d) => {
            acc += d;
            setPersona(acc);
          },
        });
        return;
      }

      // 2) Chaves grátis do Gemini salvas nos Ajustes (com fallback do app no servidor).
      const { persona: text } = await generatePersona({
        data: {
          name: name.trim(),
          idea,
          geminiKeys: ai?.gemini_api_keys ?? undefined,
          geminiModel: ai?.gemini_model ?? undefined,
        },
      });
      setPersona(text);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar a persona agora");
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
            <div className="flex flex-wrap items-center gap-3">
              {ACCENTS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAccent(a.value)}
                  aria-label={`Escolher cor ${a.label}`}
                  aria-pressed={accent === a.value}
                  title={a.label}
                  className={`grid size-10 place-items-center rounded-xl ring-2 ring-offset-2 ring-offset-background transition ${
                    accent === a.value ? "ring-primary" : "ring-transparent hover:ring-border"
                  }`}
                  style={{ background: a.value }}
                >
                  {accent === a.value && <Check className="size-4 text-white drop-shadow" />}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border/70 p-3">
              <span
                className="grid size-12 shrink-0 place-items-center rounded-xl font-serif text-lg text-white"
                style={{ background: accent }}
              >
                {(name.trim().slice(0, 1) || "?").toUpperCase()}
              </span>
              <p className="text-sm text-muted-foreground">
                Prévia do avatar com a cor escolhida (usada quando não há imagem).
              </p>
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
