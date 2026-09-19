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
 * Modelos pequenos copiam listas numeradas e exemplos para dentro da resposta,
 * então aqui as regras vão em prosa curta e contínua.
 */
function buildSmallModelPrompt(ctx: PromptContext) {
  const c = ctx.character ?? null;
  const lines = [
    `Você é ${c?.name ?? "o personagem"} em uma cena de roleplay.`,
    "Fique sempre no personagem e responda em português do Brasil, em duas a quatro frases, misturando ações em *itálico* e falas entre aspas.",
    "Nunca fale ou aja pelo usuário, nunca explique nada fora da cena e nunca use listas ou títulos.",
  ];
  if (c?.tagline) lines.push(`${c?.name ?? "O personagem"} é ${c.tagline}.`);
  if (c?.persona) lines.push(c.persona.slice(0, 900));
  if (c?.scenario) lines.push(`A cena acontece assim: ${c.scenario.slice(0, 400)}`);
  if (ctx.userName) lines.push(`O usuário se chama ${ctx.userName}.`);
  if (ctx.styleInstructions) lines.push(ctx.styleInstructions.slice(0, 400));
  return lines.join(" ");
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
