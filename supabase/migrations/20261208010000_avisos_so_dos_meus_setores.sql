-- AVISO SÓ DOS MEUS SETORES (decisão do dono, 2026-10-06).
--
-- O dono: "mesmo eu sendo Dono estou recebendo SLA de outros departamentos nos quais eu não sou
-- gestor… posso ter acesso a tudo mas não queria receber notificações e retornos da Lyra de prazo
-- de chamado aberto de outros setores". MEDIDO NA PRODUÇÃO (últimos 7 dias): o dono (setor 'ti',
-- sem concessão nem perfil de acesso) recebeu 5 `sla_warning` do Marketing e 1 `ticket_created`
-- do RH sem ser atendente nem solicitante. Vinham de dois atalhos por CARGO:
--   * `equipe_do_chamado` caía em owner/admin/manager quando o setor não tinha ninguém com a
--     concessão (o RH não tem ninguém);
--   * o `check-alerts` mandava todo `sla_warning` a todo owner/admin/manager.
--
-- A REGRA (escolha recomendada pelo dono): ser dono/admin dá ACESSO a tudo — quem VÊ não muda, o
-- RLS de `tickets` e `pode_ver_chamado` ficam como estão. O AVISO (sino/"Lyra avisa", e-mail,
-- alerta de prazo — e, por consequência, o resumo da Lyra, que lê esses avisos) fala de:
--   1. chamados em que a pessoa é atendente, solicitante ou mencionada — sempre (inalterado:
--      `notify_on_ticket_*` já mandam por papel no chamado);
--   2. a FILA de um setor só para quem é DO SETOR: o campo Setor do perfil, OU a concessão do
--      módulo, OU um perfil de acesso daquele setor — nunca por ser dono/admin;
--   3. setores que a pessoa marcou em "Acompanhar também" (Meu perfil), desligado por padrão.
-- A regra mora em UM lugar: `setores_de_aviso(p_user)`.
--
-- CONSEQUÊNCIA ACEITA: setor sem ninguém (medido: RH, Compras e Educacional hoje) não avisa
-- ninguém da fila — antes caía no dono, e era exatamente isso que o dono não quer. Quem quiser
-- receber marca "Acompanhar também" daquele setor.

-- ─── 1. "Acompanhar também" ────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists acompanha_setores text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_acompanha_setores_validos;
alter table public.profiles add constraint profiles_acompanha_setores_validos
  check (acompanha_setores <@ array['ti', 'marketing', 'comercial', 'rh', 'financeiro', 'producao',
                                    'expedicao', 'educacional', 'qualidade', 'compras']::text[]);

comment on column public.profiles.acompanha_setores is
  'Setores (além do próprio) cujos avisos de fila e de prazo a pessoa quer receber. Ela mesma edita, em Meu perfil (2026-10-06).';

-- Quem edita: a própria pessoa (`profiles_update_own`) e o administrador (`profiles_update_admin`),
-- como o resto do perfil. Nenhuma policy nova.

-- ─── 2. A regra: de que setores a pessoa recebe aviso ─────────────────────────────────────────
-- Devolve nomes de MÓDULO DE CHAMADO (o da TI é 'tickets'), que é o que `tickets.module` guarda.
create or replace function public.setores_de_aviso(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct case x.s when 'ti' then 'tickets' else x.s end), '{}'::text[])
    from (
      select lower(btrim(p.department)) as s from public.profiles p where p.id = p_user
      union select m.module from public.user_module_access m where m.user_id = p_user
      union select uap.department from public.user_access_profiles uap where uap.user_id = p_user
      union select unnest(p.acompanha_setores) from public.profiles p where p.id = p_user
    ) x
   where coalesce(x.s, '') <> '';
$$;

comment on function public.setores_de_aviso(uuid) is
  'Módulos de chamado cuja fila avisa a pessoa: setor do perfil, concessão, perfil de acesso e "acompanhar também". Dono/admin não entram por cargo (2026-10-06).';

revoke all on function public.setores_de_aviso(uuid) from public, anon, authenticated;
grant execute on function public.setores_de_aviso(uuid) to service_role;

-- ─── 3. A equipe da fila: quem é do setor E pode ver o chamado ───────────────────────────────
-- Era: concessão do módulo (via `notification_team`) ∩ quem vê; sem ninguém, owner/admin/manager.
-- O atalho por cargo sai. `create or replace` preserva a ACL (fechada desde 20261121020000).
create or replace function public.equipe_do_chamado(p_tenant uuid, p_module text)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(p.id), '{}'::uuid[])
    from public.profiles p
   where p.tenant_id = p_tenant
     and coalesce(p.is_active, true)
     and coalesce(p_module, 'tickets') = any (public.setores_de_aviso(p.id))
     and public.pode_ver_chamado(p.id, p_tenant, p_module, null, null);
$$;

