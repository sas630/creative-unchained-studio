## Objetivo

Um app no estilo DreamGen: landing page, chat de roleplay com personagens e editor de histórias com IA — com contas de usuário, dados salvos na nuvem e nenhum limite, contador ou paywall dentro do produto.

## Nota importante sobre "gratuito e sem limites"

A IA roda pelo Lovable AI, que consome créditos da **sua** conta Lovable. O app não terá nenhum limite de tokens, mensagens ou paywall para os usuários — mas o custo de uso real recai sobre a sua conta. Não existe forma de ser literalmente ilimitado e sem custo no servidor.

## Backend (Lovable Cloud)

Ativar o Lovable Cloud para contas e persistência.

Tabelas:
- `profiles` — display name, avatar, bio (criada por trigger no signup)
- `characters` — nome, descrição, persona, primeira mensagem, tags, avatar, público/privado
- `scenarios` — cenário/mundo opcional ligado a um personagem
- `chats` + `chat_messages` — sessões de roleplay e mensagens (role, content, ordem)
- `stories` + `story_chapters` — histórias longas, com texto, notas de enredo e instruções de estilo

Todas com RLS: cada usuário lê/escreve só o que é seu; personagens marcados como públicos ficam visíveis para todos (leitura).

Autenticação: e-mail/senha + Google. Sem confirmação de e-mail obrigatória para entrada rápida.

## Telas

1. **Landing (`/`)** — hero escuro no estilo DreamGen, proposta de valor, blocos de features (roleplay, escrita, personagens, sem censura), amostras de personagens, CTA de criar conta. Sem seção de preços/planos (é tudo grátis).
2. **`/auth`** — login/cadastro.
3. **`/characters`** — biblioteca: personagens públicos + os seus, busca e filtro por tags.
4. **`/characters/new` e `/characters/$id/edit`** — criador de personagem (nome, avatar gerado ou upload, persona, cenário, mensagem de abertura, tags).
5. **`/chat`** — lista de conversas na barra lateral + botão de nova conversa.
6. **`/chat/$chatId`** — chat de roleplay em streaming: bolhas de mensagem, regenerar resposta, editar mensagem, apagar, continuar, indicador de digitação, memória completa da conversa.
7. **`/stories`** — lista de histórias.
8. **`/stories/$id`** — editor de escrita: painel de texto principal, botões "Continuar", "Reescrever seleção", "Expandir", campo de instrução de estilo, painel lateral com notas de enredo/personagens, capítulos, contagem de palavras (informativa, não limitante).
9. **`/settings`** — perfil, preferências de estilo padrão, temperatura/criatividade, apagar conta.

## Design

Direção visual escura no estilo DreamGen: fundo quase preto, superfícies em cinza-carvão, acento roxo/violeta, tipografia serifada para prosa e sans para UI, cantos suaves. Tudo via tokens semânticos em `src/styles.css`.

## Detalhes técnicos

- TanStack Start; rotas protegidas em `src/routes/_authenticated/`.
- Streaming de IA por server route `src/routes/api/chat.ts` (AI SDK + `streamText` + Lovable AI Gateway), usando `useChat` no cliente.
- Modelo padrão `google/gemini-3.6-flash`; seletor de modelo em Settings com as opções do gateway.
- Histórico completo enviado a cada chamada; persistência de mensagens em `onFinish`.
- Ações não-streaming (reescrever, resumir, gerar persona) via `createServerFn`.
- Sem contadores de token, sem quotas, sem tela de upgrade em nenhum lugar do app.

## Ordem de construção

1. Ativar Cloud + migração de schema e RLS + auth
2. Design system e landing page
3. Personagens (biblioteca + criador)
4. Chat de roleplay em streaming
5. Editor de histórias
6. Settings e polimento
