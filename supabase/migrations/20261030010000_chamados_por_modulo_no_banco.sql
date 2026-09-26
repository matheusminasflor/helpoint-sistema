-- Chamado é do módulo dele — a separação sai do navegador e entra no banco
--
-- Decisão D12 do plano da Fase 3, confirmada pelo dono em 2026-09-26 diante do
-- fato medido: **qualquer funcionário cadastrado lia TODOS os chamados da
-- empresa** pelo endereço direto. O menu esconde; o banco não escondia.
--
-- A policy de SELECT de `tickets` era:
--
--   tenant_id = get_user_tenant_id()
--   and ( requester_id = auth.uid()
--      or assigned_to = auth.uid()
--      or has_role(auth.uid(), 'member')        ← esta
--      or is_supervisor_or_higher(auth.uid()) )
--
-- `has_role(auth.uid(), 'member')` não fala de módulo nenhum: qualquer pessoa com
-- papel `member` para cima lê chamado de RH (salário, atestado), de Financeiro
-- (dinheiro), de Qualidade, do SAC. Nada no schema separava.
--
-- ══ O PEDIDO ERA UMA POLICY; O PROBLEMA SÃO DEZ ═════════════════════════════
--
-- `has_role(auth.uid(), 'member')` aparece em **dez policies, em cinco tabelas**:
--
--   tickets                 SELECT, UPDATE
--   ticket_comments         SELECT
--   ticket_attachments      SELECT, INSERT
--   ticket_checklists       SELECT, INSERT, UPDATE
--   ticket_checklist_items  SELECT, INSERT, UPDATE
--
-- Trocar só a de `tickets` seria teatro. `ticket_comments` é onde o assunto do
-- chamado realmente mora — "o atestado da semana passada", "o valor do acordo" —
-- e ficaria aberta: a pessoa não leria a LINHA do chamado de RH e leria a
-- CONVERSA dele. E a de UPDATE deixaria um membro de Marketing fechar chamado do
-- Financeiro. É a regra 8 do pgTAP no CLAUDE.md: teste a corrente, não o comando.
-- Aqui vale para a correção, não só para o teste.
--
-- ══ A REGRA NOVA, NUMA FUNÇÃO SÓ ════════════════════════════════════════════
--
-- Quem vê um chamado:
--
--   • quem abriu            (`requester_id`) — sempre, em qualquer módulo;
--   • quem atende           (`assigned_to`)  — sempre;
--   • gestor para cima      (`is_supervisor_or_higher`: owner/admin/manager) — tudo,
--     que é o que a gestão precisa e o que o front já assume;
--   • **quem tem o módulo daquele chamado** — a parte nova;
--   • **quem tem o módulo `diretoria`** — todos os módulos. Não é generosidade: o
--     painel do diretor conta "chamados por setor" da empresa inteira, e o diretor
--     puro é `member` + módulo `diretoria`, sem cargo de gestor. Sem isso ele veria
--     só o que abriu, a tela somaria esses poucos e chamaria de "a empresa" — e o
--     comentário de `RequireDiretoria` já avisava, desde setembro, que era isso
--     que aconteceria no dia em que a RLS de `tickets` mudasse. Eu quase fiz.
--
-- `modulos_de_chamado_visiveis()` devolve o ARRAY dos valores de
-- `tickets.module` que a pessoa alcança. Array, e não uma função que recebe o
-- módulo da linha, por causa do plano: a subconsulta sem correlação vira
-- initplan, então a função roda UMA vez por consulta e depois é teste de
-- pertinência em array, linha a linha. Uma função que recebesse `module` como
-- argumento rodaria por linha — com 15 chamados dá no mesmo, com 100 mil não.
--
-- E a forma escrita é, em todas as onze vezes:
--
--   module = any (coalesce((select public.modulos_de_chamado_visiveis()),
--                          array[]::text[]))
--
-- O `coalesce` **não é defesa contra nulo** — a função já devolve array vazio. Ele
-- está ali porque muda o que o Postgres entende: `any ((select …))` sozinho é a
-- forma de SUBCONSULTA do `any`, que compara cada LINHA devolvida — e a linha
-- aqui é um `text[]`, o que dá `operator does not exist: text = text[]`. Com uma
-- expressão em volta, o `any` volta a ser o de ARRAY. Errei isso na primeira
-- tentativa e a migration recusou inteira; fica escrito para não custar duas
-- vezes.
--
-- ══ O VOCABULÁRIO NÃO CASA, E ISSO É A PEGADINHA ════════════════════════════
--
-- `tickets.module` e `user_module_access.module` são duas listas DIFERENTES:
--
--   tickets.module            {tickets, marketing, qualidade, rh, financeiro,
--                              comercial, educacional}        ← CHECK da tabela
--   user_module_access.module {ti, marketing, qualidade, rh, financeiro,
--                              comercial, educacional, diretoria, expedicao, crm}
--
-- O chamado da TI tem `module = 'tickets'`; a concessão chama-se **`'ti'`**
-- (`useVisibleModules.ts:64`, `hasModuleAccess('ti')`). Seis pares batem pelo
-- nome e **um não** — e é justamente o do módulo com mais chamados (15 dos 19 no
-- test-helpoint). Escrever `uma.module = t.module` pareceria certo e esconderia a
-- TI de quem tem a TI.
--
-- Por isso o mapa é explícito, e o pgTAP compara a lista da esquerda com o CHECK
-- da tabela: **módulo novo no CHECK sem par aqui reprova o teste**. Sem essa
-- asserção, o chamado de um módulo novo ficaria invisível para todo mundo menos
-- quem o abriu — falha fechada, que é a direção segura, mas silenciosa.
--
-- ══ O QUE MUDA PARA QUEM TRABALHA HOJE ══════════════════════════════════════
--
-- Nada, hoje: as contas do test-helpoint são `owner`/`admin`, e
-- `is_supervisor_or_higher` continua vendo tudo. A mudança aparece no dia em que
-- existir um `member` de um setor só — que é exatamente o dia em que ela precisa
-- estar pronta, porque ninguém vai lembrar disso ao criar o primeiro.
--
-- Uma AMPLIAÇÃO deliberada, de passagem: `ticket_comments` ganhou
-- `assigned_to = auth.uid()`. A policy antiga deixava o responsável ler os
-- comentários só se ele fosse `member` — um `viewer` com chamado atribuído não
-- lia a conversa do próprio chamado. Corrigir isso é parte de deixar a corrente
-- coerente, não efeito colateral.

