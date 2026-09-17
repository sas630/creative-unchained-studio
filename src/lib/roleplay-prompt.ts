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
};

/** Prompt de sistema do roleplay — usado no servidor e no modo local (navegador). */
export function buildRoleplaySystemPrompt(ctx: PromptContext) {
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
