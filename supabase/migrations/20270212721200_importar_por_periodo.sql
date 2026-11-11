-- IMPORTAR POR PERÍODO: ANO, MÊS OU SEMANA (dono, 2026-11-11). Com o relatório do Forteplus exportado AGRUPANDO POR
-- CLIENTE, cada documento sai na própria linha: o arquivo do ano não multiplica mais as quantidades (provado no ano de
-- 2026 inteiro, 21 meses iguais ao centavo) e o arquivo de bonificação passou a ser só conferência. Decisões do dono:
--   * a tela importa o período que você exportou, confirmado por você — o arquivo não diz qual foi;
--   * "Substituir" troca SÓ os dias desse período: a semana de 02 a 08/11 não apaga o resto de novembro.
-- A reserva deixa de ser o mês inteiro: cada importação reserva, por competência, o trecho de dias que trouxe, e dois
-- trechos da mesma filial nunca se sobrepõem (exclusão no banco, não na tela). Sem período, vale o mês inteiro, como
-- sempre — a tela antiga continua funcionando até a nova subir.

create extension if not exists btree_gist with schema extensions;

-- ─── 1. A reserva por trecho de dias ─────────────────────────────────────────────────────────────
alter table public.com_vendas_competencias add column de date, add column ate date;
-- O que já existe: do dia 1 até a última nota que a importação trouxe naquele mês (ou o fim do mês, se não trouxe).
update public.com_vendas_competencias c
   set de = c.competencia,
       ate = coalesce((select max(vi.emissao) from public.com_vendas_itens vi
                        where vi.importacao_id = c.importacao_id and vi.competencia = c.competencia),
                      (c.competencia + interval '1 month - 1 day')::date);
alter table public.com_vendas_competencias
  alter column de set not null, alter column ate set not null,
  add constraint com_vendas_competencias_trecho_no_mes check (
    de <= ate and date_trunc('month', de)::date = competencia and date_trunc('month', ate)::date = competencia);
drop index if exists public.com_vendas_competencias_unica;
alter table public.com_vendas_competencias add constraint com_vendas_competencias_sem_sobrepor
  exclude using gist (tenant_id with =, filial with =, daterange(de, ate, '[]') with &&);

alter table public.com_vendas_importacoes add column periodo_de date, add column periodo_ate date;

-- ─── 2. Começar: o período, a substituição dos dias e a reserva de cada trecho ───────────────────
drop function public.com_importar_vendas_inicio(text, text, integer, jsonb, jsonb, integer, boolean, numeric);
create function public.com_importar_vendas_inicio(
  p_filial text, p_file_name text, p_linhas_lidas integer, p_descartes jsonb, p_competencias jsonb,
  p_itens_esperados integer, p_substituir boolean default false, p_total_impresso numeric default null,
  p_de date default null, p_ate date default null)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_descartes_total int;
  v_competencias date[];
  v_de date;
  v_ate date;
  v_importacao_id uuid;
  v_conflito record;
  r record;
