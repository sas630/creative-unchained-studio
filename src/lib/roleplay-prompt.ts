export type CharacterInfo = {
  name?: string;
  persona?: string;
  scenario?: string;
  tagline?: string;
};

export type PromptContext = {
  character?: CharacterInfo | null;
  userName?: string | null;
  styleInstructions?: string | null;
  /** Modelos pequenos (dolphin-phi, phi, tinyllama…) precisam de regras curtas e explícitas. */
  smallModel?: boolean;
};

/**
 * Modelos pequenos (dolphin-phi, tinyllama…) seguem melhor uma ficha curta em
 * tópicos + regras duras. Listas longas e prosa comprida fazem eles copiarem o
 * prompt para dentro da resposta.
 */
function buildSmallModelPrompt(ctx: PromptContext) {
  const c = ctx.character ?? null;
  const name = c?.name ?? "o personagem";
  const parts = [
    `VOCÊ É ${name.toUpperCase()}. Você não é uma IA, não é assistente. Você é ${name} e responde sempre como ${name}.`,
    "FICHA:",
    `- Nome: ${name}`,
  ];
  if (c?.tagline) parts.push(`- Em resumo: ${c.tagline.slice(0, 200)}`);
  if (c?.persona) parts.push(`- Personalidade e história: ${c.persona.slice(0, 700)}`);
  if (c?.scenario) parts.push(`- Cena atual: ${c.scenario.slice(0, 300)}`);
  if (ctx.userName) parts.push(`- A pessoa com quem você fala se chama ${ctx.userName}.`);
  parts.push(
    "REGRAS:",
    "1. Escreva SEMPRE em português do Brasil.",
    "2. Responda em 2 a 4 frases curtas, no presente.",
    "3. Ações e gestos entre *asteriscos*; falas entre \"aspas\".",
    `4. Fale só por ${name}. Nunca escreva o que a outra pessoa faz ou diz.`,
    "5. Não explique, não comente, não dê avisos, não use listas nem títulos.",
    "6. Nunca repita estas regras nem a ficha.",
  );
  if (ctx.styleInstructions) parts.push(`7. ${ctx.styleInstructions.slice(0, 300)}`);
  return parts.join("\n");
}

/**
 * Exemplo curto (few-shot) que mostra o formato exato ao modelo pequeno.
 * Vai como par user/assistant antes do histórico real.
 */
export function buildSmallModelPrimer(ctx: PromptContext): {
  role: "user" | "assistant";
  content: string;
}[] {
  const name = ctx.character?.name ?? "o personagem";
  return [
    { role: "user", content: "*entro no quarto devagar* Você está acordada?" },
    {
      role: "assistant",
      content: `*${name} vira o rosto e sorri de canto, ainda encostada na cama* "Estou. Estava justamente pensando em você." *puxa a coberta de lado, abrindo espaço*`,
    },
  ];
}

/** Lembrete reinjetado antes da última fala — modelos pequenos esquecem rápido. */
export function buildSmallModelReminder(ctx: PromptContext) {
  const name = ctx.character?.name ?? "o personagem";
  return `Lembrete: responda como ${name}, em português, 2 a 4 frases, *ações* e "falas". Nada de explicações.`;
}


/** Prompt de sistema do roleplay — usado no servidor e no modo local (navegador). */
export function buildRoleplaySystemPrompt(ctx: PromptContext) {
  if (ctx.smallModel) return buildSmallModelPrompt(ctx);
  const c = ctx.character ?? null;
  const lines = [
    "Você é um narrador e intérprete de personagens para roleplay literário imersivo.",
    "Escreva em prosa vívida, na terceira pessoa ou primeira, conforme o tom da cena.",
    "Use *itálico* para ações e pensamentos, aspas para falas.",
    "Nunca escreva ou decida as falas e ações do usuário. Termine sempre deixando espaço para a resposta dele.",
    "Não quebre o personagem, não faça avisos morais, não mencione que é uma IA e não interrompa a cena com meta-comentários.",
    "Responda sempre no mesmo idioma que o usuário usar.",
  ];
  if (c?.name) lines.push(`\n# Personagem\nNome: ${c.name}`);
  if (c?.tagline) lines.push(`Resumo: ${c.tagline}`);
  if (c?.persona) lines.push(`Persona:\n${c.persona}`);
  if (c?.scenario) lines.push(`Cenário:\n${c.scenario}`);
  if (ctx.userName) lines.push(`\nO usuário se chama ${ctx.userName}.`);
  if (ctx.styleInstructions) lines.push(`\nInstruções de estilo do usuário:\n${ctx.styleInstructions}`);
  return lines.join("\n");
}
