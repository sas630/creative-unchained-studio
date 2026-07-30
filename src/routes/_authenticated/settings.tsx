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

function SettingsPage() {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [creativity, setCreativity] = useState(0.9);
  const [style, setStyle] = useState("");
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

          <Button size="lg" disabled={busy} onClick={() => void save()}>
            {busy ? "Salvando…" : "Salvar ajustes"}
          </Button>
        </div>
      </main>
    </div>
  );
}
