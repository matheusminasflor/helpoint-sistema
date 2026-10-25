-- Agenda única (proposta "Helpoint no dia a dia", etapa 4 · Jornal, Diretrizes, Chat e Agenda, 2026-10-25).
--
-- Decisão do dono (2026-10-25): na Agenda, quem é DO MESMO SETOR vê nome e datas das férias APROVADAS dos colegas —
-- sem motivo, sem saldo, sem tipo. A policy de `rh_vacation_requests` continua como está (cada um a sua; o RH,
-- todas): esta função devolve só as quatro colunas, e por isso é `security definer`.
--
-- "Mesmo setor" = os dois têm o mesmo módulo em `user_module_access` (a mesma régua de `membros_do_setor`).
-- 'diretoria' não conta: ter o módulo da Diretoria não faz de ninguém colega de setor de todo mundo.
create or replace function public.ferias_do_meu_setor(p_de date, p_ate date)
returns table (user_id uuid, nome text, start_date date, end_date date)
language sql
stable
security definer
set search_path to 'public'
as $$
  select v.user_id, coalesce(p.full_name, p.email), v.start_date, v.end_date
    from public.rh_vacation_requests v
    join public.profiles p on p.id = v.user_id
   where v.tenant_id = public.get_user_tenant_id()
     and v.status = 'aprovada'
     and v.start_date <= p_ate
     and v.end_date >= p_de
     and (v.user_id = auth.uid()
          or exists (select 1
                       from public.user_module_access eu
                       join public.user_module_access ele on ele.module = eu.module
                      where eu.user_id = auth.uid()
                        and ele.user_id = v.user_id
                        and eu.module <> 'diretoria'))
   order by v.start_date, 2;
$$;

revoke all on function public.ferias_do_meu_setor(date, date) from public, anon;
grant execute on function public.ferias_do_meu_setor(date, date) to authenticated;
