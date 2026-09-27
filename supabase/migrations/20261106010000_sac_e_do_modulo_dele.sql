-- O SAC era de qualquer funcionário — reclamação, laudo, nota fiscal e documento
--
-- 2026-09-26, pedido do dono: "fecha o sac_tickets por módulo, igual chamado".
--
-- ══ POR QUE FICOU DE FORA DA LEVA DOS CHAMADOS ══════════════════════════════
--
-- A migration `20261030010000` fechou `tickets` por módulo em dez policies de
-- cinco tabelas. `sac_tickets` é outra tabela e o pedido de então falava de
-- chamado INTERNO — passou. O raciocínio é o mesmo, na tabela vizinha.
--
-- ══ O QUE ESTAVA ABERTO, E É MAIS QUE UMA POLICY ════════════════════════════
--
-- Sete tabelas, todas abertas a qualquer pessoa do tenant:
--
--   sac_tickets            SELECT/INSERT/UPDATE  is_member_or_higher_role() ou
--                                                qualquer `profiles` do tenant
--   sac_ticket_comments    SELECT/INSERT         is_member_or_higher_role()
--                                                ← é aqui que a reclamação mora
--   sac_ticket_attachments SELECT/INSERT         qualquer `profiles` do tenant
--                                                ← nota fiscal e foto do produto
--   sac_ticket_products    ALL                   **só `tenant_id`** — nem exige
--                                                perfil: um `viewer` insere,
--                                                altera e apaga
--   sac_technical_reports  ALL                   is_member_or_higher_role()
--                                                ← o laudo técnico
--   sac_report_products    ALL                   is_member_or_higher_role()
--
-- O chamado de SAC traz **nome, telefone, e-mail e documento do consumidor** que
-- reclamou, mais o que ele comprou e o laudo do que deu errado. Fechar `tickets`
-- e deixar isto aberto era proteger o chamado do RH e deixar a reclamação do
-- cliente na mesa.
--
-- ══ QUEM VÊ, DEPOIS DAQUI ═══════════════════════════════════════════════════
--
--   - quem **atende** aquele SAC (`assigned_to`);
--   - **gestor para cima** (`is_supervisor_or_higher`);
--   - quem tem o módulo **Qualidade** — e, por dentro de
--     `modulos_de_chamado_visiveis()`, quem tem **Diretoria** (o dono decidiu em
--     2026-09-26 que o diretor lê chamado de todos os setores);
--   - o **cliente dono** do chamado, pelas policies de `customer_*`, que não são
--     tocadas aqui.
--
-- `is_qualidade_tech()` NÃO entra, e é escolha: ela existe para quem tem linha em
-- `qualidade_user_profiles` (perfil de permissão DENTRO do módulo). Quem está lá
-- sem ter o módulo concedido não vê o menu da Qualidade, então dar acesso pelo
-- banco criaria pessoa com dado e sem tela. A régua fica sendo a concessão de
-- módulo, que é a mesma do menu.
--
-- **Nada muda para quem usa o sistema hoje:** medido antes — `0` pessoas com o
-- módulo `qualidade`, `0` linhas em `qualidade_user_profiles`, `0` SACs
-- atribuídos, e as 5 contas do teste são owner/admin, que passam por
-- `is_supervisor_or_higher`.
--
-- ══ O QUE ESTE FECHAMENTO QUEBRARIA, E JÁ VAI CONSERTADO ════════════════════
--
-- A ficha do cliente do Comercial (leva G, ontem) mostra "Chamados no SAC" lendo
-- `sac_tickets` direto — justamente porque a policy era aberta, e isso ficou
-- registrado em `nao-funciona.md` como dependência. Com a policy fechada, um
-- vendedor veria "Nenhum chamado no SAC com este CNPJ" com o chamado existindo:
-- a mentira exata que aquele bloco foi escrito para evitar.
--
-- Então entra aqui `com_sacs_do_cliente(documento)`: `security definer`, devolve
-- **só o resumo** (número, assunto, status, data) e é para quem tem o Comercial
-- ou a Diretoria. É mais estreito do que o acesso à tabela que o bloco tinha —
-- o Comercial não precisa do corpo da reclamação, só de saber que ela existe.

begin;

