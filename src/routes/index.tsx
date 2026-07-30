import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Feather, Infinity as InfinityIcon, MessageSquareHeart, Sparkles, Wand2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lumen — Roleplay com IA e escrita de histórias, sem limites" },
      {
        name: "description",
        content:
          "Crie personagens, viva roleplays imersivos e escreva histórias longas com IA. Grátis, sem limite de tokens, mensagens ou palavras.",
      },
      { property: "og:title", content: "Lumen — Roleplay com IA e escrita de histórias" },
      {
        property: "og:description",
        content: "Personagens, roleplay imersivo e um editor de histórias com IA. Grátis e sem limites.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: MessageSquareHeart,
    title: "Roleplay imersivo",
    body: "Converse com personagens que mantêm memória da cena, respondem em prosa literária e nunca quebram o papel.",
  },
  {
    icon: Feather,
    title: "Editor de histórias",
    body: "Escreva capítulos longos com continuar, reescrever, expandir e descrever — a IA escreve no seu ritmo e no seu estilo.",
  },
  {
    icon: Wand2,
    title: "Criador de personagens",
    body: "Monte personas completas do zero ou deixe a IA gerar a ficha inteira a partir de uma frase.",
  },
  {
    icon: InfinityIcon,
    title: "Sem limites",
    body: "Sem contagem de tokens, sem cota diária, sem assinatura e sem paywall escondido em lugar nenhum.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        <section className="relative overflow-hidden">
          <div className="aurora pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/60 px-3 py-1 text-xs text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" />
                Grátis para sempre · sem limite de tokens
              </span>
              <h1 className="mt-6 font-serif text-5xl leading-[1.05] tracking-tight sm:text-6xl">
                Histórias que respondem.
                <br />
                <span className="text-gradient">Personagens que ficam.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                Lumen é um estúdio de ficção com IA: roleplay em tempo real com personagens que
                você cria e um editor onde suas histórias crescem capítulo após capítulo. Sem
                cotas, sem cobrança, sem freio criativo.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Começar agora <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link to="/characters">Explorar personagens</Link>
                </Button>
              </div>
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-3xl border border-border/70 shadow-2xl shadow-black/60">
                <img
                  src={heroImage}
                  width={1600}
                  height={1008}
                  alt="Viajante encapuzado diante de uma biblioteca flutuante de páginas brilhantes"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-24">
          <div className="grid gap-4 sm:grid-cols-2">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-border/70 bg-card/60 p-6 transition-colors hover:border-primary/40"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
                  <f.icon className="size-5" />
                </span>
                <h2 className="mt-4 font-serif text-xl">{f.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-border/60 bg-card/30">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 md:grid-cols-3">
            {[
              ["01", "Crie um personagem", "Nome, persona, cenário e a primeira fala. Ou escreva uma frase e deixe a IA montar tudo."],
              ["02", "Entre na cena", "O chat responde em prosa, mantém o tom e nunca decide por você."],
              ["03", "Transforme em história", "Leve a cena para o editor e escreva capítulos longos com apoio da IA."],
            ].map(([n, title, body]) => (
              <div key={n}>
                <span className="font-serif text-4xl text-primary/70">{n}</span>
                <h3 className="mt-3 text-lg">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-3xl px-4 py-24 text-center">
          <h2 className="font-serif text-4xl tracking-tight">Sua imaginação não tem cota.</h2>
          <p className="mt-4 text-muted-foreground">
            Crie sua conta e escreva quanto quiser, hoje e sempre.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link to="/auth" search={{ mode: "signup" }}>
              Criar conta grátis <ArrowRight className="size-4" />
            </Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row">
          <span>Lumen · estúdio de ficção com IA</span>
          <span>Feito para quem escreve sem pedir licença.</span>
        </div>
      </footer>
    </div>
  );
}