-- ───────────────────────────────────────────────────────────────────────────
-- A função. `security definer` porque `user_module_access` tem RLS própria — a
-- mesma razão de `has_comercial_access` e companhia serem.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.modulos_de_chamado_visiveis()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with mapa(concessao, modulo_do_chamado) as (values
    -- concessão em user_module_access  →  valor em tickets.module
    ('ti',          'tickets'),      -- o par que NÃO bate pelo nome
    ('marketing',   'marketing'),
    ('qualidade',   'qualidade'),
    ('rh',          'rh'),
    ('financeiro',  'financeiro'),
    ('comercial',   'comercial'),
    ('educacional', 'educacional')
  ),
  minhas as (
    select coalesce(array_agg(uma.module), array[]::text[]) as concessoes
    from public.user_module_access uma
    where uma.user_id = auth.uid()
  )
  select case
    -- A DIRETORIA VÊ TODOS OS MÓDULOS, e isto não é generosidade: o painel dela
    -- conta "chamados por setor" da empresa inteira. Sem esta linha, o diretor
    -- puro (papel `member` + módulo `diretoria`, que é como ele existe) passaria
    -- a ver só o que ele mesmo abriu — e a tela somaria esses poucos e chamaria
    -- de "a empresa". Número errado sem erro nenhum, exatamente o que o
    -- comentário de `RequireDiretoria` já avisava que aconteceria se a RLS de
    -- `tickets` mudasse. Gestor para cima já passa por `is_supervisor_or_higher`
    -- na policy; esta linha é para quem tem a Diretoria SEM ser gestor.
    when 'diretoria' = any (coalesce((select concessoes from minhas), array[]::text[]))
      then (select array_agg(modulo_do_chamado) from mapa)
    else coalesce(
      (select array_agg(m.modulo_do_chamado) from mapa m
        where m.concessao = any (coalesce((select concessoes from minhas), array[]::text[]))),
      array[]::text[])
  end;