-- ── O guarda, num lugar só ──────────────────────────────────────────────────
-- Onze policies fariam onze cópias da mesma expressão, e a próxima correção
-- pegaria dez. Foi a lição da leva dos chamados (`modulos_de_chamado_visiveis`).
create or replace function public.ve_o_sac()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_supervisor_or_higher(auth.uid())
    -- `coalesce` em volta do array é obrigatório: sem ele, `= any ((select …))`
    -- é a forma SUBQUERY do `any` e o Postgres recusa com "operator does not
    -- exist: text = text[]". Custou duas tentativas na leva A2.
    or 'qualidade' = any (coalesce(public.modulos_de_chamado_visiveis(), array[]::text[])),
    false
  );
$$;

comment on function public.ve_o_sac() is
  'Quem enxerga o SAC: gestor para cima, quem tem o módulo Qualidade, e quem tem '
  'Diretoria (por dentro de modulos_de_chamado_visiveis). NÃO cobre "quem atende '
  'aquele chamado" — isso é comparação de coluna na própria policy, por causa da '
  'regra 13 do pgTAP.';

revoke all on function public.ve_o_sac() from public, anon;
grant execute on function public.ve_o_sac() to authenticated;

-- Para as tabelas FILHAS: quem pode naquele chamado. Aqui a consulta ao pai é
-- segura (o chamado já existe quando se insere um comentário nele) — o que a
-- regra 13 proíbe é reconsultar a PRÓPRIA tabela da linha que está nascendo.
create or replace function public.posso_no_sac(p_ticket uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.ve_o_sac()
    or exists (
      select 1 from public.sac_tickets t
       where t.id = p_ticket
         and t.tenant_id = public.get_user_tenant_id()
         and t.assigned_to = auth.uid()
    ),
    false
  );
$$;

comment on function public.posso_no_sac(uuid) is
  've_o_sac(), mais quem atende aquele chamado — para comentário, anexo, produto '
  'e laudo, que são do chamado e não do módulo.';

revoke all on function public.posso_no_sac(uuid) from public, anon;
grant execute on function public.posso_no_sac(uuid) to authenticated;

-- ── 1. O chamado ────────────────────────────────────────────────────────────
-- `assigned_to = auth.uid()` fica NA POLICY, como comparação de coluna, e não
-- dentro de `ve_o_sac()`: é a regra 13 do pgTAP. Função `stable` chamada no
-- mesmo comando que faz o INSERT enxerga o snapshot de ANTES dele, então um
-- guard que reconsultasse `sac_tickets` seria cego para a linha nascendo — e
-- criar chamado atribuído a si mesmo daria 42501.
alter policy "Internal team views SAC tickets of their tenant" on public.sac_tickets
  using (
    tenant_id = get_user_tenant_id()
    and (assigned_to = auth.uid() or (select public.ve_o_sac()))
  );
alter policy "Internal team views SAC tickets of their tenant" on public.sac_tickets
  rename to "Quem atende, a Qualidade e a Diretoria veem o SAC";

alter policy "Staff do tenant podem inserir SAC" on public.sac_tickets
  with check (
    tenant_id = get_user_tenant_id()
    and (assigned_to = auth.uid() or (select public.ve_o_sac()))
  );
alter policy "Staff do tenant podem inserir SAC" on public.sac_tickets
  rename to "Quem cuida do SAC abre chamado de SAC";

alter policy "Staff do tenant podem atualizar SAC" on public.sac_tickets
  using (
    tenant_id = get_user_tenant_id()
    and (assigned_to = auth.uid() or (select public.ve_o_sac()))
  )
  with check (
    tenant_id = get_user_tenant_id()
    and (assigned_to = auth.uid() or (select public.ve_o_sac()))
  );
alter policy "Staff do tenant podem atualizar SAC" on public.sac_tickets
  rename to "Quem cuida do SAC atende o chamado";

-- ── 2. Os comentários — é onde a reclamação mora ────────────────────────────
alter policy "Internal team views all comments of their tenant tickets" on public.sac_ticket_comments
  using (tenant_id = get_user_tenant_id() and (select public.posso_no_sac(ticket_id)));
alter policy "Internal team views all comments of their tenant tickets" on public.sac_ticket_comments
  rename to "Quem cuida daquele SAC le os comentarios dele";

alter policy "Internal team can comment" on public.sac_ticket_comments
  with check (tenant_id = get_user_tenant_id() and (select public.posso_no_sac(ticket_id)));
alter policy "Internal team can comment" on public.sac_ticket_comments
  rename to "Quem cuida daquele SAC comenta nele";

-- ── 3. Os anexos — nota fiscal e foto do produto ────────────────────────────
alter policy "Tenant staff views SAC attachments" on public.sac_ticket_attachments
  using (tenant_id = get_user_tenant_id() and (select public.posso_no_sac(ticket_id)));