-- ─── 4. Quem GERE a fila de um setor ──────────────────────────────────────────────────────────
-- Gestor = quem tem "Transferir para outra pessoa" no perfil do setor; dono/admin/gerente só
-- quando o setor está nos `setores_de_aviso` dele (é DO setor). É o mesmo critério do resumo no
-- topo da fila (`usePodeNoChamado(...).pode('transfer')`).
create or replace function public.gere_a_fila(p_user uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(p_module, 'tickets') = any (public.setores_de_aviso(p_user))
     and (public.is_supervisor_or_higher(p_user)
          or coalesce(public.tem_permissao(p_user, case p_module when 'tickets' then 'ti' else p_module end,
                                           'tickets', 'transfer'), false));
$$;

revoke all on function public.gere_a_fila(uuid, text) from public, anon, authenticated;
grant execute on function public.gere_a_fila(uuid, text) to service_role;

-- ─── 5. Quem recebe o alerta de PRAZO (o `check-alerts` chama) ───────────────────────────────
-- Padrão de mercado com o ajuste do dono (2026-10-06):
--   * COM atendente, prazo em risco → só o atendente;
--   * COM atendente, prazo vencido  → o atendente e quem gere a fila do setor;
--   * SEM atendente (risco ou vencido) → todos do setor que podem ver o chamado;
--   * solicitante e colegas (inclusive mencionados) nunca recebem alerta de prazo de chamado alheio.
-- Antes: todo owner/admin/manager de todo setor recebia o "em risco".
create or replace function public.avisados_do_prazo(p_ticket uuid, p_vencido boolean)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  with t as (select id, tenant_id, module, assigned_to from public.tickets where id = p_ticket),
  equipe as (select unnest(public.equipe_do_chamado(t.tenant_id, t.module)) as u from t)
  select coalesce(array_agg(distinct x.u) filter (where x.u is not null), '{}'::uuid[])
    from (
      select t.assigned_to as u from t
      union all select e.u from equipe e, t where t.assigned_to is null
      union all select e.u from equipe e, t
                 where t.assigned_to is not null and p_vencido and public.gere_a_fila(e.u, t.module)
    ) x;
$$;

comment on function public.avisados_do_prazo(uuid, boolean) is
  'Alerta de prazo: com atendente, risco → atendente; vencido → atendente + quem gere a fila; sem atendente → o setor (2026-10-06).';

revoke all on function public.avisados_do_prazo(uuid, boolean) from public, anon, authenticated;
grant execute on function public.avisados_do_prazo(uuid, boolean) to service_role;

-- O aviso de VENCIDO sai UMA vez por pessoa e chamado. Medido: o #11 avisou em 03/10 e de novo em
-- 04/10 as mesmas pessoas — o `check-alerts` só olhava as últimas 24h. Sem janela: quem já foi
-- avisado do vencimento não é avisado de novo; quem entrou depois (gestor novo, atendente novo) é.
create or replace function public.avisar_prazo_vencido(p_ticket uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t public.tickets%rowtype;
  v_n integer;
begin
  select * into t from public.tickets where id = p_ticket;
  if t.id is null then
    return 0;
  end if;
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select t.tenant_id, u, 'deadline_expired', 'ticket', t.id,
         'Prazo vencido - Chamado #' || t.ticket_number,
         case when t.assigned_to is not null
              then 'O chamado "' || coalesce(t.title, '') || '" passou do prazo e precisa de ação.'
              else 'O chamado "' || coalesce(t.title, '') || '" passou do prazo sem atendente. Verifique.' end
    from unnest(public.avisados_do_prazo(p_ticket, true)) as u
   where not exists (select 1 from public.notifications n
                      where n.user_id = u and n.reference_id = t.id and n.type = 'deadline_expired');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.avisar_prazo_vencido(uuid) from public, anon, authenticated;
grant execute on function public.avisar_prazo_vencido(uuid) to service_role;

-- ─── 6. Os chamados do resumo da Lyra e do "Comece por" da Home ──────────────────────────────
-- Medido: a Gislene (que só ABRIU os chamados) via no resumo os atrasos da Merilyn — a tela
-- buscava "abri OU atendo". Agora: os que a pessoa ATENDE; os SEM atendente dos setores dela; e,
-- de quem gere a fila, o setor inteiro. Sempre só o que ela pode ver. O aviso de "aguarda seu
-- retorno" do solicitante continua chegando pelos avisos (notificações), não por aqui.
create or replace function public.chamados_do_meu_resumo()
returns table (id uuid, ticket_number integer, title text, priority text, status text,
               sla_due_at timestamptz, due_date timestamptz, category text, module text,
               created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  with eu as (select auth.uid() as uid, public.setores_de_aviso(auth.uid()) as setores)
  select t.id, t.ticket_number, t.title, t.priority::text, t.status::text, t.sla_due_at, t.due_date,
         t.category, t.module, t.created_at
    from public.tickets t, eu
   where t.tenant_id = public.get_user_tenant_id()
     and t.status::text not in ('resolved', 'closed', 'cancelled', 'rejected')
     and (t.assigned_to = eu.uid
          or (t.module = any (eu.setores)
              and (t.assigned_to is null or public.gere_a_fila(eu.uid, t.module))
              and public.pode_ver_chamado(eu.uid, t.tenant_id, t.module, t.requester_id, t.assigned_to)))
   order by t.priority, t.sla_due_at nulls last
   limit 50;
$$;

comment on function public.chamados_do_meu_resumo() is
  'Chamados do resumo da Lyra: os que atendo, os sem atendente dos meus setores e, de quem gere a fila, o setor inteiro (2026-10-06).';

revoke all on function public.chamados_do_meu_resumo() from public, anon;
grant execute on function public.chamados_do_meu_resumo() to authenticated;
