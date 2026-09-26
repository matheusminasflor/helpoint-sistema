-- Marketing: saem os cadastros que nunca tiveram tela nem uma linha
--
-- Decisão do dono, 2026-09-26, sobre a issue 03 de `.scratch/adocao-helpoint/`:
-- "apagar os três". A issue dizia, com razão, "é decisão de domínio, não de
-- schema. Não corrigir sozinho" — a pergunta era se `mkt_artists` e
-- `mkt_influencers` eram a mesma coisa renomeada ou dois conceitos. A resposta
-- do dono tornou a pergunta desnecessária: nenhum dos dois fica.
--
-- O QUE A ISSUE 03 DESCREVIA. `mkt_artist_contracts.artist_id` carrega DUAS
-- chaves estrangeiras ao mesmo tempo:
--
--   mkt_artist_contracts_artist_id_fkey      → mkt_artists(id)
--   mkt_artist_contracts_influencer_id_fkey  → mkt_influencers(id)
--
-- O Postgres exige as duas. Para gravar um contrato, o MESMO uuid teria de
-- existir nas duas tabelas, cada uma gerando o próprio `id` — ou seja, **a
-- tabela nunca aceitou uma linha**. Aconteceu porque a migration de maio
-- (posição 84) renomeou a coluna `influencer_id` para `artist_id` e criou a FK
-- nova; `alter table ... rename column` **não remove constraint**, então a FK
-- antiga passou a apontar para a coluna sob o nome novo, guardando o nome velho.
-- Fácil de não ver lendo o schema, e nunca deu erro porque ninguém nunca usou.
--
-- ══ O QUE SAI, E POR QUE CADA UMA ═══════════════════════════════════════════
--
-- Todas com ZERO linhas no test-helpoint (produção está vazia) e ZERO referência
-- em `src/` — só aparecem no `types.ts`, que é gerado:
--
--   mkt_payout_rules          → aponta para mkt_artist_contracts
--   mkt_artist_deliveries     → aponta para mkt_artist_deliverables
--   mkt_artist_deliverables   → aponta para mkt_artist_contracts
--   mkt_artist_contracts      → a tabela ininserível da issue 03
--   mkt_event_participants    → aponta para mkt_events e mkt_influencers
--   mkt_artists
--   mkt_influencers
--
-- `mkt_artist_deliveries` (com S no fim, diferente de `deliverables`) eu NÃO
-- tinha na lista: minha primeira medição perguntou por uma lista de nomes que eu
-- mesmo escrevi, e essa não estava nela. O `drop` sem `cascade` recusou e disse o
-- nome — que é exatamente o motivo de ser sem `cascade`. Depois disso a lista
-- passou a vir de um FECHO RECURSIVO das chaves estrangeiras, não de nomes
-- lembrados:
--
--   with recursive fecho as (
--     select oid from <as três raízes>
--     union select fk.conrelid from pg_constraint fk join fecho f
--            on f.oid = fk.confrelid where fk.contype = 'f')
--
-- O fecho devolveu nove tabelas: estas sete, mais `mkt_social_posts` e
-- `mkt_ai_generations` — as duas que FICAM, porque estão no fecho só por terem
-- uma coluna apontando para dentro do grupo, não por serem do grupo.
--
-- Mais a coluna `mkt_social_posts.influencer_id`, que é o último laço preso em
-- `mkt_influencers`. `mkt_social_posts` **é usada de verdade** (a edge function
-- `mkt-publish-due` publica a partir dela), então a coluna sai com cuidado: os
-- hooks leem com `select('*')` e `useCreateSocialPost` nunca escreve
-- `influencer_id`, então a tela não vê diferença — uma coluna a menos no `*`.
--
-- A ordem é a das dependências, e o `drop` é sem `cascade` de propósito: com
-- `cascade` eu não saberia o que mais foi levado. Se alguma dependência tiver
-- aparecido depois que eu medi, a migration reprova em vez de apagar de brinde.
--
-- ══ O QUE **NÃO** SAI, E ISTO É UMA RESSALVA AO PEDIDO ══════════════════════
--
-- **`mkt_events` fica.** O dono pediu para apagar os três cadastros — influenciador,
-- artista e evento. Os dois primeiros saem; o terceiro **não dá**, e apagar em
-- silêncio seria pior que não apagar:
--
--   mkt_quotations.event_id     → `useMKTQuotations.ts:37` LÊ o evento pelo nome
--                                 (`event:mkt_events(id, title)`). Orçamentos de
--                                 Marketing é tela em uso;
--   mkt_ai_generations.event_id → `useMKTAICreative.ts:94` GRAVA o `event_id`;
--   mkt_social_posts.event_id   → mesma tabela que o publicador usa.
--
-- Apagar `mkt_events` é apagar a tela de orçamentos junto. Diferente dos outros
-- dois, ela não é cadastro órfão: é cadastro sem tela PRÓPRIA, usado por duas
-- telas que existem. Se o dono quiser que ela saia mesmo assim, é outra leva —
-- com a decisão sobre o que acontece com orçamento e com o criativo de IA.
--
-- Fica registrado em docs/nao-funciona.md, na mesma linha que conta esta.

-- As filhas, de baixo para cima: entrega → entregável → contrato.
drop table public.mkt_payout_rules;
drop table public.mkt_artist_deliveries;
drop table public.mkt_artist_deliverables;

-- O contrato — a tabela que nunca aceitou uma linha, e a razão de a issue 03
-- existir.
drop table public.mkt_artist_contracts;

-- Participante de evento: aponta para as duas que saem logo abaixo.
drop table public.mkt_event_participants;

-- O último laço em `mkt_influencers`, numa tabela que FICA. Ver a ressalva
-- acima: `select('*')` não se importa com uma coluna a menos, e nenhum lugar
-- escreve nela.
alter table public.mkt_social_posts drop column influencer_id;

drop table public.mkt_artists;
drop table public.mkt_influencers;
