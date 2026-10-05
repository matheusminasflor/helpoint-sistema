-- QUEM ATENDEU CHAMADO DO SETOR CONTINUA NA LISTA DO SETOR (o dono, 2026-10-04).
--
-- O dono: "quando eu vou puxar os indicadores de TI, eu não tenho meus dados lá mais".
-- MEDIDO NA PRODUÇÃO: ele é o atendente dos 7 chamados da TI, mas é `owner` — vê tudo sem precisar
-- da concessão do módulo, e por isso não tem linha em `user_module_access` para 'ti'. A lista de
-- 20261123010000 só olhava a concessão: o filtro "colaborador" e o gráfico "por atendente" dos
-- Indicadores da TI passaram a mostrar só o Yuri.
--
-- A regra continua sendo "quem atende o setor", não o campo Setor do perfil (decisão de
-- 2026-10-02). Só que atender se prova de dois jeitos: ter a concessão OU ser o atendente de algum
-- chamado do setor. Assim ninguém some dos indicadores do trabalho que fez — nem o dono, nem quem
-- perdeu a concessão depois. Quem pode LER a lista não muda.
-- `create or replace` preserva a ACL (lição 14).
create or replace function public.membros_do_setor(p_setor text)
returns table (id uuid, full_name text, email text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.full_name, p.email
    from public.profiles p
   where p.tenant_id = public.get_user_tenant_id()
     and coalesce(p.is_active, true)
     and (exists (select 1 from public.user_module_access m
                   where m.user_id = p.id and m.module = p_setor)
          -- O módulo do chamado da TI é 'tickets'; nos outros setores é o próprio nome.
          or exists (select 1 from public.tickets t
                      where t.assigned_to = p.id
                        and t.tenant_id = p.tenant_id
                        and t.module = case p_setor when 'ti' then 'tickets' else p_setor end))
     and (public.is_supervisor_or_higher(auth.uid())
          or public.is_admin_or_higher(auth.uid())
          or exists (select 1 from public.user_module_access x
                      where x.user_id = auth.uid() and x.module in (p_setor, 'diretoria')))
   order by coalesce(p.full_name, p.email);
$$;
