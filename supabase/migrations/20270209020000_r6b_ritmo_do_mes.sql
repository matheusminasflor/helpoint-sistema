-- Rodada 2, R6b — o Comercial, com cautela (o dono, 2026-10-26: "como importamos dados da Forteplus, custamos a
-- resolver os bugs"). NENHUM cálculo de venda muda aqui: a projeção do mês usa o realizado que a tela já mostra e
-- só precisa saber em que ponto do mês o dado está.
--
-- 1. `com_ritmo_do_mes`: os dias úteis do mês e quantos já passaram ATÉ O ÚLTIMO DADO — a última nota importada do
--    Forteplus ou o último lançamento com nota, o que for mais novo (decisão b: "o realizado é medido até o dia do
--    último dado", para a projeção não cair só porque a importação está atrasada). Dia útil = segunda a sexta, sem
--    feriado nacional nem da empresa: as mesmas duas listas que os prazos usam (`feriados_nacionais`,
--    `feriados_da_empresa`).
-- 2. O perfil "Diretor" nasce com "Exportar" ligado (decisão a). Os perfis do Comercial já tinham `reports.export`
--    guardado de antes da R1 — ligado no Gestor, desligado no Operador —, que é o que o dono escolheu.

-- Mês que já acabou está fechado: conta todos os dias úteis (a projeção é o próprio realizado). `p_hoje` só existe
-- para o teste fixar o dia; a tela não passa.
create or replace function public.com_ritmo_do_mes(p_competencia date, p_hoje date default null)
returns table (dias_uteis_mes int, dias_uteis_ate int, ultimo_dado date)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_de date := date_trunc('month', p_competencia)::date;
  v_ate date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_hoje date := coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date);
  v_ultimo date;
begin
  if v_tenant is null or not (public.has_comercial_access(auth.uid()) or public.has_diretoria_access(auth.uid())) then
    return;
  end if;
  select case when v_ate < v_hoje then v_ate else least(v_hoje, greatest(
           (select max(i.emissao) from public.com_vendas_itens i where i.tenant_id = v_tenant and i.emissao between v_de and v_ate),
           (select max(x.nota_em) from public.com_interacoes x
             where x.tenant_id = v_tenant and x.nota_em between v_de and v_ate and nullif(btrim(x.nota_fiscal), '') is not null))) end
    into v_ultimo;
  return query
  with dias as (
    select d::date as dia from generate_series(v_de, v_ate, interval '1 day') d
     where extract(isodow from d) < 6
       and not exists (select 1 from public.feriados_nacionais(extract(year from d)::int) n where n.data = d::date)
       and not exists (select 1 from public.feriados_da_empresa e where e.tenant_id = v_tenant and e.data = d::date)
  )
  select count(*)::int, (count(*) filter (where v_ultimo is not null and dia <= v_ultimo))::int, v_ultimo from dias;
end;
$$;
revoke all on function public.com_ritmo_do_mes(date, date) from public, anon;
grant execute on function public.com_ritmo_do_mes(date, date) to authenticated;

update public.access_profiles
   set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object('exportar', jsonb_build_object('view', true))
 where department = 'diretoria' and name = 'Diretor';
