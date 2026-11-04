# Fazer o chat voltar a responder (Gemini)

## O que eu testei agora, com as suas 13 chaves salvas

- **Chaves 3 e 13 estão mortas**: o Google responde "Invalid Auth key" (é esse o "Bad Request"). As outras 11 respondem.
- **"Not found" vem dos modelos antigos** (2.5, 2.0, 1.5): o Google diz "não está mais disponível para novos usuários". Isso não volta.
- **gemini-flash-lite-latest responde (200)** nas chaves boas.
- **gemini-flash-latest e gemini-3.5-flash estão lotados agora** ("high demand", erro 503) — é temporário, mas hoje o app trata isso como "modelo não existe" e desiste dele.
- O modelo salvo em Ajustes é **gemini-3-flash-preview**, que não é o mais estável.
- Algumas chaves demoram mais de 15 s para responder.

Conclusão: o problema não é "todos os modelos quebrados". É a combinação de 2 chaves mortas + modelos lotados + o app classificando errado e desistindo cedo, mostrando só o último erro.

## O que vou mudar

1. **Primeiro passo: reproduzir com a sua conversa real** do Matsumi pelo próprio chat e registrar a mensagem exata do Google em cada tentativa, para confirmar se existe algum "Bad Request" vindo do formato da conversa (e não da chave). Se existir, corrijo o formato enviado.
2. **Erro 400 só derruba a chave quando o Google disser que a chave é inválida.** Outros 400 (formato do pedido) não vão mais queimar as 13 chaves uma por uma.
3. **Modelo lotado (503) não é mais tratado como "não existe"**: o app tenta as outras chaves e volta a ele depois, em vez de descartá-lo.
4. **Ordem fixa e curta**: começa em gemini-flash-lite-latest (o que funciona hoje), depois 1 ou 2 alternativas. Nada de 2.5/2.0/1.5 na lista de Ajustes.
5. **Chaves mortas marcadas em Ajustes** ("chave 3 inválida", "chave 13 inválida") para você apagar ou trocar; o chat pula essas chaves sem perder tempo.
6. **Quando o Google bloquear pelo filtro de conteúdo**, aparece uma mensagem clara ("o Google bloqueou essa fala — edite e reenvie") em vez de "respondeu vazio" repetido em todos os modelos.
7. **Teste final pela tela de verdade**: entrar na sua conta, mandar mensagens na conversa do Matsumi e confirmar que a resposta aparece e fica salva.

## O que não dá para garantir

Cota grátis do Google tem limite e às vezes fica lotada. O que muda é que o app vai usar todas as chaves boas e modelos que existem antes de desistir, e vai dizer exatamente o motivo.

## Detalhes técnicos

- `src/routes/api/chat.ts`: classificar por `responseBody` (`Invalid Auth key`/`API_KEY` → badKeys; 404 → emptyModels; 503/429 → cooldown por chave+modelo, sem descartar o modelo); reconhecer `finish_reason: content_filter` e emitir erro específico; aplicar a mesma sanitização de corpo do `createGeminiProvider` (remove `stream_options`, `parallel_tool_calls`, `user`).
- `src/lib/ai-gateway.server.ts`: `GEMINI_MODELS` reduzido e ordenado começando por `gemini-flash-lite-latest`.
- `src/routes/_authenticated/settings.tsx`: lista de modelos atualizada e botão "Testar chaves" mostrando quais estão inválidas.
