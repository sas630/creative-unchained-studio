import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Ajustes — Lumen" },
      { name: "description", content: "Escolha o modelo, a criatividade e o estilo padrão das suas cenas." },
      { property: "og:title", content: "Ajustes — Lumen" },
      { property: "og:description", content: "Modelo, criatividade e estilo padrão das suas cenas." },
    ],
  }),
  component: SettingsPage,
});

const MODELS = [
  { id: "google/gemini-3.6-flash", label: "Lumen Rápido — equilibrado e veloz" },
  { id: "google/gemini-3.1-pro-preview", label: "Lumen Profundo — prosa mais rica" },
  { id: "openai/gpt-5.4-mini", label: "Lumen Preciso — foco em coerência" },
  { id: "openai/gpt-5.5", label: "Lumen Máximo — o mais capaz" },
];

const FREE_MODELS = [
  { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3 — grátis, ótimo em roleplay" },
  { id: "deepseek/deepseek-r1:free", label: "DeepSeek R1 — grátis, raciocina mais" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B — grátis, prosa solta" },
  { id: "mistralai/mistral-nemo:free", label: "Mistral Nemo — grátis, rápido" },
  { id: "google/gemma-3-27b-it:free", label: "Gemma 3 27B — grátis, leve" },
];

function SettingsPage() {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [creativity, setCreativity] = useState(0.9);
  const [style, setStyle] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [freeModel, setFreeModel] = useState(FREE_MODELS[0].id);
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!data) return;
    setDisplayName(data.display_name ?? "");
    setModel(data.default_model);
    setCreativity(Number(data.creativity));
    setStyle(data.style_instructions ?? "");
    setApiKey(data.openrouter_api_key ?? "");
    setFreeModel(data.openrouter_model ?? FREE_MODELS[0].id);
  }, [data]);

  async function save() {
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName || null,
        default_model: model,
        creativity,
        style_instructions: style || null,
        openrouter_api_key: apiKey.trim() || null,
        openrouter_model: freeModel,
      })
      .eq("id", auth.user.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Ajustes salvos");
    void queryClient.invalidateQueries({ queryKey: ["profile"] });
  }


  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-12">
        <h1 className="font-serif text-4xl tracking-tight">Ajustes</h1>
        <p className="mt-2 text-muted-foreground">
          Tudo aqui é gratuito e ilimitado. Escolha só como você gosta de escrever.
        </p>

        <div className="mt-8 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Seu nome nas cenas</Label>
            <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Modelo padrão</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Criatividade</Label>
              <span className="text-sm text-muted-foreground">{creativity.toFixed(2)}</span>
            </div>
            <Slider
              value={[creativity]}
              min={0}
              max={1.6}
              step={0.05}
              onValueChange={([v]) => setCreativity(v)}
            />
            <p className="text-xs text-muted-foreground">
              Mais baixo = coerente e previsível. Mais alto = surpreendente e ousado.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="style">Estilo padrão</Label>
            <Textarea
              id="style"
              rows={4}
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="Ex.: prosa densa, parágrafos longos, muito subtexto"
            />
          </div>

          <div className="space-y-4 rounded-2xl border border-border/70 bg-card/40 p-5">
            <div>
              <Label htmlFor="orkey" className="text-base">
                Sua chave de IA (ilimitada e grátis)
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Com uma chave própria do OpenRouter as mensagens não consomem nada do app. Crie
                grátis em{" "}
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  openrouter.ai/keys
                </a>
                , cole abaixo e escolha um modelo gratuito.
              </p>
            </div>
            <Input
              id="orkey"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
            />
            <div className="space-y-2">
              <Label>Modelo gratuito</Label>
              <Select value={freeModel} onValueChange={setFreeModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {apiKey.trim()
                ? "Ativa: suas cenas usam sua chave primeiro e só caem no modelo do app se ela falhar."
                : "Sem chave, as cenas usam o modelo do app (sujeito aos créditos do projeto)."}
            </p>
          </div>



          <Button size="lg" disabled={busy} onClick={() => void save()}>
            {busy ? "Salvando…" : "Salvar ajustes"}
          </Button>
        </div>
      </main>
    </div>
  );
}
