-- SETOR SEM NINGUÉM AVISA DONO E ADMINISTRADOR; OPERADOR NÃO DISTRIBUI A FILA (dono, 2026-10-06).
--
-- Ajustes sobre 20261208010000 (aviso só dos meus setores), antes de ir para a produção:
--
-- 1. Medido: RH, Compras e Educacional não têm ninguém. Com a regra de 20261208010000, chamado
--    aberto para eles não avisava NINGUÉM. Decisão do dono: enquanto o setor não tiver gente,
--    quem cuida do sistema (owner/admin da empresa) recebe a fila — criado, transferido e prazo
--    do chamado sem atendente — e vê esses chamados no resumo da Lyra. Quando o setor ganhar
--    alguém, para sozinho: o atalho só vale com a equipe VAZIA.
--
-- 2. Medido: só o Operador do MARKETING tinha "Transferir" (2 pessoas, nenhum ajuste pessoal);
--    a semente (`chamados_do_perfil_padrao`) já dá `false`. Como "gere a fila" é quem transfere,
--    as duas Operadoras recebiam o vencido das colegas e viam o setor inteiro no resumo. Decisão
--    do dono: tirar "Transferir" do Operador — só o Gestor distribui. Ajuste pessoal não muda.

-- ─── 1. A equipe real do setor (sem atalho) e a equipe com o atalho do setor vazio ───────────
-- `membros_do_aviso` é o que `equipe_do_chamado` era: quem é do setor E vê o chamado.
create or replace function public.membros_do_aviso(p_tenant uuid, p_module text)
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

comment on function public.membros_do_aviso(uuid, text) is
  'Quem é do setor (setores_de_aviso) e vê o chamado — sem atalho por cargo (2026-10-06).';

revoke all on function public.membros_do_aviso(uuid, text) from public, anon, authenticated;
grant execute on function public.membros_do_aviso(uuid, text) to service_role;

-- Dono e administrador da empresa, pelo papel gravado — sem `is_admin_or_higher`, que pergunta
-- também sobre quem está logado (`pode_responder_sobre`) e aqui roda dentro de trigger e do cron.
create or replace function public.donos_da_empresa(p_tenant uuid)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct p.id), '{}'::uuid[])
    from public.profiles p
    join public.user_roles r on r.user_id = p.id and r.role in ('owner', 'admin')
   where p.tenant_id = p_tenant
     and coalesce(p.is_active, true);
$$;

revoke all on function public.donos_da_empresa(uuid) from public, anon, authenticated;
grant execute on function public.donos_da_empresa(uuid) to service_role;

-- A equipe que a FILA avisa: os membros; com o setor vazio, dono e administrador.
-- `create or replace` preserva a ACL de `equipe_do_chamado` (fechada desde 20261121020000).
create or replace function public.equipe_do_chamado(p_tenant uuid, p_module text)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when cardinality(m.ids) > 0 then m.ids else public.donos_da_empresa(p_tenant) end
    from (select public.membros_do_aviso(p_tenant, p_module) as ids) m;
$$;

comment on function public.equipe_do_chamado(uuid, text) is
  'Quem a fila do setor avisa: os membros do setor; setor sem ninguém → dono e administradores (2026-10-06).';

-- ─── 2. O resumo da Lyra: dono/admin vê também os sem atendente dos setores vazios ───────────
create or replace function public.chamados_do_meu_resumo()
returns table (id uuid, ticket_number integer, title text, priority text, status text,
               sla_due_at timestamptz, due_date timestamptz, category text, module text,
               created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  with eu as (select auth.uid() as uid, public.setores_de_aviso(auth.uid()) as setores,
                     auth.uid() = any (public.donos_da_empresa(public.get_user_tenant_id())) as dono)
  select t.id, t.ticket_number, t.title, t.priority::text, t.status::text, t.sla_due_at, t.due_date,
         t.category, t.module, t.created_at
    from public.tickets t, eu
   where t.tenant_id = public.get_user_tenant_id()
     and t.status::text not in ('resolved', 'closed', 'cancelled', 'rejected')
     and (t.assigned_to = eu.uid
          or (t.module = any (eu.setores)
              and (t.assigned_to is null or public.gere_a_fila(eu.uid, t.module))
              and public.pode_ver_chamado(eu.uid, t.tenant_id, t.module, t.requester_id, t.assigned_to))
          or (eu.dono and t.assigned_to is null
              and cardinality(public.membros_do_aviso(t.tenant_id, t.module)) = 0))
   order by t.priority, t.sla_due_at nulls last
   limit 50;
$$;

-- ─── 3. Operador não distribui a fila ─────────────────────────────────────────────────────────
-- Só a seção Chamados do perfil (jsonb_set), nunca o ajuste pessoal de alguém.
update public.access_profiles
   set permissions = jsonb_set(permissions, '{tickets,transfer}', 'false'::jsonb)
 where name = 'Operador'
   and coalesce((permissions -> 'tickets' ->> 'transfer')::boolean, false);