$$;

comment on function public.modulos_de_chamado_visiveis() is
  'Os valores de tickets.module que quem está logado alcança, pela concessão em user_module_access. O par ti→tickets é o único que não bate pelo nome. Devolve array para a policy avaliar a função uma vez por consulta, não por linha.';

revoke all on function public.modulos_de_chamado_visiveis() from public, anon;
grant execute on function public.modulos_de_chamado_visiveis() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- `tickets`: ler e atualizar
-- ───────────────────────────────────────────────────────────────────────────
drop policy if exists "Users can view their own tickets" on public.tickets;
create policy "Users can view their own tickets" on public.tickets
for select using (
  tenant_id = (select public.get_user_tenant_id())
  and (
    requester_id = auth.uid()
    or assigned_to = auth.uid()
    or (select public.is_supervisor_or_higher(auth.uid()))
    or module = any (coalesce((select public.modulos_de_chamado_visiveis()), array[]::text[]))
  )
);

drop policy if exists "Technicians can update tickets" on public.tickets;
create policy "Technicians can update tickets" on public.tickets
for update using (
  tenant_id = (select public.get_user_tenant_id())
  and (
    requester_id = auth.uid()
    or assigned_to = auth.uid()
    or (select public.is_supervisor_or_higher(auth.uid()))
    or module = any (coalesce((select public.modulos_de_chamado_visiveis()), array[]::text[]))
  )
) with check (
  tenant_id = (select public.get_user_tenant_id())
);

-- ───────────────────────────────────────────────────────────────────────────
-- `ticket_comments`: onde o assunto mora de verdade
--
-- Três caminhos, e a diferença entre eles é o que a policy antiga não fazia:
-- quem ABRIU o chamado lê só o que não é nota interna; quem ATENDE ou trabalha
-- no módulo lê tudo, inclusive nota interna — é para isso que ela existe.
-- ───────────────────────────────────────────────────────────────────────────
drop policy if exists "Users can view comments on accessible tickets" on public.ticket_comments;
create policy "Users can view comments on accessible tickets" on public.ticket_comments
for select using (
  tenant_id = (select public.get_user_tenant_id())
  and (
    (select public.is_supervisor_or_higher(auth.uid()))
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_comments.ticket_id
        and (
          -- quem abriu: só o que não é nota interna
          (t.requester_id = auth.uid() and not ticket_comments.is_internal)
          -- quem atende e quem trabalha no módulo: tudo
          or t.assigned_to = auth.uid()
          or t.module = any (coalesce((select public.modulos_de_chamado_visiveis()), array[]::text[]))
        )
    )
  )
);

-- ───────────────────────────────────────────────────────────────────────────
-- `ticket_attachments`: anexo é o chamado em arquivo
-- ───────────────────────────────────────────────────────────────────────────
drop policy if exists "Users can view attachments on accessible tickets" on public.ticket_attachments;
create policy "Users can view attachments on accessible tickets" on public.ticket_attachments
for select using (
  tenant_id = (select public.get_user_tenant_id())
  and (
    (select public.is_supervisor_or_higher(auth.uid()))
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_attachments.ticket_id
        and (t.requester_id = auth.uid() or t.assigned_to = auth.uid()
          or t.module = any (coalesce((select public.modulos_de_chamado_visiveis()), array[]::text[])))
    )
  )
);

drop policy if exists "Users can upload attachments to accessible tickets" on public.ticket_attachments;
create policy "Users can upload attachments to accessible tickets" on public.ticket_attachments
for insert with check (
  tenant_id = (select public.get_user_tenant_id())
  and (
    (select public.is_supervisor_or_higher(auth.uid()))
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_attachments.ticket_id
        and (t.requester_id = auth.uid() or t.assigned_to = auth.uid()
          or t.module = any (coalesce((select public.modulos_de_chamado_visiveis()), array[]::text[])))
    )
  )
);

