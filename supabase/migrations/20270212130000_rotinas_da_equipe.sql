-- Rotinas do dia, etapa 2 (dono, 2026-10-30; docs/proposta-rotinas.md): o gestor vê a equipe e o relatório.
--
-- `rotinas_da_equipe(de, ate)` devolve cada rotina de cada pessoa em cada dia útil do período, com a situação:
-- feita, pulada (com o motivo), não feita (o dia passou sem registro), pendente (hoje, ainda dá tempo) ou pausada
-- (a pessoa estava de férias ou afastada e ninguém a substituiu). Só dos setores em que tenho "Ver as rotinas da
-- equipe" (o dono e o admin veem todos). Calculada na hora, como a lista do dia.
--
-- ponytail: quem estava na rotina em cada dia é a lista de hoje (`pessoas`) — trocar as pessoas reescreve o passado
-- dela. Se o gestor precisar do histórico exato de quem estava, a saída é gravar as mudanças de `pessoas` com data.

-- A repetição sem olhar se a rotina está ativa: o histórico conta a rotina até o dia em que foi excluída.
create or replace function public.rotina_repete_no_dia(r public.rotinas, p_dia date)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.rotina_dia_util(r.tenant_id, p_dia) and case r.repeticao
    when 'dias_uteis' then true
    when 'dias_da_semana' then extract(isodow from p_dia)::smallint = any(r.dias_da_semana)
    when 'mensal' then p_dia = public.rotina_dia_do_mes(r.tenant_id, p_dia, r.dia_do_mes)
    when 'ultimo_dia_util' then p_dia = public.rotina_dia_do_mes(r.tenant_id, p_dia, 31::smallint)
  end;
$$;

create or replace function public.rotinas_da_equipe(p_de date, p_ate date)
returns table (
  rotina_id uuid, titulo text, setor text, periodo text, pessoa_id uuid, pessoa_nome text, dia date,
  situacao text, motivo text, observacao text, anexo_path text, feita_em timestamptz, feita_por_nome text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_hoje date := public.rotina_hoje();
begin
  if p_ate < p_de or p_ate - p_de > 92 then
    raise exception 'O período vai de 1 a 93 dias.' using errcode = '22023';
  end if;
  return query
  select r.id, r.titulo, r.setor, r.periodo, p.pessoa, pp.full_name, d.dia,
         case
           when g.situacao is not null then g.situacao
           when exists (select 1 from public.ausencias_que_repassam a
                         where a.user_id = p.pessoa and d.dia between a.inicio and a.fim) then 'pausada'
           when d.dia >= v_hoje then 'pendente'
           else 'nao_feita'
         end,
         g.motivo, g.observacao, g.anexo_path, g.feita_em, pf.full_name
    from public.rotinas r
    cross join lateral unnest(r.pessoas) as p(pessoa)
    cross join lateral generate_series(greatest(p_de, (r.created_at at time zone 'America/Sao_Paulo')::date),
                                       least(p_ate, v_hoje), interval '1 day') as s(d)
    cross join lateral (select s.d::date as dia) d
    join public.profiles pp on pp.id = p.pessoa
    left join public.rotina_registros g on g.rotina_id = r.id and g.pessoa_id = p.pessoa and g.dia = d.dia
    left join public.profiles pf on pf.id = g.feita_por
   where r.tenant_id = public.get_user_tenant_id()
     and public.pode_no_setor(r.setor, 'rotinas', 'view')
     and (r.ativa or d.dia < (r.updated_at at time zone 'America/Sao_Paulo')::date)
     and public.rotina_repete_no_dia(r, d.dia)
   order by d.dia, pp.full_name, case r.periodo when 'manha' then 1 when 'tarde' then 2 else 3 end, r.titulo;
end;
$$;

-- Os setores cujas rotinas da equipe eu vejo (a aba "Da minha equipe" só aparece para quem tem algum).
create or replace function public.rotina_setores_que_vejo()
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(s), '{}'::text[])
    from unnest(array['ti','marketing','rh','qualidade','financeiro','compras','comercial','educacional','expedicao','producao']) s
   where public.pode_no_setor(s, 'rotinas', 'view');
$$;

revoke all on function public.rotina_repete_no_dia(public.rotinas, date) from public, anon;
revoke all on function public.rotinas_da_equipe(date, date) from public, anon;
revoke all on function public.rotina_setores_que_vejo() from public, anon;
grant execute on function public.rotina_repete_no_dia(public.rotinas, date) to authenticated;
grant execute on function public.rotinas_da_equipe(date, date) to authenticated;
grant execute on function public.rotina_setores_que_vejo() to authenticated;