alter policy "Tenant staff views SAC attachments" on public.sac_ticket_attachments
  rename to "Quem cuida daquele SAC ve os anexos dele";

alter policy "Tenant staff can upload SAC attachments" on public.sac_ticket_attachments
  with check (tenant_id = get_user_tenant_id() and (select public.posso_no_sac(ticket_id)));
alter policy "Tenant staff can upload SAC attachments" on public.sac_ticket_attachments
  rename to "Quem cuida daquele SAC anexa nele";

-- ── 4. Os produtos reclamados — a policy mais aberta das sete ───────────────
-- Era `tenant_id = get_user_tenant_id()` e nada mais, para ALL: um `viewer`
-- inseria, alterava e apagava produto de qualquer reclamação.
alter policy "Tenant staff manage ticket products" on public.sac_ticket_products
  using (tenant_id = get_user_tenant_id() and (select public.posso_no_sac(ticket_id)))
  with check (tenant_id = get_user_tenant_id() and (select public.posso_no_sac(ticket_id)));
alter policy "Tenant staff manage ticket products" on public.sac_ticket_products
  rename to "Quem cuida daquele SAC mexe nos produtos dele";

-- ── 5. O laudo técnico ──────────────────────────────────────────────────────
alter policy "Internal team manages SAC reports" on public.sac_technical_reports
  using (tenant_id = get_user_tenant_id() and (select public.posso_no_sac(ticket_id)))
  with check (tenant_id = get_user_tenant_id() and (select public.posso_no_sac(ticket_id)));
alter policy "Internal team manages SAC reports" on public.sac_technical_reports
  rename to "Quem cuida daquele SAC escreve o laudo";

-- O produto do laudo aponta para o laudo, não para o chamado: o caminho é
-- laudo → chamado. Consulta ao pai, que já existe — regra 13 não se aplica.
alter policy "Internal team manages report products" on public.sac_report_products
  using (
    tenant_id = get_user_tenant_id()
    and (select public.posso_no_sac((select r.ticket_id from public.sac_technical_reports r
                                      where r.id = sac_report_products.report_id)))
  )
  with check (
    tenant_id = get_user_tenant_id()
    and (select public.posso_no_sac((select r.ticket_id from public.sac_technical_reports r
                                      where r.id = sac_report_products.report_id)))
  );
alter policy "Internal team manages report products" on public.sac_report_products
  rename to "Quem cuida daquele SAC mexe nos produtos do laudo";

-- ── 6. O que o Comercial precisa, e só isso ─────────────────────────────────
-- A ficha do cliente mostra que existem reclamações daquele CNPJ. Não mostra o
-- que foi reclamado — para isso a pessoa precisa da Qualidade.
--
-- Casa por DÍGITOS dos dois lados: `com_clientes.documento` já é só dígito (CHECK
-- da leva G), e `sac_tickets.customer_document` vem do portal e pode ter vindo
-- pontuado. Comparar sem normalizar é o casamento que erra calado.
create or replace function public.com_sacs_do_cliente(p_documento text)
returns table (
  id uuid,
  ticket_number integer,
  subject text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.ticket_number, t.subject, t.status, t.created_at
  from public.sac_tickets t
  where t.tenant_id = public.get_user_tenant_id()
    and regexp_replace(coalesce(t.customer_document, ''), '[^0-9]', '', 'g')
        = regexp_replace(coalesce(p_documento, ''), '[^0-9]', '', 'g')
    and regexp_replace(coalesce(p_documento, ''), '[^0-9]', '', 'g') <> ''
    -- `security definer` pula a RLS, então a porta é escrita aqui: quem tem o
    -- Comercial ou a Diretoria. Sem esta linha, a função devolveria o SAC da
    -- empresa para qualquer pessoa logada nela.
    and (
      public.has_comercial_access(auth.uid())
      or public.has_diretoria_access(auth.uid())
    )
  order by t.created_at desc
  limit 50;
$$;

comment on function public.com_sacs_do_cliente(text) is
  'O RESUMO dos chamados de SAC de um documento, para a ficha do cliente do '
  'Comercial: número, assunto, status e data. Não devolve comentário, anexo nem '
  'laudo — para isso a pessoa precisa do módulo Qualidade.';

revoke all on function public.com_sacs_do_cliente(text) from public, anon;
grant execute on function public.com_sacs_do_cliente(text) to authenticated;

commit;