-- ───────────────────────────────────────────────────────────────────────────
-- `ticket_checklists` e `ticket_checklist_items`
--
-- Os `exists` já chegavam em `tickets`; só a parte que dizia "qualquer member"
-- mudou. Ler continua aberto a quem abriu; criar e atualizar seguem exigindo
-- responsável, gestor, ou o módulo — nunca só o papel.
-- ───────────────────────────────────────────────────────────────────────────
drop policy if exists "Users view ticket checklists" on public.ticket_checklists;
create policy "Users view ticket checklists" on public.ticket_checklists
for select using (
  tenant_id = (select public.get_user_tenant_id())
  and exists (
    select 1 from public.tickets t
    where t.id = ticket_checklists.ticket_id
      and (t.requester_id = auth.uid() or t.assigned_to = auth.uid()
        or (select public.is_supervisor_or_higher(auth.uid()))
        or t.module = any (coalesce((select public.modulos_de_chamado_visiveis()), array[]::text[])))
  )
);

drop policy if exists "Technicians create ticket checklists" on public.ticket_checklists;
create policy "Technicians create ticket checklists" on public.ticket_checklists
for insert with check (
  tenant_id = (select public.get_user_tenant_id())
  and exists (
    select 1 from public.tickets t
    where t.id = ticket_checklists.ticket_id
      and t.tenant_id = ticket_checklists.tenant_id
      and (t.requester_id = auth.uid() or t.assigned_to = auth.uid()
        or (select public.is_supervisor_or_higher(auth.uid()))
        or t.module = any (coalesce((select public.modulos_de_chamado_visiveis()), array[]::text[])))
  )
);

drop policy if exists "Technicians update ticket checklists" on public.ticket_checklists;
create policy "Technicians update ticket checklists" on public.ticket_checklists
for update using (
  tenant_id = (select public.get_user_tenant_id())
  and exists (
    select 1 from public.tickets t
    where t.id = ticket_checklists.ticket_id
      and t.tenant_id = ticket_checklists.tenant_id
      and (t.assigned_to = auth.uid()
        or (select public.is_supervisor_or_higher(auth.uid()))
        or t.module = any (coalesce((select public.modulos_de_chamado_visiveis()), array[]::text[])))
  )
) with check (
  tenant_id = (select public.get_user_tenant_id())
);

drop policy if exists "Users view ticket checklist items" on public.ticket_checklist_items;
create policy "Users view ticket checklist items" on public.ticket_checklist_items
for select using (
  tenant_id = (select public.get_user_tenant_id())
  and exists (
    select 1 from public.ticket_checklists tc
    join public.tickets t on t.id = tc.ticket_id
    where tc.id = ticket_checklist_items.ticket_checklist_id
      and tc.tenant_id = ticket_checklist_items.tenant_id
      and (t.requester_id = auth.uid() or t.assigned_to = auth.uid()
        or (select public.is_supervisor_or_higher(auth.uid()))
        or t.module = any (coalesce((select public.modulos_de_chamado_visiveis()), array[]::text[])))
  )
);

drop policy if exists "Technicians create ticket checklist items" on public.ticket_checklist_items;
create policy "Technicians create ticket checklist items" on public.ticket_checklist_items
for insert with check (
  tenant_id = (select public.get_user_tenant_id())
  and exists (
    select 1 from public.ticket_checklists tc
    join public.tickets t on t.id = tc.ticket_id
    where tc.id = ticket_checklist_items.ticket_checklist_id
      and tc.tenant_id = ticket_checklist_items.tenant_id
      and (t.assigned_to = auth.uid()
        or (select public.is_supervisor_or_higher(auth.uid()))
        or t.module = any (coalesce((select public.modulos_de_chamado_visiveis()), array[]::text[])))
  )
);

drop policy if exists "Technicians update ticket checklist items" on public.ticket_checklist_items;
create policy "Technicians update ticket checklist items" on public.ticket_checklist_items
for update using (
  tenant_id = (select public.get_user_tenant_id())
  and exists (
    select 1 from public.ticket_checklists tc
    join public.tickets t on t.id = tc.ticket_id
    where tc.id = ticket_checklist_items.ticket_checklist_id
      and tc.tenant_id = ticket_checklist_items.tenant_id
      and (t.assigned_to = auth.uid()
        or (select public.is_supervisor_or_higher(auth.uid()))
        or t.module = any (coalesce((select public.modulos_de_chamado_visiveis()), array[]::text[])))
  )
) with check (
  tenant_id = (select public.get_user_tenant_id())
);
