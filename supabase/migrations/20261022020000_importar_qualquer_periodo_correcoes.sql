-- Frente 1 — correções da auditoria de 2026-09-22. Ver
-- .scratch/plano-frente1-correcoes.md. Idempotente: pode ser reaplicada sem
-- erro. Nunca edita as migrations do Comercial já aplicadas (20261014010000
-- e seguintes, 20261022010000 incluída) — tudo aqui é `create or replace`
-- por cima delas.
--
-- Achado 1 (GRAVE) da auditoria: quem fecha o navegador no meio de uma
-- importação ficava preso. A cadeia: a importação abandonada fica
-- `em_andamento`, a reserva dela continua valendo em
-- `com_vendas_competencias`, e `useCompetenciasImportadas` lia essa reserva
-- SEM filtrar status — o diálogo mostrava "Competência já importada" e
-- travava o botão até a pessoa marcar `substituir`. Quem só tinha
-- `vendas.importar` não conseguia mais importar aquele mês, o oposto do que
-- a leva promete ("recomeçar é barato"). A pergunta "esta competência já
-- foi importada?" é do banco — por isso a função nova, em vez de o
-- navegador filtrar a lista.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. com_competencias_importadas — a mesma pergunta que
-- `useCompetenciasImportadas` fazia direto em `com_vendas_competencias`,
-- agora respondida pelo banco: só conta como "já importada" a competência
-- cuja importação dona está CONCLUIDA. Uma reserva de importação
-- `em_andamento` (inclusive abandonada) não aparece aqui — ela é limpa pelo
-- próximo `com_importar_vendas_inicio` da mesma filial, e enquanto isso não
-- acontece, a pessoa não pode ficar impedida de tentar de novo.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_competencias_importadas(p_filial text)
returns table (competencia date)
language sql
stable
security invoker
set search_path = public
as $$
  select c.competencia
  from public.com_vendas_competencias c
  join public.com_vendas_importacoes imp on imp.id = c.importacao_id
  where c.tenant_id = (select public.get_user_tenant_id())
    and c.filial = p_filial
    and imp.status = 'concluida';
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. com_descartar_importacao — regra 2 das cinco, do lado do banco (e
-- regra 12 do pgTAP): um DELETE filtrado por policy afeta zero linhas em
-- silêncio. O SELECT logo acima já confirmou que a linha existia com
-- status `em_andamento`; se o DELETE não apagar nada, a permissão mudou
-- entre as duas checagens (raro, mas o padrão da casa é não confiar) — e a
-- pessoa não pode achar que descartou o que continua lá.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_descartar_importacao(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_status text;
  v_apagadas int;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  select status into v_status from public.com_vendas_importacoes
  where id = p_id and tenant_id = v_tenant_id;

  if v_status is null then
    raise exception 'Importação não encontrada.';
  end if;
  if v_status <> 'em_andamento' then
    raise exception 'Esta importação já foi concluída — não é possível descartar.';
  end if;

  delete from public.com_vendas_importacoes where id = p_id;
  get diagnostics v_apagadas = row_count;
  if v_apagadas = 0 then
    raise exception 'Não consegui descartar a importação — verifique sua permissão.';
  end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. com_importar_vendas_fim — duas correções da auditoria de 2026-09-22:
--
-- a) o `update ... set status = 'concluida'` não conferia linhas afetadas
-- (regra 2 das cinco / regra 12 do pgTAP). Se ele não pegar, os itens ficam
-- publicados sob uma importação ainda `em_andamento` — e o próximo
-- `com_importar_vendas_inicio` daquela filial apagaria os itens publicados
-- pela cascata de `com_vendas_importacoes`. Agora conta e levanta se afetar
-- zero linhas.
--
-- b) a conferência de competência batia só `linhas`; `total_venda` (que
-- também vem do resumo calculado no navegador, em `inicio`) nunca era
-- confrontado com o que foi de fato publicado. Passa a bater os dois, com a
-- mesma tolerância de um centavo já usada para `total_impresso`.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_importar_vendas_fim(p_importacao_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_imp public.com_vendas_importacoes%rowtype;
  v_na_espera int;
  v_soma_espera numeric;
  v_gravadas int;
  v_atualizadas int;
  v_outros_linhas int;
  v_outros_valor numeric;
  v_cfops_outros text[];
  v_competencia_de date;
  v_competencia_ate date;
  v_competencias_resumo jsonb;
  v_resultado jsonb;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  select * into v_imp from public.com_vendas_importacoes
  where id = p_importacao_id and tenant_id = v_tenant_id;

  if not found then
    raise exception 'Importação % não encontrada.', p_importacao_id;
  end if;
  if v_imp.status <> 'em_andamento' then
    raise exception 'Esta importação não está em andamento (status: %) — não há o que concluir.', v_imp.status;
  end if;

  select count(*), coalesce(sum(valor_nota), 0)
    into v_na_espera, v_soma_espera
  from public.com_vendas_itens_espera
  where importacao_id = p_importacao_id;

  -- A propriedade que carrega a leva inteira (§3 do plano): se o navegador
  -- fechou no meio de uma carga de 300 mil linhas, o que já subiu não pode
  -- entrar no faturamento — senão o mês aparece mais leve e ninguém
  -- percebe, a mesma família do erro dos 129 clientes.
  if v_na_espera <> v_imp.itens_esperados then
    raise exception 'A importação tem % item(ns) na espera, mas eram esperados % — nada foi publicado.',
      v_na_espera, v_imp.itens_esperados;
  end if;

  -- A conferência externa (opcional): o relatório do Forteplus imprime o
  -- próprio total, na linha "Totais:" — bate ao centavo nos arquivos reais
  -- do dono (scripts/conferir-vendas-reais.ts). Nula = recorte parcial, sem
  -- essa linha, sem conferência possível.
  if v_imp.total_impresso is not null and abs(v_soma_espera - v_imp.total_impresso) > 0.01 then
    raise exception 'A soma dos itens (%) não bate com o total impresso pelo relatório (%) — nada foi publicado.',
      v_soma_espera, v_imp.total_impresso;
  end if;

  -- Cliente novo (não estava no CSV) entra com origem 'venda' — antes de
  -- mover a espera, porque só ela carrega o nome (com_vendas_itens nunca
  -- guardou cliente_nome; ver o comentário na criação da tabela de espera).
  insert into public.com_clientes (tenant_id, codigo, razao_social, tabela_preco, origem)
  select distinct on (cliente_codigo) tenant_id, cliente_codigo, cliente_nome, null, 'venda'
  from public.com_vendas_itens_espera
  where importacao_id = p_importacao_id
  order by cliente_codigo
  on conflict (tenant_id, codigo) do nothing;

  with movidos as (
    insert into public.com_vendas_itens (
      tenant_id, importacao_id, filial, emissao, documento, serie, tipo_documento,
      cfop, classe, cliente_codigo, produto_codigo, produto_nome,
      quantidade, valor_nota, desconto, vendedor_codigo, vendedor_nome
    )
    select
      tenant_id, importacao_id, filial, emissao, documento, serie, tipo_documento,
      cfop, classe, cliente_codigo, produto_codigo, produto_nome,
      quantidade, valor_nota, desconto, vendedor_codigo, vendedor_nome
    from public.com_vendas_itens_espera
    where importacao_id = p_importacao_id
    returning 1
  )
  select count(*) into v_gravadas from movidos;

  if v_gravadas <> v_imp.itens_esperados then
    raise exception 'Movi % itens da espera mas eram esperados %.', v_gravadas, v_imp.itens_esperados;
  end if;

  -- A reserva de competência (com_vendas_competencias) nasceu do resumo que
  -- o navegador mandou em `inicio`, ANTES de qualquer item chegar. Confere
  -- aqui que o que foi de fato publicado tem, competência por competência,
  -- a MESMA contagem de linhas E o MESMO total de venda da reserva (achado
  -- 6.5 da auditoria: só `linhas` era conferido; `total_venda` era eco não
  -- verificado) — um resumo errado (bug, não ataque: o mesmo array é lido
  -- para as duas coisas no navegador) destravaria o mês reservado sem os
  -- dados baterem, e ninguém veria erro nenhum na tela.
  if exists (
    select 1
    from (
      select competencia, count(*) as linhas,
             coalesce(sum(valor_nota) filter (where classe = 'venda'), 0) as total_venda
      from public.com_vendas_itens
      where importacao_id = p_importacao_id
      group by competencia
    ) reais
    full join (
      select competencia, linhas, total_venda
      from public.com_vendas_competencias
      where importacao_id = p_importacao_id
    ) reservadas using (competencia)
    where reais.linhas is distinct from reservadas.linhas
       or abs(coalesce(reais.total_venda, 0) - coalesce(reservadas.total_venda, 0)) > 0.01
  ) then
    raise exception 'As competências publicadas não batem com o resumo reservado no início da importação — nada foi publicado.';
  end if;

  delete from public.com_vendas_itens_espera where importacao_id = p_importacao_id;

  -- Nome do produto: a grafia mais frequente na base inteira (não só neste
  -- lote), recalculada a cada importação (§4.4 do plano original) —
  -- preservado tal como em com_importar_vendas.
  insert into public.com_produtos (tenant_id, codigo, nome)
  select v_tenant_id, produto_codigo, mode() within group (order by produto_nome)
  from public.com_vendas_itens
  where tenant_id = v_tenant_id
    and produto_codigo in (
      select distinct produto_codigo from public.com_vendas_itens where importacao_id = p_importacao_id
    )
  group by produto_codigo
  on conflict (tenant_id, codigo) do update set nome = excluded.nome, updated_at = now();

  select count(*), coalesce(sum(valor_nota), 0), coalesce(array_agg(distinct cfop), '{}')
    into v_outros_linhas, v_outros_valor, v_cfops_outros
  from public.com_vendas_itens
  where importacao_id = p_importacao_id and classe = 'outros';

  select min(competencia), max(competencia) into v_competencia_de, v_competencia_ate
  from public.com_vendas_itens where importacao_id = p_importacao_id;

  select jsonb_agg(jsonb_build_object('competencia', competencia, 'linhas', linhas, 'total_venda', total_venda) order by competencia)
    into v_competencias_resumo
  from public.com_vendas_competencias where importacao_id = p_importacao_id;

  update public.com_vendas_importacoes set
    status = 'concluida',
    itens_gravados = v_gravadas,
    outros_linhas = v_outros_linhas,
    outros_valor = v_outros_valor,
    cfops_outros = v_cfops_outros,
    competencia_de = v_competencia_de,
    competencia_ate = v_competencia_ate
  where id = p_importacao_id;

  -- Achado 4 da auditoria: esta é a escrita que dói de verdade — se ela não
  -- pegar, os itens ficam publicados sob uma importação que continua
  -- `em_andamento`, e o PRÓXIMO `com_importar_vendas_inicio` desta filial
  -- apagaria tudo pela cascata de `com_vendas_importacoes`.
  get diagnostics v_atualizadas = row_count;
  if v_atualizadas = 0 then
    raise exception 'Não consegui marcar a importação como concluída — verifique sua permissão.';
  end if;

  v_resultado := jsonb_build_object(
    'gravadas', v_gravadas,
    'descartes', v_imp.descartes,
    'competencias', coalesce(v_competencias_resumo, '[]'::jsonb),
    'outros_linhas', v_outros_linhas,
    'outros_valor', v_outros_valor,
    'cfops_outros', to_jsonb(v_cfops_outros),
    'substituiu', v_imp.substituiu
  );
  return v_resultado;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. com_importar_vendas_inicio — recriada só para corrigir o comentário do
-- cabeçalho (achado 6.4 da auditoria de 2026-09-22): a lógica é IDÊNTICA à
-- de 20261022010000. O comentário original dizia que a limpeza da
-- importação abandonada vem "ANTES de tudo" — o código sempre rodou ela
-- DEPOIS da checagem de permissão de `substituir` e da conferência de
-- linhas (§4.3), o que é melhor: uma chamada sem permissão, ou com o
-- arquivo inconsistente, falha sem apagar nada, mesmo havendo uma
-- importação abandonada esperando limpeza. A limpeza continua vindo ANTES
-- do `substituir` e da reserva de competência — para nunca competir com
-- eles (essa parte do comentário original estava certa).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_importar_vendas_inicio(
  p_filial text,
  p_file_name text,
  p_linhas_lidas int,
  p_descartes jsonb,
  p_competencias jsonb,
  p_itens_esperados int,
  p_substituir boolean default false,
  p_total_impresso numeric default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_descartes_total int;
  v_competencias date[];
  v_importacao_id uuid;
  v_conflito record;
begin
  if p_filial not in ('INBRAS', 'MF') then
    raise exception 'Filial inválida: %', p_filial;
  end if;
  if v_tenant_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  -- Substituir apaga dado publicado: confirma a permissão granular ANTES de
  -- qualquer DELETE, e nomeia o motivo — a mesma correção da auditoria da
  -- L6a (20261014020000), preservada aqui.
  if p_substituir and not (
       public.is_admin_or_higher(auth.uid())
       or public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'substituir')
     ) then
    raise exception 'Você não tem permissão para substituir uma competência já importada.';
  end if;

  select coalesce(sum((value)::int), 0) into v_descartes_total from jsonb_each_text(p_descartes);

  -- A conferência do arquivo (§4.3): linhas lidas = itens esperados +
  -- descartes. Continua sendo o primeiro portão, só que agora sobre o
  -- TOTAL do arquivo — antes de qualquer lote chegar.
  if p_linhas_lidas <> p_itens_esperados + v_descartes_total then
    raise exception 'Conferência falhou: o arquivo tem % linhas, mas % itens + % descartes somam % — faltam %.',
      p_linhas_lidas, p_itens_esperados, v_descartes_total, p_itens_esperados + v_descartes_total,
      p_linhas_lidas - (p_itens_esperados + v_descartes_total);
  end if;

  if p_itens_esperados <= 0 then
    raise exception 'Nenhum item para importar.';
  end if;

  select array_agg((r->>'competencia')::date) into v_competencias
  from jsonb_array_elements(p_competencias) as r;

  -- Retomada = recomeçar (§4 do plano): qualquer importação "em_andamento"
  -- abandonada desta filial é apagada por inteiro antes de abrir a nova —
  -- nunca só marcada, porque a reserva de competência
  -- (com_vendas_competencias) referencia esta linha com `on delete cascade`.
  -- Marcar sem apagar deixaria o mês da importação abandonada travado pelo
  -- índice único para sempre, sem nenhuma linha de venda para explicar por
  -- quê — o oposto do que "recomeçar é barato" promete.
  delete from public.com_vendas_importacoes
  where tenant_id = v_tenant_id and filial = p_filial and tipo = 'vendas' and status = 'em_andamento';

  if p_substituir then
    delete from public.com_vendas_itens
      where tenant_id = v_tenant_id and filial = p_filial and competencia = any(v_competencias);
    delete from public.com_vendas_competencias
      where tenant_id = v_tenant_id and filial = p_filial and competencia = any(v_competencias);

    -- Nada de "substituí" com resto: se a RLS filtrou o DELETE em silêncio
    -- (regra 12 do pgTAP), a competência continua ocupada.
    if exists (select 1 from public.com_vendas_itens
               where tenant_id = v_tenant_id and filial = p_filial
                 and competencia = any(v_competencias)) then
      raise exception 'Não consegui limpar a competência para substituir — verifique sua permissão.';
    end if;
  end if;

  insert into public.com_vendas_importacoes (
    tenant_id, tipo, filial, file_name, linhas_lidas, itens_gravados, descartes,
    outros_linhas, outros_valor, cfops_outros, substituiu,
    status, itens_esperados, total_impresso
  ) values (
    v_tenant_id, 'vendas', p_filial, p_file_name, p_linhas_lidas, 0, p_descartes,
    0, 0, '{}', p_substituir,
    'em_andamento', p_itens_esperados, p_total_impresso
  ) returning id into v_importacao_id;

  -- A reserva de competência: cada mês de cada filial, uma vez só (§4.2 do
  -- plano original). Em unique_violation, nomeia a competência, quando e
  -- por quem — a importação nova falha inteira, nada fica meio-aberto.
  begin
    insert into public.com_vendas_competencias (tenant_id, filial, competencia, importacao_id, linhas, total_venda)
    select v_tenant_id, p_filial, (r->>'competencia')::date, v_importacao_id,
           (r->>'linhas')::int, (r->>'total_venda')::numeric
    from jsonb_array_elements(p_competencias) as r;
  exception when unique_violation then
    select c.competencia, c.created_at, imp.file_name
      into v_conflito
    from public.com_vendas_competencias c
    join public.com_vendas_importacoes imp on imp.id = c.importacao_id
    where c.tenant_id = v_tenant_id and c.filial = p_filial and c.competencia = any(v_competencias)
      and c.importacao_id <> v_importacao_id
    order by c.created_at desc
    limit 1;
    raise exception 'A competência % da filial % já foi importada em % (arquivo "%") — marque "substituir" para refazer.',
      to_char(v_conflito.competencia, 'MM/YYYY'), p_filial, v_conflito.created_at, v_conflito.file_name;
  end;

  return v_importacao_id;
end;
$$;
