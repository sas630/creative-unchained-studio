import { useCallback, useEffect, useRef, useState } from "react";
import { CloudOff, Loader2, RefreshCw, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const HEALTH_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/auth/v1/health`;

async function pingBackend(): Promise<boolean> {
  if (!import.meta.env.VITE_SUPABASE_URL) return true;
  try {
    const res = await fetch(HEALTH_URL, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "" },
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

const STEPS = [
  "Abra o painel do backend (botão abaixo) — ele abre em outra aba.",
  "Se aparecer o aviso de que o projeto está pausado, clique em “Retomar” / “Reativar”.",
  "Aguarde de 1 a 3 minutos até o status ficar ativo.",
  "Volte para esta aba: a conexão é testada automaticamente a cada 10 segundos.",
];

export function BackendStatusBanner() {
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState(false);
  const mounted = useRef(true);

  const check = useCallback(async () => {
    setChecking(true);
    const ok = await pingBackend();
    if (!mounted.current) return ok;
    setOffline(!ok);
    setChecking(false);
    if (ok) setOpen(false);
    return ok;
  }, []);

  useEffect(() => {
    mounted.current = true;
    void check();
    return () => {
      mounted.current = false;
    };
  }, [check]);

  // Re-tenta automaticamente enquanto estiver fora do ar.
  useEffect(() => {
    if (!offline) return;
    const id = setInterval(() => void check(), 10_000);
    return () => clearInterval(id);
  }, [offline, check]);

  if (!offline) return null;

  return (
    <div className="sticky top-0 z-50 border-b border-amber-500/30 bg-amber-500/10 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
        <span className="inline-flex items-center gap-2 text-amber-200">
          <CloudOff className="size-4" />
          Sem conexão com o servidor de dados. Login e histórico ficam indisponíveis.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary">
                Como reativar
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Reativar o servidor de dados</DialogTitle>
                <DialogDescription>
                  Siga os passos abaixo. Assim que o servidor voltar, a conexão é restabelecida
                  sozinha — nada do seu conteúdo é perdido.
                </DialogDescription>
              </DialogHeader>
              <ol className="space-y-3 text-sm">
                {STEPS.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground">{step}</span>
                  </li>
                ))}
              </ol>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button asChild variant="outline" size="sm">
                  <a href="https://lovable.dev/projects" target="_blank" rel="noreferrer">
                    Abrir painel <ExternalLink className="ml-2 size-3.5" />
                  </a>
                </Button>
                <Button size="sm" onClick={() => void check()} disabled={checking}>
                  {checking ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> Testando…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 size-4" /> Testar conexão
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button size="sm" variant="ghost" onClick={() => void check()} disabled={checking}>
            {checking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
