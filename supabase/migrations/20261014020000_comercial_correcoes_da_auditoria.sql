-- Painel Comercial (L6a) — correções da auditoria ("passa com ressalva").
-- Ver .scratch/plano-painel-comercial-correcoes.md. Idempotente: pode ser
-- reaplicada sem erro. Nunca edita 20261014010000_comercial_base_de_vendas.sql,
-- que já está aplicada — tudo aqui é `create or replace` por cima dela.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 (item 2a) — tem_permissao: override JSON null e valor não-booleano não
-- podem decidir permissão. Antes, `->>` extraía texto: JSON null virava SQL
-- NULL (a condição `is not null` dava falso e a tela achava que o override
-- "não falou", enquanto o banco caía pro perfil do mesmo jeito — mas um
-- valor como "sim" fazia o `::boolean` levantar 22P02 DENTRO da policy,
-- derrubando o INSERT inteiro em vez de decidir permissão). `->` mantém o
-- valor como jsonb; `jsonb_typeof(...) = 'boolean'` só deixa passar `true`/
-- `false` de verdade — lixo no JSON nega a permissão, nunca derruba a
-- escrita. Exceção dentro de policy é a pior forma de responder "pode?".
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.tem_permissao(_user_id uuid, _departamento text, _modulo text, _acao text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (
      select (uap.overrides -> _modulo -> _acao)::boolean
      from public.user_access_profiles uap
      where uap.user_id = _user_id and uap.department = _departamento
        and jsonb_typeof(uap.overrides -> _modulo -> _acao) = 'boolean'
    ),
    (
      select (ap.permissions -> _modulo -> _acao)::boolean
      from public.user_access_profiles uap
      join public.access_profiles ap on ap.id = uap.profile_id
      where uap.user_id = _user_id and uap.department = _departamento
        and jsonb_typeof(ap.permissions -> _modulo -> _acao) = 'boolean'
    ),
    false
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 (item 3) — a classe do CFOP é decidida pelo banco, não pelo que o
-- navegador mandou no payload. `classificarCfop` (front) fica só para a
-- prévia antes de enviar; esta função é o espelho que vale.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_classe_do_cfop(p_cfop text)
returns text
language sql immutable
as $$
  select case
    when p_cfop in ('5101','5102','5401','5403','6101','6102','6107','6401','6403','7101','7949') then 'venda'
    when p_cfop in ('1201','1202','1410','1411','2201') then 'devolucao'
    when p_cfop in ('5910','5911','6910','6911') then 'bonificacao'
    when p_cfop in ('5901','5902','6901','6902','6903','1901','1902') then 'industrializacao'
    else 'outros'
  end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 (itens 3, 6 e 10.3) — com_importar_vendas:
--   • a classe gravada e as três contas que dependiam de `item->>'classe'`
--     (o total_venda do resumo por competência e a contagem/soma de
--     "outros") passam a usar `com_classe_do_cfop(item->>'cfop')` — um
--     payload com cfop:'6901' e classe:'venda' mentida não infla mais nada
--     (§3.1 do plano original, achado 3 da auditoria);
--   • `p_substituir` passa a confirmar a permissão `vendas.substituir` ANTES
--     de tentar apagar — sem isso o DELETE, que é `security invoker`, era
--     filtrado pela RLS em silêncio (regra 12 do pgTAP: UPDATE/DELETE
--     barrado por policy não levanta erro), e a falha só aparecia depois, no
--     índice único, com a mensagem errada ("marque substituir para refazer")
--     para quem JÁ tinha marcado substituir;
--   • depois do DELETE, confere que não sobrou nenhuma linha da competência
--     — nunca um "substituí" com resto;
--   • o comentário do passo do com_produtos, que citava `vendas.view` como
--     causa da dependência, foi corrigido: a policy de SELECT de
--     com_vendas_itens depende de `has_comercial_access`, não de
--     `vendas.view` (achado 10.3 da auditoria — a causa nomeada estava
--     errada, o efeito descrito era real).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_importar_vendas(
  p_filial text,
  p_file_name text,
  p_linhas_lidas int,
  p_descartes jsonb,
  p_itens jsonb,
  p_substituir boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_descartes_total int;
  v_itens_count int;
  v_importacao_id uuid;
  v_competencias date[];
  v_competencias_resumo jsonb;
  v_gravadas int;
  v_outros_linhas int;
  v_outros_valor numeric;
  v_cfops_outros text[];
  v_conflito record;
  v_resultado jsonb;
begin
  if p_filial not in ('INBRAS', 'MF') then
    raise exception 'Filial inválida: %', p_filial;
  end if;
  if v_tenant_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  -- Substituir apaga dado: confirma a permissão granular ANTES de tentar
  -- qualquer DELETE, e nomeia o motivo — não a mensagem do índice único, que
  -- é sobre outra coisa e confundiria quem já marcou "substituir".
  if p_substituir and not (
       public.is_admin_or_higher(auth.uid())
       or public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'substituir')
     ) then
    raise exception 'Você não tem permissão para substituir uma competência já importada.';
  end if;

  v_itens_count := coalesce(jsonb_array_length(p_itens), 0);
  select coalesce(sum((value)::int), 0) into v_descartes_total from jsonb_each_text(p_descartes);

  -- A conferência que vale é a do arquivo, não a do banco (§4.3): linhas
  -- lidas = itens gravados + linhas descartadas. Se não fechar, a
  -- importação inteira é recusada — nunca um mês "quase certo".
  if p_linhas_lidas <> v_itens_count + v_descartes_total then
    raise exception 'Conferência falhou: o arquivo tem % linhas, mas % itens + % descartes somam % — faltam %.',
      p_linhas_lidas, v_itens_count, v_descartes_total, v_itens_count + v_descartes_total,
      p_linhas_lidas - (v_itens_count + v_descartes_total);
  end if;

  if v_itens_count = 0 then
    raise exception 'Nenhum item para importar.';
  end if;

  select array_agg(distinct date_trunc('month', (item->>'emissao')::date)::date)
    into v_competencias
  from jsonb_array_elements(p_itens) as item;

  -- Resumo por competência, calculado uma vez só a partir do que o navegador
  -- mandou — usado para gravar a reserva (com_vendas_competencias) E para o
  -- retorno da tela, sem reconsultar o banco depois de escrever nele. A
  -- classe usada aqui é a do CFOP (com_classe_do_cfop), nunca a do payload.
  select jsonb_agg(jsonb_build_object('competencia', comp, 'linhas', linhas, 'total_venda', total_venda) order by comp)
    into v_competencias_resumo
  from (
    select date_trunc('month', (item->>'emissao')::date)::date as comp,
           count(*) as linhas,
           coalesce(sum((item->>'valor_nota')::numeric) filter (where public.com_classe_do_cfop(item->>'cfop') = 'venda'), 0) as total_venda
    from jsonb_array_elements(p_itens) as item
    group by 1
  ) agregado;

  select count(*), coalesce(sum((item->>'valor_nota')::numeric), 0),
         coalesce(array_agg(distinct item->>'cfop'), '{}')
    into v_outros_linhas, v_outros_valor, v_cfops_outros
  from jsonb_array_elements(p_itens) as item
  where public.com_classe_do_cfop(item->>'cfop') = 'outros';

  if p_substituir then
    delete from public.com_vendas_itens
      where tenant_id = v_tenant_id and filial = p_filial and competencia = any(v_competencias);
    delete from public.com_vendas_competencias
      where tenant_id = v_tenant_id and filial = p_filial and competencia = any(v_competencias);

    -- Nada de "substituí" com resto: se a RLS filtrou o DELETE em silêncio
    -- (regra 12 do pgTAP), a competência continua ocupada e a importação
    -- não pode seguir como se tivesse limpado.
    if exists (select 1 from public.com_vendas_itens
               where tenant_id = v_tenant_id and filial = p_filial
                 and competencia = any(v_competencias)) then
      raise exception 'Não consegui limpar a competência para substituir — verifique sua permissão.';
    end if;
  end if;

  insert into public.com_vendas_importacoes (
    tenant_id, tipo, filial, file_name, linhas_lidas, itens_gravados, descartes,
    outros_linhas, outros_valor, cfops_outros, substituiu
  ) values (
    v_tenant_id, 'vendas', p_filial, p_file_name, p_linhas_lidas, v_itens_count, p_descartes,
    v_outros_linhas, v_outros_valor, v_cfops_outros, p_substituir
  ) returning id into v_importacao_id;

  -- Inserção prova que gravou: conta pelo RETURNING, não assume. A classe
  -- gravada é sempre a do CFOP (com_classe_do_cfop) — nunca a que o
  -- navegador mandou em `item->>'classe'`, que é só a prévia.
  with inseridos as (
    insert into public.com_vendas_itens (
      tenant_id, importacao_id, filial, emissao, documento, serie, tipo_documento,
      cfop, classe, cliente_codigo, produto_codigo, produto_nome,
      quantidade, valor_nota, desconto, vendedor_codigo, vendedor_nome
    )
    select
      v_tenant_id, v_importacao_id, p_filial,
      (item->>'emissao')::date, item->>'documento', item->>'serie', item->>'tipo_documento',
      item->>'cfop', public.com_classe_do_cfop(item->>'cfop'),
      item->>'cliente_codigo', item->>'produto_codigo', item->>'produto_nome',
      (item->>'quantidade')::numeric, (item->>'valor_nota')::numeric,
      coalesce((item->>'desconto')::numeric, 0),
      item->>'vendedor_codigo', item->>'vendedor_nome'
    from jsonb_array_elements(p_itens) as item
    returning 1
  )
  select count(*) into v_gravadas from inseridos;

  if v_gravadas <> v_itens_count then
    raise exception 'Gravei % itens mas o arquivo tinha %.', v_gravadas, v_itens_count;
  end if;

  -- A reserva de competência: cada mês de cada filial, uma vez só (§4.2).
  -- Em unique_violation, nomeia a competência, quando e por quem — e a
  -- importação inteira falha (nada fica meio-gravado).
  begin
    insert into public.com_vendas_competencias (tenant_id, filial, competencia, importacao_id, linhas, total_venda)
    select v_tenant_id, p_filial, (r->>'competencia')::date, v_importacao_id, (r->>'linhas')::int, (r->>'total_venda')::numeric
    from jsonb_array_elements(v_competencias_resumo) as r;
  exception when unique_violation then
    select c.competencia, c.created_at, imp.file_name
      into v_conflito
    from public.com_vendas_competencias c
    join public.com_vendas_importacoes imp on imp.id = c.importacao_id
    where c.tenant_id = v_tenant_id and c.filial = p_filial and c.competencia = any(v_competencias)
    order by c.created_at desc
    limit 1;
    raise exception 'A competência % da filial % já foi importada em % (arquivo "%") — marque "substituir" para refazer.',
      to_char(v_conflito.competencia, 'MM/YYYY'), p_filial, v_conflito.created_at, v_conflito.file_name;
  end;

  -- Cliente novo (não estava no CSV) entra com origem 'venda' e tabela nula
  -- — nunca se inventa uma tabela para ele (§4.4).
  insert into public.com_clientes (tenant_id, codigo, razao_social, tabela_preco, origem)
  select distinct on (item->>'cliente_codigo')
    v_tenant_id, item->>'cliente_codigo', item->>'cliente_nome', null, 'venda'
  from jsonb_array_elements(p_itens) as item
  order by item->>'cliente_codigo'
  on conflict (tenant_id, codigo) do nothing;

  -- Nome do produto: a grafia mais frequente na base inteira (não só neste
  -- lote), recalculada a cada importação (§4.4). Depende de ver a base — se
  -- o perfil de quem importa não tiver a permissão de visualizar
  -- (`has_comercial_access`, que também exige o módulo Comercial ou cargo de
  -- supervisor+), este passo não atualiza nada para produtos novos; é uma
  -- lacuna estreita, registrada no relatório desta leva. (Achado 10.3 da
  -- auditoria: a causa NÃO é `vendas.view` — essa ação nunca é consultada
  -- pela policy de SELECT de com_vendas_itens.)
  insert into public.com_produtos (tenant_id, codigo, nome)
  select v_tenant_id, produto_codigo, mode() within group (order by produto_nome)
  from public.com_vendas_itens
  where tenant_id = v_tenant_id
    and produto_codigo in (select distinct item->>'produto_codigo' from jsonb_array_elements(p_itens) as item)
  group by produto_codigo
  on conflict (tenant_id, codigo) do update set nome = excluded.nome, updated_at = now();

  v_resultado := jsonb_build_object(
    'gravadas', v_gravadas,
    'descartes', p_descartes,
    'competencias', coalesce(v_competencias_resumo, '[]'::jsonb),
    'outros_linhas', v_outros_linhas,
    'outros_valor', v_outros_valor,
    'cfops_outros', to_jsonb(v_cfops_outros),
    'substituiu', p_substituir
  );
  return v_resultado;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 (item 1) — os dois KPIs de contagem distinta (clientes ativos, SKUs
-- vendidos) precisam de UMA linha de resultado, calculada sobre o período
-- inteiro: `count(distinct …)` não se soma entre grupos. Somar os meses de
-- com_faturamento_mensal (agrupado por competência/filial/série) dava 129
-- clientes onde a verdade — nos arquivos reais do dono, 2026, as duas
-- filiais — é 58; e 307 SKUs onde são 182. `faturamento` e `bonificacao`
-- continuam certos ali porque são aditivos; só as duas contagens não são.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_painel_totais(
  p_ano int, p_filial text default null, p_serie text default null
) returns table (
  venda numeric, devolucao numeric, liquido numeric, bonificacao numeric,
  unidades numeric, clientes_ativos bigint, skus_vendidos bigint
)
language sql stable security invoker
set search_path = public
as $$
  select
    coalesce(sum(i.valor_nota) filter (where i.classe = 'venda'), 0),
    coalesce(sum(abs(i.valor_nota)) filter (where i.classe = 'devolucao'), 0),
    coalesce(sum(i.valor_curva) filter (where i.classe in ('venda','devolucao')), 0),
    coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0),
    coalesce(sum(i.quantidade_curva) filter (where i.classe in ('venda','devolucao')), 0),
    count(distinct i.cliente_codigo) filter (where i.classe = 'venda'),
    count(distinct i.produto_codigo) filter (where i.classe = 'venda')
  from public.com_vendas_itens i
  where extract(year from i.competencia) = p_ano
    and (p_filial is null or i.filial = p_filial)
    and (p_serie is null or i.serie = p_serie);