begin
  if p_filial not in ('INBRAS', 'MF') then
    raise exception 'Filial inválida: %', p_filial;
  end if;
  if v_tenant_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  -- Substituir apaga dado publicado: confirma a permissão granular ANTES de qualquer DELETE (auditoria da L6a).
  if p_substituir and not (
       public.is_admin_or_higher(auth.uid())
       or public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'substituir')
     ) then
    raise exception 'Você não tem permissão para substituir uma competência já importada.';
  end if;

  select coalesce(sum((value)::int), 0) into v_descartes_total from jsonb_each_text(p_descartes);
  -- A conferência do arquivo (§4.3): linhas lidas = itens esperados + descartes, antes de qualquer lote chegar.
  if p_linhas_lidas <> p_itens_esperados + v_descartes_total then
    raise exception 'Conferência falhou: o arquivo tem % linhas, mas % itens + % descartes somam % — faltam %.',
      p_linhas_lidas, p_itens_esperados, v_descartes_total, p_itens_esperados + v_descartes_total,
      p_linhas_lidas - (p_itens_esperados + v_descartes_total);
  end if;
  if p_itens_esperados <= 0 then
    raise exception 'Nenhum item para importar.';
  end if;

  select array_agg((r2->>'competencia')::date order by (r2->>'competencia')::date) into v_competencias
    from jsonb_array_elements(p_competencias) as r2;
  -- Sem período: do primeiro dia do primeiro mês ao último dia do último mês (o comportamento de sempre).
  v_de := coalesce(p_de, v_competencias[1]);
  v_ate := coalesce(p_ate, (v_competencias[array_length(v_competencias, 1)] + interval '1 month - 1 day')::date);
  if v_de > v_ate then
    raise exception 'O período vai de % a %: a data inicial é depois da final.', to_char(v_de, 'DD/MM/YYYY'), to_char(v_ate, 'DD/MM/YYYY');
  end if;
  if exists (select 1 from unnest(v_competencias) c where c < date_trunc('month', v_de)::date or c > v_ate) then
    raise exception 'O arquivo tem notas fora do período de % a %. Confira as datas.', to_char(v_de, 'DD/MM/YYYY'), to_char(v_ate, 'DD/MM/YYYY');
  end if;

  -- Retomada = recomeçar (§4 do plano): a importação "em_andamento" abandonada desta filial é apagada inteira.
  delete from public.com_vendas_importacoes
  where tenant_id = v_tenant_id and filial = p_filial and tipo = 'vendas' and status = 'em_andamento';

  if p_substituir then
    -- Só os dias do período (dono, 2026-11-11): "peguei a semana toda e não apaga o resto do mês".
    delete from public.com_vendas_itens
      where tenant_id = v_tenant_id and filial = p_filial and emissao between v_de and v_ate;
    if exists (select 1 from public.com_vendas_itens
               where tenant_id = v_tenant_id and filial = p_filial and emissao between v_de and v_ate) then
      raise exception 'Não consegui limpar o período para substituir — verifique sua permissão.';
    end if;
    -- Cada reserva que encosta no período fica só com o que sobra dela, antes e depois.
    for r in
      select c.* from public.com_vendas_competencias c
       where c.tenant_id = v_tenant_id and c.filial = p_filial and daterange(c.de, c.ate, '[]') && daterange(v_de, v_ate, '[]')
    loop
      delete from public.com_vendas_competencias where id = r.id;
      insert into public.com_vendas_competencias (tenant_id, filial, competencia, importacao_id, linhas, total_venda, de, ate)
      select v_tenant_id, p_filial, r.competencia, r.importacao_id,
             (select count(*) from public.com_vendas_itens vi where vi.importacao_id = r.importacao_id and vi.emissao between t.de and t.ate),
             (select coalesce(sum(vi.valor_nota) filter (where vi.classe = 'venda'), 0) from public.com_vendas_itens vi
               where vi.importacao_id = r.importacao_id and vi.emissao between t.de and t.ate),
             t.de, t.ate
        from (values (r.de, least(r.ate, v_de - 1)), (greatest(r.de, v_ate + 1), r.ate)) t(de, ate)
       where t.de <= t.ate;
    end loop;
  end if;

  insert into public.com_vendas_importacoes (
    tenant_id, tipo, filial, file_name, linhas_lidas, itens_gravados, descartes,
    outros_linhas, outros_valor, cfops_outros, substituiu,
    status, itens_esperados, total_impresso, periodo_de, periodo_ate
  ) values (
    v_tenant_id, 'vendas', p_filial, p_file_name, p_linhas_lidas, 0, p_descartes,
    0, 0, '{}', p_substituir,
    'em_andamento', p_itens_esperados, p_total_impresso, v_de, v_ate
  ) returning id into v_importacao_id;

  -- A reserva: em cada competência, o trecho do período que cai nela. Sobrepor outra importação da filial falha
  -- inteira, nomeando quando e qual arquivo — nada fica meio-aberto.
  begin
    insert into public.com_vendas_competencias (tenant_id, filial, competencia, importacao_id, linhas, total_venda, de, ate)
    select v_tenant_id, p_filial, (r2->>'competencia')::date, v_importacao_id, (r2->>'linhas')::int, (r2->>'total_venda')::numeric,
           greatest(v_de, (r2->>'competencia')::date),
           least(v_ate, ((r2->>'competencia')::date + interval '1 month - 1 day')::date)
    from jsonb_array_elements(p_competencias) as r2;
  exception when exclusion_violation then
    select c.de, c.ate, c.created_at, imp.file_name
      into v_conflito
    from public.com_vendas_competencias c
    join public.com_vendas_importacoes imp on imp.id = c.importacao_id
    where c.tenant_id = v_tenant_id and c.filial = p_filial and c.importacao_id <> v_importacao_id
      and daterange(c.de, c.ate, '[]') && daterange(v_de, v_ate, '[]')
    order by c.created_at desc
    limit 1;
    raise exception 'De % a % a filial % já foi importada em % (arquivo "%") — marque "substituir" para refazer esses dias.',
      to_char(v_conflito.de, 'DD/MM/YYYY'), to_char(v_conflito.ate, 'DD/MM/YYYY'), p_filial,
      to_char(v_conflito.created_at, 'DD/MM/YYYY'), v_conflito.file_name;
  end;

  return v_importacao_id;
end;
$function$;
revoke all on function public.com_importar_vendas_inicio(text, text, integer, jsonb, jsonb, integer, boolean, numeric, date, date) from public, anon;
grant execute on function public.com_importar_vendas_inicio(text, text, integer, jsonb, jsonb, integer, boolean, numeric, date, date) to authenticated;

-- ─── 3. Fechar: nenhum item fora do período que a pessoa confirmou ───────────────────────────────
create or replace function pg_temp.troca(p_funcao regprocedure, p_de text, p_para text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_funcao);
begin
  if position(p_de in v_def) = 0 then
    raise exception 'trecho não encontrado em %: %', p_funcao, left(p_de, 80);
  end if;
  execute replace(v_def, p_de, p_para);
end;
$$;
select pg_temp.troca('public.com_importar_vendas_fim(uuid)'::regprocedure,
  $x$  delete from public.com_vendas_itens_espera where importacao_id = p_importacao_id;$x$,
  $x$  if v_imp.periodo_de is not null and exists (
       select 1 from public.com_vendas_itens
        where importacao_id = p_importacao_id and emissao not between v_imp.periodo_de and v_imp.periodo_ate) then
    raise exception 'O arquivo tem notas fora do período de % a % — nada foi publicado.',
      to_char(v_imp.periodo_de, 'DD/MM/YYYY'), to_char(v_imp.periodo_ate, 'DD/MM/YYYY');
  end if;

  delete from public.com_vendas_itens_espera where importacao_id = p_importacao_id;$x$);

-- ─── 4. O que já foi importado, em trechos de dias, para a tela avisar antes ─────────────────────
drop function public.com_competencias_importadas(text);
create function public.com_competencias_importadas(p_filial text)
returns table (competencia date, de date, ate date)
language sql stable security invoker set search_path = public
as $$
  select c.competencia, c.de, c.ate
  from public.com_vendas_competencias c
  join public.com_vendas_importacoes imp on imp.id = c.importacao_id
  where c.tenant_id = (select public.get_user_tenant_id())
    and c.filial = p_filial
    and imp.status = 'concluida';
$$;
revoke all on function public.com_competencias_importadas(text) from public, anon;
grant execute on function public.com_competencias_importadas(text) to authenticated;