$$;

grant execute on function public.com_painel_totais(int, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 (item 4) — "Maiores compradores" passa a ranquear pelo LÍQUIDO
-- (valor_curva: venda menos devolução), não só pela venda bruta. Sem isso,
-- um cliente que compra 600 e devolve 1.000 aparecia em primeiro lugar com
-- 600 — a devolução simplesmente não entrava na conta do ranking. Mantém
-- `where coalesce(...) <> 0`: agora um saldo negativo aparece, e deve
-- aparecer.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_ranking_clientes(
  p_de date, p_ate date, p_filial text default null, p_serie text default null, p_limite int default 20
)
returns table (cliente_codigo text, nome text, tabela_preco text, faturamento numeric, participacao numeric)
language sql stable security invoker
set search_path = public
as $$
  with base as (
    select i.cliente_codigo,
           coalesce(max(c.razao_social), i.cliente_codigo) as nome,
           max(c.tabela_preco) as tabela_preco,
           sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')) as faturamento
    from public.com_vendas_itens i
    left join public.com_clientes c on c.tenant_id = i.tenant_id and c.codigo = i.cliente_codigo
    where i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
      and (p_serie is null or i.serie = p_serie)
    group by i.cliente_codigo
  ),
  total as (select coalesce(sum(faturamento), 0) as t from base)
  select b.cliente_codigo, b.nome, b.tabela_preco,
         coalesce(b.faturamento, 0) as faturamento,
         case when total.t = 0 then 0 else round(coalesce(b.faturamento, 0) / total.t * 100, 2) end as participacao
  from base b, total
  where coalesce(b.faturamento, 0) <> 0
  order by b.faturamento desc
  limit p_limite;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6 (pedido do dono, 2026-09-21) — o seletor de ano do painel não pode ser
-- uma janela fixa (ano atual e dois anteriores): no go-live a importação vai
-- de 2022 até hoje, e uma janela fixa deixaria 2022/2023 gravados e
-- inalcançáveis na tela. Os anos que existem de verdade são os que têm
-- venda importada — nunca um calendário chutado.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_anos_com_venda()
returns table (ano int)
language sql stable security invoker
set search_path = public
as $$
  select distinct extract(year from competencia)::int as ano
  from public.com_vendas_itens
  order by 1 desc;
$$;

grant execute on function public.com_anos_com_venda() to authenticated;
